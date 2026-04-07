import type { RequestHandler } from 'express';

export const getSessions: RequestHandler = (_req, res) => {
  res.json({ status: 'not implemented' });
};
