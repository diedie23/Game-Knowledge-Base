import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, AlertCircle, Clock, ChevronDown, ChevronRight, X, ShieldAlert, Users } from 'lucide-react';
import type { Task } from '../../db/db';
import type { Resource } from '../../types';
import { assessTaskRisk, type TaskRisk, type RiskLevel, type RiskTag, RISK_THRESHOLDS } from '../../services/workloadService';

interface RiskEntry {
  task: Task;
  risk: TaskRisk;
  parentTitle?: string;
}

interface GanttRiskPanelProps {
  tasks: Task[] | undefined;
  resources: Resource[] | undefined;
  today: Date;
  onClose: () => void;
  onOpenTask: (taskId: number | undefined) => void;
}

const RISK_LEVEL_CONFIG: Record<Exclude<RiskLevel, 'none'>, {
  label: string;
  icon: React.ReactNode;
  bg: string;
  border: string;
  text: string;
  badge: string;
}> = {
  critical: {
    label: '严重风险',
    icon: <AlertCircle size={14} />,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
  },
  high: {
    label: '高风险',
    icon: <AlertTriangle size={14} />,
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  },
  medium: {
    label: '中风险',
    icon: <Clock size={14} />,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  },
  low: {
    label: '低风险',
    icon: <ShieldAlert size={14} />,
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  },
};

const RISK_ORDER: Exclude<RiskLevel, 'none'>[] = ['critical', 'high', 'medium', 'low'];

/** Risk tag display configuration */
const RISK_TAG_CONFIG: { tag: RiskTag; label: string; icon: string }[] = [
  { tag: 'overdue', label: '逾期', icon: '🔴' },
  { tag: 'deadline', label: '临近截止', icon: '⏰' },
  { tag: 'dependency', label: '依赖冲突', icon: '🔗' },
  { tag: 'overload', label: '负荷过载', icon: '📊' },
  { tag: 'overlap', label: '任务重叠', icon: '📋' },
  { tag: 'blocked', label: '卡点阻塞', icon: '🚫' },
  { tag: 'progress', label: '进度不足', icon: '📉' },
];

export const GanttRiskPanel = React.memo(function GanttRiskPanel({
  tasks,
  resources,
  today,
  onClose,
  onOpenTask,
}: GanttRiskPanelProps) {
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(['critical', 'high']));
  const [activeTagFilter, setActiveTagFilter] = useState<RiskTag | null>(null);

  /** Count entries that have at least one riskReason with the given tag */
  const countByTag = (tag: RiskTag): number => {
    let count = 0;
    riskGroups.forEach(entries => {
      entries.forEach(({ risk }) => {
        if (risk.riskReasons?.some(r => r.tag === tag)) count++;
      });
    });
    return count;
  };

  /** Filter entries by active tag */
  const filterByTag = (entries: RiskEntry[]): RiskEntry[] => {
    if (!activeTagFilter) return entries;
    return entries.filter(({ risk }) => risk.riskReasons?.some(r => r.tag === activeTagFilter));
  };

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  // Compute risk entries for all leaf tasks
  const riskGroups = useMemo(() => {
    if (!tasks || !resources) return new Map<string, RiskEntry[]>();

    const taskMap = new Map<number, Task>();
    tasks.forEach(t => { if (t.id) taskMap.set(t.id, t); });

    const groups = new Map<string, RiskEntry[]>();
    RISK_ORDER.forEach(l => groups.set(l, []));

    for (const task of tasks) {
      if (!task.id || task.status === 'done') continue;
      // Only assess leaf tasks
      const hasChildren = tasks.some(t => t.parentId === task.id);
      if (hasChildren) continue;

      const risk = assessTaskRisk(task, tasks, resources, today);
      if (risk.level === 'none') continue;

      const parentTitle = task.parentId ? taskMap.get(task.parentId)?.title : undefined;
      groups.get(risk.level)!.push({ task, risk, parentTitle });
    }

    // Sort each group by end date ascending (overdue first)
    groups.forEach(entries => {
      entries.sort((a, b) => {
        const aEnd = a.task.endDate ? new Date(a.task.endDate).getTime() : Infinity;
        const bEnd = b.task.endDate ? new Date(b.task.endDate).getTime() : Infinity;
        return aEnd - bEnd;
      });
    });

    return groups;
  }, [tasks, resources, today]);

  const totalRiskCount = useMemo(() => {
    let count = 0;
    riskGroups.forEach(entries => { count += entries.length; });
    return count;
  }, [riskGroups]);

  const getAssigneeName = (assigneeIds?: number[]) => {
    if (!assigneeIds || assigneeIds.length === 0) return null;
    return assigneeIds
      .map(id => resources?.find(r => r.id === id)?.name)
      .filter(Boolean)
      .join('、');
  };

  return (
    <div className="w-80 shrink-0 bg-[#0f1119] border-l border-gray-800/60 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-orange-400" />
          <span className="text-sm font-semibold text-gray-200">风险面板</span>
          {totalRiskCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
              {totalRiskCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Summary badges */}
      <div className="px-4 py-2.5 border-b border-gray-800/40 flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {RISK_ORDER.map(level => {
            const count = riskGroups.get(level)?.length || 0;
            if (count === 0) return null;
            const cfg = RISK_LEVEL_CONFIG[level];
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-opacity hover:opacity-80 ${cfg.badge}`}
              >
                {cfg.icon}
                <span>{cfg.label} {count}</span>
              </button>
            );
          })}
          {totalRiskCount === 0 && (
            <span className="text-xs text-gray-500">暂无风险任务 🎉</span>
          )}
        </div>
        {/* Tag filter chips */}
        {totalRiskCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-600 mr-0.5">筛选:</span>
            {RISK_TAG_CONFIG.map(({ tag, label, icon }) => {
              const tagCount = countByTag(tag);
              if (tagCount === 0) return null;
              const isActive = activeTagFilter === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTagFilter(isActive ? null : tag)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                      : 'bg-gray-800/60 text-gray-500 border border-gray-700/30 hover:text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                  <span className="ml-0.5 opacity-70">{tagCount}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Risk groups list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {totalRiskCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600 py-12">
            <ShieldAlert size={36} className="text-gray-700" />
            <p className="text-sm">所有任务运行正常</p>
            <p className="text-xs text-gray-700">没有检测到风险项</p>
          </div>
        ) : (
          <div className="py-2">
            {RISK_ORDER.map(level => {
              const entries = riskGroups.get(level) || [];
              if (entries.length === 0) return null;
              const cfg = RISK_LEVEL_CONFIG[level];
              const isExpanded = expandedLevels.has(level);

              return (
                <div key={level} className="mb-1">
                  {/* Group header */}
                  <button
                    onClick={() => toggleLevel(level)}
                    className={`w-full flex items-center justify-between px-4 py-2 hover:bg-gray-800/40 transition-colors ${cfg.text}`}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {cfg.icon}
                      <span className="text-xs font-semibold">{cfg.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                        {entries.length}
                      </span>
                    </div>
                  </button>

                  {/* Task entries */}
                  {isExpanded && (() => {
                    const filtered = filterByTag(entries);
                    if (filtered.length === 0) return (
                      <div className="px-3 pb-2 text-[10px] text-gray-600 italic">无匹配项</div>
                    );
                    return (
                    <div className="px-3 pb-2 space-y-1.5">
                      {filtered.map(({ task, risk, parentTitle }) => (
                        <div
                          key={task.id}
                          onClick={() => onOpenTask(task.id)}
                          className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-all hover:brightness-125 active:scale-[0.99] ${cfg.bg} ${cfg.border}`}
                        >
                          {/* Task title row */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              {parentTitle && (
                                <div className="text-[10px] text-gray-500 truncate mb-0.5">{parentTitle}</div>
                              )}
                              <div className="text-xs font-medium text-gray-200 truncate">{task.title}</div>
                            </div>
                            {task.endDate && (
                              <div className={`text-[10px] shrink-0 font-semibold ${cfg.text}`}>
                                {format(new Date(task.endDate), 'MM/dd')}
                              </div>
                            )}
                          </div>

                          {/* Risk reason tags */}
                          <div className="flex flex-wrap gap-1 mb-1">
                            {risk.riskReasons?.map((rr, i) => {
                              const tagCfg = RISK_TAG_CONFIG.find(t => t.tag === rr.tag);
                              return (
                                <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                  rr.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                                  rr.severity === 'high' ? 'bg-orange-500/20 text-orange-300' :
                                  rr.severity === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                                  'bg-yellow-500/20 text-yellow-300'
                                }`}>
                                  <span>{tagCfg?.icon || '⚠️'}</span>
                                  <span className="truncate max-w-[120px]">{rr.text}</span>
                                </span>
                              );
                            })}
                          </div>

                          {/* Assignees */}
                          {task.assigneeIds && task.assigneeIds.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                              <Users size={9} className="shrink-0" />
                              <span className="truncate">{getAssigneeName(task.assigneeIds)}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-gray-800/40 shrink-0">
        <p className="text-[10px] text-gray-600">点击任务卡片可打开详情编辑</p>
      </div>
    </div>
  );
});
