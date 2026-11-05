import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { buildScheduleSnapshot } from './scheduleSnapshotService';

const task = (id: number): Task => ({
  id,
  title: `任务-${id}`,
  status: 'todo',
  progress: 0,
  dependencies: [],
  type: 'task',
  projectId: 7,
  startDate: new Date('2026-07-06'),
  endDate: new Date('2026-07-07'),
});

const resource = { id: 1, name: '视觉设计', role: 'UI设计', type: 'internal' } as Resource;

describe('scheduleSnapshotService', () => {
  it('builds a replayable TAPD planner snapshot with before/after data', () => {
    const before = task(1);
    const after = { ...before, startDate: new Date('2026-07-08'), endDate: new Date('2026-07-09') };
    const snapshot = buildScheduleSnapshot({
      source: 'tapd-planner',
      status: 'applied',
      projectId: 7,
      reason: '应用排期建议',
      taskIds: [1, 1],
      tasksBefore: [before],
      tasksAfter: [after],
      resources: [resource],
      capacities: [{ resourceId: 1, dailyCapacity: 1, capacityFactor: 1, availabilityRatio: 1, maxParallelTasks: 3, updatedAt: 1 }],
      recommendations: [{ taskId: 1, resourceId: 1, startDate: after.startDate, endDate: after.endDate, decision: 'adjust', reasons: ['推荐日期发生变化'] }],
      changes: [{ taskId: 1, startDate: after.startDate!, endDate: after.endDate!, assigneeIds: [1] }],
      generatedAt: 10,
      appliedAt: 20,
    });

    expect(snapshot.kind).toBe('schedule-plan');
    expect(snapshot.projectId).toBe(7);
    expect(snapshot.date).toBe(20);
    expect(snapshot.scheduleData?.taskIds).toEqual([1]);
    expect(snapshot.scheduleData?.tasksBefore[0].startDate).toEqual(before.startDate);
    expect(snapshot.scheduleData?.tasksAfter?.[0].endDate).toEqual(after.endDate);
    expect(snapshot.scheduleData?.recommendations?.[0].decision).toBe('adjust');
  });

  it('keeps rejected validation reasons and does not require after data', () => {
    const snapshot = buildScheduleSnapshot({
      source: 'gantt-resize',
      status: 'rejected',
      reason: '甘特图调整被阻止',
      taskIds: [1],
      tasksBefore: [task(1)],
      resources: [],
      capacities: [],
      validation: { valid: false, reasons: ['突破父需求截止时间'], warnings: [] },
    });

    expect(snapshot.scheduleData?.status).toBe('rejected');
    expect(snapshot.scheduleData?.tasksAfter).toBeUndefined();
    expect(snapshot.scheduleData?.validation?.reasons).toEqual(['突破父需求截止时间']);
  });
});
