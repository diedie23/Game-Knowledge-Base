/**
 * taskService.ts — Unified Task CRUD + Validation Service Layer
 * 
 * This service encapsulates all task-related business logic, providing:
 * - CRUD operations with automatic history tracking
 * - Date validation and dependency conflict detection
 * - Parent date range auto-sync
 * - Duplicate detection
 * - Batch operations
 */

import { db, Task } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { syncParentDateRange, checkDependencyConflicts } from './workloadService';
import type { DependencyConflict } from './workloadService';

// ─── Types ───

export interface CreateTaskDTO {
  title: string;
  status?: Task['status'];
  priority?: Task['priority'];
  type?: string;
  projectId: number;
  parentId?: number;
  assigneeIds?: number[];
  startDate?: Date;
  endDate?: Date;
  dependencies?: number[];
  externalUrl?: string;
  module?: string;
  workCategory?: Task['workCategory'];
  notes?: string;
}

export interface UpdateTaskDTO {
  title?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  type?: string;
  assigneeIds?: number[];
  startDate?: Date;
  endDate?: Date;
  dependencies?: number[];
  externalUrl?: string;
  module?: string;
  workCategory?: Task['workCategory'];
  notes?: string;
  isBlocked?: boolean;
  blockReason?: string;
  progress?: number;
  completedAt?: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TaskDeleteResult {
  deletedIds: number[];
  parentIdsToSync: number[];
}

// ─── Validation ───

/**
 * Validate task data before create/update
 */
export function validateTask(data: Partial<Task>, allTasks: Task[], editingId?: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Title required
  if ('title' in data && (!data.title || !data.title.trim())) {
    errors.push('任务标题不能为空');
  }

  // Duplicate title check
  if (data.title) {
    const duplicate = allTasks.find(t => {
      if (t.id === editingId) return false;
      return t.title.trim().toLowerCase() === data.title!.trim().toLowerCase();
    });
    if (duplicate) {
      errors.push(`已存在同名任务「${duplicate.title}」(ID: ${duplicate.id})`);
    }
  }

  // Date validation
  if (data.startDate && data.endDate) {
    if (data.startDate > data.endDate) {
      errors.push('开始日期不能晚于结束日期');
    }
  }

  // Dependency conflict check
  if (data.dependencies && data.dependencies.length > 0 && data.startDate) {
    for (const depId of data.dependencies) {
      const depTask = allTasks.find(t => t.id === depId);
      if (depTask?.endDate && data.startDate < depTask.endDate) {
        warnings.push(`依赖任务「${depTask.title}」的结束日期晚于本任务开始日期`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── CRUD Operations ───

/**
 * Create a new task with validation and history tracking
 */
export async function createTask(data: CreateTaskDTO, reason?: string): Promise<number> {
  const task: Partial<Task> = {
    title: data.title,
    status: data.status || 'todo',
    priority: data.priority || 'medium',
    type: data.type || 'feature',
    projectId: data.projectId,
    parentId: data.parentId,
    assigneeIds: data.assigneeIds || [],
    startDate: data.startDate,
    endDate: data.endDate,
    dependencies: data.dependencies || [],
    externalUrl: data.externalUrl,
    module: data.module,
    workCategory: data.workCategory,
    notes: data.notes,
    progress: 0,
    updatedAt: Date.now(),
  };

  const id = await trackedDb.tasks.add(task as Task, reason || `新建任务「${data.title}」`);

  // Auto-sync parent date range
  if (data.parentId) {
    await syncParentDateRange(data.parentId);
  }

  return id as number;
}

/**
 * Update an existing task with history tracking
 */
export async function updateTask(id: number, data: UpdateTaskDTO, reason?: string): Promise<void> {
  const updateData: Partial<Task> = { ...data, updatedAt: Date.now() };

  // If marking as done, set completedAt
  if (data.status === 'done' && !data.completedAt) {
    updateData.completedAt = new Date();
  }

  await trackedDb.tasks.update(id, updateData, reason || '编辑任务');

  // Auto-sync parent date range
  const task = await db.tasks.get(id);
  if (task?.parentId) {
    await syncParentDateRange(task.parentId);
  }
}

/**
 * Batch update multiple tasks
 */
export async function batchUpdateTasks(ids: number[], data: Partial<Task>, reason?: string): Promise<void> {
  const parentIdsToSync = new Set<number>();

  for (const id of ids) {
    const task = await db.tasks.get(id);
    if (task?.parentId) parentIdsToSync.add(task.parentId);
    await trackedDb.tasks.update(id, { ...data, updatedAt: Date.now() }, reason || '批量更新任务');
  }

  // Sync all affected parents
  for (const pid of parentIdsToSync) {
    await syncParentDateRange(pid);
  }
}

/**
 * Delete a task and optionally its children, with history tracking
 */
export async function deleteTask(id: number, includeChildren = true): Promise<TaskDeleteResult> {
  const deletedIds: number[] = [];
  const parentIdsToSync = new Set<number>();

  const task = await db.tasks.get(id);
  if (!task) return { deletedIds: [], parentIdsToSync: [] };

  if (task.parentId) parentIdsToSync.add(task.parentId);

  if (includeChildren) {
    // Recursively collect all descendant IDs
    const collectDescendants = async (parentId: number): Promise<number[]> => {
      const children = await db.tasks.where('parentId').equals(parentId).toArray();
      let ids = children.map(c => c.id!);
      for (const childId of ids) {
        const subIds = await collectDescendants(childId);
        ids = [...ids, ...subIds];
      }
      return ids;
    };

    const childIds = await collectDescendants(id);
    const allIds = [id, ...childIds];
    await trackedDb.tasks.bulkDelete(allIds, '删除任务及子任务');
    deletedIds.push(...allIds);
  } else {
    await trackedDb.tasks.delete(id, '删除任务');
    deletedIds.push(id);
  }

  // Sync parent date ranges
  for (const pid of parentIdsToSync) {
    await syncParentDateRange(pid);
  }

  return { deletedIds, parentIdsToSync: Array.from(parentIdsToSync) };
}

/**
 * Batch delete multiple tasks
 */
export async function batchDeleteTasks(ids: number[]): Promise<TaskDeleteResult> {
  const deletedIds: number[] = [];
  const parentIdsToSync = new Set<number>();

  for (const id of ids) {
    const task = await db.tasks.get(id);
    if (task?.parentId) parentIdsToSync.add(task.parentId);
    await trackedDb.tasks.delete(id, '批量删除任务');
    deletedIds.push(id);
  }

  for (const pid of parentIdsToSync) {
    await syncParentDateRange(pid);
  }

  return { deletedIds, parentIdsToSync: Array.from(parentIdsToSync) };
}

// ─── Query Helpers ───

/**
 * Get all children of a task (direct children only)
 */
export async function getTaskChildren(parentId: number): Promise<Task[]> {
  return db.tasks.where('parentId').equals(parentId).toArray();
}

/**
 * Get all descendants of a task (recursive)
 */
export async function getTaskDescendants(parentId: number): Promise<Task[]> {
  const children = await db.tasks.where('parentId').equals(parentId).toArray();
  let all = [...children];
  for (const child of children) {
    const descendants = await getTaskDescendants(child.id!);
    all = [...all, ...descendants];
  }
  return all;
}

/**
 * Check if a task title already exists in the project
 */
export async function isDuplicateTitle(title: string, projectId: number, excludeId?: number): Promise<Task | null> {
  const tasks = await db.tasks.where('projectId').equals(projectId).toArray();
  const duplicate = tasks.find(t => {
    if (t.id === excludeId) return false;
    return t.title.trim().toLowerCase() === title.trim().toLowerCase();
  });
  return duplicate || null;
}

// ─── Export singleton-style API ───
export const taskService = {
  validate: validateTask,
  create: createTask,
  update: updateTask,
  batchUpdate: batchUpdateTasks,
  delete: deleteTask,
  batchDelete: batchDeleteTasks,
  getChildren: getTaskChildren,
  getDescendants: getTaskDescendants,
  isDuplicateTitle,
};
