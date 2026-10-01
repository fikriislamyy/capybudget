export type RecurrenceFrequency = 'day' | 'week' | 'month' | 'year';

export function nextOccurrenceDate(anchor: string, frequency: RecurrenceFrequency, interval: number, occurrence: number): string {
  const parsedAnchor=new Date(anchor+'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(parsedAnchor.valueOf()) || parsedAnchor.toISOString().slice(0,10)!==anchor || !Number.isInteger(interval) || interval < 1 || !Number.isInteger(occurrence) || occurrence < 0) {
    throw new RangeError('Invalid recurring date inputs');
  }
  const [year, month, day] = anchor.split('-').map(Number);
  if (occurrence === 0) return anchor;
  let result: Date;
  if (frequency === 'day' || frequency === 'week') {
    result = new Date(Date.UTC(year!, month! - 1, day! + occurrence * interval * (frequency === 'week' ? 7 : 1)));
  } else if (frequency === 'month') {
    const monthStart = new Date(Date.UTC(year!, month! - 1 + occurrence * interval, 1));
    const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    result = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(day!, lastDay)));
  } else if (frequency === 'year') {
    const targetYear = year! + occurrence * interval;
    const lastDay = new Date(Date.UTC(targetYear, month!, 0)).getUTCDate();
    result = new Date(Date.UTC(targetYear, month! - 1, Math.min(day!, lastDay)));
  } else {
    throw new RangeError('Unsupported recurring frequency');
  }
  return result.toISOString().slice(0, 10);
}

export function workspaceToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function workspaceHour(timezone: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}
