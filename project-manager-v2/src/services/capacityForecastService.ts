import type { Resource, Task } from '../types';
import { countWorkingDays, getNextWorkingDays } from '../utils/dateUtils';
import { isTaskTerminal } from '../utils/taskState';
import { resourceStage, STAGES, taskStage, type CoreUxStage } from './uxStageView';

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

function taskHours(task: Task): number {
  if (task.estimatedHours && task.estimatedHours > 0) return task.estimatedHours;
  if (task.startDate && task.endDate) return Math.max(8, countWorkingDays(startOfDay(task.startDate), startOfDay(task.endDate)) * 8);
  return 16;
}

export function buildStageCapacityForecast(
  tasks: Task[],
  resources: Resource[],
  today: Date = new Date(),
  workingDays = 10,
): StageCapacityForecast[] {
  const start = startOfDay(today);
  const days = getNextWorkingDays(start, workingDays);
  const end = days[days.length - 1];
  const parentIds = new Set(tasks.flatMap(task => task.parentId ? [task.parentId] : []));
  const activeLeaves = tasks.filter(task => (!task.id || !parentIds.has(task.id)) && !isTaskTerminal(task) && task.status !== 'paused');

  return STAGES.map(({ key, label }) => {
    const stageResources = resources.filter(resource => resource.status !== 'departed' && resourceStage(resource) === key);
    const stageTasks = activeLeaves.filter(task => taskStage(task, resources) === key);
    const scheduled = stageTasks.filter(task => task.startDate && task.endDate && startOfDay(task.startDate) <= end && startOfDay(task.endDate) >= start);
    const pending = stageTasks.filter(task => !task.startDate || !task.endDate);
    const capacityHours = stageResources.length * days.length * 8;
    const scheduledHours = scheduled.reduce((sum, task) => sum + taskHours(task), 0);
    const pendingHours = pending.reduce((sum, task) => sum + taskHours(task), 0);
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
