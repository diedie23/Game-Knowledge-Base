const TAPD_WORKSPACE_SEPARATOR = /[,;，；]/;

export function parseTapdWorkspaceIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(TAPD_WORKSPACE_SEPARATOR).map(id => id.trim()).filter(Boolean))];
}

export function createTapdSyncId(workspaceId: string, tapdId: string | number): string {
  return `tapd:${workspaceId.trim()}:${String(tapdId).trim()}`;
}

export function configContainsTapdWorkspace(configWorkspaceIds: string | null | undefined, workspaceId: string): boolean {
  const target = workspaceId.trim();
  return Boolean(target) && parseTapdWorkspaceIds(configWorkspaceIds).includes(target);
}
