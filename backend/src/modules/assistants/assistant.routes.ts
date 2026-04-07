import { Router } from 'express';
import { getAssistants } from './assistant.controller.js';

const router = Router();
router.get('/', getAssistants);

export default router;
