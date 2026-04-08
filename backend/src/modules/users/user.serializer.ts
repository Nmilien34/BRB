import type { UserDocument } from './user.model.js';
import type { PublicUser } from './user.constants.js';

type TimestampedUserDocument = UserDocument & {
  createdAt: Date;
  updatedAt: Date;
};

export function serializeUser(user: UserDocument): PublicUser {
  const timestampedUser = user as TimestampedUserDocument;

  return {
    id: timestampedUser.id,
    name: timestampedUser.name ?? null,
    email: timestampedUser.email ?? null,
    emailVerified: timestampedUser.emailVerified ?? false,
    phoneE164: timestampedUser.phoneE164 ?? null,
    onboardingStatus: timestampedUser.onboardingStatus,
    selectedAssistantType: timestampedUser.selectedAssistantType ?? null,
    createdAt: timestampedUser.createdAt,
    updatedAt: timestampedUser.updatedAt,
  };
}
