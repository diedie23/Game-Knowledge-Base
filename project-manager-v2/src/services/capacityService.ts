import type { Resource, Task } from '../types';
import type { ResourceCapacity } from '../types/scheduling';
import { format } from 'date-fns';
import { getActiveLeafTasks } from '../utils/taskHierarchy';

export const DEFAULT_RESOURCE_CAPACITY: Omit<ResourceCapacity, 'resourceId' | 'updatedAt'> = {
  dailyCapacity: 1,
  capacityFactor: 1,
  maxParallelTasks: 3,
  availabilityRatio: 0.8,
};

export interface CapacitySnapshot {
  resourceId: number;
  resourceName: string;
  role: string;
  dailyCapacity: number;
  effectiveDailyCapacity: number;
  maxParallelTasks: number;
  activeTaskCount: number;
  wipUtilization: number;
  status: 'available' | 'busy' | 'overloaded' | 'unavailable';
}

export function getEffectiveDailyCapacity(capacity?: ResourceCapacity): number {
  const value = capacity ?? ({
    resourceId: 0,
    ...DEFAULT_RESOURCE_CAPACITY,
    updatedAt: 0,
  } satisfies ResourceCapacity);

  return Math.max(0, Number((
    value.dailyCapacity *
    value.capacityFactor *
    value.availabilityRatio
  ).toFixed(2)));
}

export function isResourceAvailableOn(resource: Resource, date: Date): boolean {
  if (resource.status === 'departed') return false;
  const dateKey = format(date, 'yyyy-MM-dd');
  // leaveDates is the date-specific source of truth. A stale static `leave`
  // status without a matching date must not remove future capacity.
  return !(resource.leaveDates || []).includes(dateKey);
}

export function countAvailableWorkingDays(resource: Resource, days: Date[]): number {
  return days.filter(day => isResourceAvailableOn(resource, day)).length;
}

export function mergeCapacity(
  resource: Resource,
  saved?: ResourceCapacity,
): ResourceCapacity {
  if (saved) return saved;
  return {
    resourceId: resource.id ?? 0,
    ...DEFAULT_RESOURCE_CAPACITY,
    updatedAt: Date.now(),
  };
}

export function countActiveTasks(tasks: Task[], resourceId: number): number {
  return getActiveLeafTasks(tasks).filter(task => task.assigneeIds?.includes(resourceId)).length;
}

export function buildCapacitySnapshot(
  resource: Resource,
  tasks: Task[],
  saved?: ResourceCapacity,
): CapacitySnapshot {
  const capacity = mergeCapacity(resource, saved);
  const activeTaskCount = resource.id === undefined
    ? 0
    : countActiveTasks(tasks, resource.id);

  const wipUtilization = capacity.maxParallelTasks > 0
    ? activeTaskCount / capacity.maxParallelTasks
    : 0;

  let status: CapacitySnapshot['status'] = 'available';

  if (!isResourceAvailableOn(resource, new Date())) {
    status = 'unavailable';
  } else if (activeTaskCount >= capacity.maxParallelTasks) {
    status = 'overloaded';
  } else if (wipUtilization >= 0.67) {
    status = 'busy';
  }

  return {
    resourceId: resource.id ?? 0,
    resourceName: resource.name,
    role: resource.role,
    dailyCapacity: capacity.dailyCapacity,
    effectiveDailyCapacity: getEffectiveDailyCapacity(capacity),
    maxParallelTasks: capacity.maxParallelTasks,
    activeTaskCount,
    wipUtilization,
    status,
  };
}

export function canAcceptMoreWork(
  snapshot: CapacitySnapshot,
): boolean {
  return snapshot.status !== 'unavailable' &&
    snapshot.activeTaskCount < snapshot.maxParallelTasks;
}
