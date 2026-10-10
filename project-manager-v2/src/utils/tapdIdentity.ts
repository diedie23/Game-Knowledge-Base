import type { Task } from '../types';

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
