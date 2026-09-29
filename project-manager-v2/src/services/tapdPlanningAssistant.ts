import type { Resource, Task } from '../types';
import { isTaskTerminal } from '../utils/taskState';
import { countWorkingDays, getNextWorkingDays, isWorkingDay } from '../utils/dateUtils';
import { smartAssignService } from './smartAssignService';
import { relatedCheckpointLabel, resourceStage, taskStage, taskStatus, type CoreUxStage } from './uxStageView';
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
  stage?: CoreUxStage;
  durationDays: number;
  parentDeadline?: Date;
  parentDeadlineStatus: 'safe' | 'late' | 'unknown';
  requiresReview: boolean;
  reviewReasons: string[];
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface TapdScheduleReadiness {
  ready: boolean;
  stage?: CoreUxStage;
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

export interface DemandRiskGroup {
  demand: Task;
  level: Exclude<RiskLevel, 'none'>;
  items: TapdPlanningItem[];
  checkpoints: Array<{ task: Task; label: string }>;
  overdueCount: number;
  blockedCount: number;
  staffingCount: number;
  summaryReasons: string[];
  ownerNames: string[];
  nearestDeadline?: Date;
  maxOverdueDays: number;
  staleDays?: number;
  escalation: 'normal' | 'watch' | 'escalate';
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

function nextWorkingDayAfter(value: Date): Date {
  const next = startOfDay(value);
  next.setDate(next.getDate() + 1);
  return getNextWorkingDays(next, 1)[0];
}

function dependencyConstraint(task: Task, tasks: Task[]): { readyAt?: Date; unresolved: string[] } {
  const dependencies = (task.dependencies || []).map(id => tasks.find(candidate => candidate.id === id)).filter((item): item is Task => !!item);
  const unresolved = dependencies.filter(item => !item.endDate && !isTaskTerminal(item)).map(item => item.title);
  const dated = dependencies.map(item => item.endDate).filter((date): date is Date => !!date).sort((a, b) => b.getTime() - a.getTime());
  return { readyAt: dated[0] ? nextWorkingDayAfter(dated[0]) : undefined, unresolved };
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

function matchingResources(task: Task, resources: Resource[]): Resource[] {
  const resourceById = new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource]));
  const currentResources = (task.assigneeIds || []).map(id => resourceById.get(id)).filter((resource): resource is Resource => !!resource);
  const expectedStage = taskStage(task, resources);
  const currentRoles = [...new Set(currentResources.map(resource => (resource.role || '').trim().toLowerCase()).filter(Boolean))];
  const expectedRole = expectedStage ? undefined : currentRoles.length === 1 ? currentRoles[0] : undefined;
  const expectedType = candidateType(task, currentResources);
  return resources
    .filter(resource => resource.id && resource.status !== 'departed')
    .filter(resource => expectedType ? resource.type === expectedType : resource.type !== 'cp')
    .filter(resource => expectedStage
      ? resourceStage(resource) === expectedStage
      : expectedRole
        ? (resource.role || '').trim().toLowerCase() === expectedRole
        : false);
}

export function assessTapdScheduleReadiness(
  task: Task,
  tags: TapdPlanningItem['tags'],
  resources: Resource[],
): TapdScheduleReadiness {
  const stage = taskStage(task, resources);
  const reasons: string[] = [];
  if (!stage && !(task.assigneeIds || []).length) reasons.push('无法确认任务工种');
  if (matchingResources(task, resources).length === 0) reasons.push('没有匹配的同工种人员');
  if (!task.estimatedHours || task.estimatedHours <= 0) reasons.push('缺少预估工时');
  if (tags.includes('blocked')) reasons.push('任务存在卡点');
  if (tags.includes('dependency')) reasons.push('存在未解决依赖');
  return { ready: reasons.length === 0, stage, reasons };
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
  const dependency = dependencyConstraint(task, tasks);
  const preferredStart = !task.startDate || currentEnd < todayStart ? todayStart : currentStart;
  const baseStart = dependency.readyAt && dependency.readyAt > preferredStart ? dependency.readyAt : preferredStart;
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
  const parent = task.parentId ? tasks.find(candidate => candidate.id === task.parentId) : undefined;
  const parentDeadline = parent?.endDate ? startOfDay(parent.endDate) : undefined;
  const parentDeadlineStatus = !parentDeadline ? 'unknown' : endDate <= parentDeadline ? 'safe' : 'late';
  const readiness = assessTapdScheduleReadiness(task, tags, resources);
  const reviewReasons = [...readiness.reasons];
  if (suggestedConflictCount > 2) reviewReasons.push(`建议时段仍有 ${suggestedConflictCount} 项任务`);
  if (parentDeadlineStatus === 'late') reviewReasons.push('建议完成时间晚于父需求截止日期');
  if (dependency.unresolved.length > 0) reviewReasons.push(`前置任务尚未排期：${dependency.unresolved.slice(0, 2).join('、')}`);
  const assigneeChanged = !!selectedResource && selectedResource.id !== currentResource?.id;
  const scheduleChanged = !sameDay(task.startDate, startDate) || !sameDay(task.endDate, endDate);
  const reasons: string[] = [];
  if (assigneeChanged) reasons.push(`同岗位候选中负载更低（${suggestedConflictCount} 项并行）`);
  else if (selectedResource) reasons.push(`保留当前处理人，建议时段并行 ${suggestedConflictCount} 项`);
  if (!task.startDate || !task.endDate) reasons.push(`按 ${duration} 个工作日补齐排期`);
  else if (currentEnd < todayStart) reasons.push(`原排期已过期，按原工期顺延`);
  else if (suggestedConflictCount < currentConflictCount) reasons.push(`并行任务由 ${currentConflictCount} 项降至 ${suggestedConflictCount} 项`);
  if (!selectedResource) reasons.push('暂无匹配岗位人员，需在 TAPD 手动指定');
  if (parentDeadlineStatus === 'late') reasons.push('建议排期将突破父需求截止日期');
  if (dependency.readyAt) reasons.push(`已避让前置任务，最早从 ${dependency.readyAt.toLocaleDateString('zh-CN')} 开始`);

  let confidence = 100;
  if (!selectedResource) confidence -= 45;
  if (!task.estimatedHours || task.estimatedHours <= 0) confidence -= 20;
  if (!expectedStage) confidence -= 20;
  if (parentDeadlineStatus === 'late') confidence -= 25;
  if (suggestedConflictCount > 1) confidence -= Math.min(20, (suggestedConflictCount - 1) * 10);
  if (dependency.unresolved.length) confidence -= 30;
  if (tags.includes('blocked')) confidence -= 20;
  confidence = Math.max(10, confidence);
  const confidenceLevel = confidence >= 80 ? 'high' : confidence >= 60 ? 'medium' : 'low';

  return {
    resource: selectedResource,
    startDate,
    endDate,
    currentConflictCount,
    suggestedConflictCount,
    assigneeChanged,
    scheduleChanged,
    reasons,
    stage: expectedStage,
    durationDays: duration,
    parentDeadline,
    parentDeadlineStatus,
    requiresReview: reviewReasons.length > 0,
    reviewReasons: [...new Set(reviewReasons)],
    confidence,
    confidenceLevel,
  };
}

/** Build suggestions as one scenario so earlier recommendations reserve capacity for later tasks. */
export function buildBatchTapdScheduleSuggestions(
  items: TapdPlanningItem[],
  tasks: Task[],
  resources: Resource[],
  today: Date = new Date(),
): Map<number, TapdScheduleSuggestion> {
  const result = new Map<number, TapdScheduleSuggestion>();
  const scenarioTasks = [...tasks];
  const remaining = [...items];
  const ordered: TapdPlanningItem[] = [];
  const remainingIds = () => new Set(remaining.map(item => item.task.id).filter((id): id is number => !!id));
  while (remaining.length > 0) {
    const ids = remainingIds();
    const ready = remaining.filter(item => !(item.task.dependencies || []).some(id => ids.has(id)));
    const candidates = ready.length ? ready : remaining;
    candidates.sort((left, right) => right.score - left.score || (left.task.endDate?.getTime() || Infinity) - (right.task.endDate?.getTime() || Infinity));
    const next = candidates[0];
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  ordered.forEach(item => {
    if (!item.task.id) return;
    const suggestion = buildTapdScheduleSuggestion(item.task, item.tags, scenarioTasks, resources, today);
    result.set(item.task.id, suggestion);
    if (!suggestion.resource) return;
    const scheduledTask: Task = {
      ...item.task,
      startDate: suggestion.startDate,
      endDate: suggestion.endDate,
      assigneeIds: [suggestion.resource.id!],
      status: item.task.status === 'done' ? 'todo' : item.task.status,
    };
    const scenarioIndex = scenarioTasks.findIndex(task => task.id === item.task.id);
    if (scenarioIndex >= 0) scenarioTasks[scenarioIndex] = scheduledTask;
    else scenarioTasks.push(scheduledTask);
  });
  return result;
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

function normalizedWorkitemType(task: Task): string {
  return String(task.tapdWorkitemTypeName || '').trim().toLowerCase().replace(/[\s·_\-—:：]/g, '');
}

function isUiStory(task: Task): boolean {
  const type = normalizedWorkitemType(task);
  return type === 'uistory' || type === 'uistory父需求' || type === 'ui需求';
}

export function findDemandForTask(task: Task, tasks: Task[]): Task {
  const taskById = new Map(tasks.filter(candidate => candidate.id).map(candidate => [candidate.id!, candidate]));
  let current = task;
  let fallback = task;
  const visited = new Set<number>();
  while (current.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = taskById.get(current.parentId);
    if (!parent || parent.projectId !== task.projectId) break;
    fallback = parent;
    if (isUiStory(parent)) return parent;
    current = parent;
  }
  return isUiStory(task) ? task : fallback;
}

/** Aggregate leaf risks and external pipeline checkpoints under their parent UIStory. */
export function buildDemandRiskGroups(
  tasks: Task[],
  resources: Resource[],
  today: Date = new Date(),
): DemandRiskGroup[] {
  const items = buildTapdPlanningItems(tasks, resources, today);
  const groups = new Map<string, DemandRiskGroup>();
  const levelRank: Record<Exclude<RiskLevel, 'none'>, number> = { low: 1, medium: 2, high: 3, critical: 4 };

  const ensureGroup = (task: Task): DemandRiskGroup => {
    const demand = findDemandForTask(task, tasks);
    const key = logicalTaskKey(demand);
    let group = groups.get(key);
    if (!group) {
      group = {
        demand,
        level: 'low',
        items: [],
        checkpoints: [],
        overdueCount: 0,
        blockedCount: 0,
        staffingCount: 0,
        summaryReasons: [],
        ownerNames: [],
        nearestDeadline: undefined,
        maxOverdueDays: 0,
        staleDays: undefined,
        escalation: 'normal',
        score: 0,
      };
      groups.set(key, group);
    }
    return group;
  };

  items.forEach(item => {
    const group = ensureGroup(item.task);
    group.items.push(item);
    if (levelRank[item.level] > levelRank[group.level]) group.level = item.level;
    if (item.tags.includes('overdue')) group.overdueCount += 1;
    if (item.tags.includes('blocked') || item.tags.includes('dependency')) group.blockedCount += 1;
    if (item.tags.includes('unassigned') || item.tags.includes('overload') || item.tags.includes('overlap')) group.staffingCount += 1;
    group.score += item.score;
  });

  const seenCheckpoints = new Set<string>();
  tasks.forEach(task => {
    if (!task.id || isTaskTerminal(task) || task.status === 'paused') return;
    const label = relatedCheckpointLabel(task, resources);
    if (!label) return;
    const key = logicalTaskKey(task);
    if (seenCheckpoints.has(key)) return;
    const status = taskStatus(task);
    const overdue = !!task.endDate && startOfDay(task.endDate) < startOfDay(today);
    if (status !== 'blocked' && status !== 'in_progress' && !overdue) return;
    seenCheckpoints.add(key);
    const group = ensureGroup(task);
    group.checkpoints.push({ task, label });
    group.blockedCount += status === 'blocked' ? 1 : 0;
    group.overdueCount += overdue ? 1 : 0;
    const checkpointLevel: DemandRiskGroup['level'] = status === 'blocked' || overdue ? 'high' : 'medium';
    if (levelRank[checkpointLevel] > levelRank[group.level]) group.level = checkpointLevel;
    group.score += LEVEL_SCORE[checkpointLevel] + (overdue ? 30 : 10);
  });

  const resourceById = new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource]));
  return [...groups.values()].map(group => {
    const reasons: string[] = [];
    if (group.overdueCount) reasons.push(`${group.overdueCount} 项逾期`);
    if (group.blockedCount) reasons.push(`${group.blockedCount} 项卡点/依赖`);
    if (group.staffingCount) reasons.push(`${group.staffingCount} 项人员或并行风险`);
    if (group.checkpoints.length) reasons.push(`${group.checkpoints.length} 个跨管线卡点`);
    const unscheduled = group.items.filter(item => item.tags.includes('unscheduled')).length;
    if (unscheduled) reasons.push(`${unscheduled} 项待排期`);
    const groupTasks = [...group.items.map(item => item.task), ...group.checkpoints.map(item => item.task)];
    const owners = new Set<string>();
    groupTasks.forEach(task => {
      (task.assigneeIds || []).forEach(id => {
        const name = resourceById.get(id)?.name;
        if (name) owners.add(name);
      });
      String(task.tapdOwner || '').split(/[;,，；]/).map(value => value.trim()).filter(Boolean).forEach(value => owners.add(value));
    });
    const deadlines = groupTasks.map(task => task.endDate).filter((date): date is Date => !!date).sort((a, b) => a.getTime() - b.getTime());
    const maxOverdueDays = deadlines.reduce((max, deadline) => Math.max(max, Math.floor((startOfDay(today).getTime() - startOfDay(deadline).getTime()) / 86_400_000)), 0);
    const latestUpdate = groupTasks.map(task => Number(task.updatedAt || 0)).filter(Boolean).sort((a, b) => b - a)[0];
    const staleDays = latestUpdate ? Math.max(0, Math.floor((startOfDay(today).getTime() - startOfDay(new Date(latestUpdate)).getTime()) / 86_400_000)) : undefined;
    const ownerNames = [...owners].slice(0, 4);
    const escalation: DemandRiskGroup['escalation'] = group.blockedCount > 0 || maxOverdueDays >= 3
      ? 'escalate'
      : maxOverdueDays > 0 || ownerNames.length === 0 || (staleDays !== undefined && staleDays >= 3)
        ? 'watch'
        : 'normal';
    if (maxOverdueDays > 0) reasons.push(`最长逾期 ${maxOverdueDays} 天`);
    if (staleDays !== undefined && staleDays >= 3) reasons.push(`${staleDays} 天未更新`);
    return { ...group, summaryReasons: [...new Set(reasons)], ownerNames, nearestDeadline: deadlines[0], maxOverdueDays, staleDays, escalation, score: group.score + maxOverdueDays * 5 };
  }).filter(group => group.items.length > 0 || group.checkpoints.length > 0)
    .sort((left, right) => {
      const escalationRank = { normal: 0, watch: 1, escalate: 2 };
      return escalationRank[right.escalation] - escalationRank[left.escalation] || levelRank[right.level] - levelRank[left.level] || right.score - left.score;
    });
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
      `   - 建议置信度：${suggestion ? `${suggestion.confidence}%` : '待评估'}`,
      `   - 调整依据：${suggestion?.reasons.join('；') || '需结合当前负载人工确认'}`,
      `   - TAPD：${item.task.externalUrl || item.task.tapdId || '无链接'}`,
      '',
    );
  });
  return lines.join('\n').trim();
}
