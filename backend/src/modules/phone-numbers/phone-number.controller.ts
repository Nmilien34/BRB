import type { RequestHandler } from 'express';

export const getPhoneNumbers: RequestHandler = (_req, res) => {
  res.json({ status: 'not implemented' });
};
