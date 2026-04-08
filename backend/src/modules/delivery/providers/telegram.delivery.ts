import { logger } from '../../../utils/index.js';
import { telegramClient } from '../../channels/telegram.client.js';

export async function sendTelegramDeliveryMessage(chatId: string, text: string): Promise<void> {
  try {
    await telegramClient.sendMessage(chatId, text);
    logger.info({ chatId }, 'Approval delivered to Telegram');
  } catch (error) {
    logger.error({ err: error, chatId }, 'Approval delivery failed');
    throw error;
  }
}

