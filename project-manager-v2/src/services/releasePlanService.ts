import type { Task } from '../types';

export interface TapdReleasePlan {
  id: string;
  name: string;
  status?: string;
  startdate?: string;
  enddate?: string;
}

export interface ReleasePlanProgress {
  total: number;
  completed: number;
  inProgress: number;
  completionRate: number;
}

const TERMINAL_STATUS = /已完成|已关闭|已发布|released|closed|done|finished|ended/i;

function dateValue(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.slice(0, 10);
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? undefined : time;
}

export function releasePlanDateValue(value?: string): number | undefined {
  return dateValue(value);
}

export function selectCurrentReleasePlan(
  plans: TapdReleasePlan[],
  today = new Date(),
): TapdReleasePlan | undefined {
  const todayValue = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const candidates = plans
    .filter(plan => plan.id && plan.name && !TERMINAL_STATUS.test(plan.status || ''))
    .map((plan, index) => {
      const start = dateValue(plan.startdate);
      const end = dateValue(plan.enddate);
      const isOngoing = start !== undefined && end !== undefined && start <= todayValue && end >= todayValue;
      const isOverdue = end !== undefined && end < todayValue;
      const isUpcoming = start !== undefined && start > todayValue;
      const rank = isOngoing ? 0 : isOverdue ? 1 : isUpcoming ? 2 : 3;
      const nearestDate = (rank === 2 ? start : end ?? start) ?? Number.MAX_SAFE_INTEGER;
      return { plan, rank, nearestDate, index };
    });

  candidates.sort((left, right) =>
    left.rank - right.rank
    || left.nearestDate - right.nearestDate
    || left.index - right.index,
  );
  return candidates[0]?.plan;
}

export function buildReleasePlanProgress(
  plan: TapdReleasePlan | undefined,
  tasks: Task[],
): ReleasePlanProgress {
  if (!plan) return { total: 0, completed: 0, inProgress: 0, completionRate: 0 };
  const releaseTasks = tasks.filter(task => task.tapdReleaseId === plan.id);
  const completed = releaseTasks.filter(task => task.status === 'done').length;
  const inProgress = releaseTasks.filter(task => task.status === 'in_progress').length;
  return {
    total: releaseTasks.length,
    completed,
    inProgress,
    completionRate: releaseTasks.length > 0 ? Math.round((completed / releaseTasks.length) * 100) : 0,
  };
}
