import { describe, expect, test } from 'bun:test';
import { nextOccurrenceDate, workspaceToday } from '../../src/tracking/recurrence';

describe('recurrence calendar dates',()=>{
  test('keeps the original day after clamping a month end',()=>{
    expect(nextOccurrenceDate('2025-01-31','month',1,0)).toBe('2025-01-31');
    expect(nextOccurrenceDate('2025-01-31','month',1,1)).toBe('2025-02-28');
    expect(nextOccurrenceDate('2025-01-31','month',1,2)).toBe('2025-03-31');
  });
  test('applies intervals from the anchor date',()=>{
    expect(nextOccurrenceDate('2025-01-31','month',2,1)).toBe('2025-03-31');
    expect(nextOccurrenceDate('2025-01-31','month',2,2)).toBe('2025-05-31');
  });
  test('clamps leap day in non-leap years without losing the anchor',()=>{
    expect(nextOccurrenceDate('2024-02-29','year',1,1)).toBe('2025-02-28');
    expect(nextOccurrenceDate('2024-02-29','year',1,4)).toBe('2028-02-29');
  });
  test('rejects invalid calendar anchors and zero intervals',()=>{
    expect(()=>nextOccurrenceDate('2025-02-30','month',1,1)).toThrow(RangeError);
    expect(()=>nextOccurrenceDate('2025-01-01','day',0,1)).toThrow(RangeError);
  });
  test('uses the requested workspace timezone when deriving today',()=>{
    expect(workspaceToday('UTC',new Date('2026-09-28T17:30:00.000Z'))).toBe('2026-09-28');
    expect(workspaceToday('Asia/Jakarta',new Date('2026-09-28T17:30:00.000Z'))).toBe('2026-09-29');
  });
});
