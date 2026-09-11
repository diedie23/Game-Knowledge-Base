import { create } from 'zustand';
import { db } from '../db/db';
import { changeTracker } from '../services/syncEngine';
import { toast } from './useToastStore';
import type { Task, Resource, CommandType, CommandPayload } from '../types';

// Re-export for consumers
export type { CommandType, CommandPayload };

export interface HistoryCommand {
  id: string;
  type: CommandType;
  label: string; // Human-readable description
  timestamp: number;
  undo: CommandPayload;
  redo: CommandPayload;
}

const MAX_HISTORY = 50;

// ─── History Store ───────────────────────────────────────────────
interface HistoryState {
  undoStack: HistoryCommand[];
  redoStack: HistoryCommand[];
  isUndoing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  pushCommand: (cmd: HistoryCommand) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  isUndoing: false,
  canUndo: false,
  canRedo: false,

  pushCommand: (cmd) => {
    set((state) => {
      const newStack = [...state.undoStack, cmd].slice(-MAX_HISTORY);
      return {
        undoStack: newStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      };
    });
  },

  undo: async () => {
    const { undoStack, isUndoing } = get();
    if (undoStack.length === 0 || isUndoing) return;

    const cmd = undoStack[undoStack.length - 1];
    set({ isUndoing: true });

    try {
      await executePayload(cmd.undo);
      set((state) => {
        const newUndo = state.undoStack.slice(0, -1);
        const newRedo = [...state.redoStack, cmd];
        return {
          undoStack: newUndo,
          redoStack: newRedo,
          canUndo: newUndo.length > 0,
          canRedo: true,
          isUndoing: false,
        };
      });
    } catch (e) {
      console.error('[History] Undo failed:', e);
      toast.error('撤销失败');
      set({ isUndoing: false });
    }
  },

  redo: async () => {
    const { redoStack, isUndoing } = get();
    if (redoStack.length === 0 || isUndoing) return;

    const cmd = redoStack[redoStack.length - 1];
    set({ isUndoing: true });

    try {
      await executePayload(cmd.redo);
      set((state) => {
        const newRedo = state.redoStack.slice(0, -1);
        const newUndo = [...state.undoStack, cmd];
        return {
          undoStack: newUndo,
          redoStack: newRedo,
          canUndo: true,
          canRedo: newRedo.length > 0,
          isUndoing: false,
        };
      });
    } catch (e) {
      console.error('[History] Redo failed:', e);
      toast.error('重做失败');
      set({ isUndoing: false });
    }
  },

  clear: () => set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false }),
}));

// ─── Payload Executor ────────────────────────────────────────────
async function executePayload(payload: CommandPayload) {
  if (payload.table === 'tasks') {
    switch (payload.action) {
      case 'put':
        await db.tasks.put(payload.data);
        break;
      case 'add':
        await db.tasks.add(payload.data);
        break;
      case 'delete':
        if (payload.ids && payload.ids.length > 0) {
          await db.tasks.bulkDelete(payload.ids);
        }
        break;
      case 'bulkPut':
        await db.tasks.bulkPut(payload.data);
        break;
      case 'bulkDelete':
        if (payload.ids && payload.ids.length > 0) {
          await db.tasks.bulkDelete(payload.ids);
        }
        break;
    }
  } else {
    switch (payload.action) {
      case 'put':
        await db.resources.put(payload.data);
        break;
      case 'add':
        await db.resources.add(payload.data);
        break;
      case 'delete':
        if (payload.ids && payload.ids.length > 0) {
          await db.resources.bulkDelete(payload.ids);
        }
        break;
      case 'bulkPut':
        await db.resources.bulkPut(payload.data);
        break;
      case 'bulkDelete':
        if (payload.ids && payload.ids.length > 0) {
          await db.resources.bulkDelete(payload.ids);
        }
        break;
    }
  }
}

// ─── Tracked DB Actions (use these instead of raw db calls) ─────
let commandCounter = 0;
function genId(): string {
  return `cmd_${Date.now()}_${++commandCounter}`;
}

export const trackedDb = {
  tasks: {
    /** Update a task with history tracking */
    async update(taskId: number, changes: Partial<Task>, label?: string) {
      const old = await db.tasks.get(taskId);
      if (!old) return;

      const snapshot = { ...old };
      
      // Handle parent-child status synchronization
      const allTasks = await db.tasks.toArray();
      const updates: { id: number; changes: Partial<Task> }[] = [{ id: taskId, changes }];
      
      if (changes.status) {
        const newStatus = changes.status;
        
        // 1. If updating a child task
        if (old.parentId) {
          const parent = allTasks.find(t => t.id === old.parentId);
          if (parent) {
            const siblings = allTasks.filter(t => t.parentId === old.parentId && t.id !== taskId);
            
            if (newStatus === 'in_progress' && parent.status === 'todo') {
              // If child becomes in_progress, parent becomes in_progress
              updates.push({ id: parent.id!, changes: { status: 'in_progress' } });
            } else if (newStatus === 'done') {
              // If child becomes done, check if ALL children are done
              const allSiblingsDone = siblings.every(t => t.status === 'done' || t.status === 'cancelled');
              if (allSiblingsDone && parent.status !== 'done' && parent.status !== 'cancelled') {
                updates.push({ id: parent.id!, changes: { status: 'done' } });
              }
            } else if (newStatus === 'cancelled') {
              // If child becomes cancelled, check if ALL children are done/cancelled
              const allSiblingsDone = siblings.every(t => t.status === 'done' || t.status === 'cancelled');
              if (allSiblingsDone && parent.status !== 'done' && parent.status !== 'cancelled') {
                updates.push({ id: parent.id!, changes: { status: 'cancelled' } });
              }
            }
          }
        }
        
        // 2. If updating a parent task
        const children = allTasks.filter(t => t.parentId === taskId);
        if (children.length > 0) {
          if (newStatus === 'done') {
            // If parent becomes done, ALL children become done
            children.forEach(child => {
              if (child.status !== 'done') {
                updates.push({ id: child.id!, changes: { status: 'done' } });
              }
            });
          }
        }
      }

      // Apply all updates
      const oldRecords = await db.tasks.where('id').anyOf(updates.map(u => u.id)).toArray();
      await Promise.all(updates.map(u => db.tasks.update(u.id, u.changes)));
      const newRecords = await db.tasks.where('id').anyOf(updates.map(u => u.id)).toArray();

      // Track changes for TAPD sync
      for (let i = 0; i < updates.length; i++) {
        const oldRec = oldRecords.find(r => r.id === updates[i].id);
        const newRec = newRecords.find(r => r.id === updates[i].id);
        if (oldRec && newRec) {
          changeTracker.trackUpdate('tasks', updates[i].id, oldRec, newRec).catch(() => {});
        }
      }

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: updates.length > 1 ? 'task:bulkUpdate' : 'task:update',
        label: label || `修改任务「${old.title}」${updates.length > 1 ? '及相关联任务' : ''}`,
        timestamp: Date.now(),
        undo: { table: 'tasks', action: updates.length > 1 ? 'bulkPut' : 'put', data: updates.length > 1 ? oldRecords : snapshot },
        redo: { table: 'tasks', action: updates.length > 1 ? 'bulkPut' : 'put', data: updates.length > 1 ? newRecords : newRecords[0] },
      });
    },

    /** Add a task with history tracking, returns new id */
    async add(task: Task, label?: string): Promise<number> {
      const id = await db.tasks.add(task);
      const created = await db.tasks.get(id);

      // Track creation for TAPD sync
      if (created) {
        changeTracker.trackCreate('tasks', id, created).catch(() => {});
      }

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'task:add',
        label: label || `新建任务「${task.title}」`,
        timestamp: Date.now(),
        undo: { table: 'tasks', action: 'delete', ids: [id] },
        redo: { table: 'tasks', action: 'put', data: created },
      });

      toast.success(`已创建任务「${task.title}」`);
      return id;
    },

    /** Delete a task (and optionally children) with history tracking */
    async delete(taskId: number, label?: string) {
      const task = await db.tasks.get(taskId);
      if (!task) return;

      const children = await db.tasks.where('parentId').equals(taskId).toArray();
      const allTasks = [task, ...children];
      const allIds = allTasks.map((t) => t.id!);

      // Track deletions for TAPD sync
      for (const t of allTasks) {
        changeTracker.trackDelete('tasks', t.id!, t).catch(() => {});
      }

      await db.tasks.bulkDelete(allIds);

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'task:bulkDelete',
        label: label || `删除任务「${task.title}」${children.length > 0 ? ` 及 ${children.length} 个子任务` : ''}`,
        timestamp: Date.now(),
        undo: { table: 'tasks', action: 'bulkPut', data: allTasks },
        redo: { table: 'tasks', action: 'delete', ids: allIds },
      });

      toast.info(`已删除任务「${task.title}」${children.length > 0 ? ` 及 ${children.length} 个子任务` : ''}`);
    },

    /** Bulk delete tasks with history tracking */
    async bulkDelete(ids: number[], label?: string) {
      const tasks = await db.tasks.where('id').anyOf(ids).toArray();
      if (tasks.length === 0) return;

      // Track deletions for TAPD sync
      for (const t of tasks) {
        changeTracker.trackDelete('tasks', t.id!, t).catch(() => {});
      }

      await db.tasks.bulkDelete(ids);

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'task:bulkDelete',
        label: label || `批量删除 ${tasks.length} 个任务`,
        timestamp: Date.now(),
        undo: { table: 'tasks', action: 'bulkPut', data: tasks },
        redo: { table: 'tasks', action: 'delete', ids },
      });

      toast.info(`已批量删除 ${tasks.length} 个任务`);
    },

    /** Bulk update tasks (e.g., reorder) with history tracking */
    async bulkUpdate(updates: { id: number; changes: Partial<Task> }[], label?: string) {
      const ids = updates.map((u) => u.id);
      const oldRecords = await db.tasks.where('id').anyOf(ids).toArray();

      await Promise.all(updates.map((u) => db.tasks.update(u.id, u.changes)));

      const newRecords = await db.tasks.where('id').anyOf(ids).toArray();

      // Track changes for TAPD sync
      for (let i = 0; i < ids.length; i++) {
        const oldRec = oldRecords.find(r => r.id === ids[i]);
        const newRec = newRecords.find(r => r.id === ids[i]);
        if (oldRec && newRec) {
          changeTracker.trackUpdate('tasks', ids[i], oldRec, newRec).catch(() => {});
        }
      }

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'task:bulkUpdate',
        label: label || `批量更新 ${updates.length} 个任务`,
        timestamp: Date.now(),
        undo: { table: 'tasks', action: 'bulkPut', data: oldRecords },
        redo: { table: 'tasks', action: 'bulkPut', data: newRecords },
      });
    },
  },

  resources: {
    /** Update a resource with history tracking */
    async update(resourceId: number, changes: Partial<Resource>, label?: string) {
      const old = await db.resources.get(resourceId);
      if (!old) return;

      const snapshot = { ...old };
      await db.resources.update(resourceId, changes);
      const updated = await db.resources.get(resourceId);

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'resource:update',
        label: label || `修改成员「${old.name}」`,
        timestamp: Date.now(),
        undo: { table: 'resources', action: 'put', data: snapshot },
        redo: { table: 'resources', action: 'put', data: updated },
      });
    },

    /** Add a resource with history tracking */
    async add(resource: Resource, label?: string): Promise<number> {
      const id = await db.resources.add(resource);
      const created = await db.resources.get(id);

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'resource:add',
        label: label || `新建成员「${resource.name}」`,
        timestamp: Date.now(),
        undo: { table: 'resources', action: 'delete', ids: [id] },
        redo: { table: 'resources', action: 'put', data: created },
      });

      toast.success(`已添加成员「${resource.name}」`);
      return id;
    },

    /** Delete a resource with history tracking */
    async delete(resourceId: number, label?: string) {
      const resource = await db.resources.get(resourceId);
      if (!resource) return;

      await db.resources.delete(resourceId);

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'resource:delete',
        label: label || `删除成员「${resource.name}」`,
        timestamp: Date.now(),
        undo: { table: 'resources', action: 'put', data: resource },
        redo: { table: 'resources', action: 'delete', ids: [resourceId] },
      });

      toast.info(`已删除成员「${resource.name}」`);
    },

    /** Bulk update resources (e.g., reorder) with history tracking */
    async bulkUpdate(updates: { id: number; changes: Partial<Resource> }[], label?: string) {
      const ids = updates.map((u) => u.id);
      const oldRecords = await db.resources.where('id').anyOf(ids).toArray();

      await Promise.all(updates.map((u) => db.resources.update(u.id, u.changes)));

      const newRecords = await db.resources.where('id').anyOf(ids).toArray();

      useHistoryStore.getState().pushCommand({
        id: genId(),
        type: 'resource:bulkUpdate',
        label: label || `批量更新 ${updates.length} 个成员`,
        timestamp: Date.now(),
        undo: { table: 'resources', action: 'bulkPut', data: oldRecords },
        redo: { table: 'resources', action: 'bulkPut', data: newRecords },
      });
    },
  },
};