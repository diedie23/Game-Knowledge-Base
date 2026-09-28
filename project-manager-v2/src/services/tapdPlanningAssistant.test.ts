import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { buildTapdPlanningItems, formatTapdAdjustmentChecklist, latestTapdSyncAt } from './tapdPlanningAssistant';

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

describe('buildTapdPlanningItems', () => {
  const resources: Resource[] = [{ id: 1, name: '设计师', role: 'UI设计', type: 'internal' } as Resource];
  const today = new Date('2026-09-28T09:00:00');

  it('prioritizes overdue TAPD work ahead of unscheduled work and excludes parent rows', () => {
    const tasks = [
      task(1, { title: '父需求', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30') }),
      task(2, { parentId: 1, assigneeIds: [1], startDate: new Date('2026-09-20'), endDate: new Date('2026-09-25'), status: 'in_progress' }),
      task(3, { priority: 'high', assigneeIds: [1] }),
    ];

    const result = buildTapdPlanningItems(tasks, resources, today);
    expect(result.map(item => item.task.id)).toEqual([2, 3]);
    expect(result[0].tags).toContain('overdue');
    expect(result[1].actionLabel).toBe('补充 TAPD 排期');
  });

  it('ignores completed and local-only tasks', () => {
    const result = buildTapdPlanningItems([
      task(1, { status: 'done' }),
      task(2, { tapdId: undefined, externalUrl: undefined, syncSource: 'local' }),
    ], resources, today);
    expect(result).toEqual([]);
  });
});

describe('latestTapdSyncAt', () => {
  it('returns the latest TAPD timestamp only', () => {
    expect(latestTapdSyncAt([
      task(1, { syncedAt: 10 }),
      task(2, { syncedAt: 20 }),
      task(3, { tapdId: undefined, externalUrl: undefined, syncSource: 'local', syncedAt: 99 }),
    ])).toBe(20);
  });
});

describe('formatTapdAdjustmentChecklist', () => {
  it('creates a TAPD-first checklist with owner, reason and link', () => {
    const source = task(8, { tapdPriorityLabel: 'P0', assigneeIds: [1] });
    const text = formatTapdAdjustmentChecklist([{
      task: source,
      level: 'high',
      reasons: ['缺少结束日期'],
      tags: ['unscheduled'],
      actionLabel: '补充 TAPD 排期',
      score: 340,
    }], [{ id: 1, name: '设计师', role: 'UI设计', type: 'internal' } as Resource]);
    expect(text).toContain('[P0] 任务8');
    expect(text).toContain('当前处理人：设计师');
    expect(text).toContain('建议动作：补充 TAPD 排期');
    expect(text).toContain('https://tapd.example/story/8');
  });
});
