import { describe, expect, test } from 'bun:test';
import { dateRange, resolveReportPeriod } from '../../src/reports/periods';

describe('report period presets', () => {
  const now = new Date('2026-09-29T03:00:00.000Z');

  test('uses the workspace local date and Monday week boundaries', () => {
    expect(resolveReportPeriod('this_week', 'Asia/Jakarta', now)).toMatchObject({
      today: '2026-09-29', from: '2026-09-28', toExclusive: '2026-09-30', through: '2026-09-29'
    });
    expect(resolveReportPeriod('last_week', 'Asia/Jakarta', now)).toMatchObject({
      from: '2026-09-21', toExclusive: '2026-09-28', through: '2026-09-27'
    });
  });

  test('includes the year boundary and represents the end as exclusive', () => {
    expect(resolveReportPeriod('last_month', 'UTC', new Date('2026-01-15T12:00:00Z'))).toMatchObject({
      from: '2025-12-01', toExclusive: '2026-01-01', through: '2025-12-31'
    });
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  test('rejects unsupported ranges', () => {
    expect(() => resolveReportPeriod('custom', 'UTC', now)).toThrow();
  });
});
