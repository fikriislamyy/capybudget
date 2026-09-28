import { describe, expect, test } from 'bun:test';
import { budgetProgress } from '../../src/personal-finance/money';

describe('budget money calculations', () => {
  test('keeps minor decimal units exact for remaining and progress', () => {
    expect(budgetProgress('1000000.0000', '250000.2500')).toEqual({ remaining: '749999.7500', usedPercent: 25 });
  });
  test('preserves over-budget amounts and percentages above one hundred', () => {
    expect(budgetProgress('100.0000', '125.5000')).toEqual({ remaining: '-25.5000', usedPercent: 125.5 });
  });
  test('rejects invalid limits and excess precision', () => {
    expect(() => budgetProgress('0', '10')).toThrow(RangeError);
    expect(() => budgetProgress('1.00001', '0')).toThrow(RangeError);
  });
});
