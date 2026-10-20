import Dexie, { Table } from 'dexie';
import type { Task, Resource, Project, TapdConfig, ChangeLog, SyncMeta, SyncConflict, ChangeSnapshot } from '../types';
import type { ProjectNote } from '../types/projectNote';
import type { ResourceCapacity, RiskRecord } from '../types/scheduling';
import { configContainsTapdWorkspace, createTapdSyncId, parseTapdWorkspaceIds } from '../utils/tapdIdentity';

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
  resourceCapacities!: Table<ResourceCapacity, number>;
  riskRecords!: Table<RiskRecord, number>;

  constructor() {
    super('LocalProjectManagerV2DB');
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

    // Version 28: Add per-resource capacity configuration for scheduling
    this.version(28).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, sortOrder, workCategory, completedAt, module',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount, group',
      resourceCapacities: 'resourceId, updatedAt',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
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

    // Version 29: Isolate TAPD identities and sync metadata by workspace/project.
    this.version(29).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, tapdWorkspaceId, sortOrder, workCategory, completedAt, module',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount, group',
      resourceCapacities: 'resourceId, updatedAt',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId, [source+projectId]',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    }).upgrade(async tx => {
      const configs = await tx.table('tapdConfigs').toArray() as TapdConfig[];
      const workspaceIdsByProject = new Map<number, string[]>();
      configs.forEach(config => workspaceIdsByProject.set(config.projectId, parseTapdWorkspaceIds(config.workspaceId)));

      const taskTable = tx.table('tasks');
      await taskTable.toCollection().modify((task: Task) => {
        if (!task.tapdId) return;
        let workspaceId = task.tapdWorkspaceId?.trim();
        if (!workspaceId && task.externalUrl) {
          const matchedWorkspace = task.externalUrl.match(/tapd\.woa\.com\/([^/]+)\/prong\/stories\/view\//)?.[1];
          const configuredWorkspaceIds = workspaceIdsByProject.get(task.projectId) || [];
          if (matchedWorkspace && (configuredWorkspaceIds.length === 0 || configContainsTapdWorkspace(configuredWorkspaceIds.join(','), matchedWorkspace))) {
            workspaceId = matchedWorkspace;
          }
        }
        if (!workspaceId) {
          const configuredWorkspaceIds = workspaceIdsByProject.get(task.projectId) || [];
          if (configuredWorkspaceIds.length === 1) workspaceId = configuredWorkspaceIds[0];
        }
        if (!workspaceId) return;
        task.tapdWorkspaceId = workspaceId;
        task.syncId = createTapdSyncId(workspaceId, task.tapdId);
      });

      // Older pull flows could insert the same TAPD story repeatedly. Consolidate only
      // records with an unambiguous workspace-scoped identity and rewire task references.
      const migratedTasks = await taskTable.toArray() as Task[];
      const duplicateGroups = new Map<string, Task[]>();
      migratedTasks.forEach(task => {
        if (!task.syncId || !task.id) return;
        duplicateGroups.set(task.syncId, [...(duplicateGroups.get(task.syncId) || []), task]);
      });
      const canonicalIdByDuplicateId = new Map<number, number>();
      for (const group of duplicateGroups.values()) {
        if (group.length < 2) continue;
        const sorted = [...group].sort((left, right) => left.id! - right.id!);
        const canonical = sorted[0];
        const newest = [...sorted].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))[0];
        const assigneeIds = [...new Set(sorted.flatMap(task => task.assigneeIds || []))];
        await taskTable.put({
          ...newest,
          id: canonical.id,
          notes: sorted.find(task => task.notes?.trim())?.notes || newest.notes,
          sortOrder: sorted.find(task => task.sortOrder != null)?.sortOrder ?? newest.sortOrder,
          assigneeIds,
        });
        for (const duplicate of sorted.slice(1)) canonicalIdByDuplicateId.set(duplicate.id!, canonical.id!);
      }
      if (canonicalIdByDuplicateId.size > 0) {
        await taskTable.toCollection().modify((task: Task) => {
          if (task.parentId && canonicalIdByDuplicateId.has(task.parentId)) {
            task.parentId = canonicalIdByDuplicateId.get(task.parentId);
          }
          if (task.dependencies?.length) {
            task.dependencies = [...new Set(task.dependencies.map(id => canonicalIdByDuplicateId.get(id) || id))];
          }
        });
        await tx.table('changeLogs').toCollection().modify((log: ChangeLog) => {
          if (log.table === 'tasks' && canonicalIdByDuplicateId.has(log.recordId)) {
            log.recordId = canonicalIdByDuplicateId.get(log.recordId)!;
          }
        });
        await tx.table('syncConflicts').toCollection().modify((conflict: SyncConflict) => {
          if (conflict.table === 'tasks' && canonicalIdByDuplicateId.has(conflict.recordId)) {
            conflict.recordId = canonicalIdByDuplicateId.get(conflict.recordId)!;
          }
        });
        await taskTable.bulkDelete([...canonicalIdByDuplicateId.keys()]);
      }
    });

    // Version 30: Add local-only risk tracking for ownership and closure workflow.
    this.version(30).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, tapdWorkspaceId, sortOrder, workCategory, completedAt, module',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount, group',
      resourceCapacities: 'resourceId, updatedAt',
      riskRecords: '++id, &riskId, projectId, status, ownerId, updatedAt, [projectId+status]',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId, [source+projectId]',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });

    // Version 31: Add compound project-scoped indexes for large TAPD workspaces.
    // These avoid loading every task and then filtering in JavaScript during sync.
    this.version(31).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, tapdWorkspaceId, sortOrder, workCategory, completedAt, module, [projectId+syncId], [projectId+tapdId], [projectId+parentId], [projectId+updatedAt]',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount, group',
      resourceCapacities: 'resourceId, updatedAt',
      riskRecords: '++id, &riskId, projectId, status, ownerId, updatedAt, [projectId+status]',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, action, timestamp, synced',
      syncMeta: '++id, source, projectId, [source+projectId]',
      syncConflicts: '++id, table, recordId, detectedAt, resolution',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    });

    // Version 32: Make the sync queue and conflict list project-aware.
    // The compound indexes let large workspaces read only pending records instead of
    // filtering the complete change-log/conflict tables in JavaScript.
    this.version(32).stores({
      tasks: '++id, title, status, priority, *assigneeIds, startDate, endDate, projectId, parentId, syncId, updatedAt, tapdId, tapdWorkspaceId, sortOrder, workCategory, completedAt, module, [projectId+syncId], [projectId+tapdId], [projectId+parentId], [projectId+updatedAt]',
      resources: '++id, name, role, sortOrder, type, avatarStyle, status, joinDate, departDate, tapdAccount, group',
      resourceCapacities: 'resourceId, updatedAt',
      riskRecords: '++id, &riskId, projectId, status, ownerId, updatedAt, [projectId+status]',
      projects: '++id, name, status',
      tapdConfigs: '++id, workspaceId, projectId, authMode',
      changeLogs: '++id, table, recordId, projectId, action, timestamp, synced, [synced+timestamp], [projectId+synced+timestamp]',
      syncMeta: '++id, source, projectId, [source+projectId]',
      syncConflicts: '++id, table, recordId, projectId, detectedAt, resolvedAt, resolution, conflictKey, [table+recordId+resolution], [projectId+resolvedAt]',
      changeSnapshots: 'id, date',
      projectNotes: '++id, title, category, createdAt, updatedAt, pinned, projectId, *tags'
    }).upgrade(async tx => {
      const tasks = await tx.table('tasks').toArray() as Task[];
      const resources = await tx.table('resources').toArray() as Resource[];
      const taskProjectById = new Map(tasks.filter(task => task.id != null).map(task => [task.id!, task.projectId]));
      const resourceProjectsById = new Map(resources.filter(resource => resource.id != null).map(resource => [resource.id!, resource.projectIds || []]));

      await tx.table('changeLogs').toCollection().modify((log: ChangeLog) => {
        if (typeof log.projectId === 'number') return;
        const projectId = log.table === 'tasks'
          ? taskProjectById.get(log.recordId) ?? log.snapshot?.projectId
          : log.snapshot?.projectId ?? resourceProjectsById.get(log.recordId)?.[0];
        if (typeof projectId === 'number') log.projectId = projectId;
        if (!log.baseSnapshot && log.action === 'update' && log.snapshot) log.baseSnapshot = log.snapshot;
      });

      await tx.table('syncConflicts').toCollection().modify((conflict: SyncConflict) => {
        const projectId = conflict.projectId
          ?? conflict.localVersion?.projectId
          ?? conflict.localVersion?.projectIds?.[0];
        if (typeof projectId === 'number') conflict.projectId = projectId;
        if (!conflict.conflictKey) {
          conflict.conflictKey = [
            conflict.table,
            conflict.recordId,
            JSON.stringify(conflict.conflictFields || []),
            JSON.stringify(conflict.localVersion || {}),
            JSON.stringify(conflict.remoteVersion || {}),
          ].join('|');
        }
      });
    });
  }
}

export const db = new LocalProjectManagerDB();

// ============================================================================
// 自动级联关闭：包装 db.projects.update
// 当项目状态变为 'archived' 时，自动将所有非 done/cancelled 任务设为 'cancelled'
// ============================================================================
{
  const _origUpdate = db.projects.update.bind(db.projects);
  db.projects.update = async function (
    projectId: number,
    changes: { status?: string; [key: string]: any }
  ): Promise<number> {
    // 仅拦截状态改为 'archived' 的调用
    if (changes.status === 'archived') {
      const project = await db.projects.get(projectId);
      if (project && project.status !== 'archived') {
        // 先执行原版更新
        const result = await _origUpdate(projectId, changes);

        // 级联关闭所有非 done/cancelled 的任务
        const tasks = await db.tasks
          .where('projectId').equals(projectId)
          .filter((t: any) => t.status !== 'done' && t.status !== 'cancelled')
          .toArray();

        if (tasks.length > 0) {
          // Dexie 3.2.x 没有 bulkUpdate（4.x 才有），用 bulkPut 整条写回实现部分字段更新
          const updated = tasks.map((t: any) => ({
            ...t,
            status: 'cancelled' as const,
            previousStatus: t.status,
            pausedAt: new Date(),
          }));
          await db.tasks.bulkPut(updated);
        }

        return result;
      }
    }
    // 非归档更新，直接走原版
    return await _origUpdate(projectId, changes);
  } as typeof db.projects.update;
}
