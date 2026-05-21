// ─── Task Enums ──────────────────────────────────────────────────

/** Task workflow status */
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'paused';

/** Project lifecycle status */
export type ProjectStatus = 'active' | 'paused' | 'archived';

/** Task priority level */
export type TaskPriority = 'low' | 'medium' | 'high';

/** Task functional type (matches template sub-task types) */
export type TaskType = 'Design' | 'Frontend' | 'Backend' | 'Testing' | 'task';

/** Work category: self-made content vs CP supplier follow-up */
export type WorkCategory = 'self_made' | 'cp_follow';

// ─── Resource Enums ──────────────────────────────────────────────

/** Common resource roles */
export type ResourceRole =
  | 'Designer'
  | 'UI设计'
  | 'UX设计'
  | 'Product'
  | 'Developer'
  | 'Layout'
  | 'UE设计'
  | 'QA'
  | (string & {}); // Allow arbitrary strings while providing autocomplete

/** Resource status */
export type ResourceStatus = 'active' | 'wfh' | 'sick' | 'leave' | 'focus' | 'departed';

// ─── Sync Enums ──────────────────────────────────────────────────

/** Sync engine operational status */
export type SyncStatus = 'idle' | 'pulling' | 'pushing' | 'resolving' | 'error' | 'offline';

/** Sync event types emitted by the engine */
export type SyncEventType = 'status' | 'progress' | 'conflict' | 'complete' | 'error';

/** Sync meta status */
export type SyncMetaStatus = 'idle' | 'syncing' | 'error' | 'conflict';

/** Conflict resolution strategy */
export type ConflictResolution = 'local' | 'remote' | 'merged';

/** Change log action type */
export type ChangeAction = 'create' | 'update' | 'delete';

/** Syncable table names */
export type SyncableTable = 'tasks' | 'resources' | 'projects';

/** Sync source origin */
export type SyncSource = 'local' | 'tapd' | 'tapd-import' | (string & {});

// ─── View Enums ──────────────────────────────────────────────────

/** Application view modes */
export type ViewMode = 'dashboard' | 'gantt' | 'board' | 'matrix' | 'table' | 'notes';

// ─── History Enums ───────────────────────────────────────────────

/** Command types for undo/redo history */
export type CommandType =
  | 'task:update'
  | 'task:add'
  | 'task:delete'
  | 'task:bulkDelete'
  | 'task:bulkUpdate'
  | 'resource:update'
  | 'resource:add'
  | 'resource:delete'
  | 'resource:bulkUpdate';

/** Payload action types for history commands */
export type PayloadAction = 'put' | 'add' | 'delete' | 'bulkPut' | 'bulkDelete';

/** Sync log entry severity */
export type SyncLogLevel = 'info' | 'success' | 'warning' | 'error';
