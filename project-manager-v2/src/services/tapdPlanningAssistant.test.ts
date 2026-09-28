import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { buildTapdPlanningItems, buildTapdScheduleSuggestion, formatTapdAdjustmentChecklist, latestTapdSyncAt } from './tapdPlanningAssistant';

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

  it('excludes program integration and audio checkpoints from UX assignee risks', () => {
    const result = buildTapdPlanningItems([
      task(10, { title: '【系统】【11月版本】商业化表现优化 - 还原接入', tapdWorkitemTypeName: '开发子需求' }),
      task(11, { title: '爆破手-UI动效接入' }),
      task(12, { title: '环境音效制作', tapdWorkitemTypeName: '音频子需求' }),
      task(13, { title: '【视觉设计】商城图标', tapdWorkitemTypeName: 'UI子需求' }),
    ], resources, today);
    expect(result.map(item => item.task.id)).toEqual([13]);
    expect(result[0].tags).toContain('unassigned');
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
      suggestion: {
        resource: { id: 1, name: '设计师', role: 'UI设计', type: 'internal' } as Resource,
        startDate: new Date('2026-09-28'),
        endDate: new Date('2026-09-29'),
        currentConflictCount: 0,
        suggestedConflictCount: 0,
        assigneeChanged: false,
        scheduleChanged: true,
        reasons: ['按 2 个工作日补齐排期'],
      },
    }], [{ id: 1, name: '设计师', role: 'UI设计', type: 'internal' } as Resource]);
    expect(text).toContain('[P0] 任务8');
    expect(text).toContain('当前处理人：设计师');
    expect(text).toContain('建议动作：补充 TAPD 排期');
    expect(text).toContain('建议处理人：设计师');
    expect(text).toContain('调整依据：按 2 个工作日补齐排期');
    expect(text).toContain('https://tapd.example/story/8');
  });
});

describe('buildTapdScheduleSuggestion', () => {
  const today = new Date('2026-09-28T09:00:00');

  it('keeps CP work within CP suppliers and chooses the lower-load matching role', () => {
    const resources: Resource[] = [
      { id: 1, name: '内部设计', role: 'UI设计', type: 'internal' } as Resource,
      { id: 2, name: '供应商甲', role: 'UI设计', type: 'cp' } as Resource,
      { id: 3, name: '供应商乙', role: 'UI设计', type: 'cp' } as Resource,
    ];
    const source = task(10, { title: '界面设计（CP全速）', workCategory: 'cp_follow', assigneeIds: [2], startDate: new Date('2026-09-28'), endDate: new Date('2026-09-29') });
    const busy = task(11, { parentId: 99, assigneeIds: [2], startDate: new Date('2026-09-28'), endDate: new Date('2026-09-30') });
    const suggestion = buildTapdScheduleSuggestion(source, ['overlap'], [source, busy], resources, today);
    expect(suggestion.resource?.id).toBe(3);
    expect(suggestion.resource?.type).toBe('cp');
    expect(suggestion.assigneeChanged).toBe(true);
  });

  it('moves an overdue task to the next working period using its original duration', () => {
    const resources: Resource[] = [{ id: 1, name: '设计师', role: 'UI设计', type: 'internal' } as Resource];
    const source = task(12, { assigneeIds: [1], startDate: new Date('2026-09-21'), endDate: new Date('2026-09-22') });
    const suggestion = buildTapdScheduleSuggestion(source, ['overdue'], [source], resources, today);
    expect([suggestion.startDate.getFullYear(), suggestion.startDate.getMonth() + 1, suggestion.startDate.getDate()]).toEqual([2026, 9, 28]);
    expect([suggestion.endDate.getFullYear(), suggestion.endDate.getMonth() + 1, suggestion.endDate.getDate()]).toEqual([2026, 9, 29]);
    expect(suggestion.reasons.join('')).toContain('原排期已过期');
  });
});
