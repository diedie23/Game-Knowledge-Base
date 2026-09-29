import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { buildWeeklyUxReport, formatWeeklyUxReport } from './weeklyReportService';

const task = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `任务${id}`,
  status: 'todo',
  priority: 'medium',
  progress: 0,
  dependencies: [],
  type: 'task',
  projectId: 1,
  tapdId: String(id),
  externalUrl: `https://tapd.example/story/${id}`,
  ...overrides,
});

describe('buildWeeklyUxReport', () => {
  const resources: Resource[] = [{ id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource];
  const today = new Date('2026-09-30T09:00:00');

  it('separates this week completion and next week plan without counting parent rows', () => {
    const parent = task(1, { title: '父需求', status: 'done', completedAt: new Date('2026-09-29') });
    const completed = task(2, { parentId: 1, status: 'done', completedAt: new Date('2026-09-29') });
    const active = task(3, { status: 'in_progress', startDate: new Date('2026-10-05'), endDate: new Date('2026-10-06') });
    const report = buildWeeklyUxReport([parent, completed, active], resources, today);
    expect(report.completed.map(item => item.id)).toEqual([2]);
    expect(report.inProgress.map(item => item.id)).toEqual([3]);
    expect(report.nextWeek.map(item => item.id)).toEqual([3]);
  });

  it('formats TAPD links and risk sections for direct copying', () => {
    const report = buildWeeklyUxReport([
      task(10, { status: 'done', completedAt: new Date('2026-09-29') }),
      task(11, { status: 'in_progress', endDate: new Date('2026-09-20'), assigneeIds: [1] }),
    ], resources, today);
    const text = formatWeeklyUxReport(report);
    expect(text).toContain('UX 管线周报');
    expect(text).toContain('[任务10](https://tapd.example/story/10)');
    expect(text).toContain('风险与卡点');
    expect(text).toContain('岗位容量');
  });
});
