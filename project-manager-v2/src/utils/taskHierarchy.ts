import type { Task } from '../types';

export type RequirementKind = 'parent' | 'child' | 'standalone';

export interface TaskHierarchyIndex {
  taskById: Map<number, Task>;
  taskByTapdId: Map<string, Task>;
  childrenByParentId: Map<number, Task[]>;
  parentTaskIds: Set<number>;
  leafTasks: Task[];
}

function normalizeRelationId(value?: number | string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

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

/**
 * Build one hierarchy index for both local and TAPD parent references.
 *
 * Local parentId is the preferred link. TAPD's tapdParentId is resolved
 * through the child's tapdId so a freshly imported dataset can still identify
 * parent rows before local parentId backfill finishes.
 */
export function buildTaskHierarchyIndex(tasks: Task[]): TaskHierarchyIndex {
  const taskById = new Map<number, Task>();
  const taskByTapdId = new Map<string, Task>();
  const childrenByParentId = new Map<number, Task[]>();
  const parentTaskIds = new Set<number>();

  for (const task of tasks) {
    if (task.id !== undefined) taskById.set(task.id, task);
    const tapdId = normalizeRelationId(task.tapdId);
    if (tapdId && !taskByTapdId.has(tapdId)) taskByTapdId.set(tapdId, task);
  }

  const addChild = (parentId: number, child: Task) => {
    if (child.id === undefined || child.id === parentId) return;
    parentTaskIds.add(parentId);
    const children = childrenByParentId.get(parentId) || [];
    if (!children.some(candidate => candidate.id === child.id)) children.push(child);
    childrenByParentId.set(parentId, children);
  };

  for (const task of tasks) {
    if (task.parentId !== undefined) addChild(task.parentId, task);

    const tapdParentId = normalizeRelationId(task.tapdParentId);
    if (!tapdParentId) continue;
    const parent = taskByTapdId.get(tapdParentId);
    if (parent?.id !== undefined) addChild(parent.id, task);
  }

  // TAPD can return the parent row without its children. Its work-item type is
  // still a reliable structural signal, so keep it out of leaf-only queues.
  for (const task of tasks) {
    if (task.id !== undefined && getRequirementKind(task) === 'parent') parentTaskIds.add(task.id);
  }

  const leafTasks = tasks.filter(task => task.id === undefined || !parentTaskIds.has(task.id));
  return { taskById, taskByTapdId, childrenByParentId, parentTaskIds, leafTasks };
}

export function isParentTask(task: Task, hierarchy: TaskHierarchyIndex): boolean {
  return task.id !== undefined && hierarchy.parentTaskIds.has(task.id);
}

export function getTaskParent(task: Task, hierarchy: TaskHierarchyIndex): Task | undefined {
  if (task.parentId !== undefined) {
    const localParent = hierarchy.taskById.get(task.parentId);
    if (localParent) return localParent;
  }
  const tapdParentId = normalizeRelationId(task.tapdParentId);
  return tapdParentId ? hierarchy.taskByTapdId.get(tapdParentId) : undefined;
}
