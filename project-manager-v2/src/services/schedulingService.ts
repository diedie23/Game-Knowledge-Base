import type { ProjectCalendarConfig, Resource, Task } from '../types';
import type {
  ResourceCapacity,
  ScheduleRisk,
  ScheduleSuggestion,
  UxWorkPackage,
  UxStage,
} from '../types/scheduling';
import { buildCapacitySnapshot } from './capacityService';
import { DEFAULT_PROJECT_CALENDAR, getNextWorkingDays } from '../utils/dateUtils';
import { createScheduleScenario, getResourceDailyHours, getScenarioCapacity, type ScheduleScenario } from './schedulingKernel';

export interface SchedulingInput {
  packages: UxWorkPackage[];
  resources: Resource[];
  tasks: Task[];
  capacities: ResourceCapacity[];
  startDate?: string;
  calendarConfig?: ProjectCalendarConfig;
}

const ROLE_STAGE_KEYWORDS: Record<UxStage, string[]> = {
  interaction: ['交互', 'interaction', 'ux'],
  ui_design: ['ui', '视觉', 'visual'],
  implementation: ['还原', 'layout', '实现'],
  motion: ['动效', 'motion', 'animation'],
};

function normalize(text: string | undefined): string {
  return (text ?? '').toLowerCase().replace(/\s+/g, '');
}

function isResourceSuitable(resource: Resource, stage: UxStage): boolean {
  const keywords = ROLE_STAGE_KEYWORDS[stage];
  if (!keywords.length) return false;
  const role = normalize(resource.role);
  return keywords.some(keyword => role.includes(normalize(keyword)));
}

function priorityScore(priority?: string): number {
  const value = normalize(priority);
  if (/紧急|urgent|p0/.test(value)) return 100;
  if (/高|high|p1/.test(value)) return 70;
  if (/中|medium|p2/.test(value)) return 40;
  return 10;
}

function toDate(value: string): Date {
  return new Date(value.length === 10 ? value + 'T00:00:00' : value);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addWorkingDays(start: Date, days: number, calendarConfig: ProjectCalendarConfig): Date {
  const count = Math.max(1, Math.ceil(days) + 1);
  return getNextWorkingDays(start, count, calendarConfig)[count - 1];
}

function nextWorkday(date: Date, calendarConfig: ProjectCalendarConfig): Date {
  return getNextWorkingDays(date, 1, calendarConfig)[0];
}

function selectBestResource(
  workPackage: UxWorkPackage,
  resources: Resource[],
  scenario: ScheduleScenario,
): { resource?: Resource; risks: ScheduleRisk[] } {
  const candidates = resources
    .filter(resource => resource.id !== undefined)
    .filter(resource => resource.status !== 'departed')
    .filter(resource => isResourceSuitable(resource, workPackage.stage));

  if (!candidates.length) {
    return {
      risks: [{
        type: 'unassigned',
        level: 'high',
        message: `未找到匹配「${workPackage.stage}」工种的可用人员`,
      }],
    };
  }

  const ranked = candidates
    .map(resource => {
      const capacity = getScenarioCapacity(resource, scenario);
      const snapshot = buildCapacitySnapshot(resource, scenario.tasks, capacity);
      const effectiveCapacity = getResourceDailyHours(resource, scenario) / 8;
      const score =
        effectiveCapacity * 100 -
        snapshot.activeTaskCount * 20 -
        snapshot.wipUtilization * 30;

      return { resource, snapshot, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const risks: ScheduleRisk[] = [];

  if (best.snapshot.status === 'unavailable') {
    risks.push({
      type: 'unassigned',
      level: 'high',
      message: `${best.resource.name} 当前不可用`,
    });
  }

  if (best.snapshot.activeTaskCount >= best.snapshot.maxParallelTasks) {
    risks.push({
      type: 'wip_limit',
      level: 'high',
      message: `${best.resource.name} 已达到 WIP 上限（${best.snapshot.activeTaskCount}/${best.snapshot.maxParallelTasks}）`,
    });
  }

  return { resource: best.resource, risks };
}

/**
 * 第一版自动排期：
 * - 按优先级 + 截止日期排序
 * - 按工种匹配人员
 * - 使用个人日产能计算工期
 * - 检查 WIP 和截止日期风险
 *
 * 暂不修改原 TAPD 数据，只生成建议结果。
 */
export function generateScheduleSuggestions(
  input: SchedulingInput,
): ScheduleSuggestion[] {
  const calendarConfig = input.calendarConfig || DEFAULT_PROJECT_CALENDAR;
  const start = nextWorkday(
    input.startDate ? toDate(input.startDate) : new Date(),
    calendarConfig,
  );
  const scenario = createScheduleScenario(input.tasks, input.resources, input.capacities, start, calendarConfig);

  const ordered = [...input.packages]
    .filter(item => item.status !== 'done' && item.status !== 'cancelled')
    .sort((a, b) => {
      const priorityDiff = priorityScore(b.priority) - priorityScore(a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      const aDue = a.dueDate ? toDate(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? toDate(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

  return ordered.map(workPackage => {
    const { resource, risks } = selectBestResource(
      workPackage,
      input.resources,
      scenario,
    );

    if (!resource?.id) {
      return {
        workPackageId: workPackage.id ?? `tapd-${workPackage.tapdId}`,
        risks,
      };
    }

    const effectiveDailyCapacity = getResourceDailyHours(resource, scenario) / 8;
    const personDays = Math.max(workPackage.estimatedPersonDays, 1);
    const duration = personDays / Math.max(effectiveDailyCapacity, 0.1);

    const requestedStart = workPackage.beginDate
      ? nextWorkday(toDate(workPackage.beginDate), calendarConfig)
      : start;

    const endDate = addWorkingDays(requestedStart, duration - 1, calendarConfig);

    if (workPackage.dueDate && endDate > toDate(workPackage.dueDate)) {
      risks.push({
        type: 'deadline',
        level: 'high',
        message: `预计完成 ${formatDate(endDate)}，晚于截止日期 ${workPackage.dueDate}`,
      });
    }

    return {
      workPackageId: workPackage.id ?? `tapd-${workPackage.tapdId}`,
      resourceId: resource.id,
      startDate: formatDate(requestedStart),
      endDate: formatDate(endDate),
      risks,
    };
  });
}
