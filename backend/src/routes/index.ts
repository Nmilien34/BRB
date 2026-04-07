import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import assistantRoutes from '../modules/assistants/assistant.routes.js';
import phoneNumberRoutes from '../modules/phone-numbers/phone-number.routes.js';
import sessionRoutes from '../modules/sessions/session.routes.js';
import approvalRoutes from '../modules/approvals/approval.routes.js';
import messageRoutes from '../modules/messages/message.routes.js';
import webhookRoutes from '../modules/webhooks/webhook.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/assistants', assistantRoutes);
router.use('/phone-numbers', phoneNumberRoutes);
router.use('/sessions', sessionRoutes);
router.use('/approvals', approvalRoutes);
router.use('/messages', messageRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
