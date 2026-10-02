import { describe, test, expect } from 'bun:test';
import { parseLocalizedAmount, formatExactAmount } from '../../src/lib/ux/amount';
describe('localized exact money', () => {
  test('preserves precision and grouping across locales', () => {
    expect(parseLocalizedAmount('12.345,6789', 'id')).toBe('12345.6789');
    expect(parseLocalizedAmount('12,345.6789', 'en')).toBe('12345.6789');
    expect(formatExactAmount('99999999999999.0001', 'id')).toBe('99.999.999.999.999,0001');
    expect(formatExactAmount('-123456.7800', 'en')).toBe('-123,456.78');
  });
  test('rejects mixed separators, malformed groups and zero', () => {
    for (const value of ['0', '0,0000', '12.34', '1,234.56', '1.2.345']) expect(parseLocalizedAmount(value,'id')).toBeNull();
    for (const value of ['0.0000', '12,34', '1.234,56', '1,2,345']) expect(parseLocalizedAmount(value,'en')).toBeNull();
  });
});
