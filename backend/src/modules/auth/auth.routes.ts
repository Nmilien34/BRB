import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { createIpRateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { getCurrentUser, startAuthSession } from './auth.controller.js';
import { startAuthBodySchema } from './auth.schemas.js';

const router = Router();

router.post(
  '/start',
  createIpRateLimit({
    key: 'auth:start',
    maxRequests: 15,
    windowMs: 15 * 60 * 1000,
    message: 'Too many authentication attempts. Please try again later.',
  }),
  validate({ body: startAuthBodySchema }),
  startAuthSession,
);

router.get('/me', requireAuth, getCurrentUser);

export default router;
