import type { Task } from '../types';

export type RequirementKind = 'parent' | 'child' | 'standalone';

/** EPIC is a structural ancestor in TAPD and must not become a local UX demand. */
export function isEpicWorkitemTypeName(value?: string): boolean {
  return /(?:^|[\s·_\-—:：])epic(?:$|[\s·_\-—:：])|史诗/i.test(String(value || '').trim());
}

export function isEpicRequirement(task: Pick<Task, 'tapdWorkitemTypeName'>): boolean {
  return isEpicWorkitemTypeName(task.tapdWorkitemTypeName);
}

export function getRequirementKind(task: Task, hasChildren = false): RequirementKind {
  const typeName = String(task.tapdWorkitemTypeName || '').trim().toLowerCase();
  const compactType = typeName.replace(/[\s·_\-—:：]/g, '');
  // Check child types first: names such as “UIStory子需求” must never be promoted to parents.
  if (compactType === 'ui' || compactType === 'ui子需求' || compactType === 'uistory子需求' || /子需求/.test(compactType)) return 'child';
  if (compactType === 'uistory' || compactType === 'uistory父需求' || compactType === 'ui需求' || /父需求/.test(compactType)) return 'parent';
  if (hasChildren) return 'parent';
  if (task.parentId || (task.tapdParentId && task.tapdParentId !== '0')) return 'child';
  return 'standalone';
}

export function getRequirementKindLabel(task: Task, hasChildren = false): string | undefined {
  const kind = getRequirementKind(task, hasChildren);
  if (kind === 'parent') return 'UIStory · 父需求';
  if (kind === 'child') return 'UI · 子需求';
  return undefined;
}
