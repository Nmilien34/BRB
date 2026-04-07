import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { createIpRateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { getCurrentUser, requestAuthCode, verifyAuthCode } from './auth.controller.js';
import { requestCodeBodySchema, verifyCodeBodySchema } from './auth.schemas.js';

const router = Router();

router.post(
  '/request-code',
  createIpRateLimit({
    key: 'auth:request-code',
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    message: 'Too many code requests. Please try again later.',
  }),
  validate({ body: requestCodeBodySchema }),
  requestAuthCode,
);

router.post(
  '/verify-code',
  createIpRateLimit({
    key: 'auth:verify-code',
    maxRequests: 15,
    windowMs: 15 * 60 * 1000,
    message: 'Too many verification attempts. Please try again later.',
  }),
  validate({ body: verifyCodeBodySchema }),
  verifyAuthCode,
);

router.get('/me', requireAuth, getCurrentUser);

export default router;
