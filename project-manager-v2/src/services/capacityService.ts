import type { Resource, Task } from '../types';
import type { ResourceCapacity } from '../types/scheduling';
import { format } from 'date-fns';
import { getActiveLeafTasks } from '../utils/taskHierarchy';

export interface ResourceAvailability {
  available: boolean;
  /** Capacity multiplier for non-full-time modes. */
  capacityMultiplier: number;
  reason?: string;
}

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

export function getEffectiveDailyCapacity(capacity?: ResourceCapacity, resource?: Resource): number {
  const value = capacity ?? ({
    resourceId: 0,
    ...DEFAULT_RESOURCE_CAPACITY,
    updatedAt: 0,
  } satisfies ResourceCapacity);
  const modeMultiplier = resource
    ? getResourceAvailability(resource, new Date()).capacityMultiplier
    : 1;

  return Math.max(0, Number((
    value.dailyCapacity *
    value.capacityFactor *
    value.availabilityRatio *
    modeMultiplier
  ).toFixed(2)));
}

export function getResourceAvailability(resource: Resource, date: Date): ResourceAvailability {
  const dateKey = format(date, 'yyyy-MM-dd');
  if (resource.status === 'departed') return { available: false, capacityMultiplier: 0, reason: '已离职' };
  if (resource.joinDate && dateKey < resource.joinDate) {
    return { available: false, capacityMultiplier: 0, reason: '尚未入职' };
  }
  if (resource.departDate && dateKey > resource.departDate) {
    return { available: false, capacityMultiplier: 0, reason: '已过离职日期' };
  }
  if ((resource.leaveDates || []).includes(dateKey)) {
    return { available: false, capacityMultiplier: 0, reason: '休假' };
  }
  if (resource.status === 'sick') return { available: false, capacityMultiplier: 0, reason: '病假' };
  if (resource.status === 'leave') return { available: false, capacityMultiplier: 0, reason: '休假' };
  if (resource.status === 'focus') return { available: true, capacityMultiplier: 0.7, reason: '专注模式' };
  if (resource.status === 'wfh') return { available: true, capacityMultiplier: 0.8, reason: '居家办公' };
  return { available: true, capacityMultiplier: 1 };
}

export function isResourceAvailableOn(resource: Resource, date: Date): boolean {
  return getResourceAvailability(resource, date).available;
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
    effectiveDailyCapacity: getEffectiveDailyCapacity(capacity, resource),
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
