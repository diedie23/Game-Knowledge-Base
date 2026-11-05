import { db } from '../db/db';
import type { TapdConfig, SyncRangeConfig } from '../types/tapd';
import type { SyncMeta, SyncOperation, SyncSummary } from '../types/sync';
import { parseTapdWorkspaceIds } from '../utils/tapdIdentity';
import { getTaskAssigneeIds } from '../utils/taskAssignee';

export type SyncHealthStatus = 'aligned' | 'attention' | 'partial' | 'unknown' | 'not_configured';

export interface TapdSyncHealth {
  configured: boolean;
  workspaceIds: string[];
  workspaceName?: string;
  authMode?: TapdConfig['authMode'];
  scopeLabel: string;
  lastSyncAt: number | null;
  lastSuccessfulSyncAt: number | null;
  lastOperation?: SyncOperation;
  lastRemoteTaskCount?: number;
  localTaskCount: number;
  linkedTaskCount: number;
  manualTaskCount: number;
  unmatchedOwnerCount: number;
  pendingChanges: number;
  unresolvedConflicts: number;
  summary?: SyncSummary;
  status: SyncHealthStatus;
  statusLabel: string;
  statusReason: string;
}

const RANGE_LABEL: Record<SyncRangeConfig['mode'], string> = {
  all: '全部数据',
  recent: '最近修改',
  custom: '自定义时间',
};

export function formatSyncScope(syncRange?: SyncRangeConfig): string {
  if (!syncRange) return '全部数据';
  const parts = [RANGE_LABEL[syncRange.mode] || '全部数据'];
  if (syncRange.mode === 'recent' && syncRange.recentDays) {
    parts.push(`${syncRange.recentDays} 天`);
  }
  if (syncRange.mode === 'custom' && syncRange.startDate) {
    parts.push(`${syncRange.startDate} 至 ${syncRange.endDate || '今天'}`);
  }
  if (syncRange.workitemTypeFilter?.length) {
    parts.push(`需求类别 ${syncRange.workitemTypeFilter.length} 类`);
  }
  if (syncRange.releaseFilter?.length) {
    parts.push(`发布计划 ${syncRange.releaseFilter.length} 项`);
  }
  if (syncRange.categoryKeywords?.length) {
    parts.push(`关键词 ${syncRange.categoryKeywords.length} 个`);
  }
  if (syncRange.ownerFilter?.length) {
    parts.push(`处理人 ${syncRange.ownerFilter.length} 个`);
  }
  if (syncRange.pipelineFilter) parts.push('UX 管线筛选');
  return parts.join(' · ');
}

function getSyncMeta(projectId: number): Promise<SyncMeta | undefined> {
  return db.syncMeta
    .where('[source+projectId]')
    .equals(['tapd', projectId])
    .first()
    .catch(() => db.syncMeta.filter(meta => meta.source === 'tapd' && meta.projectId === projectId).first());
}

export async function countWorkspaceLinkedTasks(projectId: number, workspaceIds: string[]): Promise<number> {
  const workspaceSet = new Set(workspaceIds);
  const tasks = await db.tasks.where('projectId').equals(projectId).toArray();
  return tasks.filter(task => {
    if (!task.tapdId && !task.syncId) return false;
    return workspaceSet.size === 0
      || !task.tapdWorkspaceId
      || workspaceSet.has(task.tapdWorkspaceId);
  }).length;
}

export async function recordTapdSyncMeta(
  projectId: number,
  updates: Partial<Omit<SyncMeta, 'source' | 'projectId'>> & {
    lastSyncOperation?: SyncOperation;
    lastSyncSummary?: SyncSummary;
  },
): Promise<void> {
  const existing = await getSyncMeta(projectId);
  if (existing?.id) {
    await db.syncMeta.update(existing.id, updates);
    return;
  }
  await db.syncMeta.add({
    source: 'tapd',
    projectId,
    lastPullAt: 0,
    lastPushAt: 0,
    status: 'idle',
    ...updates,
  } as SyncMeta);
}

export function evaluateTapdSyncStatus(params: {
  meta?: SyncMeta;
  linkedTaskCount: number;
  pendingChanges: number;
  unresolvedConflicts: number;
}): Pick<TapdSyncHealth, 'status' | 'statusLabel' | 'statusReason'> {
  const { meta, linkedTaskCount, pendingChanges, unresolvedConflicts } = params;
  if (!meta?.lastSuccessfulSyncAt) {
    return {
      status: 'unknown',
      statusLabel: '尚未完成同步核验',
      statusReason: '先执行一次“拉取任务”或“刷新状态”，再判断本地数据是否与 TAPD 对齐。',
    };
  }
  const summary = meta.lastSyncSummary;
  const failed = summary?.failed || 0;
  const comparable = meta.lastSyncComparable !== false && meta.lastRemoteTaskCount !== undefined;
  if (pendingChanges > 0 || unresolvedConflicts > 0 || failed > 0) {
    return {
      status: 'attention',
      statusLabel: '需要处理同步异常',
      statusReason: [
        pendingChanges > 0 ? `${pendingChanges} 条本地修改待推送` : '',
        unresolvedConflicts > 0 ? `${unresolvedConflicts} 个冲突待解决` : '',
        failed > 0 ? `${failed} 条记录未能确认` : '',
      ].filter(Boolean).join('；'),
    };
  }
  if (comparable && meta.lastRemoteTaskCount !== linkedTaskCount) {
    return {
      status: 'attention',
      statusLabel: '本地与 TAPD 数量不一致',
      statusReason: `TAPD 返回 ${meta.lastRemoteTaskCount} 条，本地已关联 ${linkedTaskCount} 条，请检查范围、重复或清理结果。`,
    };
  }
  if (meta.lastSyncComparable === false) {
    return {
      status: 'partial',
      statusLabel: '已同步，当前为部分范围',
      statusReason: '本次同步只覆盖了选择的需求或局部范围，数量不能代表整个 TAPD 工作区。',
    };
  }
  return {
    status: 'aligned',
    statusLabel: '本地数据已与 TAPD 对齐',
    statusReason: `已完成 ${meta.lastSyncOperation === 'refresh' ? '状态刷新' : '数据同步'}，未发现待处理异常。`,
  };
}

export async function getTapdSyncHealth(projectId: number): Promise<TapdSyncHealth> {
  const [config, tasks, meta, conflicts, changeLogs] = await Promise.all([
    db.tapdConfigs.where('projectId').equals(projectId).first(),
    db.tasks.where('projectId').equals(projectId).toArray(),
    getSyncMeta(projectId),
    db.syncConflicts.where('projectId').equals(projectId).filter(conflict => !conflict.resolvedAt).toArray().catch(async () =>
      db.syncConflicts.filter(conflict => !conflict.resolvedAt && conflict.localVersion?.projectId === projectId).toArray()
    ),
    db.changeLogs.where('projectId').equals(projectId).filter(log => !log.synced).toArray().catch(async () =>
      db.changeLogs.filter(log => !log.synced && log.projectId === projectId).toArray()
    ),
  ]);

  if (!config) {
    return {
      configured: false,
      workspaceIds: [],
      scopeLabel: '未配置同步范围',
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      localTaskCount: tasks.length,
      linkedTaskCount: 0,
      manualTaskCount: tasks.length,
      unmatchedOwnerCount: 0,
      pendingChanges: changeLogs.length,
      unresolvedConflicts: conflicts.length,
      status: 'not_configured',
      statusLabel: '尚未绑定 TAPD',
      statusReason: '请先在“配置”页签绑定 TAPD 工作区。',
    };
  }

  const workspaceIds = parseTapdWorkspaceIds(config.workspaceId);
  const isLinked = (task: typeof tasks[number]) => Boolean(
    (task.tapdId || task.syncId)
      && (workspaceIds.length === 0 || !task.tapdWorkspaceId || workspaceIds.includes(task.tapdWorkspaceId)),
  );
  const linkedTasks = tasks.filter(isLinked);
  const manualTasks = tasks.filter(task => !isLinked(task));
  const unmatchedOwnerCount = linkedTasks.filter(task => String(task.tapdOwner || '').trim() && getTaskAssigneeIds(task).length === 0).length;
  const status = evaluateTapdSyncStatus({
    meta,
    linkedTaskCount: linkedTasks.length,
    pendingChanges: changeLogs.length,
    unresolvedConflicts: conflicts.length,
  });
  const lastSyncAt = meta ? Math.max(meta.lastPullAt || 0, meta.lastPushAt || 0) || null : null;

  return {
    configured: true,
    workspaceIds,
    workspaceName: config.workspaceName,
    authMode: config.authMode,
    scopeLabel: formatSyncScope(config.syncRange),
    lastSyncAt,
    lastSuccessfulSyncAt: meta?.lastSuccessfulSyncAt || null,
    lastOperation: meta?.lastSyncOperation,
    lastRemoteTaskCount: meta?.lastRemoteTaskCount,
    localTaskCount: tasks.length,
    linkedTaskCount: linkedTasks.length,
    manualTaskCount: manualTasks.length,
    unmatchedOwnerCount,
    pendingChanges: changeLogs.length,
    unresolvedConflicts: conflicts.length,
    summary: meta?.lastSyncSummary,
    ...status,
  };
}
