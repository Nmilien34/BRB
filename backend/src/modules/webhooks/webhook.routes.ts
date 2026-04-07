import { Router } from 'express';
import { getWebhooks } from './webhook.controller.js';

const router = Router();
router.get('/', getWebhooks);

export default router;
