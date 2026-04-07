import { Router } from 'express';
import { getApprovals } from './approval.controller.js';

const router = Router();
router.get('/', getApprovals);

export default router;
