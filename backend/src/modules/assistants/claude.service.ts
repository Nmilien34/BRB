import type { Request } from 'express';
import { env } from '../../config/index.js';
import type { UserDocument } from '../users/user.model.js';
import { advanceOnboardingStatus } from '../users/user.constants.js';
import { serializeUser } from '../users/user.serializer.js';
import { HttpError } from '../../utils/httpError.js';
import {
  type AssistantConnectionDocument,
  AssistantConnection,
} from './assistant-connection.model.js';
import { generateAssistantConnectionToken } from './assistant-token.js';
import {
  type AssistantConnectionMetadata,
  type AssistantConnectionStatus,
  type PublicAssistantConnection,
} from './assistant.constants.js';
import { serializeAssistantConnection } from './assistant.serializer.js';
import { ClaudeHookEvent } from './claude-hook-event.model.js';
import type { BridgeConnectBody, BridgeEventBody } from './claude.schemas.js';

const CLAUDE_ASSISTANT_TYPE = 'claude_code';

type ClaudeBridgeAction = 'pass_through' | 'log_only' | 'remote_candidate';

type NormalizedClaudeEvent = {
  hookEventName: string;
  toolName?: string;
  sessionId?: string;
  cwd?: string;
  transcriptPath?: string;
  projectPath?: string;
  normalizedSummary?: string;
  processingStatus: 'received' | 'normalized';
};

function getConnectionMetadata(connection: AssistantConnectionDocument): Partial<AssistantConnectionMetadata> {
  if (!connection.metadata || typeof connection.metadata !== 'object') {
    return {};
  }

  return connection.metadata as Partial<AssistantConnectionMetadata>;
}

function applyConnectionMetadata(
  connection: AssistantConnectionDocument,
  updates: Partial<AssistantConnectionMetadata>,
): void {
  const metadata = { ...getConnectionMetadata(connection) };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete metadata[key as keyof AssistantConnectionMetadata];
    } else {
      metadata[key as keyof AssistantConnectionMetadata] = value as never;
    }
  }

  connection.metadata = metadata;
}

function isClaudeConnectionStatus(status: string): status is AssistantConnectionStatus {
  return ['selected', 'pending_connection', 'connected', 'error', 'disconnected'].includes(status);
}

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getRecordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function buildNormalizedSummary(hookEventName: string, toolName?: string): string | undefined {
  if (toolName) {
    return `${hookEventName}:${toolName}`;
  }

  return hookEventName !== 'unknown' ? hookEventName : undefined;
}

function normalizeClaudeEvent(rawPayload: BridgeEventBody): NormalizedClaudeEvent {
  const payload = rawPayload as Record<string, unknown>;
  const hookEventName =
    extractString(getRecordValue(payload, 'hookEventName')) ??
    extractString(getRecordValue(payload, 'eventName')) ??
    extractString(getRecordValue(payload, 'hook_event_name')) ??
    extractString(getRecordValue(payload, 'event')) ??
    'unknown';
  const toolName =
    extractString(getRecordValue(payload, 'toolName')) ??
    extractString(getRecordValue(payload, 'tool_name'));
  const sessionId =
    extractString(getRecordValue(payload, 'sessionId')) ??
    extractString(getRecordValue(payload, 'session_id'));
  const cwd = extractString(getRecordValue(payload, 'cwd'));
  const projectPath =
    extractString(getRecordValue(payload, 'projectPath')) ??
    extractString(getRecordValue(payload, 'project_path'));
  const transcriptPath =
    extractString(getRecordValue(payload, 'transcriptPath')) ??
    extractString(getRecordValue(payload, 'transcript_path'));
  const normalizedSummary = buildNormalizedSummary(hookEventName, toolName);

  return {
    hookEventName,
    toolName,
    sessionId,
    cwd,
    projectPath,
    transcriptPath,
    normalizedSummary,
    processingStatus: normalizedSummary ? 'normalized' : 'received',
  };
}

function determineClaudeBridgeAction(
  connection: AssistantConnectionDocument,
  normalizedEvent: NormalizedClaudeEvent,
): ClaudeBridgeAction {
  if (!connection.awayModeEnabled) {
    return normalizedEvent.hookEventName === 'PermissionRequest' ? 'log_only' : 'pass_through';
  }

  return normalizedEvent.hookEventName === 'PermissionRequest' ? 'remote_candidate' : 'log_only';
}

function ensureSupportedClaudeConnection(
  connection: AssistantConnectionDocument | null,
): AssistantConnectionDocument {
  if (!connection || connection.assistantType !== CLAUDE_ASSISTANT_TYPE) {
    throw new HttpError(404, 'Claude Code connection not found.');
  }

  return connection;
}

function getPublicBaseUrl(req: Request): string {
  if (env.BACKEND_URL) {
    return env.BACKEND_URL;
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ?? req.get('host');
  const protocol = forwardedProto ?? req.protocol ?? 'http';

  return host ? `${protocol}://${host}` : `http://localhost:${env.PORT}`;
}

function buildClaudeSettingsSnippet(bridgeConnectUrl: string, bridgeEventsUrl: string): string {
  const bridgeCommand =
    'BRB_CONNECTION_TOKEN="<paste-connection-token>" BRB_CONNECT_URL="' +
    bridgeConnectUrl +
    '" BRB_EVENTS_URL="' +
    bridgeEventsUrl +
    '" node ./brb-claude-bridge.js';

  return JSON.stringify(
    {
      hooks: {
        PermissionRequest: [{ matcher: '*', command: bridgeCommand }],
        PreToolUse: [{ matcher: '*', command: bridgeCommand }],
        PostToolUse: [{ matcher: '*', command: bridgeCommand }],
        Stop: [{ matcher: '*', command: bridgeCommand }],
      },
    },
    null,
    2,
  );
}

function buildClaudeSetupPayload(
  connection: AssistantConnectionDocument,
  connectionToken: string,
  baseUrl: string,
) {
  const bridgeConnectUrl = `${baseUrl}/api/assistants/claude/bridge/connect`;
  const bridgeEventsUrl = `${baseUrl}/api/assistants/claude/bridge/events`;
  const settingsSnippet = buildClaudeSettingsSnippet(bridgeConnectUrl, bridgeEventsUrl);

  return {
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: connection.status,
    connectionToken,
    tokenPreview: connection.connectionTokenPreview ?? null,
    bridgeConnectUrl,
    bridgeEventsUrl,
    title: 'Connect Claude Code to BRB',
    description:
      'Install a lightweight local Claude hook bridge that forwards connection pings and hook events to BRB without blocking Claude on remote actions.',
    steps: [
      'Select Claude Code inside BRB and copy the one-time connection token shown below.',
      'Install or create your local bridge script on the same machine that runs Claude Code.',
      'Set BRB_CONNECTION_TOKEN, BRB_CONNECT_URL, and BRB_EVENTS_URL for the bridge process.',
      'Wire the bridge command into Claude hooks for PermissionRequest, PreToolUse, PostToolUse, and Stop.',
      'Run one bridge connect ping locally, then confirm BRB shows the Claude connection as connected.',
    ],
    settingsSnippet,
    hookCommandExample:
      'BRB_CONNECTION_TOKEN="<paste-connection-token>" BRB_CONNECT_URL="' +
      bridgeConnectUrl +
      '" BRB_EVENTS_URL="' +
      bridgeEventsUrl +
      '" node ./brb-claude-bridge.js',
    connection: serializeAssistantConnection(connection),
  };
}

function buildClaudeStatusResponse(connection: AssistantConnectionDocument | null) {
  return {
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: connection?.status ?? 'disconnected',
    awayModeEnabled: connection?.awayModeEnabled ?? false,
    awayModeActivatedAt: connection?.awayModeActivatedAt ?? null,
    lastConnectedAt: connection?.lastConnectedAt ?? null,
    lastEventAt: connection?.lastEventAt ?? null,
    tokenPreview: connection?.connectionTokenPreview ?? null,
    connection: connection ? serializeAssistantConnection(connection) : null,
  };
}

export async function findClaudeConnectionForUser(
  user: UserDocument,
): Promise<AssistantConnectionDocument | null> {
  return AssistantConnection.findOne({
    userId: user._id,
    assistantType: CLAUDE_ASSISTANT_TYPE,
  });
}

export async function selectClaudeConnectionForUser(user: UserDocument) {
  let connection = await findClaudeConnectionForUser(user);

  if (!connection) {
    connection = new AssistantConnection({
      userId: user._id,
      assistantType: CLAUDE_ASSISTANT_TYPE,
      status: 'selected',
      authMethod: 'hook',
    });
  } else if (
    !isClaudeConnectionStatus(connection.status) ||
    connection.status === 'error' ||
    connection.status === 'disconnected'
  ) {
    connection.status = 'selected';
  }

  await connection.save();

  user.selectedAssistantType = CLAUDE_ASSISTANT_TYPE;
  user.onboardingStatus = advanceOnboardingStatus(user.onboardingStatus, 'assistant_selected');
  await user.save();

  return {
    assistant: serializeAssistantConnection(connection),
    user: serializeUser(user),
  };
}

export async function getClaudeSetup(user: UserDocument, req: Request) {
  await selectClaudeConnectionForUser(user);
  const connection = ensureSupportedClaudeConnection(await findClaudeConnectionForUser(user));
  const { rawToken, tokenHash, tokenPreview } = generateAssistantConnectionToken();

  connection.connectionTokenHash = tokenHash;
  connection.connectionTokenPreview = tokenPreview;
  connection.status = 'pending_connection';
  connection.authMethod = 'hook';
  applyConnectionMetadata(connection, { lastError: undefined });
  await connection.save();

  return buildClaudeSetupPayload(connection, rawToken, getPublicBaseUrl(req));
}

export async function getClaudeStatus(user: UserDocument) {
  const connection = await findClaudeConnectionForUser(user);

  return buildClaudeStatusResponse(connection);
}

export async function setClaudeAwayMode(user: UserDocument, enabled: boolean) {
  let connection = await findClaudeConnectionForUser(user);

  if (!connection) {
    await selectClaudeConnectionForUser(user);
    connection = await findClaudeConnectionForUser(user);
  }

  const ensuredConnection = ensureSupportedClaudeConnection(connection);

  ensuredConnection.awayModeEnabled = enabled;
  ensuredConnection.awayModeActivatedAt = enabled ? new Date() : null;
  await ensuredConnection.save();

  return buildClaudeStatusResponse(ensuredConnection);
}

export async function getClaudeAwayModeStatus(user: UserDocument) {
  const connection = await findClaudeConnectionForUser(user);

  return {
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: connection?.status ?? 'disconnected',
    awayModeEnabled: connection?.awayModeEnabled ?? false,
    awayModeActivatedAt: connection?.awayModeActivatedAt ?? null,
    lastConnectedAt: connection?.lastConnectedAt ?? null,
    lastEventAt: connection?.lastEventAt ?? null,
  };
}

export async function handleClaudeBridgeConnect(
  connection: AssistantConnectionDocument,
  body: BridgeConnectBody,
) {
  const now = new Date();
  const projectPath = body.projectPath ?? body.project_path ?? body.cwd;

  connection.status = 'connected';
  connection.lastConnectedAt = now;
  applyConnectionMetadata(connection, {
    lastPingAt: now,
    machineName: body.machineName,
    installedHookVersion: body.installedHookVersion,
    lastSeenProjectPath: projectPath,
    lastError: undefined,
  });
  await connection.save();

  return {
    success: true,
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: connection.status,
    awayModeEnabled: connection.awayModeEnabled,
    lastConnectedAt: connection.lastConnectedAt,
  };
}

export async function ingestClaudeBridgeEvent(
  connection: AssistantConnectionDocument,
  body: BridgeEventBody,
) {
  const now = new Date();
  const normalizedEvent = normalizeClaudeEvent(body);
  const action = determineClaudeBridgeAction(connection, normalizedEvent);

  await ClaudeHookEvent.create({
    assistantConnectionId: connection._id,
    userId: connection.userId,
    hookEventName: normalizedEvent.hookEventName,
    toolName: normalizedEvent.toolName,
    sessionId: normalizedEvent.sessionId,
    cwd: normalizedEvent.cwd,
    transcriptPath: normalizedEvent.transcriptPath,
    rawPayload: body,
    normalizedSummary: normalizedEvent.normalizedSummary,
    processingStatus: normalizedEvent.processingStatus,
    receivedAt: now,
  });

  connection.status = 'connected';
  connection.lastConnectedAt = connection.lastConnectedAt ?? now;
  connection.lastEventAt = now;
  applyConnectionMetadata(connection, {
    lastPingAt: now,
    lastSeenProjectPath: normalizedEvent.projectPath ?? normalizedEvent.cwd,
    lastError: body.error,
  });
  await connection.save();

  return {
    mode: connection.awayModeEnabled ? 'away' : 'local',
    awayModeEnabled: connection.awayModeEnabled,
    action,
  };
}

export function serializeClaudeConnection(
  connection: AssistantConnectionDocument,
): PublicAssistantConnection {
  return serializeAssistantConnection(connection);
}
