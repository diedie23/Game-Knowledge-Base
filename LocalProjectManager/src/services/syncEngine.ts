import { db } from '../db/db';
import type { Task, ChangeLog, SyncMeta, SyncConflict, SyncEvent } from '../types';
import type { SyncStatus, SyncEventType } from '../types';
import type { SyncAdapter } from './syncAdapter';
import { MockSyncAdapter } from './syncAdapter';

// Re-export for consumers
export type { SyncStatus, SyncEventType, SyncEvent };

// ─── Change Tracker ──────────────────────────────────────────// Intercepts local DB writes and records incremental change logs

export const changeTracker = {
  /** Record a task creation */
  async trackCreate(table: 'tasks' | 'resources', recordId: number, snapshot: any) {
    await db.changeLogs.add({
      table,
      recordId,
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
      action: 'update',
      changes,
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
      action: 'delete',
      changes: {},
      snapshot,
      timestamp: Date.now(),
      synced: false,
      syncAttempts: 0,
    });
  },

  /** Get all unsynced changes */
  async getUnsyncedChanges(): Promise<ChangeLog[]> {
    return db.changeLogs
      .where('synced')
      .equals(0) // Dexie stores boolean as 0/1
      .sortBy('timestamp');
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
    baseVersion?: any
  ): Promise<number> {
    return db.syncConflicts.add({
      table,
      recordId,
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

    let finalData: any;
    switch (resolution) {
      case 'local':
        finalData = conflict.localVersion;
        break;
      case 'remote':
        finalData = conflict.remoteVersion;
        break;
      case 'merged':
        finalData = mergedResult;
        break;
    }

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
      // Auto-retry pending changes when back online
      this.pushPendingChanges();
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
  async pushPendingChanges(): Promise<{ pushed: number; failed: number }> {
    if (!this.isOnline) {
      this.setStatus('offline');
      return { pushed: 0, failed: 0 };
    }

    const unsyncedLogs = await changeTracker.getUnsyncedChanges();
    if (unsyncedLogs.length === 0) {
      return { pushed: 0, failed: 0 };
    }

    this.setStatus('pushing');
    let pushed = 0;
    let failed = 0;

    // Group changes by record to deduplicate
    const grouped = this.groupChangesByRecord(unsyncedLogs);

    for (const [key, logs] of grouped.entries()) {
      try {
        // Push via adapter
        await this.adapter.pushChanges(logs);

        // Mark all logs in this group as synced
        const ids = logs.map(l => l.id!).filter(Boolean);
        await changeTracker.markSynced(ids);

        // Update task syncedAt timestamp
        const [table, recordIdStr] = key.split(':');
        const recordId = parseInt(recordIdStr);
        if (table === 'tasks') {
          await db.tasks.update(recordId, { syncedAt: Date.now() });
        }

        pushed += logs.length;
        this.emit({ type: 'progress', data: { pushed, total: unsyncedLogs.length } });
      } catch (error: any) {
        failed += logs.length;
        for (const log of logs) {
          if (log.id) {
            await changeTracker.recordSyncError(log.id, error.message || 'Push failed');
          }
        }
      }
    }

    this.setStatus(failed > 0 ? 'error' : 'idle');
    this.emit({ type: 'complete', data: { pushed, failed } });

    // Update sync meta
    await this.updateSyncMeta('tapd', { lastPushAt: Date.now() });

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

      // Pull remote changes via adapter
      const remoteChanges = await this.adapter.pullChanges(lastPullAt);

      for (const remoteTask of remoteChanges) {
        // Find local version by syncId
        const localTask = remoteTask.syncId
          ? await db.tasks.where('syncId').equals(remoteTask.syncId).first()
          : undefined;

        if (!localTask) {
          // New remote task — create locally
          await db.tasks.add({
            ...remoteTask,
            projectId,
            syncSource: 'tapd',
            updatedAt: Date.now(),
            syncedAt: Date.now(),
          } as Task);
          pulled++;
        } else {
          // Existing task — check for conflicts
          const result = conflictResolver.detectConflicts(localTask, remoteTask);

          if (result.hasConflict) {
            // Create conflict record for manual resolution
            await conflictResolver.createConflict(
              'tasks',
              localTask.id!,
              localTask,
              remoteTask,
              result.conflictFields
            );
            conflicts++;
            this.emit({ type: 'conflict', data: { recordId: localTask.id, fields: result.conflictFields } });
          } else {
            // Auto-merge successful — apply merged result
            await db.tasks.update(localTask.id!, {
              ...result.autoMerged,
              updatedAt: Date.now(),
              syncedAt: Date.now(),
            });
            pulled++;
          }
        }
      }

      // Update sync meta
      await this.updateSyncMeta('tapd', {
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
    const pushResult = await this.pushPendingChanges();

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

  private async updateSyncMeta(source: string, updates: Partial<SyncMeta>) {
    const existing = await db.syncMeta
      .filter(m => m.source === source)
      .first();

    if (existing?.id) {
      await db.syncMeta.update(existing.id, updates);
    } else {
      await db.syncMeta.add({
        source,
        projectId: 1,
        lastPullAt: 0,
        lastPushAt: 0,
        status: 'idle',
        ...updates,
      } as SyncMeta);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
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
  async getStats(): Promise<{
    pendingChanges: number;
    totalChanges: number;
    unresolvedConflicts: number;
    lastSyncAt: number | null;
  }> {
    const pendingLogs = await db.changeLogs.where('synced').equals(0).count().catch(() => 0);
    const totalLogs = await db.changeLogs.count();
    const unresolvedConflicts = await db.syncConflicts.filter(c => !c.resolvedAt).count();
    const syncMeta = await db.syncMeta.filter(m => m.source === 'tapd').first();

    return {
      pendingChanges: pendingLogs,
      totalChanges: totalLogs,
      unresolvedConflicts,
      lastSyncAt: syncMeta ? Math.max(syncMeta.lastPullAt, syncMeta.lastPushAt) : null,
    };
  }
}

// Singleton instance
export const syncEngine = new SyncEngine();
