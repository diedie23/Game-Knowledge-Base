import type { ProjectCalendarConfig, Resource, Task } from '../types';
import type { ResourceCapacity } from '../types/scheduling';
import { DEFAULT_PROJECT_CALENDAR, getNextWorkingDays } from '../utils/dateUtils';
import { resourceStage, STAGES, taskStage, type CoreUxStage } from './uxStageView';
import { countAvailableWorkingDays } from './capacityService';
import { createScheduleScenario, estimateTaskEffort, getActiveLeafTasks, getResourceDailyHours } from './schedulingKernel';

export interface StageCapacityForecast {
  stage: CoreUxStage;
  label: string;
  resourceCount: number;
  capacityHours: number;
  scheduledHours: number;
  pendingHours: number;
  utilization: number;
  projectedUtilization: number;
  availableHours: number;
  status: 'healthy' | 'warning' | 'danger';
  scheduledTaskCount: number;
  pendingTaskCount: number;
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function buildStageCapacityForecast(
  tasks: Task[],
  resources: Resource[],
  today: Date = new Date(),
  workingDays = 10,
  capacities: ResourceCapacity[] = [],
  calendarConfig: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR,
): StageCapacityForecast[] {
  const start = startOfDay(today);
  const days = getNextWorkingDays(start, workingDays, calendarConfig);
  const end = days[days.length - 1];
  const activeLeaves = getActiveLeafTasks(tasks);
  const scenario = createScheduleScenario(tasks, resources, capacities, start, calendarConfig);

  return STAGES.map(({ key, label }) => {
    const stageResources = resources.filter(resource => resourceStage(resource) === key && resource.status !== 'departed');
    const stageTasks = activeLeaves.filter(task => taskStage(task, resources) === key);
    const scheduled = stageTasks.filter(task => task.startDate && task.endDate && startOfDay(task.startDate) <= end && startOfDay(task.endDate) >= start);
    const pending = stageTasks.filter(task => !task.startDate || !task.endDate);
    const capacityHours = Math.round(stageResources.reduce(
      (sum, resource) => sum + getResourceDailyHours(resource, scenario) * countAvailableWorkingDays(resource, days),
      0,
    ));
    const scheduledHours = scheduled.reduce((sum, task) => sum + estimateTaskEffort(task, tasks, resources, calendarConfig).hours, 0);
    const pendingHours = pending.reduce((sum, task) => sum + estimateTaskEffort(task, tasks, resources, calendarConfig).hours, 0);
    const utilization = capacityHours ? Math.round((scheduledHours / capacityHours) * 100) : scheduledHours ? 999 : 0;
    const projectedUtilization = capacityHours ? Math.round(((scheduledHours + pendingHours) / capacityHours) * 100) : scheduledHours + pendingHours ? 999 : 0;
    const status: StageCapacityForecast['status'] = projectedUtilization > 100 ? 'danger' : projectedUtilization >= 85 ? 'warning' : 'healthy';
    return {
      stage: key,
      label,
      resourceCount: stageResources.length,
      capacityHours,
      scheduledHours,
      pendingHours,
      utilization,
      projectedUtilization,
      availableHours: Math.max(0, capacityHours - scheduledHours),
      status,
      scheduledTaskCount: scheduled.length,
      pendingTaskCount: pending.length,
    };
  });
}
