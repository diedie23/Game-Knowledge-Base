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
