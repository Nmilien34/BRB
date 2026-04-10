import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import assistantRoutes from '../modules/assistants/assistant.routes.js';
import channelRoutes from '../modules/channels/channel.routes.js';
import instructionRoutes from '../modules/remote-instructions/remote-instruction.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/assistants', assistantRoutes);
router.use('/channels', channelRoutes);
router.use('/instructions', instructionRoutes);

export default router;
