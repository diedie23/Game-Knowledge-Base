import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { addDays, startOfToday, format, differenceInDays, isSameDay, isWeekend } from 'date-fns';
import { useStore } from '../store/useStore';
import { Avatar } from './common/Avatar';
import { Building2, User, X, Calendar, Eye, Plane, XCircle } from 'lucide-react';
import { compareResources, getRoleOrderIndex } from './gantt/constants';
import { CHINESE_HOLIDAYS, isHoliday, isNonWorkingDay } from '../utils/dateUtils';
import { getEffectiveStatus } from '../types/resource';
import { getRoleBadgeStyle } from '../constants/theme';
import type { Task, Resource } from '../types';
import EmptyState from './common/EmptyState';

// --- Continuous Heatmap Color Engine ---
function getHeatColor(load: number, maxLoad: number): string {
  if (load === 0) return 'rgba(51, 65, 85, 0.12)';
  // Normalize load to 0~1 range (capped at maxLoad)
  const t = Math.min(load / Math.max(maxLoad, 3), 1);
  // Continuous HSL interpolation: green(142°) → yellow(45°) → red(0°)
  let h: number, s: number, l: number, a: number;
  if (t <= 0.5) {
    // green → yellow
    const p = t / 0.5;
    h = 142 - p * (142 - 45);
    s = 72 + p * 8;
    l = 45 + p * 5;
    a = 0.45 + p * 0.15;
  } else {
    // yellow → red
    const p = (t - 0.5) / 0.5;
    h = 45 - p * 45;
    s = 80 + p * 10;
    l = 50 - p * 5;
    a = 0.6 + p * 0.3;
  }
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a.toFixed(2)})`;
}

function getHeatBorder(load: number, maxLoad: number): string {
  if (load === 0) return 'rgba(51, 65, 85, 0.2)';
  const t = Math.min(load / Math.max(maxLoad, 3), 1);
  let h: number;
  if (t <= 0.5) {
    h = 142 - (t / 0.5) * (142 - 45);
  } else {
    h = 45 - ((t - 0.5) / 0.5) * 45;
  }
  return `hsla(${Math.round(h)}, 70%, 55%, 0.35)`;
}

// --- Cell Detail Panel (replaces tooltip + click-to-leave) ---
interface CellDetailData {
  anchorRect: { top: number; left: number; width: number; height: number };
  resourceId: number;
  resourceName: string;
  date: Date;
  formattedDay: string;
  tasks: Task[];
  isLeave: boolean;
  load: number;
  selfMade: number;
  cpFollow: number;
}

function CellDetailPanel({ data, onClose, onToggleLeave }: {
  data: CellDetailData;
  onClose: () => void;
  onToggleLeave: (resourceId: number, formattedDay: string, currentlyOnLeave: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'self' | 'cp'>('all');
  const statusMap: Record<string, { text: string, color: string, bg: string }> = {
    'todo': { text: '待办', color: 'text-gray-400', bg: 'bg-gray-500/10' },
    'in_progress': { text: '进行中', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    'done': { text: '已完成', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
  };

  // Filter tasks based on active tab
  const filteredTasks = useMemo(() => {
    if (activeTab === 'self') return data.tasks.filter(t => t.workCategory !== 'cp_follow');
    if (activeTab === 'cp') return data.tasks.filter(t => t.workCategory === 'cp_follow');
    return data.tasks;
  }, [data.tasks, activeTab]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Position: try to show to the right of the cell, fallback to left if not enough space
  const panelWidth = 320;
  const panelMaxHeight = 400;
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const { anchorRect } = data;
  // Primary: right side of the cell
  let left = anchorRect.left + anchorRect.width + 8;
  let top = anchorRect.top + anchorRect.height / 2 - 60; // vertically align near the cell center
  // Fallback: if right side overflows, show on left side
  if (left + panelWidth > viewportW - 10) {
    left = anchorRect.left - panelWidth - 8;
  }
  // Final fallback: if left side also overflows, clamp to viewport
  if (left < 10) left = 10;
  // Vertical bounds check
  if (top < 10) top = 10;
  if (top + panelMaxHeight > viewportH - 20) {
    top = viewportH - panelMaxHeight - 20;
    if (top < 10) top = 10;
  }

  // Whether we have mixed types (both self-made and CP)
  const hasMixedTypes = data.selfMade > 0 && data.cpFollow > 0;

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-white/[0.08] animate-in fade-in zoom-in-95 duration-150"
      style={{ top, left, width: panelWidth, maxHeight: panelMaxHeight, backgroundColor: 'rgba(15, 17, 25, 0.97)', backdropFilter: 'blur(20px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-gray-900/50">
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-200">{data.resourceName}</span>
          <span className="text-[10px] text-gray-500 font-mono">{format(data.date, 'MM/dd EEE')}</span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300">
          <X size={14} />
        </button>
      </div>

      {/* Category Tab Bar — clickable tabs to filter task list */}
      {data.tasks.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.04] bg-gray-900/20">
          {/* "All" tab */}
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-all ${
              activeTab === 'all'
                ? 'bg-white/[0.08] text-gray-200 font-semibold border border-white/[0.1] shadow-sm'
                : 'text-gray-500 hover:text-gray-400 hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            全部 <span className={`ml-0.5 ${activeTab === 'all' ? 'text-gray-300' : 'text-gray-600'}`}>{data.load}</span>
          </button>
          {/* "Self-made" tab */}
          {data.selfMade > 0 && (
            <button
              onClick={() => setActiveTab('self')}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-all ${
                activeTab === 'self'
                  ? 'bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/25 shadow-sm'
                  : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/5 border border-transparent'
              }`}
            >
              <User size={9} className={activeTab === 'self' ? 'text-indigo-400' : ''} /> 自制 <span className={`ml-0.5 ${activeTab === 'self' ? 'text-indigo-300' : 'text-gray-600'}`}>{data.selfMade}</span>
            </button>
          )}
          {/* "CP Follow" tab */}
          {data.cpFollow > 0 && (
            <button
              onClick={() => setActiveTab('cp')}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-all ${
                activeTab === 'cp'
                  ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/25 shadow-sm'
                  : 'text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/5 border border-transparent'
              }`}
            >
              <Building2 size={9} className={activeTab === 'cp' ? 'text-cyan-400' : ''} /> CP跟进 <span className={`ml-0.5 ${activeTab === 'cp' ? 'text-cyan-300' : 'text-gray-600'}`}>{data.cpFollow}</span>
            </button>
          )}
        </div>
      )}

      {/* Task cards list (filtered by active tab) */}
      <div className="overflow-y-auto px-3 py-2 space-y-1.5" style={{ maxHeight: 280 }}>
        {data.isLeave && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Plane size={12} className="text-purple-400" />
            <span className="text-xs text-purple-300 font-medium">当日已标记休假</span>
          </div>
        )}
        {data.tasks.length === 0 && !data.isLeave ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-600">
            <Eye size={20} className="mb-2 opacity-40" />
            <span className="text-xs">当日无任务 · 空闲</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-gray-600">
            <span className="text-[11px]">该分类下无任务</span>
          </div>
        ) : (
          filteredTasks.map((task, i) => {
            const st = statusMap[task.status] || statusMap.todo;
            const isCp = task.workCategory === 'cp_follow';
            return (
              <div
                key={task.id || i}
                className="group/card px-3 py-2 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all cursor-default"
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-1 h-full min-h-[24px] rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: isCp ? 'rgb(34, 211, 238)' : 'rgb(129, 140, 248)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-200 leading-snug line-clamp-2">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] px-1.5 py-[1px] rounded ${st.bg} ${st.color}`}>{st.text}</span>
                      {isCp && (
                        <span className="text-[9px] px-1.5 py-[1px] rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">CP</span>
                      )}
                      {task.progress !== undefined && task.progress > 0 && (
                        <div className="flex items-center gap-1 ml-auto">
                          <div className="w-10 h-1 rounded-full bg-gray-700 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-[8px] text-gray-500">{task.progress}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-white/[0.06] bg-gray-900/30 flex items-center gap-2">
        {data.isLeave ? (
          <button
            onClick={() => { onToggleLeave(data.resourceId, data.formattedDay, true); onClose(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20 hover:bg-purple-500/25 transition-colors"
          >
            <XCircle size={12} /> 取消休假
          </button>
        ) : (
          <button
            onClick={() => { onToggleLeave(data.resourceId, data.formattedDay, false); onClose(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-gray-700/30 text-gray-400 border border-gray-600/20 hover:bg-purple-500/15 hover:text-purple-300 hover:border-purple-500/20 transition-colors"
          >
            <Plane size={12} /> 标记休假
          </button>
        )}
        {/* Load indicator */}
        {data.load > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[9px] text-gray-600">负载</span>
            {Array.from({ length: Math.min(data.load, 5) }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-[2px]"
                style={{ backgroundColor: getHeatColor(i + 1, 3) }}
              />
            ))}
            <span className="text-[9px] font-mono text-gray-500">{data.load}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Lightweight hover tooltip (non-interactive) ---
interface HoverTooltipData {
  x: number;
  y: number;
  resourceName: string;
  date: Date;
  load: number;
  selfMade: number;
  cpFollow: number;
  isLeave: boolean;
}

function HoverTooltip({ data }: { data: HoverTooltipData }) {
  return (
    <div
      className="fixed z-[9998] rounded-lg px-3 py-2 pointer-events-none min-w-[140px]"
      style={{ left: data.x + 12, top: data.y - 8, backgroundColor: 'rgba(15, 17, 25, 0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-semibold text-gray-200">{data.resourceName}</span>
        <span className="text-[9px] text-gray-500 font-mono">{format(data.date, 'MM/dd')}</span>
      </div>
      {data.isLeave ? (
        <div className="flex items-center gap-1 text-[10px] text-purple-400">
          <Plane size={9} /> 休假中
        </div>
      ) : data.load === 0 ? (
        <span className="text-[10px] text-gray-600">空闲 · 点击查看详情</span>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{data.load}个任务</span>
          {data.selfMade > 0 && <span className="text-[9px] text-indigo-400">自制{data.selfMade}</span>}
          {data.cpFollow > 0 && <span className="text-[9px] text-cyan-400">CP{data.cpFollow}</span>}
        </div>
      )}
      <div className="text-[9px] text-gray-600 mt-0.5">点击查看详情</div>
    </div>
  );
}

// --- Main Component ---
export function ResourceMatrix() {
  const { selectedProjectId } = useStore();
  const [cellDetail, setCellDetail] = useState<CellDetailData | null>(null);
  const [hoverTip, setHoverTip] = useState<HoverTooltipData | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  const resources = useLiveQuery(() => db.resources.toArray());
  const tasks = useLiveQuery(
    () =>
      selectedProjectId
        ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
        : db.tasks.toArray(),
    [selectedProjectId]
  );

  const today = startOfToday();
  const startDate = addDays(today, -5);
  const days = Array.from({ length: 30 }).map((_, i) => addDays(startDate, i));

  // Pre-compute parent task IDs (tasks that have children) to exclude from stats
  const parentTaskIds = React.useMemo(() => {
    if (!tasks) return new Set<number>();
    const ids = new Set<number>();
    tasks.forEach(t => {
      if (t.parentId) ids.add(t.parentId);
    });
    return ids;
  }, [tasks]);

  // Compute global max load for normalization (leaf tasks only)
  const maxLoad = React.useMemo(() => {
    if (!resources || !tasks) return 3;
    let max = 0;
    for (const res of resources) {
      for (const day of days) {
        const count = tasks.filter((t) => {
          if (t.status === 'done') return false;
          if (parentTaskIds.has(t.id!)) return false; // Exclude parent tasks
          if (!t.assigneeIds?.includes(res.id!) || !t.startDate || !t.endDate) return false;
          const s = new Date(t.startDate);
          s.setHours(0, 0, 0, 0);
          const e = new Date(t.endDate);
          e.setHours(23, 59, 59, 999);
          return day >= s && day <= e;
        }).length;
        if (count > max) max = count;
      }
    }
    return Math.max(max, 3);
  }, [resources, tasks, days, parentTaskIds]);

  const showHoverTip = useCallback(
    (e: React.MouseEvent, resourceName: string, date: Date, load: number, selfMade: number, cpFollow: number, isLeave: boolean) => {
      if (cellDetail) return; // Don't show hover tip when detail panel is open
      clearTimeout(hoverTimer.current);
      setHoverTip({ x: e.clientX, y: e.clientY, resourceName, date, load, selfMade, cpFollow, isLeave });
    },
    [cellDetail]
  );

  const hideHoverTip = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHoverTip(null), 80);
  }, []);

  const openCellDetail = useCallback(
    (e: React.MouseEvent, resourceId: number, resourceName: string, date: Date, formattedDay: string, dayTasks: Task[], isLeave: boolean, load: number) => {
      setHoverTip(null); // Hide hover tip
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const selfMade = dayTasks.filter(t => t.workCategory !== 'cp_follow').length;
      const cpFollow = dayTasks.filter(t => t.workCategory === 'cp_follow').length;
      setCellDetail({
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        resourceId,
        resourceName,
        date,
        formattedDay,
        tasks: dayTasks,
        isLeave,
        load,
        selfMade,
        cpFollow,
      });
    },
    []
  );

  const handleToggleLeave = useCallback(async (resourceId: number, formattedDay: string, currentlyOnLeave: boolean) => {
    const resource = resources?.find(r => r.id === resourceId);
    if (!resource) return;
    const currentLeaveDates = (resource as any).leaveDates || [];
    let newLeaveDates;
    if (currentlyOnLeave) {
      newLeaveDates = currentLeaveDates.filter((d: string) => d !== formattedDay);
    } else {
      newLeaveDates = [...currentLeaveDates, formattedDay];
    }
    await trackedDb.resources.update(resourceId, {
      leaveDates: newLeaveDates,
    }, `快捷设置 ${resource.name} ${formattedDay} ${currentlyOnLeave ? '取消' : '标记'}休假`);
  }, [resources]);

  const handleDrop = async (e: React.DragEvent, resourceId: number, date: Date) => {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData('text/plain'));
    if (!taskId) return;
    const task = await db.tasks.get(taskId);
    if (!task) return;
    const duration = (task.startDate && task.endDate) ? differenceInDays(task.endDate, task.startDate) : 0;
    const newAssigneeIds = task.assigneeIds?.includes(resourceId)
      ? task.assigneeIds
      : [...(task.assigneeIds || []), resourceId];
    await trackedDb.tasks.update(taskId, {
      assigneeIds: newAssigneeIds,
      startDate: date,
      endDate: addDays(date, duration),
    }, '矩阵拖拽调整任务排期');
  };

  // Role badge style: now imported from constants/theme

  // Calculate total load for each resource, sorted by type→role order→load
  const sortedResources = React.useMemo(() => {
    if (!resources) return [];
    // Filter out departed members
    const activeResources = resources.filter(r => r.status !== 'departed');
    // Pre-compute total load per resource
    const loadMap = new Map<number, number>();
    activeResources.forEach(r => {
      const load = days.reduce((acc, day) => {
        const dayTasks = tasks?.filter((t) => {
          if (t.status === 'done') return false;
          if (parentTaskIds.has(t.id!)) return false;
          if (!t.assigneeIds?.includes(r.id!) || !t.startDate || !t.endDate) return false;
          const taskStart = new Date(t.startDate);
          taskStart.setHours(0, 0, 0, 0);
          const taskEnd = new Date(t.endDate);
          taskEnd.setHours(23, 59, 59, 999);
          return day >= taskStart && day <= taskEnd;
        }) || [];
        return acc + dayTasks.length;
      }, 0);
      loadMap.set(r.id!, load);
    });
    return [...activeResources].sort((a, b) => {
      // Primary: compareResources (type → role order → sortOrder)
      const cmp = compareResources(a, b);
      if (cmp !== 0) return cmp;
      // Tie-break within same role: higher load first
      return (loadMap.get(b.id!) || 0) - (loadMap.get(a.id!) || 0);
    });
  }, [resources, tasks, days, parentTaskIds]);

  // Compute internal/cp counts for group dividers
  const internalCount = useMemo(() => sortedResources.filter(r => r.type !== 'cp').length, [sortedResources]);
  const cpCount = useMemo(() => sortedResources.filter(r => r.type === 'cp').length, [sortedResources]);

  return (
    <div className="flex-1 overflow-auto bg-[#0f1115] flex flex-col">
      {/* Header with continuous gradient legend */}
      <div className="p-4 border-b border-gray-800/60 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-semibold text-gray-100 tracking-tight">资源负载矩阵</h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-500 mr-1">负载</span>
          <span className="text-[10px] text-gray-500">空闲</span>
          <div className="heatmap-legend-bar w-40 h-2.5 rounded-full" />
          <span className="text-[10px] text-gray-500">超载</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="min-w-[1200px] bg-gray-900/40 rounded-xl border border-white/[0.06] overflow-hidden shadow-2xl shadow-black/20">
          {/* Date Header */}
          <div className="flex border-b border-white/[0.06] bg-gray-900/70 sticky top-0 z-10 backdrop-blur-sm">
            <div className="w-56 shrink-0 font-medium text-gray-400 p-4 border-r border-white/[0.06] flex items-center text-sm">
              团队成员
            </div>
            <div className="flex-1 flex">
              {days.map((day) => {
                const isToday_ = isSameDay(day, today);
                const isWkend = isWeekend(day);
                const dateStr = format(day, 'yyyy-MM-dd');
                
                // Determine if it's an actual off day (weekend or holiday, but not a makeup work day)
                const isActualOffDay = isNonWorkingDay(day);
                const isMakeupWorkDay = isWkend && !isActualOffDay; // If it's a weekend but working day, it's a makeup day
                const isStatutoryHoliday = isHoliday(day);
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 border-r border-white/[0.03] min-w-[40px] transition-colors relative ${
                      isToday_
                        ? 'bg-blue-500/10 text-blue-400'
                        : isActualOffDay
                        ? 'bg-red-500/5 text-red-400/80'
                        : isMakeupWorkDay
                        ? 'bg-orange-500/5 text-orange-400/90'
                        : 'text-gray-400'
                    }`}
                  >
                    {/* Today top marker */}
                    {isToday_ && (
                      <div className="absolute top-0 left-1 right-1 h-[2px] rounded-b-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]" />
                    )}
                    {(isStatutoryHoliday || isMakeupWorkDay) && (
                      <span className={`absolute top-0.5 right-0.5 text-[8px] leading-none px-0.5 rounded-sm ${
                        isStatutoryHoliday ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                      }`}>
                        {isStatutoryHoliday ? '休' : '班'}
                      </span>
                    )}
                    <span className={`text-[9px] uppercase tracking-wider mb-0.5 opacity-70 ${isActualOffDay ? 'text-red-400/70' : isMakeupWorkDay ? 'text-orange-400/70' : ''}`}>
                      {format(day, 'EEE')}
                    </span>
                    <span className={`text-xs ${isToday_ ? 'font-bold' : 'font-medium'} ${isActualOffDay ? 'text-red-400/90' : isMakeupWorkDay ? 'text-orange-400/90' : ''}`}>
                      {format(day, 'dd')}
                    </span>
                    {/* Today bottom indicator dot */}
                    {isToday_ && (
                      <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.8)]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body Rows */}
          <div className="divide-y divide-white/[0.04]">
            {sortedResources?.map((resource, index) => {
              const prevResource = index > 0 ? sortedResources[index - 1] : null;
              const showInternalHeader = index === 0 && internalCount > 0;
              const showCpDivider = resource.type === 'cp' && (!prevResource || prevResource.type !== 'cp');

              return (
                <React.Fragment key={resource.id}>
                  {/* Internal members group header */}
                  {showInternalHeader && (
                    <div className="flex bg-gray-900/40">
                      <div className="w-56 shrink-0 px-4 py-2 border-r border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] font-semibold text-indigo-400/70 uppercase tracking-widest">内部成员 ({internalCount})</div>
                          <div className="flex-1 h-px bg-indigo-500/15" />
                        </div>
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}
                  {/* CP external members group header */}
                  {showCpDivider && (
                    <div className="flex bg-gray-900/40">
                      <div className="w-56 shrink-0 px-4 py-2.5 border-r border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <Building2 size={12} className="text-emerald-400/70 shrink-0" />
                          <div className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-widest">CP 外包 ({cpCount})</div>
                          <div className="flex-1 h-px bg-emerald-500/15" />
                        </div>
                      </div>
                      <div className="flex-1" />
                    </div>
                  )}
              <div className="flex group hover:bg-white/[0.02] transition-colors duration-200">
                {/* Member info */}
                <div className="w-56 shrink-0 p-3 border-r border-white/[0.06] flex items-center gap-2.5 bg-gray-900/20">
                  <div className="relative">
                    <Avatar
                      name={resource.name}
                      size="md"
                      type={((resource as any).type as 'internal' | 'cp') || 'internal'}
                      avatar={resource.avatar}
                      avatarStyle={(resource as any)?.avatarStyle}
                      role={resource.role}
                    />
                    {/* Status indicator dot/icon */}
                    {(() => { const effStatus = getEffectiveStatus(resource); return effStatus && effStatus !== 'active' ? (
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#12141e] flex items-center justify-center ${
                        effStatus === 'wfh' ? 'bg-blue-500' :
                        effStatus === 'sick' ? 'bg-orange-500' :
                        effStatus === 'leave' ? 'bg-purple-500' :
                        effStatus === 'focus' ? 'bg-red-500' : ''
                      }`} title={
                        effStatus === 'wfh' ? '居家办公' :
                        effStatus === 'sick' ? '身体欠佳' :
                        effStatus === 'leave' ? '休假中' :
                        effStatus === 'focus' ? '专注模式' : ''
                      }>
                        {effStatus === 'wfh' && <span className="text-[8px] text-white leading-none">🏠</span>}
                        {effStatus === 'sick' && <span className="text-[8px] text-white leading-none">🤒</span>}
                        {effStatus === 'leave' && <span className="text-[8px] text-white leading-none">✈️</span>}
                        {effStatus === 'focus' && <span className="text-[8px] text-white leading-none">🎯</span>}
                      </div>
                    ) : null; })()}
                  </div>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-sm font-medium text-gray-200 truncate">{resource.name}</span>
                    {resource.role && (
                      <span className={`self-start shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border ${getRoleBadgeStyle(resource.role)}`}>
                        {resource.role}
                      </span>
                    )}
                  </div>
                  {/* Overload Warning Indicator */}
                  {(() => {
                    const totalLoad = days.reduce((acc, day) => {
                      const dayTasks = tasks?.filter((t) => {
                        if (t.status === 'done') return false;
                        if (parentTaskIds.has(t.id!)) return false; // Exclude parent tasks
                        if (!t.assigneeIds?.includes(resource.id!) || !t.startDate || !t.endDate) return false;
                        const taskStart = new Date(t.startDate);
                        taskStart.setHours(0, 0, 0, 0);
                        const taskEnd = new Date(t.endDate);
                        taskEnd.setHours(23, 59, 59, 999);
                        return day >= taskStart && day <= taskEnd;
                      }) || [];
                      return acc + (dayTasks.length >= 3 ? 1 : 0);
                    }, 0);
                    
                    // Calculate total tasks for this resource
                    const activeTasks = tasks?.filter(t => t.assigneeIds?.includes(resource.id!) && t.status !== 'done' && !parentTaskIds.has(t.id!)) || [];
                    const totalTasks = activeTasks.length;
                    const selfMadeCount = activeTasks.filter(t => t.workCategory !== 'cp_follow').length;
                    const cpFollowCount = activeTasks.filter(t => t.workCategory === 'cp_follow').length;

                    return (
                      <div className="ml-auto flex items-center gap-2">
                        <div className="flex flex-col items-end">
                           <span className="text-[10px] text-gray-500">总任务</span>
                           <div className="flex items-center gap-1">
                             {cpFollowCount > 0 && selfMadeCount > 0 ? (
                               <>
                                 <span className="text-[10px] font-semibold text-indigo-400" title="自制内容">{selfMadeCount}</span>
                                 <span className="text-[9px] text-gray-600">+</span>
                                 <span className="text-[10px] font-semibold text-cyan-400" title="CP跟进">{cpFollowCount}</span>
                               </>
                             ) : cpFollowCount > 0 ? (
                               <span className="text-xs font-semibold text-cyan-400" title="CP跟进">{totalTasks}</span>
                             ) : (
                               <span className="text-xs font-semibold text-gray-300">{totalTasks}</span>
                             )}
                           </div>
                        </div>
                        {totalLoad > 0 && (
                          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400" title={`有 ${totalLoad} 天处于超载状态`}>
                            <span className="text-[10px] font-bold">!</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Heatmap cells */}
                <div className="flex-1 flex py-[3px] px-[2px]">
                  {days.map((day) => {
                    const isToday_ = isSameDay(day, today);
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isWkend = isWeekend(day);
                    const isActualOffDay = isNonWorkingDay(day);
                    const isMakeupWorkDay = isWkend && !isActualOffDay;

                    const dayTasks =
                      tasks?.filter((t) => {
                        if (t.status === 'done') return false;
                        if (parentTaskIds.has(t.id!)) return false; // Exclude parent tasks
                        if (!t.assigneeIds?.includes(resource.id!) || !t.startDate || !t.endDate) return false;
                        const taskStart = new Date(t.startDate);
                        taskStart.setHours(0, 0, 0, 0);
                        const taskEnd = new Date(t.endDate);
                        taskEnd.setHours(23, 59, 59, 999);
                        return day >= taskStart && day <= taskEnd;
                      }) || [];
                    
                    const formattedDay = format(day, 'yyyy-MM-dd');
                    const isLeave = (resource as any).leaveDates?.includes(formattedDay) || dayTasks.some(t => t.title.includes('请假') || t.title.includes('休假'));
                    const load = isLeave ? 0 : dayTasks.length; // Don't count leave as normal load
                    const isOverload = load >= 3;

                    return (
                      <div
                        key={day.toISOString()}
                        className={`heatmap-cell flex-1 mx-[1px] rounded-[4px] relative cursor-pointer transition-all duration-200 ${
                          isOverload ? 'heatmap-overload ring-1 ring-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.3)] z-10' : ''
                        } ${isToday_ ? 'ring-1 ring-blue-400/50 ring-inset shadow-[inset_0_0_8px_rgba(96,165,250,0.15)]' : ''} ${
                          isLeave ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(168,85,247,0.15)_4px,rgba(168,85,247,0.15)_8px)]' : ''
                        } ${!isLeave && isActualOffDay && load === 0 ? 'bg-red-500/[0.03]' : ''} ${!isLeave && isMakeupWorkDay && load === 0 ? 'bg-orange-500/[0.03]' : ''}`}
                        style={{
                          backgroundColor: isLeave ? 'rgba(168, 85, 247, 0.1)' : (load > 0 ? getHeatColor(load, maxLoad) : (isActualOffDay ? 'rgba(239, 68, 68, 0.03)' : (isMakeupWorkDay ? 'rgba(249, 115, 22, 0.03)' : 'rgba(51, 65, 85, 0.12)'))),
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: isLeave ? 'rgba(168, 85, 247, 0.3)' : (load > 0 ? getHeatBorder(load, maxLoad) : (isActualOffDay ? 'rgba(239, 68, 68, 0.1)' : (isMakeupWorkDay ? 'rgba(249, 115, 22, 0.1)' : 'transparent'))),
                        }}
                        onClick={(e) => {
                          openCellDetail(e, resource.id!, resource.name, day, formattedDay, dayTasks, isLeave, load);
                        }}
                        onMouseEnter={(e) => {
                          const sm = dayTasks.filter(t => t.workCategory !== 'cp_follow').length;
                          const cp = dayTasks.filter(t => t.workCategory === 'cp_follow').length;
                          showHoverTip(e, resource.name, day, load, sm, cp, isLeave);
                        }}
                        onMouseMove={(e) => {
                          const sm = dayTasks.filter(t => t.workCategory !== 'cp_follow').length;
                          const cp = dayTasks.filter(t => t.workCategory === 'cp_follow').length;
                          showHoverTip(e, resource.name, day, load, sm, cp, isLeave);
                        }}
                        onMouseLeave={hideHoverTip}
                        onDrop={(ev) => handleDrop(ev, resource.id!, day)}
                        onDragOver={(ev) => ev.preventDefault()}
                      >
                        {isLeave ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-purple-400/90 drop-shadow-sm">休假</span>
                          </div>
                        ) : load > 0 ? (
                          <div className="w-full h-full flex items-center justify-center">
                            {(() => {
                              const daySelfMade = dayTasks.filter(t => t.workCategory !== 'cp_follow').length;
                              const dayCpFollow = dayTasks.filter(t => t.workCategory === 'cp_follow').length;
                              if (daySelfMade > 0 && dayCpFollow > 0) {
                                return (
                                  <span className="font-bold drop-shadow-sm flex items-center" style={{ fontSize: '11px', letterSpacing: '-0.5px' }}>
                                    <span className="text-indigo-200" style={{ textShadow: '0 0 6px rgba(129,140,248,0.5)' }}>{daySelfMade}</span>
                                    <span className="text-gray-500 mx-[1px]" style={{ fontSize: '9px' }}>/</span>
                                    <span className="text-cyan-200" style={{ textShadow: '0 0 6px rgba(34,211,238,0.5)' }}>{dayCpFollow}</span>
                                  </span>
                                );
                              }
                              return (
                                <span
                                  className={`font-bold drop-shadow-sm ${
                                    dayCpFollow > 0 ? 'text-cyan-200' : (isOverload ? 'text-white' : 'text-white/90')
                                  }`}
                                  style={{ fontSize: '11px', textShadow: dayCpFollow > 0 ? '0 0 6px rgba(34,211,238,0.4)' : undefined }}
                                >
                                  {load}
                                </span>
                              );
                            })()}
                          </div>
                        ) : null}                      </div>
                    );
                  })}
                </div>
              </div>
              </React.Fragment>
              );
            })}

            {(!resources || resources.length === 0) && (
              <EmptyState variant="no-members" title="暂无团队成员数据" description="请先添加团队成员" size="md" />
            )}
          </div>
        </div>
      </div>

      {/* Hover tooltip (lightweight, non-interactive) */}
      {hoverTip && !cellDetail && <HoverTooltip data={hoverTip} />}

      {/* Cell detail panel (interactive, click-triggered) */}
      {cellDetail && (
        <CellDetailPanel
          data={cellDetail}
          onClose={() => setCellDetail(null)}
          onToggleLeave={handleToggleLeave}
        />
      )}
    </div>
  );
}