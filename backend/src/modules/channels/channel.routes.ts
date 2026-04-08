import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getChannels } from './channel.controller.js';
import telegramRoutes from './telegram.routes.js';

const router = Router();

router.get('/', requireAuth, getChannels);
router.use('/telegram', telegramRoutes);

export default router;
