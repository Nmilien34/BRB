import type { Request, RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/index.js';
import { User } from '../modules/users/user.model.js';
import type { UserDocument } from '../modules/users/user.model.js';
import { HttpError } from '../utils/httpError.js';

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new HttpError(401, 'Authentication required.');
    }

    let payload: JwtPayload | string;

    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'Invalid or expired token.');
    }

    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new HttpError(401, 'Invalid or expired token.');
    }

    const user = await User.findById(payload.sub);

    if (!user) {
      throw new HttpError(401, 'Invalid or expired token.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireAuthenticatedUser(req: Request): UserDocument {
  if (!req.user) {
    throw new HttpError(401, 'Authentication required.');
  }

  return req.user;
}
