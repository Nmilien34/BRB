import { telegramConfig } from './telegram.config.js';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramSendMessageOptions {
  disableNotification?: boolean;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export class TelegramApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TelegramApiError';
    this.status = status;
  }
}

async function telegramApiRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !data.ok || data.result === undefined) {
    throw new TelegramApiError(data.description ?? 'Telegram API request failed.', response.status);
  }

  return data.result;
}

export const telegramClient = {
  async sendMessage(chatId: string, text: string, options?: TelegramSendMessageOptions) {
    return telegramApiRequest('sendMessage', {
      chat_id: chatId,
      text,
      disable_notification: options?.disableNotification,
      parse_mode: options?.parseMode,
    });
  },
  async setWebhook(url: string, secretToken?: string) {
    return telegramApiRequest<boolean>('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message'],
    });
  },
  async deleteWebhook() {
    return telegramApiRequest<boolean>('deleteWebhook');
  },
  async getMe() {
    return telegramApiRequest<TelegramBotInfo>('getMe');
  },
};
