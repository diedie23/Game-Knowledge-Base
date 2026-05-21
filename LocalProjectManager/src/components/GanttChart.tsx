import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task } from '../db/db';
import { trackedDb, useHistoryStore } from '../store/useHistoryStore';
import { tapdService } from '../services/tapdService';
import type { RefreshResult, RefreshDetailItem } from '../types/tapd';
import { differenceInDays, addDays, startOfToday, startOfDay, format, isWeekend, isSameMonth } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useStore } from '../store/useStore';
import {
  ChevronRight, ChevronDown, Users,
  Clock, Flag, CheckCircle2,
  AlertTriangle,
  ExternalLink,
  GripVertical,
  TrendingDown, AlertCircle, X,
  RefreshCw, ExternalLink as LinkIcon2, ChevronUp, CalendarDays
} from 'lucide-react';
import { WhatIfPanel, GhostSchedule } from './WhatIfPanel';
import { Avatar, getMemberColor } from './common/Avatar';

// --- Gantt sub-modules ---
import {
  ZOOM_PRESETS, DEFAULT_ZOOM_INDEX, LEFT_PANEL_WIDTH, ROW_HEIGHT,
  TASK_TYPE_COLORS,
  isHoliday, getTaskTypeColor, getStatusConfig,
  dependencyLineStyles,
  inferPipelineDependencies,
  compareResources, getRoleOrderIndex,
} from './gantt/constants';
import type { VisibleTaskRow, DependencyLine, ContextMenuState, ResizeState } from './gantt/types';
import { GanttDependencyLines } from './gantt/GanttDependencyLines';
import { GanttTodayLine } from './gantt/GanttTodayLine';
import { GanttGhostOverlay } from './gantt/GanttGhostOverlay';
import { useGanttZoom } from './gantt/hooks/useGanttZoom';
import { useGanttDrag } from './gantt/hooks/useGanttDrag';
import { useTaskMove } from './gantt/hooks/useTaskMove';
import { useConflictDetection } from './gantt/hooks/useConflictDetection';
import { useLeftPanelResize } from './gantt/hooks/useLeftPanelResize';
import { GanttMemberPanel } from './gantt/GanttMemberPanel';
import { GanttRiskPanel } from './gantt/GanttRiskPanel';
import { GanttContextMenu } from './gantt/GanttContextMenu';
import { GanttToolbar } from './gantt/GanttToolbar';
import { GanttTimeline } from './gantt/GanttTimeline';
import { GanttScrollbar } from './gantt/GanttScrollbar';
import { GanttResourceHeatRow } from './gantt/GanttResourceHeatRow';
import { assessTaskRisk, type TaskRisk, RISK_THRESHOLDS, syncParentDateRange } from '../services/workloadService';
import { getEffectiveStatus } from '../types/resource';
import { confirmDialog, alertDialog } from './common/ConfirmDialog';
import { toast } from '../store/useToastStore';

// Constants, types, and sub-components are now imported from ./gantt/ sub-modules

export function GanttChart() {
  const { openTaskModal, expandedTaskIds, toggleTaskExpansion, highlightedTaskIds, selectedMemberId, setSelectedMemberId, selectedProjectId } = useStore();
  const tasks = useLiveQuery(
    () => selectedProjectId
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  );
  const resources = useLiveQuery(() => db.resources.toArray());
  const today = startOfToday();
  
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const { zoomIndex, zoomConfig, dayWidth, visibleDays, handleZoomIn, handleZoomOut, handleZoomReset } = useGanttZoom(ganttScrollRef);
  
  // Dynamic start date: 2 weeks before the earliest task, or fallback to fixed date
  const startDate = useMemo(() => {
    if (tasks && tasks.length > 0) {
      const datesWithStart = tasks.filter(t => t.startDate).map(t => t.startDate!.getTime());
      if (datesWithStart.length > 0) {
        const earliest = new Date(Math.min(...datesWithStart));
        // Start 14 days before the earliest task
        return addDays(earliest, -14);
      }
    }
    return new Date(2026, 3, 10); // Fallback
  }, [tasks]);
  const days = useMemo(() => Array.from({ length: visibleDays }).map((_, i) => addDays(startDate, i)), [startDate, visibleDays]);

  // Adjust scroll proportionally on zoom
  const prevDayWidth = useRef(dayWidth);
  useEffect(() => {
    if (ganttScrollRef.current) {
      if (prevDayWidth.current !== dayWidth) {
        // Zoom changed: adjust scrollLeft proportionally to keep the same center date
        const ratio = dayWidth / prevDayWidth.current;
        ganttScrollRef.current.scrollLeft = ganttScrollRef.current.scrollLeft * ratio;
        prevDayWidth.current = dayWidth;
      }
    }
  }, [dayWidth]);

  const handleNavigate = useCallback((action: number | 'today') => {
    if (!ganttScrollRef.current) return;
    if (action === 'today') {
      const todayOffset = differenceInDays(today, startDate);
      ganttScrollRef.current.scrollLeft = Math.max(0, todayOffset * dayWidth - 100);
    } else {
      ganttScrollRef.current.scrollLeft += action * dayWidth;
    }
  }, [dayWidth, today, startDate]);

  // Auto-focus timeline to the earliest start date among in-progress tasks on initial load
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (hasAutoFocused.current || !tasks || tasks.length === 0 || !ganttScrollRef.current) return;
    // Find all in-progress (active) tasks with a start date
    const activeTasks = tasks.filter(t => 
      (t.status === 'in_progress' || t.status === 'todo') && t.startDate
    );
    if (activeTasks.length === 0) return;
    // Find the earliest start date among active tasks
    const earliestStart = activeTasks.reduce((earliest, t) => {
      const d = new Date(t.startDate!);
      return d < earliest ? d : earliest;
    }, new Date(activeTasks[0].startDate!));
    // Scroll to 1 day before the earliest start date for context
    const offset = differenceInDays(startOfDay(earliestStart), startDate);
    ganttScrollRef.current.scrollLeft = Math.max(0, (offset - 1) * dayWidth);
    hasAutoFocused.current = true;
  }, [tasks, startDate, dayWidth]);

  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [conflictTaskId, setConflictTaskId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<number | null>(null);
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [showRiskPanel, setShowRiskPanel] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [ghostSchedules, setGhostSchedules] = useState<GhostSchedule[]>([]);
  const [groupBy, setGroupBy] = useState<'task' | 'assignee'>('task');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBatchManageModal, setShowBatchManageModal] = useState(false);
  const [batchStatus, setBatchStatus] = useState<Task['status'] | ''>('');
  const [batchPriority, setBatchPriority] = useState<Task['priority'] | ''>('');
  const [batchAssigneeId, setBatchAssigneeId] = useState<number | ''>('');
  const [isCompact, setIsCompact] = useState(false);

  // TAPD quick refresh state
  const [hasTapdConfig, setHasTapdConfig] = useState(false);
  const [isTapdRefreshing, setIsTapdRefreshing] = useState(false);
  const [tapdRefreshResult, setTapdRefreshResult] = useState<RefreshResult | null>(null);
  const [showTapdRefreshModal, setShowTapdRefreshModal] = useState(false);
  const [tapdRefreshError, setTapdRefreshError] = useState<string | null>(null);

  // Check if TAPD config exists for current project
  useEffect(() => {
    (async () => {
      try {
        const config = await db.tapdConfigs.toCollection().first();
        setHasTapdConfig(!!config?.workspaceId);
      } catch { setHasTapdConfig(false); }
    })();
  }, []);

  // Project pause/resume state
  const currentProject = useLiveQuery(
    () => selectedProjectId ? db.projects.get(selectedProjectId) : undefined,
    [selectedProjectId]
  );
  const projectStatus = (currentProject?.status || 'active') as 'active' | 'paused' | 'archived';

  // Project pause/resume handlers
  const handlePauseProject = useCallback(async () => {
    if (!selectedProjectId) return;
    const reason = window.prompt('请输入暂停原因（如：项目被砍、优先级调整等）：', '项目暂停');
    if (reason === null) return; // User cancelled
    const { projectPauseService } = await import('../services/projectPauseService');
    await projectPauseService.pauseProject(selectedProjectId, reason);
  }, [selectedProjectId]);

  const handleResumeProject = useCallback(async () => {
    if (!selectedProjectId) return;
    const ok = await confirmDialog({ title: '恢复项目', message: '确认恢复项目？所有暂停的任务将恢复到暂停前的状态。' });
    if (!ok) return;
    const { projectPauseService } = await import('../services/projectPauseService');
    await projectPauseService.resumeProject(selectedProjectId);
  }, [selectedProjectId]);

  const handleArchiveProject = useCallback(async () => {
    if (!selectedProjectId) return;
    const reason = window.prompt('请输入归档原因（如：项目永久关闭、已完结等）：', '项目已归档');
    if (reason === null) return; // User cancelled
    const { projectPauseService } = await import('../services/projectPauseService');
    await projectPauseService.archiveProject(selectedProjectId, reason);
  }, [selectedProjectId]);

  // TAPD quick refresh handler
  const handleTapdQuickRefresh = useCallback(async () => {
    if (!selectedProjectId) return;
    const projectId = selectedProjectId;
    setIsTapdRefreshing(true);
    setTapdRefreshError(null);
    setTapdRefreshResult(null);
    try {
      const result = await tapdService.refreshExistingTasks(projectId);
      setTapdRefreshResult(result);
      setShowTapdRefreshModal(true);
    } catch (err: any) {
      console.error('[GanttChart] TAPD refresh failed:', err);
      setTapdRefreshError(err.message || 'TAPD数据刷新失败');
      setShowTapdRefreshModal(true);
    } finally {
      setIsTapdRefreshing(false);
    }
  }, [selectedProjectId]);

  // Auto-reclassify modules when switching to group_module view
  useEffect(() => {
    if (filterStatus === 'group_module' && tasks && tasks.length > 0) {
      const tasksWithoutModule = tasks.filter(t => !t.module && t.title);
      if (tasksWithoutModule.length > 0) {
        // Check if there are TAPD-linked tasks without module - trigger TAPD refresh to get custom_field_one
        const tapdTasksWithoutModule = tasksWithoutModule.filter(t => t.tapdId);
        if (tapdTasksWithoutModule.length > 0) {
          // Trigger TAPD refresh to fetch module from custom_field_one (模块特性)
          import('../services/tapdService').then(({ tapdService }) => {
            const projectId = useStore.getState().selectedProjectId;
            if (!projectId) return;
            tapdService.refreshExistingTasks(projectId).then(() => {
              console.log(`[GanttChart] Auto-refreshed TAPD tasks to populate module field from custom_field_one`);
            }).catch(err => {
              console.warn(`[GanttChart] TAPD refresh for module failed, falling back to title extraction:`, err);
              // Fallback: extract from title
              import('../services/tapdService').then(({ reclassifyModules }) => {
                reclassifyModules(projectId || undefined);
              });
            });
          });
        } else {
          // No TAPD-linked tasks, just extract from title
          import('../services/tapdService').then(({ reclassifyModules }) => {
            const projectId = useStore.getState().selectedProjectId;
            reclassifyModules(projectId || undefined).then(result => {
              if (result.updated > 0) {
                console.log(`[GanttChart] Auto-reclassified ${result.updated} tasks into modules`);
              }
            });
          });
        }
      }
    }
  }, [filterStatus, tasks]);

  // Early finish cascade confirmation modal state
  const [earlyFinishConfirm, setEarlyFinishConfirm] = useState<{
    taskTitle: string;
    daysEarly: number;
    downstreamTasks: Task[];
    taskId: number;
  } | null>(null);

  // Quick-assign avatar popover (click avatar on task row → pick assignees inline)
  const [assigneePopover, setAssigneePopover] = useState<{ taskId: number; top: number; left: number } | null>(null);
  const assigneePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!assigneePopover) return;
    const onDown = (e: MouseEvent) => {
      // Use setTimeout(0) so the click handler on the button fires first
      setTimeout(() => {
        if (assigneePopoverRef.current && !assigneePopoverRef.current.contains(e.target as Node)) {
          setAssigneePopover(null);
        }
      }, 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAssigneePopover(null);
    };
    // Use 'mousedown' on next tick to avoid closing immediately on open
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
    }, 10);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [assigneePopover]);

  const toggleAssigneeForTask = useCallback(async (taskId: number, resourceId: number) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    const cur = task.assigneeIds || [];
    const next = cur.includes(resourceId)
      ? cur.filter(id => id !== resourceId)
      : [...cur, resourceId];
    await trackedDb.tasks.update(taskId, { assigneeIds: next }, '修改任务负责人');
  }, []);

  const clearAssigneesForTask = useCallback(async (taskId: number) => {
    await trackedDb.tasks.update(taskId, { assigneeIds: [] }, '清空任务负责人');
  }, []);

  // Conflict detection — delegated to useConflictDetection hook
  const { scheduleConflicts, usedTaskTypes, getShortTaskName } = useConflictDetection(tasks, resources);

  // Calculate Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    if (!tasks) return null;
    
    const blockedCount = scheduleConflicts.size;
    
    // Health by type
    const typeHealth = new Map<string, { total: number, onTime: number }>();
    tasks.forEach(t => {
      const type = t.title.includes('UI') ? 'UI设计' : 
                   t.title.includes('交互') ? '交互设计' : 
                   t.title.includes('开发') ? '开发' : 
                   t.title.includes('测试') ? '测试' : '其他';
      if (!typeHealth.has(type)) typeHealth.set(type, { total: 0, onTime: 0 });
      const stats = typeHealth.get(type)!;
      stats.total++;
      
      const isOverdue = t.endDate && t.endDate < new Date() && t.status !== 'done';
      if (t.status === 'done' || (!scheduleConflicts.has(t.id!) && !isOverdue)) {
        stats.onTime++;
      }
    });

    // Burn-down (simplified: total days vs completed days)
    const scheduledTasks = tasks.filter(t => t.startDate && t.endDate);
    const totalDays = scheduledTasks.reduce((sum, t) => sum + differenceInDays(t.endDate!, t.startDate!) + 1, 0);
    const completedDays = scheduledTasks.filter(t => t.status === 'done').reduce((sum, t) => sum + differenceInDays(t.endDate!, t.startDate!) + 1, 0);
    const progress = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

    return { blockedCount, typeHealth, progress, totalDays, completedDays };
  }, [tasks]);

  const criticalPathTaskIds = useMemo(() => {
    if (!focusMode || !tasks) return new Set<number>();
    
    const criticalIds = new Set<number>();
    const taskMap = new Map<number, Task>();
    tasks.forEach(t => taskMap.set(t.id!, t));

    // Build reverse dependency graph: depId -> tasks that depend on it
    const reverseDeps = new Map<number, Task[]>();
    tasks.forEach(t => {
      t.dependencies?.forEach(depId => {
        if (!reverseDeps.has(depId)) reverseDeps.set(depId, []);
        reverseDeps.get(depId)!.push(t);
      });
    });

    // Calculate Late Finish (LF) for each task
    const lfMap = new Map<number, Date>();
    
    // Helper to get LF recursively
    const getLF = (taskId: number): Date => {
      if (lfMap.has(taskId)) return lfMap.get(taskId)!;
      
      const dependents = reverseDeps.get(taskId) || [];
      if (dependents.length === 0) {
        const t = taskMap.get(taskId)!;
        const endDate = t.endDate || new Date();
        lfMap.set(taskId, endDate);
        return endDate;
      }

      // LF is the minimum of LS of all dependents
      const lsDates = dependents.filter(dep => dep.startDate && dep.endDate).map(dep => {
        const depLF = getLF(dep.id!);
        const duration = differenceInDays(dep.endDate!, dep.startDate!);
        return addDays(depLF, -duration);
      });
      if (lsDates.length === 0) {
        const t = taskMap.get(taskId)!;
        const endDate = t.endDate || new Date();
        lfMap.set(taskId, endDate);
        return endDate;
      }
      
      const minLS = new Date(Math.min(...lsDates.map(d => d.getTime())));
      lfMap.set(taskId, minLS);
      return minLS;
    };

    tasks.filter(t => t.startDate && t.endDate).forEach(t => {
      const lf = getLF(t.id!);
      const slack = differenceInDays(lf, t.endDate!);
      if (slack <= 0) {
        criticalIds.add(t.id!);
      }
    });

    return criticalIds;
  }, [tasks, focusMode]);

  // Listen for Tab key to toggle groupBy and Ctrl+C for copy, and Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setGroupBy(prev => prev === 'task' ? 'assignee' : 'task');
        }
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedTaskIds.size > 0) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleBatchCopyMarkdown();
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (e.shiftKey) {
            useHistoryStore.getState().redo();
          } else {
            useHistoryStore.getState().undo();
          }
        }
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          useHistoryStore.getState().redo();
        }
      } else if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // 'T' to jump to today
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
          e.preventDefault();
          handleNavigate('today');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds, tasks]);

  const handleBatchCopyMarkdown = () => {
    const selectedTasks = tasks?.filter(t => selectedTaskIds.has(t.id!)) || [];
    if (selectedTasks.length === 0) return;
    let md = '| 任务详情 | 开始时间 | 结束时间 | 状态 |\n| --- | --- | --- | --- |\n';
    selectedTasks.forEach(t => {
      md += `| ${t.title} | ${t.startDate ? format(t.startDate, 'yyyy-MM-dd') : '未排期'} | ${t.endDate ? format(t.endDate, 'yyyy-MM-dd') : '未排期'} | ${t.status} |\n`;
    });
    navigator.clipboard.writeText(md);
    toast.success(`已将 ${selectedTasks.length} 个任务复制到剪贴板`);
    setContextMenu(null);
  };

  const handleBatchShift = async (days: number) => {
    for (const id of selectedTaskIds) {
      const task = tasks?.find(t => t.id === id);
      if (task && task.startDate && task.endDate) {
        await trackedDb.tasks.update(id, {
          startDate: addDays(task.startDate, days),
          endDate: addDays(task.endDate, days)
        }, `批量顺延 ${days} 天`);
      }
    }
    setContextMenu(null);
  };

  const handleBatchAlignEnd = async () => {
    if (selectedTaskIds.size === 0) return;
    const selectedTasks = tasks?.filter(t => selectedTaskIds.has(t.id!) && t.startDate && t.endDate) || [];
    if (selectedTasks.length === 0) return;
    const maxEndDate = new Date(Math.max(...selectedTasks.map(t => t.endDate!.getTime())));
    for (const task of selectedTasks) {
      const duration = differenceInDays(task.endDate!, task.startDate!);
      const newStartDate = addDays(maxEndDate, -duration);
      await trackedDb.tasks.update(task.id!, {
        startDate: newStartDate,
        endDate: maxEndDate
      }, '批量对齐结束时间');
    }
    setContextMenu(null);
  };

  const handleExport = useCallback(async () => {
    if (!ganttScrollRef.current) return;
    try {
      // Dynamically import html2canvas to avoid initial bundle bloat
      const html2canvas = (await import('html2canvas')).default;
      const element = ganttScrollRef.current;
      
      // Temporarily expand the container to capture everything
      const originalWidth = element.style.width;
      const originalHeight = element.style.height;
      const originalOverflow = element.style.overflow;
      
      element.style.width = `${element.scrollWidth}px`;
      element.style.height = `${element.scrollHeight}px`;
      element.style.overflow = 'visible';

      const canvas = await html2canvas(element, {
        backgroundColor: '#0b0d14',
        scale: 2, // High resolution
        logging: false,
        useCORS: true,
      });

      // Restore original styles
      element.style.width = originalWidth;
      element.style.height = originalHeight;
      element.style.overflow = originalOverflow;

      // Download
      const link = document.createElement('a');
      link.download = `Gantt_Export_${format(new Date(), 'yyyyMMdd_HHmmss')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('导出失败，请稍后重试');
    }
  }, []);

  // --- Row reorder drag state ---
  const [reorderDragId, setReorderDragId] = useState<number | null>(null);
  const [reorderDropTarget, setReorderDropTarget] = useState<{ taskId: number; position: 'before' | 'after' } | null>(null);

  // --- Dependency Drag State ---
  const [depDragStart, setDepDragStart] = useState<{ taskId: number, x: number, y: number } | null>(null);
  const [depDragCurrent, setDepDragCurrent] = useState<{ x: number, y: number } | null>(null);

  const handleDepDragStart = (e: React.MouseEvent, task: Task, rowIndex: number) => {
    e.stopPropagation();
    if (!task.endDate) return;
    const depEndOffset = differenceInDays(task.endDate, startDate) + 1;
    const fromX = effectiveLpWidth + depEndOffset * dayWidth;
    const rowH = isCompact ? 32 : 44;
    const fromY = rowIndex * rowH + rowH / 2 + 2;
    setDepDragStart({ taskId: task.id!, x: fromX, y: fromY });
    setDepDragCurrent({ x: fromX, y: fromY });
  };

  useEffect(() => {
    if (!depDragStart) return;
    const container = ganttScrollRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const x = e.clientX - containerRect.left + container.scrollLeft;
      const y = e.clientY - containerRect.top + container.scrollTop;
      setDepDragCurrent({ x, y });
    };

    const handleMouseUp = () => {
      setDepDragStart(null);
      setDepDragCurrent(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [depDragStart]);

  // Toast notification for dependency operations
  const [depToast, setDepToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  useEffect(() => {
    if (!depToast) return;
    const timer = setTimeout(() => setDepToast(null), 2500);
    return () => clearTimeout(timer);
  }, [depToast]);

  const handleDepDrop = async (e: React.MouseEvent, targetTaskId: number) => {
    if (!depDragStart || depDragStart.taskId === targetTaskId) return;
    e.stopPropagation();
    
    const targetTask = tasks?.find(t => t.id === targetTaskId);
    if (!targetTask) return;

    const sourceTask = tasks?.find(t => t.id === depDragStart.taskId);

    if (targetTask.dependencies?.includes(depDragStart.taskId)) {
      setDepToast({ message: '依赖关系已存在', type: 'error' });
      return;
    }

    const isCircular = (startId: number, targetId: number): boolean => {
      if (startId === targetId) return true;
      const task = tasks?.find(t => t.id === startId);
      if (!task || !task.dependencies) return false;
      return task.dependencies.some(depId => isCircular(depId, targetId));
    };

    if (isCircular(depDragStart.taskId, targetTaskId)) {
      setDepToast({ message: '⚠️ 无法创建循环依赖', type: 'error' });
      return;
    }

    const newDeps = [...(targetTask.dependencies || []), depDragStart.taskId];
    await trackedDb.tasks.update(targetTaskId, { dependencies: newDeps }, '添加任务依赖');
    setDepToast({ message: `✓ 已建立依赖: ${sourceTask?.title?.slice(0, 15) || '任务'} → ${targetTask.title?.slice(0, 15)}`, type: 'success' });
  };

  // Left panel resizable width — delegated to useLeftPanelResize hook
const { leftPanelCollapsed, setLeftPanelCollapsed, effectiveLpWidth, handleLpResizeStart, isResizing: isLpResizing } = useLeftPanelResize();

  // Resize (edge drag) — delegated to useGanttDrag hook
  const { resizing, handleResizeStart } = useGanttDrag(dayWidth);

  // Move (whole task drag with cascade) — delegated to useTaskMove hook
  const { movingTask, cascadeShifts, handleMoveStart, justMovedRef } = useTaskMove(dayWidth, tasks);

  // Auto-expand all tasks that have children (at any depth) by default
  useEffect(() => {
    if (!tasks) return;
    // Find all task IDs that are parents (i.e., some other task has parentId pointing to them)
    const parentIdSet = new Set<number>();
    tasks.forEach(t => {
      if (t.parentId) parentIdSet.add(t.parentId);
    });
    const allParentIds = Array.from(parentIdSet);
    const currentExpanded = expandedTaskIds;
    // Only add missing parent IDs (don't collapse already expanded ones)
    const needsUpdate = allParentIds.some(id => !currentExpanded.has(id));
    if (needsUpdate) {
      allParentIds.forEach(id => {
        if (!currentExpanded.has(id)) {
          toggleTaskExpansion(id);
        }
      });
    }
  }, [tasks]);

  // Canvas drag to scroll state
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragCanvasStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag if clicking on the background, not on a task or button
    const target = e.target as HTMLElement;
    if (target.closest('button, .task-bar, .task-row-content, .resize-handle, .dep-handle, .group\\/name')) return;
    
    setIsDraggingCanvas(true);
    dragCanvasStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: ganttScrollRef.current?.scrollLeft || 0,
      scrollTop: ganttScrollRef.current?.scrollTop || 0,
    };
    document.body.style.cursor = 'grabbing';
  }, []);

  useEffect(() => {
    if (!isDraggingCanvas) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!ganttScrollRef.current) return;
      const dx = e.clientX - dragCanvasStart.current.x;
      const dy = e.clientY - dragCanvasStart.current.y;
      ganttScrollRef.current.scrollLeft = dragCanvasStart.current.scrollLeft - dx;
      ganttScrollRef.current.scrollTop = dragCanvasStart.current.scrollTop - dy;
    };
    const handleMouseUp = () => {
      setIsDraggingCanvas(false);
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCanvas]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; taskId: number;
  } | null>(null);

  React.useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Month groups for header
  const monthGroups = useMemo(() => {
    const groups: { month: string; count: number }[] = [];
    let currentMonth = '';
    days.forEach(day => {
      const m = format(day, 'yyyy年M月', { locale: zhCN });
      if (m !== currentMonth) {
        groups.push({ month: m, count: 1 });
        currentMonth = m;
      } else {
        groups[groups.length - 1].count++;
      }
    });
    return groups;
  }, [days]);

  // Member task summary (leaf tasks only, excluding parent tasks)
  const memberSummary = useMemo(() => {
    if (!resources || !tasks) return [];
    return [...resources].filter(r => r.status !== 'departed').sort(compareResources).map(r => {
      const myTasks = tasks.filter(t => {
        if (!t.assigneeIds?.includes(r.id!)) return false;
        // Exclude parent tasks to avoid double-counting
        const hasChildren = tasks.some(child => child.parentId === t.id);
        return !hasChildren;
      });
      const todo = myTasks.filter(t => t.status === 'todo').length;
      const inProgress = myTasks.filter(t => t.status === 'in_progress').length;
      const done = myTasks.filter(t => t.status === 'done').length;
      const overdue = myTasks.filter(t => t.status !== 'done' && t.endDate && new Date(t.endDate) < today).length;
      return { resource: r, tasks: myTasks, todo, inProgress, done, overdue, total: myTasks.length };
    });
  }, [resources, tasks, today]);

  // Smart display name: when siblings share the same short name, show more context
  const getSmartDisplayName = useCallback((task: Task) => {
    if (groupBy === 'assignee') {
      // In assignee view, show the full task title or parent + child title
      if (!task.parentId || task.parentId < 0) return task.title;
      const parent = tasks?.find(t => t.id === task.parentId);
      if (!parent) return task.title;
      return `${parent.title} - ${task.title}`;
    }
    if (!task.parentId || !tasks) return task.title;
    const siblings = tasks.filter(t => t.parentId === task.parentId && t.id !== task.id);
    const myShort = getShortTaskName(task.title, task);
    const hasDuplicate = siblings.some(s => getShortTaskName(s.title, s) === myShort);
    if (hasDuplicate) {
      // Show full title for disambiguation when siblings have the same short name
      return task.title;
    }
    return myShort;
  }, [tasks, getShortTaskName, groupBy]);

  const handleContextMenu = (e: React.MouseEvent, taskId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  };

  const handleDeleteTask = async (taskId: number) => {
    const ok = await confirmDialog({ title: '删除任务', message: '确定要删除这个任务吗？', type: 'danger', confirmText: '删除' });
    if (ok) {
      const task = await db.tasks.get(taskId);
      await trackedDb.tasks.delete(taskId, '删除任务');
      if (task?.parentId) {
        await syncParentDateRange(task.parentId);
      }
    }
    setContextMenu(null);
  };

  const handleStatusChange = async (taskId: number, status: 'todo' | 'in_progress' | 'done') => {
    const updateData: Partial<Task> = { status };

    if (status === 'done') {
      const today = startOfDay(new Date());
      updateData.completedAt = today;

      // Check if task finished early and has downstream dependents
      const task = await db.tasks.get(taskId);
      if (task && task.endDate && tasks) {
        const plannedEnd = startOfDay(new Date(task.endDate));
        const daysEarly = differenceInDays(plannedEnd, today);

        // Find downstream tasks that depend on this task
        const downstreamTasks = tasks.filter(t =>
          t.dependencies?.includes(taskId) && t.startDate && t.endDate && t.status !== 'done'
        );

        if (daysEarly > 0 && downstreamTasks.length > 0) {
          // Update status first
          await trackedDb.tasks.update(taskId, updateData, `更改任务状态为已完成`);

          // Show custom confirmation modal for cascade
          setEarlyFinishConfirm({
            taskTitle: task.title,
            daysEarly,
            downstreamTasks,
            taskId,
          });
          setContextMenu(null);
          return;
        }
      }
    } else {
      // If reverting from done, clear completedAt
      updateData.completedAt = undefined;
    }

    await trackedDb.tasks.update(taskId, updateData, `更改任务状态为${status === 'todo' ? '待办' : status === 'in_progress' ? '进行中' : '已完成'}`);
    setContextMenu(null);
  };

  // Handle early finish cascade confirmation
  const handleEarlyFinishCascade = async (confirm: boolean) => {
    if (!earlyFinishConfirm || !tasks) {
      setEarlyFinishConfirm(null);
      return;
    }

    if (confirm) {
      const { daysEarly, downstreamTasks } = earlyFinishConfirm;

      // BFS cascade advance downstream tasks
      const shifts = new Map<number, number>();
      const queue = [...downstreamTasks.map(t => t.id!)];
      downstreamTasks.forEach(t => shifts.set(t.id!, -daysEarly));

      // Build dependency graph
      const dependentsMap = new Map<number, Task[]>();
      tasks.forEach(t => {
        t.dependencies?.forEach(depId => {
          if (!dependentsMap.has(depId)) dependentsMap.set(depId, []);
          dependentsMap.get(depId)!.push(t);
        });
      });

      // BFS propagate
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentShift = shifts.get(currentId)!;
        const dependents = dependentsMap.get(currentId) || [];
        for (const dep of dependents) {
          if (!dep.startDate || !dep.endDate || dep.status === 'done') continue;
          const existingShift = shifts.get(dep.id!) || 0;
          if (currentShift < existingShift) {
            shifts.set(dep.id!, currentShift);
            queue.push(dep.id!);
          }
        }
      }

      // Apply all shifts
      const affectedParentIds = new Set<number>();
      for (const [id, shift] of shifts.entries()) {
        const t = tasks.find(t => t.id === id);
        if (t && t.startDate && t.endDate) {
          await trackedDb.tasks.update(id, {
            startDate: addDays(new Date(t.startDate), shift),
            endDate: addDays(new Date(t.endDate), shift)
          }, '级联提前：上游任务提前完成');
          if (t.parentId) affectedParentIds.add(t.parentId);
        }
      }
      // Sync parent date ranges
      for (const pid of affectedParentIds) {
        await syncParentDateRange(pid);
      }
    }

    setEarlyFinishConfirm(null);
  };

  const handleBatchDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    const ok = await confirmDialog({ title: '批量删除', message: `确定要删除选中的 ${selectedTaskIds.size} 个任务吗？子任务也会一并删除。`, type: 'danger', confirmText: '删除' });
    if (ok) {
      const parentIdsToSync = new Set<number>();
      for (const id of selectedTaskIds) {
        const task = await db.tasks.get(id);
        if (task?.parentId) parentIdsToSync.add(task.parentId);
        await trackedDb.tasks.delete(id, '批量删除任务');
      }
      for (const pid of parentIdsToSync) {
        await syncParentDateRange(pid);
      }
      setSelectedTaskIds(new Set());
    }
  };

  const handleBatchManageSave = async () => {
    if (selectedTaskIds.size === 0) return;

    const updates: Partial<Task> = {};
    if (batchStatus) updates.status = batchStatus;
    if (batchPriority) updates.priority = batchPriority;
    if (batchAssigneeId !== '') {
      updates.assigneeIds = batchAssigneeId === -1 ? [] : [batchAssigneeId];
    }

    if (Object.keys(updates).length > 0) {
      for (const id of selectedTaskIds) {
        await trackedDb.tasks.update(id, updates, '批量编辑任务');
      }
    }

    setShowBatchManageModal(false);
    setSelectedTaskIds(new Set());
    setBatchStatus('');
    setBatchPriority('');
    setBatchAssigneeId('');
  };

  // Auto-infer pipeline dependencies for children of a parent task
  const handleAutoInferDeps = async (parentTaskId: number) => {
    const children = await db.tasks.where('parentId').equals(parentTaskId).toArray();
    if (children.length === 0) return;

    // Get resources for role-based pipeline inference
    const allResources = await db.resources.toArray();
    const resourcesForInfer = allResources
      .filter(r => r.id !== undefined)
      .map(r => ({ id: r.id!, role: r.role || '' }));

    const depMap = inferPipelineDependencies(
      children.map(t => ({ id: t.id!, title: t.title, dependencies: t.dependencies || [], assigneeIds: t.assigneeIds || [] })),
      resourcesForInfer
    );

    if (depMap.size === 0) {
      await alertDialog({ title: '未检测到依赖', message: '未检测到可识别的 pipeline 任务类型\n\n支持自动识别的任务类型：\n• 交互设计 → 功能蓝图 / UI设计 / 客户端功能制作\n• UI设计 → Layout / 动效设计\n• Layout → 正式蓝图\n\n识别依据（按优先级）：\n1. 任务标题中的关键词（如 "-UI设计"、"-layout"、"-正式蓝图"）\n2. 任务处理人的角色（如 UI设计师、Layout、交互设计师）', type: 'warning' });
      return;
    }

    // Build a summary of what will be set
    const summaryLines: string[] = [];
    for (const [taskId, deps] of depMap.entries()) {
      const task = children.find(t => t.id === taskId);
      const depNames = deps.map(dId => children.find(t => t.id === dId)?.title || `#${dId}`).join(', ');
      summaryLines.push(`  ${task?.title} ← ${depNames}`);
    }

    const confirmed = await confirmDialog({
      title: '设置依赖关系',
      message: `将为以下子任务自动设置依赖关系：\n\n${summaryLines.join('\n')}\n\n确认应用？`
    });
    if (!confirmed) return;

    for (const [taskId, deps] of depMap.entries()) {
      const existing = children.find(t => t.id === taskId);
      // Merge with existing dependencies (avoid duplicates)
      const merged = Array.from(new Set([...(existing?.dependencies || []), ...deps]));
      await trackedDb.tasks.update(taskId, { dependencies: merged }, '自动推断 pipeline 依赖');
    }
  };

  const handleDoubleClick = (task: Task) => {
    setEditingTaskId(task.id!);
    setEditingTitle(task.title);
  };

  const handleTitleSave = async (taskId: number) => {
    if (editingTitle.trim()) {
      await trackedDb.tasks.update(taskId, { title: editingTitle.trim() }, '重命名任务');
    }
    setEditingTaskId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, taskId: number) => {
    if (e.key === 'Enter') handleTitleSave(taskId);
    else if (e.key === 'Escape') setEditingTaskId(null);
  };

  const handleTaskClick = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();

    // Prevent click from firing after a drag move
    if (justMovedRef.current) return;
    
    // Multi-select: via button toggle mode OR keyboard shortcuts
    if (multiSelectMode || e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        // Recursively get all descendant task IDs
        const getDescendantIds = (parentId: number): number[] => {
          const children = tasks?.filter(t => t.parentId === parentId) || [];
          let ids: number[] = [];
          for (const child of children) {
            if (child.id) {
              ids.push(child.id);
              ids = ids.concat(getDescendantIds(child.id));
            }
          }
          return ids;
        };
        if (next.has(task.id!)) {
          next.delete(task.id!);
          const descendantIds = getDescendantIds(task.id!);
          descendantIds.forEach(id => next.delete(id));
        } else {
          next.add(task.id!);
          const descendantIds = getDescendantIds(task.id!);
          descendantIds.forEach(id => next.add(id));
        }
        return next;
      });
      return;
    }

    // Clear selection on normal click
    if (selectedTaskIds.size > 0) {
      setSelectedTaskIds(new Set());
    }

    if (e.detail === 1) {
      // Virtual group headers (module groups, status groups): toggle expand/collapse instead of opening edit modal
      if (task.id! < 0 && (task as any)._groupRoots) {
        toggleTaskExpansion(task.id!);
        return;
      }
      // If task has an external URL, single click opens the link
      if (task.externalUrl) {
        clickTimer.current = setTimeout(() => {
          window.open(task.externalUrl, '_blank', 'noopener,noreferrer');
        }, 250);
      } else {
        clickTimer.current = setTimeout(() => { openTaskModal(task.id); }, 250);
      }
    } else if (e.detail === 2) {
      if (clickTimer.current) clearTimeout(clickTimer.current);
      handleDoubleClick(task);
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId.toString());
  };

  const handleDrop = async (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData('text/plain'));
    if (!taskId) return;
    const task = await db.tasks.get(taskId);
    if (!task) return;

    const duration = (task.startDate && task.endDate) ? differenceInDays(task.endDate, task.startDate) : 0;
    const newStartDate = day;
    const newEndDate = addDays(day, duration);
    const daysShifted = task.startDate ? differenceInDays(newStartDate, task.startDate) : 0;

    const hasConflict = task.dependencies.some(depId => {
      const dep = tasks?.find(t => t.id === depId);
      return dep && dep.endDate && newStartDate < dep.endDate;
    });

    if (hasConflict) {
      setConflictTaskId(taskId);
      setTimeout(() => setConflictTaskId(null), 2000);
    } else {
      await trackedDb.tasks.update(taskId, { startDate: newStartDate, endDate: newEndDate }, '拖拽移动任务排期');
      if (daysShifted !== 0) {
        const dependentTasks = tasks?.filter(t => t.dependencies.includes(taskId)) || [];
        if (dependentTasks.length > 0) {
          const shouldShift = await confirmDialog({ title: '顺延依赖任务', message: `该任务有 ${dependentTasks.length} 个后置依赖任务。是否将它们自动顺延 ${daysShifted} 天？` });
          if (shouldShift) {
            for (const depTask of dependentTasks) {
              if (!depTask.startDate || !depTask.endDate) continue; // Skip unscheduled
              await trackedDb.tasks.update(depTask.id!, { 
                startDate: addDays(depTask.startDate, daysShifted), 
                endDate: addDays(depTask.endDate, daysShifted) 
              }, '自动顺延依赖任务');
            }
          }
        }
      }
    }
    setDraggingTaskId(null);
  };

  const getChildren = (parentId: number) => {
    if (groupBy === 'assignee') {
      if (parentId < 0) {
        if (parentId === -9999) {
          return (tasks?.filter(t => !t.assigneeIds || t.assigneeIds.length === 0) || [])
            .sort((a, b) => (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity));
        } else {
          const resourceId = -parentId;
          return (tasks?.filter(t => t.assigneeIds?.includes(resourceId)) || [])
            .sort((a, b) => (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity));
        }
      }
      return []; // In assignee view, tasks don't have children
    }
    return (tasks?.filter(t => t.parentId === parentId) || [])
      .sort((a, b) => (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0));
  };

  // --- Row reorder handlers ---
  const handleReorderDragStart = useCallback((e: React.DragEvent, taskId: number) => {
    setReorderDragId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-gantt-reorder', taskId.toString());
    // Create a minimal drag image
    const dragEl = e.currentTarget.closest('[data-task-row]') as HTMLElement;
    if (dragEl) {
      e.dataTransfer.setDragImage(dragEl, 20, 20);
    }
  }, []);

  const handleReorderDragOver = useCallback((e: React.DragEvent, taskId: number) => {
    if (!reorderDragId || reorderDragId === taskId) {
      setReorderDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Determine if dropping before or after based on mouse Y position within the row
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';
    setReorderDropTarget({ taskId, position });
  }, [reorderDragId]);

  const handleReorderDragLeave = useCallback(() => {
    // Small delay to prevent flicker when moving between rows
  }, []);

  const handleReorderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (!reorderDragId || !reorderDropTarget || !tasks) {
      setReorderDragId(null);
      setReorderDropTarget(null);
      return;
    }

    const draggedTask = tasks.find(t => t.id === reorderDragId);
    const targetTask = tasks.find(t => t.id === reorderDropTarget.taskId);
    if (!draggedTask || !targetTask) {
      setReorderDragId(null);
      setReorderDropTarget(null);
      return;
    }

    // Only allow reorder within the same parent group
    if (draggedTask.parentId !== targetTask.parentId) {
      setReorderDragId(null);
      setReorderDropTarget(null);
      return;
    }

    // Get siblings in current order
    const parentId = draggedTask.parentId;
    const siblings = parentId
      ? tasks.filter(t => t.parentId === parentId).sort((a, b) => (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0))
      : tasks.filter(t => !t.parentId).sort((a, b) => (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0));

    // Remove dragged task from list
    const reordered = siblings.filter(t => t.id !== reorderDragId);
    // Find target index
    const targetIdx = reordered.findIndex(t => t.id === reorderDropTarget.taskId);
    const insertIdx = reorderDropTarget.position === 'before' ? targetIdx : targetIdx + 1;
    reordered.splice(insertIdx, 0, draggedTask);

    // Build batch updates with new sortOrder
    const updates = reordered.map((t, i) => ({
      id: t.id!,
      changes: { sortOrder: i * 10 } as Partial<Task>,
    }));

    await trackedDb.tasks.bulkUpdate(updates, '拖拽调整任务排序');

    setReorderDragId(null);
    setReorderDropTarget(null);
  }, [reorderDragId, reorderDropTarget, tasks]);

  const handleReorderDragEnd = useCallback(() => {
    setReorderDragId(null);
    setReorderDropTarget(null);
  }, []);

  // Filter root tasks by selected member, sorted by sortOrder
  const rootTasks = useMemo(() => {
    if (groupBy === 'assignee') {
      if (!tasks || !resources) return [];
      const groupedRoots: Task[] = [];
      
      // Sort resources by role order before building groups
      const sortedRes = [...resources].filter(r => r.status !== 'departed').sort(compareResources);
      sortedRes.forEach(resource => {
        const resourceTasks = tasks.filter(t => t.assigneeIds?.includes(resource.id!));
        if (resourceTasks.length > 0) {
          const scheduledRT = resourceTasks.filter(t => t.startDate && t.endDate);
          const minStart = scheduledRT.length > 0 ? new Date(Math.min(...scheduledRT.map(t => t.startDate!.getTime()))) : new Date();
          const maxEnd = scheduledRT.length > 0 ? new Date(Math.max(...scheduledRT.map(t => t.endDate!.getTime()))) : new Date();
          
          groupedRoots.push({
            id: -resource.id!, // Negative ID for resource parent
            title: resource.name,
            status: 'in_progress',
            priority: 'medium',
            startDate: minStart,
            endDate: maxEnd,
            progress: 0,
            dependencies: [],
            type: 'resource',
            projectId: 1,
            assigneeIds: [resource.id!],
          });
        }
      });

      // Unassigned tasks
      const unassignedTasks = tasks.filter(t => !t.assigneeIds || t.assigneeIds.length === 0);
      if (unassignedTasks.length > 0) {
        const scheduledUA = unassignedTasks.filter(t => t.startDate && t.endDate);
        const minStart = scheduledUA.length > 0 ? new Date(Math.min(...scheduledUA.map(t => t.startDate!.getTime()))) : new Date();
        const maxEnd = scheduledUA.length > 0 ? new Date(Math.max(...scheduledUA.map(t => t.endDate!.getTime()))) : new Date();
        groupedRoots.push({
          id: -9999,
          title: '未分配',
          status: 'todo',
          priority: 'medium',
          startDate: minStart,
          endDate: maxEnd,
          progress: 0,
          dependencies: [],
          type: 'resource',
          projectId: 1,
        });
      }
      return groupedRoots;
    }

    const allRoots = tasks?.filter(t => !t.parentId) || [];
    const rootGroups = new Map<number, number>();
    allRoots.forEach(root => {
      const children = tasks?.filter(t => t.parentId === root.id!) || [];
      if (children.length > 0) {
        const isCompleted = root.status === 'done' || children.every(c => c.status === 'done');
        rootGroups.set(root.id!, isCompleted ? 1 : 3);
      } else {
        rootGroups.set(root.id!, 2);
      }
    });
    allRoots.sort((a, b) => {
      const groupA = rootGroups.get(a.id!) ?? 2;
      const groupB = rootGroups.get(b.id!) ?? 2;
      if (groupA !== groupB) {
        return groupA - groupB;
      }
      return (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0);
    });

    // Apply status filter
    const matchesFilter = (status: string) => {
      if (filterStatus === 'paused') return status === 'paused';
      // By default, hide paused tasks unless explicitly filtering for them
      if (status === 'paused' && filterStatus !== 'show_all') return false;
      if (filterStatus === 'all' || filterStatus === 'show_all' || filterStatus === 'collapse_done' || filterStatus === 'group_module') return true;
      if (filterStatus === 'active') return status === 'todo' || status === 'in_progress';
      return status === filterStatus;
    };

    const filteredRoots = (filterStatus === 'all' || filterStatus === 'show_all' || filterStatus === 'collapse_done' || filterStatus === 'group_module') ? allRoots.filter(root => {
      // In default views, hide paused tasks (unless show_all)
      if (filterStatus !== 'show_all' && root.status === 'paused') {
        const children = tasks?.filter(t => t.parentId === root.id!) || [];
        return children.some(child => child.status !== 'paused');
      }
      return true;
    }) : allRoots.filter(root => {
      // Parent task: show if itself matches OR any child matches
      if (matchesFilter(root.status)) return true;
      const children = tasks?.filter(t => t.parentId === root.id!) || [];
      return children.some(child => matchesFilter(child.status));
    });

    let memberFilteredRoots = filteredRoots;
    if (selectedMemberId) {
      // Recursively check if any descendant (at any depth) is assigned to the member
      const hasDescendantWithMember = (parentId: number): boolean => {
        const children = tasks?.filter(t => t.parentId === parentId) || [];
        return children.some(child =>
          child.assigneeIds?.includes(selectedMemberId!) ||
          hasDescendantWithMember(child.id!)
        );
      };
      // Show root tasks where the member is assigned to the root or any descendant
      memberFilteredRoots = filteredRoots.filter(root => {
        if (root.assigneeIds?.includes(selectedMemberId)) return true;
        return hasDescendantWithMember(root.id!);
      });
    }

    // Helper: infer effective status of a parent task based on its children
    const inferParentStatus = (root: Task): string => {
      const children = tasks?.filter(t => t.parentId === root.id!) || [];
      if (children.length === 0) return root.status;
      const allDone = children.every(c => c.status === 'done');
      if (allDone) return 'done';
      const hasInProgress = children.some(c => c.status === 'in_progress');
      if (hasInProgress) return 'in_progress';
      // If some children are done but not all, and none in_progress, treat as in_progress too
      const someDone = children.some(c => c.status === 'done');
      if (someDone) return 'in_progress';
      return root.status;
    };

    // For collapse_done: group by status (进行中 / 待办 / 已完成)
    if (filterStatus === 'collapse_done') {
      const inProgressRoots: Task[] = [];
      const todoRoots: Task[] = [];
      const doneRoots: Task[] = [];

      memberFilteredRoots.forEach(root => {
        const effectiveStatus = inferParentStatus(root);
        if (effectiveStatus === 'done') doneRoots.push(root);
        else if (effectiveStatus === 'in_progress') inProgressRoots.push(root);
        else todoRoots.push(root);
      });

      const result: Task[] = [];

      // Group: In Progress
      if (inProgressRoots.length > 0) {
        const inProgressGroup: Task = {
          id: -88801,
          title: `\u{1F7E2} \u8FDB\u884C\u4E2D (${inProgressRoots.length})`,
          status: 'in_progress',
          priority: '' as any,
          progress: 0,
          dependencies: [],
          type: 'task',
          projectId: 1,
        };
        (inProgressGroup as any)._groupRoots = inProgressRoots;
        result.push(inProgressGroup);
      }

      // Group: Todo
      if (todoRoots.length > 0) {
        const todoGroup: Task = {
          id: -88802,
          title: `\u{1F535} \u5F85\u529E (${todoRoots.length})`,
          status: 'todo',
          priority: '' as any,
          progress: 0,
          dependencies: [],
          type: 'task',
          projectId: 1,
        };
        (todoGroup as any)._groupRoots = todoRoots;
        result.push(todoGroup);
      }

      // Group: Done (always at bottom)
      if (doneRoots.length > 0) {
        const doneGroup: Task = {
          id: -88888,
          title: `\u2705 \u5DF2\u5B8C\u6210 (${doneRoots.length})`,
          status: 'done',
          priority: '' as any,
          progress: 100,
          dependencies: [],
          type: 'task',
          projectId: 1,
        };
        (doneGroup as any)._groupRoots = doneRoots;
        result.push(doneGroup);
      }

      return result.length > 0 ? result : memberFilteredRoots;
    }

    // Module grouping mode: group tasks by their module field
    if (filterStatus === 'group_module') {
      const moduleMap = new Map<string, Task[]>();
      const noModuleTasks: Task[] = [];

      memberFilteredRoots.forEach(root => {
        const moduleName = root.module || '';
        if (moduleName) {
          if (!moduleMap.has(moduleName)) {
            moduleMap.set(moduleName, []);
          }
          moduleMap.get(moduleName)!.push(root);
        } else {
          noModuleTasks.push(root);
        }
      });

      const result: Task[] = [];
      let groupIdCounter = -77700;

      // Sort modules alphabetically
      const sortedModules = Array.from(moduleMap.keys()).sort();

      for (const moduleName of sortedModules) {
        const moduleTasks = moduleMap.get(moduleName)!;
        // Count stats for this module
        const totalTasks = moduleTasks.reduce((sum, root) => {
          const children = tasks?.filter(t => t.parentId === root.id!) || [];
          return sum + 1 + children.length;
        }, 0);
        const doneTasks = moduleTasks.reduce((sum, root) => {
          const children = tasks?.filter(t => t.parentId === root.id!) || [];
          const rootDone = root.status === 'done' ? 1 : 0;
          const childDone = children.filter(c => c.status === 'done').length;
          return sum + rootDone + childDone;
        }, 0);

        const moduleGroup: Task = {
          id: groupIdCounter--,
          title: `📦 ${moduleName} (${moduleTasks.length}个需求, ${doneTasks}/${totalTasks}完成)`,
          status: doneTasks === totalTasks ? 'done' : 'in_progress',
          priority: '' as any,
          progress: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
          dependencies: [],
          type: 'task',
          projectId: 1,
          module: moduleName,
        };
        (moduleGroup as any)._groupRoots = moduleTasks;
        result.push(moduleGroup);
      }

      // "未分类" group for tasks without module
      if (noModuleTasks.length > 0) {
        const noModuleGroup: Task = {
          id: groupIdCounter--,
          title: `📋 未分类 (${noModuleTasks.length})`,
          status: 'todo',
          priority: '' as any,
          progress: 0,
          dependencies: [],
          type: 'task',
          projectId: 1,
        };
        (noModuleGroup as any)._groupRoots = noModuleTasks;
        result.push(noModuleGroup);
      }

      return result.length > 0 ? result : memberFilteredRoots;
    }

    // Default ('all') mode: separate done parent tasks into a collapsed "已完成" group at top
    if (filterStatus === 'all') {
      const activeRoots: Task[] = [];
      const doneRoots: Task[] = [];

      memberFilteredRoots.forEach(root => {
        const effectiveStatus = inferParentStatus(root);
        if (effectiveStatus === 'done') doneRoots.push(root);
        else activeRoots.push(root);
      });

      if (doneRoots.length > 0) {
        const result: Task[] = [];

        // "已完成" group placed at top, default collapsed
        const doneGroup: Task = {
          id: -88888,
          title: `\u2705 \u5DF2\u5B8C\u6210 (${doneRoots.length})`,
          status: 'done',
          priority: '' as any,
          progress: 100,
          dependencies: [],
          type: 'task',
          projectId: 1,
        };
        (doneGroup as any)._groupRoots = doneRoots;
        result.push(doneGroup);

        // Then all active (non-done) root tasks
        result.push(...activeRoots);

        return result;
      }
    }

    return memberFilteredRoots;
  }, [tasks, resources, selectedMemberId, groupBy, filterStatus]);

  // Build a flat ordered list of visible task rows for SVG dependency lines
  const visibleTaskRows = useMemo(() => {
    if (!tasks) return [];
    const rows: { task: Task; level: number; rowIndex: number }[] = [];
    let rowIdx = 0;

    if (groupBy === 'assignee') {
      rootTasks.forEach(root => {
        rows.push({ task: root, level: 0, rowIndex: rowIdx++ });
        if (expandedTaskIds.has(root.id!)) {
          let children: Task[] = [];
          if (root.id === -9999) {
            children = tasks.filter(t => !t.assigneeIds || t.assigneeIds.length === 0);
          } else {
            const resourceId = -root.id!;
            children = tasks.filter(t => t.assigneeIds?.includes(resourceId));
          }
          // Sort children by start date (unscheduled tasks go to end)
          children.sort((a, b) => (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity));
          children.forEach(child => {
            // Create a clone of the child task to avoid mutating the original
            // and to set its parentId to the resource root id so that renderTaskRow treats it as a child
            const childClone = { ...child, parentId: root.id };
            rows.push({ task: childClone, level: 1, rowIndex: rowIdx++ });
          });
        }
      });
      return rows;
    }

    // Helper: check if a task matches the current status filter
    const matchesFilter = (status: string) => {
      if (filterStatus === 'all' || filterStatus === 'collapse_done' || filterStatus === 'group_module') return true;
      if (filterStatus === 'active') return status === 'todo' || status === 'in_progress';
      return status === filterStatus;
    };

    const buildRows = (parentTasks: Task[], level: number) => {
      parentTasks.forEach(task => {
        rows.push({ task, level, rowIndex: rowIdx });
        rowIdx++;
        let children = tasks.filter(t => t.parentId === task.id)
          .sort((a, b) => (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0));
        // Apply status filter to child tasks
        if (filterStatus !== 'all' && filterStatus !== 'collapse_done' && filterStatus !== 'group_module') {
          children = children.filter(c => matchesFilter(c.status));
        }

        if (children.length > 0 && expandedTaskIds.has(task.id!)) {
          buildRows(children, level + 1);
        }

        // For virtual group headers (collapse_done / group_module): expand root tasks inside the group
        const isVirtualGroup = (task.id! < 0 && (task as any)._groupRoots);
        if (isVirtualGroup && expandedTaskIds.has(task.id!)) {
          const groupRoots = (task as any)._groupRoots as Task[];
          // Use recursive buildRows for group roots to support deep nesting
          buildRows(groupRoots, level + 1);
        }
      });
    };
    buildRows(rootTasks, 0);
    return rows;
  }, [tasks, rootTasks, expandedTaskIds, groupBy, filterStatus]);

  // Search-filtered visible task rows
  const { filteredTaskRows, searchMatchCount } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredTaskRows: visibleTaskRows, searchMatchCount: 0 };
    }
    const query = searchQuery.trim().toLowerCase();
    // Find all task IDs that match the search query
    const matchingIds = new Set<number>();
    visibleTaskRows.forEach(({ task }) => {
      if (task.title.toLowerCase().includes(query)) {
        matchingIds.add(task.id!);
      }
    });
    // Also keep parent rows of matching tasks so structure is preserved
    const keepIds = new Set<number>(matchingIds);
    visibleTaskRows.forEach(({ task }) => {
      if (matchingIds.has(task.id!)) {
        // Walk up to find parent rows to keep
        let parentId = task.parentId;
        while (parentId) {
          keepIds.add(parentId);
          const parent = visibleTaskRows.find(r => r.task.id === parentId);
          parentId = parent?.task.parentId || undefined;
        }
      }
    });
    // Filter rows and re-index
    let newIdx = 0;
    const filtered = visibleTaskRows
      .filter(({ task }) => keepIds.has(task.id!))
      .map(row => ({ ...row, rowIndex: newIdx++ }));
    return { filteredTaskRows: filtered, searchMatchCount: matchingIds.size };
  }, [visibleTaskRows, searchQuery]);

  // Compute SVG dependency lines (Bezier curves)
  const dependencyLines = useMemo(() => {
    if (!tasks || filteredTaskRows.length === 0) return [];
    const ROW_HEIGHT = isCompact ? 32 : 44; // h-11 = 2.75rem = 44px, h-8 = 2rem = 32px
    const DAY_WIDTH = dayWidth;
    const LEFT_PANEL_WIDTH = effectiveLpWidth;
    const lines: DependencyLine[] = [];

    // Map taskId -> rowIndex for visible tasks
    const taskRowMap = new Map<number, number>();
    filteredTaskRows.forEach(({ task }, idx) => {
      taskRowMap.set(task.id!, idx);
    });

    filteredTaskRows.forEach(({ task }) => {
      if (!task.dependencies || task.dependencies.length === 0) return;
      task.dependencies.forEach(depId => {
        const depTask = tasks.find(t => t.id === depId);
        if (!depTask) return;
        if (!depTask.endDate || !task.startDate) return; // Skip lines for unscheduled tasks
        const fromRowIdx = taskRowMap.get(depId);
        const toRowIdx = taskRowMap.get(task.id!);
        if (fromRowIdx === undefined || toRowIdx === undefined) return;

        // Calculate X positions: end of dependency task -> start of current task
        const depEndOffset = differenceInDays(depTask.endDate, startDate) + 1;
        const taskStartOffset = differenceInDays(task.startDate, startDate);

        const fromX = LEFT_PANEL_WIDTH + depEndOffset * DAY_WIDTH;
        const fromY = fromRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 2; // +2 for py-0.5 offset
        const toX = LEFT_PANEL_WIDTH + taskStartOffset * DAY_WIDTH;
        const toY = toRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 2;

        // Detect conflict: downstream starts before upstream ends
        const isConflict = !!(task.startDate && depTask.endDate && task.startDate < depTask.endDate);

        lines.push({ fromX, fromY, toX, toY, isConflict, fromTaskId: depId, toTaskId: task.id! });
      });
    });

    // Ghost dependency lines: show projected dependency arrows based on what-if ghost schedules
    if (ghostSchedules.length > 0) {
      filteredTaskRows.forEach(({ task }) => {
        if (!task.dependencies || task.dependencies.length === 0) return;
        task.dependencies.forEach(depId => {
          const depGhost = ghostSchedules.find(g => g.taskId === depId);
          const taskGhost = ghostSchedules.find(g => g.taskId === task.id!);
          // Only draw ghost line if at least one side has a ghost schedule
          if (!depGhost && !taskGhost) return;

          const depTask = tasks.find(t => t.id === depId);
          if (!depTask) return;

          // Use ghost end date for dep, ghost start date for task (fall back to real dates)
          const depEndDate = depGhost ? depGhost.newEnd : depTask.endDate;
          const taskStartDate = taskGhost ? taskGhost.newStart : task.startDate;
          if (!depEndDate || !taskStartDate) return;

          const fromRowIdx = taskRowMap.get(depId);
          const toRowIdx = taskRowMap.get(task.id!);
          if (fromRowIdx === undefined || toRowIdx === undefined) return;

          const depEndOffset = differenceInDays(depEndDate, startDate) + 1;
          const taskStartOffset = differenceInDays(taskStartDate, startDate);

          const fromX = LEFT_PANEL_WIDTH + depEndOffset * DAY_WIDTH;
          const fromY = fromRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 2;
          const toX = LEFT_PANEL_WIDTH + taskStartOffset * DAY_WIDTH;
          const toY = toRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 2;

          const ghostReason = depGhost?.reason || taskGhost?.reason;
          lines.push({ fromX, fromY, toX, toY, isConflict: false, fromTaskId: depId, toTaskId: task.id!, isGhost: true, ghostReason });
        });
      });
    }

    return lines;
  }, [tasks, filteredTaskRows, startDate, dayWidth, ghostSchedules]);



  // Deadline warning: check if a task is near its deadline (within 2 days) and not done
  // Pre-compute risk assessments for all visible tasks
  const taskRiskMap = useMemo(() => {
    if (!tasks || !resources) return new Map<number, TaskRisk>();
    const map = new Map<number, TaskRisk>();
    for (const task of tasks) {
      if (!task.id || task.status === 'done') continue;
      const risk = assessTaskRisk(task, tasks, resources, today);
      if (risk.level !== 'none') {
        map.set(task.id, risk);
      }
    }
    return map;
  }, [tasks, resources, today]);

  // Count only leaf tasks with risk (exclude parent tasks to avoid double-counting)
  const riskCount = useMemo(() => {
    if (!tasks) return 0;
    let count = 0;
    taskRiskMap.forEach((_, taskId) => {
      const hasChildren = tasks.some(t => t.parentId === taskId);
      if (!hasChildren) count++;
    });
    return count;
  }, [taskRiskMap, tasks]);

  const getDeadlineWarning = useCallback((task: Task): 'overdue' | 'urgent' | null => {
    if (task.status === 'done' || !task.parentId || !task.endDate) return null;
    const daysLeft = differenceInDays(task.endDate, today);
    if (daysLeft < 0) return 'overdue';
    if (daysLeft <= 2) return 'urgent';
    return null;
  }, [today]);

  // Get dominant task type color for a resource based on their assigned tasks
  const getResourceColor = useCallback((resourceId: number) => {
    if (!tasks) return '#5b5fc7'; // default indigo
    const myTasks = tasks.filter(t => t.assigneeIds?.includes(resourceId) && t.parentId);
    if (myTasks.length === 0) return '#5b5fc7';
    // Count task types and pick the most frequent
    const colorCount = new Map<string, number>();
    myTasks.forEach(t => {
      const tc = getTaskTypeColor(t.title);
      colorCount.set(tc.color, (colorCount.get(tc.color) || 0) + 1);
    });
    let maxColor = '#5b5fc7';
    let maxCount = 0;
    colorCount.forEach((count, color) => {
      if (count > maxCount) { maxCount = count; maxColor = color; }
    });
    return maxColor;
  }, [tasks]);

  const renderAvatarGroup = (assigneeIds?: number[], taskTitle?: string) => {
    if (!assigneeIds || assigneeIds.length === 0) return null;
    const assignedResources = assigneeIds.map(id => resources?.find(r => r.id === id)).filter(Boolean);
    // Sort by role order (UX→UI→Layout→…)
    assignedResources.sort((a, b) => getRoleOrderIndex(a?.role || '') - getRoleOrderIndex(b?.role || ''));
    const maxDisplay = 3;
    const displayResources = assignedResources.slice(0, maxDisplay);
    const remainingCount = assignedResources.length - maxDisplay;

    return (
      <div className="flex -space-x-1.5 overflow-visible ml-2 shrink-0">
        {displayResources.map((r, idx) => (
          <div key={r?.id} style={{ zIndex: assignedResources.length - idx }} className="relative">
            <Avatar
              name={r?.name || '?'}
              size="sm"
              type={(r?.type as 'internal' | 'cp') || 'internal'}
              avatar={r?.avatar}
              avatarStyle={r?.avatarStyle}
              role={r?.role}
              tooltip={r ? `${r.name}${r.role ? ' · ' + r.role : ''}${r.type === 'cp' ? ' (CP)' : ''}${(() => { const s = getEffectiveStatus(r); return s === 'wfh' ? ' (居家)' : s === 'sick' ? ' (欠佳)' : s === 'leave' ? ' (休假)' : s === 'focus' ? ' (专注)' : ''; })()}` : undefined}
              className="transition-transform duration-200 hover:scale-110"
            />
            {/* Status indicator dot */}
            {(() => { const effStatus = r ? getEffectiveStatus(r) : undefined; return effStatus && effStatus !== 'active' ? (
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#12141e] ${
                effStatus === 'wfh' ? 'bg-blue-400' :
                effStatus === 'sick' ? 'bg-orange-400' :
                effStatus === 'leave' ? 'bg-purple-400' :
                effStatus === 'focus' ? 'bg-red-400' : ''
              }`} />
            ) : null; })()}
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="inline-flex h-7 w-7 rounded-lg ring-1 ring-white/10 bg-gray-700/80 items-center justify-center text-xs font-bold text-gray-300 shadow-sm" style={{ zIndex: 0 }}>
            +{remainingCount}
          </div>
        )}
      </div>
    );
  };

  const renderTaskTooltip = (task: Task, displayStartDate: Date, displayEndDate: Date) => {
    const assignedNames = task.assigneeIds?.map(id => resources?.find(r => r.id === id)?.name).filter(Boolean) || [];
    const config = getStatusConfig(task.status);
    const typeColor = task.parentId ? getTaskTypeColor(task.title) : null;
    const risk = taskRiskMap.get(task.id!);

    // Use a wrapper that detects position relative to viewport and flips direction
    return (
      <div 
        className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200"
        ref={(el) => {
          if (!el) return;
          // Detect if near viewport bottom and flip tooltip direction
          const rect = el.parentElement?.getBoundingClientRect();
          if (rect) {
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceAbove < 120 && spaceBelow > 120) {
              // Flip to below the bar
              el.style.top = '100%';
              el.style.bottom = 'auto';
              el.style.marginTop = '8px';
              el.style.marginBottom = '0';
              // Flip the arrow
              const arrow = el.querySelector('[data-tooltip-arrow]') as HTMLElement;
              if (arrow) {
                arrow.style.top = '-4px';
                arrow.style.bottom = 'auto';
                arrow.className = 'absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-700';
              }
            } else {
              // Default: above the bar
              el.style.bottom = '100%';
              el.style.top = 'auto';
              el.style.marginBottom = '8px';
              el.style.marginTop = '0';
            }
          }
        }}
      >
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl px-3 py-2 min-w-[180px] text-left">
          <div className="text-xs font-semibold text-white mb-1.5 truncate max-w-[200px] flex items-center gap-1.5">
            {typeColor && <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: typeColor.color }} />}
            {task.title}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
              <Clock size={10} />
              <span>{format(displayStartDate, 'MM/dd')} - {format(displayEndDate, 'MM/dd')}</span>
              <span className="text-gray-600">({differenceInDays(displayEndDate, displayStartDate) + 1}天)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <Flag size={10} />
              <span>{config.label}</span>
              {typeColor && <span className="text-gray-600">· {typeColor.label}</span>}
            </div>
            {assignedNames.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <Users size={10} />
                <span>{assignedNames.join('、')}</span>
              </div>
            )}
            {/* Risk warnings */}
            {risk && risk.riskReasons && risk.riskReasons.length > 0 && (
              <div className="mt-1 pt-1 border-t border-gray-700/50 space-y-0.5">
                {risk.riskReasons.map((rr, i) => {
                  const tagIcon = rr.tag === 'overdue' ? '🔴' : rr.tag === 'deadline' ? '⏰' : rr.tag === 'dependency' ? '🔗' : rr.tag === 'overload' ? '📊' : rr.tag === 'overlap' ? '📋' : rr.tag === 'blocked' ? '🚫' : rr.tag === 'progress' ? '📉' : '⚠️';
                  return (
                    <div key={i} className={`flex items-center gap-1 text-[10px] ${
                      rr.severity === 'critical' ? 'text-red-400' :
                      rr.severity === 'high' ? 'text-orange-400' :
                      rr.severity === 'medium' ? 'text-amber-400' : 'text-yellow-400'
                    }`}>
                      <span className="shrink-0 text-[8px]">{tagIcon}</span>
                      <span>{rr.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div data-tooltip-arrow className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700"></div>
        </div>
      </div>
    );
  };

  const renderTaskRow = (task: Task, level: number, rowIndex: number) => {
    // Check if this is a virtual status group row (进行中/待办/已完成)
    const isStatusGroup = [(-88801), (-88802), (-88888)].includes(task.id!);
    
    const children = isStatusGroup ? [] : getChildren(task.id!);
    const hasChildren = isStatusGroup 
      ? true  // Status groups are always expandable
      : children.length > 0;
    const isExpanded = expandedTaskIds.has(task.id!);
    const isChildTask = groupBy === 'assignee' ? task.id! > 0 : !!task.parentId;

    let displayStartDate = task.startDate;
    let displayEndDate = task.endDate;
    
    if (hasChildren) {
      // Recursively collect ALL descendant dates for accurate parent bracket
      const collectAllDescendantDates = (parentId: number): { starts: number[]; ends: number[] } => {
        const directChildren = getChildren(parentId);
        let starts: number[] = [];
        let ends: number[] = [];
        directChildren.forEach(c => {
          if (c.startDate) starts.push(startOfDay(new Date(c.startDate)).getTime());
          if (c.endDate) ends.push(startOfDay(new Date(c.endDate)).getTime());
          // Recurse into grandchildren
          const nested = collectAllDescendantDates(c.id!);
          starts = starts.concat(nested.starts);
          ends = ends.concat(nested.ends);
        });
        return { starts, ends };
      };
      const { starts, ends } = collectAllDescendantDates(task.id!);
      if (starts.length > 0) {
        displayStartDate = new Date(Math.min(...starts));
        displayEndDate = new Date(Math.max(...ends));
      }
    }

    const hasValidDates = !!(displayStartDate && displayEndDate);
    const startOffset = hasValidDates ? differenceInDays(displayStartDate!, startDate) : 0;
    const duration = hasValidDates ? differenceInDays(displayEndDate!, displayStartDate!) + 1 : 0;
    const isConflict = conflictTaskId === task.id;
    const isHighlighted = highlightedTaskIds.includes(task.id!);
    const isHovered = hoveredTaskId === task.id;
    const config = getStatusConfig(task.status);
    const typeColor = isChildTask ? getTaskTypeColor(task.title) : null;

    // Progress width: use task.progress (0-100) for real percentage
    const getProgressPercent = (t: Task): number => {
      if (t.status === 'done') return 100;
      if (t.status === 'todo') return 0;
      return Math.min(100, Math.max(0, t.progress || 0));
    };

    const isDragSource = reorderDragId === task.id;
    const isDropBefore = reorderDropTarget?.taskId === task.id && reorderDropTarget?.position === 'before';
    const isDropAfter = reorderDropTarget?.taskId === task.id && reorderDropTarget?.position === 'after';
    const isSearchMatch = searchQuery.trim() && task.title.toLowerCase().includes(searchQuery.trim().toLowerCase());

    const rowHeightClass = isCompact ? 'h-8' : 'h-11';
    const barHeightClass = isCompact ? 'h-6' : 'h-8';
    const barTopClass = isCompact ? 'top-1' : 'top-1.5';

    return (
      <React.Fragment key={task.id}>
        <div 
          data-task-row={task.id}
          className={`flex items-center group transition-all duration-150 relative w-full ${
            isDragSource ? 'opacity-70 scale-[0.99] z-50 shadow-2xl bg-indigo-500/10 ring-1 ring-indigo-500/30' :
            isSearchMatch ? 'bg-amber-500/10 ring-1 ring-amber-500/20' :
            isHighlighted ? 'bg-amber-500/15 shadow-[inset_0_0_20px_rgba(245,158,11,0.15)]' : 
            isHovered ? 'bg-indigo-500/8' :
            rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'
          }`}
          onContextMenu={(e) => handleContextMenu(e, task.id!)}
          onMouseEnter={() => setHoveredTaskId(task.id!)}
          onMouseLeave={() => setHoveredTaskId(null)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-gantt-reorder')) {
              handleReorderDragOver(e, task.id!);
            }
          }}
          onDragLeave={handleReorderDragLeave}
          onDrop={(e) => {
            if (e.dataTransfer.types.includes('application/x-gantt-reorder')) {
              handleReorderDrop(e);
            }
          }}
        >
          {/* Drop indicator line — before */}
          {isDropBefore && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-indigo-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,0.6)]">
              <div className="absolute -left-0.5 -top-[3px] w-2 h-2 rounded-full bg-indigo-400 shadow-lg" />
            </div>
          )}
          {/* Left panel: task name — STICKY safe zone */}
          <div className="shrink-0 text-sm text-gray-300 px-3 py-2.5 border-r-2 border-gray-700/80 flex items-center justify-between group/name sticky left-0 z-20 bg-[#12141e]/80 backdrop-blur-md"
            style={{ width: `${effectiveLpWidth}px`, boxShadow: '6px 0 16px rgba(0,0,0,0.5)' }}
          >
            <div className="flex items-center truncate min-w-0" style={{ paddingLeft: `${level * 1.25}rem` }}>
              {/* Multi-select checkbox */}
              {multiSelectMode && (
                <label className="shrink-0 cursor-pointer mr-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.has(task.id!)}
                    onChange={() => {
                      setSelectedTaskIds(prev => {
                        const next = new Set(prev);
                        // Recursively get all descendant task IDs
                        const getDescendantIds = (parentId: number): number[] => {
                          const children = tasks?.filter(t => t.parentId === parentId) || [];
                          let ids: number[] = [];
                          for (const child of children) {
                            if (child.id) {
                              ids.push(child.id);
                              ids = ids.concat(getDescendantIds(child.id));
                            }
                          }
                          return ids;
                        };
                        if (next.has(task.id!)) {
                          // Deselect: remove self and all descendants
                          next.delete(task.id!);
                          const descendantIds = getDescendantIds(task.id!);
                          descendantIds.forEach(id => next.delete(id));
                        } else {
                          // Select: add self and all descendants
                          next.add(task.id!);
                          const descendantIds = getDescendantIds(task.id!);
                          descendantIds.forEach(id => next.add(id));
                        }
                        return next;
                      });
                    }}
                    className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer w-3.5 h-3.5"
                  />
                </label>
              )}
              {/* Drag handle for reorder */}
              <div
                draggable
                onDragStart={(e) => handleReorderDragStart(e, task.id!)}
                onDragEnd={handleReorderDragEnd}
                className="mr-1 flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-indigo-500/10"
                title="拖拽排序"
              >
                <GripVertical size={12} />
              </div>
              {hasChildren ? (
                <button 
                  onClick={() => toggleTaskExpansion(task.id!)}
                  className="mr-1.5 text-gray-500 hover:text-indigo-400 transition-colors flex-shrink-0 p-0.5 rounded hover:bg-indigo-500/10"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-[22px] inline-block flex-shrink-0"></span>
              )}
              {/* Color dot: use status color for both child and parent tasks to maintain consistency */}
              {isChildTask ? (
                <span className={`w-2.5 h-2.5 rounded-sm mr-2 shrink-0 ${
                  getDeadlineWarning(task) === 'overdue' ? 'bg-red-400' :
                  task.status === 'done' ? 'bg-emerald-400' : 
                  task.status === 'in_progress' ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'
                }`} title={`状态: ${
                  getDeadlineWarning(task) === 'overdue' ? '逾期' :
                  task.status === 'done' ? '已完成' : 
                  task.status === 'in_progress' ? '进行中' : '未开始'
                }`} />
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${
                  getDeadlineWarning(task) === 'overdue' ? 'bg-red-400' :
                  task.status === 'done' ? 'bg-emerald-400' : 
                  task.status === 'in_progress' ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'
                }`} title={`状态: ${
                  getDeadlineWarning(task) === 'overdue' ? '逾期' :
                  task.status === 'done' ? '已完成' : 
                  task.status === 'in_progress' ? '进行中' : '未开始'
                }`} />
              )}
              {editingTaskId === task.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleTitleSave(task.id!)}
                  onKeyDown={(e) => handleKeyDown(e, task.id!)}
                  className="bg-gray-800 text-white text-base font-medium px-2 py-1 rounded border border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[280px] transition-all duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className={`cursor-pointer truncate select-none transition-all duration-200 flex items-center gap-1.5 text-sm ${
                    hasChildren ? 'font-bold text-gray-100 hover:text-white' : 
                    task.status === 'done' ? 'text-emerald-400/80 hover:text-emerald-300' :
                    task.status === 'in_progress' ? (task.externalUrl ? 'text-blue-400/90 hover:text-blue-200 hover:underline' : 'text-blue-400/90 hover:text-blue-200') :
                    task.externalUrl ? 'text-blue-400/90 hover:text-blue-200 hover:underline' : 'hover:text-indigo-200'
                  }`}
                  onClick={(e) => handleTaskClick(e, task)}
                  title={task.externalUrl 
                    ? `点击跳转：${task.externalUrl}\n双击重命名` 
                    : isChildTask ? task.title : '单击打开详情，双击快速重命名'}
                >
                  {isChildTask ? getSmartDisplayName(task) : task.title}
                  {task.externalUrl && (
                    <ExternalLink size={12} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" />
                  )}
                </span>
              )}
              {/* Schedule conflict warning icon */}
              {scheduleConflicts.has(task.id!) && (
                <span 
                  className="ml-1 shrink-0 text-red-400 animate-pulse cursor-help"
                  title={scheduleConflicts.get(task.id!)}
                >
                  <AlertTriangle size={13} />
                </span>
              )}
              {/* Risk indicator icon — shows for tasks with auto-alert risks (not already showing conflict) */}
              {!scheduleConflicts.has(task.id!) && (() => {
                const risk = taskRiskMap.get(task.id!);
                if (!risk || !risk.shouldAutoAlert) return null;
                const riskTitle = risk.riskReasons?.map(r => r.text).join('\n') || '存在风险';
                return (
                  <span 
                    className={`ml-1 shrink-0 cursor-help ${
                      risk.level === 'critical' ? 'text-red-400 animate-pulse' :
                      risk.level === 'high' ? 'text-orange-400' : 'text-amber-400'
                    }`}
                    title={riskTitle}
                    onClick={(e) => { e.stopPropagation(); setShowRiskPanel(true); }}
                  >
                    <AlertCircle size={13} />
                  </span>
                );
              })()}
            </div>
            <div 
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                // Default popover width ≈ 260, height ≈ 360; clamp into viewport
                const popW = 260;
                const popH = 360;
                let top = rect.bottom + 6;
                let left = rect.right - popW;
                if (top + popH > window.innerHeight - 8) top = Math.max(8, rect.top - popH - 6);
                if (left < 8) left = 8;
                if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
                setAssigneePopover({ taskId: task.id!, top, left });
              }}
              title="点击修改负责人"
            >
              {renderAvatarGroup(task.assigneeIds, isChildTask ? task.title : undefined)}
            </div>
          </div>

          {/* Right panel: gantt bars */}
          <div className={`flex-1 flex relative ${rowHeightClass} w-max`} onDragOver={e => e.preventDefault()}>
            {days.map(day => {
              const isToday = differenceInDays(day, today) === 0;
              const isDayWeekend = isWeekend(day);
              const isDayHoliday = isHoliday(day);
              return (
                <div 
                  key={day.toISOString()} 
                  className={`shrink-0 border-l border-gray-800/10 ${
                    isToday ? 'bg-indigo-500/[0.08]' : 
                    isDayHoliday ? 'gantt-holiday-col' :
                    isDayWeekend ? 'gantt-weekend-col' : ''
                  }`}
                  style={{ width: `${dayWidth}px` }}
                  onDrop={e => !hasChildren && handleDrop(e, day)}
                />
              );
            })}
            
            {/* Ghost schedule overlay */}
            {ghostSchedules.length > 0 && (() => {
              const ghost = ghostSchedules.find(g => g.taskId === task.id);
              if (!ghost) return null;
              const ghostStartOffset = differenceInDays(ghost.newStart, startDate);
              const ghostDuration = differenceInDays(ghost.newEnd, ghost.newStart) + 1;
              if (ghostStartOffset >= days.length || ghostStartOffset + ghostDuration < 0) return null;
              const typeColor = getTaskTypeColor(task.title);
              return (
                <div
                  className={`absolute ${barTopClass} ${barHeightClass} rounded-[5px] border-2 border-dashed pointer-events-none z-10`}
                  style={{
                    left: `${ghostStartOffset * dayWidth + 1}px`,
                    width: `${Math.max(ghostDuration, 1) * dayWidth - 2}px`,
                    borderColor: ghost.isTrigger ? '#a78bfa' : '#fbbf24',
                    backgroundColor: ghost.isTrigger ? 'rgba(167, 139, 250, 0.12)' : 'rgba(251, 191, 36, 0.08)',
                    animation: 'ghostPulse 2s ease-in-out infinite',
                  }}
                  title={`推演: ${format(ghost.newStart, 'MM/dd')} - ${format(ghost.newEnd, 'MM/dd')} (${ghost.reason})`}
                >
                  <div className="absolute -top-4 left-0 text-[8px] font-medium px-1 rounded" style={{
                    color: ghost.isTrigger ? '#c4b5fd' : '#fde68a',
                    backgroundColor: ghost.isTrigger ? 'rgba(139, 92, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)',
                  }}>
                    {ghost.deltaDays > 0 ? '+' : ''}{ghost.deltaDays}天
                  </div>
                </div>
              );
            })()}

            {/* Task bar */}
            {hasValidDates && startOffset >= -duration && startOffset < days.length && (
              hasChildren ? (
                /* Parent task bracket or Resource Heatmap */
                groupBy === 'assignee' && task.id! < 0 ? (
                  <div className="absolute top-1/2 -translate-y-1/2 h-1 flex items-center" style={{ left: 0, width: `${days.length * dayWidth}px` }}>
                    {days.map((day, i) => {
                      const resourceId = -task.id!;
                      const resourceTasks = tasks?.filter(t => t.assigneeIds?.includes(resourceId) && t.startDate && t.endDate && day >= startOfDay(new Date(t.startDate)) && day <= startOfDay(new Date(t.endDate))) || [];
                      const count = resourceTasks.length;
                      if (count === 0) return null;
                      
                      let colorClass = 'bg-emerald-500';
                      if (count === 2) colorClass = 'bg-amber-500';
                      else if (count >= 3) colorClass = 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]';
                      
                      return (
                        <div 
                          key={i} 
                          className={`absolute h-full rounded-full ${colorClass}`}
                          style={{ left: `${i * dayWidth}px`, width: `${dayWidth}px` }}
                          title={`${format(day, 'MM/dd')}: ${count} 个任务`}
                        />
                      );
                    })}
                  </div>
                ) : (
                <div
                  className={`absolute top-2 ${isCompact ? 'h-5' : 'h-7'} flex items-center transition-all group/bar cursor-pointer`}
                  style={{
                    left: `${startOffset * dayWidth + 1}px`,
                    width: `${Math.max(duration, 1) * dayWidth - 2}px`
                  }}
                  onClick={() => toggleTaskExpansion(task.id!)}
                  title={`${format(displayStartDate!, 'MM/dd')} - ${format(displayEndDate!, 'MM/dd')} (${differenceInDays(displayEndDate!, displayStartDate!) + 1}天)`}
                >
                  {renderTaskTooltip(task, displayStartDate!, displayEndDate!)}
                  {/* Bracket top bar */}
                  <div className="absolute left-0 right-0 top-0 h-[6px] bg-gradient-to-r from-slate-500 to-slate-400 rounded-t-sm shadow-sm" />
                  {/* Left bracket leg */}
                  <div className="absolute left-0 top-0 h-full w-[3px] bg-slate-500 rounded-bl-sm" />
                  {/* Right bracket leg */}
                  <div className="absolute right-0 top-0 h-full w-[3px] bg-slate-500 rounded-br-sm" />
                  {/* Label on parent bracket */}
                  <span className="truncate text-[11px] font-bold text-gray-200 px-2.5 drop-shadow-md z-10 mt-0.5 font-mono">
                    {format(displayStartDate!, 'MM/dd')} - {format(displayEndDate!, 'MM/dd')}
                    <span className="text-gray-400 font-normal ml-1">({differenceInDays(displayEndDate!, displayStartDate!) + 1}天)</span>
                  </span>
                </div>
                )
              ) : (
              /* Child / leaf task bar — status-driven color */
                (() => {
                  // Calculate resize preview offsets
                  const isResizingThis = resizing?.taskId === task.id;
                  let resizeLeftDelta = 0;
                  let resizeWidthDelta = 0;
                  if (isResizingThis && resizing) {
                    if (resizing.edge === 'left') {
                      resizeLeftDelta = resizing.daysDelta * dayWidth;
                      resizeWidthDelta = -resizing.daysDelta * dayWidth;
                    } else {
                      resizeWidthDelta = resizing.daysDelta * dayWidth;
                    }
                  }
                  
                  // Calculate move and cascade shifts
                  const cascadeShiftDays = cascadeShifts.get(task.id!) || 0;
                  const moveLeftDelta = cascadeShiftDays * dayWidth;

                  const barLeft = startOffset * dayWidth + 1 + resizeLeftDelta + moveLeftDelta;
                  const barWidth = Math.max(duration, 1) * dayWidth - 2 + resizeWidthDelta;

                  // Determine bar color based on status priority:
                  // conflict > highlighted > deadline > schedule-conflict > status
                  const hasScheduleConflict = scheduleConflicts.has(task.id!);
                  const deadlineWarning = getDeadlineWarning(task);
                  const progressPercent = getProgressPercent(task);
                  const isDone = task.status === 'done';
                  const isTodo = task.status === 'todo';
                  const isInProgress = task.status === 'in_progress';

                  // Resolve the effective bar color
                  let effectiveBarColor = config.barColor;
                  let effectiveBgColor = isTodo ? 'rgba(148,163,184,0.08)' : config.barBgColor;

                  // Risk-based coloring: conflict > overdue > urgent > overload > overlap > blocked > progress > normal
                  const taskRisk = taskRiskMap.get(task.id!);
                  if (isConflict || hasScheduleConflict) {
                    effectiveBarColor = '#ef4444';
                    effectiveBgColor = isTodo ? 'rgba(239,68,68,0.15)' : '#7f1d1d';
                  } else if (deadlineWarning === 'overdue') {
                    effectiveBarColor = '#ef4444';
                    effectiveBgColor = isTodo ? 'rgba(239,68,68,0.1)' : '#7f1d1d';
                  } else if (deadlineWarning === 'urgent') {
                    effectiveBarColor = '#f97316';
                    effectiveBgColor = isTodo ? 'rgba(249,115,22,0.1)' : '#7c2d12';
                  } else if (taskRisk && taskRisk.level === 'critical') {
                    effectiveBarColor = '#ef4444';
                    effectiveBgColor = isTodo ? 'rgba(239,68,68,0.12)' : '#7f1d1d';
                  } else if (taskRisk && taskRisk.level === 'high') {
                    // Assignee overload / overlap / blocked — amber tint
                    effectiveBarColor = '#c48a3c';
                    effectiveBgColor = isTodo ? 'rgba(196,138,60,0.1)' : '#5a3d1e';
                  } else if (taskRisk && taskRisk.level === 'medium') {
                    // Approaching deadline or moderate load — subtle amber
                    effectiveBarColor = '#a89540';
                    effectiveBgColor = isTodo ? 'rgba(168,149,64,0.08)' : '#4a3f1a';
                  }

                  const isCritical = focusMode && criticalPathTaskIds.has(task.id!);
                  const isNonCritical = focusMode && !criticalPathTaskIds.has(task.id!);

                  return (
                    <div
                      onMouseDown={e => !resizing && handleMoveStart(e, task.id!, task.startDate!, task.endDate!)}
                      className={`absolute ${barTopClass} ${barHeightClass} rounded-[5px] flex items-center justify-center transition-none group/bar overflow-hidden ${
                        resizing?.taskId === task.id ? 'cursor-col-resize' : 'cursor-move'
                      } ${
                        (isConflict || hasScheduleConflict)
                          ? 'text-white animate-pulse shadow-lg shadow-red-500/30'
                          : deadlineWarning === 'overdue'
                            ? 'text-white shadow-lg shadow-red-500/20'
                            : deadlineWarning === 'urgent'
                              ? 'text-white shadow-md shadow-orange-500/10'
                              : isHighlighted
                                ? 'text-white animate-pulse shadow-lg shadow-amber-500/30'
                                : `text-white shadow-sm hover:shadow-md hover:brightness-110 ${config.glow}`
                      } ${
                        movingTask?.taskId === task.id ? 'opacity-80 ring-2 ring-white/50' : ''
                      } ${
                        cascadeShiftDays !== 0 && movingTask?.taskId !== task.id ? (cascadeShiftDays > 0 ? 'opacity-90 ring-2 ring-amber-400/50' : 'opacity-90 ring-2 ring-emerald-400/50') : ''
                      } ${
                        isCritical ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.5)] z-40' : ''
                      } ${
                        isNonCritical ? 'opacity-30 grayscale' : ''
                      } ${
                        isSearchMatch ? 'ring-2 ring-amber-400/70 shadow-[0_0_12px_rgba(245,158,11,0.4)]' : ''
                      }`}
                      style={{
                        left: `${barLeft}px`,
                        width: `${Math.max(barWidth, 24)}px`,
                        backgroundColor: effectiveBgColor,
                        backgroundImage: isTodo ? 'none' : `linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0))`,
                        boxShadow: isTodo ? 'none' : 'inset 0 1px 1px rgba(255,255,255,0.2)',
                        border: isTodo 
                          ? `1.5px dashed ${effectiveBarColor}80` 
                          : `1.5px solid ${effectiveBarColor}80`,
                        zIndex: movingTask?.taskId === task.id ? 50 : (cascadeShiftDays !== 0 ? 40 : 10)
                      }}
                      onClick={(e) => handleTaskClick(e, task)}
                      onContextMenu={(e) => handleContextMenu(e, task.id!)}
                      title={`${format(displayStartDate!, 'MM/dd')} - ${format(displayEndDate!, 'MM/dd')} (${differenceInDays(displayEndDate!, displayStartDate!) + 1}天)`}
                    >
                      {renderTaskTooltip(task, displayStartDate!, displayEndDate!)}
                      {/* Progress fill overlay — shows completion percentage */}
                      {progressPercent > 0 && (
                        <div 
                          className="absolute left-0 top-0 bottom-0 rounded-l-[4px] transition-all duration-300"
                          style={{ 
                            width: `${progressPercent}%`,
                            backgroundColor: effectiveBarColor,
                            opacity: isDone ? 0.9 : 0.85,
                            borderRadius: progressPercent >= 100 ? '4px' : '4px 0 0 4px',
                          }}
                        />
                      )}
                      
                      {/* Cascade shift indicator */}
                      {cascadeShiftDays !== 0 && (
                        <div className={`absolute -top-4 left-0 text-[8px] font-medium px-1 rounded z-50 ${cascadeShiftDays > 0 ? 'bg-amber-500/30 text-amber-200' : 'bg-emerald-500/30 text-emerald-200'}`}>
                          {cascadeShiftDays > 0 ? '+' : ''}{cascadeShiftDays}天
                        </div>
                      )}
                      {/* Done checkmark overlay */}
                      {isDone && (
                        <div className="absolute inset-0 flex items-center justify-center z-[1]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                        </div>
                      )}
                      {/* In-progress: subtle shimmer animation at progress edge */}
                      {isInProgress && progressPercent > 0 && progressPercent < 100 && (
                        <div 
                          className="absolute top-0 bottom-0 w-[2px] bg-white/40 blur-[1px] animate-pulse z-[1]"
                          style={{ left: `${progressPercent}%` }}
                        />
                      )}
                      {/* Schedule conflict indicator on bar */}
                      {scheduleConflicts.has(task.id!) && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/40 z-10 border border-red-300"
                          title={scheduleConflicts.get(task.id!)}
                        >
                          <AlertTriangle size={9} className="text-white" />
                        </div>
                      )}
                      {/* Blocked indicator (Shadow Dependency) */}
                      {task.isBlocked && (
                        <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40 z-10 border border-rose-300 animate-pulse"
                          title={`阻塞原因: ${task.blockReason || '未知'}`}
                        >
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>
                      )}

                      {/* ★ Auto-popup risk alert badge — shows when shouldAutoAlert is true */}
                      {taskRisk && taskRisk.shouldAutoAlert && !scheduleConflicts.has(task.id!) && (
                        <div 
                          className={`absolute -top-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold whitespace-nowrap shadow-lg ${
                            taskRisk.level === 'critical' 
                              ? 'bg-red-500 text-white shadow-red-500/40 border border-red-300 animate-pulse' 
                              : taskRisk.level === 'high'
                                ? 'bg-orange-500 text-white shadow-orange-500/40 border border-orange-300 animate-pulse'
                                : 'bg-amber-500 text-white shadow-amber-500/40 border border-amber-300 animate-pulse'
                          }`}
                          style={{ animationDuration: '2.5s' }}
                        >
                          <AlertTriangle size={8} className="shrink-0" />
                          <span className="truncate max-w-[80px]">
                            {taskRisk.riskReasons?.[0]?.text || '风险'}
                          </span>
                          {/* Arrow pointing down to the bar */}
                          <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-transparent ${
                            taskRisk.level === 'critical' ? 'border-t-red-500' :
                            taskRisk.level === 'high' ? 'border-t-orange-500' : 'border-t-amber-500'
                          }`} />
                        </div>
                      )}

                      {/* Left resize handle */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group/handle-l flex items-center justify-center"
                        onMouseDown={(e) => handleResizeStart(e, task.id!, 'left', task.startDate!, task.endDate!)}
                      >
                        <div className="w-[3px] h-4 rounded-full bg-white/0 group-hover/bar:bg-white/30 group-hover/handle-l:bg-white/70 transition-colors" />
                      </div>
                      {/* Right resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 group/handle-r flex items-center justify-center"
                        onMouseDown={(e) => handleResizeStart(e, task.id!, 'right', task.startDate!, task.endDate!)}
                      >
                        <div className="w-[3px] h-4 rounded-full bg-white/0 group-hover/bar:bg-white/30 group-hover/handle-r:bg-white/70 transition-colors" />
                      </div>
                      
                      {/* Dependency Drag Handle (Right Edge) — enhanced visual */}
                      <div
                        className="absolute -right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-indigo-400 border-2 border-white shadow-md opacity-0 group-hover/bar:opacity-100 cursor-crosshair z-30 hover:scale-150 hover:bg-indigo-300 hover:shadow-indigo-400/50 hover:shadow-lg transition-all duration-200"
                        onMouseDown={(e) => handleDepDragStart(e, task, rowIndex)}
                        title="拖拽到目标任务建立依赖关系"
                      >
                        <div className="absolute inset-0 rounded-full bg-indigo-400/50 animate-ping opacity-0 group-hover/bar:opacity-75" />
                      </div>
                      {/* Dependency Drop Target (Left Edge) — enhanced visual */}
                      {depDragStart && depDragStart.taskId !== task.id && (
                        <div
                          className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white shadow-lg opacity-70 hover:opacity-100 cursor-crosshair z-30 hover:scale-150 transition-all duration-200 animate-pulse"
                          onMouseUp={(e) => handleDepDrop(e, task.id!)}
                          title={`松开建立依赖: → ${task.title?.slice(0, 20)}`}
                        >
                          <div className="absolute inset-[-4px] rounded-full border-2 border-dashed border-emerald-400/60 animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                      )}
                    </div>
                  );
                })()
              )
            )}
          </div>
          {/* Drop indicator line — after */}
          {isDropAfter && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,0.6)]">
              <div className="absolute -left-0.5 -top-[3px] w-2 h-2 rounded-full bg-indigo-400 shadow-lg" />
            </div>
          )}
        </div>
      </React.Fragment>
    );
  };

  // Virtualizer for task rows
  const ganttBodyRef = useRef<HTMLDivElement>(null);
  const rowHeight = isCompact ? 32 : 44;
  const rowVirtualizer = useVirtualizer({
    count: filteredTaskRows.length,
    getScrollElement: () => ganttBodyRef.current?.closest('#gantt-scroll-container') as HTMLElement | null,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  return (
    <div className="flex-1 overflow-auto bg-[#0b0d14] relative flex">
      {/* Dashboard Panel */}
      {showDashboard && dashboardMetrics && (
        <div className="px-5 py-3 border-b border-gray-800/60 bg-[#12141e] flex items-center gap-6 shrink-0">
          {/* Burn-down */}
          <div className="flex items-center gap-3 bg-gray-800/30 px-4 py-2 rounded-lg border border-gray-700/50">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <TrendingDown size={16} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-gray-500 font-medium">项目进度 (燃尽)</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-gray-200">{dashboardMetrics.progress}%</span>
                <span className="text-xs text-gray-500">{dashboardMetrics.completedDays}/{dashboardMetrics.totalDays} 天</span>
              </div>
            </div>
          </div>

          {/* Health Radar */}
          <div className="flex items-center gap-3 bg-gray-800/30 px-4 py-2 rounded-lg border border-gray-700/50 flex-1">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 font-medium mb-1">健康度 (按时完成率)</div>
              <div className="flex items-center gap-4">
                {Array.from(dashboardMetrics.typeHealth.entries()).map(([type, stats]) => {
                  const rate = stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0;
                  return (
                    <div key={type} className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">{type}</span>
                      <span className={`text-xs font-bold ${rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {rate}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Blocker Count */}
          <div className="flex items-center gap-3 bg-red-900/10 px-4 py-2 rounded-lg border border-red-900/30">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle size={16} className="text-red-400" />
            </div>
            <div>
              <div className="text-[10px] text-red-400/70 font-medium">阻塞任务</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-red-400">{dashboardMetrics.blockedCount}</span>
                <span className="text-xs text-red-400/50">个</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Gantt Area */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${showMemberPanel ? 'mr-0' : ''}`}>
        {/* Toolbar */}
        <GanttToolbar
          startDate={startDate}
          visibleDays={visibleDays}
          zoomIndex={zoomIndex}
          zoomConfig={zoomConfig}
          onNavigate={handleNavigate}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          usedTaskTypes={usedTaskTypes}
          showWhatIf={showWhatIf}
          onToggleWhatIf={() => setShowWhatIf(!showWhatIf)}
          showMemberPanel={showMemberPanel}
          onToggleMemberPanel={() => setShowMemberPanel(!showMemberPanel)}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode(!focusMode)}
          showDashboard={showDashboard}
          onToggleDashboard={() => setShowDashboard(!showDashboard)}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          resources={resources || []}
          selectedMemberId={selectedMemberId}
          onMemberFilterChange={setSelectedMemberId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchResultCount={searchQuery.trim() ? searchMatchCount : undefined}
          showRiskPanel={showRiskPanel}
          onToggleRiskPanel={() => setShowRiskPanel(!showRiskPanel)}
          riskCount={riskCount}
          isCompact={isCompact}
          onToggleDensity={() => setIsCompact(!isCompact)}
          onExport={handleExport}
          hasTapdConfig={hasTapdConfig}
          isTapdRefreshing={isTapdRefreshing}
          onTapdRefresh={handleTapdQuickRefresh}
          projectStatus={projectStatus}
          onPauseProject={handlePauseProject}
          onResumeProject={handleResumeProject}
          onArchiveProject={handleArchiveProject}
        />

        {/* Project paused/archived banner */}
        {projectStatus !== 'active' && (
          <div className={`px-5 py-2 flex items-center justify-between text-xs font-medium border-b ${
            projectStatus === 'archived'
              ? 'bg-red-500/10 border-red-500/20 text-red-300'
              : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
          }`}>
            <div className="flex items-center gap-2">
              <span>{projectStatus === 'archived' ? '⛔' : '⏸️'}</span>
              <span>
                {projectStatus === 'archived' ? '项目已归档' : '项目已暂停'}
                {currentProject?.pauseReason && ` — ${currentProject.pauseReason}`}
              </span>
              {currentProject?.pausedAt && (
                <span className="text-[10px] opacity-60">
                  ({format(new Date(currentProject.pausedAt), 'MM-dd HH:mm')})
                </span>
              )}
            </div>
            <button
              onClick={handleResumeProject}
              className={`px-3 py-1 rounded-md border text-xs font-medium transition-all ${
                projectStatus === 'archived'
                  ? 'border-red-500/30 text-red-300 hover:bg-red-500/20'
                  : 'border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20'
              }`}
            >
              恢复项目
            </button>
          </div>
        )}

        {/* Gantt Chart */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col">
          <div className="flex-1 bg-[#12141e] rounded-xl border border-gray-800/50 shadow-2xl overflow-hidden flex flex-col relative">
            {/* Floating "Jump to Today" button */}
            <button
              onClick={() => handleNavigate('today')}
              className="absolute bottom-4 right-4 z-40 flex items-center gap-1.5 px-3 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-indigo-500/30 backdrop-blur-sm border border-indigo-400/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/40"
              title="跳转到今天 (快捷键: T)"
            >
              <CalendarDays size={13} />
              今天
            </button>
            {/* Scrollable gantt content */}
            <div 
              ref={ganttScrollRef} 
              className={`flex-1 overflow-x-auto overflow-y-auto ${isDraggingCanvas ? 'cursor-grabbing select-none' : ''}`}
              id="gantt-scroll-container"
              onMouseDown={handleCanvasMouseDown}
            >
                {/* GanttTimeline placed outside w-max container so sticky top-0 works correctly */}
                <div className="sticky top-0 z-30 w-max" style={{ minWidth: `calc(${effectiveLpWidth}px + ${visibleDays * dayWidth}px)` }}>
                <GanttTimeline
                  days={days}
                  dayWidth={dayWidth}
                  effectiveLpWidth={effectiveLpWidth}
                  today={today}
                  zoomConfig={zoomConfig}
                  monthGroups={monthGroups}
                  leftPanelCollapsed={leftPanelCollapsed}
                  onToggleCollapse={setLeftPanelCollapsed}
                  onLpResizeStart={handleLpResizeStart}
                  isResizing={isLpResizing}
                  selectedCount={selectedTaskIds.size}
                  onBatchShift={handleBatchShift}
                  onBatchAlignEnd={handleBatchAlignEnd}
                  onBatchCopyMarkdown={handleBatchCopyMarkdown}
                  onBatchDelete={handleBatchDelete}
                  onClearSelection={() => setSelectedTaskIds(new Set())}
                  onBatchManage={() => {
                    if (selectedTaskIds.size === 0) return;
                    setBatchStatus('');
                    setBatchPriority('');
                    setBatchAssigneeId('');
                    setShowBatchManageModal(true);
                  }}
                  onAutoInferDeps={async () => {
                    if (selectedTaskIds.size === 0) return;
                    // 对选中的父任务执行自动推断
                    for (const id of selectedTaskIds) {
                      const task = tasks?.find(t => t.id === id);
                      if (task && !task.parentId) {
                        await handleAutoInferDeps(id);
                      }
                    }
                    setSelectedTaskIds(new Set());
                  }}
                  multiSelectMode={multiSelectMode}
                  onToggleMultiSelect={() => {
                    setMultiSelectMode(prev => !prev);
                    if (multiSelectMode) {
                      // Exiting multi-select mode: clear selection
                      setSelectedTaskIds(new Set());
                    }
                  }}
                />
                </div>{/* end sticky GanttTimeline wrapper */}

                {/* Task rows */}
                <div className="w-max" style={{ minWidth: `calc(${effectiveLpWidth}px + ${visibleDays * dayWidth}px)` }}>
                <div className="relative w-full" style={{ minWidth: `calc(${effectiveLpWidth}px + ${visibleDays * dayWidth}px)` }}>
                  {/* SVG Dependency Topology Layer */}
                  <div className="absolute inset-0 z-[3] pointer-events-none" style={{ clipPath: `inset(0 0 0 ${effectiveLpWidth}px)` }}>
                    <GanttDependencyLines lines={dependencyLines} />
                    
                    {/* Dynamic Dependency Drag Line — Enhanced */}
                    {depDragStart && depDragCurrent && (
                      <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }} width="100%" height="100%">
                        {/* Glow effect */}
                        <defs>
                          <filter id="dep-glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                            <feMerge>
                              <feMergeNode in="coloredBlur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        {/* Shadow line */}
                        <path
                          d={`M ${depDragStart.x} ${depDragStart.y} C ${depDragStart.x + 50} ${depDragStart.y}, ${depDragCurrent.x - 50} ${depDragCurrent.y}, ${depDragCurrent.x} ${depDragCurrent.y}`}
                          fill="none"
                          stroke="#a78bfa"
                          strokeWidth={3}
                          strokeDasharray="6 4"
                          opacity={0.4}
                          filter="url(#dep-glow)"
                          style={{ animation: 'flowDash 1s linear infinite' }}
                        />
                        {/* Main line */}
                        <path
                          d={`M ${depDragStart.x} ${depDragStart.y} C ${depDragStart.x + 50} ${depDragStart.y}, ${depDragCurrent.x - 50} ${depDragCurrent.y}, ${depDragCurrent.x} ${depDragCurrent.y}`}
                          fill="none"
                          stroke="#a78bfa"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          style={{ animation: 'flowDash 1s linear infinite' }}
                        />
                        {/* Source dot */}
                        <circle cx={depDragStart.x} cy={depDragStart.y} r={5} fill="#5b5fc7" stroke="#fff" strokeWidth={2} />
                        {/* Target dot with pulse */}
                        <circle cx={depDragCurrent.x} cy={depDragCurrent.y} r={6} fill="#a78bfa" opacity={0.3}>
                          <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.3;0.1;0.3" dur="1s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={depDragCurrent.x} cy={depDragCurrent.y} r={4} fill="#a78bfa" stroke="#fff" strokeWidth={2} />
                        {/* Arrow indicator */}
                        <polygon
                          points={`${depDragCurrent.x - 4},${depDragCurrent.y - 6} ${depDragCurrent.x + 4},${depDragCurrent.y - 6} ${depDragCurrent.x},${depDragCurrent.y - 2}`}
                          fill="#a78bfa"
                          opacity={0.8}
                        />
                        {/* Label: source task name */}
                        <text x={depDragStart.x + 8} y={depDragStart.y - 10} fill="#c4b5fd" fontSize="10" fontWeight="500">
                          {tasks?.find(t => t.id === depDragStart.taskId)?.title?.slice(0, 20) || ''}
                        </text>
                        {/* Instruction text */}
                        <text x={(depDragStart.x + depDragCurrent.x) / 2} y={Math.min(depDragStart.y, depDragCurrent.y) - 12} fill="#a78bfa" fontSize="9" textAnchor="middle" opacity={0.8}>
                          松开鼠标建立依赖
                        </text>
                      </svg>
                    )}
                  </div>

                  {/* Today indicator line */}
                  <GanttTodayLine startDate={startDate} dayWidth={dayWidth} leftPanelWidth={effectiveLpWidth} />
                  
                  <div className="py-0.5 w-full" ref={ganttBodyRef}>
                    {filteredTaskRows.length > 0 ? (
                      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                        {rowVirtualizer.getVirtualItems().map(virtualRow => {
                          const { task, level, rowIndex } = filteredTaskRows[virtualRow.index];
                          return (
                            <div
                              key={task.id}
                              style={{
                                position: 'absolute',
                                top: `${virtualRow.start}px`,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                              }}
                            >
                              {renderTaskRow(task, level, rowIndex)}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-16 text-center text-gray-600 text-sm">
                        暂无任务，点击右上角「新建任务」开始
                      </div>
                    )}
                  </div>
                </div>

                <GanttResourceHeatRow
                  days={days}
                  dayWidth={dayWidth}
                  effectiveLpWidth={effectiveLpWidth}
                  tasks={tasks}
                  resources={resources}
                />
              </div>
            </div>

            {/* GanttScrollbar removed — navigation handled by native scroll + keyboard/wheel */}
          </div>
        </div>
      </div>

      {/* Member Overview Panel */}
      {showMemberPanel && (
        <GanttMemberPanel
          memberSummary={memberSummary}
          onClose={() => setShowMemberPanel(false)}
          onOpenTask={openTaskModal}
        />
      )}

      {/* Risk Panel */}
      {showRiskPanel && (
        <GanttRiskPanel
          tasks={tasks}
          resources={resources}
          today={today}
          onClose={() => setShowRiskPanel(false)}
          onOpenTask={openTaskModal}
        />
      )}

      {/* What-If Panel */}
      <WhatIfPanel
        isOpen={showWhatIf}
        onClose={() => { setShowWhatIf(false); setGhostSchedules([]); }}
        onGhostScheduleChange={setGhostSchedules}
      />

      {/* Dependency Toast Notification */}
      {depToast && createPortal(
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2.5 rounded-lg shadow-2xl border backdrop-blur-md text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
          depToast.type === 'success' 
            ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200 shadow-emerald-500/20' 
            : 'bg-red-900/90 border-red-500/40 text-red-200 shadow-red-500/20'
        }`}>
          {depToast.message}
        </div>,
        document.body
      )}

      {/* Context Menu — rendered via portal to avoid ancestor backdrop-filter breaking fixed positioning */}
      {contextMenu && createPortal(
        <GanttContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          task={tasks?.find(t => t.id === contextMenu.taskId)}
          selectedTaskIds={selectedTaskIds}
          onEdit={() => { openTaskModal(contextMenu.taskId); setContextMenu(null); }}
          onRename={() => {
            const task = tasks?.find(t => t.id === contextMenu.taskId);
            if (task) handleDoubleClick(task);
            setContextMenu(null);
          }}
          onDelete={() => handleDeleteTask(contextMenu.taskId)}
          onClose={() => setContextMenu(null)}
          onStatusChange={handleStatusChange}
          onBatchShift={handleBatchShift}
          onBatchAlignEnd={handleBatchAlignEnd}
          onBatchCopyMarkdown={handleBatchCopyMarkdown}
          onAutoInferDeps={handleAutoInferDeps}
          hasChildren={!!tasks?.some(t => t.parentId === contextMenu.taskId)}
        />,
        document.body
      )}

      {/* Batch Manage Modal */}
      {showBatchManageModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-800/50">
              <h3 className="text-lg font-semibold text-gray-100">批量编辑任务 ({selectedTaskIds.size}项)</h3>
              <button onClick={() => setShowBatchManageModal(false)} className="text-gray-400 hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">状态</label>
                <select
                  value={batchStatus}
                  onChange={(e) => setBatchStatus(e.target.value as any)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">不修改</option>
                  <option value="todo">待办</option>
                  <option value="in_progress">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">优先级</label>
                <select
                  value={batchPriority}
                  onChange={(e) => setBatchPriority(e.target.value as any)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">不修改</option>
                  <option value="none">- (无)</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">负责人</label>
                <select
                  value={batchAssigneeId}
                  onChange={(e) => setBatchAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">不修改</option>
                  <option value="-1">清空负责人</option>
                  {resources && [...resources].filter(r => r.status !== 'departed').sort(compareResources).map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-800 bg-gray-800/30 flex justify-end gap-3">
              <button
                onClick={() => setShowBatchManageModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBatchManageSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Early Finish Cascade Confirmation Modal */}
      {earlyFinishConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-3 bg-emerald-900/20">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">任务提前完成</h3>
                <p className="text-sm text-emerald-400">提前 {earlyFinishConfirm.daysEarly} 天完成</p>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-300">
                <span className="font-medium text-gray-100">「{earlyFinishConfirm.taskTitle}」</span> 已标记为完成。
              </p>
              
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <p className="text-sm text-gray-400 mb-2">是否将下游任务也提前 <span className="text-emerald-400 font-medium">{earlyFinishConfirm.daysEarly} 天</span>？</p>
                <div className="space-y-1.5">
                  {earlyFinishConfirm.downstreamTasks.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60"></span>
                      <span className="text-gray-300 truncate">{t.title}</span>
                    </div>
                  ))}
                  {earlyFinishConfirm.downstreamTasks.length > 5 && (
                    <p className="text-xs text-gray-500 pl-3.5">...等 {earlyFinishConfirm.downstreamTasks.length} 个任务</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-800 bg-gray-800/30 flex justify-end gap-3">
              <button
                onClick={() => handleEarlyFinishCascade(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-gray-700/50"
              >
                仅标记完成
              </button>
              <button
                onClick={() => handleEarlyFinishCascade(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle2 size={14} />
                确认提前下游
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Assignee Popover — Portal to body to avoid overflow/z-index issues */}
      {assigneePopover && createPortal(
        (() => {
          const task = tasks?.find(t => t.id === assigneePopover.taskId);
          if (!task) return null;
          const selected = new Set(task.assigneeIds || []);
          // Group resources by type (internal first, then CP), sorted by role order
          const internals = (resources || []).filter(r => r.type !== 'cp' && r.status !== 'departed').sort(compareResources);
          const cps = (resources || []).filter(r => r.type === 'cp' && r.status !== 'departed').sort(compareResources);
          return (
            <div
              ref={assigneePopoverRef}
              className="fixed z-[9999] w-[260px] bg-[#1a1d2e] border border-gray-700/60 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
              style={{
                top: assigneePopover.top,
                left: assigneePopover.left,
                animation: 'historyPanelIn 0.12s ease-out',
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 border-b border-gray-700/50 flex items-center justify-between">
                <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">选择负责人</div>
                <button
                  className="text-gray-500 hover:text-gray-200 transition-colors"
                  onClick={() => setAssigneePopover(null)}
                  title="关闭"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="max-h-[320px] overflow-y-auto py-1">
                {internals.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">内部成员</div>
                    {internals.map(r => {
                      const isSel = selected.has(r.id!);
                      return (
                        <button
                          key={r.id}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); toggleAssigneeForTask(assigneePopover.taskId, r.id!); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            isSel ? 'bg-indigo-500/15 text-white' : 'text-gray-300 hover:bg-gray-700/40 hover:text-white'
                          }`}
                        >
                          <Avatar name={r.name} size="xs" type={(r.type as 'internal' | 'cp') || 'internal'} avatar={r.avatar} avatarStyle={r.avatarStyle} role={r.role} />
                          <span className="flex-1 text-left truncate">{r.name}{r.role ? <span className="text-[10px] text-gray-500 ml-1">· {r.role}</span> : null}</span>
                          {isSel && <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </>
                )}
                {cps.length > 0 && (
                  <>
                    <div className="px-3 py-1 mt-1 text-[10px] text-gray-500 uppercase tracking-wider">CP 外包</div>
                    {cps.map(r => {
                      const isSel = selected.has(r.id!);
                      return (
                        <button
                          key={r.id}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); toggleAssigneeForTask(assigneePopover.taskId, r.id!); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            isSel ? 'bg-emerald-500/15 text-white' : 'text-gray-300 hover:bg-gray-700/40 hover:text-white'
                          }`}
                        >
                          <Avatar name={r.name} size="xs" type="cp" avatar={r.avatar} avatarStyle={r.avatarStyle} role={r.role} />
                          <span className="flex-1 text-left truncate">{r.name}{r.role ? <span className="text-[10px] text-gray-500 ml-1">· {r.role}</span> : null}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">CP</span>
                          {isSel && <CheckCircle2 size={13} className="text-emerald-400 shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </>
                )}
                {/* CP warning: must select internal contact person */}
                {(() => {
                  const hasCpSelected = cps.some(r => selected.has(r.id!));
                  const hasInternalSelected = internals.some(r => selected.has(r.id!));
                  if (hasCpSelected && !hasInternalSelected) {
                    return (
                      <div className="mx-2 mt-2 mb-1 px-2.5 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle size={10} className="text-red-400 shrink-0" />
                          <span className="text-[10px] text-red-300 font-medium">请选择一名内部成员作为接口人</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {internals.map(r => (
                            <button
                              key={r.id}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); toggleAssigneeForTask(assigneePopover.taskId, r.id!); }}
                              className="px-2 py-0.5 rounded text-[10px] border bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                            >
                              {r.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="px-3 py-2 border-t border-gray-700/50 flex items-center justify-between gap-2">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); clearAssigneesForTask(assigneePopover.taskId); }}
                  className="text-[11px] text-gray-400 hover:text-red-300 transition-colors"
                >
                  清空
                </button>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); const id = assigneePopover.taskId; setAssigneePopover(null); openTaskModal(id); }}
                  className="text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors"
                >
                  打开完整编辑 →
                </button>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* TAPD Refresh Result Modal */}
      {showTapdRefreshModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999]" onClick={() => setShowTapdRefreshModal(false)}>
          <div className="bg-[#1a1d2e] border border-gray-700/60 rounded-2xl shadow-2xl w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/50">
              <div className="flex items-center gap-2">
                <RefreshCw size={16} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">TAPD 数据刷新结果</span>
              </div>
              <button onClick={() => setShowTapdRefreshModal(false)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-700/50">
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
              {tapdRefreshError ? (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <AlertCircle size={20} className="text-red-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-red-300">刷新失败</div>
                    <div className="text-xs text-red-400/80 mt-0.5">{tapdRefreshError}</div>
                  </div>
                </div>
              ) : tapdRefreshResult ? (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/30">
                      <div className="text-lg font-bold font-mono tabular-nums text-sky-400">{tapdRefreshResult.totalChecked}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">已检查</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/30">
                      <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">{tapdRefreshResult.newlyBoundCount || 0}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">新绑定</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/30">
                      <div className="text-lg font-bold font-mono tabular-nums text-blue-400">{tapdRefreshResult.updatedCount}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">有变更</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/30">
                      <div className="text-lg font-bold font-mono tabular-nums text-gray-400">{tapdRefreshResult.unchangedCount}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">无变化</div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700/30">
                      <div className="text-lg font-bold font-mono tabular-nums text-amber-400">{tapdRefreshResult.failedCount}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">未找到</div>
                    </div>
                  </div>

                  {/* Change details */}
                  {tapdRefreshResult.details.length > 0 ? (
                    <div>
                      <div className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-blue-400" />
                        变更详情 ({tapdRefreshResult.details.length})
                      </div>
                      <div className="space-y-2">
                        {tapdRefreshResult.details.map((item, idx) => (
                          <div key={idx} className="bg-gray-800/40 rounded-lg border border-gray-700/30 p-3">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="text-xs text-white font-medium leading-relaxed flex-1 min-w-0 truncate" title={item.title}>
                                {item.title}
                              </div>
                              {item.externalUrl && (
                                <a
                                  href={item.externalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 shrink-0 p-0.5"
                                  title="在TAPD中查看"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            <div className="space-y-1">
                              {item.changes.map((change, ci) => {
                                const fieldLabels: Record<string, string> = {
                                  status: '状态', startDate: '开始日期', endDate: '截止日期',
                                  priority: '优先级', progress: '进度', assignee: '处理人', bind: '绑定'
                                };
                                return (
                                  <div key={ci} className="flex items-center gap-2 text-[11px]">
                                    <span className="text-gray-500 min-w-[52px]">{fieldLabels[change.field] || change.field}</span>
                                    <span className="text-red-400/70 line-through truncate max-w-[140px]" title={change.oldValue}>{change.oldValue || '空'}</span>
                                    <span className="text-gray-600">→</span>
                                    <span className="text-emerald-400 truncate max-w-[140px]" title={change.newValue}>{change.newValue || '空'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
                      <div className="text-sm text-gray-300">所有任务数据均为最新</div>
                      <div className="text-xs text-gray-500 mt-1">未检测到任何变更</div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-700/50 flex justify-end">
              <button
                onClick={() => setShowTapdRefreshModal(false)}
                className="px-4 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 text-xs font-medium rounded-lg transition-colors border border-gray-600/50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}