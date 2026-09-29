import { describe, expect, test } from 'bun:test';
import { chooseCategoryRule, normalizeMerchant } from '../../src/assistant/categorization';

describe('assistant category learning rules',()=>{
  test('normalizes unicode, whitespace, and case while retaining merchant digits',()=>{
    expect(normalizeMerchant('  Cafe\u00a0   24  ')).toBe('cafe 24');
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant('X'.repeat(240))).toHaveLength(200);
  });

  test('prefers explicit rules and abstains below learned support or agreement',()=>{
    const learned={origin:'learned' as const,supportCount:3,acceptedCount:2,id:'learned'};
    expect(chooseCategoryRule([learned])).toBeUndefined();
    expect(chooseCategoryRule([{...learned,acceptedCount:3}])?.id).toBe('learned');
    expect(chooseCategoryRule([{...learned,origin:'explicit' as const,id:'explicit'},{...learned,acceptedCount:3}])?.id).toBe('explicit');
  });
});
