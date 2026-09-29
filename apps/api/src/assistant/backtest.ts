import { ceilDivide, fromUnits, toUnits } from './money';

export type BacktestObservation = {
  horizonDays: 30 | 60 | 90;
  scenario: 'base' | 'conservative';
  currency: string;
  predicted: string;
  actual: string;
};

const PERCENT_DENOMINATOR_FLOOR = toUnits('1.0000');

/** Summarize held-out forecast points. Percentage error is omitted for actual
 * balances below one major currency unit; those observations remain in MAE. */
export function summarizeBacktest(observations: BacktestObservation[]) {
  const groups = new Map<string, {
    horizonDays: 30 | 60 | 90;
    scenario: 'base' | 'conservative';
    currency: string;
    absoluteErrorUnits: bigint;
    observations: number;
    percentageErrorTotal: number;
    percentageObservations: number;
    nearZeroActuals: number;
  }>();

  for (const observation of observations) {
    if (![30, 60, 90].includes(observation.horizonDays)
      || !['base', 'conservative'].includes(observation.scenario)
      || !/^[A-Z]{3}$/.test(observation.currency)) {
      throw new RangeError('Invalid backtest observation');
    }
    const key = `${observation.horizonDays}|${observation.scenario}|${observation.currency}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        horizonDays: observation.horizonDays,
        scenario: observation.scenario,
        currency: observation.currency,
        absoluteErrorUnits: 0n,
        observations: 0,
        percentageErrorTotal: 0,
        percentageObservations: 0,
        nearZeroActuals: 0
      };
      groups.set(key, group);
    }
    const error = toUnits(observation.predicted, true) - toUnits(observation.actual, true);
    const absoluteError = error < 0n ? -error : error;
    const actual = toUnits(observation.actual, true);
    const absoluteActual = actual < 0n ? -actual : actual;
    group.absoluteErrorUnits += absoluteError;
    group.observations++;
    if (absoluteActual < PERCENT_DENOMINATOR_FLOOR) {
      group.nearZeroActuals++;
    } else {
      group.percentageErrorTotal += Number(absoluteError) / Number(absoluteActual) * 100;
      group.percentageObservations++;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.horizonDays - b.horizonDays || a.scenario.localeCompare(b.scenario) || a.currency.localeCompare(b.currency))
    .map((group) => ({
      horizonDays: group.horizonDays,
      scenario: group.scenario,
      currency: group.currency,
      observations: group.observations,
      meanAbsoluteError: fromUnits(ceilDivide(group.absoluteErrorUnits, BigInt(group.observations))),
      percentageErrorDenominatorFloor: '1.0000',
      meanAbsolutePercentageError: group.percentageObservations
        ? (group.percentageErrorTotal / group.percentageObservations).toFixed(2)
        : null,
      percentageObservations: group.percentageObservations,
      nearZeroActuals: group.nearZeroActuals
    }));
}
