import { createHash } from 'node:crypto';
import type { BridgeEventBody } from './claude.schemas.js';
import { deriveSessionLabel } from './claude-session-label.js';

export type ClaudeBridgeAction = 'pass_through' | 'log_only' | 'remote_candidate';

export interface ClaudeApprovalCandidate {
  requestType: 'permission_request';
  summary: string;
  sessionLabel: string;
  rawContext: Record<string, unknown>;
  dedupeKey: string;
}

export interface NormalizedClaudeEvent {
  hookEventName: string;
  toolName?: string;
  sessionId?: string;
  sessionTitle?: string;
  derivedSessionLabel: string;
  cwd?: string;
  transcriptPath?: string;
  projectPath?: string;
  normalizedSummary?: string;
  processingStatus: 'received' | 'normalized';
  approvalCandidate?: ClaudeApprovalCandidate;
}

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getRecordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = extractString(getRecordValue(record, key));

    if (value) {
      return value;
    }
  }

  return undefined;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function buildNormalizedSummary(hookEventName: string, toolName?: string): string | undefined {
  if (toolName) {
    return `${hookEventName}:${toolName}`;
  }

  return hookEventName !== 'unknown' ? hookEventName : undefined;
}

function buildPermissionSummary(toolName?: string, reason?: string): string {
  if (toolName && reason) {
    return `Claude permission request for ${toolName}: ${reason}`;
  }

  if (toolName) {
    return `Claude permission request for ${toolName}`;
  }

  if (reason) {
    return `Claude permission request: ${reason}`;
  }

  return 'Claude permission request';
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function createDedupeKey(rawContext: Record<string, unknown>): string {
  return createHash('sha256').update(stableSerialize(rawContext)).digest('hex');
}

function buildApprovalCandidate(
  hookEventName: string,
  toolName: string | undefined,
  sessionId: string | undefined,
  sessionTitle: string | undefined,
  derivedSessionLabel: string,
  cwd: string | undefined,
  transcriptPath: string | undefined,
  projectPath: string | undefined,
  payload: Record<string, unknown>,
): ClaudeApprovalCandidate | undefined {
  if (hookEventName !== 'PermissionRequest') {
    return undefined;
  }

  const reason = firstString(payload, ['reason', 'description', 'message', 'prompt', 'permissionPrompt']);
  const toolInput =
    getRecordValue(payload, 'toolInput') ??
    getRecordValue(payload, 'tool_input') ??
    getRecordValue(payload, 'input') ??
    getRecordValue(payload, 'arguments');
  const rawContext = compactRecord({
    hookEventName,
    toolName,
    sessionId,
    sessionTitle,
    sessionLabel: derivedSessionLabel,
    cwd,
    transcriptPath,
    projectPath,
    reason,
    toolInput,
  });

  return {
    requestType: 'permission_request',
    summary: buildPermissionSummary(toolName, reason),
    sessionLabel: derivedSessionLabel,
    rawContext,
    dedupeKey: createDedupeKey(rawContext),
  };
}

export function normalizeClaudeEvent(rawPayload: BridgeEventBody): NormalizedClaudeEvent {
  const payload = rawPayload as Record<string, unknown>;
  const hookEventName =
    firstString(payload, ['hookEventName', 'eventName', 'hook_event_name', 'event']) ?? 'unknown';
  const toolName = firstString(payload, ['toolName', 'tool_name']);
  const sessionId = firstString(payload, ['sessionId', 'session_id']);
  const sessionTitle = firstString(payload, ['sessionTitle', 'session_title']);
  const cwd = firstString(payload, ['cwd']);
  const projectPath = firstString(payload, ['projectPath', 'project_path']);
  const transcriptPath = firstString(payload, ['transcriptPath', 'transcript_path']);
  const derivedSessionLabel = deriveSessionLabel({
    sessionTitle,
    cwd: cwd ?? projectPath,
    transcriptPath,
    sessionId,
  });
  const normalizedSummary = buildNormalizedSummary(hookEventName, toolName);
  const approvalCandidate = buildApprovalCandidate(
    hookEventName,
    toolName,
    sessionId,
    sessionTitle,
    derivedSessionLabel,
    cwd,
    transcriptPath,
    projectPath,
    payload,
  );

  return {
    hookEventName,
    toolName,
    sessionId,
    sessionTitle,
    derivedSessionLabel,
    cwd,
    projectPath,
    transcriptPath,
    normalizedSummary,
    processingStatus: normalizedSummary || approvalCandidate ? 'normalized' : 'received',
    approvalCandidate,
  };
}

export function determineClaudeBridgeAction(
  awayModeEnabled: boolean,
  normalizedEvent: NormalizedClaudeEvent,
): ClaudeBridgeAction {
  if (!awayModeEnabled) {
    return normalizedEvent.approvalCandidate ? 'log_only' : 'pass_through';
  }

  return normalizedEvent.approvalCandidate ? 'remote_candidate' : 'log_only';
}
