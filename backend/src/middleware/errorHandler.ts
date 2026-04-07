import type { ErrorRequestHandler } from 'express';
import { logger } from '../utils/index.js';
import { env } from '../config/index.js';

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  details?: unknown;
}

export const errorHandler: ErrorRequestHandler = (err: AppError, _req, res, _next) => {
  logger.error(err, 'Unhandled error');

  const statusCode = err.status ?? err.statusCode ?? 500;

  res.status(statusCode).json({
    error: {
      message: err.message ?? 'Internal Server Error',
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};
