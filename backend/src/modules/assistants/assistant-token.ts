import { createHmac, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { env } from '../../config/index.js';

const TOKEN_PREVIEW_LENGTH = 8;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;
const DERIVED_KEY_SALT = 'brb-token-enc';

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

function getDerivedEncryptionKey(secret: string): Buffer {
  return scryptSync(secret, DERIVED_KEY_SALT, 32);
}

export function encryptAssistantConnectionToken(rawToken: string, jwtSecret: string): string {
  const key = getDerivedEncryptionKey(jwtSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64url'), encrypted.toString('base64url'), authTag.toString('base64url')].join('.');
}

export function decryptAssistantConnectionToken(ciphertext: string, jwtSecret: string): string | null {
  try {
    const parts = ciphertext.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, dataB64, tagB64] = parts;
    const key = getDerivedEncryptionKey(jwtSecret);
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return decipher.update(Buffer.from(dataB64, 'base64url')) + decipher.final('utf8');
  } catch {
    return null;
  }
}
