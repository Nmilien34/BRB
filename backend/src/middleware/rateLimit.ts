import type { RequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  key: string;
  maxRequests: number;
  windowMs: number;
  message: string;
}

const requestBuckets = new Map<string, RateLimitBucket>();

export function createIpRateLimit({
  key,
  maxRequests,
  windowMs,
  message,
}: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${key}:${req.ip}`;
    const existingBucket = requestBuckets.get(bucketKey);

    if (!existingBucket || existingBucket.resetAt <= now) {
      requestBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (existingBucket.count >= maxRequests) {
      res.setHeader('Retry-After', Math.ceil((existingBucket.resetAt - now) / 1000));
      return next(new HttpError(429, message));
    }

    existingBucket.count += 1;
    requestBuckets.set(bucketKey, existingBucket);
    next();
  };
}
