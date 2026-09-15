import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { isTaskCancelled, isTaskCompleted, isTaskDueToday, isTaskOverdue } from './taskState';

const task = (overrides: Partial<Task> = {}): Task => ({
  title: '测试任务', status: 'todo', progress: 0, dependencies: [], type: 'task', projectId: 1, ...overrides,
});

describe('taskState', () => {
  it('recognizes TAPD terminal states and completion evidence', () => {
    expect(isTaskCompleted(task({ tapdStatus: '已完成' }))).toBe(true);
    expect(isTaskCompleted(task({ completedAt: new Date('2026-09-14') }))).toBe(true);
    expect(isTaskCompleted(task({ progress: 100 }))).toBe(true);
  });

  it('keeps rejected TAPD work cancelled even with stale completion evidence', () => {
    const rejected = task({ status: 'done', tapdStatus: '已拒绝', progress: 100 });
    expect(isTaskCancelled(rejected)).toBe(true);
    expect(isTaskCompleted(rejected)).toBe(false);
  });

  it('separates overdue and today by natural day', () => {
    const now = new Date('2026-09-15T16:00:00');
    expect(isTaskOverdue(task({ endDate: new Date('2026-09-14T23:59:00') }), now)).toBe(true);
    expect(isTaskOverdue(task({ endDate: new Date('2026-09-15T00:00:00') }), now)).toBe(false);
    expect(isTaskDueToday(task({ endDate: new Date('2026-09-15T00:00:00') }), now)).toBe(true);
  });

  it('never reports terminal work as overdue or due today', () => {
    const done = task({ endDate: new Date('2026-09-14'), tapdStatus: 'closed' });
    expect(isTaskOverdue(done, new Date('2026-09-15'))).toBe(false);
    expect(isTaskDueToday(done, new Date('2026-09-14'))).toBe(false);
  });
});
