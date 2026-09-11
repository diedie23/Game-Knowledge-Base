import type { TaskStatus, TaskPriority, TaskType, SyncSource, WorkCategory } from './enums';

// ─── Task ────────────────────────────────────────────────────────

export interface Task {
  id?: number;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds?: number[];
  startDate?: Date;
  endDate?: Date;
  progress: number;
  dependencies: number[];
  type: string;
  projectId: number;
  parentId?: number;
  tapdId?: string;
  /** External URL (e.g. TAPD story/bug link). When set, clicking the task name opens this URL. */
  externalUrl?: string;

  /** Manual sort order for drag-and-drop reordering in Gantt/list views */
  sortOrder?: number;

  /** Whether the task is blocked by some external dependency or issue */
  isBlocked?: boolean;
  /** Reason why the task is blocked */
  blockReason?: string;

  /** General notes / remarks for the task */
  notes?: string;

  /** Work category: 'self_made' = self-produced content, 'cp_follow' = CP supplier follow-up */
  workCategory?: WorkCategory;

  /** TAPD module name (e.g. '2D Avatar', '轻舟编辑器', 'UGC小游戏', '元梦之星') for grouping */
  module?: string;

  /** Actual completion date (set when task is marked as done) */
  completedAt?: Date;

  /** Timestamp when the task was paused (project-level pause) */
  pausedAt?: Date;
  /** Status before being paused, used for restoring */
  previousStatus?: TaskStatus;

  // Sync metadata
  syncId?: string;
  updatedAt?: number;
  syncedAt?: number;
  syncSource?: SyncSource;
}

// ─── Task Template ───────────────────────────────────────────────

export interface TaskTemplateSubTask {
  title: string;
  durationDays: number;
  roleRequired: string;
  dependsOnIndex?: number;
  type: TaskType;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  subTasks: TaskTemplateSubTask[];
}

// ─── Change Snapshot ─────────────────────────────────────────────

export interface ChangeSnapshot {
  id: string;
  date: number; // timestamp
  reason: string;
  description?: string;
  // We could store the whole tasks state here if we wanted to actually revert,
  // but for now we just record the reason and date.
  // tasksSnapshot?: Task[]; 
}
