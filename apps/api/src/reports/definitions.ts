import { resolveReportPeriod } from './periods';
import { workspaceToday } from '../tracking/recurrence';

export const reportKinds = ['analytics', 'cashflow', 'budget_actual', 'profit_loss', 'balance_sheet', 'tax'] as const;
export type ReportKind = typeof reportKinds[number];
export type Definition = {
  version: 1; reportType: ReportKind; preset: string; currency: string; basis: 'cash' | 'accrual';
  from?: string; toExclusive?: string; comparison: 'none' | 'previous_period' | 'previous_year';
  groupBy: 'day' | 'month' | 'category' | 'account'; sort: 'date' | 'amount_desc';
  accountIds: string[]; categoryIds: string[]; tagIds:string[];
};
export function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 422, code: 'INVALID_REPORT' });
}
export function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid('Choose a valid calendar date.');
  return value;
}
export const shiftDate = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export function reportPeriod(definition: Definition, timezone: string, now = new Date()) {
  if (definition.preset !== 'custom') return resolveReportPeriod(definition.preset, timezone, now);
  const from = calendarDate(definition.from), toExclusive = calendarDate(definition.toExclusive);
  const days = (Date.parse(toExclusive) - Date.parse(from)) / 86400000;
  if (days < 1 || days > 366) invalid('Choose a report period of 1–366 days. The end date is exclusive.');
  const today = workspaceToday(timezone, now);
  if (toExclusive > shiftDate(today, 1)) invalid('Reports cannot include future activity.');
  return { preset: 'custom' as const, today, from, toExclusive, through: shiftDate(toExclusive, -1) };
}
export function comparisonPeriod(period: { from: string; toExclusive: string }, method: Definition['comparison']) {
  if (method === 'none') return null;
  if (method === 'previous_period') {
    const days = (Date.parse(period.toExclusive) - Date.parse(period.from)) / 86400000;
    return { from: shiftDate(period.from, -days), toExclusive: period.from };
  }
  // Calendar-aligned prior year, clamping 29 February to 28 February. Do not invent a leap day.
  const previous = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const last = new Date(Date.UTC(year! - 1, month!, 0)).getUTCDate();
    return new Date(Date.UTC(year! - 1, month! - 1, Math.min(day!, last))).toISOString().slice(0, 10);
  };
  const from=previous(period.from), toExclusive=previous(period.toExclusive);
  if(toExclusive<=from) return {from,toExclusive:shiftDate(from,1)};
  return { from, toExclusive };
}
export function parseDefinition(input: unknown, baseCurrency: string): Definition {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Choose report settings.');
  const body = input as Record<string, unknown>;
  const allowed = ['version','reportType','preset','currency','basis','from','toExclusive','comparison','groupBy','sort','accountIds','categoryIds','tagIds'];
  if (Object.keys(body).some(key => !allowed.includes(key))) invalid('The report contains unsupported settings.');
  if(body.version!==undefined&&body.version!==1) invalid('This report definition version is unsupported.');
  const reportType = body.reportType ?? 'analytics', preset = body.preset ?? 'this_month';
  if (!reportKinds.includes(reportType as ReportKind)) invalid('Choose a supported report type.');
  if (!['custom','this_week','last_week','this_month','last_month','year_to_date'].includes(String(preset))) invalid('Choose a supported report period.');
  const currency = body.currency ?? baseCurrency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) invalid('Choose a currency code.');
  const basis = body.basis ?? 'cash', comparison = body.comparison ?? 'none', groupBy = body.groupBy ?? 'day', sort = body.sort ?? 'date';
  if (!['cash','accrual'].includes(String(basis)) || !['none','previous_period','previous_year'].includes(String(comparison)) || !['day','month','category','account'].includes(String(groupBy)) || !['date','amount_desc'].includes(String(sort))) invalid('Choose supported report options.');
  const ids = (value: unknown): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 50 || value.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))) invalid('Choose up to 50 valid filter items.');
    return [...new Set(value as string[])].sort();
  };
  const result = { version: 1, reportType, preset, currency, basis, comparison, groupBy, sort, accountIds: ids(body.accountIds), categoryIds: ids(body.categoryIds),tagIds:ids(body.tagIds), ...(preset === 'custom' ? { from: calendarDate(body.from), toExclusive: calendarDate(body.toExclusive) } : {}) } as Definition;
  if (['profit_loss','balance_sheet','tax'].includes(result.reportType) && (result.accountIds.length || result.categoryIds.length || result.tagIds.length || currency !== baseCurrency)) invalid('Business statements use the complete ledger in the workspace currency.');
  if(result.reportType==='tax'&&basis!=='accrual') invalid('The tax evidence report uses issued documents, not an inferred cash-basis tax return.');
  return result;
}
