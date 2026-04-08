import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { listChannelConnectionsForUser } from './channel.service.js';

export const getChannels: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const channels = await listChannelConnectionsForUser(user);

  res.json({ channels });
};
