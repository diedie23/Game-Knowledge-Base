import { db } from '../db/db';
import type { ProjectCalendarConfig, Resource, ResourceCapacity, Task } from '../types';
import { trackedDb } from '../store/useHistoryStore';
import { syncParentDateRange } from './workloadService';
import {
  formatGanttValidationMessage,
  validateGanttScheduleChanges,
  type GanttDateChange,
  type GanttScheduleValidation,
} from './ganttScheduleValidator';
import {
  createScheduleSnapshot,
  type ScheduleSnapshotRecommendation,
  type ScheduleSnapshotSource,
} from './scheduleSnapshotService';

export interface ApplyScheduleChangesInput {
  source: ScheduleSnapshotSource;
  tasks: Task[];
  resources: Resource[];
  capacities: ResourceCapacity[];
  calendarConfig?: ProjectCalendarConfig;
  changes: GanttDateChange[];
  reason: string;
  description?: string;
  projectId?: number;
  recommendations?: ScheduleSnapshotRecommendation[];
  generatedAt?: number;
}

export interface ApplyScheduleChangesResult {
  applied: boolean;
  validation: GanttScheduleValidation;
  taskIds: number[];
  tasksBefore: Task[];
  tasksAfter?: Task[];
  message: string;
}

function uniqueChanges(changes: GanttDateChange[]): GanttDateChange[] {
  return [...new Map(changes.map(change => [change.taskId, change])).values()];
}

function parentIds(tasks: Task[], taskIds: Set<number>): number[] {
  return [...new Set(
    tasks
      .filter(task => task.id !== undefined && taskIds.has(task.id) && task.parentId)
      .map(task => task.parentId!)
      .filter((id): id is number => Number.isFinite(id)),
  )];
}

/**
 * Apply all date changes through one entry point so Gantt move/resize paths
 * share validation, history tracking, parent aggregation and snapshots.
 */
export async function applyScheduleChanges(input: ApplyScheduleChangesInput): Promise<ApplyScheduleChangesResult> {
  const changes = uniqueChanges(input.changes).filter(change => Number.isFinite(change.taskId));
  const taskIds = changes.map(change => change.taskId);
  const affectedParentIds = parentIds(input.tasks, new Set(taskIds));
  const snapshotBeforeIds = [...new Set([...taskIds, ...affectedParentIds])];
  const tasksBefore = snapshotBeforeIds.length > 0
    ? await db.tasks.where('id').anyOf(snapshotBeforeIds).toArray()
    : [];
  const validation = validateGanttScheduleChanges({
    tasks: input.tasks,
    resources: input.resources,
    capacities: input.capacities,
    calendarConfig: input.calendarConfig,
    changes,
  });

  if (!validation.valid || changes.length === 0) {
    await createScheduleSnapshot({
      source: input.source,
      status: 'rejected',
      projectId: input.projectId || tasksBefore[0]?.projectId,
      reason: input.reason,
      description: input.description,
      taskIds,
      tasksBefore,
      resources: input.resources,
      capacities: input.capacities,
      changes,
      recommendations: input.recommendations,
      validation,
      generatedAt: input.generatedAt,
    });
    return {
      applied: false,
      validation,
      taskIds,
      tasksBefore,
      message: changes.length === 0 ? '没有可应用的排期变更' : formatGanttValidationMessage(validation),
    };
  }

  await trackedDb.tasks.bulkUpdate(
    changes.map(change => ({
      id: change.taskId,
      changes: {
        startDate: change.startDate,
        endDate: change.endDate,
        ...(change.assigneeIds ? { assigneeIds: [...change.assigneeIds] } : {}),
      },
    })),
    input.reason,
  );

  for (const parentId of affectedParentIds) {
    await syncParentDateRange(parentId);
  }

  const affectedIds = snapshotBeforeIds;
  const tasksAfter = await db.tasks.where('id').anyOf(affectedIds).toArray();
  await createScheduleSnapshot({
    source: input.source,
    status: 'applied',
    projectId: input.projectId || tasksBefore[0]?.projectId,
    reason: input.reason,
    description: input.description,
    taskIds: affectedIds,
    tasksBefore,
    tasksAfter,
    resources: input.resources,
    capacities: input.capacities,
    changes,
    recommendations: input.recommendations,
    validation,
    generatedAt: input.generatedAt,
    appliedAt: Date.now(),
  });

  return {
    applied: true,
    validation,
    taskIds: affectedIds,
    tasksBefore,
    tasksAfter,
    message: formatGanttValidationMessage(validation),
  };
}
