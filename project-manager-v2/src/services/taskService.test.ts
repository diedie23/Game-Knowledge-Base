// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { validateTask } from './taskService';

const task = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `任务${id}`,
  status: 'todo',
  progress: 0,
  dependencies: [],
  type: 'task',
  projectId: 1,
  ...overrides,
});

describe('validateTask', () => {
  it('rejects an invalid date range before a task write', () => {
    const result = validateTask({
      ...task(1),
      startDate: new Date('2026-10-02'),
      endDate: new Date('2026-10-01'),
    }, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('开始日期不能晚于结束日期');
  });

  it('allows warning-only dependency conflicts for manual review', () => {
    const result = validateTask({
      ...task(2),
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-03'),
      dependencies: [1],
    }, [task(1, { endDate: new Date('2026-10-02') })], 2);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });
});
