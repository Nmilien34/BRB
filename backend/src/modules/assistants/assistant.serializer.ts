import type {
  AssistantConnectionMetadata,
  PublicAssistantConnection,
} from './assistant.constants.js';
import type { AssistantConnectionDocument } from './assistant-connection.model.js';

type TimestampedAssistantDocument = AssistantConnectionDocument & {
  createdAt: Date;
  updatedAt: Date;
};

function serializeMetadata(
  metadata: unknown,
): AssistantConnectionMetadata {
  const safeMetadata =
    metadata && typeof metadata === 'object'
      ? (metadata as Partial<AssistantConnectionMetadata>)
      : {};

  return {
    machineName: safeMetadata.machineName ?? null,
    installedHookVersion: safeMetadata.installedHookVersion ?? null,
    lastPingAt: safeMetadata.lastPingAt ?? null,
    lastSeenProjectPath: safeMetadata.lastSeenProjectPath ?? null,
    lastError: safeMetadata.lastError ?? null,
  };
}

export function serializeAssistantConnection(
  assistant: AssistantConnectionDocument,
): PublicAssistantConnection {
  const timestampedAssistant = assistant as TimestampedAssistantDocument;

  return {
    id: timestampedAssistant.id,
    assistantType: timestampedAssistant.assistantType,
    status: timestampedAssistant.status,
    authMethod: timestampedAssistant.authMethod,
    tokenPreview: timestampedAssistant.connectionTokenPreview ?? null,
    awayModeEnabled: timestampedAssistant.awayModeEnabled,
    awayModeActivatedAt: timestampedAssistant.awayModeActivatedAt ?? null,
    lastConnectedAt: timestampedAssistant.lastConnectedAt ?? null,
    lastEventAt: timestampedAssistant.lastEventAt ?? null,
    metadata: serializeMetadata(timestampedAssistant.metadata),
    createdAt: timestampedAssistant.createdAt,
    updatedAt: timestampedAssistant.updatedAt,
  };
}

export const serializeAssistant = serializeAssistantConnection;
