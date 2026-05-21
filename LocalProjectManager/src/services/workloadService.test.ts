import { describe, it, expect } from 'vitest';
import {
  calcMemberWorkload,
  calcBatchWorkload,
  calcParentDateRange,
  checkDependencyConflicts,
  assessTaskRisk,
  RISK_THRESHOLDS,
} from './workloadService';
import type { Task, Resource } from '../types';

// ─── Helpers ────────────────────────────────────────────────────
function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    title: 'Test Task',
    status: 'in_progress',
    priority: 'medium',
    progress: 0,
    dependencies: [],
    type: 'task',
    projectId: 1,
    ...overrides,
  } as Task;
}

function makeResource(id: number, name: string, role = 'Designer'): Resource {
  return { id, name, role, type: 'internal' } as Resource;
}

const d = (str: string) => new Date(str);

// ─── calcMemberWorkload ─────────────────────────────────────────
describe('calcMemberWorkload', () => {
  const resources = [makeResource(1, 'Alice'), makeResource(2, 'Bob')];

  it('returns ok when no tasks', () => {
    const result = calcMemberWorkload(1, d('2026-05-01'), d('2026-05-10'), [], resources);
    expect(result.overlappingTaskCount).toBe(0);
    expect(result.loadPercent).toBe(0);
    expect(result.isOverloaded).toBe(false);
    expect(result.severity).toBe('ok');
  });

  it('returns ok when dates are undefined', () => {
    const result = calcMemberWorkload(1, undefined, undefined, [], resources);
    expect(result.overlappingTaskCount).toBe(0);
    expect(result.severity).toBe('ok');
  });

  it('counts overlapping leaf tasks only', () => {
    const tasks = [
      // Parent task (has children) — should NOT count
      makeTask({ id: 10, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      // Child task 1 — overlaps with query period
      makeTask({ id: 11, parentId: 10, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-05'), status: 'in_progress' }),
      // Child task 2 — overlaps with query period
      makeTask({ id: 12, parentId: 10, assigneeIds: [1], startDate: d('2026-05-04'), endDate: d('2026-05-08'), status: 'in_progress' }),
      // Task assigned to different person — should NOT count
      makeTask({ id: 20, assigneeIds: [2], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      // Done task — should NOT count
      makeTask({ id: 30, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-05'), status: 'done' }),
    ];

    const result = calcMemberWorkload(1, d('2026-05-03'), d('2026-05-06'), tasks, resources);
    expect(result.overlappingTaskCount).toBe(2);
    expect(result.loadPercent).toBe(120);
    expect(result.isOverloaded).toBe(true);
    expect(result.severity).toBe('warning');
  });

  it('excludes the task being edited', () => {
    const tasks = [
      makeTask({ id: 11, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-05'), status: 'in_progress' }),
      makeTask({ id: 12, assigneeIds: [1], startDate: d('2026-05-04'), endDate: d('2026-05-08'), status: 'in_progress' }),
    ];

    const result = calcMemberWorkload(1, d('2026-05-03'), d('2026-05-06'), tasks, resources, 11);
    expect(result.overlappingTaskCount).toBe(1);
    expect(result.loadPercent).toBe(60);
  });

  it('returns danger when load > 150%', () => {
    const tasks = [
      makeTask({ id: 11, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      makeTask({ id: 12, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      makeTask({ id: 13, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
    ];

    const result = calcMemberWorkload(1, d('2026-05-01'), d('2026-05-10'), tasks, resources);
    expect(result.overlappingTaskCount).toBe(3);
    expect(result.loadPercent).toBe(180);
    expect(result.severity).toBe('danger');
  });
});

// ─── calcBatchWorkload ──────────────────────────────────────────
describe('calcBatchWorkload', () => {
  const resources = [makeResource(1, 'Alice'), makeResource(2, 'Bob')];

  it('returns workload for multiple resources', () => {
    const tasks = [
      makeTask({ id: 11, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
    ];

    const result = calcBatchWorkload([1, 2], d('2026-05-01'), d('2026-05-10'), tasks, resources);
    expect(result.size).toBe(2);
    expect(result.get(1)!.overlappingTaskCount).toBe(1);
    expect(result.get(2)!.overlappingTaskCount).toBe(0);
  });
});

// ─── calcParentDateRange ────────────────────────────────────────
describe('calcParentDateRange', () => {
  it('returns the union of child date ranges', () => {
    const children = [
      { startDate: d('2026-05-03'), endDate: d('2026-05-07') },
      { startDate: d('2026-05-01'), endDate: d('2026-05-05') },
      { startDate: d('2026-05-06'), endDate: d('2026-05-10') },
    ];

    const result = calcParentDateRange(children);
    expect(result.startDate).toEqual(d('2026-05-01'));
    expect(result.endDate).toEqual(d('2026-05-10'));
  });

  it('returns undefined for empty children', () => {
    const result = calcParentDateRange([]);
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('handles children with missing dates', () => {
    const children = [
      { startDate: d('2026-05-03'), endDate: undefined },
      { startDate: undefined, endDate: d('2026-05-10') },
    ];

    const result = calcParentDateRange(children);
    expect(result.startDate).toEqual(d('2026-05-03'));
    expect(result.endDate).toEqual(d('2026-05-10'));
  });
});

// ─── checkDependencyConflicts ───────────────────────────────────
describe('checkDependencyConflicts', () => {
  it('returns no conflicts when no dependencies', () => {
    const result = checkDependencyConflicts(1, d('2026-05-05'), [], []);
    expect(result).toHaveLength(0);
  });

  it('returns no conflicts when startDate is undefined', () => {
    const result = checkDependencyConflicts(1, undefined, [2], []);
    expect(result).toHaveLength(0);
  });

  it('detects conflict when downstream starts before upstream ends', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Parent-交互', startDate: d('2026-05-03'), endDate: d('2026-05-08') }),
      makeTask({ id: 2, title: 'Parent-Layout', startDate: d('2026-05-01'), endDate: d('2026-05-06'), dependencies: [] }),
    ];

    const conflicts = checkDependencyConflicts(1, d('2026-05-03'), [2], tasks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapDays).toBe(3);
    expect(conflicts[0].upstreamTaskId).toBe(2);
  });

  it('skips same-type parallel tasks', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Parent-交互', startDate: d('2026-05-03'), endDate: d('2026-05-08') }),
      makeTask({ id: 2, title: 'Other-交互', startDate: d('2026-05-01'), endDate: d('2026-05-06') }),
    ];

    const conflicts = checkDependencyConflicts(1, d('2026-05-03'), [2], tasks);
    expect(conflicts).toHaveLength(0); // Same short name "交互"
  });

  it('returns no conflict when timing is valid', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Parent-Layout', startDate: d('2026-05-07'), endDate: d('2026-05-10') }),
      makeTask({ id: 2, title: 'Parent-交互', startDate: d('2026-05-01'), endDate: d('2026-05-06') }),
    ];

    const conflicts = checkDependencyConflicts(1, d('2026-05-07'), [2], tasks);
    expect(conflicts).toHaveLength(0);
  });
});

// ─── assessTaskRisk ─────────────────────────────────────────────
describe('assessTaskRisk', () => {
  const resources = [makeResource(1, 'Alice')];
  const today = d('2026-05-05');

  it('returns none risk for done tasks', () => {
    const task = makeTask({ id: 1, status: 'done', endDate: d('2026-05-01') });
    const result = assessTaskRisk(task, [], resources, today);
    expect(result.level).toBe('none');
  });

  it('detects overdue tasks', () => {
    const task = makeTask({ id: 1, status: 'in_progress', endDate: d('2026-05-02'), parentId: 100 });
    const result = assessTaskRisk(task, [task], resources, today);
    expect(result.level).toBe('critical');
    expect(result.shouldAutoAlert).toBe(true);
    expect(result.riskReasons.some(r => r.tag === 'overdue')).toBe(true);
  });

  it('detects approaching deadline', () => {
    const task = makeTask({ id: 1, status: 'in_progress', endDate: d('2026-05-06'), parentId: 100 });
    const result = assessTaskRisk(task, [task], resources, today);
    expect(result.riskReasons.some(r => r.tag === 'deadline')).toBe(true);
    expect(result.level).toBe('high');
  });

  it('detects dependency conflicts', () => {
    const upstream = makeTask({ id: 2, title: 'Proj-交互', startDate: d('2026-05-01'), endDate: d('2026-05-08') });
    const task = makeTask({ id: 1, title: 'Proj-Layout', startDate: d('2026-05-05'), endDate: d('2026-05-10'), dependencies: [2], parentId: 100 });
    const result = assessTaskRisk(task, [task, upstream], resources, today);
    expect(result.riskReasons.some(r => r.tag === 'dependency')).toBe(true);
  });

  it('detects blocked tasks', () => {
    const task = makeTask({
      id: 1,
      status: 'in_progress',
      isBlocked: true,
      blockReason: 'Waiting for design',
      updatedAt: d('2026-05-01').getTime(),
      startDate: d('2026-05-01'),
      endDate: d('2026-05-10'),
      parentId: 100,
    });
    const result = assessTaskRisk(task, [task], resources, today);
    expect(result.riskReasons.some(r => r.tag === 'blocked')).toBe(true);
  });

  it('detects progress deficit near deadline', () => {
    // Task end date is within 24 hours with only 30% progress
    const endDate = new Date(today.getTime() + 20 * 3600 * 1000); // 20 hours from now
    const task = makeTask({
      id: 1,
      status: 'in_progress',
      progress: 30,
      endDate,
      parentId: 100,
    });
    const result = assessTaskRisk(task, [task], resources, today);
    expect(result.riskReasons.some(r => r.tag === 'progress')).toBe(true);
    expect(result.shouldAutoAlert).toBe(true);
  });

  it('detects assignee overload', () => {
    const tasks = [
      makeTask({ id: 1, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
      makeTask({ id: 2, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
      makeTask({ id: 3, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
    ];
    const result = assessTaskRisk(tasks[0], tasks, resources, today);
    expect(result.riskReasons.some(r => r.tag === 'overload')).toBe(true);
  });

  it('detects task overlap (weighted concurrent score >= 4)', () => {
    // Need weighted score >= OVERLAP_THRESHOLD (4): 4 self-made tasks × 1 = 4
    const tasks = [
      makeTask({ id: 1, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
      makeTask({ id: 2, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
      makeTask({ id: 3, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
      makeTask({ id: 4, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
    ];
    const result = assessTaskRisk(tasks[0], tasks, resources, today);
    expect(result.riskReasons.some(r => r.tag === 'overlap')).toBe(true);
  });

  it('does NOT trigger overlap for CP-heavy tasks below threshold', () => {
    // 1 self-made + 5 CP tasks: weighted = 1 + 5*0.5 = 3.5 (below threshold 4)
    const tasks = [
      makeTask({ id: 1, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100 }),
      makeTask({ id: 2, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100, workCategory: 'cp_follow' as any }),
      makeTask({ id: 3, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100, workCategory: 'cp_follow' as any }),
      makeTask({ id: 4, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100, workCategory: 'cp_follow' as any }),
      makeTask({ id: 5, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100, workCategory: 'cp_follow' as any }),
      makeTask({ id: 6, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress', parentId: 100, workCategory: 'cp_follow' as any }),
    ];
    const result = assessTaskRisk(tasks[0], tasks, resources, today);
    expect(result.riskReasons.some(r => r.tag === 'overlap')).toBe(false);
  });
});
