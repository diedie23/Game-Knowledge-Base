import type { ProjectStatus } from './enums';

// ─── Project ─────────────────────────────────────────────────────

export interface Project {
  id?: number;
  name: string;
  description?: string;
  /** Milestone name for the dashboard countdown */
  milestoneName?: string;
  /** Milestone date (ISO string, e.g. '2026-05-01') */
  milestoneDate?: string;
  /** Project lifecycle status: active (default), paused (project shelved), archived (project cancelled) */
  status?: ProjectStatus;
  /** Timestamp when the project was paused/archived */
  pausedAt?: Date;
  /** Reason for pausing/archiving (e.g. 'project cancelled', 'priority shift') */
  pauseReason?: string;
}
