import type { Request, RequestHandler } from 'express';
import { User } from '../users/user.model.js';
import { HttpError } from '../../utils/httpError.js';
import { AssistantConnection } from './assistant-connection.model.js';
import type { AssistantConnectionDocument } from './assistant-connection.model.js';
import { hashAssistantConnectionToken } from './assistant-token.js';

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

export const requireClaudeBridgeAuth: RequestHandler = async (req, _res, next) => {
  try {
    const rawToken = extractBearerToken(req.headers.authorization);

    if (!rawToken) {
      throw new HttpError(401, 'Authentication required.');
    }

    const connection = await AssistantConnection.findOne({
      connectionTokenHash: hashAssistantConnectionToken(rawToken),
    });

    if (!connection) {
      throw new HttpError(401, 'Authentication required.');
    }

    const user = await User.findById(connection.userId);

    if (!user) {
      throw new HttpError(401, 'Authentication required.');
    }

    req.user = user;
    req.assistantConnection = connection;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireAssistantConnection(req: Request): AssistantConnectionDocument {
  if (!req.assistantConnection) {
    throw new HttpError(401, 'Authentication required.');
  }

  return req.assistantConnection;
}
