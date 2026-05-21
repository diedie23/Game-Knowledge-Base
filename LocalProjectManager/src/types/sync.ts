import type { SyncableTable, ChangeAction, SyncMetaStatus, ConflictResolution, PayloadAction } from './enums';
import type { Task } from './task';
import type { Resource } from './resource';

// --- Change Log ---

export interface ChangeLog {
  id?: number;
  table: SyncableTable;
  recordId: number;
  action: ChangeAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changes: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot?: any;
  timestamp: number;
  synced: boolean;
  syncAttempts: number;
  lastError?: string;
}

// --- Sync Meta ---

export interface SyncMeta {
  id?: number;
  source: string;
  projectId: number;
  lastPullAt: number;
  lastPushAt: number;
  lastCursor?: string;
  status: SyncMetaStatus;
  errorMessage?: string;
}

// --- Sync Conflict ---

export interface SyncConflict {
  id?: number;
  table: SyncableTable;
  recordId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  localVersion: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remoteVersion: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseVersion?: any;
  conflictFields: string[];
  detectedAt: number;
  resolvedAt?: number;
  resolution?: ConflictResolution;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mergedResult?: any;
}

// --- Command Payload (History) ---

export interface CommandPayload {
  table: SyncableTable;
  action: PayloadAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  ids?: number[];
}

// --- Sync Event ---

export interface SyncEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}
