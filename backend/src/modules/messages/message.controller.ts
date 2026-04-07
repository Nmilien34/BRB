import type { RequestHandler } from 'express';

export const getMessages: RequestHandler = (_req, res) => {
  res.json({ status: 'not implemented' });
};
