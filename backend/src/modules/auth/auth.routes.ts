import { Router } from 'express';
import { getAuth } from './auth.controller.js';

const router = Router();
router.get('/', getAuth);

export default router;
