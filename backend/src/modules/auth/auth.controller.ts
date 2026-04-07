import type { RequestHandler } from 'express';

export const getAuth: RequestHandler = (_req, res) => {
  res.json({ status: 'not implemented' });
};
