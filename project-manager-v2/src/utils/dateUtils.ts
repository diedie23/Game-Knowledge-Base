import { format, isWeekend, addDays } from 'date-fns';

/**
 * Centralized Chinese public holiday configuration.
 * Keyed by year for easy multi-year support.
 */
export const CHINESE_HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-01-01',
    '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
    '2025-04-04', '2025-04-05', '2025-04-06',
    '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
    '2025-06-01', '2025-06-02',
    '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07',
  ],
  2026: [
    '2026-01-01',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
  ],
};

// Flat set of all holiday date strings for O(1) lookup
const holidaySet = new Set<string>(
  Object.values(CHINESE_HOLIDAYS).flat()
);

/** Check if a date is a Chinese public holiday */
export function isHoliday(date: Date): boolean {
  return holidaySet.has(format(date, 'yyyy-MM-dd'));
}

/** Check if a date is a non-working day (weekend or holiday) */
export function isNonWorkingDay(date: Date): boolean {
  return isWeekend(date) || isHoliday(date);
}

/** Check if a date is a working day */
export function isWorkingDay(date: Date): boolean {
  return !isNonWorkingDay(date);
}

/** Count working days between two dates (inclusive) */
export function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  let current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current)) count++;
    current = addDays(current, 1);
  }
  return count;
}

/** Get the next N working days starting from a date */
export function getNextWorkingDays(from: Date, count: number): Date[] {
  const days: Date[] = [];
  let current = from;
  while (days.length < count) {
    if (isWorkingDay(current)) days.push(new Date(current));
    current = addDays(current, 1);
  }
  return days;
}

/** Find free working days for a resource in a date range */
export function findFreeDays(
  from: Date,
  daysToCheck: number,
  isOccupied: (day: Date) => boolean
): Date[] {
  const freeDays: Date[] = [];
  for (let i = 0; i < daysToCheck; i++) {
    const day = addDays(from, i);
    if (isNonWorkingDay(day)) continue;
    if (!isOccupied(day)) freeDays.push(day);
  }
  return freeDays;
}
