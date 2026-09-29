import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { assessTapdScheduleReadiness, buildDemandRiskGroups, buildTapdPlanningItems, buildTapdScheduleSuggestion, formatTapdAdjustmentChecklist, latestTapdSyncAt } from './tapdPlanningAssistant';
import { resourceStage } from './uxStageView';

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

  it('shows a duplicated TAPD item only once in the planning queue', () => {
    const result = buildTapdPlanningItems([
      task(20, { tapdId: 'same-tapd-item', assigneeIds: [1] }),
      task(21, { tapdId: 'same-tapd-item', assigneeIds: [1] }),
    ], resources, today);
    expect(result).toHaveLength(1);
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

describe('buildDemandRiskGroups', () => {
  const resources: Resource[] = [{ id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource];
  const today = new Date('2026-09-28T09:00:00');

  it('groups nested UX risks under the UIStory instead of the EPIC', () => {
    const epic = task(100, { title: 'EPIC', tapdWorkitemTypeName: 'EPIC' });
    const story = task(101, { title: '父需求', parentId: 100, tapdWorkitemTypeName: 'UIStory' });
    const container = task(102, { title: '视觉阶段', parentId: 101 });
    const child = task(103, { title: '【视觉设计】商城图标', parentId: 102, assigneeIds: [1] });
    const groups = buildDemandRiskGroups([epic, story, container, child], resources, today);
    expect(groups).toHaveLength(1);
    expect(groups[0].demand.id).toBe(101);
    expect(groups[0].items.map(item => item.task.id)).toEqual([103]);
  });

  it('keeps an active program checkpoint as a parent-demand risk without treating it as UX staffing', () => {
    const story = task(110, { title: '父需求', tapdWorkitemTypeName: 'UIStory' });
    const checkpoint = task(111, {
      title: '程序还原接入',
      parentId: 110,
      tapdWorkitemTypeName: '开发子需求',
      status: 'in_progress',
      startDate: new Date('2026-09-20'),
      endDate: new Date('2026-09-30'),
    });
    const groups = buildDemandRiskGroups([story, checkpoint], resources, today);
    expect(groups).toHaveLength(1);
    expect(groups[0].checkpoints.map(item => item.label)).toEqual(['程序接入']);
    expect(groups[0].staffingCount).toBe(0);
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
        durationDays: 2,
        parentDeadlineStatus: 'unknown',
        requiresReview: false,
        reviewReasons: [],
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

  it('never recommends a motion designer for a visual-design task', () => {
    const resources: Resource[] = [
      { id: 1, name: '当前视觉', role: 'UI设计', type: 'internal' } as Resource,
      { id: 2, name: '空闲动效', role: '动效', type: 'internal' } as Resource,
      { id: 3, name: '空闲视觉', role: 'UI设计', type: 'internal' } as Resource,
    ];
    const source = task(30, {
      title: '【视觉设计】商城图标',
      assigneeIds: [1],
      startDate: new Date('2026-09-28'),
      endDate: new Date('2026-09-29'),
    });
    const busy = task(31, {
      assigneeIds: [1],
      startDate: new Date('2026-09-28'),
      endDate: new Date('2026-09-30'),
    });
    const suggestion = buildTapdScheduleSuggestion(source, ['overlap'], [source, busy], resources, today);
    expect(resourceStage(suggestion.resource!)).toBe('ui_design');
    expect(suggestion.resource?.id).not.toBe(2);
  });

  it('leaves an ambiguous unassigned task for manual role confirmation', () => {
    const resources: Resource[] = [
      { id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource,
      { id: 2, name: '动效', role: '动效', type: 'internal' } as Resource,
    ];
    const source = task(32, { title: '待确认制作任务' });
    const suggestion = buildTapdScheduleSuggestion(source, ['unscheduled', 'unassigned'], [source], resources, today);
    expect(suggestion.resource).toBeUndefined();
    expect(suggestion.reasons.join('')).toContain('手动指定');
  });

  it('requires review when effort is missing and allows a complete same-role task', () => {
    const resources: Resource[] = [{ id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource];
    const incomplete = task(40, { title: '【视觉设计】图标', assigneeIds: [1] });
    const complete = task(41, { title: '【视觉设计】图标', assigneeIds: [1], estimatedHours: 16 });
    expect(assessTapdScheduleReadiness(incomplete, ['unscheduled'], resources).ready).toBe(false);
    expect(assessTapdScheduleReadiness(complete, ['unscheduled'], resources).ready).toBe(true);
  });

  it('marks a suggestion for review when it exceeds its parent deadline', () => {
    const resources: Resource[] = [{ id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource];
    const parent = task(50, { endDate: new Date('2026-09-28') });
    const source = task(51, { title: '【视觉设计】图标', parentId: 50, assigneeIds: [1], estimatedHours: 16 });
    const suggestion = buildTapdScheduleSuggestion(source, ['unscheduled'], [parent, source], resources, today);
    expect(suggestion.parentDeadlineStatus).toBe('late');
    expect(suggestion.requiresReview).toBe(true);
  });

  it('counts one active item when parent rows and duplicate TAPD records overlap the source', () => {
    const resources: Resource[] = [{ id: 1, name: '郭旭阳', role: 'UX设计', type: 'internal' } as Resource];
    const source = task(20, {
      tapdId: 'same-tapd-item',
      parentId: 100,
      assigneeIds: [1],
      startDate: new Date('2026-09-28'),
      endDate: new Date('2026-09-28'),
    });
    const duplicatedCache = task(21, {
      tapdId: 'same-tapd-item',
      parentId: 100,
      assigneeIds: [1],
      startDate: new Date('2026-09-28'),
      endDate: new Date('2026-09-28'),
    });
    const parent = task(100, {
      assigneeIds: [1],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
    });

    const suggestion = buildTapdScheduleSuggestion(source, ['deadline'], [source, duplicatedCache, parent], resources, today);
    expect(suggestion.currentConflictCount).toBe(1);
  });
});
