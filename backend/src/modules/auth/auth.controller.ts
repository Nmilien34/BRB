import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { serializeUser } from '../users/user.serializer.js';
import type { StartAuthBody } from './auth.schemas.js';
import { startAuth } from './auth.service.js';

export const startAuthSession: RequestHandler = async (req, res) => {
  const { name, email } = req.body as StartAuthBody;
  const authResult = await startAuth({ name, email });

  res.json(authResult);
};

export const getCurrentUser: RequestHandler = (req, res) => {
  const user = requireAuthenticatedUser(req);

  res.json({ user: serializeUser(user) });
};
