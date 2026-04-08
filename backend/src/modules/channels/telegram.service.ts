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
import { queueTelegramInstructionForClaude } from '../remote-instructions/remote-instruction.service.js';

const TELEGRAM_CHANNEL_TYPE = 'telegram';
const CONNECT_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const NO_PENDING_APPROVALS_MESSAGE =
  'No pending approvals right now.\nTo send Claude a new instruction, start your message with "Claude ...".';

interface TelegramConnectionMetadata {
  telegramUserId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  selectedApprovalRequestId?: string | null;
  connectTokenHash?: string | null;
  connectTokenExpiresAt?: Date | string | null;
}

interface TelegramStartResponse {
  deepLink: string;
  botUsername: string;
  status: string;
  expiresAt: Date;
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

function parseClaudeInstructionPrompt(text: string): { mentioned: boolean; prompt: string | null } {
  const trimmed = text.trim();
  const hasClaudePrefix = /^claude\b/i.test(trimmed);

  if (!hasClaudePrefix) {
    return { mentioned: false, prompt: null };
  }

  const match = trimmed.match(/^claude(?:[\s,:-]+)(.+)$/is);

  if (!match?.[1]) {
    return { mentioned: true, prompt: null };
  }

  const prompt = match[1].trim();
  return { mentioned: true, prompt: prompt.length > 0 ? prompt : null };
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

async function handleTelegramClaudeInstruction(update: TelegramWebhookUpdate): Promise<boolean> {
  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim();
  const chatId = message?.chat ? String(message.chat.id) : null;

  if (!text || !chatId) {
    return false;
  }

  const { mentioned, prompt } = parseClaudeInstructionPrompt(text);

  if (!mentioned) {
    return false;
  }

  const channelConnection = await findTelegramConnectionByChatId(chatId);

  if (!channelConnection) {
    logger.info({ updateId: update.update_id, chatId }, 'Unknown Telegram Claude instruction received');
    return true;
  }

  logger.info(
    { updateId: update.update_id, userId: String(channelConnection.userId), chatId },
    'Telegram Claude instruction received',
  );

  if (!prompt) {
    await sendTelegramMessageBestEffort(
      chatId,
      'Start your message with "Claude" followed by what you want it to do.\nExample: Claude, check my last few commits and tell me what you were working on.',
    );
    return true;
  }

  try {
    await queueTelegramInstructionForClaude({
      userId: channelConnection.userId,
      sourceChannelConnectionId: channelConnection.id,
      prompt,
    });
  } catch (error) {
    logger.warn({ err: error, updateId: update.update_id, chatId }, 'Failed to queue Telegram Claude instruction');

    if (error instanceof HttpError) {
      await sendTelegramMessageBestEffort(
        chatId,
        error.status === 409
          ? 'Claude is not connected right now. Open Claude on your computer first, then try again.'
          : 'I could not send that to Claude right now. Please try again shortly.',
      );
    } else {
      await sendTelegramMessageBestEffort(
        chatId,
        'I could not send that to Claude right now. Please try again shortly.',
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
        'Open the BRB app and start a new Telegram connect flow to link this account.',
      );
    }

    return;
  }

  if (await handleTelegramClaudeInstruction(update)) {
    return;
  }

  await handleApprovalReply(update);
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
