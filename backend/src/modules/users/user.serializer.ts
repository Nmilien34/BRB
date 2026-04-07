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
    phoneE164: timestampedUser.phoneE164,
    onboardingStatus: timestampedUser.onboardingStatus,
    selectedAssistantType: timestampedUser.selectedAssistantType ?? null,
    createdAt: timestampedUser.createdAt,
    updatedAt: timestampedUser.updatedAt,
  };
}
