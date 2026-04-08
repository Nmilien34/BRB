import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  disconnectTelegramChannel,
  getTelegramConnectionStatus,
  receiveTelegramWebhook,
  sendTelegramTest,
  startTelegramLink,
} from './telegram.controller.js';
import { telegramWebhookParamsSchema } from './telegram.schemas.js';

const router = Router();

router.post('/start', requireAuth, startTelegramLink);
router.get('/status', requireAuth, getTelegramConnectionStatus);
router.post('/test', requireAuth, sendTelegramTest);
router.delete('/disconnect', requireAuth, disconnectTelegramChannel);
router.post('/webhook/:secret', validate({ params: telegramWebhookParamsSchema }), receiveTelegramWebhook);

export default router;
