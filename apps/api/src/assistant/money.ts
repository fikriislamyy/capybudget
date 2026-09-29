const SCALE = 4;
const FACTOR = 10n ** BigInt(SCALE);
const MAX_UNITS = 10n ** 19n - 1n;

export function toUnits(value: string, signed = false): bigint {
  const expression = signed ? /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/ : /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/;
  if (typeof value !== 'string' || !expression.test(value)) throw new RangeError('Invalid monetary value');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const amount = BigInt(whole!) * FACTOR + BigInt((fraction + '0000').slice(0, 4));
  return negative ? -amount : amount;
}

export function fromUnits(value: bigint): string {
  if (value > MAX_UNITS || value < -MAX_UNITS) throw new RangeError('Monetary value exceeds numeric(19,4)');
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / FACTOR}.${(absolute % FACTOR).toString().padStart(SCALE, '0')}`;
}

export function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('Expected a non-negative amount and positive divisor');
  return (numerator + denominator - 1n) / denominator;
}
