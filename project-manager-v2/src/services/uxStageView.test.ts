import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import { buildStageRows, stageStatus, taskStage, taskStatus } from './uxStageView';

const task = (id: number, title: string, props: Partial<Task> = {}): Task => ({ id, title, status: 'todo', priority: 'medium', projectId: 1, progress: 0, dependencies: [], type: 'task', ...props });

describe('UX stage rows', () => {
  it('rolls nested children into their demand without mixing unrelated work', () => {
    const rows = buildStageRows([task(1, '商城'), task(2, '子模块', { parentId: 1 }), task(3, '【交互案】商城', { parentId: 2 }), task(4, '【程序】商城', { parentId: 1 }), task(5, '活动')]);
    expect(rows).toHaveLength(2);
    expect(rows[0].stages.interaction.map(t => t.id)).toEqual([3]);
    expect(rows[0].descendants).toHaveLength(3);
    expect(rows[1].stages.interaction).toEqual([]);
  });
  it('preserves orphan tasks and rejects cross-project parents', () => {
    expect(buildStageRows([task(1, '父需求'), task(2, '【动效】孤立任务', { parentId: 99 }), task(3, '【还原】其他项目', { parentId: 1, projectId: 2 })])).toHaveLength(3);
  });
  it('recognizes TAPD stages and local template names without inferring from assignees', () => {
    expect(['【交互案】A', '【视觉设计】A', '【还原】A', '【动效】A', '交互设计', 'UI设计'].map((name, i) => taskStage(task(i, name)))).toEqual(['interaction', 'ui_design', 'implementation', 'motion', 'interaction', 'ui_design']);
    expect(taskStage(task(9, '程序开发', { assigneeIds: [1] }))).toBeUndefined();
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
