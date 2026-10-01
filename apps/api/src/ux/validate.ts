export type Theme = 'light' | 'dark' | 'system';
export type UxLocale = 'en' | 'id';
export type UsageType = 'personal' | 'business' | 'both';
export type OnboardingStep = 'usage' | 'details' | 'account' | 'goal' | 'done';

export const THEMES: Theme[] = ['light', 'dark', 'system'];
export const UX_LOCALES: UxLocale[] = ['en', 'id'];
export const USAGE_TYPES: UsageType[] = ['personal', 'business', 'both'];
export const ONBOARDING_STEPS: OnboardingStep[] = ['usage', 'details', 'account', 'goal', 'done'];

export const DEFAULT_PREFERENCES = { theme: 'system', locale: 'en', customized: false } as const;

const currencyRe = /^[A-Z]{3}$/;

export function normalizeCurrency(value: unknown, fallback = 'IDR'): string {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return currencyRe.test(upper) ? upper : fallback;
}

export function parsePreferences(body: unknown): { theme: Theme; locale: UxLocale } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.theme !== undefined && !THEMES.includes(b.theme as Theme)) throw new Error('Choose a valid theme.');
  if (b.locale !== undefined && !UX_LOCALES.includes(b.locale as UxLocale)) throw new Error('Choose a valid language.');
  return {
    theme: (b.theme as Theme | undefined) ?? (DEFAULT_PREFERENCES.theme as Theme),
    locale: (b.locale as UxLocale | undefined) ?? (DEFAULT_PREFERENCES.locale as UxLocale)
  };
}

export function parseOnboardingProgress(body: unknown): { usageType?: UsageType; currency?: string; language?: UxLocale; currentStep?: OnboardingStep } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: { usageType?: UsageType; currency?: string; language?: UxLocale; currentStep?: OnboardingStep } = {};
  if (b.usageType !== undefined) {
    if (!USAGE_TYPES.includes(b.usageType as UsageType)) throw new Error('Choose personal, business, or both.');
    out.usageType = b.usageType as UsageType;
  }
  if (b.currency !== undefined) out.currency = normalizeCurrency(b.currency);
  if (b.language !== undefined) {
    if (!UX_LOCALES.includes(b.language as UxLocale)) throw new Error('Choose a valid language.');
    out.language = b.language as UxLocale;
  }
  if (b.currentStep !== undefined) {
    if (!ONBOARDING_STEPS.includes(b.currentStep as OnboardingStep) || b.currentStep === 'done') throw new Error('Choose a valid onboarding step.');
    out.currentStep = b.currentStep as OnboardingStep;
  }
  return out;
}

export function parseProvision(body: unknown): { usageType: UsageType; currency: string; language: UxLocale; businessName: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!USAGE_TYPES.includes(b.usageType as UsageType)) throw new Error('Choose personal, business, or both.');
  const businessName = typeof b.businessName === 'string' ? b.businessName.trim().slice(0, 100) : '';
  return { usageType: b.usageType as UsageType, currency: normalizeCurrency(b.currency), language: UX_LOCALES.includes(b.language as UxLocale) ? (b.language as UxLocale) : 'en', businessName };
}

/** Step order guard: the wizard may only move forward one step (or repeat the current one). */
export function isStepAdvance(current: OnboardingStep, next: OnboardingStep): boolean {
  return ONBOARDING_STEPS.indexOf(next) <= ONBOARDING_STEPS.indexOf(current) + 1;
}
