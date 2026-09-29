import { ceilDivide, fromUnits, toUnits } from './money';

export type HistoricalDailyAverages = {
  eligibleDays: number;
  dailyExpenseAverage: string | null;
  dailyIncomeAverage: string | null;
};

/** Compute per-calendar-day history averages for the 90 completed local days
 * before today. Missing activity days remain in the denominator. */
export function historicalDailyAverages(input: {
  today: string;
  openingDate: string;
  expenses: string;
  income: string;
}): HistoricalDailyAverages {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today) || !/^\d{4}-\d{2}-\d{2}$/.test(input.openingDate)) {
    throw new RangeError('Invalid history date');
  }
  const today = new Date(`${input.today}T00:00:00.000Z`);
  const opening = new Date(`${input.openingDate}T00:00:00.000Z`);
  if (Number.isNaN(today.valueOf()) || Number.isNaN(opening.valueOf()) || today.toISOString().slice(0, 10) !== input.today || opening.toISOString().slice(0, 10) !== input.openingDate) {
    throw new RangeError('Invalid history date');
  }
  const elapsedDays = Math.floor((today.valueOf() - opening.valueOf()) / 86_400_000);
  const eligibleDays = Math.max(0, Math.min(90, elapsedDays));
  if (eligibleDays < 28) return { eligibleDays, dailyExpenseAverage: null, dailyIncomeAverage: null };

  const denominator = BigInt(eligibleDays);
  const expenseUnits = toUnits(input.expenses);
  const incomeUnits = toUnits(input.income);
  return {
    eligibleDays,
    dailyExpenseAverage: fromUnits(ceilDivide(expenseUnits, denominator)),
    dailyIncomeAverage: fromUnits(incomeUnits / denominator)
  };
}
