import type { Request } from 'express';
import { env } from '../../config/index.js';
import { User, type UserDocument } from '../users/user.model.js';
import { advanceOnboardingStatus } from '../users/user.constants.js';
import { serializeUser } from '../users/user.serializer.js';
import { logger } from '../../utils/index.js';
import { HttpError } from '../../utils/httpError.js';
import {
  type AssistantConnectionDocument,
  AssistantConnection,
} from './assistant-connection.model.js';
import { generateAssistantConnectionToken, hashAssistantConnectionToken } from './assistant-token.js';
import { BRIDGE_SCRIPT, POLLER_SCRIPT } from './claude-install-scripts.js';
import {
  type AssistantConnectionMetadata,
  type AssistantConnectionStatus,
  type PublicAssistantConnection,
} from './assistant.constants.js';
import { serializeAssistantConnection } from './assistant.serializer.js';
import { ClaudeHookEvent } from './claude-hook-event.model.js';
import {
  determineClaudeBridgeAction,
  normalizeClaudeEvent,
} from './claude-approval.js';
import type {
  BridgeApprovalResolveBody,
  BridgeConnectBody,
  BridgeEventBody,
  BridgeInstructionResultBody,
  ClaudeSettingsBody,
} from './claude.schemas.js';
import {
  createApprovalRequestFromClaudeEvent,
  getApprovalRequestBridgeStatus,
  getOpenApprovalRequestForUserById,
  resolveApprovalRequest,
} from '../approval-requests/approval-request.service.js';
import { deliverApprovalRequest } from '../delivery/delivery.service.js';
import {
  claimNextRemoteInstructionForClaude,
  reportRemoteInstructionResultForClaude,
} from '../remote-instructions/remote-instruction.service.js';

const CLAUDE_ASSISTANT_TYPE = 'claude_code';
const DEFAULT_ESCALATION_DELAY_MINUTES = 2;
const CONNECTION_STALE_THRESHOLD_MS = 90_000; // 3× the 30s ping interval

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

function isConnectionStale(connection: AssistantConnectionDocument): boolean {
  if (connection.status !== 'connected') return false;
  const metadata = getConnectionMetadata(connection);
  if (!metadata.lastPingAt) return false;
  const lastPingAt = metadata.lastPingAt instanceof Date
    ? metadata.lastPingAt
    : new Date(metadata.lastPingAt as string | number);
  return Date.now() - lastPingAt.getTime() > CONNECTION_STALE_THRESHOLD_MS;
}

function isClaudeConnectionStatus(status: string): status is AssistantConnectionStatus {
  return ['selected', 'pending_connection', 'connected', 'error', 'disconnected'].includes(status);
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

function buildClaudeSettingsSnippet(
  bridgeConnectUrl: string,
  bridgeEventsUrl: string,
  bridgeInstructionsUrl: string,
  bridgeInstructionResultUrl: string,
): string {
  const bridgeCommand =
    'BRB_CONNECTION_TOKEN="<paste-connection-token>" BRB_CONNECT_URL="' +
    bridgeConnectUrl +
    '" BRB_EVENTS_URL="' +
    bridgeEventsUrl +
    '" BRB_INSTRUCTIONS_URL="' +
    bridgeInstructionsUrl +
    '" BRB_INSTRUCTION_RESULT_URL="' +
    bridgeInstructionResultUrl +
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
  connectionToken: string | null,
  baseUrl: string,
) {
  const bridgeConnectUrl = `${baseUrl}/api/assistants/claude/bridge/connect`;
  const bridgeEventsUrl = `${baseUrl}/api/assistants/claude/bridge/events`;
  const bridgeInstructionsUrl = `${baseUrl}/api/assistants/claude/bridge/instructions/next`;
  const bridgeInstructionResultUrl = `${baseUrl}/api/assistants/claude/bridge/instructions/:instructionId/result`;
  const settingsSnippet = buildClaudeSettingsSnippet(
    bridgeConnectUrl,
    bridgeEventsUrl,
    bridgeInstructionsUrl,
    bridgeInstructionResultUrl,
  );

  return {
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: connection.status,
    connectionToken,
    tokenPreview: connection.connectionTokenPreview ?? null,
    bridgeConnectUrl,
    bridgeEventsUrl,
    bridgeInstructionsUrl,
    bridgeInstructionResultUrl,
    title: 'Connect Claude Code to BRB',
    description:
      'Install a lightweight local Claude hook bridge that forwards connection pings and hook events to BRB without blocking Claude on remote actions.',
    steps: [
      'Select Claude Code inside BRB and copy the one-time connection token shown below.',
      'Install or create your local bridge script on the same machine that runs Claude Code.',
      'Set BRB_CONNECTION_TOKEN, BRB_CONNECT_URL, and BRB_EVENTS_URL for the bridge process.',
      'Configure the bridge poll/report URLs so it can receive Telegram instructions and send Claude replies back to BRB.',
      'Wire the bridge command into Claude hooks for PermissionRequest, PreToolUse, PostToolUse, and Stop.',
      'Run one bridge connect ping locally, then confirm BRB shows the Claude connection as connected.',
    ],
    settingsSnippet,
    hookCommandExample:
      'BRB_CONNECTION_TOKEN="<paste-connection-token>" BRB_CONNECT_URL="' +
      bridgeConnectUrl +
      '" BRB_EVENTS_URL="' +
      bridgeEventsUrl +
      '" BRB_INSTRUCTIONS_URL="' +
      bridgeInstructionsUrl +
      '" BRB_INSTRUCTION_RESULT_URL="' +
      bridgeInstructionResultUrl +
      '" node ./brb-claude-bridge.js',
    connection: serializeAssistantConnection(connection),
  };
}

function buildClaudeStatusResponse(connection: AssistantConnectionDocument | null) {
  const effectiveStatus = connection && isConnectionStale(connection)
    ? 'disconnected'
    : connection?.status ?? 'disconnected';

  return {
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: effectiveStatus,
    awayModeEnabled: connection?.awayModeEnabled ?? false,
    awayModeActivatedAt: connection?.awayModeActivatedAt ?? null,
    escalationDelayMinutes: connection?.escalationDelayMinutes ?? DEFAULT_ESCALATION_DELAY_MINUTES,
    lastConnectedAt: connection?.lastConnectedAt ?? null,
    lastEventAt: connection?.lastEventAt ?? null,
    tokenPreview: connection?.connectionTokenPreview ?? null,
    connection: connection ? serializeAssistantConnection(connection) : null,
  };
}

async function markAssistantConnectedOnboarding(userId: AssistantConnectionDocument['userId']) {
  const user = await User.findById(userId);

  if (!user) {
    return;
  }

  const nextOnboardingStatus = advanceOnboardingStatus(user.onboardingStatus, 'assistant_connected');

  if (user.onboardingStatus !== nextOnboardingStatus) {
    user.onboardingStatus = nextOnboardingStatus;
    await user.save();
  }
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
      escalationDelayMinutes: DEFAULT_ESCALATION_DELAY_MINUTES,
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

  // If already connected with a valid token AND the poller is still alive,
  // return the setup payload without rotating the token (which would kill the active poller).
  // When the connection is stale (poller died), allow token regeneration.
  if (connection.status === 'connected' && connection.connectionTokenHash && !isConnectionStale(connection)) {
    return buildClaudeSetupPayload(connection, null, getPublicBaseUrl(req));
  }

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
    escalationDelayMinutes: connection?.escalationDelayMinutes ?? DEFAULT_ESCALATION_DELAY_MINUTES,
    lastConnectedAt: connection?.lastConnectedAt ?? null,
    lastEventAt: connection?.lastEventAt ?? null,
  };
}

export async function updateClaudeSettings(user: UserDocument, body: ClaudeSettingsBody) {
  let connection = await findClaudeConnectionForUser(user);

  if (!connection) {
    await selectClaudeConnectionForUser(user);
    connection = await findClaudeConnectionForUser(user);
  }

  const ensuredConnection = ensureSupportedClaudeConnection(connection);
  ensuredConnection.escalationDelayMinutes = body.escalationDelayMinutes;
  await ensuredConnection.save();

  return buildClaudeStatusResponse(ensuredConnection);
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
  await markAssistantConnectedOnboarding(connection.userId);

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
  const action = determineClaudeBridgeAction(connection.awayModeEnabled, normalizedEvent);

  const sourceEvent = await ClaudeHookEvent.create({
    assistantConnectionId: connection._id,
    userId: connection.userId,
    hookEventName: normalizedEvent.hookEventName,
    toolName: normalizedEvent.toolName,
    sessionId: normalizedEvent.sessionId,
    sessionTitle: normalizedEvent.sessionTitle,
    derivedSessionLabel: normalizedEvent.derivedSessionLabel,
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
    lastError: typeof body.error === 'string' ? body.error : undefined,
  });
  await connection.save();
  await markAssistantConnectedOnboarding(connection.userId);

  let approvalId: string | null = null;

  if (normalizedEvent.approvalCandidate) {
    const approvalResult = await createApprovalRequestFromClaudeEvent({
      assistantConnection: connection,
      sourceEvent,
      candidate: normalizedEvent.approvalCandidate,
      escalationMode: connection.awayModeEnabled ? 'manual_away' : 'timer_based',
      escalationDelayMinutes: connection.escalationDelayMinutes,
    });

    approvalId = approvalResult.approval.id;

    if (approvalResult.created && connection.awayModeEnabled) {
      void deliverApprovalRequest(approvalResult.approvalRequest).catch((error) => {
        logger.error(
          {
            err: error,
            approvalRequestId: approvalResult.approval.id,
            assistantConnectionId: String(connection._id),
          },
          'Approval delivery failed after Claude event ingest',
        );
      });
    } else if (approvalResult.created) {
      logger.info(
        {
          approvalRequestId: approvalResult.approval.id,
          assistantConnectionId: String(connection._id),
          desktopTimeoutAt: approvalResult.approval.desktopTimeoutAt,
          escalationDelayMinutes: connection.escalationDelayMinutes ?? DEFAULT_ESCALATION_DELAY_MINUTES,
        },
        'Queued local-first approval with delayed Telegram escalation',
      );
    }
  } else {
    logger.info(
      {
        assistantConnectionId: String(connection._id),
        sourceEventId: String(sourceEvent._id),
        hookEventName: normalizedEvent.hookEventName,
      },
      'Skipped approval creation because Claude event is not approval-relevant',
    );
  }

  return {
    ok: true,
    mode: connection.awayModeEnabled ? 'away' : 'local',
    awayModeEnabled: connection.awayModeEnabled,
    action,
    approvalId,
  };
}

export async function getClaudeBridgeApprovalStatus(
  connection: AssistantConnectionDocument,
  approvalId: string,
) {
  return getApprovalRequestBridgeStatus(connection, approvalId);
}

export async function claimClaudeBridgeInstruction(connection: AssistantConnectionDocument) {
  return claimNextRemoteInstructionForClaude(connection);
}

export async function reportClaudeBridgeInstructionResult(
  connection: AssistantConnectionDocument,
  instructionId: string,
  body: BridgeInstructionResultBody,
) {
  return reportRemoteInstructionResultForClaude(connection, instructionId, body);
}

export async function resolveClaudeBridgeApprovalLocally(
  connection: AssistantConnectionDocument,
  approvalId: string,
  body: BridgeApprovalResolveBody,
) {
  const approvalRequest = await getOpenApprovalRequestForUserById(connection.userId, approvalId);

  if (!approvalRequest || String(approvalRequest.assistantConnectionId) !== String(connection._id)) {
    throw new HttpError(404, 'Approval request not found.');
  }

  const resolvedApproval = await resolveApprovalRequest(approvalRequest, {
    status: body.resolution,
    resolutionSource: body.source,
    resolutionNote: `Resolved ${body.resolution} locally by Claude bridge.`,
    escalationStatus: 'resolved_locally',
  });

  return {
    ok: true,
    approvalId: resolvedApproval.id,
    status: resolvedApproval.status,
    escalationStatus: resolvedApproval.escalationStatus,
    resolvedAt: resolvedApproval.resolvedAt ?? null,
  };
}

export function serializeClaudeConnection(
  connection: AssistantConnectionDocument,
): PublicAssistantConnection {
  return serializeAssistantConnection(connection);
}

export async function generateInstallScript(
  connectionToken: string,
  baseUrl: string,
): Promise<{ script: string; connection: AssistantConnectionDocument } | null> {
  const connection = await AssistantConnection.findOne({
    assistantType: CLAUDE_ASSISTANT_TYPE,
    connectionTokenHash: hashAssistantConnectionToken(connectionToken),
  });

  if (!connection) {
    return null;
  }

  const connectUrl = `${baseUrl}/api/assistants/claude/bridge/connect`;
  const eventsUrl = `${baseUrl}/api/assistants/claude/bridge/events`;
  const instructionsUrl = `${baseUrl}/api/assistants/claude/bridge/instructions/next`;
  const instructionResultUrl = `${baseUrl}/api/assistants/claude/bridge/instructions/:instructionId/result`;

  const script = buildInstallShellScript({
    connectionToken,
    connectUrl,
    eventsUrl,
    instructionsUrl,
    instructionResultUrl,
  });

  return { script, connection };
}

function buildInstallShellScript(config: {
  connectionToken: string;
  connectUrl: string;
  eventsUrl: string;
  instructionsUrl: string;
  instructionResultUrl: string;
}): string {
  const bridgeCommand =
    `BRB_CONNECTION_TOKEN="${config.connectionToken}" ` +
    `BRB_CONNECT_URL="${config.connectUrl}" ` +
    `BRB_EVENTS_URL="${config.eventsUrl}" ` +
    `BRB_INSTRUCTIONS_URL="${config.instructionsUrl}" ` +
    `BRB_INSTRUCTION_RESULT_URL="${config.instructionResultUrl}" ` +
    'node .brb/brb-claude-bridge.js';

  const hooksJson = JSON.stringify(
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

  return `#!/bin/bash
set -euo pipefail

echo ""
echo "  ┌─────────────────────────────────┐"
echo "  │  BRB — Claude Code Setup        │"
echo "  └─────────────────────────────────┘"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "  Error: Node.js is required but not installed."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "  Error: curl is required but not installed."; exit 1; }

# Create .brb directory with restricted permissions
mkdir -p .brb
chmod 700 .brb

# Write bridge script (hook handler for approval forwarding)
cat > .brb/brb-claude-bridge.js << 'BRIDGE_EOF'
${BRIDGE_SCRIPT}
BRIDGE_EOF

# Write poller script (persistent background process)
cat > .brb/brb-claude-poller.js << 'POLLER_EOF'
${POLLER_SCRIPT}
POLLER_EOF

chmod +x .brb/brb-claude-bridge.js .brb/brb-claude-poller.js

# Write/merge Claude hooks config
mkdir -p .claude
cat > .brb/_brb_hooks.json << 'HOOKS_JSON_EOF'
${hooksJson}
HOOKS_JSON_EOF

if [ -f .claude/settings.json ]; then
  # Merge BRB hooks into existing settings (preserves user's other config)
  node --input-type=commonjs << 'MERGE_EOF'
var fs = require("fs");
var brb = JSON.parse(fs.readFileSync(".brb/_brb_hooks.json", "utf8"));
var settingsPath = ".claude/settings.json";
var existing = {};
try { existing = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch(e) {}
var hooks = existing.hooks || {};
Object.keys(brb.hooks || {}).forEach(function(key) {
  var arr = hooks[key] || [];
  arr = arr.filter(function(h) { return (h.command || "").indexOf("brb-claude-bridge") === -1; });
  arr = arr.concat(brb.hooks[key]);
  hooks[key] = arr;
});
existing.hooks = hooks;
fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\\n");
MERGE_EOF
  echo "  Merged BRB hooks into existing .claude/settings.json"
else
  cp .brb/_brb_hooks.json .claude/settings.json
fi
rm -f .brb/_brb_hooks.json

# Write env config for the poller (restricted permissions)
cat > .brb/.env << ENV_EOF
BRB_CONNECTION_TOKEN="${config.connectionToken}"
BRB_CONNECT_URL="${config.connectUrl}"
BRB_EVENTS_URL="${config.eventsUrl}"
BRB_INSTRUCTIONS_URL="${config.instructionsUrl}"
BRB_INSTRUCTION_RESULT_URL="${config.instructionResultUrl}"
ENV_EOF
chmod 600 .brb/.env

# Write start/stop scripts
cat > .brb/start.sh << 'START_EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -f poller.pid ]; then
  OLD_PID=$(cat poller.pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "BRB poller already running (PID $OLD_PID)"
    exit 0
  fi
  rm -f poller.pid
fi
set -a; source .env; set +a
nohup node brb-claude-poller.js >> poller.log 2>&1 &
echo $! > poller.pid
echo "BRB poller started (PID $!)"
START_EOF

cat > .brb/stop.sh << 'STOP_EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# Unload launchd agent if present
if [ -f launchd-plist-path ]; then
  PLIST=$(cat launchd-plist-path)
  LABEL=$(basename "$PLIST" .plist)
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
  fi
  echo "Unloaded launchd agent"
fi
# Also kill by PID as fallback
if [ -f poller.pid ]; then
  PID=$(cat poller.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "BRB poller stopped (PID $PID)"
  fi
  rm -f poller.pid
fi
echo "BRB poller stopped."
STOP_EOF

chmod +x .brb/start.sh .brb/stop.sh

# Add .brb to .gitignore if not already there
if [ -f .gitignore ]; then
  grep -qxF '.brb/' .gitignore || echo '.brb/' >> .gitignore
else
  echo '.brb/' > .gitignore
fi

# Set up launchd to auto-start poller on login (macOS only)
if [ "$(uname)" = "Darwin" ]; then
  PLIST_LABEL="com.brb.claude-poller.$(echo "$(pwd)" | md5 | head -c 8)"
  PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
  BRB_DIR="$(pwd)/.brb"

  # Remove any old BRB poller plist for this project
  launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
  fi

  # Write a launcher shell script that sources env and runs node
  cat > "$BRB_DIR/launch-poller.sh" << LAUNCHER_EOF
#!/bin/bash
cd "$BRB_DIR/.."
set -a; source .brb/.env; set +a
exec $(which node) .brb/brb-claude-poller.js
LAUNCHER_EOF
  chmod +x "$BRB_DIR/launch-poller.sh"

  cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BRB_DIR/launch-poller.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(pwd)</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(echo "$PATH")</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$BRB_DIR/poller.log</string>
  <key>StandardErrorPath</key>
  <string>$BRB_DIR/poller.log</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
PLIST_EOF

  # Store plist path so stop.sh can unload it
  echo "$PLIST_PATH" > .brb/launchd-plist-path

  # Load the agent (starts the poller via launchd)
  # Use bootstrap (modern API) with load as fallback
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || launchctl load "$PLIST_PATH" 2>/dev/null || true

  # Verify the agent actually started — if not, fall back to nohup
  sleep 2
  LAUNCHD_PID=$(launchctl list "$PLIST_LABEL" 2>/dev/null | head -1 | awk '{print $1}')
  if [ "$LAUNCHD_PID" != "-" ] && [ -n "$LAUNCHD_PID" ] && [ "$LAUNCHD_PID" != "0" ]; then
    echo "  Registered launchd agent — poller will auto-start on login"
  else
    echo "  launchd agent failed to start — falling back to background process"
    launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
    cd "$(pwd)/.brb"
    set -a; source .env; set +a
    nohup $(which node) brb-claude-poller.js >> poller.log 2>&1 &
    echo $! > poller.pid
    cd - > /dev/null
    echo "  Poller running as background process (PID $(cat .brb/poller.pid))"
  fi
fi

# Send initial connect ping
echo "Connecting to BRB..."
CONNECT_RESULT=$(curl -s -w "\\n%{http_code}" -X POST "${config.connectUrl}" \\
  -H "Authorization: Bearer ${config.connectionToken}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"cwd\\": \\"$(pwd)\\", \\"machineName\\": \\"$(hostname)\\"}" 2>/dev/null)
HTTP_CODE=$(echo "$CONNECT_RESULT" | tail -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "  Connected!"
else
  echo "  Warning: Connect ping returned $HTTP_CODE (may need a fresh token)"
fi

# Start the poller (launchd handles this on macOS, fallback to manual start)
if [ ! -f .brb/launchd-plist-path ]; then
  .brb/start.sh
fi

echo ""
echo "  BRB is set up!"
echo ""
echo "  What happened:"
echo "    - .brb/           Scripts + config (gitignored)"
echo "    - .claude/settings.json   Claude hooks for approval forwarding"
echo "    - Background poller running for Telegram instructions"
if [ -f .brb/launchd-plist-path ]; then
echo "    - Auto-start on login (launchd agent registered)"
fi
echo ""
echo "  Commands:"
echo "    .brb/start.sh     Start the poller"
echo "    .brb/stop.sh      Stop the poller"
echo "    tail -f .brb/poller.log   Watch poller activity"
echo ""
echo "  Next: restart Claude Code in this project so hooks load."
echo ""
`;
}

