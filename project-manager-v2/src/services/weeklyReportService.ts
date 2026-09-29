import { addDays, addWeeks, endOfWeek, format, isWithinInterval, startOfDay, startOfWeek } from 'date-fns';
import type { Resource, Task } from '../types';
import { isTaskTerminal } from '../utils/taskState';
import { buildDemandRiskGroups, type DemandRiskGroup } from './tapdPlanningAssistant';
import { buildStageCapacityForecast, type StageCapacityForecast } from './capacityForecastService';
import { auditTaskDataQuality, type DataQualityAudit } from './dataQualityService';

export interface WeeklyUxReport {
  weekStart: Date;
  weekEnd: Date;
  completed: Task[];
  inProgress: Task[];
  nextWeek: Task[];
  risks: DemandRiskGroup[];
  capacityRisks: StageCapacityForecast[];
  dataQuality: DataQualityAudit;
  riskActions: WeeklyRiskAction[];
}

export interface WeeklyRiskAction {
  key: string;
  demand: Task;
  ownerNames: string[];
  action: string;
  targetDate: Date;
  escalation: DemandRiskGroup['escalation'];
}

function logicalTaskKey(task: Task): string {
  return task.tapdId ? `tapd:${task.tapdId}` : `local:${task.id ?? task.syncId ?? task.title}`;
}

function uniqueLeafTasks(tasks: Task[]): Task[] {
  const parentIds = new Set(tasks.flatMap(task => task.parentId ? [task.parentId] : []));
  const seen = new Set<string>();
  return tasks.filter(task => {
    if (task.id && parentIds.has(task.id)) return false;
    const key = logicalTaskKey(task);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inRange(date: Date | undefined, start: Date, end: Date): boolean {
  return !!date && isWithinInterval(startOfDay(date), { start, end });
}

export function buildWeeklyUxReport(tasks: Task[], resources: Resource[], today: Date = new Date()): WeeklyUxReport {
  const weekStart = startOfWeek(startOfDay(today), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(startOfDay(today), { weekStartsOn: 1 });
  const nextWeekStart = addWeeks(weekStart, 1);
  const nextWeekEnd = addWeeks(weekEnd, 1);
  const leafTasks = uniqueLeafTasks(tasks).filter(task => task.status !== 'cancelled' && task.status !== 'paused');
  const completed = leafTasks.filter(task => task.status === 'done' && inRange(task.completedAt || task.endDate, weekStart, weekEnd));
  const inProgress = leafTasks.filter(task => task.status === 'in_progress');
  const nextWeek = leafTasks.filter(task => !isTaskTerminal(task) && (
    inRange(task.startDate, nextWeekStart, nextWeekEnd) || inRange(task.endDate, nextWeekStart, nextWeekEnd)
  ));
  const risks = buildDemandRiskGroups(tasks, resources, today).slice(0, 5);
  const capacityRisks = buildStageCapacityForecast(tasks, resources, today).filter(item => item.status !== 'healthy');
  const dataQuality = auditTaskDataQuality(tasks, resources, today);
  const riskActions = risks.map(group => {
    const action = group.blockedCount > 0
      ? '确认卡点责任方并补充解除时间'
      : group.staffingCount > 0
        ? '补齐对应岗位处理人和排期'
        : group.overdueCount > 0
          ? '核对 TAPD 状态并调整逾期排期'
          : group.escalation === 'escalate'
            ? '升级协调资源与交付范围'
            : '在周会确认风险是否可关闭';
    const targetDate = group.nearestDeadline && group.nearestDeadline >= startOfDay(today)
      ? group.nearestDeadline
      : addDays(startOfDay(today), group.escalation === 'escalate' ? 1 : 3);
    return {
      key: logicalTaskKey(group.demand),
      demand: group.demand,
      ownerNames: group.ownerNames,
      action,
      targetDate,
      escalation: group.escalation,
    };
  });
  return { weekStart, weekEnd, completed, inProgress, nextWeek, risks, capacityRisks, dataQuality, riskActions };
}

function taskLine(task: Task): string {
  return task.externalUrl ? `- [${task.title}](${task.externalUrl})` : `- ${task.title}`;
}

export function formatWeeklyUxReport(report: WeeklyUxReport): string {
  const lines = [
    `# UX 管线周报（${format(report.weekStart, 'MM/dd')} - ${format(report.weekEnd, 'MM/dd')}）`,
    '',
    `## 本周完成（${report.completed.length} 项）`,
    ...(report.completed.length ? report.completed.map(taskLine) : ['- 本周暂无已完成任务']),
    '',
    `## 当前进行中（${report.inProgress.length} 项）`,
    ...(report.inProgress.length ? report.inProgress.map(taskLine) : ['- 当前暂无进行中任务']),
    '',
    `## 下周计划（${report.nextWeek.length} 项）`,
    ...(report.nextWeek.length ? report.nextWeek.map(taskLine) : ['- 暂无已排入下周的任务']),
    '',
    `## 风险与卡点（${report.risks.length} 个需求）`,
    ...(report.risks.length ? report.risks.map(group => {
      const title = group.demand.externalUrl ? `[${group.demand.title}](${group.demand.externalUrl})` : group.demand.title;
      return `- ${group.escalation === 'escalate' ? '【升级处理】' : ''}${title}：${group.summaryReasons.join('；') || '需关注'}；责任人：${group.ownerNames.join('、') || '待明确'}`;
    }) : ['- 当前暂无显著风险']),
    '',
    `## 风险跟进行动（${report.riskActions.length} 项）`,
    ...(report.riskActions.length ? report.riskActions.map(item => {
      const title = item.demand.externalUrl ? `[${item.demand.title}](${item.demand.externalUrl})` : item.demand.title;
      return `- ${title}｜责任人：${item.ownerNames.join('、') || '待明确'}｜动作：${item.action}｜目标：${format(item.targetDate, 'MM/dd')}`;
    }) : ['- 当前无待跟进风险']),
    '',
    `## 岗位容量（${report.capacityRisks.length} 个岗位需关注）`,
    ...(report.capacityRisks.length ? report.capacityRisks.map(item => `- ${item.label}：预计占用 ${item.projectedUtilization > 900 ? '无可用容量' : `${item.projectedUtilization}%`}，已排 ${item.scheduledHours}h，待排 ${item.pendingHours}h`) : ['- 未来两周岗位容量充足']),
    '',
    `## 数据质量（${report.dataQuality.score} 分）`,
    `- 关键异常 ${report.dataQuality.criticalCount} 项，提醒 ${report.dataQuality.warningCount} 项`,
    ...(report.dataQuality.issues.length ? report.dataQuality.issues.slice(0, 8).map(issue => `- ${issue.severity === 'critical' ? '【需先修复】' : ''}${issue.title}：${issue.detail}${issue.task ? `（${issue.task.title}）` : ''}`) : ['- 当前未发现明显数据问题']),
  ];
  return lines.join('\n');
}
