import jwt from 'jsonwebtoken';
import { env } from '../../config/index.js';
import { User } from '../users/user.model.js';
import { advanceOnboardingStatus } from '../users/user.constants.js';
import { serializeUser } from '../users/user.serializer.js';

const JWT_EXPIRES_IN = '30d';

interface StartAuthInput {
  name: string;
  email: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function signAuthToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: JWT_EXPIRES_IN,
  });
}

export async function startAuth({ name, email }: StartAuthInput) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = name.trim();
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      emailVerified: false,
      onboardingStatus: 'profile_created',
    });
  } else {
    let shouldSave = false;

    if (!user.name || user.name.trim().length === 0) {
      user.name = normalizedName;
      shouldSave = true;
    }

    const nextOnboardingStatus = advanceOnboardingStatus(user.onboardingStatus, 'profile_created');

    if (user.onboardingStatus !== nextOnboardingStatus) {
      user.onboardingStatus = nextOnboardingStatus;
      shouldSave = true;
    }

    if (shouldSave) {
      await user.save();
    }
  }

  return {
    token: signAuthToken(user.id),
    user: serializeUser(user),
  };
}
