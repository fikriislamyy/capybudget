import Decimal from 'decimal.js';
import { currencyScale } from './currency';

const Money = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
export type TaxPolicy = {
  rate: string; baseNumerator: number; baseDenominator: number; inclusive: boolean;
};

/** Keep the statutory rate and tax-base fraction separate, with one final rounding. */
export function calculateTax(amount: string, currency: string, policy: TaxPolicy) {
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(amount)
    || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(policy.rate)
    || new Money(policy.rate).gt(100)
    || !Number.isSafeInteger(policy.baseNumerator) || !Number.isSafeInteger(policy.baseDenominator)
    || policy.baseNumerator < 1 || policy.baseDenominator < 1
    || policy.baseNumerator > policy.baseDenominator || policy.baseDenominator > 1000000
    || typeof policy.inclusive !== 'boolean') {
    throw Object.assign(new Error('Enter a valid amount, rate, and tax-base fraction.'), { status: 422, code: 'INVALID_TAX_POLICY' });
  }
  const scale = currencyScale(currency), gross = new Money(amount);
  if (!gross.eq(gross.toDecimalPlaces(scale))) {
    throw Object.assign(new Error('The amount exceeds this currency’s decimal precision.'), { status: 422, code: 'INVALID_TAX_AMOUNT' });
  }
  const effective = new Money(policy.rate).times(policy.baseNumerator).div(policy.baseDenominator).div(100);
  const tax = (policy.inclusive ? gross.minus(gross.div(effective.plus(1))) : gross.times(effective)).toDecimalPlaces(scale);
  const net = policy.inclusive ? gross.minus(tax) : gross;
  return { effectiveRate: effective.times(100).toFixed(4), net: net.toFixed(scale), tax: tax.toFixed(scale), total: net.plus(tax).toFixed(scale) };
}
