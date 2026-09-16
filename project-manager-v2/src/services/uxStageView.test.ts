import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import type { Resource } from '../types/resource';
import { buildStageRows, isDemandComplete, stageStatus, taskStage, taskStatus } from './uxStageView';

const task = (id: number, title: string, props: Partial<Task> = {}): Task => ({ id, title, status: 'todo', priority: 'medium', projectId: 1, progress: 0, dependencies: [], type: 'task', ...props });

const resources: Resource[] = [
  { id: 1, name: '柴姣', role: 'UI设计', tapdAccount: 'chaichai' },
  { id: 2, name: '张云鹏', role: '还原', tapdAccount: 'v_zypgzhang' },
  { id: 3, name: '罗梦晨', role: '动效', tapdAccount: 'luomengchen' },
  { id: 4, name: '金天', role: '策划', tapdAccount: 'ritianjin' },
];

describe('UX stage rows', () => {
  it('rolls nested children into their demand without mixing unrelated work', () => {
    const rows = buildStageRows([task(1, '商城'), task(2, '子模块', { parentId: 1 }), task(3, '【交互案】商城', { parentId: 2 }), task(4, '【程序】商城', { parentId: 1 }), task(5, '活动')]);
    expect(rows).toHaveLength(2);
    expect(rows[0].stages.interaction.map(t => t.id)).toEqual([3]);
    expect(rows[0].descendants).toHaveLength(3);
    expect(rows[1].stages.interaction).toEqual([]);
  });
  it('starts TAPD rows at UIStory and never promotes EPIC into the first column', () => {
    const rows = buildStageRows([
      task(1, '版本总览', { tapdWorkitemTypeName: 'EPIC' }),
      task(2, '商城 UIStory', { parentId: 1, tapdWorkitemTypeName: 'UI需求' }),
      task(3, '【交互案】商城', { parentId: 2, tapdWorkitemTypeName: 'UI子需求' }),
      task(4, '另一个 UIStory', { parentId: 1, tapdWorkitemTypeName: 'UIStory' }),
      task(5, '普通子需求', { parentId: 2, tapdWorkitemTypeName: 'UIStory子需求' }),
    ]);
    expect(rows.map(row => row.root.id)).toEqual([2, 4]);
    expect(rows[0].stages.interaction.map(item => item.id)).toEqual([3]);
  });
  it('only treats a demand as complete when all four stages exist and are complete', () => {
    const done = (id: number, title: string) => task(id, title, { status: 'done' });
    const full = buildStageRows([task(1, '需求'), done(2, '【交互案】A'), done(3, '【视觉设计】A'), done(4, '【还原】A'), done(5, '【动效】A')
      ].map((item, index) => index === 0 ? item : { ...item, parentId: 1 }))[0].stages;
    expect(isDemandComplete(full)).toBe(true);
    full.motion[0] = { ...full.motion[0], status: 'in_progress' };
    expect(isDemandComplete(full)).toBe(false);
    full.motion = [];
    expect(isDemandComplete(full)).toBe(false);
  });
  it('preserves orphan tasks and rejects cross-project parents', () => {
    expect(buildStageRows([task(1, '父需求'), task(2, '【动效】孤立任务', { parentId: 99 }), task(3, '【还原】其他项目', { parentId: 1, projectId: 2 })])).toHaveLength(3);
  });
  it('uses title first and falls back to the TAPD owner role when titles are generic', () => {
    expect(['【交互案】A', '【视觉设计】A', '【还原】A', '【动效】A', '交互设计', 'UI设计'].map((name, i) => taskStage(task(i, name), resources))).toEqual(['interaction', 'ui_design', 'implementation', 'motion', 'interaction', 'ui_design']);
    expect(taskStage(task(9, '图标设计', { assigneeIds: [1] }), resources)).toBe('ui_design');
    expect(taskStage(task(10, '资源入版', { tapdOwner: 'v_zypgzhang' }), resources)).toBe('implementation');
    expect(taskStage(task(11, '动效稿', { assigneeIds: [1] }), resources)).toBe('motion');
    expect(taskStage(task(12, '策划配置', { assigneeIds: [4] }), resources)).toBeUndefined();
    expect(taskStage(task(13, '多人协作', { assigneeIds: [1, 2] }), resources)).toBeUndefined();
  });

  it('places generic UI children by their handler role without classifying the parent itself', () => {
    const rows = buildStageRows([
      task(20, '【会议流程】图标', { status: 'done', tapdWorkitemTypeName: 'UIStory' }),
      task(21, '图标设计（CP萌动）', { parentId: 20, status: 'done', assigneeIds: [1], tapdWorkitemTypeName: 'UI' }),
      task(22, '资源入版', { parentId: 20, status: 'done', tapdOwner: 'v_zypgzhang', tapdWorkitemTypeName: 'UI' }),
      task(23, '策划配置', { parentId: 20, status: 'done', assigneeIds: [4], tapdWorkitemTypeName: 'CONFIG' }),
    ], resources);
    expect(rows[0].stages.ui_design.map(item => item.id)).toEqual([21]);
    expect(rows[0].stages.implementation.map(item => item.id)).toEqual([22]);
    expect(rows[0].descendants.map(item => item.id)).toEqual([21, 22, 23]);
  });
  it('distinguishes absent tasks from pending and cancelled work', () => {
    expect(stageStatus([])).toBe('missing');
    expect(stageStatus([task(1, '')])).toBe('todo');
    expect(stageStatus([task(1, '', { status: 'cancelled' })])).toBe('cancelled');
  });
  it('never marks a partially completed stage done', () => {
    expect(stageStatus([task(1, '', { status: 'done' }), task(2, '')])).toBe('in_progress');
    expect(stageStatus([task(1, '', { status: 'done' }), task(2, '', { status: 'cancelled' })])).toBe('done');
  });
  it('prioritizes blockers and paused work but ignores stale blockers on terminal tasks', () => {
    expect(stageStatus([task(1, '', { status: 'in_progress' }), task(2, '', { isBlocked: true })])).toBe('blocked');
    expect(stageStatus([task(1, '', { status: 'in_progress' }), task(2, '', { status: 'paused' })])).toBe('paused');
    expect(taskStatus(task(1, '', { status: 'done', isBlocked: true }))).toBe('done');
  });
});
