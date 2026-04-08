import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { logger } from '../../utils/index.js';
import { telegramWebhookUpdateSchema, type TelegramWebhookParams } from './telegram.schemas.js';
import {
  disconnectTelegram,
  getTelegramStatus,
  handleTelegramWebhookUpdate,
  isValidTelegramWebhookSecret,
  sendTelegramTestMessage,
  startTelegramConnection,
} from './telegram.service.js';

export const startTelegramLink: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const payload = await startTelegramConnection(user);

  res.json(payload);
};

export const getTelegramConnectionStatus: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const channel = await getTelegramStatus(user);

  res.json({ channel });
};

export const sendTelegramTest: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  await sendTelegramTestMessage(user);

  res.json({ success: true });
};

export const disconnectTelegramChannel: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const result = await disconnectTelegram(user);

  res.json(result);
};

export const receiveTelegramWebhook: RequestHandler = async (req, res) => {
  const { secret } = req.params as TelegramWebhookParams;
  const headerSecret = req.header('x-telegram-bot-api-secret-token');

  if (!isValidTelegramWebhookSecret(secret, headerSecret ?? undefined)) {
    logger.warn({ ip: req.ip }, 'Telegram webhook security rejected');
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const parsedUpdate = telegramWebhookUpdateSchema.safeParse(req.body);

  if (!parsedUpdate.success) {
    logger.warn({ details: parsedUpdate.error.errors }, 'Telegram webhook payload validation failed');
    return res.status(200).json({ ok: true });
  }

  try {
    await handleTelegramWebhookUpdate(parsedUpdate.data);
  } catch (error) {
    logger.error({ err: error }, 'Telegram webhook processing failed');
  }

  return res.status(200).json({ ok: true });
};
