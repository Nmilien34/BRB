import type { AssistantType } from '../assistants/assistant.constants.js';

export const onboardingStatuses = [
  'started',
  'profile_created',
  'assistant_selected',
  'assistant_connected',
  'active',
] as const;

export type OnboardingStatus = (typeof onboardingStatuses)[number];

export const onboardingStatusRank: Record<OnboardingStatus, number> = {
  started: 0,
  profile_created: 1,
  assistant_selected: 2,
  assistant_connected: 3,
  active: 4,
};

export function advanceOnboardingStatus(
  currentStatus: OnboardingStatus,
  nextStatus: OnboardingStatus,
): OnboardingStatus {
  return onboardingStatusRank[currentStatus] >= onboardingStatusRank[nextStatus]
    ? currentStatus
    : nextStatus;
}

export interface PublicUser {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  phoneE164: string | null;
  onboardingStatus: OnboardingStatus;
  selectedAssistantType: AssistantType | null;
  createdAt: Date;
  updatedAt: Date;
}
