import type { Resource, Task } from '../types';
import type { ResourceCapacity } from '../types/scheduling';
import { countWorkingDays } from '../utils/dateUtils';
import { getEffectiveDailyCapacity, mergeCapacity } from './capacityService';
import { isTaskTerminal } from '../utils/taskState';
import { taskStage } from './uxStageView';

export type TaskEffortSource = 'task' | 'existing_schedule' | 'stage_median' | 'fallback';

export interface TaskEffortEstimate {
  hours: number;
  source: TaskEffortSource;
}

/**
 * Shared scheduling context. Every scheduling surface should derive its
 * indexes and capacity values from this context instead of rebuilding its own
 * task/resource scans with a different capacity model.
 */
export interface ScheduleScenario {
  tasks: Task[];
  resources: Resource[];
  capacities: ResourceCapacity[];
  today: Date;
  taskById: Map<number, Task>;
  tasksByResourceId: Map<number, Task[]>;
  capacityByResourceId: Map<number, ResourceCapacity>;
}

export function createScheduleScenario(
  tasks: Task[],
  resources: Resource[],
  capacities: ResourceCapacity[] = [],
  today: Date = new Date(),
): ScheduleScenario {
  const taskById = new Map<number, Task>();
  const tasksByResourceId = new Map<number, Task[]>();
  tasks.forEach(task => {
    if (task.id !== undefined) taskById.set(task.id, task);
    (task.assigneeIds || []).forEach(resourceId => {
      const bucket = tasksByResourceId.get(resourceId) || [];
      bucket.push(task);
      tasksByResourceId.set(resourceId, bucket);
    });
  });

  return {
    tasks,
    resources,
    capacities,
    today,
    taskById,
    tasksByResourceId,
    capacityByResourceId: new Map(capacities.map(capacity => [capacity.resourceId, capacity])),
  };
}

export function getScenarioCapacity(
  resource: Resource,
  scenario: Pick<ScheduleScenario, 'capacityByResourceId'>,
): ResourceCapacity {
  return mergeCapacity(resource, resource.id === undefined ? undefined : scenario.capacityByResourceId.get(resource.id));
}

/** Effective daily work hours, shared by forecast, auto-scheduling and risk scoring. */
export function getResourceDailyHours(
  resource: Resource,
  scenario: Pick<ScheduleScenario, 'capacityByResourceId'>,
): number {
  return Math.max(0.8, getEffectiveDailyCapacity(getScenarioCapacity(resource, scenario)) * 8);
}

export function estimateTaskEffort(
  task: Task,
  tasks: Task[],
  resources: Resource[],
): TaskEffortEstimate {
  if (task.estimatedHours && task.estimatedHours > 0) {
    return { hours: task.estimatedHours, source: 'task' };
  }
  if (task.startDate && task.endDate) {
    return {
      hours: Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate))) * 8,
      source: 'existing_schedule',
    };
  }

  const stage = taskStage(task, resources);
  const samples = tasks
    .filter(candidate => candidate.id !== task.id && candidate.estimatedHours && candidate.estimatedHours > 0)
    .filter(candidate => taskStage(candidate, resources) === stage)
    .map(candidate => candidate.estimatedHours!)
    .sort((left, right) => left - right);

  if (samples.length > 0) {
    const middle = Math.floor(samples.length / 2);
    const median = samples.length % 2 === 0
      ? (samples[middle - 1] + samples[middle]) / 2
      : samples[middle];
    return { hours: Math.max(1, median), source: 'stage_median' };
  }

  return { hours: 16, source: 'fallback' };
}

export function taskDurationDays(
  task: Task,
  effortHours: number,
  dailyHours: number,
  maxDays = 20,
): number {
  if (task.startDate && task.endDate) {
    return Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate)));
  }
  return Math.max(1, Math.min(maxDays, Math.ceil(effortHours / Math.max(0.8, dailyHours))));
}

export function taskHoursPerWorkingDay(task: Task): number {
  if (!task.startDate || !task.endDate) return Math.max(1, task.estimatedHours || 8);
  const days = Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate)));
  return Math.max(1, (task.estimatedHours || days * 8) / days);
}

export function getActiveLeafTasks(tasks: Task[]): Task[] {
  const parentIds = new Set<number>();
  tasks.forEach(task => {
    if (task.parentId !== undefined) parentIds.add(task.parentId);
  });
  return tasks.filter(task =>
    (!task.id || !parentIds.has(task.id)) &&
    !isTaskTerminal(task) &&
    task.status !== 'paused',
  );
}
