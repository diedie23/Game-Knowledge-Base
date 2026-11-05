import type { Task } from '../types';
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
