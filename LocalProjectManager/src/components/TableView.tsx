import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task, Resource } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { useStore } from '../store/useStore';
import { format, differenceInDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { compareResources, getRoleOrderIndex } from './gantt/constants';
import { getEffectiveStatus } from '../types/resource';
import { syncParentDateRange } from '../services/workloadService';
import { useVirtualizer } from '@tanstack/react-virtual';
import { confirmDialog } from './common/ConfirmDialog';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Search, Filter,
  Edit2, Trash2, ChevronRight, ChevronDown, Plus,
  Calendar, Flag, CheckCircle2, Clock, AlertTriangle, ExternalLink,
  Layers, CheckSquare
} from 'lucide-react';

type SortField = 'title' | 'status' | 'priority' | 'startDate' | 'endDate' | 'progress';
type SortDirection = 'asc' | 'desc';
type GroupBy = 'none' | 'status' | 'person' | 'priority';

const STATUS_OPTIONS = [
  { value: 'todo', label: '待办', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', dotColor: 'bg-gray-400' },
  { value: 'in_progress', label: '进行中', color: 'bg-blue-500/15 text-blue-300 border-blue-500/40', dotColor: 'bg-blue-400 animate-pulse' },
  { value: 'done', label: '已完成', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dotColor: 'bg-emerald-400' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: '-', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
  { value: 'low', label: '低', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'medium', label: '中', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { value: 'high', label: '高', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

export function TableView() {
  const { selectedProjectId, openTaskModal, expandedTaskIds, toggleTaskExpansion } = useStore();

  const tasks = useLiveQuery(
    () => selectedProjectId
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  );

  const resources = useLiveQuery(() => db.resources.toArray()) || [];

  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [editingCell, setEditingCell] = useState<{ taskId: number; field: string } | null>(null);
  
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  const rootTasks = useMemo(() => tasks?.filter(t => !t.parentId) || [], [tasks]);
  const getChildren = (parentId: number) => tasks?.filter(t => t.parentId === parentId) || [];

  const filteredRootTasks = useMemo(() => {
    let result = [...rootTasks];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchingIds = new Set<number>();
      tasks?.forEach(t => {
        if (t.title.toLowerCase().includes(query)) {
          matchingIds.add(t.id!);
          if (t.parentId) matchingIds.add(t.parentId);
        }
      });
      result = result.filter(t => matchingIds.has(t.id!));
    }
    if (filterStatus !== 'all') {
      const matchingParentIds = new Set<number>();
      tasks?.forEach(t => {
        if (t.status === filterStatus) {
          matchingParentIds.add(t.id!);
          if (t.parentId) matchingParentIds.add(t.parentId);
        }
      });
      result = result.filter(t => matchingParentIds.has(t.id!));
    }
    if (filterPriority !== 'all') {
      const matchingParentIds = new Set<number>();
      tasks?.forEach(t => {
        if (t.priority === filterPriority) {
          matchingParentIds.add(t.id!);
          if (t.parentId) matchingParentIds.add(t.parentId);
        }
      });
      result = result.filter(t => matchingParentIds.has(t.id!));
    }
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title, 'zh-CN');
          break;
        case 'status': {
    const statusOrder: Record<string, number> = { todo: 0, in_progress: 1, done: 2, paused: 3, cancelled: 4 };
          comparison = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
          break;
        }
        case 'priority': {
          const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
          comparison = (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
          break;
        }
        case 'startDate':
          comparison = (a.startDate ? new Date(a.startDate).getTime() : Infinity) - (b.startDate ? new Date(b.startDate).getTime() : Infinity);
          break;
        case 'endDate':
          comparison = (a.endDate ? new Date(a.endDate).getTime() : Infinity) - (b.endDate ? new Date(b.endDate).getTime() : Infinity);
          break;
        case 'progress':
          comparison = a.progress - b.progress;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [rootTasks, tasks, searchQuery, filterStatus, filterPriority, sortField, sortDirection]);

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') return null;
    
    const groups = new Map<string, { label: string, tasks: Task[] }>();
    
    if (groupBy === 'status') {
      // Ensure order: in_progress -> todo -> done
      const statusOrder = [
        { value: 'in_progress', label: '🔵 进行中' },
        { value: 'todo', label: '⚪ 待办' },
        { value: 'done', label: '✅ 已完成' },
        { value: 'paused', label: '⏸️ 暂停' },
      ];
      statusOrder.forEach(opt => groups.set(opt.value, { label: opt.label, tasks: [] }));
      filteredRootTasks.forEach(t => {
        const group = groups.get(t.status);
        if (group) group.tasks.push(t);
      });
    } else if (groupBy === 'priority') {
      const priorityOrder = [
        { value: 'high', label: '🔴 高优先级' },
        { value: 'medium', label: '🟡 中优先级' },
        { value: 'low', label: '🔵 低优先级' },
        { value: '', label: '⚪ 未设置' },
      ];
      priorityOrder.forEach(opt => groups.set(opt.value, { label: opt.label, tasks: [] }));
      filteredRootTasks.forEach(t => {
        const group = groups.get(t.priority || '');
        if (group) group.tasks.push(t);
      });
    } else if (groupBy === 'person') {
      // Sort resources by role order before building groups
      const sortedRes = [...resources].sort(compareResources);
      sortedRes.forEach(r => groups.set(r.id!.toString(), { label: r.name, tasks: [] }));
      groups.set('unassigned', { label: '未分配', tasks: [] });
      
      filteredRootTasks.forEach(t => {
        if (!t.assigneeIds || t.assigneeIds.length === 0) {
          groups.get('unassigned')!.tasks.push(t);
        } else {
          t.assigneeIds.forEach(id => {
            const group = groups.get(id.toString());
            if (group) group.tasks.push(t);
          });
        }
      });
    }
    
    return Array.from(groups.entries()).filter(([_, g]) => g.tasks.length > 0);
  }, [filteredRootTasks, groupBy, resources]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleStatusChange = async (taskId: number, newStatus: Task['status']) => {
    await trackedDb.tasks.update(taskId, { status: newStatus }, `变更任务状态为「${newStatus === 'todo' ? '待办' : newStatus === 'in_progress' ? '进行中' : '已完成'}」`);
    setEditingCell(null);
  };

  const handlePriorityChange = async (taskId: number, newPriority: Task['priority']) => {
    await trackedDb.tasks.update(taskId, { priority: newPriority }, `变更任务优先级为「${newPriority === 'high' ? '高' : newPriority === 'medium' ? '中' : newPriority === 'low' ? '低' : '未设置'}」`);
    setEditingCell(null);
  };

  const handleDeleteTask = async (taskId: number) => {
    const ok = await confirmDialog({ title: '删除任务', message: '确定要删除这个任务吗？子任务也会一并删除。', type: 'danger', confirmText: '删除' });
    if (ok) {
      const task = await db.tasks.get(taskId);
      const children = await db.tasks.where('parentId').equals(taskId).toArray();
      await trackedDb.tasks.delete(taskId, '删除任务及子任务');
      if (task?.parentId) {
        await syncParentDateRange(task.parentId);
      }
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set<number>();
      const addIds = (taskList: Task[]) => {
        taskList.forEach(t => {
          allIds.add(t.id!);
          const children = getChildren(t.id!);
          if (children.length > 0 && expandedTaskIds.has(t.id!)) {
            addIds(children);
          }
        });
      };
      addIds(filteredRootTasks);
      setSelectedTaskIds(allIds);
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleSelectTask = (taskId: number, checked: boolean) => {
    const newSelected = new Set(selectedTaskIds);
    // Recursively collect all descendant task IDs
    const collectDescendants = (parentId: number): number[] => {
      const children = getChildren(parentId);
      let ids: number[] = [];
      for (const child of children) {
        ids.push(child.id!);
        ids = ids.concat(collectDescendants(child.id!));
      }
      return ids;
    };
    if (checked) {
      newSelected.add(taskId);
      // If this task has children, select all descendants
      const descendants = collectDescendants(taskId);
      descendants.forEach(id => newSelected.add(id));
    } else {
      newSelected.delete(taskId);
      // If this task has children, deselect all descendants
      const descendants = collectDescendants(taskId);
      descendants.forEach(id => newSelected.delete(id));
    }
    setSelectedTaskIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    const ok = await confirmDialog({ title: '批量删除', message: `确定要删除选中的 ${selectedTaskIds.size} 个任务吗？`, type: 'danger', confirmText: '删除' });
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

  const handleBatchStatus = async (status: Task['status']) => {
    if (selectedTaskIds.size === 0) return;
    for (const id of selectedTaskIds) {
      await trackedDb.tasks.update(id, { status }, '批量修改状态');
    }
    setSelectedTaskIds(new Set());
  };

  const handleBatchPriority = async (priority: Task['priority']) => {
    if (selectedTaskIds.size === 0) return;
    for (const id of selectedTaskIds) {
      await trackedDb.tasks.update(id, { priority }, '批量修改优先级');
    }
    setSelectedTaskIds(new Set());
  };

  const getAssigneeNames = (assigneeIds?: number[]) => {
    if (!assigneeIds || assigneeIds.length === 0) return [];
    const result = assigneeIds.map(id => resources.find(r => r.id === id)).filter(Boolean) as Resource[];
    // Sort by role order (UX→UI→Layout→…)
    result.sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role));
    return result;
  };

  const getDuration = (task: Task) => (task.startDate && task.endDate) ? differenceInDays(new Date(task.endDate), new Date(task.startDate)) : 0;
  const isOverdue = (task: Task) => task.status !== 'done' && task.endDate && new Date(task.endDate) < new Date();

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-600" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-indigo-400" />
      : <ArrowDown size={14} className="text-indigo-400" />;
  };

  const renderStatusDropdown = (task: Task) => (
    <div className="absolute z-[100] bottom-full mb-1 bg-[#1a1d27] border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[120px]" style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id!, opt.value as Task['status']); }}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${task.status === opt.value ? 'text-white bg-gray-700/70' : 'text-gray-200'}`}
        >
          <span className={`w-2 h-2 rounded-full ${opt.value === 'todo' ? 'bg-gray-400' : opt.value === 'in_progress' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
          {opt.label}
        </button>
      ))}
    </div>
  );

  const renderStatusBadge = (task: Task) => {
    const status = STATUS_OPTIONS.find(s => s.value === task.status);
    if (!status) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditingCell({ taskId: task.id!, field: 'status' }); }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:brightness-125 hover:scale-105 cursor-pointer ${status.color}`}
      >
        {status.value === 'done' && <CheckCircle2 size={13} />}
        {status.value === 'in_progress' && <Clock size={13} />}
        {status.value === 'todo' && <span className={`w-2 h-2 rounded-full ${status.dotColor}`} />}
        {status.label}
      </button>
    );
  };

  const renderPriorityDropdown = (task: Task) => (
    <div className="absolute z-[100] bottom-full mb-1 bg-[#1a1d27] border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[100px]" style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
      {PRIORITY_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={(e) => { e.stopPropagation(); handlePriorityChange(task.id!, opt.value as Task['priority']); }}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${task.priority === opt.value ? 'text-white bg-gray-700/70' : 'text-gray-200'}`}
        >
          <Flag size={12} className={opt.value === 'high' ? 'text-red-400' : opt.value === 'medium' ? 'text-yellow-400' : 'text-blue-400'} />
          {opt.label}
        </button>
      ))}
    </div>
  );

  const renderPriorityBadge = (task: Task) => {
    const priority = PRIORITY_OPTIONS.find(p => p.value === task.priority);
    if (!priority) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditingCell({ taskId: task.id!, field: 'priority' }); }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:brightness-125 hover:scale-105 cursor-pointer ${priority.color}`}
      >
        <Flag size={13} />
        {priority.label}
      </button>
    );
  };

  const renderProgressBar = (task: Task) => {
    const progress = task.status === 'done' ? 100 : task.status === 'in_progress' ? (task.progress || 50) : 0;
    return (
      <div className="flex items-center gap-2.5 w-full">
        <div className="flex-1 h-2 bg-gray-800/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : progress > 0 ? 'bg-gradient-to-r from-indigo-600 to-indigo-400' : 'bg-transparent'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-xs font-medium w-9 text-right shrink-0 ${progress === 100 ? 'text-emerald-400' : progress > 0 ? 'text-indigo-400' : 'text-gray-600'}`}>{progress}%</span>
      </div>
    );
  };

  // ─── Flatten visible rows for virtual scrolling ────────────────
  interface FlatRow {
    type: 'task' | 'group-header' | 'empty';
    task?: Task;
    level: number;
    groupLabel?: string;
    groupCount?: number;
  }

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];

    const flattenTask = (task: Task, level: number) => {
      rows.push({ type: 'task', task, level });
      if (expandedTaskIds.has(task.id!)) {
        const children = getChildren(task.id!).filter(child => {
          if (filterStatus !== 'all' && child.status !== filterStatus) return false;
          if (filterPriority !== 'all' && child.priority !== filterPriority) return false;
          return true;
        });
        children.forEach(child => flattenTask(child, level + 1));
      }
    };

    if (groupedTasks) {
      groupedTasks.forEach(([key, group]) => {
        rows.push({ type: 'group-header', level: 0, groupLabel: group.label, groupCount: group.tasks.length });
        group.tasks.forEach(task => flattenTask(task, 0));
      });
    } else if (filteredRootTasks.length > 0) {
      filteredRootTasks.forEach(task => flattenTask(task, 0));
    } else {
      rows.push({ type: 'empty', level: 0 });
    }

    return rows;
  }, [groupedTasks, filteredRootTasks, expandedTaskIds, filterStatus, filterPriority, tasks]);

  const ROW_HEIGHT = 48;
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: useCallback((index: number) => {
      const row = flatRows[index];
      return row?.type === 'group-header' ? 40 : row?.type === 'empty' ? 160 : ROW_HEIGHT;
    }, [flatRows]),
    overscan: 10,
  });

  // Column width definitions shared between header and body rows
  const COL_WIDTHS = {
    checkbox: '3.5%',
    title: '28%',
    status: '8%',
    priority: '7%',
    assignee: '14%',
    startDate: '10%',
    endDate: '10%',
    duration: '6%',
    progress: '10%',
    actions: '3.5%',
  };

  const renderColGroup = () => (
    <colgroup>
      <col style={{ width: COL_WIDTHS.checkbox }} />
      <col style={{ width: COL_WIDTHS.title }} />
      <col style={{ width: COL_WIDTHS.status }} />
      <col style={{ width: COL_WIDTHS.priority }} />
      <col style={{ width: COL_WIDTHS.assignee }} />
      <col style={{ width: COL_WIDTHS.startDate }} />
      <col style={{ width: COL_WIDTHS.endDate }} />
      <col style={{ width: COL_WIDTHS.duration }} />
      <col style={{ width: COL_WIDTHS.progress }} />
      <col style={{ width: COL_WIDTHS.actions }} />
    </colgroup>
  );

  const renderTaskRow = (task: Task, level: number): React.ReactNode => {
    const children = getChildren(task.id!);
    const hasChildren = children.length > 0;
    const isExpanded = expandedTaskIds.has(task.id!);
    const assignees = getAssigneeNames(task.assigneeIds);
    const overdue = isOverdue(task);
    const duration = getDuration(task);
    const isStatusEditing = editingCell?.taskId === task.id && editingCell?.field === 'status';
    const isPriorityEditing = editingCell?.taskId === task.id && editingCell?.field === 'priority';
    const isSelected = selectedTaskIds.has(task.id!);

    return (
      <React.Fragment key={task.id}>
        <tr
          className={`group border-b border-gray-800/40 hover:bg-indigo-500/[0.04] transition-all duration-150 cursor-pointer ${overdue ? 'bg-red-900/[0.06]' : ''} ${hasChildren ? 'bg-gray-800/20' : ''} ${isSelected ? 'bg-indigo-500/[0.08]' : ''}`}
          onClick={() => openTaskModal(task.id)}
        >
          <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
            <input 
              type="checkbox" 
              checked={isSelected}
              onChange={(e) => handleSelectTask(task.id!, e.target.checked)}
              className="rounded border-gray-700 bg-gray-800 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
            />
          </td>
          <td className="px-4 py-3.5 text-sm">
            <div className="flex items-center" style={{ paddingLeft: `${level * 1.5}rem` }}>
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleTaskExpansion(task.id!); }}
                  className="mr-2 p-0.5 rounded text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors flex-shrink-0"
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              ) : (
                <span className="w-7 inline-block flex-shrink-0" />
              )}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {!hasChildren && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    task.status === 'done' ? 'bg-emerald-400' : task.status === 'in_progress' ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'
                  }`} />
                )}
                <span 
                  className={`truncate ${hasChildren ? 'font-semibold text-gray-100' : 
                    task.status === 'done' ? 'text-emerald-400/70 group-hover:text-emerald-300' :
                    task.status === 'in_progress' ? 'text-blue-400 group-hover:text-blue-300' :
                    'text-gray-300 group-hover:text-gray-100'}`}
                  title={task.title}
                >
                  {task.externalUrl ? (
                    <a
                      href={task.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400/80 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                      onClick={e => e.stopPropagation()}
                      title={`跳转：${task.externalUrl}`}
                    >
                      {task.title}
                      <ExternalLink size={11} className="shrink-0 opacity-50" />
                    </a>
                  ) : task.title}
                </span>
                {overdue && (
                  <span title="已逾期" className="shrink-0">
                    <AlertTriangle size={14} className="text-red-400 animate-pulse" />
                  </span>
                )}
                {hasChildren && (
                  <span className="text-[10px] text-gray-600 bg-gray-800/60 px-1.5 py-0.5 rounded shrink-0">
                    {children.length}项
                  </span>
                )}
              </div>
            </div>
          </td>
          <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
            {renderStatusBadge(task)}
            {isStatusEditing && renderStatusDropdown(task)}
          </td>
          <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
            {renderPriorityBadge(task)}
            {isPriorityEditing && renderPriorityDropdown(task)}
          </td>
          <td className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              {assignees.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {assignees.slice(0, 2).map((r, idx) => (
                      <div
                        key={r.id}
                        className="relative w-7 h-7 rounded-full bg-indigo-600 ring-2 ring-[#0f1115] flex items-center justify-center text-[10px] font-bold text-white overflow-visible"
                        title={`${r.name} (${r.role})${(() => { const s = getEffectiveStatus(r); return s === 'wfh' ? ' - 居家' : s === 'sick' ? ' - 欠佳' : s === 'leave' ? ' - 休假' : s === 'focus' ? ' - 专注' : ''; })()}`}
                        style={{ zIndex: assignees.length - idx }}
                      >
                        {r.avatar ? (
                          <img src={r.avatar} alt={r.name} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          r.name.length > 2 ? r.name.substring(r.name.length - 2) : r.name
                        )}
                        {/* Status indicator dot */}
                        {(() => { const effStatus = getEffectiveStatus(r); return effStatus && effStatus !== 'active' ? (
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f1115] ${
                            effStatus === 'wfh' ? 'bg-blue-400' :
                            effStatus === 'sick' ? 'bg-orange-400' :
                            effStatus === 'leave' ? 'bg-purple-400' :
                            effStatus === 'focus' ? 'bg-red-400' : ''
                          }`} />
                        ) : null; })()}
                      </div>
                    ))}
                    {assignees.length > 2 && (
                      <div className="w-7 h-7 rounded-full bg-gray-700 ring-2 ring-[#0f1115] flex items-center justify-center text-[10px] text-gray-300">
                        +{assignees.length - 2}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 truncate max-w-[80px]" title={assignees.map(r => r.name).join('、')}>
                    {assignees.length === 1 ? assignees[0].name : `${assignees[0].name}等`}
                  </span>
                </div>
              ) : (
                <span className="text-gray-600 text-xs italic">未分配</span>
              )}
            </div>
          </td>
          <td className="px-4 py-3.5 text-sm text-gray-400">
            <div className="flex flex-col">
              {task.startDate ? (
              <span className="text-gray-300 font-medium text-[13px]">{format(new Date(task.startDate), 'MM/dd', { locale: zhCN })} <span className="text-gray-500 font-normal">{format(new Date(task.startDate), 'E', { locale: zhCN })}</span></span>
              ) : <span className="text-gray-600 text-[13px]">未排期</span>}
            </div>
          </td>
          <td className={`px-4 py-3.5 text-sm ${overdue ? 'text-red-400' : 'text-gray-400'}`}>
            <div className="flex flex-col">
              {task.endDate ? (
              <span className={`font-medium text-[13px] ${overdue ? 'text-red-400' : 'text-gray-300'}`}>{format(new Date(task.endDate), 'MM/dd', { locale: zhCN })} <span className={`font-normal ${overdue ? 'text-red-500/70' : 'text-gray-500'}`}>{format(new Date(task.endDate), 'E', { locale: zhCN })}</span></span>
              ) : <span className="text-gray-600 text-[13px]">未排期</span>}
            </div>
          </td>
          <td className="px-4 py-3.5 text-sm text-center">
            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-medium ${
              duration === 0 ? 'bg-gray-800/50 text-gray-500' : duration <= 1 ? 'bg-blue-500/10 text-blue-400' : 'bg-indigo-500/10 text-indigo-400'
            }`}>
              {duration}天
            </span>
          </td>
          <td className="px-4 py-3.5 min-w-[140px]">{renderProgressBar(task)}</td>
          <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
              <button onClick={() => openTaskModal(task.id)} className="p-1.5 rounded-lg hover:bg-indigo-500/15 text-gray-500 hover:text-indigo-400 transition-colors" title="编辑">
                <Edit2 size={14} />
              </button>
              <button onClick={() => handleDeleteTask(task.id!)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-gray-500 hover:text-red-400 transition-colors" title="删除">
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>
      </React.Fragment>
    );
  };

  React.useEffect(() => {
    const handleClick = () => setEditingCell(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const totalTasks = tasks?.length || 0;
  const doneTasks = tasks?.filter(t => t.status === 'done').length || 0;
  const inProgressTasks = tasks?.filter(t => t.status === 'in_progress').length || 0;
  const overdueTasks = tasks?.filter(t => isOverdue(t)).length || 0;

  return (
    <div className="flex-1 overflow-auto bg-[#0f1115] flex flex-col relative">
      <div className="p-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-100">表格视图</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-gray-500 mr-4">
              <span>共 <strong className="text-gray-300">{totalTasks}</strong> 个任务</span>
              <span className="text-emerald-500">{doneTasks} 已完成</span>
              <span className="text-blue-500">{inProgressTasks} 进行中</span>
              {overdueTasks > 0 && <span className="text-red-400">{overdueTasks} 已逾期</span>}
            </div>
            
            <div className="flex items-center gap-2 mr-2 border-r border-gray-800 pr-4">
              <Layers size={14} className="text-gray-500" />
              <span className="text-xs text-gray-500">分组：</span>
              <select 
                value={groupBy} 
                onChange={(e) => setGroupBy(e.target.value as GroupBy)} 
                className="bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-300 px-2 py-1 focus:outline-none focus:border-indigo-500/50"
              >
                <option value="none">无</option>
                <option value="status">按状态</option>
                <option value="person">按人员</option>
                <option value="priority">按优先级</option>
              </select>
            </div>

            <button onClick={() => openTaskModal()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus size={16} />
              新建任务
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
            placeholder="搜索任务详情..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${showFilters || filterStatus !== 'all' || filterPriority !== 'all' ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-300'}`}
          >
            <Filter size={16} />
            筛选
            {(filterStatus !== 'all' || filterPriority !== 'all') && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
          </button>
        </div>
        {showFilters && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">状态：</span>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-300 px-2 py-1 focus:outline-none focus:border-indigo-500/50">
                <option value="all">全部</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">优先级：</span>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-300 px-2 py-1 focus:outline-none focus:border-indigo-500/50">
                <option value="all">全部</option>
                <option value="">未设置 (-)</option>
                {PRIORITY_OPTIONS.filter(p => p.value !== '').map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            {(filterStatus !== 'all' || filterPriority !== 'all') && (
              <button onClick={() => { setFilterStatus('all'); setFilterPriority('all'); }} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>
      <div ref={tableContainerRef} className="flex-1 overflow-auto p-6">
        <div className="min-w-[1200px] bg-gray-900/40 rounded-xl border border-gray-800/50 overflow-visible shadow-2xl mb-16">
          <table className="w-full table-fixed">
            {renderColGroup()}
            <thead>
              <tr className="border-b-2 border-indigo-500/15 bg-[#13151f]">
                <th className="text-left px-4 py-3.5">
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll} 
                    checked={selectedTaskIds.size > 0 && filteredRootTasks.length > 0}
                    className="rounded border-gray-700 bg-gray-800 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer" 
                  />
                </th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <button onClick={() => handleSort('title')} className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">任务详情 <SortIcon field="title" /></button>
                </th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">状态 <SortIcon field="status" /></button>
                </th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('priority')} className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">优先级 <SortIcon field="priority" /></button>
                </th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">负责人</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('startDate')} className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">开始日期 <SortIcon field="startDate" /></button>
                </th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('endDate')} className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">截止日期 <SortIcon field="endDate" /></button>
                </th>
                <th className="text-center px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">工期</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('progress')} className="flex items-center gap-1.5 hover:text-gray-200 transition-colors">进度 <SortIcon field="progress" /></button>
                </th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={10} style={{ padding: 0 }}>
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map(virtualRow => {
                      const flatRow = flatRows[virtualRow.index];
                      if (flatRow.type === 'group-header') {
                        return (
                          <div
                            key={`group-${virtualRow.index}`}
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="bg-gray-800/60 border-y border-gray-700/50"
                          >
                            <div className="px-4 py-2.5 text-sm font-semibold text-indigo-300">
                              {flatRow.groupLabel} <span className="text-gray-500 text-xs ml-2 font-normal">({flatRow.groupCount} 项)</span>
                            </div>
                          </div>
                        );
                      }
                      if (flatRow.type === 'empty') {
                        return (
                          <div
                            key="empty"
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="text-center py-16 text-gray-500"
                          >
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center">
                                <Search size={20} className="text-gray-600" />
                              </div>
                              <p className="text-sm">
                                {searchQuery || filterStatus !== 'all' || filterPriority !== 'all' ? '没有找到匹配的任务' : '暂无任务数据'}
                              </p>
                              {!searchQuery && filterStatus === 'all' && filterPriority === 'all' && (
                                <button onClick={() => openTaskModal()} className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
                                  创建第一个任务
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }
                      // Task row
                      const task = flatRow.task!;
                      const level = flatRow.level;
                      return (
                        <div
                          key={task.id}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <table className="w-full table-fixed">{renderColGroup()}<tbody>{renderTaskRow(task, level)}</tbody></table>
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedTaskIds.size > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 shadow-2xl rounded-xl px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare size={16} className="text-indigo-400" />
            <span className="text-gray-300">已选择 <strong className="text-indigo-400">{selectedTaskIds.size}</strong> 项</span>
          </div>
          <div className="w-px h-6 bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">修改状态:</span>
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleBatchStatus(opt.value as Task['status'])}
                className="px-3 py-1.5 text-xs rounded-md bg-gray-700/50 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">优先级:</span>
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value || 'none'}
                onClick={() => handleBatchPriority(opt.value as Task['priority'])}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                  opt.value === 'high' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' :
                  opt.value === 'medium' ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20' :
                  opt.value === 'low' ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' :
                  'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20'
                }`}
              >
                <Flag size={11} />
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-gray-700" />
          <button
            onClick={handleBatchDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={14} />
            批量删除
          </button>
          <button
            onClick={() => setSelectedTaskIds(new Set())}
            className="ml-2 text-gray-500 hover:text-gray-300 transition-colors"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}