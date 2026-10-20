import { format } from 'date-fns';
import type { Resource, Task } from '../types';
import { dedupeResourcesForDisplay, getResourceAliasIds } from '../utils/resourceDedup';

export interface ResourceLoadIndex {
  /** Tasks grouped by visible resource and calendar day. */
  tasksByResourceDate: Map<number, Map<string, Task[]>>;
  /** Number of active leaf tasks grouped by visible resource and calendar day. */
  loadByResourceDate: Map<number, Map<string, number>>;
  /** All active leaf tasks assigned to each visible resource, regardless of date window. */
  tasksByResource: Map<number, Task[]>;
  /** Total active leaf tasks assigned to each visible resource. */
  totalTasksByResource: Map<number, number>;
  /** Number of days with at least three active leaf tasks. */
  overloadDaysByResource: Map<number, number>;
  /** Highest daily load across all visible resources and requested days. */
  maxLoad: number;
}

function dayKey(day: Date): string {
  return format(day, 'yyyy-MM-dd');
}

function startOfCalendarDay(value: Date | string | number): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfCalendarDay(value: Date | string | number): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Build the resource/date load index once per task/resource/date snapshot.
 * This replaces repeated resource × day × task filtering in ResourceMatrix.
 */
export function buildResourceLoadIndex(
  tasks: Task[],
  resources: Resource[],
  days: Date[],
  parentTaskIds: Set<number>,
): ResourceLoadIndex {
  const visibleResources = dedupeResourcesForDisplay(
    resources.filter(resource => resource.status !== 'departed' && resource.id != null),
  );
  const visibleByAssignmentId = new Map<number, number>();
  const tasksByResourceDate = new Map<number, Map<string, Task[]>>();
  const loadByResourceDate = new Map<number, Map<string, number>>();
  const tasksByResource = new Map<number, Task[]>();
  const totalTasksByResource = new Map<number, number>();
  const overloadDaysByResource = new Map<number, number>();

  for (const resource of visibleResources) {
    const resourceId = resource.id!;
    tasksByResourceDate.set(resourceId, new Map());
    loadByResourceDate.set(resourceId, new Map());
    tasksByResource.set(resourceId, []);
    totalTasksByResource.set(resourceId, 0);
    overloadDaysByResource.set(resourceId, 0);
    for (const aliasId of getResourceAliasIds(resource, resources)) {
      visibleByAssignmentId.set(aliasId, resourceId);
    }
  }

  const requestedDays = days.map(day => ({ date: day, key: dayKey(day) }));

  for (const task of tasks) {
    if (
      task.status === 'done'
      || (task.id != null && parentTaskIds.has(task.id))
      || !task.startDate
      || !task.endDate
      || !task.assigneeIds?.length
    ) {
      continue;
    }

    const assignedResourceIds = new Set<number>();
    for (const assignmentId of task.assigneeIds) {
      const visibleResourceId = visibleByAssignmentId.get(assignmentId);
      if (visibleResourceId != null) assignedResourceIds.add(visibleResourceId);
    }
    if (assignedResourceIds.size === 0) continue;

    const start = startOfCalendarDay(task.startDate);
    const end = endOfCalendarDay(task.endDate);
    for (const resourceId of assignedResourceIds) {
      totalTasksByResource.set(resourceId, (totalTasksByResource.get(resourceId) || 0) + 1);
      tasksByResource.get(resourceId)!.push(task);
      const taskDates = tasksByResourceDate.get(resourceId)!;
      const loadDates = loadByResourceDate.get(resourceId)!;
      for (const requestedDay of requestedDays) {
        if (requestedDay.date < start || requestedDay.date > end) continue;
        const bucket = taskDates.get(requestedDay.key) || [];
        bucket.push(task);
        taskDates.set(requestedDay.key, bucket);
        loadDates.set(requestedDay.key, bucket.length);
      }
    }
  }

  let maxLoad = 0;
  for (const resourceId of visibleResources.map(resource => resource.id!)) {
    const loadDates = loadByResourceDate.get(resourceId)!;
    let overloadDays = 0;
    for (const requestedDay of requestedDays) {
      const load = loadDates.get(requestedDay.key) || 0;
      if (load > maxLoad) maxLoad = load;
      if (load >= 3) overloadDays += 1;
    }
    overloadDaysByResource.set(resourceId, overloadDays);
  }

  return {
    tasksByResourceDate,
    loadByResourceDate,
    tasksByResource,
    totalTasksByResource,
    overloadDaysByResource,
    maxLoad: Math.max(maxLoad, 3),
  };
}
