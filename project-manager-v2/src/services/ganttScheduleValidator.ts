import { addDays, startOfDay } from 'date-fns';
import type { Resource, Task } from '../types';
import type { ResourceCapacity } from '../types/scheduling';
import { countWorkingDays, isWorkingDay } from '../utils/dateUtils';
import { getActiveLeafTasks } from '../utils/taskHierarchy';
import { isTaskTerminal } from '../utils/taskState';
import { isResourceAvailableOn } from './capacityService';
import { estimateTaskEffort, getResourceDailyHours } from './schedulingKernel';

export interface GanttDateChange {
  taskId: number;
  startDate: Date;
  endDate: Date;
}

export interface GanttScheduleValidationInput {
  tasks: Task[];
  resources?: Resource[];
  capacities?: ResourceCapacity[];
  changes: GanttDateChange[];
}

export interface GanttScheduleValidation {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  affectedTaskIds: number[];
  overloadedResourceIds: number[];
  deadlineTaskIds: number[];
  dependencyTaskIds: number[];
  beforeAfter: {
    beforeEndDate?: Date;
    afterEndDate?: Date;
    shiftedTaskCount: number;
    shiftedWorkingDays: number;
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function taskLabel(task: Task | undefined, fallback: number): string {
  return task?.title || `任务 #${fallback}`;
}

function dateKey(date: Date): number {
  return startOfDay(date).getTime();
}

function buildMergedTasks(tasks: Task[], changes: GanttDateChange[]): Map<number, Task> {
  const changeById = new Map(changes.map(change => [change.taskId, change]));
  return new Map(
    tasks
      .filter(task => task.id !== undefined)
      .map(task => {
        const change = changeById.get(task.id!);
        return [task.id!, change ? { ...task, startDate: change.startDate, endDate: change.endDate } : task] as const;
      }),
  );
}

function listWorkingDays(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(startDate);
  const end = startOfDay(endDate);
  while (cursor <= end) {
    if (isWorkingDay(cursor)) days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

function compareDateRange(tasks: Map<number, Task>, changes: GanttDateChange[]) {
  const changedTasks = changes
    .map(change => ({ change, task: tasks.get(change.taskId) }))
    .filter((entry): entry is { change: GanttDateChange; task: Task } => !!entry.task);
  if (!changedTasks.length) {
    return { beforeEndDate: undefined, afterEndDate: undefined, shiftedTaskCount: 0, shiftedWorkingDays: 0 };
  }
  const beforeEndDate = new Date(Math.max(...changedTasks.map(({ task }) => task.endDate?.getTime() || 0)));
  const afterEndDate = new Date(Math.max(...changedTasks.map(({ change }) => change.endDate.getTime())));
  const shiftedWorkingDays = changedTasks.reduce((sum, { task, change }) => {
    if (!task.startDate || !task.endDate) return sum;
    return sum + Math.abs(
      countWorkingDays(task.startDate, task.endDate)
      - countWorkingDays(change.startDate, change.endDate),
    );
  }, 0);
  return {
    beforeEndDate: Number.isFinite(beforeEndDate.getTime()) ? beforeEndDate : undefined,
    afterEndDate: Number.isFinite(afterEndDate.getTime()) ? afterEndDate : undefined,
    shiftedTaskCount: changedTasks.length,
    shiftedWorkingDays,
  };
}

function validateWorkingDayBoundaries(
  tasks: Map<number, Task>,
  changes: GanttDateChange[],
  warnings: string[],
  reasons: string[],
): void {
  for (const change of changes) {
    const task = tasks.get(change.taskId);
    if (!task) continue;
    if (change.startDate > change.endDate) {
      reasons.push(`${taskLabel(task, change.taskId)} 的开始时间不能晚于结束时间`);
      continue;
    }
    if (!isWorkingDay(change.startDate) || !isWorkingDay(change.endDate)) {
      reasons.push(`${taskLabel(task, change.taskId)} 的排期边界必须落在工作日`);
    }
    if (task.startDate && task.endDate && (
      dateKey(task.startDate) !== dateKey(change.startDate)
      || dateKey(task.endDate) !== dateKey(change.endDate)
    )) {
      warnings.push(`${taskLabel(task, change.taskId)} 将从 ${task.startDate.toLocaleDateString('zh-CN')}–${task.endDate.toLocaleDateString('zh-CN')} 调整为 ${change.startDate.toLocaleDateString('zh-CN')}–${change.endDate.toLocaleDateString('zh-CN')}`);
    }
  }
}

function validateDependencies(
  tasks: Map<number, Task>,
  changes: GanttDateChange[],
  reasons: string[],
  dependencyTaskIds: number[],
): void {
  const changedIds = new Set(changes.map(change => change.taskId));
  for (const task of tasks.values()) {
    if (isTaskTerminal(task)) continue;
    for (const dependencyId of task.dependencies || []) {
      const dependency = tasks.get(dependencyId);
      if (!dependency) {
        if (changedIds.has(task.id!)) {
          dependencyTaskIds.push(task.id!);
          reasons.push(`${taskLabel(task, task.id!)} 存在未找到的前置任务 #${dependencyId}`);
        }
        continue;
      }
      if (isTaskTerminal(dependency) || !dependency.endDate || !task.startDate) continue;
      if (dependency.endDate > task.startDate && (changedIds.has(task.id!) || changedIds.has(dependency.id!))) {
        dependencyTaskIds.push(task.id!);
        reasons.push(`${taskLabel(task, task.id!)} 的开始时间早于前置任务「${taskLabel(dependency, dependency.id!)}」完成时间`);
      }
    }
  }
}

function validateParentDeadlines(
  tasks: Map<number, Task>,
  changes: GanttDateChange[],
  reasons: string[],
  deadlineTaskIds: number[],
): void {
  const changedIds = new Set(changes.map(change => change.taskId));
  for (const change of changes) {
    const task = tasks.get(change.taskId);
    if (!task?.parentId) continue;
    const parent = tasks.get(task.parentId);
    if (!parent?.endDate || change.endDate <= parent.endDate) continue;
    deadlineTaskIds.push(change.taskId);
    reasons.push(`${taskLabel(task, change.taskId)} 调整后将突破父需求「${taskLabel(parent, parent.id!)}」截止时间 ${parent.endDate.toLocaleDateString('zh-CN')}`);
  }
  for (const task of tasks.values()) {
    if (!task.parentId || !changedIds.has(task.id!)) continue;
    const parent = tasks.get(task.parentId);
    if (parent?.endDate && task.endDate && task.endDate > parent.endDate && !deadlineTaskIds.includes(task.id!)) {
      deadlineTaskIds.push(task.id!);
    }
  }
}

function validateCapacity(
  tasks: Map<number, Task>,
  resources: Resource[],
  capacities: ResourceCapacity[],
  changes: GanttDateChange[],
  reasons: string[],
  overloadedResourceIds: number[],
): void {
  const activeLeaves = getActiveLeafTasks([...tasks.values()]);
  const changedIds = new Set(changes.map(change => change.taskId));
  const capacityByResource = new Map(capacities.map(capacity => [capacity.resourceId, capacity]));
  const changedTasks = activeLeaves.filter(task => changedIds.has(task.id!));
  if (!changedTasks.length || !resources.length) return;

  for (const resource of resources) {
    if (resource.id === undefined) continue;
    const assignedTasks = activeLeaves.filter(task => task.assigneeIds?.includes(resource.id!));
    if (!assignedTasks.some(task => changedIds.has(task.id!))) continue;
    const relevantDays = new Set<number>();
    assignedTasks.forEach(task => {
      if (!task.startDate || !task.endDate) return;
      listWorkingDays(task.startDate, task.endDate).forEach(day => relevantDays.add(dateKey(day)));
    });
    const dailyHours = getResourceDailyHours(resource, { capacityByResourceId: capacityByResource });
    const maxParallelTasks = capacityByResource.get(resource.id)?.maxParallelTasks ?? 3;
    for (const dayTimestamp of relevantDays) {
      const day = new Date(dayTimestamp);
      const activeOnDay = assignedTasks.filter(task => task.startDate && task.endDate && startOfDay(task.startDate) <= day && startOfDay(task.endDate) >= day);
      if (!activeOnDay.length) continue;
      if (!isResourceAvailableOn(resource, day)) {
        if (activeOnDay.some(task => changedIds.has(task.id!))) {
          overloadedResourceIds.push(resource.id);
          reasons.push(`${resource.name} 在 ${day.toLocaleDateString('zh-CN')} 不可用，无法承接调整后的任务`);
        }
        continue;
      }
      if (activeOnDay.length > maxParallelTasks && activeOnDay.some(task => changedIds.has(task.id!))) {
        overloadedResourceIds.push(resource.id);
        reasons.push(`${resource.name} 在 ${day.toLocaleDateString('zh-CN')} 超过 WIP 上限（${activeOnDay.length}/${maxParallelTasks}）`);
      }
      if (dailyHours <= 0) {
        if (activeOnDay.some(task => changedIds.has(task.id!))) {
          overloadedResourceIds.push(resource.id);
          reasons.push(`${resource.name} 当前有效日产能为 0 小时`);
        }
        continue;
      }
      const usedHours = activeOnDay.reduce((sum, task) => {
        const effort = estimateTaskEffort(task, [...tasks.values()], resources).hours;
        const taskDays = task.startDate && task.endDate
          ? Math.max(1, countWorkingDays(task.startDate, task.endDate))
          : 1;
        return sum + effort / taskDays;
      }, 0);
      if (usedHours > dailyHours + 0.01 && activeOnDay.some(task => changedIds.has(task.id!))) {
        overloadedResourceIds.push(resource.id);
        reasons.push(`${resource.name} 在 ${day.toLocaleDateString('zh-CN')} 预计占用 ${usedHours.toFixed(1)}h，超过日产能 ${dailyHours.toFixed(1)}h`);
      }
    }
  }
}

export function validateGanttScheduleChanges(input: GanttScheduleValidationInput): GanttScheduleValidation {
  const changes = input.changes.filter(change => Number.isFinite(change.taskId));
  const tasks = buildMergedTasks(input.tasks, changes);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const dependencyTaskIds: number[] = [];
  const deadlineTaskIds: number[] = [];
  const overloadedResourceIds: number[] = [];

  validateWorkingDayBoundaries(tasks, changes, warnings, reasons);
  validateDependencies(tasks, changes, reasons, dependencyTaskIds);
  validateParentDeadlines(tasks, changes, reasons, deadlineTaskIds);
  validateCapacity(tasks, input.resources || [], input.capacities || [], changes, reasons, overloadedResourceIds);

  return {
    valid: reasons.length === 0,
    reasons: unique(reasons),
    warnings: unique(warnings),
    affectedTaskIds: changes.map(change => change.taskId),
    overloadedResourceIds: [...new Set(overloadedResourceIds)],
    deadlineTaskIds: [...new Set(deadlineTaskIds)],
    dependencyTaskIds: [...new Set(dependencyTaskIds)],
    beforeAfter: compareDateRange(new Map(input.tasks.filter(task => task.id !== undefined).map(task => [task.id!, task])), changes),
  };
}

export function formatGanttValidationMessage(validation: GanttScheduleValidation): string {
  if (validation.valid) {
    const count = validation.affectedTaskIds.length;
    const { beforeEndDate, afterEndDate } = validation.beforeAfter;
    const impact = beforeEndDate && afterEndDate && dateKey(beforeEndDate) !== dateKey(afterEndDate)
      ? `，整体结束日 ${beforeEndDate.toLocaleDateString('zh-CN')} → ${afterEndDate.toLocaleDateString('zh-CN')}`
      : '';
    const prefix = `已通过排期校验，调整 ${count} 项任务${impact}`;
    return validation.warnings.length ? `${prefix}；${validation.warnings.slice(0, 2).join('；')}` : prefix;
  }
  return `排期调整未保存：${validation.reasons.slice(0, 3).join('；')}`;
}
