import {describe,test,expect} from 'bun:test';
import {parseDefinition,reportPeriod,comparisonPeriod} from '../../src/reports/definitions';
import {nextReportSend} from '../../src/reports/schedules';

describe('V2 report contracts',()=>{
 test('rejects malicious queries and unsupported schema versions',()=>{
  for(const definition of [{sql:'drop table accounts'},{version:2},{groupBy:'merchant;delete'},{accountIds:['x']},{currency:'idr'},{reportType:'unknown'}])expect(()=>parseDefinition(definition,'IDR')).toThrow();
 });
 test('validates real dates, exclusive end, duration and future boundaries',()=>{
  const now=new Date('2026-10-07T04:00:00Z');
  expect(reportPeriod(parseDefinition({preset:'custom',from:'2026-09-01',toExclusive:'2026-10-01'},'IDR'),'Asia/Jakarta',now)).toMatchObject({from:'2026-09-01',through:'2026-09-30'});
  for(const [from,toExclusive] of [['2026-02-30','2026-03-02'],['2026-01-01','2026-01-01'],['2024-01-01','2026-01-01'],['2026-10-07','2026-10-09']])expect(()=>reportPeriod(parseDefinition({preset:'custom',from,toExclusive},'IDR'),'Asia/Jakarta',now)).toThrow();
 });
 test('equal-length prior periods and calendar-year leap boundaries',()=>{
  expect(comparisonPeriod({from:'2026-03-01',toExclusive:'2026-04-01'},'previous_period')).toEqual({from:'2026-01-29',toExclusive:'2026-03-01'});
  expect(comparisonPeriod({from:'2024-02-01',toExclusive:'2024-03-01'},'previous_year')).toEqual({from:'2023-02-01',toExclusive:'2023-03-01'});
  expect(comparisonPeriod({from:'2024-02-29',toExclusive:'2024-03-01'},'previous_year')).toEqual({from:'2023-02-28',toExclusive:'2023-03-01'});
 });
 test('business statements reject partial ledger or currency filters',()=>{
  expect(()=>parseDefinition({reportType:'balance_sheet',currency:'USD'},'IDR')).toThrow();
  expect(()=>parseDefinition({reportType:'profit_loss',accountIds:['00000000-0000-4000-8000-000000000001']},'IDR')).toThrow();
  expect(()=>parseDefinition({reportType:'tax',basis:'cash'},'IDR')).toThrow();
 });
 test('timezone schedule uses next complete boundary and does not schedule repeatedly on same day',()=>{
  expect(nextReportSend('Asia/Jakarta','monthly','09:00',new Date('2026-10-01T01:00:00Z')).toISOString()).toBe('2026-10-01T02:00:00.000Z');
  expect(nextReportSend('Asia/Jakarta','monthly','09:00',new Date('2026-10-01T02:01:00Z')).toISOString()).toBe('2026-11-01T02:00:00.000Z');
  expect(nextReportSend('America/New_York','monthly','09:00',new Date('2026-10-07T00:00:00Z')).toISOString()).toBe('2026-11-01T14:00:00.000Z');
  expect(()=>nextReportSend('Not/AZone','monthly','09:00')).toThrow();
 });
});
