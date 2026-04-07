import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { serializeUser } from '../users/user.serializer.js';
import type { RequestCodeBody, VerifyCodeBody } from './auth.schemas.js';
import { requestCode, verifyCode } from './auth.service.js';

export const requestAuthCode: RequestHandler = async (req, res) => {
  const { phone } = req.body as RequestCodeBody;

  await requestCode({ phone });

  res.json({ success: true });
};

export const verifyAuthCode: RequestHandler = async (req, res) => {
  const { phone, code } = req.body as VerifyCodeBody;
  const authResult = await verifyCode({ phone, code });

  res.json(authResult);
};

export const getCurrentUser: RequestHandler = (req, res) => {
  const user = requireAuthenticatedUser(req);

  res.json({ user: serializeUser(user) });
};
