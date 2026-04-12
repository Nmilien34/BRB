import type {
  RemoteInstructionDocument,
  RemoteInstructionStatus,
} from './remote-instruction.model.js';
import type { ChannelConnectionType } from '../channel-connections/channel-connection.model.js';

export interface PublicRemoteInstruction {
  id: string;
  assistantConnectionId: string;
  channelType: ChannelConnectionType;
  prompt: string;
  status: RemoteInstructionStatus;
  targetProjectPath: string | null;
  targetSessionId: string | null;
  targetSessionLabel: string | null;
  bridgeSessionId: string | null;
  bridgeSessionTitle: string | null;
  bridgeSessionLabel: string | null;
  replyText: string | null;
  errorMessage: string | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type TimestampedRemoteInstruction = RemoteInstructionDocument & {
  createdAt: Date;
  updatedAt: Date;
};

export function serializeRemoteInstruction(
  remoteInstruction: RemoteInstructionDocument,
): PublicRemoteInstruction {
  const timestampedRemoteInstruction = remoteInstruction as TimestampedRemoteInstruction;

  return {
    id: timestampedRemoteInstruction.id,
    assistantConnectionId: String(timestampedRemoteInstruction.assistantConnectionId),
    channelType: timestampedRemoteInstruction.channelType,
    prompt: timestampedRemoteInstruction.prompt,
    status: timestampedRemoteInstruction.status,
    targetProjectPath: timestampedRemoteInstruction.targetProjectPath ?? null,
    targetSessionId: timestampedRemoteInstruction.targetSessionId ?? null,
    targetSessionLabel: timestampedRemoteInstruction.targetSessionLabel ?? null,
    bridgeSessionId: timestampedRemoteInstruction.bridgeSessionId ?? null,
    bridgeSessionTitle: timestampedRemoteInstruction.bridgeSessionTitle ?? null,
    bridgeSessionLabel: timestampedRemoteInstruction.bridgeSessionLabel ?? null,
    replyText: timestampedRemoteInstruction.replyText ?? null,
    errorMessage: timestampedRemoteInstruction.errorMessage ?? null,
    dispatchedAt: timestampedRemoteInstruction.dispatchedAt ?? null,
    completedAt: timestampedRemoteInstruction.completedAt ?? null,
    createdAt: timestampedRemoteInstruction.createdAt,
    updatedAt: timestampedRemoteInstruction.updatedAt,
  };
}
