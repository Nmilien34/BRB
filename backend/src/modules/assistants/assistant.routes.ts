import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getAssistantConnections } from './assistant.controller.js';
import claudeRoutes from './claude.routes.js';

const router = Router();

router.get('/', requireAuth, getAssistantConnections);
router.use('/claude', claudeRoutes);

export default router;
