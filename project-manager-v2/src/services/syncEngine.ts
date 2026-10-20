import Dexie from 'dexie';
import { db } from '../db/db';
import type { Task, ChangeLog, SyncMeta, SyncConflict, SyncEvent } from '../types';
import type { SyncStatus, SyncEventType } from '../types';
import type { SyncAdapter } from './syncAdapter';
import { MockSyncAdapter } from './syncAdapter';
import { createTapdSyncId } from '../utils/tapdIdentity';

// Re-export for consumers
export type { SyncStatus, SyncEventType, SyncEvent };

// ─── Change Tracker ──────────────────────────────────────────// Intercepts local DB writes and records incremental change logs

export const changeTracker = {
  /** Record a task creation */
  async trackCreate(table: 'tasks' | 'resources', recordId: number, snapshot: any) {
    await db.changeLogs.add({
      table,
      recordId,
      projectId: typeof snapshot?.projectId === 'number' ? snapshot.projectId : snapshot?.projectIds?.[0],
      action: 'create',
      changes: {},
      snapshot,
      timestamp: Date.now(),
      synced: false,
      syncAttempts: 0,
    });
  },

  /** Record a task update with field-level diff */
  async trackUpdate(table: 'tasks' | 'resources', recordId: number, oldRecord: any, newRecord: any) {
    const changes: Record<string, { from: any; to: any }> = {};
    const skipFields = new Set(['id', 'syncId', 'updatedAt', 'syncedAt', 'syncSource']);

    for (const key of Object.keys(newRecord)) {
      if (skipFields.has(key)) continue;
      const oldVal = oldRecord[key];
      const newVal = newRecord[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { from: oldVal, to: newVal };
      }
    }

    if (Object.keys(changes).length === 0) return; // No real changes

    await db.changeLogs.add({
      table,
      recordId,
      projectId: typeof newRecord?.projectId === 'number'
        ? newRecord.projectId
        : typeof oldRecord?.projectId === 'number'
          ? oldRecord.projectId
          : newRecord?.projectIds?.[0] ?? oldRecord?.projectIds?.[0],
      action: 'update',
      changes,
      // Keep the pre-edit record as the base for a later three-way pull merge.
      snapshot: oldRecord,
      baseSnapshot: oldRecord,
      timestamp: Date.now(),
      synced: false,
      syncAttempts: 0,
    });
  },

  /** Record a task deletion */
  async trackDelete(table: 'tasks' | 'resources', recordId: number, snapshot: any) {
    await db.changeLogs.add({
      table,
      recordId,
      projectId: typeof snapshot?.projectId === 'number' ? snapshot.projectId : snapshot?.projectIds?.[0],
      action: 'delete',
      changes: {},
      snapshot,
      timestamp: Date.now(),
      synced: false,
      syncAttempts: 0,
    });
  },

  /** Get unsynced changes using the project/time compound indexes. */
  async getUnsyncedChanges(projectId?: number): Promise<ChangeLog[]> {
    try {
      const range = projectId == null
        ? db.changeLogs.where('[synced+timestamp]').between([false, Dexie.minKey], [false, Dexie.maxKey])
        : db.changeLogs.where('[projectId+synced+timestamp]').between(
          [projectId, false, Dexie.minKey],
          [projectId, false, Dexie.maxKey],
        );
      return await range.toArray();
    } catch {
      // Keep old databases usable while Dexie finishes opening/migrating.
      const logs = await db.changeLogs.where('synced').equals(false).toArray();
      return logs
        .filter(log => projectId == null || log.projectId === projectId)
        .sort((left, right) => left.timestamp - right.timestamp);
    }
  },

  /** Mark changes as synced */
  async markSynced(ids: number[]) {
    await db.changeLogs.where('id').anyOf(ids).modify({ synced: true });
  },

  /** Increment sync attempt count and record error */
  async recordSyncError(id: number, error: string) {
    const log = await db.changeLogs.get(id);
    if (log) {
      await db.changeLogs.update(id, {
        syncAttempts: (log.syncAttempts || 0) + 1,
        lastError: error,
      });
    }
  },

  /** Clean up old synced logs (keep last N days) */
  async cleanup(retainDays: number = 7) {
    const cutoff = Date.now() - retainDays * 86400000;
    await db.changeLogs
      .where('timestamp')
      .below(cutoff)
      .and(log => log.synced === true)
      .delete();
  },
};

// ─── Conflict Resolver ───────────────────────────────────────────
// Three-way merge with automatic + manual conflict resolution

export function buildConflictResolutionData(
  conflict: Pick<SyncConflict, 'recordId' | 'localVersion' | 'remoteVersion'>,
  resolution: 'local' | 'remote' | 'merged',
  mergedResult?: any
): any {
  const selected = resolution === 'local'
    ? conflict.localVersion
    : resolution === 'remote'
      ? conflict.remoteVersion
      : mergedResult;
  if (!selected) return selected;
  return {
    ...selected,
    id: conflict.recordId,
    projectId: conflict.localVersion?.projectId ?? selected.projectId,
  };
}

export const conflictResolver = {
  /** Detect conflicts between local and remote versions */
  detectConflicts(
    localRecord: any,
    remoteRecord: any,
    baseRecord?: any
  ): { hasConflict: boolean; conflictFields: string[]; autoMerged: Record<string, any> } {
    const conflictFields: string[] = [];
    const autoMerged: Record<string, any> = { ...localRecord };
    const compareFields = ['title', 'description', 'status', 'priority', 'startDate', 'endDate', 'progress', 'assigneeIds'];

    for (const field of compareFields) {
      const localVal = JSON.stringify(localRecord[field]);
      const remoteVal = JSON.stringify(remoteRecord[field]);
      const baseVal = baseRecord ? JSON.stringify(baseRecord[field]) : undefined;

      if (localVal === remoteVal) continue; // No conflict

      if (baseVal !== undefined) {
        // Three-way merge
        const localChanged = localVal !== baseVal;
        const remoteChanged = remoteVal !== baseVal;

        if (localChanged && !remoteChanged) {
          // Only local changed — keep local (auto-merge)
          autoMerged[field] = localRecord[field];
        } else if (!localChanged && remoteChanged) {
          // Only remote changed — accept remote (auto-merge)
          autoMerged[field] = remoteRecord[field];
        } else {
          // Both changed — real conflict
          conflictFields.push(field);
        }
      } else {
        // No base version — timestamp-based: newer wins for non-critical fields
        // Critical fields (status, dates) always flag as conflict
        const criticalFields = new Set(['status', 'startDate', 'endDate']);
        if (criticalFields.has(field)) {
          conflictFields.push(field);
        } else {
          // Non-critical: remote wins (server authority)
          autoMerged[field] = remoteRecord[field];
        }
      }
    }

    return {
      hasConflict: conflictFields.length > 0,
      conflictFields,
      autoMerged,
    };
  },

  /** Create a conflict record for manual resolution */
  async createConflict(
    table: 'tasks' | 'resources',
    recordId: number,
    localVersion: any,
    remoteVersion: any,
    conflictFields: string[],
    baseVersion?: any,
    projectId?: number,
  ): Promise<number> {
    const resolvedProjectId = projectId ?? localVersion?.projectId ?? localVersion?.projectIds?.[0];
    const conflictKey = [
      table,
      recordId,
      JSON.stringify([...conflictFields].sort()),
      JSON.stringify(localVersion || {}),
      JSON.stringify(remoteVersion || {}),
    ].join('|');
    const existing = await db.syncConflicts.where('conflictKey').equals(conflictKey).first().catch(() => undefined);
    if (existing?.id && !existing.resolvedAt) return existing.id;
    return db.syncConflicts.add({
      table,
      recordId,
      projectId: resolvedProjectId,
      conflictKey,
      localVersion,
      remoteVersion,
      baseVersion,
      conflictFields,
      detectedAt: Date.now(),
    });
  },

  /** Resolve a conflict */
  async resolveConflict(
    conflictId: number,
    resolution: 'local' | 'remote' | 'merged',
    mergedResult?: any
  ) {
    const conflict = await db.syncConflicts.get(conflictId);
    if (!conflict) return;

    const finalData = buildConflictResolutionData(conflict, resolution, mergedResult);

    // Apply resolution to database
    if (conflict.table === 'tasks' && finalData) {
      await db.tasks.put(finalData);
    } else if (conflict.table === 'resources' && finalData) {
      await db.resources.put(finalData);
    }

    // Mark conflict as resolved
    await db.syncConflicts.update(conflictId, {
      resolvedAt: Date.now(),
      resolution,
      mergedResult: finalData,
    });
  },

  /** Get all unresolved conflicts */
  async getUnresolvedConflicts(): Promise<SyncConflict[]> {
    return db.syncConflicts
      .filter(c => !c.resolvedAt)
      .toArray();
  },
};

// ─── Sync Engine ─────────────────────────────────────────────
// Orchestrates bidirectional incremental sync with offline queue

type SyncListener = (event: SyncEvent) => void;
class SyncEngine {
  private listeners: SyncListener[] = [];
  private status: SyncStatus = 'idle';
  private isOnline: boolean = navigator.onLine;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  private adapter: SyncAdapter;

  constructor(adapter?: SyncAdapter) {
    this.adapter = adapter || new MockSyncAdapter();
    // Monitor network status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.emit({ type: 'status', data: { online: true } });
      // Keep pending changes staged until the user reviews and confirms them in the sync center.
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.setStatus('offline');
      this.emit({ type: 'status', data: { online: false } });
    });
  }

  // ─── Event System ────────────────────────────────────────────
  on(listener: SyncListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: SyncEvent) {
    this.listeners.forEach(l => l(event));
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.emit({ type: 'status', data: { status } });
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /** Replace the current sync adapter at runtime */
  setAdapter(adapter: SyncAdapter) {
    this.adapter = adapter;
  }

  /** Get the current adapter name */
  getAdapterName(): string {
    return this.adapter.name;
  }

  // ─── Auto Sync ───────────────────────────────────────────────
  startAutoSync(intervalMs: number = 30000) {
    this.stopAutoSync();
    this.autoSyncInterval = setInterval(() => {
      if (this.isOnline && this.status === 'idle') {
        this.pushPendingChanges();
      }
    }, intervalMs);
  }

  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  // ─── Push: Local → Remote ────────────────────────────────────
  async pushPendingChanges(projectId?: number): Promise<{ pushed: number; failed: number }> {
    if (!this.isOnline) {
      this.setStatus('offline');
      return { pushed: 0, failed: 0 };
    }

    const unsyncedLogs = await changeTracker.getUnsyncedChanges(projectId);
    if (unsyncedLogs.length === 0) {
      return { pushed: 0, failed: 0 };
    }
    const affectedProjectIds = projectId == null
      ? [...new Set((await Promise.all(unsyncedLogs.map(log => this.getChangeProjectIds(log)))).flat())]
      : [projectId];

    this.setStatus('pushing');
    let pushed = 0;
    let failed = 0;

    // Group changes by record to deduplicate
    const grouped = this.groupChangesByRecord(unsyncedLogs);

    const processGroup = async ([key, logs]: [string, ChangeLog[]]) => {
      try {
        await this.adapter.pushChanges(logs);
        const ids = logs.map(l => l.id!).filter(Boolean);
        await changeTracker.markSynced(ids);
        const [table, recordIdStr] = key.split(':');
        const recordId = parseInt(recordIdStr, 10);
        if (table === 'tasks') await db.tasks.update(recordId, { syncedAt: Date.now() });
        pushed += logs.length;
        this.emit({ type: 'progress', data: { pushed, total: unsyncedLogs.length } });
      } catch (error: any) {
        failed += logs.length;
        await Promise.all(logs.filter(log => log.id).map(log =>
          changeTracker.recordSyncError(log.id!, error.message || 'Push failed')
        ));
      }
    };

    // Keep network pressure bounded while allowing independent tasks to push in parallel.
    const groups = [...grouped.entries()];
    for (let offset = 0; offset < groups.length; offset += 4) {
      await Promise.all(groups.slice(offset, offset + 4).map(processGroup));
    }

    this.setStatus(failed > 0 ? 'error' : 'idle');
    this.emit({ type: 'complete', data: { pushed, failed } });

    // Update sync meta for each affected project independently.
    await Promise.all(affectedProjectIds.map(id =>
      this.updateSyncMeta('tapd', id, { lastPushAt: Date.now() })
    ));

    return { pushed, failed };
  }

  // ─── Pull: Remote → Local ────────────────────────────────────
  async pullRemoteChanges(projectId: number): Promise<{ pulled: number; conflicts: number }> {
    if (!this.isOnline) {
      this.setStatus('offline');
      return { pulled: 0, conflicts: 0 };
    }

    this.setStatus('pulling');
    let pulled = 0;
    let conflicts = 0;

    try {
      const syncMeta = await this.getSyncMeta('tapd', projectId);
      const lastPullAt = syncMeta?.lastPullAt || 0;
      const pendingLogs = await changeTracker.getUnsyncedChanges(projectId);
      const baseSnapshotByTask = new Map<number, any>();
      pendingLogs
        .filter(log => log.table === 'tasks' && log.baseSnapshot)
        .sort((left, right) => left.timestamp - right.timestamp)
        .forEach(log => {
          if (!baseSnapshotByTask.has(log.recordId)) baseSnapshotByTask.set(log.recordId, log.baseSnapshot);
        });

      // Pull remote changes via adapter
      const remoteChanges = await this.adapter.pullChanges(lastPullAt);

      for (const remoteTask of remoteChanges) {
        const remoteSyncId = remoteTask.syncId || (
          remoteTask.tapdWorkspaceId && remoteTask.tapdId
            ? createTapdSyncId(remoteTask.tapdWorkspaceId, remoteTask.tapdId)
            : undefined
        );
        let localTask = remoteSyncId
          ? await db.tasks.where('[projectId+syncId]').equals([projectId, remoteSyncId]).first()
          : undefined;

        // Legacy fallback is intentionally restricted to the current project and
        // records with no workspace identity, so equal TAPD IDs in other workspaces cannot collide.
        if (!localTask && remoteTask.tapdId) {
          const workspacePath = remoteTask.tapdWorkspaceId ? `/${remoteTask.tapdWorkspaceId}/` : '';
          const legacyCandidates = (await db.tasks.where('[projectId+tapdId]').equals([projectId, remoteTask.tapdId])
            .filter(task => !task.tapdWorkspaceId && !task.syncId)
            .toArray())
            .sort((left, right) => {
              const leftMatchesWorkspace = workspacePath && left.externalUrl?.includes(workspacePath) ? 1 : 0;
              const rightMatchesWorkspace = workspacePath && right.externalUrl?.includes(workspacePath) ? 1 : 0;
              return rightMatchesWorkspace - leftMatchesWorkspace || left.id! - right.id!;
            });
          if (legacyCandidates.length > 0) {
            localTask = legacyCandidates[0];
            await db.tasks.update(localTask.id!, {
              tapdWorkspaceId: remoteTask.tapdWorkspaceId,
              syncId: remoteSyncId,
            });
            localTask = { ...localTask, tapdWorkspaceId: remoteTask.tapdWorkspaceId, syncId: remoteSyncId };
          }
        }

        if (!localTask) {
          // New remote task — create locally
          await db.tasks.add({
            ...remoteTask,
            syncId: remoteSyncId,
            projectId,
            syncSource: 'tapd',
            updatedAt: Date.now(),
            syncedAt: Date.now(),
          } as Task);
          pulled++;
        } else {
          // Existing task — use the oldest unsynced local base when available.
          const baseRecord = localTask.id != null ? baseSnapshotByTask.get(localTask.id) : undefined;
          const result = conflictResolver.detectConflicts(localTask, remoteTask, baseRecord);

          if (result.hasConflict) {
            const conflictId = await conflictResolver.createConflict(
              'tasks',
              localTask.id!,
              localTask,
              remoteTask,
              result.conflictFields,
              baseRecord,
              projectId,
            );
            conflicts++;
            this.emit({ type: 'conflict', data: { recordId: localTask.id, conflictId, fields: result.conflictFields } });
          } else {
            // Auto-merge successful — apply merged result
            await db.tasks.update(localTask.id!, {
              ...result.autoMerged,
              tapdWorkspaceId: remoteTask.tapdWorkspaceId || localTask.tapdWorkspaceId,
              syncId: remoteSyncId || localTask.syncId,
              updatedAt: Date.now(),
              syncedAt: Date.now(),
            });
            pulled++;
          }
        }
      }

      // Update sync meta
      await this.updateSyncMeta('tapd', projectId, {
        lastPullAt: Date.now(),
        status: conflicts > 0 ? 'conflict' : 'idle',
      });

      this.setStatus(conflicts > 0 ? 'resolving' : 'idle');
      this.emit({ type: 'complete', data: { pulled, conflicts } });
    } catch (error: any) {
      this.setStatus('error');
      this.emit({ type: 'error', data: { message: error.message } });
    }

    return { pulled, conflicts };
  }

  // ─── Full Bidirectional Sync ─────────────────────────────────
  async fullSync(projectId: number): Promise<{
    pushed: number;
    pulled: number;
    conflicts: number;
    errors: number;
  }> {
    // Step 1: Push local changes first
    const pushResult = await this.pushPendingChanges(projectId);

    // Step 2: Pull remote changes
    const pullResult = await this.pullRemoteChanges(projectId);

    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: pullResult.conflicts,
      errors: pushResult.failed,
    };
  }

  // ─── Sync Meta Management ───────────────────────────────────
  private async getSyncMeta(source: string, projectId: number): Promise<SyncMeta | undefined> {
    return db.syncMeta
      .where('[source+projectId]')
      .equals([source, projectId])
      .first()
      .catch(() => {
        // Fallback: filter manually if compound index not available
        return db.syncMeta
          .filter(m => m.source === source && m.projectId === projectId)
          .first();
      });
  }

  private async updateSyncMeta(source: string, projectId: number, updates: Partial<SyncMeta>) {
    const existing = await this.getSyncMeta(source, projectId);

    if (existing?.id) {
      await db.syncMeta.update(existing.id, updates);
    } else {
      await db.syncMeta.add({
        source,
        projectId,
        lastPullAt: 0,
        lastPushAt: 0,
        status: 'idle',
        ...updates,
      } as SyncMeta);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private async getChangeProjectIds(log: ChangeLog): Promise<number[]> {
    if (typeof log.projectId === 'number') return [log.projectId];
    if (log.table === 'tasks') {
      const task = await db.tasks.get(log.recordId);
      const projectId = task?.projectId ?? log.snapshot?.projectId;
      return typeof projectId === 'number' ? [projectId] : [];
    }
    const resource = await db.resources.get(log.recordId);
    const projectIds = resource?.projectIds ?? log.snapshot?.projectIds;
    return Array.isArray(projectIds) ? projectIds.filter((id): id is number => typeof id === 'number') : [];
  }

  private groupChangesByRecord(logs: ChangeLog[]): Map<string, ChangeLog[]> {
    const map = new Map<string, ChangeLog[]>();
    for (const log of logs) {
      const key = `${log.table}:${log.recordId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }

  // ─── Statistics ──────────────────────────────────────────────
  async getStats(projectId?: number): Promise<{
    pendingChanges: number;
    totalChanges: number;
    unresolvedConflicts: number;
    lastSyncAt: number | null;
  }> {
    const projectLogs = projectId == null
      ? await db.changeLogs.toArray()
      : await db.changeLogs.where('projectId').equals(projectId).toArray().catch(async () => db.changeLogs.toArray());
    const pendingLogs = projectLogs.filter(log => !log.synced && (projectId == null || log.projectId === projectId)).length;
    const unresolved = projectId == null
      ? await db.syncConflicts.filter(c => !c.resolvedAt).toArray()
      : await db.syncConflicts.where('projectId').equals(projectId).filter(c => !c.resolvedAt).toArray();
    const unresolvedConflicts = unresolved.length;
    const syncMeta = projectId == null
      ? await db.syncMeta.filter(m => m.source === 'tapd').first()
      : await this.getSyncMeta('tapd', projectId);

    return {
      pendingChanges: pendingLogs,
      totalChanges: projectLogs.length,
      unresolvedConflicts,
      lastSyncAt: syncMeta ? Math.max(syncMeta.lastPullAt, syncMeta.lastPushAt) : null,
    };
  }
}

// Singleton instance
export const syncEngine = new SyncEngine();
