import { HttpError } from '../../utils/httpError.js';
import { logger } from '../../utils/index.js';
import { ChannelConnection } from '../channel-connections/channel-connection.model.js';
import { ClaudeHookEvent } from '../assistants/claude-hook-event.model.js';
import { AssistantConnection, type AssistantConnectionDocument } from '../assistants/assistant-connection.model.js';
import { telegramClient } from '../channels/telegram.client.js';
import { RemoteInstruction, type RemoteInstructionDocument } from './remote-instruction.model.js';
import {
  type PublicRemoteInstruction,
  serializeRemoteInstruction,
} from './remote-instruction.serializer.js';
import {
  formatTelegramRemoteInstructionQueuedMessage,
  formatTelegramRemoteInstructionReplyMessage,
  formatTelegramRemoteInstructionFailureMessage,
} from '../delivery/formatters/remote-message.formatter.js';

const CLAUDE_ASSISTANT_TYPE = 'claude_code';
const REMOTE_INSTRUCTION_DISPATCH_TIMEOUT_MS = 2 * 60 * 1000;

interface QueueTelegramInstructionInput {
  userId: AssistantConnectionDocument['userId'];
  sourceChannelConnectionId: string;
  prompt: string;
}

interface ReportRemoteInstructionResultInput {
  status: 'completed' | 'failed';
  replyText?: string | null;
  errorMessage?: string | null;
  sessionId?: string | null;
  sessionTitle?: string | null;
  sessionLabel?: string | null;
}

async function findConnectedClaudeConnectionForUser(
  userId: AssistantConnectionDocument['userId'],
): Promise<AssistantConnectionDocument | null> {
  return AssistantConnection.findOne({
    userId,
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: 'connected',
  });
}

async function findConnectedTelegramChatId(
  userId: AssistantConnectionDocument['userId'],
): Promise<string | null> {
  const channelConnection = await ChannelConnection.findOne({
    userId,
    type: 'telegram',
    status: 'connected',
    identifier: { $type: 'string' },
  });

  return channelConnection?.identifier ?? null;
}

async function sendTelegramMessageBestEffort(userId: AssistantConnectionDocument['userId'], text: string) {
  const chatId = await findConnectedTelegramChatId(userId);

  if (!chatId) {
    return;
  }

  try {
    await telegramClient.sendMessage(chatId, text);
    logger.info({ userId: String(userId), chatId }, 'Telegram remote instruction message sent');
  } catch (error) {
    logger.error({ err: error, userId: String(userId), chatId }, 'Telegram remote instruction send failed');
  }
}

async function getLatestClaudeSessionContext(assistantConnectionId: string) {
  const latestSessionEvent = await ClaudeHookEvent.findOne({
    assistantConnectionId,
    $or: [
      { sessionId: { $exists: true, $ne: null } },
      { sessionTitle: { $exists: true, $ne: null } },
      { derivedSessionLabel: { $exists: true, $ne: null } },
    ],
  }).sort({ receivedAt: -1 });

  if (!latestSessionEvent) {
    return {
      sessionId: null,
      sessionLabel: null,
    };
  }

  return {
    sessionId: latestSessionEvent.sessionId ?? null,
    sessionLabel: latestSessionEvent.derivedSessionLabel ?? latestSessionEvent.sessionTitle ?? null,
  };
}

export async function queueTelegramInstructionForClaude({
  userId,
  sourceChannelConnectionId,
  prompt,
}: QueueTelegramInstructionInput): Promise<{
  instruction: RemoteInstructionDocument;
  publicInstruction: PublicRemoteInstruction;
}> {
  const assistantConnection = await findConnectedClaudeConnectionForUser(userId);

  if (!assistantConnection) {
    throw new HttpError(409, 'Claude is not connected right now.');
  }

  const latestSessionContext = await getLatestClaudeSessionContext(assistantConnection.id);
  const instruction = await RemoteInstruction.create({
    userId,
    assistantConnectionId: assistantConnection._id,
    channelType: 'telegram',
    sourceChannelConnectionId,
    prompt,
    status: 'queued',
    targetSessionId: latestSessionContext.sessionId,
    targetSessionLabel: latestSessionContext.sessionLabel,
  });

  logger.info(
    {
      remoteInstructionId: instruction.id,
      assistantConnectionId: String(assistantConnection._id),
      targetSessionId: latestSessionContext.sessionId,
      targetSessionLabel: latestSessionContext.sessionLabel,
    },
    'Queued Telegram remote instruction for Claude',
  );

  await sendTelegramMessageBestEffort(
    userId,
    formatTelegramRemoteInstructionQueuedMessage(instruction),
  );

  return {
    instruction,
    publicInstruction: serializeRemoteInstruction(instruction),
  };
}

export async function claimNextRemoteInstructionForClaude(
  assistantConnection: AssistantConnectionDocument,
): Promise<PublicRemoteInstruction | null> {
  const reclaimBefore = new Date(Date.now() - REMOTE_INSTRUCTION_DISPATCH_TIMEOUT_MS);
  const instruction = await RemoteInstruction.findOneAndUpdate(
    {
      assistantConnectionId: assistantConnection._id,
      $or: [
        { status: 'queued' },
        {
          status: 'dispatched',
          dispatchedAt: { $ne: null, $lte: reclaimBefore },
          completedAt: null,
        },
      ],
    },
    {
      $set: {
        status: 'dispatched',
        dispatchedAt: new Date(),
      },
    },
    {
      sort: { createdAt: 1 },
      new: true,
    },
  );

  if (!instruction) {
    return null;
  }

  logger.info(
    {
      remoteInstructionId: instruction.id,
      assistantConnectionId: String(assistantConnection._id),
    },
    'Dispatched remote instruction to Claude bridge',
  );

  return serializeRemoteInstruction(instruction);
}

export async function reportRemoteInstructionResultForClaude(
  assistantConnection: AssistantConnectionDocument,
  instructionId: string,
  input: ReportRemoteInstructionResultInput,
): Promise<PublicRemoteInstruction> {
  const instruction = await RemoteInstruction.findOne({
    _id: instructionId,
    assistantConnectionId: assistantConnection._id,
  });

  if (!instruction) {
    throw new HttpError(404, 'Remote instruction not found.');
  }

  if (instruction.status === 'completed' || instruction.status === 'failed') {
    return serializeRemoteInstruction(instruction);
  }

  instruction.status = input.status;
  instruction.replyText = input.replyText ?? null;
  instruction.errorMessage = input.errorMessage ?? null;
  instruction.bridgeSessionId = input.sessionId ?? instruction.targetSessionId ?? null;
  instruction.bridgeSessionTitle = input.sessionTitle ?? null;
  instruction.bridgeSessionLabel = input.sessionLabel ?? instruction.targetSessionLabel ?? null;
  instruction.completedAt = new Date();
  await instruction.save();

  logger.info(
    {
      remoteInstructionId: instruction.id,
      assistantConnectionId: String(assistantConnection._id),
      status: instruction.status,
    },
    'Claude bridge reported remote instruction result',
  );

  await sendTelegramMessageBestEffort(
    instruction.userId,
    input.status === 'completed'
      ? formatTelegramRemoteInstructionReplyMessage(instruction)
      : formatTelegramRemoteInstructionFailureMessage(instruction),
  );

  return serializeRemoteInstruction(instruction);
}
