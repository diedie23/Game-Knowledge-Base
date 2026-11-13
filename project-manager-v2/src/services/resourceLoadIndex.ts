import { format } from 'date-fns';
import type { Resource, Task } from '../types';
import { buildResourceAliasIndex, dedupeResourcesForDisplay } from '../utils/resourceDedup';
import { getActiveLeafTasks } from '../utils/taskHierarchy';
import { getTaskAssigneeIds } from '../utils/taskAssignee';
import { DEFAULT_RESOURCE_CAPACITY, mergeCapacity } from './capacityService';
import type { ResourceCapacity } from '../types/scheduling';

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
  _parentTaskIds: Set<number>,
  capacities: ResourceCapacity[] = [],
): ResourceLoadIndex {
  const visibleResources = dedupeResourcesForDisplay(
    resources.filter(resource => resource.status !== 'departed' && resource.id != null),
  );
  const visibleByAssignmentId = new Map<number, number>();
  const resourceAliasesById = buildResourceAliasIndex(resources);
  const capacityByResourceId = new Map(capacities.map(capacity => [capacity.resourceId, capacity]));
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
    for (const aliasId of resourceAliasesById.get(resourceId) || [resourceId]) {
      visibleByAssignmentId.set(aliasId, resourceId);
    }
  }

  const requestedDays = days.map(day => ({ date: day, key: dayKey(day) }));

  const activeLeafIds = new Set(getActiveLeafTasks(tasks).map(task => task.id).filter((id): id is number => id !== undefined));
  for (const task of tasks) {
    if (task.id !== undefined && (!activeLeafIds.has(task.id) || _parentTaskIds.has(task.id))) continue;
    const taskAssigneeIds = getTaskAssigneeIds(task);
    if (!task.startDate || !task.endDate || taskAssigneeIds.length === 0) continue;

    const assignedResourceIds = new Set<number>();
    for (const assignmentId of taskAssigneeIds) {
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
  let maxConfiguredWip = DEFAULT_RESOURCE_CAPACITY.maxParallelTasks;
  for (const resource of visibleResources) {
    const resourceId = resource.id!;
    const loadDates = loadByResourceDate.get(resourceId)!;
    const wipLimit = mergeCapacity(resource, capacityByResourceId.get(resourceId)).maxParallelTasks;
    maxConfiguredWip = Math.max(maxConfiguredWip, wipLimit);
    let overloadDays = 0;
    for (const requestedDay of requestedDays) {
      const load = loadDates.get(requestedDay.key) || 0;
      if (load > maxLoad) maxLoad = load;
      if (load >= wipLimit) overloadDays += 1;
    }
    overloadDaysByResource.set(resourceId, overloadDays);
  }

  return {
    tasksByResourceDate,
    loadByResourceDate,
    tasksByResource,
    totalTasksByResource,
    overloadDaysByResource,
    maxLoad: Math.max(maxLoad, maxConfiguredWip),
  };
}
