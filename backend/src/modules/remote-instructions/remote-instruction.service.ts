import { HttpError } from '../../utils/httpError.js';
import { logger } from '../../utils/index.js';
import { ChannelConnection } from '../channel-connections/channel-connection.model.js';
import { ClaudeHookEvent } from '../assistants/claude-hook-event.model.js';
import { AssistantConnection, type AssistantConnectionDocument } from '../assistants/assistant-connection.model.js';
import { type ActiveProject, sanitizeActiveProjects } from '../assistants/assistant.constants.js';
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
const REMOTE_INSTRUCTION_DISPATCH_TIMEOUT_MS = 20 * 60 * 1000; // must exceed poller's CLAUDE_EXECUTION_TIMEOUT_MS (15 min)
const CONNECTION_STALE_THRESHOLD_MS = 90_000; // 3× the 30s ping interval — must match claude.service.ts

interface QueueTelegramInstructionInput {
  userId: AssistantConnectionDocument['userId'];
  sourceChannelConnectionId: string;
  prompt: string;
  targetProject?: string | null;
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
  const connection = await AssistantConnection.findOne({
    userId,
    assistantType: CLAUDE_ASSISTANT_TYPE,
    status: 'connected',
  });

  if (!connection) return null;

  // Check if the connection is stale (poller hasn't pinged recently)
  const metadata = connection.metadata as Record<string, unknown> | null;
  const lastPingAt = metadata?.lastPingAt;
  if (lastPingAt) {
    const pingTime = lastPingAt instanceof Date ? lastPingAt : new Date(lastPingAt as string | number);
    if (Date.now() - pingTime.getTime() > CONNECTION_STALE_THRESHOLD_MS) {
      return null; // poller is likely dead
    }
  }

  return connection;
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

function resolveTargetProject(
  assistantConnection: AssistantConnectionDocument,
  targetProject: string | null | undefined,
): { projectPath: string | null; projectName: string | null; activeProjects: ActiveProject[] } {
  const connectionMetadata = assistantConnection.metadata as Record<string, unknown> | null;
  const activeProjects: ActiveProject[] = sanitizeActiveProjects(connectionMetadata?.activeProjects);

  if (!targetProject) {
    // Default to most recently active project
    if (activeProjects.length > 0) {
      const sorted = [...activeProjects].sort(
        (a, b) => new Date(b.lastPingAt).getTime() - new Date(a.lastPingAt).getTime(),
      );
      return { projectPath: sorted[0].path, projectName: sorted[0].name, activeProjects };
    }
    // Fallback to lastSeenProjectPath
    const lastSeenProjectPath = connectionMetadata?.lastSeenProjectPath as string | null;
    const projectName = lastSeenProjectPath ? lastSeenProjectPath.split('/').pop() || null : null;
    return { projectPath: lastSeenProjectPath, projectName, activeProjects };
  }

  // Match by case-insensitive basename
  const match = activeProjects.find(
    (p) => p.name.toLowerCase() === targetProject.toLowerCase(),
  );

  if (!match) {
    const activeNames = activeProjects.map((p) => p.name).join(', ') || 'none';
    throw new HttpError(404, `No active project matching "${targetProject}". Active projects: ${activeNames}`);
  }

  return { projectPath: match.path, projectName: match.name, activeProjects };
}

export async function queueTelegramInstructionForClaude({
  userId,
  sourceChannelConnectionId,
  prompt,
  targetProject,
}: QueueTelegramInstructionInput): Promise<{
  instruction: RemoteInstructionDocument;
  publicInstruction: PublicRemoteInstruction;
}> {
  const assistantConnection = await findConnectedClaudeConnectionForUser(userId);

  if (!assistantConnection) {
    throw new HttpError(409, 'Claude is not connected right now.');
  }

  const { projectPath, projectName, activeProjects } = resolveTargetProject(
    assistantConnection,
    targetProject,
  );

  const [latestSessionContext, pendingCount] = await Promise.all([
    getLatestClaudeSessionContext(assistantConnection.id),
    RemoteInstruction.countDocuments({
      assistantConnectionId: assistantConnection._id,
      status: { $in: ['queued', 'dispatched'] },
    }),
  ]);

  const instruction = await RemoteInstruction.create({
    userId,
    assistantConnectionId: assistantConnection._id,
    channelType: 'telegram',
    sourceChannelConnectionId,
    prompt,
    status: 'queued',
    targetProjectPath: projectPath,
    targetSessionId: latestSessionContext.sessionId,
    targetSessionLabel: latestSessionContext.sessionLabel,
  });

  logger.info(
    {
      remoteInstructionId: instruction.id,
      assistantConnectionId: String(assistantConnection._id),
      targetProjectPath: projectPath,
      targetSessionId: latestSessionContext.sessionId,
      targetSessionLabel: latestSessionContext.sessionLabel,
      queuePosition: pendingCount,
      projectName,
    },
    'Queued Telegram remote instruction for Claude',
  );

  await sendTelegramMessageBestEffort(
    userId,
    formatTelegramRemoteInstructionQueuedMessage(
      instruction,
      pendingCount,
      projectName,
      activeProjects.length,
    ),
  );

  return {
    instruction,
    publicInstruction: serializeRemoteInstruction(instruction),
  };
}

export async function claimNextRemoteInstructionForClaude(
  assistantConnection: AssistantConnectionDocument,
  pollerProjectPath?: string | null,
): Promise<PublicRemoteInstruction | null> {
  const reclaimBefore = new Date(Date.now() - REMOTE_INSTRUCTION_DISPATCH_TIMEOUT_MS);

  // Build query with $and to avoid $or key collision
  const statusFilter = {
    $or: [
      { status: 'queued' },
      {
        status: 'dispatched',
        dispatchedAt: { $ne: null, $lte: reclaimBefore },
        completedAt: null,
      },
    ],
  };

  // Match this poller's project, untargeted instructions, OR orphaned instructions
  // whose target poller hasn't claimed them within the timeout window
  const projectFilter = pollerProjectPath
    ? {
        $or: [
          { targetProjectPath: pollerProjectPath },
          { targetProjectPath: null },
          { targetProjectPath: { $exists: false } },
          // Orphan rescue: targeted at another project but queued too long (target poller likely dead)
          { targetProjectPath: { $ne: pollerProjectPath, $exists: true }, createdAt: { $lte: reclaimBefore } },
        ],
      }
    : null;

  const instruction = await RemoteInstruction.findOneAndUpdate(
    {
      assistantConnectionId: assistantConnection._id,
      $and: [statusFilter, ...(projectFilter ? [projectFilter] : [])],
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
