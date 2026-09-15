import { isSameDay, startOfDay } from 'date-fns';
import type { Task } from '../types';
import { mapTapdStatus } from './tapdStatus';

function hasValidCompletionDate(value: Task['completedAt']): boolean {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

/** Resolve terminal state from local fields and TAPD source fields. */
export function isTaskCancelled(task: Task): boolean {
  return task.status === 'cancelled' || mapTapdStatus(task.tapdStatus) === 'cancelled';
}

export function isTaskCompleted(task: Task): boolean {
  if (isTaskCancelled(task)) return false;
  return task.status === 'done'
    || mapTapdStatus(task.tapdStatus) === 'done'
    || hasValidCompletionDate(task.completedAt)
    || Number(task.progress) >= 100;
}

export function isTaskTerminal(task: Task): boolean {
  return isTaskCancelled(task) || isTaskCompleted(task);
}

export function isTaskDueToday(task: Task, referenceDate = new Date()): boolean {
  if (!task.endDate || isTaskTerminal(task)) return false;
  return isSameDay(new Date(task.endDate), referenceDate);
}

export function isTaskOverdue(task: Task, referenceDate = new Date()): boolean {
  if (!task.endDate || isTaskTerminal(task)) return false;
  return startOfDay(new Date(task.endDate)) < startOfDay(referenceDate);
}
