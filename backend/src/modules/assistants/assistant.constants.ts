export const assistantTypes = ['claude_code', 'cursor', 'codex', 'antigravity'] as const;
export const assistantConnectionStatuses = [
  'selected',
  'pending_connection',
  'connected',
  'error',
  'disconnected',
] as const;
export const assistantConnectionAuthMethods = ['hook'] as const;

export type AssistantType = (typeof assistantTypes)[number];
export type AssistantConnectionStatus = (typeof assistantConnectionStatuses)[number];
export type AssistantConnectionAuthMethod = (typeof assistantConnectionAuthMethods)[number];

export interface ActiveProject {
  path: string;
  name: string;
  lastPingAt: Date;
  machineName: string | null;
}

export interface AssistantConnectionMetadata {
  machineName: string | null;
  installedHookVersion: string | null;
  lastPingAt: Date | null;
  lastSeenProjectPath: string | null;
  lastError: string | null;
  activeProjects: ActiveProject[];
}

/** Validate and filter activeProjects from untyped MongoDB metadata */
export function sanitizeActiveProjects(raw: unknown): ActiveProject[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ActiveProject =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>).path === 'string' &&
      typeof (p as Record<string, unknown>).name === 'string' &&
      ((p as Record<string, unknown>).lastPingAt instanceof Date ||
        typeof (p as Record<string, unknown>).lastPingAt === 'string' ||
        typeof (p as Record<string, unknown>).lastPingAt === 'number'),
  );
}

export interface PublicAssistantConnection {
  id: string;
  assistantType: AssistantType;
  status: AssistantConnectionStatus;
  authMethod: AssistantConnectionAuthMethod;
  tokenPreview: string | null;
  awayModeEnabled: boolean;
  awayModeActivatedAt: Date | null;
  escalationDelayMinutes: number;
  lastConnectedAt: Date | null;
  lastEventAt: Date | null;
  metadata: AssistantConnectionMetadata;
  createdAt: Date;
  updatedAt: Date;
}
