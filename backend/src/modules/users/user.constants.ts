import type { AssistantType } from '../assistants/assistant.constants.js';

export const onboardingStatuses = [
  'started',
  'mobile_verified',
  'assistant_selected',
  'active',
] as const;

export type OnboardingStatus = (typeof onboardingStatuses)[number];

export const onboardingStatusRank: Record<OnboardingStatus, number> = {
  started: 0,
  mobile_verified: 1,
  assistant_selected: 2,
  active: 3,
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
  phoneE164: string;
  onboardingStatus: OnboardingStatus;
  selectedAssistantType: AssistantType | null;
  createdAt: Date;
  updatedAt: Date;
}
