import Decimal from 'decimal.js';
export const Money = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
export function positive(value: unknown, scale = 4): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,14})(\.\d{1,12})?$/.test(value)) throw Object.assign(new Error('Enter a positive decimal amount.'), { status: 422 });
  const n = new Money(value);
  if (!n.gt(0) || n.decimalPlaces() > scale) throw Object.assign(new Error(`Use a positive amount with at most ${scale} decimal places.`), { status: 422 });
  return n.toFixed(scale);
}
export function currencyScale(currency: string) { return Math.min(4, new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2); }
export function converted(amount: string, rate: string, currency: string) { return positive(new Money(amount).mul(positive(rate, 12)).toFixed(currencyScale(currency))); }
export function allocations(total: string, parts: { amount: string }[]) {
  if (parts.length < 2 || parts.length > 30) throw Object.assign(new Error('Use between 2 and 30 allocations.'), { status: 422 });
  const sum = parts.reduce((s, p) => s.add(positive(p.amount)), new Money(0));
  if (!sum.eq(positive(total))) throw Object.assign(new Error('Split amounts must add up exactly to the transaction total.'), { status: 422 });
}
