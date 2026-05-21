import { db } from '../db/db';
import type { Task, Resource } from '../types';
import { differenceInDays, addDays } from 'date-fns';
import { isWorkingDay } from '../utils/dateUtils';

// ─── Types ───────────────────────────────────────────────────────

/** Breakdown of workload by work category */
export interface WorkloadCategoryBreakdown {
  /** Number of self-made tasks */
  selfMadeCount: number;
  /** Titles of self-made tasks */
  selfMadeTitles: string[];
  /** Load percent from self-made tasks */
  selfMadeLoadPercent: number;
  /** Number of CP follow-up tasks */
  cpFollowCount: number;
  /** Titles of CP follow-up tasks */
  cpFollowTitles: string[];
  /** Load percent from CP follow-up tasks */
  cpFollowLoadPercent: number;
}

export interface WorkloadInfo {
  resourceId: number;
  resourceName: string;
  /** Number of overlapping tasks in the given period */
  overlappingTaskCount: number;
  /** Task titles that overlap */
  overlappingTaskTitles: string[];
  /** Load ratio: overlapping tasks / capacity (1 task = 100%) */
  loadPercent: number;
  /** Whether this member is overloaded (>100%) */
  isOverloaded: boolean;
  /** Human-readable summary */
  summary: string;
  /** Severity level for UI coloring */
  severity: 'ok' | 'warning' | 'danger';
  /** Breakdown by work category (self-made vs CP follow-up) */
  categoryBreakdown: WorkloadCategoryBreakdown;
}

export interface ParentDateRange {
  startDate: Date | undefined;
  endDate: Date | undefined;
}

// ─── Workload Calculation ────────────────────────────────────────

/**
 * Calculate workload info for a specific resource during a date range.
 * Excludes the task being edited (if provided) to avoid self-conflict.
 */
export function calcMemberWorkload(
  resourceId: number,
  startDate: Date | undefined,
  endDate: Date | undefined,
  allTasks: Task[],
  allResources: Resource[],
  excludeTaskId?: number
): WorkloadInfo {
  const resource = allResources.find(r => r.id === resourceId);
  const resourceName = resource?.name || 'Unknown';

  if (!startDate || !endDate) {
    return {
      resourceId,
      resourceName,
      overlappingTaskCount: 0,
      overlappingTaskTitles: [],
      loadPercent: 0,
      isOverloaded: false,
      summary: '',
      severity: 'ok',
      categoryBreakdown: {
        selfMadeCount: 0, selfMadeTitles: [], selfMadeLoadPercent: 0,
        cpFollowCount: 0, cpFollowTitles: [], cpFollowLoadPercent: 0,
      },
    };
  }

  // Find all tasks assigned to this resource that overlap with the given period
  const overlapping = allTasks.filter(t => {
    if (!t.startDate || !t.endDate) return false;
    if (t.id === excludeTaskId) return false;
    if (!t.assigneeIds?.includes(resourceId)) return false;
    if (t.status === 'done') return false;
    // Only count leaf tasks (with parentId) to avoid double-counting parent tasks
    const hasChildren = allTasks.some(child => child.parentId === t.id);
    if (hasChildren) return false;

    const tStart = new Date(t.startDate);
    const tEnd = new Date(t.endDate);
    return tStart <= endDate && tEnd >= startDate;
  });

  const overlappingTaskCount = overlapping.length;
  const overlappingTaskTitles = overlapping.map(t => {
    const dashIdx = t.title.lastIndexOf('-');
    return dashIdx !== -1 ? t.title.substring(dashIdx + 1).trim() : t.title;
  });

  // Category breakdown: self-made vs CP follow-up
  const selfMadeTasks = overlapping.filter(t => t.workCategory !== 'cp_follow');
  const cpFollowTasks = overlapping.filter(t => t.workCategory === 'cp_follow');
  const selfMadeCount = selfMadeTasks.length;
  const cpFollowCount = cpFollowTasks.length;
  const selfMadeTitles = selfMadeTasks.map(t => {
    const dashIdx = t.title.lastIndexOf('-');
    return dashIdx !== -1 ? t.title.substring(dashIdx + 1).trim() : t.title;
  });
  const cpFollowTitles = cpFollowTasks.map(t => {
    const dashIdx = t.title.lastIndexOf('-');
    return dashIdx !== -1 ? t.title.substring(dashIdx + 1).trim() : t.title;
  });

  // Load calculation with diminishing returns:
  // Self-made: first task = 60%, subsequent tasks = 45% each (can handle simple tasks in parallel)
  // CP follow-up: first = 30%, second = 20%, third+ = 15% each, capped at 80% total
  const selfMadeLoadPercent = selfMadeCount === 0 ? 0
    : 60 + Math.max(0, selfMadeCount - 1) * 45;
  const cpFollowLoadPercent = Math.min(
    80, // CP follow-up total cap: internal contact person's CP workload should never exceed 80%
    cpFollowCount === 0 ? 0
      : cpFollowCount === 1 ? 30
        : cpFollowCount === 2 ? 50  // 30 + 20
          : 50 + (cpFollowCount - 2) * 15  // 30 + 20 + 15*(n-2)
  );
  const loadPercent = selfMadeLoadPercent + cpFollowLoadPercent;
  const isOverloaded = loadPercent > 100;

  let severity: 'ok' | 'warning' | 'danger' = 'ok';
  if (loadPercent > 150) severity = 'danger';
  else if (loadPercent > 80) severity = 'warning';

  let summary = '';
  if (overlappingTaskCount > 0) {
    const parts: string[] = [];
    if (selfMadeCount > 0) parts.push(`${selfMadeCount}项自制`);
    if (cpFollowCount > 0) parts.push(`${cpFollowCount}项CP跟进`);
    summary = `该成员此期间已有${parts.join('+')}任务，负荷率${loadPercent}%`;
  }

  const categoryBreakdown: WorkloadCategoryBreakdown = {
    selfMadeCount,
    selfMadeTitles,
    selfMadeLoadPercent,
    cpFollowCount,
    cpFollowTitles,
    cpFollowLoadPercent,
  };

  return {
    resourceId,
    resourceName,
    overlappingTaskCount,
    overlappingTaskTitles,
    loadPercent,
    isOverloaded,
    summary,
    severity,
    categoryBreakdown,
  };
}

/**
 * Calculate workload for multiple resources at once.
 */
export function calcBatchWorkload(
  resourceIds: number[],
  startDate: Date | undefined,
  endDate: Date | undefined,
  allTasks: Task[],
  allResources: Resource[],
  excludeTaskId?: number
): Map<number, WorkloadInfo> {
  const result = new Map<number, WorkloadInfo>();
  for (const rid of resourceIds) {
    result.set(rid, calcMemberWorkload(rid, startDate, endDate, allTasks, allResources, excludeTaskId));
  }
  return result;
}

// ─── Parent Date Range Auto-Calculation ──────────────────────────

/**
 * Given a list of child tasks, compute the parent task's date range
 * as the union of all children's date ranges.
 */
export function calcParentDateRange(childTasks: Array<{ startDate?: Date; endDate?: Date }>): ParentDateRange {
  let earliest: Date | undefined;
  let latest: Date | undefined;

  for (const child of childTasks) {
    if (child.startDate) {
      const s = new Date(child.startDate);
      if (!earliest || s < earliest) earliest = s;
    }
    if (child.endDate) {
      const e = new Date(child.endDate);
      if (!latest || e > latest) latest = e;
    }
  }

  return { startDate: earliest, endDate: latest };
}

/**
 * Recalculate and update a parent task's date range based on its children.
 * Returns true if the parent was updated.
 */
export async function syncParentDateRange(parentId: number): Promise<boolean> {
  const children = await db.tasks.where('parentId').equals(parentId).toArray();
  if (children.length === 0) return false;

  const { startDate, endDate } = calcParentDateRange(children);
  const parent = await db.tasks.get(parentId);
  if (!parent) return false;

  const needsUpdate =
    (startDate && (!parent.startDate || new Date(parent.startDate).getTime() !== startDate.getTime())) ||
    (endDate && (!parent.endDate || new Date(parent.endDate).getTime() !== endDate.getTime()));

  if (needsUpdate) {
    const updates: Partial<Task> = {};
    if (startDate) updates.startDate = startDate;
    if (endDate) updates.endDate = endDate;
    await db.tasks.update(parentId, updates);
    return true;
  }

  return false;
}

/**
 * Sync all parent tasks' date ranges based on their children.
 * Useful for fixing data inconsistencies after bulk imports or manual DB edits.
 */
export async function syncAllParentDateRanges(): Promise<number> {
  const allTasks = await db.tasks.toArray();
  const parentIds = new Set<number>();
  
  // Find all unique parent IDs
  allTasks.forEach(t => {
    if (t.parentId) parentIds.add(t.parentId);
  });

  let updatedCount = 0;
  for (const pid of parentIds) {
    const updated = await syncParentDateRange(pid);
    if (updated) updatedCount++;
  }
  
  return updatedCount;
}

// ─── Dependency Conflict Detection ───────────────────────────────

export interface DependencyConflict {
  taskId: number;
  taskTitle: string;
  upstreamTaskId: number;
  upstreamTitle: string;
  /** How many days the downstream starts before upstream ends */
  overlapDays: number;
  message: string;
}

/**
 * Check if a task's dates conflict with its upstream dependencies.
 * Returns conflicts found.
 */
export function checkDependencyConflicts(
  taskId: number,
  startDate: Date | undefined,
  dependencies: number[],
  allTasks: Task[]
): DependencyConflict[] {
  if (!startDate || !dependencies || dependencies.length === 0) return [];

  const conflicts: DependencyConflict[] = [];
  const taskMap = new Map<number, Task>();
  allTasks.forEach(t => { if (t.id) taskMap.set(t.id, t); });

  const currentTask = taskMap.get(taskId);
  const taskTitle = currentTask?.title || '';

  for (const depId of dependencies) {
    const upstream = taskMap.get(depId);
    if (!upstream || !upstream.endDate) continue;

    // Skip conflict check if upstream is already done (completed tasks don't block)
    if (upstream.status === 'done') continue;

    const upEnd = new Date(upstream.endDate);
    if (startDate < upEnd) {
      const overlapDays = Math.ceil((upEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const shortUpName = getShortName(upstream.title);
      const shortDownName = getShortName(taskTitle);
      
      // Skip if same type (parallel tasks)
      if (shortUpName === shortDownName) continue;

      conflicts.push({
        taskId,
        taskTitle,
        upstreamTaskId: depId,
        upstreamTitle: upstream.title,
        overlapDays,
        message: `排期冲突：开始时间早于上游「${shortUpName}」结束时间${overlapDays}天`,
      });
    }
  }

  return conflicts;
}

// ─── Risk Assessment ─────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Risk category tag for filtering and grouping */
export type RiskTag = 'overdue' | 'deadline' | 'dependency' | 'overload' | 'overlap' | 'blocked' | 'progress';

export interface RiskReason {
  tag: RiskTag;
  text: string;
  /** Severity contribution of this individual reason */
  severity: RiskLevel;
}

export interface TaskRisk {
  level: RiskLevel;
  reasons: string[];
  /** Structured risk reasons with tags */
  riskReasons: RiskReason[];
  /** Color class for UI rendering */
  colorClass: string;
  /** Border color class */
  borderClass: string;
  /** Glow/shadow class */
  glowClass: string;
  /** Whether this risk should auto-popup a warning badge on the gantt bar */
  shouldAutoAlert: boolean;
}

// ─── Risk Threshold Configuration ────────────────────────────────
// Centralized thresholds for all risk detection rules.
// Adjust these values to tune sensitivity.

export const RISK_THRESHOLDS = {
  /** Task is overdue: endDate < today */
  OVERDUE: { enabled: true },
  /** Approaching deadline: within N days */
  DEADLINE_URGENT_DAYS: 1,   // ≤1 day → high
  DEADLINE_WARN_DAYS: 3,     // ≤3 days → medium
  /** Dependency conflict: downstream starts before upstream ends */
  DEPENDENCY_CONFLICT: { enabled: true },
  /** Assignee overload: concurrent tasks exceed capacity */
  ASSIGNEE_OVERLOAD: { enabled: true },
  /** Task overlap: weighted concurrent score (self-made×1 + CP×0.5) */
  OVERLAP_THRESHOLD: 4,      // weighted score ≥4 → warning
  OVERLAP_CRITICAL: 6,       // weighted score ≥6 → high
  /** Blocked duration: task marked isBlocked for >N days */
  BLOCKED_WARN_DAYS: 2,      // >2 days blocked → high
  BLOCKED_CRITICAL_DAYS: 5,  // >5 days blocked → critical
  /** Progress deficit: within N hours of deadline and progress < M% */
  PROGRESS_DEADLINE_HOURS: 24,  // within 24h of deadline
  PROGRESS_MIN_PERCENT: 80,     // progress must be ≥80%
  PROGRESS_CRITICAL_HOURS: 8,   // within 8h → critical if <50%
  PROGRESS_CRITICAL_PERCENT: 50,
} as const;

/**
 * Assess risk level for a task based on multiple factors:
 * - Overdue (past end date, not done)
 * - Approaching deadline (within configurable days)
 * - Dependency conflicts
 * - Assignee overload
 * - Task overlap (same assignee, concurrent tasks)
 * - Blocked duration (isBlocked for >2 days)
 * - Progress deficit (near deadline, progress < 80%)
 */
export function assessTaskRisk(
  task: Task,
  allTasks: Task[],
  allResources: Resource[],
  today: Date = new Date()
): TaskRisk {
  // Paused tasks are excluded from risk assessment
  if (task.status === 'paused') {
    return { level: 'none', reasons: [], riskReasons: [], shouldAutoAlert: false, colorClass: '', borderClass: '', glowClass: '' };
  }

  const reasons: string[] = [];
  const riskReasons: RiskReason[] = [];
  let maxLevel: RiskLevel = 'none';
  let shouldAutoAlert = false;

  const addRisk = (tag: RiskTag, text: string, severity: RiskLevel) => {
    reasons.push(text);
    riskReasons.push({ tag, text, severity });
    maxLevel = upgradeRisk(maxLevel, severity);
  };

  // 1. Overdue check
  if (task.endDate && task.status !== 'done') {
    const endDate = new Date(task.endDate);
    const daysUntilDue = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      addRisk('overdue', `已逾期${Math.abs(daysUntilDue)}天`, 'critical');
      shouldAutoAlert = true;
    } else if (daysUntilDue <= RISK_THRESHOLDS.DEADLINE_URGENT_DAYS) {
      addRisk('deadline', `明天截止`, 'high');
      shouldAutoAlert = true;
    } else if (daysUntilDue <= RISK_THRESHOLDS.DEADLINE_WARN_DAYS) {
      addRisk('deadline', `${daysUntilDue}天后截止`, 'medium');
    }
  }

  // 2. Dependency conflict check
  if (task.id && task.dependencies && task.dependencies.length > 0) {
    const conflicts = checkDependencyConflicts(task.id, task.startDate, task.dependencies, allTasks);
    if (conflicts.length > 0) {
      conflicts.forEach(c => addRisk('dependency', c.message, 'high'));
      shouldAutoAlert = true;
    }
  }

  // 3. Assignee overload check
  if (task.assigneeIds && task.assigneeIds.length > 0 && task.startDate && task.endDate) {
    const hasChildren = allTasks.some(t => t.parentId === task.id);
    if (!hasChildren) {
      for (const rid of task.assigneeIds) {
        const wl = calcMemberWorkload(rid, task.startDate, task.endDate, allTasks, allResources, task.id);
        if (wl.severity === 'danger') {
          addRisk('overload', `${wl.resourceName}负荷率${wl.loadPercent}%`, 'high');
        } else if (wl.severity === 'warning') {
          addRisk('overload', `${wl.resourceName}负荷率${wl.loadPercent}%`, 'medium');
        }
      }
    }
  }

  // 4. ★ Task overlap check — weighted by category (self-made×1, CP×0.5)
  if (task.assigneeIds && task.assigneeIds.length > 0 && task.startDate && task.endDate && task.status !== 'done') {
    const hasChildren = allTasks.some(t => t.parentId === task.id);
    if (!hasChildren) {
      for (const rid of task.assigneeIds) {
        const resource = allResources.find(r => r.id === rid);
        const rName = resource?.name || '成员';
        // Count concurrent leaf tasks for this assignee during this task's period
        const concurrent = allTasks.filter(t => {
          if (!t.startDate || !t.endDate || t.id === task.id) return false;
          if (t.status === 'done') return false;
          if (!t.assigneeIds?.includes(rid)) return false;
          const hasKids = allTasks.some(child => child.parentId === t.id);
          if (hasKids) return false;
          const tStart = new Date(t.startDate);
          const tEnd = new Date(t.endDate);
          return tStart <= new Date(task.endDate!) && tEnd >= new Date(task.startDate!);
        });
        // Weighted overlap score: self-made tasks count as 1, CP follow-up tasks count as 0.5
        const currentTaskWeight = task.workCategory === 'cp_follow' ? 0.5 : 1;
        const concurrentWeightedScore = concurrent.reduce((sum, t) => {
          return sum + (t.workCategory === 'cp_follow' ? 0.5 : 1);
        }, currentTaskWeight);
        const totalConcurrent = concurrent.length + 1; // raw count for display
        if (concurrentWeightedScore >= RISK_THRESHOLDS.OVERLAP_CRITICAL) {
          addRisk('overlap', `${rName}同期${totalConcurrent}项任务重叠（加权${concurrentWeightedScore.toFixed(1)}）`, 'high');
          shouldAutoAlert = true;
        } else if (concurrentWeightedScore >= RISK_THRESHOLDS.OVERLAP_THRESHOLD) {
          addRisk('overlap', `${rName}同期${totalConcurrent}项任务重叠（加权${concurrentWeightedScore.toFixed(1)}）`, 'medium');
        }
      }
    }
  }

  // 5. ★ NEW: Blocked duration check — task blocked for >2 days
  if (task.isBlocked && task.status !== 'done') {
    // Estimate blocked duration: use updatedAt as proxy for when block was set
    // If no updatedAt, use startDate as fallback
    const blockSince = task.updatedAt ? new Date(task.updatedAt) : (task.startDate ? new Date(task.startDate) : today);
    const blockedDays = Math.max(0, Math.ceil((today.getTime() - blockSince.getTime()) / (1000 * 60 * 60 * 24)));
    
    if (blockedDays >= RISK_THRESHOLDS.BLOCKED_CRITICAL_DAYS) {
      addRisk('blocked', `已卡点${blockedDays}天（超${RISK_THRESHOLDS.BLOCKED_CRITICAL_DAYS}天）`, 'critical');
      shouldAutoAlert = true;
    } else if (blockedDays >= RISK_THRESHOLDS.BLOCKED_WARN_DAYS) {
      addRisk('blocked', `已卡点${blockedDays}天（超${RISK_THRESHOLDS.BLOCKED_WARN_DAYS}天）`, 'high');
      shouldAutoAlert = true;
    } else if (task.isBlocked) {
      addRisk('blocked', `任务被阻塞${task.blockReason ? '：' + task.blockReason : ''}`, 'medium');
    }
  }

  // 6. ★ NEW: Progress deficit near deadline — within 24h and progress < 80%
  if (task.endDate && task.status === 'in_progress') {
    const endDate = new Date(task.endDate);
    const hoursUntilDue = (endDate.getTime() - today.getTime()) / (1000 * 60 * 60);
    const progress = task.progress || 0;

    if (hoursUntilDue > 0 && hoursUntilDue <= RISK_THRESHOLDS.PROGRESS_CRITICAL_HOURS && progress < RISK_THRESHOLDS.PROGRESS_CRITICAL_PERCENT) {
      addRisk('progress', `距交付仅${Math.ceil(hoursUntilDue)}h，进度仅${progress}%（需≥${RISK_THRESHOLDS.PROGRESS_CRITICAL_PERCENT}%）`, 'critical');
      shouldAutoAlert = true;
    } else if (hoursUntilDue > 0 && hoursUntilDue <= RISK_THRESHOLDS.PROGRESS_DEADLINE_HOURS && progress < RISK_THRESHOLDS.PROGRESS_MIN_PERCENT) {
      addRisk('progress', `距交付${Math.ceil(hoursUntilDue)}h，进度仅${progress}%（需≥${RISK_THRESHOLDS.PROGRESS_MIN_PERCENT}%）`, 'high');
      shouldAutoAlert = true;
    }
  }

  return {
    level: maxLevel,
    reasons,
    riskReasons,
    shouldAutoAlert,
    ...getRiskColors(maxLevel),
  };
}

function upgradeRisk(current: RiskLevel, candidate: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(candidate) > order.indexOf(current) ? candidate : current;
}

function getRiskColors(level: RiskLevel): { colorClass: string; borderClass: string; glowClass: string } {
  switch (level) {
    case 'critical':
      return { colorClass: 'text-red-400', borderClass: 'border-red-500/60', glowClass: 'shadow-red-500/20' };
    case 'high':
      return { colorClass: 'text-orange-400', borderClass: 'border-orange-500/60', glowClass: 'shadow-orange-500/20' };
    case 'medium':
      return { colorClass: 'text-amber-400', borderClass: 'border-amber-500/50', glowClass: 'shadow-amber-500/15' };
    case 'low':
      return { colorClass: 'text-yellow-400', borderClass: 'border-yellow-500/40', glowClass: 'shadow-yellow-500/10' };
    default:
      return { colorClass: '', borderClass: '', glowClass: '' };
  }
}

function getShortName(title: string): string {
  const dashIdx = title.lastIndexOf('-');
  return dashIdx !== -1 ? title.substring(dashIdx + 1).trim() : title;
}
