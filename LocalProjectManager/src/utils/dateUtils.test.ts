import { describe, it, expect } from 'vitest';
import { isHoliday, isNonWorkingDay, isWorkingDay, countWorkingDays, getNextWorkingDays, findFreeDays } from './dateUtils';

describe('dateUtils', () => {
  describe('isHoliday', () => {
    it('should return true for Chinese New Year 2026', () => {
      expect(isHoliday(new Date('2026-02-17'))).toBe(true);
    });

    it('should return true for National Day 2026', () => {
      expect(isHoliday(new Date('2026-10-01'))).toBe(true);
    });

    it('should return false for a regular working day', () => {
      expect(isHoliday(new Date('2026-03-10'))).toBe(false);
    });

    it('should return false for a weekend that is not a holiday', () => {
      expect(isHoliday(new Date('2026-03-07'))).toBe(false); // Saturday
    });
  });

  describe('isNonWorkingDay', () => {
    it('should return true for weekends', () => {
      expect(isNonWorkingDay(new Date('2026-03-07'))).toBe(true); // Saturday
      expect(isNonWorkingDay(new Date('2026-03-08'))).toBe(true); // Sunday
    });

    it('should return true for holidays', () => {
      expect(isNonWorkingDay(new Date('2026-01-01'))).toBe(true);
    });

    it('should return false for regular working days', () => {
      expect(isNonWorkingDay(new Date('2026-03-09'))).toBe(false); // Monday
    });
  });

  describe('isWorkingDay', () => {
    it('should return true for Monday', () => {
      expect(isWorkingDay(new Date('2026-03-09'))).toBe(true);
    });

    it('should return false for Saturday', () => {
      expect(isWorkingDay(new Date('2026-03-07'))).toBe(false);
    });
  });

  describe('countWorkingDays', () => {
    it('should count working days in a week (Mon-Fri)', () => {
      const start = new Date('2026-03-09'); // Monday
      const end = new Date('2026-03-13');   // Friday
      expect(countWorkingDays(start, end)).toBe(5);
    });

    it('should count working days across a weekend', () => {
      const start = new Date('2026-03-09'); // Monday
      const end = new Date('2026-03-16');   // Next Monday
      expect(countWorkingDays(start, end)).toBe(6);
    });

    it('should return 0 for a weekend-only range', () => {
      const start = new Date('2026-03-07'); // Saturday
      const end = new Date('2026-03-08');   // Sunday
      expect(countWorkingDays(start, end)).toBe(0);
    });

    it('should exclude holidays', () => {
      // 2026-01-01 is Thursday (holiday)
      const start = new Date('2025-12-29'); // Monday
      const end = new Date('2026-01-02');   // Friday
      // Mon, Tue, Wed = 3 working days (Thu is holiday, Fri is working)
      expect(countWorkingDays(start, end)).toBe(4);
    });
  });

  describe('getNextWorkingDays', () => {
    it('should return the next N working days', () => {
      const days = getNextWorkingDays(new Date('2026-03-09'), 3); // Monday
      expect(days).toHaveLength(3);
      expect(days[0].getDate()).toBe(9);
      expect(days[1].getDate()).toBe(10);
      expect(days[2].getDate()).toBe(11);
    });

    it('should skip weekends', () => {
      const days = getNextWorkingDays(new Date('2026-03-06'), 3); // Friday
      expect(days).toHaveLength(3);
      expect(days[0].getDate()).toBe(6);  // Friday
      expect(days[1].getDate()).toBe(9);  // Monday (skipped Sat/Sun)
      expect(days[2].getDate()).toBe(10); // Tuesday
    });
  });

  describe('findFreeDays', () => {
    it('should find free working days', () => {
      const from = new Date('2026-03-09'); // Monday
      const freeDays = findFreeDays(from, 7, () => false); // No occupied days
      // Mon-Fri = 5 working days in 7 calendar days
      expect(freeDays).toHaveLength(5);
    });

    it('should exclude occupied days', () => {
      const from = new Date('2026-03-09'); // Monday
      const freeDays = findFreeDays(from, 5, (day) => day.getDate() === 10); // Tuesday occupied
      expect(freeDays).toHaveLength(4);
    });
  });
});
