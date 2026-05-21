import React, { useMemo } from 'react';
import type { Task, Resource } from '../../types';
import { AlertTriangle, User, Building2 } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { compareResources } from './constants';

interface GanttResourceHeatRowProps {
  days: Date[];
  dayWidth: number;
  effectiveLpWidth: number;
  tasks: Task[] | undefined;
  resources: Resource[] | undefined;
}

// ─── Load Level Helpers ──────────────────────────────────────────

interface LoadLevel {
  bg: string;
  text: string;
  label: string;
  severity: 'idle' | 'normal' | 'busy' | 'overloaded' | 'critical';
}

function getLoadLevel(taskCount: number): LoadLevel {
  if (taskCount === 0) return { bg: '', text: 'text-gray-700', label: 'idle', severity: 'idle' };
  if (taskCount === 1) return { bg: 'bg-emerald-900/20', text: 'text-emerald-500/80', label: 'normal', severity: 'normal' };
  if (taskCount === 2) return { bg: 'bg-amber-900/20', text: 'text-amber-400', label: 'busy', severity: 'busy' };
  if (taskCount === 3) return { bg: 'bg-orange-900/25', text: 'text-orange-400 font-semibold', label: 'overloaded', severity: 'overloaded' };
  return { bg: 'bg-red-900/30', text: 'text-red-400 font-bold', label: 'critical', severity: 'critical' };
}

function getMemberLoadLevel(taskCount: number): LoadLevel {
  if (taskCount === 0) return { bg: 'bg-gray-800/30', text: 'text-gray-600', label: '空闲', severity: 'idle' };
  if (taskCount === 1) return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: '正常', severity: 'normal' };
  if (taskCount === 2) return { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '较忙', severity: 'busy' };
  if (taskCount === 3) return { bg: 'bg-orange-500/20', text: 'text-orange-400', label: '过载', severity: 'overloaded' };
  return { bg: 'bg-red-500/25', text: 'text-red-400', label: '严重过载', severity: 'critical' };
}

// ─── Pre-computed Heatmap Matrix ─────────────────────────────────
// Build a lookup table in a single pass over tasks: O(T × avg_duration)
// Then all per-day queries become O(1) lookups.

interface HeatmapMatrix {
  /** Map<resourceId, Map<dayKey, taskCount>> */
  matrix: Map<number, Map<string, number>>;
  /** Map<resourceId, Map<dayKey, {selfMade: number, cpFollow: number}>> — category breakdown */
  categoryMatrix: Map<number, Map<string, { selfMade: number; cpFollow: number }>>;
  /** Map<dayKey, totalTaskCount> — aggregate across all resources */
  dailyTotals: Map<string, number>;
  /** Map<dayKey, Array<{resourceId, count, selfMade, cpFollow}>> — per-day breakdown */
  dailyBreakdown: Map<string, Array<{ resourceId: number; count: number; selfMade: number; cpFollow: number }>>;
  /** Map<resourceId, peakCount> */
  memberPeaks: Map<number, number>;
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function buildHeatmapMatrix(
  tasks: Task[],
  resources: Resource[],
  days: Date[],
): HeatmapMatrix {
  const matrix = new Map<number, Map<string, number>>();
  const categoryMatrix = new Map<number, Map<string, { selfMade: number; cpFollow: number }>>();
  const dailyTotals = new Map<string, number>();
  const memberPeaks = new Map<number, number>();

  // Pre-compute leaf task set (parent IDs)
  const parentIds = new Set<number>();
  for (const t of tasks) {
    if (t.parentId) parentIds.add(t.parentId);
  }

  // Build day key set for quick range check
  const dayKeySet = new Set<string>();
  const dayKeys: string[] = [];
  for (const d of days) {
    const k = toDayKey(d);
    dayKeySet.add(k);
    dayKeys.push(k);
  }

  // Find the overall visible range for early rejection
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  // Single pass over all tasks: O(T × avg_task_duration_in_visible_range)
  for (const task of tasks) {
    if (!task.startDate || !task.endDate) continue;
    if (task.status === 'done') continue;
    if (task.id !== undefined && parentIds.has(task.id)) continue; // skip parent tasks
    if (!task.assigneeIds || task.assigneeIds.length === 0) continue;

    // Quick range rejection
    const tStart = task.startDate instanceof Date ? task.startDate : new Date(task.startDate);
    const tEnd = task.endDate instanceof Date ? task.endDate : new Date(task.endDate);
    if (tEnd < firstDay || tStart > lastDay) continue;

    // Walk only the visible days that overlap with this task
    const isCpFollow = task.workCategory === 'cp_follow';
    for (const d of days) {
      if (d < tStart || d > tEnd) continue;
      const dk = toDayKey(d);
      for (const rid of task.assigneeIds) {
        // Update per-resource matrix
        let resMap = matrix.get(rid);
        if (!resMap) { resMap = new Map(); matrix.set(rid, resMap); }
        const prev = resMap.get(dk) || 0;
        resMap.set(dk, prev + 1);

        // Update category matrix
        let catMap = categoryMatrix.get(rid);
        if (!catMap) { catMap = new Map(); categoryMatrix.set(rid, catMap); }
        let catEntry = catMap.get(dk);
        if (!catEntry) { catEntry = { selfMade: 0, cpFollow: 0 }; catMap.set(dk, catEntry); }
        if (isCpFollow) catEntry.cpFollow++;
        else catEntry.selfMade++;

        // Update daily totals
        dailyTotals.set(dk, (dailyTotals.get(dk) || 0) + 1);
      }
    }
  }

  // Compute member peaks from matrix
  for (const [rid, resMap] of matrix) {
    let peak = 0;
    for (const count of resMap.values()) {
      if (count > peak) peak = count;
    }
    memberPeaks.set(rid, peak);
  }

  // Ensure all resources have an entry in peaks (even if 0)
  for (const r of resources) {
    if (r.id !== undefined && !memberPeaks.has(r.id)) {
      memberPeaks.set(r.id, 0);
    }
  }

  // Build daily breakdown for tooltip
  const dailyBreakdown = new Map<string, Array<{ resourceId: number; count: number; selfMade: number; cpFollow: number }>>();
  for (const dk of dayKeys) {
    const breakdown: Array<{ resourceId: number; count: number; selfMade: number; cpFollow: number }> = [];
    for (const [rid, resMap] of matrix) {
      const c = resMap.get(dk);
      if (c && c > 0) {
        const cat = categoryMatrix.get(rid)?.get(dk);
        breakdown.push({ resourceId: rid, count: c, selfMade: cat?.selfMade || 0, cpFollow: cat?.cpFollow || 0 });
      }
    }
    if (breakdown.length > 0) dailyBreakdown.set(dk, breakdown);
  }

  return { matrix, categoryMatrix, dailyTotals, dailyBreakdown, memberPeaks };
}

// ─── Per-Member Load Bar ─────────────────────────────────────────

function MemberLoadBar({ resource, days, dayWidth, resMap, catMap }: {
  resource: Resource;
  days: Date[];
  dayWidth: number;
  resMap: Map<string, number> | undefined;
  catMap: Map<string, { selfMade: number; cpFollow: number }> | undefined;
}) {
  return (
    <div className="flex items-center group/member">
      {days.map((day, i) => {
        const dk = toDayKey(day);
        const count = resMap?.get(dk) || 0;
        const cat = catMap?.get(dk);
        const selfMade = cat?.selfMade || 0;
        const cpFollow = cat?.cpFollow || 0;
        const level = getMemberLoadLevel(count);
        const catDetail = count > 0 ? (selfMade > 0 && cpFollow > 0 ? `(自制${selfMade}+CP${cpFollow})` : cpFollow > 0 ? `(CP${cpFollow})` : `(自制${selfMade})`) : '';
        return (
          <div
            key={`${resource.id}-${i}`}
            className={`shrink-0 border-l border-gray-800/10 flex items-center justify-center transition-colors ${level.bg}`}
            style={{ width: `${dayWidth}px`, height: '20px' }}
            title={`${resource.name}: ${count}个任务 ${catDetail} (${level.label})`}
          >
            {count > 0 && dayWidth >= 18 && (
              <span className={`text-[8px] ${level.text} flex items-center gap-px`}>
                {selfMade > 0 && cpFollow > 0 && dayWidth >= 36 ? (
                  <>
                    <span className="text-indigo-400">{selfMade}</span>
                    <span className="text-gray-600">+</span>
                    <span className="text-cyan-400">{cpFollow}</span>
                  </>
                ) : (
                  <span className={cpFollow > 0 && selfMade === 0 ? 'text-cyan-400' : ''}>{count}</span>
                )}
              </span>
            )}
            {count === 0 && dayWidth >= 36 && (
              <span className="text-[7px] text-gray-800">·</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export const GanttResourceHeatRow = React.memo(function GanttResourceHeatRow({
  days,
  dayWidth,
  effectiveLpWidth,
  tasks,
  resources,
}: GanttResourceHeatRowProps) {
  const [expanded, setExpanded] = React.useState(false);

  // Pre-compute the entire heatmap matrix in a single pass — O(T × avg_duration + R × D)
  const heatmap = useMemo(() => {
    if (!tasks || !resources || days.length === 0) {
      return { matrix: new Map(), categoryMatrix: new Map(), dailyTotals: new Map(), dailyBreakdown: new Map(), memberPeaks: new Map() } as HeatmapMatrix;
    }
    return buildHeatmapMatrix(tasks, resources, days);
  }, [tasks, resources, days]);

  const overloadedMembers = useMemo(() => {
    return Array.from(heatmap.memberPeaks.entries())
      .filter(([_, count]) => count >= 3)
      .map(([id]) => resources?.find(r => r.id === id)?.name)
      .filter(Boolean);
  }, [heatmap.memberPeaks, resources]);

  return (
    <div className="border-t border-gray-800/50 bg-[#0e1018]">
      {/* Summary row */}
      <div className="flex">
        <div
          className="shrink-0 px-4 py-2 border-r-2 border-gray-700/80 flex items-center gap-2 sticky left-0 z-20 bg-[#0e1018] cursor-pointer hover:bg-gray-800/30 transition-colors"
          style={{ width: `${effectiveLpWidth}px`, boxShadow: '6px 0 16px rgba(0,0,0,0.5)' }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">资源负载</span>
          {overloadedMembers.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
              <AlertTriangle size={9} />
              {overloadedMembers.length}人过载
            </span>
          )}
          <span className="text-[9px] text-gray-600 ml-auto">{expanded ? '▼' : '▶'} 详情</span>
        </div>
        <div className="flex relative min-w-0">
          {days.map((day, i) => {
            const dk = toDayKey(day);
            const totalTasks = heatmap.dailyTotals.get(dk) || 0;
            const loadLevel = getLoadLevel(totalTasks);
            const breakdown = heatmap.dailyBreakdown.get(dk);
            const tooltipText = breakdown
              ? breakdown.map(b => {
                  const r = resources?.find(r => r.id === b.resourceId);
                  const catInfo = b.selfMade > 0 && b.cpFollow > 0 ? ` [自制${b.selfMade}+CP${b.cpFollow}]` : b.cpFollow > 0 ? ` [CP${b.cpFollow}]` : '';
                  return `${r?.name || '?'}: ${b.count}个任务${catInfo} (${getMemberLoadLevel(b.count).label})`;
                }).join('\n')
              : '';
            return (
              <div
                key={`workload-${i}`}
                className={`shrink-0 border-l border-gray-800/20 flex items-center justify-center min-h-[32px] transition-colors ${loadLevel.bg}`}
                style={{ width: `${dayWidth}px` }}
              >
                {totalTasks > 0 && (
                  <div
                    className={`text-[10px] cursor-help ${loadLevel.text}`}
                    title={tooltipText}
                  >
                    {totalTasks}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded per-member rows */}
      {expanded && resources && tasks && (
        <div className="border-t border-gray-800/30">
          {[...resources].filter(r => r.status !== 'departed').sort(compareResources).map(r => {
            const peakLoad = heatmap.memberPeaks.get(r.id!) || 0;
            const peakLevel = getMemberLoadLevel(peakLoad);
            return (
              <div key={r.id} className="flex border-b border-gray-800/20 last:border-b-0">
                <div
                  className="shrink-0 px-4 py-1 border-r-2 border-gray-700/80 flex items-center gap-2 sticky left-0 z-20 bg-[#0e1018]"
                  style={{ width: `${effectiveLpWidth}px`, boxShadow: '6px 0 16px rgba(0,0,0,0.5)' }}
                >
                  <Avatar
                    name={r.name}
                    size="xs"
                    type={((r as any).type as 'internal' | 'cp') || 'internal'}
                    avatar={r.avatar}
                    avatarStyle={(r as any)?.avatarStyle}
                    role={r.role}
                  />
                  <span className="text-[10px] text-gray-400 truncate flex-1">{r.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${peakLevel.bg} ${peakLevel.text}`}>
                    {peakLevel.label}
                  </span>
                </div>
                <MemberLoadBar
                  resource={r}
                  days={days}
                  dayWidth={dayWidth}
                  resMap={heatmap.matrix.get(r.id!)}
                  catMap={heatmap.categoryMatrix.get(r.id!)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
