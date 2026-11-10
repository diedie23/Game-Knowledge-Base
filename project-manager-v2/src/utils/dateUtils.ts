import { format, isWeekend, addDays } from 'date-fns';
import type { ProjectCalendarConfig } from '../types/project';

export type { ProjectCalendarConfig };

export const DEFAULT_PROJECT_CALENDAR: Required<ProjectCalendarConfig> = {
  holidayDates: [],
  workingDayOverrides: [],
  nonWorkingDayOverrides: [],
};

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
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
  ],
};

// Flat set of all holiday date strings for O(1) lookup.
const holidaySet = new Set<string>(Object.values(CHINESE_HOLIDAYS).flat());

// 2026 official make-up working days from the State Council holiday notice.
// Keep this separate from holidays so a Saturday/Sunday can be a working day.
export const CHINESE_WORKING_DAY_OVERRIDES: Record<number, string[]> = {
  2026: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'],
};

const workingDayOverrideSet = new Set<string>(Object.values(CHINESE_WORKING_DAY_OVERRIDES).flat());

type CalendarSets = {
  holidays: Set<string>;
  workingDays: Set<string>;
  nonWorkingDays: Set<string>;
};

// Date checks run once per visible calendar cell. Cache the merged sets by
// config object so large scheduling views do not rebuild three Sets per cell.
const calendarSetCache = new WeakMap<object, CalendarSets>();

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function calendarSets(calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): CalendarSets {
  const cached = calendarSetCache.get(calendar);
  if (cached) return cached;
  const sets: CalendarSets = {
    holidays: new Set([...holidaySet, ...(calendar.holidayDates || [])]),
    workingDays: new Set([...workingDayOverrideSet, ...(calendar.workingDayOverrides || [])]),
    nonWorkingDays: new Set(calendar.nonWorkingDayOverrides || []),
  };
  calendarSetCache.set(calendar, sets);
  return sets;
}

/** Check if a date is a Chinese public holiday. */
export function isHoliday(date: Date, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): boolean {
  const key = dateKey(date);
  const { holidays } = calendarSets(calendar);
  return holidays.has(key);
}

/** Check if a date is an official make-up working day. */
export function isMakeupWorkingDay(date: Date, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): boolean {
  const key = dateKey(date);
  const { workingDays } = calendarSets(calendar);
  return workingDays.has(key);
}

/** Check if a date is a non-working day (weekend, holiday, or project override). */
export function isNonWorkingDay(date: Date, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): boolean {
  const key = dateKey(date);
  const { nonWorkingDays } = calendarSets(calendar);
  if (nonWorkingDays.has(key)) return true;
  if (isMakeupWorkingDay(date, calendar)) return false;
  return isWeekend(date) || isHoliday(date, calendar);
}

/** Check if a date is a working day. */
export function isWorkingDay(date: Date, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): boolean {
  return !isNonWorkingDay(date, calendar);
}

/** Count working days between two dates (inclusive). */
export function countWorkingDays(start: Date, end: Date, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): number {
  let count = 0;
  let current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current, calendar)) count++;
    current = addDays(current, 1);
  }
  return count;
}

/** Get the next N working days starting from a date. */
export function getNextWorkingDays(from: Date, count: number, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): Date[] {
  const days: Date[] = [];
  let current = from;
  while (days.length < count) {
    if (isWorkingDay(current, calendar)) days.push(new Date(current));
    current = addDays(current, 1);
  }
  return days;
}

/** Find free working days for a resource in a date range. */
export function findFreeDays(
  from: Date,
  daysToCheck: number,
  isOccupied: (day: Date) => boolean,
  calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR,
): Date[] {
  const freeDays: Date[] = [];
  for (let i = 0; i < daysToCheck; i++) {
    const day = addDays(from, i);
    if (isNonWorkingDay(day, calendar)) continue;
    if (!isOccupied(day)) freeDays.push(day);
  }
  return freeDays;
}
