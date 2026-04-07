import type { RequestHandler } from 'express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import { listAssistantConnectionsForUser } from './assistant.service.js';

export const getAssistantConnections: RequestHandler = async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const assistants = await listAssistantConnectionsForUser(user);

  res.json({ assistants });
};
