import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { TaskRisk } from './workloadService';
import { getRiskActionPlan, getRiskActionSummary } from './riskActionService';

const task: Task = {
  id: 1,
  title: '视觉任务',
  status: 'in_progress',
  progress: 40,
  dependencies: [],
  type: 'task',
  projectId: 1,
};

const risk = (...tags: TaskRisk['riskReasons']): TaskRisk => ({
  level: 'high',
  reasons: tags.map(item => item.text),
  riskReasons: tags,
  colorClass: '',
  borderClass: '',
  glowClass: '',
  shouldAutoAlert: true,
});

describe('riskActionService', () => {
  it('turns capacity risks into reassignment, splitting and reprioritization actions', () => {
    const actions = getRiskActionPlan(task, risk(
      { tag: 'overload', text: '负荷率 160%', severity: 'high' },
    ));
    expect(actions.map(action => action.type)).toEqual(['reassign', 'split', 'reprioritize']);
    expect(getRiskActionSummary(task, risk(
      { tag: 'overlap', text: '任务重叠', severity: 'medium' },
    ))).toContain('换人');
  });

  it('prioritizes blocker confirmation and downstream adjustment', () => {
    const actions = getRiskActionPlan({ ...task, blockReason: '等待程序接入' }, risk(
      { tag: 'blocked', text: '卡点阻塞', severity: 'high' },
      { tag: 'dependency', text: '依赖冲突', severity: 'high' },
    ));
    expect(actions[0]).toMatchObject({ type: 'confirm_blocker', priority: 'primary' });
    expect(actions.some(action => action.type === 'move_downstream')).toBe(true);
  });

  it('keeps deadline and progress risks actionable', () => {
    const actions = getRiskActionPlan(task, risk(
      { tag: 'overdue', text: '已逾期', severity: 'critical' },
      { tag: 'progress', text: '进度不足', severity: 'high' },
    ));
    expect(actions.map(action => action.type)).toContain('delay');
    expect(actions.map(action => action.type)).toContain('split');
  });
});
