import type { Resource, Task } from '../types';
import { getTaskIdentity } from '../utils/tapdIdentity';
import { buildTaskHierarchyIndex, getTaskParent } from '../utils/taskHierarchy';
import { relatedCheckpointLabel, taskStage } from './uxStageView';
import { getTaskAssigneeIds } from '../utils/taskAssignee';
import { isTaskTerminal } from '../utils/taskState';

export type DataQualityIssueType =
  | 'duplicate'
  | 'orphan'
  | 'invalid-date'
  | 'missing-type'
  | 'unmapped-owner'
  | 'invalid-owner'
  | 'departed-owner'
  | 'workspace-ambiguous'
  | 'project-mismatch'
  | 'cycle'
  | 'dependency-cycle'
  | 'status-conflict'
  | 'stale-sync';

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

export interface ScheduleGate {
  allowed: boolean;
  blockingTaskIds: number[];
  reasons: string[];
}

/**
 * Decide whether automatic scheduling may proceed without turning the score
 * into a misleading global switch. Critical structural issues block only the
 * affected tasks; warnings remain visible for manual review.
 */
export function getScheduleGate(audit: DataQualityAudit, taskIds?: number[]): ScheduleGate {
  const selectedIds = taskIds ? new Set(taskIds) : undefined;
  const blockingIssues = audit.issues.filter(issue => {
    if (issue.severity !== 'critical') return false;
    if (!selectedIds) return true;
    const issueTaskIds = issue.taskIds || (issue.task?.id ? [issue.task.id] : []);
    return issueTaskIds.length === 0 || issueTaskIds.some(id => selectedIds.has(id));
  });
  const blockingTaskIds = [...new Set(blockingIssues.flatMap(issue => issue.taskIds || (issue.task?.id ? [issue.task.id] : [])))];
  return {
    allowed: blockingIssues.length === 0,
    blockingTaskIds,
    reasons: [...new Set(blockingIssues.map(issue => `${issue.title}：${issue.detail}`))],
  };
}

function isTapdTask(task: Task): boolean {
  return !!task.tapdId || task.syncSource === 'tapd' || task.syncSource === 'tapd-import';
}

function findDependencyCycle(task: Task, byId: Map<number, Task>): number[] {
  if (task.id === undefined) return [];
  const path: number[] = [];
  const pathIndex = new Map<number, number>();
  const visit = (taskId: number): number[] => {
    const existingIndex = pathIndex.get(taskId);
    if (existingIndex !== undefined) return path.slice(existingIndex);
    const current = byId.get(taskId);
    if (!current) return [];
    pathIndex.set(taskId, path.length);
    path.push(taskId);
    for (const dependencyId of current.dependencies || []) {
      const cycle = visit(dependencyId);
      if (cycle.length > 0) return cycle;
    }
    path.pop();
    pathIndex.delete(taskId);
    return [];
  };
  return visit(task.id);
}

export function auditTaskDataQuality(tasks: Task[], resources: Resource[], now: Date = new Date()): DataQualityAudit {
  const issues: DataQualityIssue[] = [];
  const byId = new Map(tasks.filter(task => task.id).map(task => [task.id!, task]));
  const hierarchy = buildTaskHierarchyIndex(tasks);
  const childIds = hierarchy.parentTaskIds;
  const tapdGroups = new Map<string, Task[]>();
  tasks.filter(task => task.tapdId).forEach(task => {
    const identity = getTaskIdentity(task);
    tapdGroups.set(identity, [...(tapdGroups.get(identity) || []), task]);
  });

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

  const resourceById = new Map(resources.filter(resource => resource.id !== undefined).map(resource => [resource.id!, resource]));
  const reportedDependencyCycles = new Set<string>();

  tasks.forEach(task => {
    const taskIds = task.id ? [task.id] : [];
    const parent = task.parentId !== undefined ? byId.get(task.parentId) : undefined;
    if (task.parentId && !parent) {
      issues.push({ type: 'orphan', severity: 'critical', title: '父子关系断开', detail: `找不到父任务 #${task.parentId}`, task, taskIds });
    } else if (parent && parent.projectId !== task.projectId) {
      issues.push({ type: 'project-mismatch', severity: 'critical', title: '父子项目不一致', detail: `父任务 #${parent.id} 属于项目 ${parent.projectId}，当前任务属于项目 ${task.projectId}`, task, taskIds: [...taskIds, parent.id!] });
    } else if (task.tapdParentId && task.tapdParentId !== '0' && !getTaskParent(task, hierarchy)) {
      issues.push({ type: 'orphan', severity: 'critical', title: 'TAPD 父子关系未解析', detail: `找不到 TAPD 父需求 #${task.tapdParentId}`, task, taskIds });
    }
    if (task.startDate && Number.isNaN(new Date(task.startDate).getTime()) || task.endDate && Number.isNaN(new Date(task.endDate).getTime())) {
      issues.push({ type: 'invalid-date', severity: 'critical', title: '排期日期格式错误', detail: '开始日期或结束日期不是有效日期', task, taskIds });
    } else if (task.startDate && task.endDate && task.startDate > task.endDate) {
      issues.push({ type: 'invalid-date', severity: 'critical', title: '排期日期错误', detail: '开始日期晚于结束日期', task, taskIds });
    }

    const dependencyCycle = findDependencyCycle(task, byId);
    if (dependencyCycle.length > 0) {
      const key = [...dependencyCycle].sort((a, b) => a - b).join(',');
      if (!reportedDependencyCycles.has(key)) {
        reportedDependencyCycles.add(key);
        issues.push({ type: 'dependency-cycle', severity: 'critical', title: '前置依赖形成循环', detail: `依赖链包含任务 ${dependencyCycle.map(id => `#${id}`).join(' → ')}`, task, taskIds: dependencyCycle });
      }
    }

    if (!isTapdTask(task)) return;
    if (task.tapdId && !task.tapdWorkspaceId && (task.syncId || task.syncSource === 'tapd' || task.syncSource === 'tapd-import')) {
      issues.push({ type: 'workspace-ambiguous', severity: 'critical', title: 'TAPD 工作区身份缺失', detail: '该记录有同步身份但没有工作区，无法安全区分同 ID 需求', task, taskIds });
    }
    if (!task.tapdWorkitemTypeName) issues.push({ type: 'missing-type', severity: 'warning', title: 'TAPD 类型缺失', detail: '无法确认是 UIStory、UI 子需求还是其他需求类型', task });

    const assigneeIds = getTaskAssigneeIds(task);
    const invalidOwnerIds = assigneeIds.filter(id => !resourceById.has(id));
    if (invalidOwnerIds.length > 0) {
      issues.push({ type: 'invalid-owner', severity: 'critical', title: '负责人 ID 无效', detail: `本地不存在成员 #${invalidOwnerIds.join('、')}`, task, taskIds });
    }
    const unavailableOwners = assigneeIds.filter(id => {
      const resource = resourceById.get(id);
      if (!resource) return false;
      const todayKey = now.toISOString().slice(0, 10);
      return resource.status === 'departed'
        || (!!resource.departDate && resource.departDate < todayKey)
        || (!!resource.joinDate && resource.joinDate > todayKey);
    });
    if (unavailableOwners.length > 0) {
      issues.push({ type: 'departed-owner', severity: 'critical', title: '负责人不在有效任职期', detail: `成员 ${unavailableOwners.map(id => `#${id}`).join('、')} 已离职或尚未入职`, task, taskIds });
    }

    const isLeaf = !task.id || !childIds.has(task.id);
    if (isLeaf && !isTaskTerminal(task) && taskStage(task, resources) && !relatedCheckpointLabel(task, resources) && assigneeIds.length === 0) {
      issues.push({ type: 'unmapped-owner', severity: 'warning', title: 'UX 处理人未映射', detail: task.tapdOwner ? `TAPD 处理人“${task.tapdOwner}”未映射到团队成员` : 'TAPD 未提供可识别的处理人', task });
    }
    if ((task.status === 'done' && (task.progress ?? 0) < 100) || (task.status !== 'done' && task.status !== 'cancelled' && (task.progress ?? 0) >= 100) || (task.completedAt && task.status !== 'done' && task.status !== 'cancelled')) {
      issues.push({ type: 'status-conflict', severity: 'warning', title: '状态、进度或完成日期冲突', detail: 'TAPD 状态、进度和完成日期无法互相印证', task, taskIds });
    }
  });

  if (hierarchy.cycleTaskIds.size > 0) {
    const cycleTaskIds = [...hierarchy.cycleTaskIds];
    issues.push({ type: 'cycle', severity: 'critical', title: '父子关系形成循环', detail: `涉及任务 ${cycleTaskIds.map(id => `#${id}`).join('、')}`, taskIds: cycleTaskIds, count: cycleTaskIds.length });
  }

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
