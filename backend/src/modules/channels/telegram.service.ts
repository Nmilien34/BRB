import { createHmac, randomBytes } from 'node:crypto';
import type { ChannelConnectionDocument } from '../channel-connections/channel-connection.model.js';
import { ChannelConnection } from '../channel-connections/channel-connection.model.js';
import type { UserDocument } from '../users/user.model.js';
import { env } from '../../config/index.js';
import { logger } from '../../utils/index.js';
import { HttpError } from '../../utils/httpError.js';
import { type PublicChannelConnection, serializeChannelConnection } from './channel.serializer.js';
import { telegramClient } from './telegram.client.js';
import { getTelegramWebhookUrl, telegramConfig } from './telegram.config.js';
import type { TelegramWebhookUpdate } from './telegram.schemas.js';
import {
  getOpenApprovalRequestForUserById,
  getOpenApprovalRequestForUserByIndex,
  listOpenApprovalRequestsForUser,
  resolveApprovalRequest,
} from '../approval-requests/approval-request.service.js';
import {
  formatTelegramApprovalConfirmation,
  formatTelegramApprovalDetailsMessage,
  formatTelegramPendingApprovalList,
  formatTelegramSelectedApprovalPrompt,
  formatTelegramApprovalWhyMessage,
} from '../delivery/formatters/approval-message.formatter.js';
import { queueTelegramInstructionForAgent } from '../remote-instructions/remote-instruction.service.js';
import {
  type AssistantType,
  agentNamePattern,
  resolveAgentName,
  getAgentDisplayName,
} from '../assistants/assistant.constants.js';

const TELEGRAM_CHANNEL_TYPE = 'telegram';
const CONNECT_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const NO_PENDING_APPROVALS_MESSAGE =
  'No pending approvals right now.\nTo send an instruction, start your message with an agent name (e.g., "Claude ...").';

interface TelegramConnectionMetadata {
  telegramUserId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  selectedApprovalRequestId?: string | null;
  connectTokenHash?: string | null;
  connectTokenExpiresAt?: Date | string | null;
  lastUsedAssistantType?: AssistantType | null;
}

interface TelegramStartResponse {
  deepLink: string;
  botUsername: string;
  status: string;
  expiresAt: Date;
  alreadyConnected?: boolean;
  username?: string;
}

interface TelegramApprovalReply {
  status: 'approved' | 'denied' | 'responded';
  resolutionNote: string;
}

type TelegramApprovalCommand =
  | { type: 'list' }
  | { type: 'select'; index: number }
  | { type: 'inspect'; subject: 'current' | 'index'; index?: number; detail: 'why' | 'details' }
  | { type: 'resolve'; subject: 'current' | 'index'; index?: number; replyText: string };

function getTelegramMetadata(connection: ChannelConnectionDocument): TelegramConnectionMetadata {
  if (!connection.metadata || typeof connection.metadata !== 'object') {
    return {};
  }

  return connection.metadata as TelegramConnectionMetadata;
}

function setTelegramMetadata(
  connection: ChannelConnectionDocument,
  updates: Partial<TelegramConnectionMetadata>,
): void {
  const metadata = { ...getTelegramMetadata(connection) };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete metadata[key as keyof TelegramConnectionMetadata];
    } else {
      metadata[key as keyof TelegramConnectionMetadata] = value as never;
    }
  }

  connection.metadata = metadata;
}

function hashConnectToken(rawToken: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(rawToken).digest('hex');
}

function generateConnectToken(): string {
  return randomBytes(24).toString('base64url');
}

function buildTelegramDeepLink(rawToken: string): string {
  return `https://t.me/${telegramConfig.botUsername}?start=${rawToken}`;
}

function buildConnectionLabel(username?: string | null, firstName?: string | null, lastName?: string | null) {
  if (username) {
    return `@${username}`;
  }

  return [firstName, lastName].filter(Boolean).join(' ') || 'Telegram';
}

function parseStartPayload(text?: string): string | null {
  if (!text) {
    return null;
  }

  const match = text.trim().match(/^\/start(?:@[\w_]+)?(?:\s+([A-Za-z0-9_-]+))?$/);

  return match?.[1] ?? null;
}

function parseApprovalReply(text: string): TelegramApprovalReply {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  const approvedReplies = new Set(['yes', 'y', 'approve', 'approved', '✅']);
  const deniedReplies = new Set(['no', 'n', 'deny', 'denied', '❌']);

  if (approvedReplies.has(normalized)) {
    return {
      status: 'approved',
      resolutionNote: trimmed,
    };
  }

  if (deniedReplies.has(normalized)) {
    return {
      status: 'denied',
      resolutionNote: trimmed,
    };
  }

  return {
    status: 'responded',
    resolutionNote: trimmed,
  };
}

function parseApprovalCommand(text: string): TelegramApprovalCommand {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === 'list') {
    return { type: 'list' };
  }

  if (normalized === 'why' || normalized === 'details') {
    return {
      type: 'inspect',
      subject: 'current',
      detail: normalized,
    };
  }

  const numberedReplyMatch = trimmed.match(/^(\d+)(?:\s+(.+))?$/s);

  if (numberedReplyMatch) {
    const index = Number.parseInt(numberedReplyMatch[1] ?? '', 10);
    const replyText = numberedReplyMatch[2]?.trim();

    if (!replyText) {
      return { type: 'select', index };
    }

    const normalizedReply = replyText.toLowerCase();

    if (normalizedReply === 'why' || normalizedReply === 'details') {
      return {
        type: 'inspect',
        subject: 'index',
        index,
        detail: normalizedReply,
      };
    }

    return {
      type: 'resolve',
      subject: 'index',
      index,
      replyText,
    };
  }

  return { type: 'resolve', subject: 'current', replyText: trimmed };
}

interface AgentInstructionParse {
  mentioned: boolean;
  assistantType: AssistantType | null;
  prompt: string | null;
  targetProject: string | null;
}

function parseAgentInstructionPrompt(text: string): AgentInstructionParse {
  const trimmed = text.trim();
  const nameMatch = trimmed.match(agentNamePattern);

  if (!nameMatch?.[1]) {
    return { mentioned: false, assistantType: null, prompt: null, targetProject: null };
  }

  const matchedName = nameMatch[1];
  const assistantType = resolveAgentName(matchedName);
  const remainder = trimmed.slice(matchedName.length);

  // Match: "@projectname do something" (separator before @ is optional)
  const projectMatch = remainder.match(/^[\s,:-]*@(\S+)[\s,:-]+(.+)$/is);
  if (projectMatch?.[1] && projectMatch?.[2]) {
    const targetProject = projectMatch[1].trim();
    const prompt = projectMatch[2].trim();
    return { mentioned: true, assistantType, prompt: prompt.length > 0 ? prompt : null, targetProject };
  }

  // Match: "@projectname" (no prompt after project)
  const projectOnlyMatch = remainder.match(/^[\s,:-]*@(\S+)\s*$/is);
  if (projectOnlyMatch?.[1]) {
    return { mentioned: true, assistantType, prompt: null, targetProject: projectOnlyMatch[1].trim() };
  }

  // Fallback: no project specified
  const promptMatch = remainder.match(/^(?:[\s,:-]+)(.+)$/is);
  if (!promptMatch?.[1]) {
    return { mentioned: true, assistantType, prompt: null, targetProject: null };
  }

  const prompt = promptMatch[1].trim();
  return { mentioned: true, assistantType, prompt: prompt.length > 0 ? prompt : null, targetProject: null };
}

async function findTelegramConnectionForUser(user: UserDocument): Promise<ChannelConnectionDocument | null> {
  return ChannelConnection.findOne({ userId: user._id, type: TELEGRAM_CHANNEL_TYPE });
}

async function findTelegramConnectionByChatId(chatId: string): Promise<ChannelConnectionDocument | null> {
  return ChannelConnection.findOne({
    type: TELEGRAM_CHANNEL_TYPE,
    status: 'connected',
    identifier: chatId,
  });
}

async function requireConnectedTelegramConnection(user: UserDocument): Promise<ChannelConnectionDocument> {
  const connection = await findTelegramConnectionForUser(user);

  if (!connection || connection.status !== 'connected' || !connection.identifier) {
    throw new HttpError(404, 'Telegram channel is not connected.');
  }

  return connection;
}

async function clearSelectedApprovalRequest(
  connection: ChannelConnectionDocument,
): Promise<void> {
  setTelegramMetadata(connection, { selectedApprovalRequestId: null });
  await connection.save();
}

async function setSelectedApprovalRequest(
  connection: ChannelConnectionDocument,
  approvalRequestId: string,
): Promise<void> {
  setTelegramMetadata(connection, { selectedApprovalRequestId: approvalRequestId });
  await connection.save();
}

async function getSelectedOpenApprovalRequest(
  connection: ChannelConnectionDocument,
) {
  const metadata = getTelegramMetadata(connection);
  const selectedApprovalRequestId = metadata.selectedApprovalRequestId;

  if (!selectedApprovalRequestId) {
    return null;
  }

  const approvalRequest = await getOpenApprovalRequestForUserById(
    connection.userId,
    selectedApprovalRequestId,
  );

  if (approvalRequest) {
    return approvalRequest;
  }

  await clearSelectedApprovalRequest(connection);
  return null;
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  try {
    await telegramClient.sendMessage(chatId, text);
    logger.info({ chatId }, 'Telegram message sent successfully');
  } catch (error) {
    logger.error({ err: error, chatId }, 'Telegram message send failed');
    throw new HttpError(502, 'Failed to send Telegram message.');
  }
}

async function sendTelegramMessageBestEffort(chatId: string, text: string): Promise<void> {
  try {
    await telegramClient.sendMessage(chatId, text);
    logger.info({ chatId }, 'Telegram message sent successfully');
  } catch (error) {
    logger.error({ err: error, chatId }, 'Telegram message send failed');
  }
}

export async function startTelegramConnection(user: UserDocument): Promise<TelegramStartResponse> {
  let connection = await findTelegramConnectionForUser(user);

  // If already connected, return existing connection info without resetting it
  if (connection?.status === 'connected' && connection.identifier) {
    const meta = getTelegramMetadata(connection);
    return {
      deepLink: buildTelegramDeepLink('already-connected'),
      botUsername: telegramConfig.botUsername,
      status: connection.status,
      expiresAt: new Date(Date.now() + CONNECT_TOKEN_EXPIRY_MS),
      alreadyConnected: true,
      username: meta.username ?? undefined,
    };
  }

  if (!connection) {
    connection = new ChannelConnection({
      userId: user._id,
      type: TELEGRAM_CHANNEL_TYPE,
      status: 'pending',
    });
  } else {
    connection.status = 'pending';
  }

  const rawToken = generateConnectToken();
  const expiresAt = new Date(Date.now() + CONNECT_TOKEN_EXPIRY_MS);

  connection.identifier = undefined;
  connection.label = undefined;
  setTelegramMetadata(connection, {
    telegramUserId: null,
    username: null,
    firstName: null,
    lastName: null,
    selectedApprovalRequestId: null,
    connectTokenHash: hashConnectToken(rawToken),
    connectTokenExpiresAt: expiresAt,
  });
  await connection.save();

  return {
    deepLink: buildTelegramDeepLink(rawToken),
    botUsername: telegramConfig.botUsername,
    status: connection.status,
    expiresAt,
  };
}

export async function getTelegramStatus(user: UserDocument): Promise<PublicChannelConnection | null> {
  const connection = await findTelegramConnectionForUser(user);

  return connection ? serializeChannelConnection(connection) : null;
}

export async function sendTelegramTestMessage(user: UserDocument): Promise<void> {
  const connection = await requireConnectedTelegramConnection(user);

  await sendTelegramMessage(
    connection.identifier as string,
    "🔔 This is a test message from BRB.\nYour assistant approvals will appear here when away mode is on.",
  );
}

export async function disconnectTelegram(user: UserDocument): Promise<{ success: true }> {
  const connection = await findTelegramConnectionForUser(user);

  if (!connection) {
    throw new HttpError(404, 'Telegram channel is not connected.');
  }

  const chatId = connection.identifier ?? null;

  connection.status = 'disabled';
  connection.identifier = undefined;
  connection.label = undefined;
  setTelegramMetadata(connection, {
    telegramUserId: null,
    username: null,
    firstName: null,
    lastName: null,
    selectedApprovalRequestId: null,
    connectTokenHash: null,
    connectTokenExpiresAt: null,
  });
  await connection.save();

  if (chatId) {
    await sendTelegramMessageBestEffort(
      chatId,
      'BRB Telegram connection disabled. You can reconnect from the BRB app any time.',
    );
  }

  return { success: true };
}

async function linkTelegramConnection(update: TelegramWebhookUpdate, rawToken: string): Promise<void> {
  const message = update.message ?? update.edited_message;
  const from = message?.from;
  const chat = message?.chat;

  if (!from || !chat) {
    logger.warn({ updateId: update.update_id }, 'Telegram start payload missing chat or user context');
    return;
  }

  const tokenHash = hashConnectToken(rawToken);
  const connection = await ChannelConnection.findOne({
    type: TELEGRAM_CHANNEL_TYPE,
    'metadata.connectTokenHash': tokenHash,
  });

  if (!connection) {
    logger.warn({ updateId: update.update_id }, 'Telegram connect token rejected because it was not found');
    await sendTelegramMessageBestEffort(
      String(chat.id),
      'This BRB connect link is invalid or expired. Start again from the BRB app.',
    );
    return;
  }

  const metadata = getTelegramMetadata(connection);
  const expiresAt =
    metadata.connectTokenExpiresAt instanceof Date
      ? metadata.connectTokenExpiresAt
      : metadata.connectTokenExpiresAt
        ? new Date(metadata.connectTokenExpiresAt)
        : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    logger.warn(
      { channelConnectionId: connection.id, updateId: update.update_id },
      'Telegram connect token rejected because it expired',
    );
    await sendTelegramMessageBestEffort(
      String(chat.id),
      'This BRB connect link has expired. Start again from the BRB app.',
    );
    return;
  }

  logger.info(
    { channelConnectionId: connection.id, updateId: update.update_id },
    'Telegram connect token validated successfully',
  );

  const chatId = String(chat.id);
  const existingLinkedConnection = await ChannelConnection.findOne({
    type: TELEGRAM_CHANNEL_TYPE,
    identifier: chatId,
    userId: { $ne: connection.userId },
    status: 'connected',
  });

  if (existingLinkedConnection) {
    logger.warn(
      { updateId: update.update_id, chatId, channelConnectionId: existingLinkedConnection.id },
      'Telegram account is already linked to another BRB user',
    );
    await sendTelegramMessageBestEffort(
      chatId,
      'This Telegram account is already linked to another BRB account.',
    );
    return;
  }

  connection.status = 'connected';
  connection.identifier = chatId;
  connection.label = buildConnectionLabel(from.username, from.first_name, from.last_name);
  connection.lastConnectedAt = new Date();
  setTelegramMetadata(connection, {
    telegramUserId: String(from.id),
    username: from.username ?? null,
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    selectedApprovalRequestId: null,
    connectTokenHash: null,
    connectTokenExpiresAt: null,
  });
  await connection.save();

  logger.info(
    {
      channelConnectionId: connection.id,
      userId: String(connection.userId),
      chatId,
    },
    'Telegram channel connection linked',
  );

  await sendTelegramMessageBestEffort(
    chatId,
    "✓ BRB connected. You'll receive coding assistant alerts here when away mode is on.",
  );
}

async function handleApprovalReply(update: TelegramWebhookUpdate): Promise<void> {
  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim();
  const chatId = message?.chat ? String(message.chat.id) : null;

  if (!text || !chatId) {
    return;
  }

  const channelConnection = await findTelegramConnectionByChatId(chatId);

  if (!channelConnection) {
    logger.info({ updateId: update.update_id, chatId }, 'Unknown Telegram message received');
    await sendTelegramMessageBestEffort(
      chatId,
      "This Telegram account isn't linked to BRB yet.\nOpen the BRB app and go through the Telegram connect step to link it.",
    );
    return;
  }

  const connectedChannel = channelConnection;

  const command = parseApprovalCommand(text);

  if (command.type === 'list') {
    logger.info(
      { updateId: update.update_id, userId: String(connectedChannel.userId), chatId },
      'Telegram approval list command received',
    );

    const openApprovals = await listOpenApprovalRequestsForUser(connectedChannel.userId);

    if (openApprovals.length === 0) {
      logger.info(
        { updateId: update.update_id, userId: String(connectedChannel.userId), chatId },
        'Unknown Telegram message received because there are no pending approvals',
      );
      await sendTelegramMessageBestEffort(chatId, NO_PENDING_APPROVALS_MESSAGE);
      return;
    }

    await sendTelegramMessageBestEffort(chatId, formatTelegramPendingApprovalList(openApprovals));
    return;
  }

  async function getDefaultOpenApproval() {
    const selectedApprovalRequest = await getSelectedOpenApprovalRequest(connectedChannel);

    if (selectedApprovalRequest) {
      return selectedApprovalRequest;
    }

    const openApprovals = await listOpenApprovalRequestsForUser(connectedChannel.userId);
    return openApprovals[0] ?? null;
  }

  let approvalRequest = null;
  let selectionIndex: number | null = null;

  const indexedCommand =
    command.type === 'select'
      ? { index: command.index, selectionOnly: true }
      : (command.type === 'inspect' || command.type === 'resolve') &&
          command.subject === 'index' &&
          typeof command.index === 'number'
        ? { index: command.index, selectionOnly: false }
        : null;

  if (indexedCommand) {
    const index = indexedCommand.index;
    const selection = await getOpenApprovalRequestForUserByIndex(connectedChannel.userId, index);

    if (!selection) {
      await sendTelegramMessageBestEffort(
        chatId,
        'I could not find that approval. Reply "list" to see all pending approvals.',
      );
      return;
    }

    approvalRequest = selection.approvalRequest;
    selectionIndex = selection.index;

    if (indexedCommand.selectionOnly) {
      await setSelectedApprovalRequest(connectedChannel, selection.approvalRequest.id);
      await sendTelegramMessageBestEffort(
        chatId,
        formatTelegramSelectedApprovalPrompt(selection.approvalRequest, selection.index),
      );
      return;
    }
  } else {
    approvalRequest = await getDefaultOpenApproval();
  }

  if (!approvalRequest) {
    logger.info(
      { updateId: update.update_id, userId: String(connectedChannel.userId), chatId },
      'Unknown Telegram message received because there are no pending approvals',
    );
    await sendTelegramMessageBestEffort(chatId, NO_PENDING_APPROVALS_MESSAGE);
    return;
  }

  if (command.type === 'inspect') {
    await setSelectedApprovalRequest(connectedChannel, approvalRequest.id);
    const detailMessage = command.detail === 'why'
      ? formatTelegramApprovalWhyMessage(approvalRequest)
      : formatTelegramApprovalDetailsMessage(approvalRequest);

    await sendTelegramMessageBestEffort(chatId, detailMessage);
    return;
  }

  if (command.type !== 'resolve') {
    return;
  }

  const reply = parseApprovalReply(command.replyText);

  logger.info(
    {
      approvalRequestId: approvalRequest.id,
      userId: String(connectedChannel.userId),
      chatId,
      replyStatus: reply.status,
      selectedIndex: selectionIndex,
    },
    'Approval reply received',
  );

  const resolvedApproval = await resolveApprovalRequest(approvalRequest, {
    status: reply.status,
    resolutionSource: 'telegram',
    resolutionNote: reply.resolutionNote,
  });

  const metadata = getTelegramMetadata(connectedChannel);

  if (metadata.selectedApprovalRequestId === resolvedApproval.id) {
    await clearSelectedApprovalRequest(connectedChannel);
  }

  await sendTelegramMessageBestEffort(
    chatId,
    formatTelegramApprovalConfirmation(resolvedApproval.status),
  );
}

async function handleTelegramAgentInstruction(update: TelegramWebhookUpdate): Promise<boolean> {
  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim();
  const chatId = message?.chat ? String(message.chat.id) : null;

  if (!text || !chatId) {
    return false;
  }

  const parsed = parseAgentInstructionPrompt(text);

  if (!parsed.mentioned) {
    return false;
  }

  const channelConnection = await findTelegramConnectionByChatId(chatId);

  if (!channelConnection) {
    logger.info({ updateId: update.update_id, chatId }, 'Unknown Telegram agent instruction received');
    await sendTelegramMessageBestEffort(
      chatId,
      "This Telegram account isn't linked to BRB yet.\nOpen the BRB app and go through the Telegram connect step to link it.",
    );
    return true;
  }

  const effectiveAssistantType = parsed.assistantType ?? 'claude_code';
  const displayName = getAgentDisplayName(effectiveAssistantType);

  logger.info(
    { updateId: update.update_id, userId: String(channelConnection.userId), chatId, assistantType: effectiveAssistantType },
    `Telegram ${displayName} instruction received`,
  );

  if (!parsed.prompt) {
    await sendTelegramMessageBestEffort(
      chatId,
      `Start your message with "${displayName}" followed by what you want it to do.\nExample: ${displayName}, check my last few commits and tell me what you were working on.`,
    );
    return true;
  }

  // Track last used agent for future bare instructions
  setTelegramMetadata(channelConnection, { lastUsedAssistantType: effectiveAssistantType });
  await channelConnection.save();

  try {
    await queueTelegramInstructionForAgent({
      userId: channelConnection.userId,
      sourceChannelConnectionId: channelConnection.id,
      prompt: parsed.prompt,
      targetProject: parsed.targetProject,
      assistantType: effectiveAssistantType,
    });
  } catch (error) {
    logger.warn({ err: error, updateId: update.update_id, chatId }, `Failed to queue Telegram ${displayName} instruction`);

    if (error instanceof HttpError) {
      let userMessage: string;
      if (error.status === 409) {
        userMessage = `${displayName} isn't connected right now. Run the install command from your BRB dashboard to reconnect, then try again.`;
      } else if (error.status === 404) {
        userMessage = error.message;
      } else {
        userMessage = `I could not send that to ${displayName} right now. Please try again shortly.`;
      }
      await sendTelegramMessageBestEffort(chatId, userMessage);
    } else {
      await sendTelegramMessageBestEffort(
        chatId,
        `I could not send that to ${displayName} right now. Please try again shortly.`,
      );
    }
  }

  return true;
}

export async function handleTelegramWebhookUpdate(update: TelegramWebhookUpdate): Promise<void> {
  const message = update.message ?? update.edited_message;

  logger.info({ updateId: update.update_id }, 'Telegram webhook received');

  if (!message?.text) {
    return;
  }

  const startPayload = parseStartPayload(message.text);

  if (startPayload) {
    await linkTelegramConnection(update, startPayload);
    return;
  }

  if (message.text.trim().startsWith('/start')) {
    if (message.chat) {
      await sendTelegramMessageBestEffort(
        String(message.chat.id),
        "Welcome to BRB! To link this Telegram account, open the BRB app and go through the Telegram connect step — you'll get a special link to tap here.",
      );
    }

    return;
  }

  if (await handleTelegramAgentInstruction(update)) {
    return;
  }

  // Check if this looks like an approval-related command before routing there
  const text = message.text.trim();
  const normalizedText = text.toLowerCase();
  const isApprovalCommand =
    normalizedText === 'list' ||
    normalizedText === 'why' ||
    normalizedText === 'details' ||
    /^(approve|deny|yes|no|y|n)\b/i.test(text) ||
    /^\d+/.test(text);

  if (isApprovalCommand) {
    await handleApprovalReply(update);
    return;
  }

  // Bare instruction (no agent prefix) — route to last used agent if available
  if (message.chat && text.length > 0) {
    const chatId = String(message.chat.id);
    const channelConnection = await findTelegramConnectionByChatId(chatId);
    if (channelConnection) {
      const metadata = getTelegramMetadata(channelConnection);
      const lastUsedType = metadata.lastUsedAssistantType;
      if (lastUsedType) {
        const displayName = getAgentDisplayName(lastUsedType);
        try {
          await queueTelegramInstructionForAgent({
            userId: channelConnection.userId,
            sourceChannelConnectionId: channelConnection.id,
            prompt: text,
            assistantType: lastUsedType,
          });
        } catch (error) {
          if (error instanceof HttpError) {
            await sendTelegramMessageBestEffort(chatId, error.status === 409
              ? `${displayName} isn't connected right now. Run the install command from your BRB dashboard to reconnect, then try again.`
              : error.status === 404 ? error.message
              : `I could not send that to ${displayName} right now. Please try again shortly.`);
          } else {
            await sendTelegramMessageBestEffort(chatId, `I could not send that to ${displayName} right now. Please try again shortly.`);
          }
        }
        return;
      }
    }
  }

  // Unrecognized message — send help
  if (message.chat) {
    await sendTelegramMessageBestEffort(
      String(message.chat.id),
      'To send an instruction, start with an agent name (Claude, Codex, Cursor, Antigravity).\nExample: Claude, check my last few commits\n\nTo manage approvals, reply "list" to see pending requests.',
    );
  }
}

export function isValidTelegramWebhookSecret(secret: string, headerSecret?: string): boolean {
  if (secret !== telegramConfig.webhookSecret) {
    return false;
  }

  if (headerSecret && headerSecret !== telegramConfig.webhookSecret) {
    return false;
  }

  return true;
}

export async function getTelegramBotInfo() {
  return telegramClient.getMe();
}

export async function registerTelegramWebhook() {
  const result = await telegramClient.setWebhook(getTelegramWebhookUrl(), telegramConfig.webhookSecret);
  const me = await telegramClient.getMe();

  return {
    ok: result,
    botUsername: me.username ?? telegramConfig.botUsername,
    webhookUrl: getTelegramWebhookUrl(),
  };
}

export async function removeTelegramWebhook() {
  return telegramClient.deleteWebhook();
}
