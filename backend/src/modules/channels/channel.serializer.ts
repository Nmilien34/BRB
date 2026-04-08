import type { ChannelConnectionDocument, ChannelConnectionType } from '../channel-connections/channel-connection.model.js';

export interface TelegramMetadataPreview {
  telegramUserId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface PublicChannelConnection {
  id: string;
  type: ChannelConnectionType;
  status: string;
  identifierPreview: string | null;
  label: string | null;
  lastConnectedAt: Date | null;
  metadataPreview: TelegramMetadataPreview | null;
  createdAt: Date;
  updatedAt: Date;
}

type TimestampedChannelConnectionDocument = ChannelConnectionDocument & {
  createdAt: Date;
  updatedAt: Date;
};

function previewIdentifier(identifier?: string | null): string | null {
  if (!identifier) {
    return null;
  }

  if (identifier.length <= 6) {
    return identifier;
  }

  return `${identifier.slice(0, 3)}...${identifier.slice(-3)}`;
}

function serializeTelegramMetadataPreview(metadata: unknown): TelegramMetadataPreview | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const safeMetadata = metadata as Record<string, unknown>;

  return {
    telegramUserId:
      typeof safeMetadata.telegramUserId === 'string' ? safeMetadata.telegramUserId : null,
    username: typeof safeMetadata.username === 'string' ? safeMetadata.username : null,
    firstName: typeof safeMetadata.firstName === 'string' ? safeMetadata.firstName : null,
    lastName: typeof safeMetadata.lastName === 'string' ? safeMetadata.lastName : null,
  };
}

export function serializeChannelConnection(
  channelConnection: ChannelConnectionDocument,
): PublicChannelConnection {
  const timestampedChannelConnection = channelConnection as TimestampedChannelConnectionDocument;

  return {
    id: timestampedChannelConnection.id,
    type: timestampedChannelConnection.type,
    status: timestampedChannelConnection.status,
    identifierPreview: previewIdentifier(timestampedChannelConnection.identifier ?? null),
    label: timestampedChannelConnection.label ?? null,
    lastConnectedAt: timestampedChannelConnection.lastConnectedAt ?? null,
    metadataPreview:
      timestampedChannelConnection.type === 'telegram'
        ? serializeTelegramMetadataPreview(timestampedChannelConnection.metadata)
        : null,
    createdAt: timestampedChannelConnection.createdAt,
    updatedAt: timestampedChannelConnection.updatedAt,
  };
}
