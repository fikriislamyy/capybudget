import { ceilDivide, fromUnits, toUnits } from './money';
import type { ForecastAccount, ForecastDay, ForecastEvent } from './types';
export type { ForecastAccount, ForecastDay, ForecastEvent } from './types';

export function hasUnresolvedSourceOverlap(events: ForecastEvent[]): boolean {
  const key=(event:ForecastEvent)=>[event.date,event.accountId??'',toUnits(event.amount,true).toString()].join('|');
  const modeled=new Set(events.filter((event)=>event.kind==='bill'||event.kind==='recurring').map(key));
  const posted=new Set(events.filter((event)=>event.kind==='transaction').map(key));
  if([...modeled].some((source)=>posted.has(source)))return true;
  const bills=new Set(events.filter((event)=>event.kind==='bill').map(key));
  return events.some((event)=>event.kind==='recurring'&&bills.has(key(event)));
}

export function projectCashflow(input: {
  today: string;
  horizonDays: number;
  accounts: ForecastAccount[];
  events: ForecastEvent[];
  startingQualityFlags?: string[];
  workspaceProtectedAmount?: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today) || ![30, 60, 90].includes(input.horizonDays)) throw new RangeError('Invalid forecast period');
  if (input.accounts.length === 0) throw new RangeError('At least one cash account is required');
  const currency = input.accounts[0]!.currency;
  if (input.accounts.some((account) => account.currency !== currency)) throw new RangeError('A forecast can include only one currency');
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  const qualityFlags = [...new Set(input.startingQualityFlags ?? [])];
  const eventsByDate = new Map<string, ForecastEvent[]>();
  const start = new Date(`${input.today}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + input.horizonDays);
  const endDate = end.toISOString().slice(0, 10);
  for (const event of input.events) {
    if (event.date < input.today || event.date > endDate) continue;
    if (event.accountId && !accountById.has(event.accountId)) {
      qualityFlags.push('unassigned_forecast_account');
      continue;
    }
    const day = eventsByDate.get(event.date) ?? [];
    day.push(event);
    eventsByDate.set(event.date, day);
  }
  for (const day of eventsByDate.values()) day.sort((a, b) => a.id.localeCompare(b.id));

  const baseBalances = new Map(input.accounts.map((account) => [account.id, toUnits(account.balance, true)]));
  const conservativeBalances = new Map(input.accounts.map((account) => [account.id, toUnits(account.balance, true)]));
  const rows: ForecastDay[] = [];
  const points: ForecastDay[] = [];
  let safeUnits: bigint | null = null;
  let aggregateMinimum: bigint | null = null;
  let aggregateThresholdDate: string | null = null;
  let aggregateShortfallDate: string | null = null;
  const accountAlerts: { accountId: string; date: string; kind: 'low_balance' | 'shortfall'; amount: string }[] = [];

  for (let offset = 0; offset <= input.horizonDays; offset++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateText = date.toISOString().slice(0, 10);
    let aggregateOpening = 0n, aggregateConservativeOpening = 0n, aggregateInflows = 0n, aggregateConservativeInflows = 0n, aggregateOutflows = 0n, aggregateClose = 0n, aggregateProtected = toUnits(input.workspaceProtectedAmount ?? '0');
    const dailyEvents = eventsByDate.get(dateText) ?? [];

    for (const account of input.accounts) {
      const opening = baseBalances.get(account.id)!;
      const conservativeOpening = conservativeBalances.get(account.id)!;
      aggregateConservativeOpening += conservativeOpening;
      const outgoing = dailyEvents.filter((event) => event.accountId === account.id && toUnits(event.amount, true) < 0n).reduce((sum, event) => sum - toUnits(event.amount, true), 0n);
      const incomingEvents = dailyEvents.filter((event) => event.accountId === account.id && toUnits(event.amount, true) > 0n);
      const baseIncoming = incomingEvents.reduce((sum, event) => sum + toUnits(event.amount, true), 0n);
      const regularExpense = offset > 0 ? ceilDivide(toUnits(account.dailyExpenseAverage ?? '0'), 1n) : 0n;
      const regularIncome = offset > 0 ? toUnits(account.dailyIncomeAverage ?? '0') : 0n;
      const projectedOutgoing = outgoing + regularExpense;
      const baseIn = baseIncoming + regularIncome;
      const conservativeIn = incomingEvents.filter((event) => event.kind === 'transfer' || event.kind === 'transaction').reduce((sum, event) => sum + toUnits(event.amount, true), 0n);
      const afterOutflow = opening - projectedOutgoing;
      const conservativeAfterOutflow = conservativeOpening - projectedOutgoing;
      const baseClosing = afterOutflow + baseIn;
      const conservativeClosing = conservativeAfterOutflow + conservativeIn;
      const protectedUnits = toUnits(account.protectedAmount ?? '0');
      const baseMinimum = afterOutflow < baseClosing ? afterOutflow : baseClosing;
      const conservativeMinimum = conservativeAfterOutflow < conservativeClosing ? conservativeAfterOutflow : conservativeClosing;
      const threshold = toUnits(account.lowBalanceThreshold ?? '0');
      if (threshold > 0n && conservativeMinimum < threshold && !accountAlerts.some((alert) => alert.accountId === account.id && alert.kind === 'low_balance')) accountAlerts.push({ accountId: account.id, date: dateText, kind: 'low_balance', amount: fromUnits(threshold - conservativeMinimum) });
      if (conservativeMinimum < 0n && !accountAlerts.some((alert) => alert.accountId === account.id && alert.kind === 'shortfall')) accountAlerts.push({ accountId: account.id, date: dateText, kind: 'shortfall', amount: fromUnits(-conservativeMinimum) });

      for (const scenario of ['base', 'conservative'] as const) {
        const incoming = scenario === 'base' ? baseIn : conservativeIn;
        const closing = scenario === 'base' ? baseClosing : conservativeClosing;
        const minimum = scenario === 'base' ? baseMinimum : conservativeMinimum;
        const headroom = minimum - protectedUnits;
        rows.push({ date: dateText, accountId: account.id, openingBalance: fromUnits(opening), inflows: fromUnits(incoming), outflows: fromUnits(projectedOutgoing), closingBalance: fromUnits(closing), minimumBalance: fromUnits(minimum), protectedAmount: fromUnits(protectedUnits), headroom: fromUnits(headroom), scenario });
      }
      aggregateOpening += opening;
      aggregateInflows += baseIn;
      aggregateConservativeInflows += conservativeIn;
      aggregateOutflows += projectedOutgoing;
      aggregateClose += baseClosing;
      aggregateProtected += protectedUnits;
      baseBalances.set(account.id, baseClosing);
      conservativeBalances.set(account.id, conservativeClosing);
    }

    const unassigned = dailyEvents.filter((event) => !event.accountId && event.kind !== 'transfer').reduce((sum, event) => sum + toUnits(event.amount, true), 0n);
    const aggregateOutflowsNet = aggregateOutflows + (unassigned < 0n ? -unassigned : 0n);
    const aggregateInNet = aggregateInflows + (unassigned > 0n ? unassigned : 0n);
    const aggregateAfterOutflows = aggregateOpening - aggregateOutflowsNet;
    const aggregateMin = aggregateAfterOutflows < aggregateAfterOutflows + aggregateInNet ? aggregateAfterOutflows : aggregateAfterOutflows + aggregateInNet;
    const configuredThreshold = input.accounts.reduce((sum, account) => sum + toUnits(account.lowBalanceThreshold ?? '0'), 0n);
    const aggregateConservativeAfterOutflows = aggregateConservativeOpening - aggregateOutflowsNet;
    const unassignedConservativeInflows = dailyEvents.filter((event) => !event.accountId && event.kind === 'transaction' && toUnits(event.amount, true) > 0n).reduce((sum, event) => sum + toUnits(event.amount, true), 0n);
    const aggregateConservativeInNet = aggregateConservativeInflows + unassignedConservativeInflows;
    const conservativeMin = aggregateConservativeAfterOutflows < aggregateConservativeAfterOutflows + aggregateConservativeInNet ? aggregateConservativeAfterOutflows : aggregateConservativeAfterOutflows + aggregateConservativeInNet;
    if (aggregateMinimum === null || conservativeMin < aggregateMinimum) aggregateMinimum = conservativeMin;
    if (conservativeMin < 0n && aggregateShortfallDate === null) aggregateShortfallDate = dateText;
    if (configuredThreshold > 0n && conservativeMin < configuredThreshold && aggregateThresholdDate === null) aggregateThresholdDate = dateText;
    const aggregateHeadroom = conservativeMin - aggregateProtected;
    if (safeUnits === null || aggregateHeadroom < safeUnits) safeUnits = aggregateHeadroom;
    const aggregateRows: ForecastDay[] = [
      { date: dateText, accountId: null, openingBalance: fromUnits(aggregateOpening), inflows: fromUnits(aggregateInNet), outflows: fromUnits(aggregateOutflowsNet), closingBalance: fromUnits(aggregateAfterOutflows + aggregateInNet), minimumBalance: fromUnits(aggregateMin), protectedAmount: fromUnits(aggregateProtected), headroom: fromUnits(aggregateMin - aggregateProtected), scenario: 'base' },
      { date: dateText, accountId: null, openingBalance: fromUnits(aggregateConservativeOpening), inflows: fromUnits(aggregateConservativeInNet), outflows: fromUnits(aggregateOutflowsNet), closingBalance: fromUnits(aggregateConservativeAfterOutflows + aggregateConservativeInNet), minimumBalance: fromUnits(conservativeMin), protectedAmount: fromUnits(aggregateProtected), headroom: fromUnits(aggregateHeadroom), scenario: 'conservative' }
    ];
    rows.push(...aggregateRows);
    points.push(...aggregateRows);
  }

  if (qualityFlags.length) safeUnits = null;
  return {
    today: input.today, horizonDays: input.horizonDays, endDate, currency,
    safeToSpend: safeUnits === null ? null : fromUnits(safeUnits > 0n ? safeUnits : 0n),
    safeToSpendReason: qualityFlags.length ? 'incomplete_data' : 'conservative_minimum_after_reserves',
    protectedAmount: fromUnits(input.accounts.reduce((sum, account) => sum + toUnits(account.protectedAmount ?? '0'), 0n) + toUnits(input.workspaceProtectedAmount ?? '0')),
    minimumBalance: aggregateMinimum === null ? '0.0000' : fromUnits(aggregateMinimum),
    firstShortfallDate: aggregateShortfallDate, firstLowBalanceDate: aggregateThresholdDate,
    qualityFlags: [...new Set(qualityFlags)], accountAlerts, points, rows
  };
}
