import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/index.js';

const TOKEN_PREVIEW_LENGTH = 8;

export function hashAssistantConnectionToken(rawToken: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(rawToken).digest('hex');
}

export function generateAssistantConnectionToken() {
  const rawToken = randomBytes(32).toString('base64url');

  return {
    rawToken,
    tokenHash: hashAssistantConnectionToken(rawToken),
    tokenPreview: rawToken.slice(0, TOKEN_PREVIEW_LENGTH),
  };
}
