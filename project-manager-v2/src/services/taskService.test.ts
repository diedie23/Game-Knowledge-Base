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

  it('rejects self-parenting, cross-project parents and parent cycles', () => {
    const root = task(1, { projectId: 1 });
    const child = task(2, { projectId: 1, parentId: 1 });
    expect(validateTask({ ...child, parentId: 2 }, [root, child], 2).errors).toContain('任务不能将自己设为父任务');
    expect(validateTask({ ...child, projectId: 2, parentId: 1 }, [root, child], 2).errors).toContain('父任务必须属于同一个项目');
    expect(validateTask({ ...root, parentId: 2 }, [root, child], 1).errors).toContain('父子关系形成循环，无法保存');
  });

  it('rejects dependency cycles before saving', () => {
    const result = validateTask({ ...task(1), dependencies: [2] }, [
      task(1),
      task(2, { dependencies: [1] }),
    ], 1);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('前置依赖形成循环，无法保存');
  });
});
