import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { listRemoteInstructions } from './remote-instruction.controller.js';

const router = Router();

router.get('/', requireAuth, listRemoteInstructions);

export default router;
