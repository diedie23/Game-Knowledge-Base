import Dexie, { Table } from 'dexie';
import type { Task, Resource, Project, TapdConfig, ChangeLog, SyncMeta, SyncConflict, ChangeSnapshot } from '../types';
import type { ProjectNote } from '../types/projectNote';

// Re-export all types so existing consumers can still import from db.ts
export type { Task, Resource, Project, TapdConfig, ChangeLog, SyncMeta, SyncConflict, ChangeSnapshot };
export type { ProjectNote };

export class LocalProjectManagerDB extends Dexie {
  tasks!: Table<Task, number>;
  resources!: Table<Resource, number>;
  projects!: Table<Project, number>;
  tapdConfigs!: Table<TapdConfig, number>;
  changeLogs!: Table<ChangeLog, number>;
  syncMeta!: Table<SyncMeta, number>;
  syncConflicts!: Table<SyncConflict, number>;
  changeSnapshots!: Table<ChangeSnapshot, string>;
  projectNotes!: Table<ProjectNote, number>;

  constructor() {
    super('LocalProjectManagerDB');
    this.version(1).stores({
      tasks: '++id, title, status, priority, assigneeId, startDate, endDate, projectId, parentId',
      resources: '++id, name, role',
      projects: '++id, name'
    });
    this.version(2).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId',
      resources: '++id, name, role',
      projects: '++id, name'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        if (task.assigneeId !== undefined) {
          task.assigneeIds = [task.assigneeId];
          delete task.assigneeId;
        } else {
          task.assigneeIds = [];
        }
      });
    });
    this.version(3).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId',
      resources: '++id, name, role',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId'
    });
    this.version(4).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId',
      resources: '++id, name, role, sortOrder',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId'
    }).upgrade(tx => {
      return tx.table('resources').toCollection().modify((resource, ref) => {
        if (resource.sortOrder === undefined) {
          resource.sortOrder = resource.id || 0;
        }
      });
    });
    // Version 5: Add sync infrastructure tables
    this.version(5).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt',
      resources: '++id, name, role, sortOrder',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution'
    }).upgrade(tx => {
      // Backfill updatedAt for existing tasks
      return tx.table('tasks').toCollection().modify(task => {
        if (!task.updatedAt) {
          task.updatedAt = Date.now();
        }
        if (!task.syncSource) {
          task.syncSource = 'local';
        }
      });
    });

    // Version 6: Remove apiUser/apiPassword from TapdConfig, add tapdId index to tasks
    this.version(6).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId',
      resources: '++id, name, role, sortOrder',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution'
    }).upgrade(tx => {
      // Migrate TapdConfig: remove deprecated apiUser/apiPassword fields
      return tx.table('tapdConfigs').toCollection().modify(config => {
        delete (config as any).apiUser;
        delete (config as any).apiPassword;
        if (!config.workspaceName) {
          config.workspaceName = '';
        }
      });
    });

    // Version 7: Add externalUrl field to tasks (for TAPD link association)
    this.version(7).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId',
      resources: '++id, name, role, sortOrder',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution'
    });

    // Version 8: Add type field to resources (internal / cp)
    this.version(8).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId',
      resources: '++id, name, role, sortOrder, type',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution'
    }).upgrade(tx => {
      return tx.table('resources').toCollection().modify(resource => {
        if (!resource.type) {
          resource.type = 'internal';
        }
      });
    });

    // Version 9: Add avatarStyle field to resources
    this.version(9).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId',
      resources: '++id, name, role, sortOrder, type, avatarStyle',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution'
    }).upgrade(tx => {
      return tx.table('resources').toCollection().modify(resource => {
        if (!resource.avatarStyle) {
          resource.avatarStyle = 'rounded';
        }
      });
    });
    // Version 10: Add sortOrder field to tasks for drag-and-drop reordering
    this.version(10).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify((task, ref) => {
        if (task.sortOrder === undefined) {
          task.sortOrder = task.id || 0;
        }
      });
    });

    // Version 11: Add changeSnapshots table
    this.version(11).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date'
    });

    // Version 12: Add status field to resources
    this.version(12).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date'
    }).upgrade(tx => {
      return tx.table('resources').toCollection().modify(resource => {
        if (!resource.status) {
          resource.status = 'active';
        }
      });
    });

    // Version 13: Restore apiUser/apiToken fields on tapdConfigs (fix v6 migration that deleted them)
    this.version(13).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date'
    });

    // Version 14: Add projectNotes table for notebook feature; add notes field to tasks
    this.version(14).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId'
    });

    // Version 15: Add structured blueprint fields to projectNotes (blueprintName, systemModule, owner)
    this.version(15).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, systemModule'
    });

    // Version 16: Migrate blueprintName -> blueprintNames[], owner -> ownerIds[]
    this.version(16).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, systemModule, *ownerIds'
    }).upgrade(tx => {
      return tx.table('projectNotes').toCollection().modify(note => {
        // Migrate single blueprintName to blueprintNames array
        if (note.blueprintName && !note.blueprintNames) {
          note.blueprintNames = [note.blueprintName];
        }
        if (!note.blueprintNames) {
          note.blueprintNames = [];
        }
        if (!note.ownerIds) {
          note.ownerIds = [];
        }
      });
    });

    // Version 17: Migrate single-module fields to blueprintEntries[] (multi-module per note)
    this.version(17).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId'
    }).upgrade(tx => {
      return tx.table('projectNotes').toCollection().modify(note => {
        // Consolidate legacy fields into blueprintEntries array
        if (!note.blueprintEntries) {
          const bpNames: string[] = note.blueprintNames || (note.blueprintName ? [note.blueprintName] : []);
          const owners: number[] = note.ownerIds || [];
          const mod: string = note.systemModule || '';
          if (mod || bpNames.length > 0 || owners.length > 0) {
            note.blueprintEntries = [{
              systemModule: mod,
              blueprintNames: bpNames,
              ownerIds: owners,
            }];
          } else {
            note.blueprintEntries = [];
          }
        }
        // Clean up legacy fields
        delete note.blueprintName;
        delete note.blueprintNames;
        delete note.systemModule;
        delete note.owner;
        delete note.ownerIds;
      });
    });

    // Version 18: Add workCategory field to tasks (self_made / cp_follow)
    this.version(18).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId'
    }).upgrade(tx => {
      return tx.table('tasks').toCollection().modify(task => {
        if (!task.workCategory) {
          task.workCategory = 'self_made';
        }
      });
    });

    // Version 19: Auto-set workCategory='cp_follow' for tasks assigned to CP resources
    this.version(19).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId'
    }).upgrade(async tx => {
      // Collect all CP resource IDs
      const cpResources = await tx.table('resources').filter(r => r.type === 'cp').toArray();
      const cpIds = new Set(cpResources.map(r => r.id));
      if (cpIds.size === 0) return;

      // Update tasks: if ANY assignee is a CP member, mark as cp_follow
      // (Business rule: CP tasks always pair 1 internal + 1 CP in "1+1" mode)
      await tx.table('tasks').toCollection().modify(task => {
        if (!task.assigneeIds || task.assigneeIds.length === 0) return;
        const hasCp = task.assigneeIds.some((id: number) => cpIds.has(id));
        if (hasCp) {
          task.workCategory = 'cp_follow';
        }
      });
    });

    // Version 20: Add todos (checklist) and tags fields to projectNotes
    this.version(20).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    }).upgrade(tx => {
      return tx.table('projectNotes').toCollection().modify(note => {
        if (!note.todos) {
          note.todos = [];
        }
        if (!note.tags) {
          note.tags = [];
        }
      });
    });

    // Version 21: Add completedAt field to tasks (actual completion date for early-finish cascade)
    this.version(21).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });

    // Version 22: Add joinDate/departDate fields to resources, add 'departed' status support
    this.version(22).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });

    // Version 23: Add MCP Gateway fields to tapdConfigs (authMode, mcpGatewayUrl, mcpAccessToken)
    this.version(23).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    }).upgrade(tx => {
      return tx.table('tapdConfigs').toCollection().modify(config => {
        // Default existing configs to 'rest' auth mode
        if (!config.authMode) {
          config.authMode = 'rest';
        }
      });
    });

    // Version 24: Add tapdAccount field to resources (for TAPD owner matching)
    this.version(24).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });

    // Version 25: Add module field to tasks (for TAPD module grouping)
    this.version(25).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt, module',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount',
      projects: '++id, name',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });

    // Version 26: Add project status field (active/paused/archived) and task pausedAt/previousStatus for project-level pause
    this.version(26).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt, module',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    }).upgrade(tx => {
      // Set default project status to 'active'
      return tx.table('projects').toCollection().modify(project => {
        if (!project.status) {
          project.status = 'active';
        }
      });
    });

    // Version 27: Add group field to resources (for project team / functional grouping)
    this.version(27).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt, module',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount, group',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });
  }
}

export const db = new LocalProjectManagerDB();