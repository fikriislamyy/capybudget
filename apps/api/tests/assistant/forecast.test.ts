import { describe, expect, test } from 'bun:test';
import { hasUnresolvedSourceOverlap, projectCashflow } from '../../src/assistant/forecast';
import { historicalDailyAverages } from '../../src/assistant/history';
import { fromUnits, toUnits } from '../../src/assistant/money';
import { addMoney, compareMoney } from '../../src/business/money';

const account = (overrides: Partial<Parameters<typeof projectCashflow>[0]['accounts'][number]> = {}) => ({
  id: 'cash', name: 'Cash', balance: '3000000.0000', currency: 'IDR',
  protectedAmount: '0.0000', lowBalanceThreshold: '0.0000',
  dailyExpenseAverage: '20000.0000', dailyIncomeAverage: '0.0000', ...overrides
});

describe('assistant forecast calculation', () => {
  test('flags matching unlinked source movements without silently removing either one',()=>{
    const bill={id:'bill:1',date:'2026-01-10',accountId:'cash',amount:'-500.0000',kind:'bill' as const,description:'Rent'};
    const transaction={id:'journal:1',date:'2026-01-10',accountId:'cash',amount:'-500.0000',kind:'transaction' as const,description:'Recorded rent'};
    expect(hasUnresolvedSourceOverlap([bill,transaction])).toBe(true);
    expect(hasUnresolvedSourceOverlap([bill,{...transaction,date:'2026-01-11'}])).toBe(false);
    expect(hasUnresolvedSourceOverlap([bill,{...transaction,amount:'500.0000'}])).toBe(false);
    expect(hasUnresolvedSourceOverlap([bill])).toBe(false);
  });

  test('matches the documented safe-to-spend example and ignores an unreceived invoice conservatively', () => {
    const result = projectCashflow({
      today: '2026-01-01', horizonDays: 30,
      accounts: [account({ protectedAmount: '0.0000' })],
      workspaceProtectedAmount: '400000.0000',
      events: [
        { id: 'rent', date: '2026-01-02', accountId: 'cash', amount: '-1000000.0000', kind: 'bill', description: 'Rent' },
        { id: 'invoice', date: '2026-01-03', accountId: 'cash', amount: '2000000.0000', kind: 'invoice', description: 'Unpaid invoice' }
      ]
    });
    expect(result.minimumBalance).toBe('1400000.0000');
    expect(result.safeToSpend).toBe('1000000.0000');
    expect(result.points.find((point) => point.date === '2026-01-03' && point.scenario === 'conservative')?.closingBalance).toBe('1960000.0000');
  });

  test('returns zero, not a negative spend allowance, when the conservative path goes below zero', () => {
    const result = projectCashflow({ today: '2026-01-01', horizonDays: 30, accounts: [account({ balance: '100.0000', dailyExpenseAverage: '0.0000' })], events: [{ id: 'bill', date: '2026-01-02', accountId: 'cash', amount: '-150.0000', kind: 'bill', description: 'Bill' }] });
    expect(result.minimumBalance).toBe('-50.0000');
    expect(result.safeToSpend).toBe('0.0000');
    expect(result.firstShortfallDate).toBe('2026-01-02');
  });

  test('does not combine different currencies and marks incomplete inputs as unsupported', () => {
    expect(() => projectCashflow({ today: '2026-01-01', horizonDays: 30, accounts: [account(), account({ id: 'usd', currency: 'USD' })], events: [] })).toThrow(RangeError);
    const result = projectCashflow({ today: '2026-01-01', horizonDays: 30, accounts: [account()], events: [], startingQualityFlags: ['unassigned_bill_account'] });
    expect(result.safeToSpend).toBeNull();
    expect(result.safeToSpendReason).toBe('incomplete_data');
  });

  test('keeps transfers neutral in aggregate cashflow and excludes out-of-range events', () => {
    const result = projectCashflow({
      today: '2026-01-01', horizonDays: 30,
      accounts: [account({ balance: '1000.0000', dailyExpenseAverage: '0.0000' }), account({ id: 'bank', balance: '0.0000', dailyExpenseAverage: '0.0000' })],
      events: [
        { id: 'out', date: '2026-01-02', accountId: 'cash', amount: '-100.0000', kind: 'transfer', description: 'Transfer out' },
        { id: 'in', date: '2026-01-02', accountId: 'bank', amount: '100.0000', kind: 'transfer', description: 'Transfer in' },
        { id: 'late', date: '2026-02-01', accountId: 'cash', amount: '-500.0000', kind: 'bill', description: 'Outside horizon' }
      ]
    });
    expect(result.points.find((point) => point.date === '2026-01-02' && point.scenario === 'base')?.closingBalance).toBe('1000.0000');
    expect(result.rows.find((point) => point.date === '2026-01-02' && point.accountId === 'cash' && point.scenario === 'base')?.closingBalance).toBe('900.0000');
    expect(result.rows.find((point) => point.date === '2026-01-02' && point.accountId === 'bank' && point.scenario === 'base')?.closingBalance).toBe('100.0000');
    expect(result.points.find((point) => point.date === '2026-01-02' && point.scenario === 'conservative')?.closingBalance).toBe('1000.0000');
  });

  test('counts a transfer across the selected forecast boundary as cash leaving the included pool', () => {
    const result = projectCashflow({
      today: '2026-01-01', horizonDays: 30,
      accounts: [account({ balance: '1000.0000', dailyExpenseAverage: '0.0000' })],
      events: [{ id: 'to-excluded-savings', date: '2026-01-02', accountId: 'cash', amount: '-100.0000', kind: 'transfer', description: 'Transfer to excluded savings' }]
    });
    expect(result.points.find((point) => point.date === '2026-01-02' && point.scenario === 'base')?.closingBalance).toBe('900.0000');
    expect(result.points.find((point) => point.date === '2026-01-02' && point.scenario === 'conservative')?.closingBalance).toBe('900.0000');
  });

  test('uses the conservative within-day minimum before income arrives', () => {
    const result = projectCashflow({
      today: '2026-01-01', horizonDays: 30,
      accounts: [account({ balance: '100.0000', dailyExpenseAverage: '0.0000' })],
      events: [
        { id: 'salary', date: '2026-01-02', accountId: 'cash', amount: '1000.0000', kind: 'transaction', description: 'Recorded income' },
        { id: 'rent', date: '2026-01-02', accountId: 'cash', amount: '-500.0000', kind: 'bill', description: 'Rent' }
      ]
    });
    const conservative = result.points.find((point) => point.date === '2026-01-02' && point.scenario === 'conservative')!;
    expect(conservative.minimumBalance).toBe('-400.0000');
    expect(result.firstShortfallDate).toBe('2026-01-02');
  });

  test('slices calendar horizons consistently across leap day and end date', () => {
    const result = projectCashflow({ today: '2024-02-01', horizonDays: 30, accounts: [account({ dailyExpenseAverage: '0.0000' })], events: [] });
    expect(result.endDate).toBe('2024-03-02');
    expect(result.points[0]?.date).toBe('2024-02-01');
    expect(result.points.at(-1)?.date).toBe('2024-03-02');
    expect(result.points).toHaveLength(62);
  });

  test('30 and 60 day results are prefixes of the same 90 day run',()=>{
    const input={today:'2026-01-01',accounts:[account({balance:'10000.0000',dailyExpenseAverage:'12.3457',dailyIncomeAverage:'2.1111'})],events:[{id:'bill',date:'2026-01-18',accountId:'cash',amount:'-50.0000',kind:'bill' as const,description:'Rent'}]};
    const full=projectCashflow({...input,horizonDays:90});
    for(const horizonDays of [30,60] as const){
      const partial=projectCashflow({...input,horizonDays});
      const prefix=full.points.filter((point)=>point.date<=partial.endDate);
      expect(partial.points).toEqual(prefix);
    }
  });
});

describe('assistant history baseline',()=>{
  test('includes zero activity days and caps old accounts at the 90 completed day window',()=>{
    expect(historicalDailyAverages({today:'2026-01-01',openingDate:'2025-01-01',expenses:'10.0000',income:'10.0000'})).toEqual({eligibleDays:90,dailyExpenseAverage:'0.1112',dailyIncomeAverage:'0.1111'});
  });

  test('uses the exact number of eligible days after opening and requires 28 days',()=>{
    expect(historicalDailyAverages({today:'2026-01-29',openingDate:'2026-01-01',expenses:'0.0001',income:'0.0001'})).toEqual({eligibleDays:28,dailyExpenseAverage:'0.0001',dailyIncomeAverage:'0.0000'});
    expect(historicalDailyAverages({today:'2026-01-28',openingDate:'2026-01-01',expenses:'5.0000',income:'2.0000'})).toEqual({eligibleDays:27,dailyExpenseAverage:null,dailyIncomeAverage:null});
  });

  test('rounds fractional daily expenses up and income down in minor units',()=>{
    expect(historicalDailyAverages({today:'2026-03-02',openingDate:'2026-01-01',expenses:'0.0001',income:'0.0060'})).toEqual({eligibleDays:60,dailyExpenseAverage:'0.0001',dailyIncomeAverage:'0.0001'});
  });
});

describe('assistant decimal money', () => {
  test('supports database numeric strings, signed balances, exact subtraction and rejects excess precision', () => {
    expect(fromUnits(toUnits('1000.0000'))).toBe('1000.0000');
    expect(fromUnits(toUnits('-0.0001', true) - toUnits('0.0002'))).toBe('-0.0003');
    expect(() => toUnits('1.00001')).toThrow(RangeError);
    expect(() => fromUnits(10n ** 19n)).toThrow(RangeError);
  });

  test('rejects an aggregate forecast balance outside NUMERIC(19,4)',()=>{
    const maximum='999999999999999.9999';
    expect(()=>projectCashflow({today:'2026-01-01',horizonDays:30,accounts:[account({id:'one',balance:maximum}),account({id:'two',balance:maximum})],events:[]})).toThrow('Monetary value exceeds numeric(19,4)');
  });
});

describe('invoice currency precision', () => {
  test('accepts NUMERIC(19,4) zero padding for zero-decimal currencies only', () => {
    expect(compareMoney('1000.0000', '0.0000', 0)).toBe(1);
    expect(addMoney('1000.0000', '-400.0000', 0)).toBe('600');
    expect(() => compareMoney('1000.0001', '1000.0000', 0)).toThrow();
  });
});
