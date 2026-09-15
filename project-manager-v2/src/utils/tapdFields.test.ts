import { describe, expect, it } from 'vitest';
import { formatTapdCalendarDate, parseTapdDate, parseTapdEffortHours } from './tapdFields';

describe('TAPD field parsing', () => {
  it('parses TAPD calendar dates without a timezone shift', () => {
    const result = parseTapdDate('2026-09-14 00:00:00');
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(8);
    expect(result?.getDate()).toBe(14);
  });

  it('formats local calendar dates without converting through UTC', () => {
    const localMidnight = new Date(2026, 8, 14, 0, 0, 0);
    expect(formatTapdCalendarDate(localMidnight)).toBe('2026-09-14');
    expect(formatTapdCalendarDate('2026/09/14 23:59:59')).toBe('2026-09-14');
  });
  it('rejects empty and invalid TAPD dates', () => {
    expect(parseTapdDate('0000-00-00')).toBeUndefined();
    expect(parseTapdDate('2026-02-31')).toBeUndefined();
  });

  it('converts workspace person-days into hours', () => {
    expect(parseTapdEffortHours('2', 'days', 8)).toBe(16);
    expect(parseTapdEffortHours('1.5人天', 'hours', 8)).toBe(12);
  });

  it('preserves workspace person-hours and explicit hour suffixes', () => {
    expect(parseTapdEffortHours('2', 'hours', 8)).toBe(2);
    expect(parseTapdEffortHours('2h', 'days', 8)).toBe(2);
  });

  it('does not invent an effort value for blank or invalid data', () => {
    expect(parseTapdEffortHours('', 'days', 8)).toBeUndefined();
    expect(parseTapdEffortHours('-1', 'days', 8)).toBeUndefined();
  });
});
