import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { formatGanttValidationMessage, validateGanttScheduleChanges } from './ganttScheduleValidator';

const resource: Resource = {
  id: 1,
  name: '视觉设计',
  role: 'UI设计',
  type: 'internal',
} as Resource;

const task = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `任务-${id}`,
  status: 'todo',
  progress: 0,
  dependencies: [],
  type: 'task',
  projectId: 1,
  assigneeIds: [1],
  startDate: new Date('2026-07-06'),
  endDate: new Date('2026-07-07'),
  estimatedHours: 16,
  ...overrides,
});

describe('ganttScheduleValidator', () => {
  it('accepts a working-day move and reports affected tasks', () => {
    const result = validateGanttScheduleChanges({
      tasks: [task(1)],
      resources: [resource],
      capacities: [{ resourceId: 1, dailyCapacity: 1, capacityFactor: 1, availabilityRatio: 1, maxParallelTasks: 3, updatedAt: Date.now() }],
      changes: [{ taskId: 1, startDate: new Date('2026-07-08'), endDate: new Date('2026-07-09') }],
    });

    expect(result.valid).toBe(true);
    expect(result.affectedTaskIds).toEqual([1]);
    expect(result.beforeAfter.shiftedTaskCount).toBe(1);
    expect(formatGanttValidationMessage(result)).toContain('调整 1 项任务');
  });

  it('blocks a weekend boundary so Gantt edits stay on working days', () => {
    const result = validateGanttScheduleChanges({
      tasks: [task(1)],
      changes: [{ taskId: 1, startDate: new Date('2026-07-11'), endDate: new Date('2026-07-13') }],
    });

    expect(result.valid).toBe(false);
    expect(result.reasons.join('')).toContain('工作日');
  });

  it('blocks an upstream dependency conflict after a resize or move', () => {
    const upstream = task(1, {
      title: '上游任务',
      startDate: new Date('2026-07-06'),
      endDate: new Date('2026-07-10'),
    });
    const downstream = task(2, {
      title: '下游任务',
      dependencies: [1],
      startDate: new Date('2026-07-13'),
      endDate: new Date('2026-07-14'),
    });

    const result = validateGanttScheduleChanges({
      tasks: [upstream, downstream],
      changes: [{ taskId: 2, startDate: new Date('2026-07-09'), endDate: new Date('2026-07-10') }],
    });

    expect(result.valid).toBe(false);
    expect(result.dependencyTaskIds).toEqual([2]);
  });

  it('blocks a child that exceeds the parent deadline', () => {
    const parent = task(10, {
      title: '父需求',
      assigneeIds: [],
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-10'),
    });
    const child = task(11, {
      title: '子需求',
      parentId: 10,
      startDate: new Date('2026-07-06'),
      endDate: new Date('2026-07-07'),
    });

    const result = validateGanttScheduleChanges({
      tasks: [parent, child],
      changes: [{ taskId: 11, startDate: new Date('2026-07-09'), endDate: new Date('2026-07-13') }],
    });

    expect(result.valid).toBe(false);
    expect(result.deadlineTaskIds).toEqual([11]);
  });

  it('blocks a resource WIP breach using the configured parallel-task limit', () => {
    const capacityTask = task(1, {
      startDate: new Date('2026-07-06'),
      endDate: new Date('2026-07-07'),
    });
    const existing = task(2, {
      startDate: new Date('2026-07-06'),
      endDate: new Date('2026-07-07'),
    });
    const result = validateGanttScheduleChanges({
      tasks: [capacityTask, existing],
      resources: [resource],
      capacities: [{ resourceId: 1, dailyCapacity: 1, capacityFactor: 1, availabilityRatio: 1, maxParallelTasks: 1, updatedAt: Date.now() }],
      changes: [{ taskId: 1, startDate: new Date('2026-07-06'), endDate: new Date('2026-07-07') }],
    });

    expect(result.valid).toBe(false);
    expect(result.overloadedResourceIds).toEqual([1]);
    expect(result.reasons.join('')).toContain('WIP 上限');
  });
});
