import { db } from '../db/db';
import type { Resource, ResourceCapacity, Task } from '../types';
import type { ChangeSnapshot } from '../types';

export type ScheduleSnapshotSource = 'tapd-planner' | 'gantt-move' | 'gantt-resize';

export interface ScheduleSnapshotRecommendation {
  taskId: number;
  resourceId?: number;
  startDate?: Date;
  endDate?: Date;
  decision?: string;
  reasons?: string[];
}

export interface ScheduleSnapshotChange {
  taskId: number;
  startDate: Date;
  endDate: Date;
  assigneeIds?: number[];
}

export interface ScheduleSnapshotValidation {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  beforeAfter?: {
    beforeEndDate?: Date;
    afterEndDate?: Date;
    shiftedTaskCount: number;
    shiftedWorkingDays: number;
  };
}

export interface ScheduleSnapshotInput {
  source: ScheduleSnapshotSource;
  status: 'generated' | 'applied' | 'rejected';
  projectId?: number;
  reason: string;
  description?: string;
  taskIds: number[];
  tasksBefore: Task[];
  tasksAfter?: Task[];
  resources: Resource[];
  capacities: ResourceCapacity[];
  recommendations?: ScheduleSnapshotRecommendation[];
  changes?: ScheduleSnapshotChange[];
  validation?: ScheduleSnapshotValidation;
  generatedAt?: number;
  appliedAt?: number;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildScheduleSnapshot(input: ScheduleSnapshotInput): ChangeSnapshot {
  const snapshot: ChangeSnapshot = {
    id: crypto.randomUUID(),
    date: input.appliedAt || input.generatedAt || Date.now(),
    reason: input.reason,
    description: input.description,
    kind: 'schedule-plan',
    projectId: input.projectId,
    scheduleData: {
      source: input.source,
      status: input.status,
      generatedAt: input.generatedAt || Date.now(),
      appliedAt: input.appliedAt,
      taskIds: [...new Set(input.taskIds)],
      tasksBefore: clone(input.tasksBefore),
      tasksAfter: input.tasksAfter ? clone(input.tasksAfter) : undefined,
      resources: clone(input.resources),
      capacities: clone(input.capacities),
      recommendations: input.recommendations ? clone(input.recommendations) : undefined,
      changes: input.changes ? clone(input.changes) : undefined,
      validation: input.validation ? clone(input.validation) : undefined,
    },
  };
  return snapshot;
}

export async function createScheduleSnapshot(input: ScheduleSnapshotInput): Promise<ChangeSnapshot> {
  const snapshot = buildScheduleSnapshot(input);
  await db.changeSnapshots.add(snapshot);
  return snapshot;
}

export async function listScheduleSnapshots(projectId?: number): Promise<ChangeSnapshot[]> {
  const snapshots = await db.changeSnapshots.orderBy('date').reverse().toArray();
  return snapshots.filter(snapshot => snapshot.kind === 'schedule-plan'
    && (projectId === undefined || snapshot.projectId === projectId));
}

export interface ScheduleSnapshotTaskComparison {
  taskId: number;
  title: string;
  first?: Task;
  second?: Task;
  startChanged: boolean;
  endChanged: boolean;
  assigneesChanged: boolean;
  changed: boolean;
  state: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface ScheduleSnapshotComparison {
  first: ChangeSnapshot;
  second: ChangeSnapshot;
  rows: ScheduleSnapshotTaskComparison[];
  changedCount: number;
  unchangedCount: number;
  addedCount: number;
  removedCount: number;
}

function snapshotTaskState(snapshot: ChangeSnapshot): Map<number, Task> {
  const scheduleData = snapshot.scheduleData;
  if (!scheduleData) return new Map();
  const before = new Map(scheduleData.tasksBefore.filter(task => task.id !== undefined).map(task => [task.id!, clone(task)]));
  if (scheduleData.tasksAfter && scheduleData.tasksAfter.length > 0) {
    return new Map(scheduleData.tasksAfter.filter(task => task.id !== undefined).map(task => [task.id!, clone(task)]));
  }
  // Generated snapshots may not have persisted after-state. Reconstruct the
  // proposed state from the immutable before-state plus recorded changes.
  scheduleData.changes?.forEach(change => {
    const task = before.get(change.taskId);
    if (!task) return;
    before.set(change.taskId, {
      ...task,
      startDate: clone(change.startDate),
      endDate: clone(change.endDate),
      assigneeIds: change.assigneeIds ? [...change.assigneeIds] : task.assigneeIds,
    });
  });
  return before;
}

function sameDate(left?: Date, right?: Date): boolean {
  const leftTime = left ? new Date(left).getTime() : undefined;
  const rightTime = right ? new Date(right).getTime() : undefined;
  return leftTime === rightTime;
}

function sameAssignees(left?: number[], right?: number[]): boolean {
  const normalize = (value?: number[]) => [...new Set((value || []).map(Number))].sort((a, b) => a - b);
  const first = normalize(left);
  const second = normalize(right);
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

export function compareScheduleSnapshots(
  first: ChangeSnapshot,
  second: ChangeSnapshot,
): ScheduleSnapshotComparison {
  const firstTasks = snapshotTaskState(first);
  const secondTasks = snapshotTaskState(second);
  const taskIds = [...new Set([...firstTasks.keys(), ...secondTasks.keys()])].sort((a, b) => a - b);
  const rows = taskIds.map(taskId => {
    const before = firstTasks.get(taskId);
    const after = secondTasks.get(taskId);
    const startChanged = !sameDate(before?.startDate, after?.startDate);
    const endChanged = !sameDate(before?.endDate, after?.endDate);
    const assigneesChanged = !sameAssignees(before?.assigneeIds, after?.assigneeIds);
    const changed = startChanged || endChanged || assigneesChanged;
    const state = !before ? 'added' : !after ? 'removed' : changed ? 'changed' : 'unchanged';
    return {
      taskId,
      title: after?.title || before?.title || `任务 #${taskId}`,
      first: before,
      second: after,
      startChanged,
      endChanged,
      assigneesChanged,
      changed,
      state,
    } satisfies ScheduleSnapshotTaskComparison;
  });
  return {
    first,
    second,
    rows,
    changedCount: rows.filter(row => row.state === 'changed').length,
    unchangedCount: rows.filter(row => row.state === 'unchanged').length,
    addedCount: rows.filter(row => row.state === 'added').length,
    removedCount: rows.filter(row => row.state === 'removed').length,
  };
}
