import { z } from 'zod';
import { env } from '../../config/index.js';

const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  botUsername: z.string().min(1),
  appBaseUrl: z.string().url(),
  webhookSecret: z.string().min(1),
});

function normalizeBotUsername(botUsername: string): string {
  return botUsername.trim().replace(/^@+/, '');
}

export const telegramConfig = telegramConfigSchema.parse({
  botToken: env.TELEGRAM_BOT_TOKEN,
  botUsername: normalizeBotUsername(env.TELEGRAM_BOT_USERNAME),
  appBaseUrl: env.APP_BASE_URL,
  webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
});

export function getTelegramWebhookUrl(): string {
  return `${telegramConfig.appBaseUrl}/api/channels/telegram/webhook/${telegramConfig.webhookSecret}`;
}
