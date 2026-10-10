import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
  buildReleasePlanProgress,
  releasePlanDateValue,
  selectCurrentReleasePlan,
  type TapdReleasePlan,
} from './releasePlanService';

const task = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `需求 ${id}`,
  status: 'todo',
  progress: 0,
  dependencies: [],
  type: 'task',
  projectId: 1,
  ...overrides,
});

const plan = (id: string, overrides: Partial<TapdReleasePlan> = {}): TapdReleasePlan => ({
  id,
  name: `版本 ${id}`,
  ...overrides,
});

describe('releasePlanService', () => {
  it('selects the ongoing non-terminal release plan before upcoming plans', () => {
    const current = selectCurrentReleasePlan([
      plan('upcoming', { startdate: '2026-10-15', enddate: '2026-10-31' }),
      plan('current', { startdate: '2026-10-01', enddate: '2026-10-12' }),
      plan('released', { status: '已发布', startdate: '2026-09-01', enddate: '2026-09-30' }),
    ], new Date('2026-10-10'));

    expect(current?.id).toBe('current');
  });

  it('selects the nearest upcoming plan when no plan is ongoing', () => {
    const current = selectCurrentReleasePlan([
      plan('later', { startdate: '2026-11-01', enddate: '2026-11-15' }),
      plan('near', { startdate: '2026-10-12', enddate: '2026-10-20' }),
    ], new Date('2026-10-10'));

    expect(current?.id).toBe('near');
  });

  it('calculates progress from tasks assigned to the selected release plan', () => {
    const progress = buildReleasePlanProgress(
      plan('current'),
      [
        task(1, { tapdReleaseId: 'current', status: 'done' }),
        task(2, { tapdReleaseId: 'current', status: 'in_progress' }),
        task(3, { tapdReleaseId: 'current', status: 'todo' }),
        task(4, { tapdReleaseId: 'other', status: 'done' }),
      ],
    );

    expect(progress).toEqual({ total: 3, completed: 1, inProgress: 1, completionRate: 33 });
  });

  it('normalizes TAPD date strings for comparisons', () => {
    expect(releasePlanDateValue('2026-10-10 12:30:00')).toBe(new Date('2026-10-10').getTime());
    expect(releasePlanDateValue('0000-00-00')).toBeUndefined();
  });
});
