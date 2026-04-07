import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

export const getHealth: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
};
