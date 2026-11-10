import type { ProjectCalendarConfig, Resource, Task } from '../types';
import type { ResourceCapacity } from '../types/scheduling';
import { countWorkingDays, DEFAULT_PROJECT_CALENDAR } from '../utils/dateUtils';
import { getEffectiveDailyCapacity, mergeCapacity } from './capacityService';
import { taskStage } from './uxStageView';
import { getActiveLeafTasks as getCanonicalActiveLeafTasks } from '../utils/taskHierarchy';
import { getTaskAssigneeIds } from '../utils/taskAssignee';

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
  calendarConfig: ProjectCalendarConfig;
  taskById: Map<number, Task>;
  tasksByResourceId: Map<number, Task[]>;
  capacityByResourceId: Map<number, ResourceCapacity>;
}

export function createScheduleScenario(
  tasks: Task[],
  resources: Resource[],
  capacities: ResourceCapacity[] = [],
  today: Date = new Date(),
  calendarConfig: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR,
): ScheduleScenario {
  const taskById = new Map<number, Task>();
  const tasksByResourceId = new Map<number, Task[]>();
  tasks.forEach(task => {
    if (task.id !== undefined) taskById.set(task.id, task);
    getTaskAssigneeIds(task).forEach(resourceId => {
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
    calendarConfig,
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
  // Zero availability is a real capacity state (leave / unavailable), not a
  // reason to manufacture a minimum 6.4h workday.
  return Math.max(0, getEffectiveDailyCapacity(getScenarioCapacity(resource, scenario)) * 8);
}

export function estimateTaskEffort(
  task: Task,
  tasks: Task[],
  resources: Resource[],
  calendarConfig: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR,
): TaskEffortEstimate {
  if (task.estimatedHours && task.estimatedHours > 0) {
    return { hours: task.estimatedHours, source: 'task' };
  }
  if (task.startDate && task.endDate) {
    return {
      hours: Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate), calendarConfig)) * 8,
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
  calendarConfig: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR,
): number {
  if (task.startDate && task.endDate) {
    return Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate), calendarConfig));
  }
  return Math.max(1, Math.min(maxDays, Math.ceil(effortHours / Math.max(0.1, dailyHours))));
}

export function taskHoursPerWorkingDay(task: Task, calendarConfig: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): number {
  if (!task.startDate || !task.endDate) return Math.max(1, task.estimatedHours || 8);
  const days = Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate), calendarConfig));
  return Math.max(1, (task.estimatedHours || days * 8) / days);
}

export function getActiveLeafTasks(tasks: Task[]): Task[] {
  return getCanonicalActiveLeafTasks(tasks);
}
