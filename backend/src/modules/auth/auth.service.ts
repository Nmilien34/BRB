import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/index.js';
import { HttpError } from '../../utils/httpError.js';
import { normalizeUsPhoneNumber } from '../../utils/phone.js';
import { User } from '../users/user.model.js';
import { advanceOnboardingStatus } from '../users/user.constants.js';
import { serializeUser } from '../users/user.serializer.js';
import { otpNotifier } from './auth.notifier.js';
import { PhoneVerification } from './phone-verification.model.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const JWT_EXPIRES_IN = '30d';
const INVALID_OTP_MESSAGE = 'Invalid or expired verification code.';

interface RequestCodeInput {
  phone: string;
}

interface VerifyCodeInput {
  phone: string;
  code: string;
}

type TimestampedVerification = {
  verifiedAt?: Date | null;
  expiresAt: Date;
  lastSentAt: Date;
  attempts: number;
};

function hashVerificationCode(phoneE164: string, code: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`${phoneE164}:${code}`).digest('hex');
}

function compareVerificationHashes(expectedHash: string, actualHash: string): boolean {
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function isVerificationActive(verification: TimestampedVerification, now: number): boolean {
  return !verification.verifiedAt && verification.expiresAt.getTime() > now;
}

function signAuthToken(userId: string, phoneE164: string): string {
  return jwt.sign({ phoneE164 }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function findOrCreateUser(phoneE164: string) {
  const user = await User.findOneAndUpdate(
    { phoneE164 },
    { $setOnInsert: { phoneE164, onboardingStatus: 'started' } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return user;
}

export async function requestCode({ phone }: RequestCodeInput): Promise<void> {
  const phoneE164 = normalizeUsPhoneNumber(phone);
  const now = Date.now();

  await findOrCreateUser(phoneE164);

  const existingVerification = await PhoneVerification.findOne({ phoneE164 });

  if (
    existingVerification &&
    isVerificationActive(existingVerification, now) &&
    existingVerification.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS > now
  ) {
    throw new HttpError(429, 'Please wait before requesting another code.');
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(now + OTP_EXPIRY_MS);
  const lastSentAt = new Date(now);

  await PhoneVerification.findOneAndUpdate(
    { phoneE164 },
    {
      $set: {
        codeHash: hashVerificationCode(phoneE164, code),
        expiresAt,
        attempts: 0,
        lastSentAt,
      },
      $unset: {
        verifiedAt: 1,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await otpNotifier.sendCode({ phoneE164, code });
}

export async function verifyCode({ phone, code }: VerifyCodeInput) {
  const phoneE164 = normalizeUsPhoneNumber(phone);
  const now = Date.now();
  const verification = await PhoneVerification.findOne({ phoneE164 });

  if (!verification || !isVerificationActive(verification, now) || verification.attempts >= OTP_MAX_ATTEMPTS) {
    throw new HttpError(400, INVALID_OTP_MESSAGE);
  }

  const codeHash = hashVerificationCode(phoneE164, code);

  if (!compareVerificationHashes(verification.codeHash, codeHash)) {
    verification.attempts += 1;

    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      verification.expiresAt = new Date(now);
      await verification.save();
      throw new HttpError(429, 'Too many invalid attempts. Request a new code.');
    }

    await verification.save();
    throw new HttpError(400, INVALID_OTP_MESSAGE);
  }

  verification.verifiedAt = new Date(now);
  verification.expiresAt = new Date(now);
  await verification.save();

  const user = await findOrCreateUser(phoneE164);

  user.onboardingStatus = advanceOnboardingStatus(user.onboardingStatus, 'mobile_verified');
  await user.save();

  return {
    token: signAuthToken(user.id, user.phoneE164),
    user: serializeUser(user),
  };
}
