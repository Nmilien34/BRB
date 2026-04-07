import type { RequestHandler } from 'express';

export const getWebhooks: RequestHandler = (_req, res) => {
  res.json({ status: 'not implemented' });
};
