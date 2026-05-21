import { create } from 'zustand';
import { syncEngine } from '../services/syncEngine';
import type { SyncStatus, SyncEvent, SyncConflict } from '../types';
import { db } from '../db/db';

interface SyncState {
  // Connection status
  isOnline: boolean;
  syncStatus: SyncStatus;

  // Sync progress
  pendingChanges: number;
  lastSyncAt: number | null;
  unresolvedConflicts: SyncConflict[];

  // Sync log (recent events)
  syncLog: Array<{ time: number; message: string; type: 'info' | 'success' | 'warning' | 'error' }>;

  // Actions
  refreshStats: () => Promise<void>;
  refreshConflicts: () => Promise<void>;
  addLogEntry: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  setOnline: (online: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
}

const MAX_LOG_ENTRIES = 50;

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: navigator.onLine,
  syncStatus: 'idle',
  pendingChanges: 0,
  lastSyncAt: null,
  unresolvedConflicts: [],
  syncLog: [],

  refreshStats: async () => {
    try {
      const stats = await syncEngine.getStats();
      set({
        pendingChanges: stats.pendingChanges,
        lastSyncAt: stats.lastSyncAt,
      });
    } catch (e) {
      console.warn('[SyncStore] Failed to refresh stats:', e);
    }
  },

  refreshConflicts: async () => {
    try {
      const conflicts = await db.syncConflicts
        .filter(c => !c.resolvedAt)
        .toArray();
      set({ unresolvedConflicts: conflicts });
    } catch (e) {
      console.warn('[SyncStore] Failed to refresh conflicts:', e);
    }
  },

  addLogEntry: (message, type = 'info') => {
    set(state => ({
      syncLog: [
        { time: Date.now(), message, type },
        ...state.syncLog,
      ].slice(0, MAX_LOG_ENTRIES),
    }));
  },

  setOnline: (online) => set({ isOnline: online }),
  setSyncStatus: (status) => set({ syncStatus: status }),
}));

// ─── Wire up SyncEngine events to the store ──────────────────────
syncEngine.on((event: SyncEvent) => {
  const store = useSyncStore.getState();

  switch (event.type) {
    case 'status':
      if (event.data.online !== undefined) {
        store.setOnline(event.data.online);
        store.addLogEntry(
          event.data.online ? 'Network restored — ready to sync' : 'Network offline — changes queued locally',
          event.data.online ? 'info' : 'warning'
        );
      }
      if (event.data.status) {
        store.setSyncStatus(event.data.status);
      }
      break;

    case 'progress':
      store.addLogEntry(
        `Syncing... ${event.data.pushed}/${event.data.total} changes pushed`,
        'info'
      );
      break;

    case 'conflict':
      store.addLogEntry(
        `Conflict detected on record #${event.data.recordId} (fields: ${event.data.fields.join(', ')})`,
        'warning'
      );
      store.refreshConflicts();
      break;

    case 'complete':
      if (event.data.pushed !== undefined) {
        store.addLogEntry(
          `Push complete: ${event.data.pushed} synced, ${event.data.failed} failed`,
          event.data.failed > 0 ? 'warning' : 'success'
        );
      }
      if (event.data.pulled !== undefined) {
        store.addLogEntry(
          `Pull complete: ${event.data.pulled} updated, ${event.data.conflicts} conflicts`,
          event.data.conflicts > 0 ? 'warning' : 'success'
        );
      }
      store.refreshStats();
      break;

    case 'error':
      store.addLogEntry(`Sync error: ${event.data.message}`, 'error');
      break;
  }
});

// Initialize stats on load
setTimeout(() => {
  useSyncStore.getState().refreshStats();
  useSyncStore.getState().refreshConflicts();
}, 1000);
