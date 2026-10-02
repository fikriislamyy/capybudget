export const ONBOARDING_STEPS = ['usage', 'details', 'account', 'goal'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingState = {
  completed: boolean;
  usageType: 'personal' | 'business' | 'both' | null;
  currency: string;
  language: 'en' | 'id';
  currentStep: OnboardingStep;
  firstWorkspaceId: string | null;
};

export function parseOnboardingState(value: unknown): OnboardingState {
  if (!value || typeof value !== 'object') throw new Error('Invalid onboarding status');
  const state = value as Record<string, unknown>;
  if (typeof state.completed !== 'boolean') throw new Error('Invalid onboarding status');
  const step = ONBOARDING_STEPS.includes(state.currentStep as OnboardingStep)
    ? state.currentStep as OnboardingStep : 'usage';
  const usage = state.usageType;
  return {
    completed: state.completed,
    usageType: usage === 'personal' || usage === 'business' || usage === 'both' ? usage : null,
    currency: typeof state.currency === 'string' ? state.currency : 'IDR',
    language: state.language === 'id' ? 'id' : 'en',
    currentStep: step,
    firstWorkspaceId: typeof state.firstWorkspaceId === 'string' ? state.firstWorkspaceId : null,
  };
}
