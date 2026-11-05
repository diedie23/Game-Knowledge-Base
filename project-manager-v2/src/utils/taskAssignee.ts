import type { Task } from '../types/task';

/** Runtime-compatible shape for records written by older local database versions. */
type TaskWithLegacyAssignee = Task & {
  assigneeId?: number | string | null;
  assigneeIds?: unknown;
};

const UNASSIGNED_OWNER_TOKENS = new Set([
  '',
  '0',
  '-',
  'none',
  'null',
  'undefined',
  'unassigned',
  '未分配',
  '待分配',
  '未指定',
  '暂无',
  '无',
]);

function normalizeOwnerToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function isMeaningfulOwnerToken(value: string): boolean {
  return !UNASSIGNED_OWNER_TOKENS.has(normalizeOwnerToken(value));
}

/** Convert both numeric and string resource IDs into the canonical local ID shape. */
export function normalizeResourceId(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Return the effective local assignee IDs, including legacy single-value records
 * and string IDs that may still exist in IndexedDB after older imports.
 */
export function getTaskAssigneeIds(task: Task): number[] {
  const record = task as TaskWithLegacyAssignee;
  const rawIds = Array.isArray(record.assigneeIds) ? record.assigneeIds : [];
  const values = record.assigneeId === undefined || record.assigneeId === null
    ? rawIds
    : [...rawIds, record.assigneeId];
  return [...new Set(values.map(normalizeResourceId).filter((id): id is number => id !== undefined))];
}

/**
 * Split TAPD owner values and expose the full value plus account/name parts.
 * This supports values such as "姓名（tapd_account）" without requiring a
 * successful local resource match before the task is considered assigned.
 */
export function getTaskOwnerTokens(owner?: string): string[] {
  const values = String(owner || '')
    .split(/[;,，；、|/]/)
    .map(value => value.trim())
    .filter(Boolean);
  const tokens = values.flatMap(value => {
    const result = [value];
    const parenthesized = value.match(/^(.*?)\s*[（(]\s*([^（）()]*)\s*[）)]\s*$/);
    if (parenthesized) {
      result.push(parenthesized[1], parenthesized[2]);
    }
    return result;
  });
  return [...new Set(tokens.filter(isMeaningfulOwnerToken).map(normalizeOwnerToken))];
}

/** A TAPD owner or a valid local resource ID is enough to treat the task as assigned. */
export function hasTaskAssignee(task: Task): boolean {
  return getTaskAssigneeIds(task).length > 0 || getTaskOwnerTokens(task.tapdOwner).length > 0;
}
