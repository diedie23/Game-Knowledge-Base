import type { Resource, Task } from '../types';
import { relatedCheckpointLabel, taskStage } from './uxStageView';

export type DataQualityIssueType = 'duplicate' | 'orphan' | 'invalid-date' | 'missing-type' | 'unmapped-owner' | 'stale-sync';

export interface DataQualityIssue {
  type: DataQualityIssueType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  task?: Task;
  taskIds?: number[];
  count?: number;
}

export interface DataQualityAudit {
  issues: DataQualityIssue[];
  criticalCount: number;
  warningCount: number;
  score: number;
  latestSyncAt?: number;
}

function isTapdTask(task: Task): boolean {
  return !!task.tapdId || task.syncSource === 'tapd' || task.syncSource === 'tapd-import';
}

export function auditTaskDataQuality(tasks: Task[], resources: Resource[], now: Date = new Date()): DataQualityAudit {
  const issues: DataQualityIssue[] = [];
  const byId = new Map(tasks.filter(task => task.id).map(task => [task.id!, task]));
  const childIds = new Set(tasks.flatMap(task => task.parentId ? [task.parentId] : []));
  const tapdGroups = new Map<string, Task[]>();
  tasks.filter(task => task.tapdId).forEach(task => tapdGroups.set(task.tapdId!, [...(tapdGroups.get(task.tapdId!) || []), task]));

  tapdGroups.forEach(group => {
    if (group.length < 2) return;
    issues.push({
      type: 'duplicate',
      severity: 'critical',
      title: '重复 TAPD 记录',
      detail: `TAPD #${group[0].tapdId} 在本地出现 ${group.length} 次`,
      task: group[0],
      taskIds: group.map(task => task.id).filter((id): id is number => !!id),
      count: group.length,
    });
  });

  tasks.forEach(task => {
    if (task.parentId && !byId.has(task.parentId)) issues.push({ type: 'orphan', severity: 'critical', title: '父子关系断开', detail: `找不到父任务 #${task.parentId}`, task, taskIds: task.id ? [task.id] : [] });
    if (task.startDate && task.endDate && task.startDate > task.endDate) issues.push({ type: 'invalid-date', severity: 'critical', title: '排期日期错误', detail: '开始日期晚于结束日期', task, taskIds: task.id ? [task.id] : [] });
    if (!isTapdTask(task)) return;
    if (!task.tapdWorkitemTypeName) issues.push({ type: 'missing-type', severity: 'warning', title: 'TAPD 类型缺失', detail: '无法确认是 UIStory、UI 子需求还是其他需求类型', task });
    const isLeaf = !task.id || !childIds.has(task.id);
    if (isLeaf && taskStage(task, resources) && !relatedCheckpointLabel(task, resources) && !task.assigneeIds?.length) {
      issues.push({ type: 'unmapped-owner', severity: 'warning', title: 'UX 处理人未映射', detail: task.tapdOwner ? `TAPD 处理人“${task.tapdOwner}”未映射到团队成员` : 'TAPD 未提供可识别的处理人', task });
    }
  });

  const latestSyncAt = tasks.filter(isTapdTask).map(task => Number(task.syncedAt || 0)).filter(Boolean).sort((a, b) => b - a)[0];
  if (!latestSyncAt || now.getTime() - latestSyncAt > 24 * 60 * 60 * 1000) {
    issues.push({ type: 'stale-sync', severity: 'warning', title: 'TAPD 数据需要刷新', detail: latestSyncAt ? `最近同步于 ${new Date(latestSyncAt).toLocaleString('zh-CN')}` : '尚无有效同步时间' });
  }

  const criticalCount = issues.filter(issue => issue.severity === 'critical').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  // Keep the score useful on large projects: repeated warnings should lower
  // confidence, but must not make every sizeable TAPD workspace read as zero.
  const criticalPenalty = Math.min(60, criticalCount * 15);
  const warningPenalty = Math.min(30, warningCount * 2);
  const score = Math.max(10, 100 - criticalPenalty - warningPenalty);
  return { issues: issues.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1)), criticalCount, warningCount, score, latestSyncAt };
}
