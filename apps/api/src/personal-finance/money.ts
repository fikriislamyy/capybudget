function scaled(value: string, scale: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  if (!whole || fraction.length > scale || !/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) throw new RangeError('Invalid decimal amount');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
}

function decimal(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale), whole = value / factor, fraction = (value % factor).toString().padStart(scale, '0');
  return scale ? `${whole}.${fraction}` : whole.toString();
}

export function budgetProgress(limit: string, spent: string) {
  const scale = 4, limitAmount = scaled(limit, scale), spentAmount = scaled(spent, scale);
  if (limitAmount <= 0n) throw new RangeError('Budget limit must be positive');
  const difference = limitAmount - spentAmount;
  const usedPercent = Number((spentAmount * 10000n) / limitAmount) / 100;
  return { remaining: `${difference < 0n ? '-' : ''}${decimal(difference < 0n ? -difference : difference, scale)}`, usedPercent };
}
