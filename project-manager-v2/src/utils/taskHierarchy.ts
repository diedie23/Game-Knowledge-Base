import type { Task } from '../types';

export type RequirementKind = 'parent' | 'child' | 'standalone';

export function getRequirementKind(task: Task, hasChildren = false): RequirementKind {
  const typeName = String(task.tapdWorkitemTypeName || '').trim().toLowerCase();
  const rawType = `${typeName} ${task.tapdWorkitemTypeId || ''}`.trim().toLowerCase();
  if (/uistory|ui\s*story|父需求/.test(rawType)) return 'parent';
  if (typeName === 'ui' || /ui子需求|子需求/.test(typeName)) return 'child';
  if (hasChildren) return 'parent';
  if (task.parentId) return 'child';
  return 'standalone';
}

export function getRequirementKindLabel(task: Task, hasChildren = false): string | undefined {
  const kind = getRequirementKind(task, hasChildren);
  if (kind === 'parent') return '父·UIStory';
  if (kind === 'child') return '子·UI';
  return undefined;
}
