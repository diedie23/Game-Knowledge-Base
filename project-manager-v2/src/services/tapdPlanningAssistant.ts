import type { Resource, Task } from '../types';
import { isTaskTerminal } from '../utils/taskState';
import { assessTaskRisk, buildTaskRiskContext, type RiskLevel, type RiskTag } from './workloadService';

export interface TapdPlanningItem {
  task: Task;
  level: Exclude<RiskLevel, 'none'>;
  reasons: string[];
  tags: Array<RiskTag | 'unscheduled' | 'unassigned'>;
  actionLabel: string;
  score: number;
}

const LEVEL_SCORE: Record<Exclude<RiskLevel, 'none'>, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

const PRIORITY_SCORE: Record<string, number> = { high: 40, medium: 20, low: 0 };

function resolveAction(tags: TapdPlanningItem['tags']): string {
  if (tags.includes('unscheduled')) return '补充 TAPD 排期';
  if (tags.includes('blocked') || tags.includes('dependency')) return '处理卡点';
  if (tags.includes('overload') || tags.includes('overlap')) return '调整负责人或日期';
  if (tags.includes('unassigned')) return '补充 TAPD 处理人';
  return '调整 TAPD 排期';
}

/** Build a TAPD-first planning queue from leaf tasks, using the same risk rules as the Gantt view. */
export function buildTapdPlanningItems(
  tasks: Task[],
  resources: Resource[],
  today: Date = new Date(),
): TapdPlanningItem[] {
  const context = buildTaskRiskContext(tasks, resources);

  return tasks.flatMap(task => {
    if (!task.id || context.parentIds.has(task.id) || isTaskTerminal(task) || task.status === 'paused') return [];
    if (!task.tapdId && !task.externalUrl && task.syncSource !== 'tapd' && task.syncSource !== 'tapd-import') return [];

    const assessed = assessTaskRisk(task, tasks, resources, today, context);
    const missingSchedule = !task.startDate || !task.endDate;
    const missingAssignee = !task.assigneeIds?.length;
    const reasons = assessed.riskReasons.map(reason => reason.text);
    const tags: TapdPlanningItem['tags'] = assessed.riskReasons.map(reason => reason.tag);

    if (missingSchedule) {
      reasons.unshift(`缺少${!task.startDate && !task.endDate ? '开始和结束日期' : !task.startDate ? '开始日期' : '结束日期'}`);
      tags.unshift('unscheduled');
    }
    if (missingAssignee) {
      reasons.push('未匹配到处理人');
      tags.push('unassigned');
    }
    if (reasons.length === 0) return [];

    let level: TapdPlanningItem['level'] = assessed.level === 'none' ? 'medium' : assessed.level;
    if (missingSchedule && task.priority === 'high' && level === 'medium') level = 'high';
    const dateScore = task.endDate
      ? Math.max(0, 30 - Math.max(-30, Math.round((new Date(task.endDate).getTime() - today.getTime()) / 86_400_000)))
      : 0;
    const score = LEVEL_SCORE[level] + (PRIORITY_SCORE[task.priority || ''] || 0) + dateScore;

    return [{ task, level, reasons: [...new Set(reasons)], tags: [...new Set(tags)], actionLabel: resolveAction(tags), score }];
  }).sort((left, right) => right.score - left.score || (left.task.endDate?.getTime() || Infinity) - (right.task.endDate?.getTime() || Infinity));
}

export function latestTapdSyncAt(tasks: Task[]): number | null {
  const timestamps = tasks
    .filter(task => task.tapdId || task.syncSource === 'tapd' || task.syncSource === 'tapd-import')
    .map(task => Number(task.syncedAt || 0))
    .filter(value => Number.isFinite(value) && value > 0);
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function formatTapdAdjustmentChecklist(items: TapdPlanningItem[], resources: Resource[]): string {
  const resourceById = new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource]));
  const lines = ['# TAPD 排期调整清单', '', `共 ${items.length} 项，按当前风险优先级排列。`, ''];
  items.forEach((item, index) => {
    const assignees = (item.task.assigneeIds || [])
      .map(id => resourceById.get(id)?.name)
      .filter(Boolean)
      .join('、') || '未匹配处理人';
    const priority = item.task.tapdPriorityLabel || (item.task.priority === 'high' ? 'P0' : item.task.priority === 'medium' ? 'P1' : item.task.priority === 'low' ? 'P2' : '无');
    lines.push(
      `${index + 1}. [${priority}] ${item.task.title}`,
      `   - 问题：${item.reasons.join('；')}`,
      `   - 建议动作：${item.actionLabel}`,
      `   - 当前处理人：${assignees}`,
      `   - 当前排期：${item.task.startDate ? item.task.startDate.toLocaleDateString('zh-CN') : '未排期'} → ${item.task.endDate ? item.task.endDate.toLocaleDateString('zh-CN') : '未排期'}`,
      `   - TAPD：${item.task.externalUrl || item.task.tapdId || '无链接'}`,
      '',
    );
  });
  return lines.join('\n').trim();
}
