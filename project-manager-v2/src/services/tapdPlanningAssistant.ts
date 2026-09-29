import type { Resource, Task } from '../types';
import { isTaskTerminal } from '../utils/taskState';
import { countWorkingDays, getNextWorkingDays, isWorkingDay } from '../utils/dateUtils';
import { smartAssignService } from './smartAssignService';
import { relatedCheckpointLabel, resourceStage, taskStage } from './uxStageView';
import { assessTaskRisk, buildTaskRiskContext, type RiskLevel, type RiskTag } from './workloadService';

export interface TapdScheduleSuggestion {
  resource?: Resource;
  startDate: Date;
  endDate: Date;
  currentConflictCount: number;
  suggestedConflictCount: number;
  assigneeChanged: boolean;
  scheduleChanged: boolean;
  reasons: string[];
}

export interface TapdPlanningItem {
  task: Task;
  level: Exclude<RiskLevel, 'none'>;
  reasons: string[];
  tags: Array<RiskTag | 'unscheduled' | 'unassigned'>;
  actionLabel: string;
  score: number;
  suggestion?: TapdScheduleSuggestion;
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

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sameDay(left?: Date, right?: Date): boolean {
  return !!left && !!right && startOfDay(left).getTime() === startOfDay(right).getTime();
}

function taskDuration(task: Task): number {
  if (task.startDate && task.endDate) {
    return Math.max(1, countWorkingDays(startOfDay(task.startDate), startOfDay(task.endDate)));
  }
  return Math.max(1, Math.min(10, Math.ceil((task.estimatedHours || 16) / 8)));
}

function periodFrom(start: Date, duration: number): [Date, Date] {
  const days = getNextWorkingDays(startOfDay(start), duration);
  return [days[0], days[days.length - 1]];
}

function logicalTaskKey(task: Task): string {
  return task.tapdId ? `tapd:${task.tapdId}` : `local:${task.id ?? task.syncId ?? task.title}`;
}

function overlapCount(resourceId: number | undefined, task: Task, tasks: Task[], start: Date, end: Date): number {
  if (!resourceId) return 0;
  const parentIds = new Set(tasks.flatMap(candidate => candidate.parentId ? [candidate.parentId] : []));
  const sourceIdentity = logicalTaskKey(task);
  const seen = new Set<string>();

  return tasks.filter(candidate => {
    if (candidate.id === task.id || isTaskTerminal(candidate) || candidate.status === 'paused') return false;
    if (candidate.id !== undefined && parentIds.has(candidate.id)) return false;
    const candidateIdentity = logicalTaskKey(candidate);
    if (candidateIdentity === sourceIdentity || seen.has(candidateIdentity)) return false;
    if (!candidate.assigneeIds?.includes(resourceId) || !candidate.startDate || !candidate.endDate) return false;
    const overlaps = startOfDay(candidate.startDate) <= end && startOfDay(candidate.endDate) >= start;
    if (overlaps) seen.add(candidateIdentity);
    return overlaps;
  }).length;
}

function isAvailable(resource: Resource, start: Date, end: Date): boolean {
  if (resource.status === 'departed') return false;
  const leaveDates = new Set(resource.leaveDates || []);
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (isWorkingDay(cursor) && leaveDates.has(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)) return false;
  }
  return true;
}

function candidateType(task: Task, currentResources: Resource[]): Resource['type'] | undefined {
  if (task.workCategory === 'cp_follow' || /[（(]\s*CP\s*[^）)]*[）)]/i.test(task.title)) return 'cp';
  const types = [...new Set(currentResources.map(resource => resource.type).filter(Boolean))];
  return types.length === 1 ? types[0] : undefined;
}

function findSuggestedPeriod(resourceId: number | undefined, task: Task, tasks: Task[], preferredStart: Date, duration: number): [Date, Date, number] {
  const firstDay = isWorkingDay(preferredStart) ? startOfDay(preferredStart) : getNextWorkingDays(preferredStart, 1)[0];
  let fallback: [Date, Date, number] | null = null;
  for (let offset = 0; offset < 45; offset += 1) {
    const cursor = new Date(firstDay);
    cursor.setDate(cursor.getDate() + offset);
    if (!isWorkingDay(cursor)) continue;
    const [start, end] = periodFrom(cursor, duration);
    const conflicts = overlapCount(resourceId, task, tasks, start, end);
    if (!fallback || conflicts < fallback[2]) fallback = [start, end, conflicts];
    if (conflicts === 0) return [start, end, conflicts];
  }
  return fallback || [...periodFrom(firstDay, duration), 0];
}

export function buildTapdScheduleSuggestion(
  task: Task,
  tags: TapdPlanningItem['tags'],
  tasks: Task[],
  resources: Resource[],
  today: Date,
): TapdScheduleSuggestion {
  const resourceById = new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource]));
  const currentResources = (task.assigneeIds || []).map(id => resourceById.get(id)).filter((resource): resource is Resource => !!resource);
  const duration = taskDuration(task);
  const todayStart = startOfDay(today);
  const currentStart = task.startDate ? startOfDay(task.startDate) : todayStart;
  const currentEnd = task.endDate ? startOfDay(task.endDate) : periodFrom(currentStart, duration)[1];
  const currentResource = currentResources[0];
  // “并行”与资源矩阵保持同一口径：展示当天包含当前任务在内的有效任务总数。
  const currentConflictCount = currentResource
    ? overlapCount(currentResource.id, task, tasks, currentStart, currentEnd) + 1
    : 0;
  const shouldReassign = !currentResource || tags.includes('overload') || tags.includes('overlap');
  const expectedType = candidateType(task, currentResources);
  const expectedStage = taskStage(task, resources);
  const currentRoles = [...new Set(currentResources.map(resource => (resource.role || '').trim().toLowerCase()).filter(Boolean))];
  const expectedRole = expectedStage ? undefined : currentRoles.length === 1 ? currentRoles[0] : undefined;
  const baseStart = !task.startDate || currentEnd < todayStart ? todayStart : currentStart;
  const [previewStart, previewEnd] = periodFrom(baseStart, duration);

  const candidates = resources
    .filter(resource => resource.id && resource.status !== 'departed')
    .filter(resource => expectedType ? resource.type === expectedType : resource.type !== 'cp')
    .filter(resource => expectedStage
      ? resourceStage(resource) === expectedStage
      : expectedRole
        ? (resource.role || '').trim().toLowerCase() === expectedRole
        : false)
    .filter(resource => isAvailable(resource, previewStart, previewEnd))
    .map(resource => {
      const skill = smartAssignService.calcSkillScore(resource, task.title, tasks);
      const workload = smartAssignService.calcWorkloadScore(resource, tasks.filter(item => item.id !== task.id), previewStart, previewEnd);
      const availability = smartAssignService.calcAvailabilityScore(resource, tasks.filter(item => item.id !== task.id), previewStart, previewEnd);
      const sameRoleBonus = currentResources.some(current => current.role === resource.role) ? 20 : 0;
      return { resource, score: skill.score + workload.score + availability.score + sameRoleBonus, skill, workload };
    })
    .sort((left, right) => right.score - left.score || left.workload.activeCount - right.workload.activeCount || (left.resource.id || 0) - (right.resource.id || 0));

  const best = candidates[0];
  const selectedResource = shouldReassign && best ? best.resource : currentResource || best?.resource;
  const [startDate, endDate, suggestedOverlapCount] = findSuggestedPeriod(selectedResource?.id, task, tasks, baseStart, duration);
  const suggestedConflictCount = selectedResource ? suggestedOverlapCount + 1 : 0;
  const assigneeChanged = !!selectedResource && selectedResource.id !== currentResource?.id;
  const scheduleChanged = !sameDay(task.startDate, startDate) || !sameDay(task.endDate, endDate);
  const reasons: string[] = [];
  if (assigneeChanged) reasons.push(`同岗位候选中负载更低（${suggestedConflictCount} 项并行）`);
  else if (selectedResource) reasons.push(`保留当前处理人，建议时段并行 ${suggestedConflictCount} 项`);
  if (!task.startDate || !task.endDate) reasons.push(`按 ${duration} 个工作日补齐排期`);
  else if (currentEnd < todayStart) reasons.push(`原排期已过期，按原工期顺延`);
  else if (suggestedConflictCount < currentConflictCount) reasons.push(`并行任务由 ${currentConflictCount} 项降至 ${suggestedConflictCount} 项`);
  if (!selectedResource) reasons.push('暂无匹配岗位人员，需在 TAPD 手动指定');

  return { resource: selectedResource, startDate, endDate, currentConflictCount, suggestedConflictCount, assigneeChanged, scheduleChanged, reasons };
}

/** Build a TAPD-first planning queue from leaf tasks, using the same risk rules as the Gantt view. */
export function buildTapdPlanningItems(
  tasks: Task[],
  resources: Resource[],
  today: Date = new Date(),
): TapdPlanningItem[] {
  const context = buildTaskRiskContext(tasks, resources);
  const seenTaskKeys = new Set<string>();

  return tasks.flatMap(task => {
    if (!task.id || context.parentIds.has(task.id) || isTaskTerminal(task) || task.status === 'paused') return [];
    if (!task.tapdId && !task.externalUrl && task.syncSource !== 'tapd' && task.syncSource !== 'tapd-import') return [];
    // Program integration, development and audio are cross-pipeline checkpoints.
    // They may block a UIStory, but their staffing is owned outside the UX pipeline.
    if (relatedCheckpointLabel(task, resources)) return [];
    const taskKey = logicalTaskKey(task);
    if (seenTaskKeys.has(taskKey)) return [];
    seenTaskKeys.add(taskKey);

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

    const uniqueTags = [...new Set(tags)];
    return [{ task, level, reasons: [...new Set(reasons)], tags: uniqueTags, actionLabel: resolveAction(uniqueTags), score }];
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
    const suggestion = item.suggestion;
    lines.push(
      `${index + 1}. [${priority}] ${item.task.title}`,
      `   - 问题：${item.reasons.join('；')}`,
      `   - 建议动作：${item.actionLabel}`,
      `   - 当前处理人：${assignees}`,
      `   - 当前排期：${item.task.startDate ? item.task.startDate.toLocaleDateString('zh-CN') : '未排期'} → ${item.task.endDate ? item.task.endDate.toLocaleDateString('zh-CN') : '未排期'}`,
      `   - 建议处理人：${suggestion?.resource?.name || '待人工指定'}`,
      `   - 建议排期：${suggestion ? `${suggestion.startDate.toLocaleDateString('zh-CN')} → ${suggestion.endDate.toLocaleDateString('zh-CN')}` : '待评估'}`,
      `   - 调整依据：${suggestion?.reasons.join('；') || '需结合当前负载人工确认'}`,
      `   - TAPD：${item.task.externalUrl || item.task.tapdId || '无链接'}`,
      '',
    );
  });
  return lines.join('\n').trim();
}
