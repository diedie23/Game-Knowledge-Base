import type { Task } from '../types';
import type { SyncRangeConfig } from '../types/tapd';

const TAPD_WORKSPACE_SEPARATOR = /[,;，；]/;

export function parseTapdWorkspaceIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(TAPD_WORKSPACE_SEPARATOR).map(id => id.trim()).filter(Boolean))];
}

export function createTapdSyncId(workspaceId: string, tapdId: string | number): string {
  return `tapd:${workspaceId.trim()}:${String(tapdId).trim()}`;
}

/**
 * Return the canonical identity used for deduplication and aggregation.
 * Legacy TAPD records without a workspace stay project-scoped so an equal
 * TAPD numeric ID in another local project cannot be collapsed accidentally.
 */
export function getTaskIdentity(
  task: Pick<Task, 'syncId' | 'tapdWorkspaceId' | 'tapdId' | 'projectId' | 'id' | 'title'>,
): string {
  if (task.syncId) return task.syncId;
  if (task.tapdWorkspaceId && task.tapdId) return createTapdSyncId(task.tapdWorkspaceId, task.tapdId);
  if (task.tapdId) return `tapd-legacy:${task.projectId ?? 'unknown'}:${task.tapdId}`;
  return `local:${task.projectId ?? 'unknown'}:${task.id ?? task.title}`;
}

export function configContainsTapdWorkspace(configWorkspaceIds: string | null | undefined, workspaceId: string): boolean {
  const target = workspaceId.trim();
  return Boolean(target) && parseTapdWorkspaceIds(configWorkspaceIds).includes(target);
}

/**
 * Return true only when a linked TAPD task has enough source metadata to prove
 * that it is outside the currently selected type/release scope. Missing legacy
 * metadata is intentionally kept rather than deleted during reconciliation.
 */
export function isTapdTaskOutsideSelectedScope(
  task: Pick<Task, 'tapdWorkitemTypeId' | 'tapdReleaseId'>,
  syncRange?: Pick<SyncRangeConfig, 'workitemTypeFilter' | 'releaseFilter'>,
): boolean {
  const typeIds = new Set((syncRange?.workitemTypeFilter || []).map(String).filter(Boolean));
  const releaseIds = new Set((syncRange?.releaseFilter || []).map(String).filter(Boolean));
  const hasKnownOutOfScopeType = typeIds.size > 0
    && Boolean(task.tapdWorkitemTypeId)
    && !typeIds.has(String(task.tapdWorkitemTypeId));
  const hasKnownOutOfScopeRelease = releaseIds.size > 0
    && Boolean(task.tapdReleaseId)
    && !releaseIds.has(String(task.tapdReleaseId));
  return hasKnownOutOfScopeType || hasKnownOutOfScopeRelease;
}
