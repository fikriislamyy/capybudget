import { describe, expect, test } from 'bun:test';
import { summarizeBacktest } from '../../src/assistant/backtest';

describe('historical forecast backtest metrics', () => {
  test('reports absolute error by horizon and omits percentage errors near zero', () => {
    expect(summarizeBacktest([
      { horizonDays: 30, scenario: 'base', currency: 'IDR', predicted: '0.0000', actual: '0.0000' },
      { horizonDays: 30, scenario: 'base', currency: 'IDR', predicted: '9.0000', actual: '10.0000' },
      { horizonDays: 30, scenario: 'base', currency: 'IDR', predicted: '1.0000', actual: '0.5000' },
      { horizonDays: 60, scenario: 'conservative', currency: 'IDR', predicted: '80.0000', actual: '100.0000' }
    ])).toEqual([
      {
        horizonDays: 30,
        scenario: 'base',
        currency: 'IDR',
        observations: 3,
        meanAbsoluteError: '0.5000',
        percentageErrorDenominatorFloor: '1.0000',
        meanAbsolutePercentageError: '10.00',
        percentageObservations: 1,
        nearZeroActuals: 2
      },
      {
        horizonDays: 60,
        scenario: 'conservative',
        currency: 'IDR',
        observations: 1,
        meanAbsoluteError: '20.0000',
        percentageErrorDenominatorFloor: '1.0000',
        meanAbsolutePercentageError: '20.00',
        percentageObservations: 1,
        nearZeroActuals: 0
      }
    ]);
  });

  test('returns null percentage error when every actual is near zero', () => {
    expect(summarizeBacktest([
      { horizonDays: 90, scenario: 'conservative', currency: 'USD', predicted: '5.0000', actual: '0.0000' }
    ])[0]?.meanAbsolutePercentageError).toBeNull();
  });
});
