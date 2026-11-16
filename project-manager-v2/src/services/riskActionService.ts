import { addDays } from 'date-fns';
import type { ProjectCalendarConfig, Resource, ResourceCapacity, Task } from '../types';
import { countWorkingDays, DEFAULT_PROJECT_CALENDAR, getNextWorkingDays, isWorkingDay } from '../utils/dateUtils';
import type { RiskTag, TaskRisk } from './workloadService';

export type RiskActionType =
  | 'delay'
  | 'reassign'
  | 'split'
  | 'reprioritize'
  | 'move_downstream'
  | 'confirm_blocker';

export interface RiskActionRecommendation {
  type: RiskActionType;
  label: string;
  reason: string;
  priority: 'primary' | 'alternative';
}

const ACTION_LABELS: Record<RiskActionType, string> = {
  delay: '延期',
  reassign: '换人',
  split: '拆分任务',
  reprioritize: '调整优先级',
  move_downstream: '调整后置阶段',
  confirm_blocker: '确认卡点',
};

function hasTag(risk: TaskRisk, tag: RiskTag): boolean {
  return risk.riskReasons?.some(reason => reason.tag === tag) || false;
}

function addAction(
  actions: RiskActionRecommendation[],
  type: RiskActionType,
  reason: string,
  priority: RiskActionRecommendation['priority'],
): void {
  if (actions.some(action => action.type === type)) return;
  actions.push({ type, label: ACTION_LABELS[type], reason, priority });
}

export function getRiskActionPlan(task: Task, risk: TaskRisk): RiskActionRecommendation[] {
  const actions: RiskActionRecommendation[] = [];
  const hasCapacityRisk = hasTag(risk, 'overload') || hasTag(risk, 'overlap');
  const hasDateRisk = hasTag(risk, 'overdue') || hasTag(risk, 'deadline');

  if (hasTag(risk, 'blocked')) {
    addAction(actions, 'confirm_blocker', task.blockReason || '先确认阻塞原因、责任人和解除条件', 'primary');
    addAction(actions, 'move_downstream', '卡点未解除前，后置阶段不应继续占用排期', 'alternative');
  }
  if (hasTag(risk, 'dependency')) {
    addAction(actions, 'move_downstream', '前置任务未完成，后置阶段应顺延到依赖完成后', 'primary');
    addAction(actions, 'delay', '重新计算后置任务的最早可开始日期', 'alternative');
  }
  if (hasCapacityRisk) {
    addAction(actions, 'reassign', '当前成员负荷或并行任务数过高，优先寻找同工种替代人员', 'primary');
    addAction(actions, 'split', '将任务拆成可独立交付的子项，降低单人峰值占用', 'alternative');
    addAction(actions, 'reprioritize', '降低非关键任务优先级，为当前风险任务释放容量', 'alternative');
  }
  if (hasDateRisk) {
    addAction(actions, 'delay', '当前日期已逾期或临近截止，需要重新确认交付日期', 'primary');
    addAction(actions, 'reprioritize', '提高该任务或降低冲突任务的优先级，明确资源取舍', 'alternative');
  }
  if (hasTag(risk, 'progress')) {
    addAction(actions, 'split', '进度不足时先拆出可验收的最小交付项', 'primary');
    addAction(actions, 'delay', '按剩余工作量重新估算结束日期', 'alternative');
  }

  if (actions.length === 0) {
    addAction(actions, 'confirm_blocker', '先确认风险来源和下一步负责人', 'primary');
  }
  return actions.slice(0, 4);
}

export function getRiskActionSummary(task: Task, risk: TaskRisk): string {
  return getRiskActionPlan(task, risk).map(action => action.label).join('、');
}

const KNOWN_RISK_TAGS: RiskTag[] = [
  'overdue', 'deadline', 'dependency', 'overload', 'overlap', 'blocked', 'progress',
];

/** Build an executable action plan from the lightweight planning-item tags. */
export function getRiskActionPlanForTags(
  task: Task,
  tags: Array<RiskTag | 'unscheduled' | 'unassigned'>,
): RiskActionRecommendation[] {
  const recognizedTags = tags.filter((tag): tag is RiskTag => KNOWN_RISK_TAGS.includes(tag as RiskTag));
  const riskReasons = recognizedTags.map(tag => ({
    tag,
    text: tag,
    severity: 'medium' as const,
  }));
  return getRiskActionPlan(task, {
    level: 'medium',
    reasons: riskReasons.map(reason => reason.text),
    riskReasons,
    colorClass: '',
    borderClass: '',
    glowClass: '',
    shouldAutoAlert: true,
  });
}

export interface ExecuteRiskActionInput {
  action: RiskActionType;
  task: Task;
  tasks: Task[];
  resources?: Resource[];
  capacities?: ResourceCapacity[];
  calendarConfig?: ProjectCalendarConfig;
  resourceId?: number;
}

export interface ExecuteRiskActionResult {
  applied: boolean;
  message: string;
  createdTaskId?: number;
}

function nextWorkingDate(date: Date, calendarConfig: ProjectCalendarConfig): Date {
  let cursor = addDays(new Date(date), 1);
  while (!isWorkingDay(cursor, calendarConfig)) cursor = addDays(cursor, 1);
  return cursor;
}

function shiftDateRange(task: Task, calendarConfig: ProjectCalendarConfig): { startDate: Date; endDate: Date } | undefined {
  if (!task.startDate || !task.endDate) return undefined;
  const startDate = nextWorkingDate(new Date(task.startDate), calendarConfig);
  const durationDays = Math.max(1, countWorkingDays(new Date(task.startDate), new Date(task.endDate), calendarConfig));
  const workingDays = getNextWorkingDays(startDate, durationDays, calendarConfig);
  return { startDate, endDate: workingDays[workingDays.length - 1] || startDate };
}

/** Execute a risk action against local planning data; TAPD is never written here. */
export async function executeRiskAction(input: ExecuteRiskActionInput): Promise<ExecuteRiskActionResult> {
  const calendarConfig = input.calendarConfig || DEFAULT_PROJECT_CALENDAR;
  if (!input.task.id) return { applied: false, message: '任务缺少本地 ID，无法执行风险处置' };
  const { trackedDb } = await import('../store/useHistoryStore');

  if (input.action === 'confirm_blocker') {
    await trackedDb.tasks.update(input.task.id, {
      isBlocked: true,
      blockReason: input.task.blockReason || '已确认卡点，待补充解除条件',
    }, '风险处置：确认卡点');
    return { applied: true, message: `已确认「${input.task.title}」的卡点，并保留在风险队列中` };
  }

  if (input.action === 'reprioritize') {
    const nextPriority = input.task.priority === 'high' ? 'medium' : input.task.priority === 'medium' ? 'low' : 'low';
    if (input.task.priority === nextPriority) return { applied: false, message: `「${input.task.title}」已经是最低优先级` };
    await trackedDb.tasks.update(input.task.id, { priority: nextPriority }, '风险处置：降低任务优先级');
    return { applied: true, message: `已将「${input.task.title}」优先级调整为${nextPriority === 'medium' ? '中' : '低'}` };
  }

  if (input.action === 'reassign') {
    if (!input.resourceId) return { applied: false, message: '请先选择要改派的成员' };
    const resource = input.resources?.find(item => item.id === input.resourceId);
    if (!resource || resource.status === 'departed') return { applied: false, message: '所选成员不可用，未执行改派' };
    await trackedDb.tasks.update(input.task.id, { assigneeIds: [input.resourceId] }, '风险处置：改派任务负责人');
    return { applied: true, message: `已将「${input.task.title}」改派给${resource.name}` };
  }

  if (input.action === 'split') {
    const estimatedHours = Math.max(1, Math.ceil((input.task.estimatedHours || 16) / 2));
    const createdTaskId = await trackedDb.tasks.add({
      title: `${input.task.title} · 拆分执行项`,
      description: input.task.description,
      notes: `由风险处置拆分生成，原任务：${input.task.title}`,
      status: 'todo',
      priority: input.task.priority,
      progress: 0,
      dependencies: [],
      type: input.task.type,
      projectId: input.task.projectId,
      parentId: input.task.id,
      assigneeIds: input.task.assigneeIds ? [...input.task.assigneeIds] : undefined,
      estimatedHours,
    }, '风险处置：拆分任务');
    return { applied: true, createdTaskId, message: `已为「${input.task.title}」创建本地拆分执行项` };
  }

  if (input.action === 'delay' || input.action === 'move_downstream') {
    const range = shiftDateRange(input.task, calendarConfig);
    if (!range) return { applied: false, message: `「${input.task.title}」暂无完整排期，无法自动顺延` };
    let startDate = range.startDate;
    if (input.action === 'move_downstream') {
      const dependencyEnds = (input.task.dependencies || [])
        .map(id => input.tasks.find(task => task.id === id)?.endDate)
        .filter((date): date is Date => Boolean(date));
      if (dependencyEnds.length > 0) {
        const latestDependencyEnd = new Date(Math.max(...dependencyEnds.map(date => new Date(date).getTime())));
        startDate = nextWorkingDate(latestDependencyEnd, calendarConfig);
        const durationDays = Math.max(1, countWorkingDays(new Date(input.task.startDate!), new Date(input.task.endDate!), calendarConfig));
        const workingDays = getNextWorkingDays(startDate, durationDays, calendarConfig);
        range.endDate = workingDays[workingDays.length - 1] || startDate;
      }
    }
    const { applyScheduleChanges } = await import('./scheduleChangeService');
    const result = await applyScheduleChanges({
      source: 'risk-action',
      tasks: input.tasks,
      resources: input.resources || [],
      capacities: input.capacities || [],
      calendarConfig,
      changes: [{ taskId: input.task.id, startDate, endDate: range.endDate }],
      reason: input.action === 'delay' ? '风险处置：顺延任务' : '风险处置：推动后置阶段',
      description: '风险面板执行的本地排期调整，不会自动回写 TAPD。',
      projectId: input.task.projectId,
    });
    return { applied: result.applied, message: result.applied ? `已调整「${input.task.title}」本地排期` : result.message };
  }

  return { applied: false, message: '当前风险动作暂不支持自动执行' };
}
