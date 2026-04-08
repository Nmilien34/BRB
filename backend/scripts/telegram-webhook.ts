import { logger } from '../src/utils/index.js';
import {
  getTelegramBotInfo,
  registerTelegramWebhook,
  removeTelegramWebhook,
} from '../src/modules/channels/telegram.service.js';
import { getTelegramWebhookUrl } from '../src/modules/channels/telegram.config.js';

async function main() {
  const command = process.argv[2] ?? 'set';

  if (command === 'set') {
    const result = await registerTelegramWebhook();
    logger.info(result, 'Telegram webhook registered');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'delete') {
    const result = await removeTelegramWebhook();
    logger.info({ ok: result }, 'Telegram webhook deleted');
    console.log(JSON.stringify({ ok: result }, null, 2));
    return;
  }

  if (command === 'me') {
    const result = await getTelegramBotInfo();
    logger.info(result, 'Telegram bot info fetched');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(
    `Unknown command "${command}". Use one of: set, delete, me.\nWebhook URL: ${getTelegramWebhookUrl()}`,
  );
  process.exit(1);
}

main().catch((error) => {
  logger.error({ err: error }, 'Telegram webhook script failed');
  process.exit(1);
});
