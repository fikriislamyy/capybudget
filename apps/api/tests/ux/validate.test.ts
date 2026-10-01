import { describe, expect, test } from 'bun:test';
import { isStepAdvance, normalizeCurrency, parseOnboardingProgress, parsePreferences, parseProvision } from '../../src/ux/validate';

describe('parsePreferences', () => {
  test('accepts valid theme and locale', () => {
    expect(parsePreferences({ theme: 'dark', locale: 'id' })).toEqual({ theme: 'dark', locale: 'id' });
  });
  test('fills defaults for missing fields', () => {
    expect(parsePreferences({})).toEqual({ theme: 'system', locale: 'en' });
  });
  test('rejects unknown theme or locale', () => {
    expect(() => parsePreferences({ theme: 'neon' })).toThrow();
    expect(() => parsePreferences({ locale: 'fr' })).toThrow();
  });
});

describe('normalizeCurrency', () => {
  test('uppercases valid codes and falls back otherwise', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('nope')).toBe('IDR');
    expect(normalizeCurrency(undefined, 'EUR')).toBe('EUR');
  });
});

describe('parseOnboardingProgress', () => {
  test('accepts a step save', () => {
    expect(parseOnboardingProgress({ usageType: 'both', currency: 'usd', language: 'id', currentStep: 'details' }))
      .toEqual({ usageType: 'both', currency: 'USD', language: 'id', currentStep: 'details' });
  });
  test('rejects bad usage type, language, or done step', () => {
    expect(() => parseOnboardingProgress({ usageType: 'family' })).toThrow();
    expect(() => parseOnboardingProgress({ language: 'fr' })).toThrow();
    expect(() => parseOnboardingProgress({ currentStep: 'done' })).toThrow();
  });
});

describe('parseProvision', () => {
  test('requires a usage type and normalizes the rest', () => {
    expect(parseProvision({ usageType: 'business', currency: 'eur', businessName: '  Toko  ' }))
      .toEqual({ usageType: 'business', currency: 'EUR', language: 'en', businessName: 'Toko' });
    expect(() => parseProvision({})).toThrow();
  });
});

describe('isStepAdvance', () => {
  test('allows repeat or next step only', () => {
    expect(isStepAdvance('usage', 'usage')).toBe(true);
    expect(isStepAdvance('usage', 'details')).toBe(true);
    expect(isStepAdvance('usage', 'goal')).toBe(false);
    expect(isStepAdvance('account', 'usage')).toBe(true);
  });
});
