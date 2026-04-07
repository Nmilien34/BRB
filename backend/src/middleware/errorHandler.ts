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
  const errorResponse: { message: string; details?: unknown; stack?: string } = {
    message: err.message ?? 'Internal Server Error',
  };

  if (err.details !== undefined) {
    errorResponse.details = err.details;
  }

  if (env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json({
    error: errorResponse,
  });
};
