import type { RequestHandler } from 'express';

export const getUsers: RequestHandler = (_req, res) => {
  res.json({ status: 'not implemented' });
};
