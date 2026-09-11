import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult, BeforeCapture } from '@hello-pangea/dnd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task, Resource } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { Clock, AlertCircle, CheckCircle2, MoreVertical, User, Filter, Users, ChevronDown, X, ExternalLink, Edit2, Trash2, Plus, Settings2, Search, ChevronRight } from 'lucide-react';
import { Avatar } from './common/Avatar';
import { compareResources, getRoleOrderIndex } from './gantt/constants';
import { getEffectiveStatus } from '../types/resource';
import { syncParentDateRange } from '../services/workloadService';
import EmptyState from './common/EmptyState';
import { confirmDialog } from './common/ConfirmDialog';

const COLUMNS = [
  { id: 'todo', title: '待办', color: 'bg-slate-800/40', borderColor: 'border-slate-700/50' },
  { id: 'in_progress', title: '进行中', color: 'bg-blue-900/20', borderColor: 'border-blue-700/40' },
  { id: 'done', title: '已完成', color: 'bg-emerald-900/20', borderColor: 'border-emerald-700/40' },
  { id: 'cancelled', title: '已关闭', color: 'bg-red-900/20', borderColor: 'border-red-700/40' }
];

export const KanbanBoard: React.FC = () => {
  const { selectedProjectId, openTaskModal, selectedMemberId, setSelectedMemberId } = useStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groupBy, setGroupBy] = useState<'status' | 'person' | 'priority'>('person');
  const [filterPersonId, setFilterPersonId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: number } | null>(null);

  // Quick create state
  const [quickCreateColumnId, setQuickCreateColumnId] = useState<string | null>(null);
  const [quickCreateTitle, setQuickCreateTitle] = useState('');
  const quickCreateInputRef = useRef<HTMLInputElement>(null);
  const [newlyCreatedTaskId, setNewlyCreatedTaskId] = useState<number | null>(null);

  // WIP limit state: columnId -> max task count (0 = unlimited)
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({});
  const [wipEditingColumnId, setWipEditingColumnId] = useState<string | null>(null);
  const [wipEditValue, setWipEditValue] = useState('');

  // Collapsed columns state
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());

  // Panning state
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, scrollLeft: 0 });
  const boardRef = useRef<HTMLDivElement>(null);

  // Handle spacebar for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleBoardMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed && boardRef.current) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX,
        scrollLeft: boardRef.current.scrollLeft
      });
    }
  };

  const handleBoardMouseMove = (e: React.MouseEvent) => {
    if (isPanning && boardRef.current) {
      const dx = e.clientX - panStart.x;
      boardRef.current.scrollLeft = panStart.scrollLeft - dx;
    }
  };

  const handleBoardMouseUp = () => {
    setIsPanning(false);
  };

  const handleBoardWheel = (e: React.WheelEvent) => {
    if (boardRef.current && e.deltaY !== 0 && !e.shiftKey) {
      const target = e.target as HTMLElement;
      const isOverColumn = target.closest('.kanban-column-scrollable');
      
      if (!isOverColumn) {
        boardRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const toggleColumnCollapse = (columnId: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  };

  // Physics drag state
  const [settledTaskId, setSettledTaskId] = useState<number | null>(null);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawTasks = useLiveQuery(
    () => selectedProjectId 
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  );

  const resources = useLiveQuery(() => db.resources.toArray(), []) || [];

  useEffect(() => {
    if (rawTasks) {
      setTasks(rawTasks);
    }
  }, [rawTasks]);

  // Sync sidebar member selection with local filter
  useEffect(() => {
    if (selectedMemberId !== null) {
      setFilterPersonId(selectedMemberId);
    }
  }, [selectedMemberId]);

  // Filtered tasks: exclude parent tasks (tasks that have children), apply person filter
  const filteredTasks = useMemo(() => {
    // Build a set of parent task IDs (tasks that have children)
    const parentTaskIds = new Set<number>();
    tasks.forEach(t => {
      if (t.parentId) parentTaskIds.add(t.parentId);
    });

    // Filter out all parent tasks including nested ones (keep only leaf tasks)
    let result = tasks.filter(t => !(t.id && parentTaskIds.has(t.id)));

    if (filterPersonId !== null) {
      result = result.filter(t => t.assigneeIds?.includes(filterPersonId));
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.title.toLowerCase().includes(query) || 
        (t.description && t.description.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [tasks, filterPersonId, searchQuery]);

  // Status color bar mapping for task cards
  const getStatusBarColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-500';
      case 'done': return 'bg-emerald-500';
      default: return 'bg-gray-500';
    }
  };

  // Column header accent color mapping
  const getColumnAccentColor = (columnId: string) => {
    if (columnId === 'todo' || columnId.includes('unassigned') || columnId === 'priority-none') return 'bg-gray-500';
    if (columnId === 'in_progress') return 'bg-blue-500';
    if (columnId === 'done') return 'bg-emerald-500';
    if (columnId === 'priority-high') return 'bg-red-500';
    if (columnId === 'priority-medium') return 'bg-yellow-500';
    if (columnId === 'priority-low') return 'bg-blue-500';
    if (columnId.startsWith('person-')) return 'bg-indigo-500';
    return 'bg-gray-500';
  };

  // Dynamic columns based on groupBy mode
  const columns = useMemo(() => {
    switch (groupBy) {
      case 'person': {
        const personCols = [...resources].filter(r => r.status !== 'departed').sort(compareResources).map(r => ({
          id: `person-${r.id}`,
          title: r.name,
          subtitle: r.role || '',
          color: 'bg-indigo-900/15',
          borderColor: 'border-indigo-800/40',
          filterFn: (t: Task) => t.assigneeIds?.includes(r.id!) || false,
        }));
        personCols.push({
          id: 'person-unassigned',
          title: '未分配',
          subtitle: '',
          color: 'bg-gray-800/50',
          borderColor: 'border-gray-700',
          filterFn: (t: Task) => !t.assigneeIds || t.assigneeIds.length === 0,
        });
        return personCols;
      }
      case 'priority': {
        return [
          { id: 'priority-high', title: '高优先级', subtitle: '', color: 'bg-red-900/20', borderColor: 'border-red-800/40', filterFn: (t: Task) => t.priority === 'high' },
          { id: 'priority-medium', title: '中优先级', subtitle: '', color: 'bg-yellow-900/20', borderColor: 'border-yellow-800/40', filterFn: (t: Task) => t.priority === 'medium' },
          { id: 'priority-low', title: '低优先级', subtitle: '', color: 'bg-blue-900/20', borderColor: 'border-blue-800/40', filterFn: (t: Task) => t.priority === 'low' },
          { id: 'priority-none', title: '无优先级', subtitle: '', color: 'bg-gray-800/50', borderColor: 'border-gray-700', filterFn: (t: Task) => !t.priority },
        ];
      }
      default: // status
        return [
          { id: 'todo', title: '待办', subtitle: '', color: 'bg-slate-800/40', borderColor: 'border-slate-700/50', filterFn: (t: Task) => t.status === 'todo' },
          { id: 'in_progress', title: '进行中', subtitle: '', color: 'bg-blue-900/20', borderColor: 'border-blue-700/40', filterFn: (t: Task) => t.status === 'in_progress' },
          { id: 'done', title: '已完成', subtitle: '', color: 'bg-emerald-900/20', borderColor: 'border-emerald-700/40', filterFn: (t: Task) => t.status === 'done' },
        ];
    }
  }, [groupBy, resources]);

  const getTasksForColumn = (col: typeof columns[0]) => {
    const colTasks = filteredTasks.filter(col.filterFn);
    // When grouped by person or priority, sort: todo & in_progress first, done last
    if (groupBy !== 'status') {
        const statusOrder: Record<string, number> = { todo: 0, in_progress: 1, done: 2, paused: 3, cancelled: 4 };
      colTasks.sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1));
    }
    return colTasks;
  };

  const onBeforeCapture = useCallback((before: BeforeCapture) => {
    setIsDraggingGlobal(true);
  }, []);

  const onDragEnd = async (result: DropResult) => {
    setIsDraggingGlobal(false);
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const taskId = parseInt(draggableId, 10);

    // Trigger settle animation
    setSettledTaskId(taskId);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => setSettledTaskId(null), 500);

    // Handle reordering within the same column
    if (destination.droppableId === source.droppableId) {
      const columnTasks = getTasksForColumn(columns.find(c => c.id === destination.droppableId)!);
      const newTasks = Array.from(columnTasks);
      const [movedTask] = newTasks.splice(source.index, 1);
      newTasks.splice(destination.index, 0, movedTask);

      // Update order for all affected tasks
      const updates = newTasks.map((t, index) => ({
        id: t.id!,
        changes: { order: index }
      }));

      try {
        // Update local state optimistically
        const updatedTasks = tasks.map(t => {
          const update = updates.find(u => u.id === t.id);
          return update ? { ...t, order: update.changes.order } : t;
        });
        setTasks(updatedTasks);

        // Update database
        await Promise.all(updates.map(u => db.tasks.update(u.id, u.changes)));
        // We don't track order changes in history to avoid spam
      } catch (error) {
        console.error('Failed to update task order:', error);
        if (rawTasks) setTasks(rawTasks);
      }
      return;
    }

    // Only allow status change when grouped by status
    if (groupBy === 'status') {
      const newStatus = destination.droppableId as Task['status'];
      const newTasks = Array.from(tasks);
      const taskIndex = newTasks.findIndex(t => t.id === taskId);
      if (taskIndex > -1) {
        newTasks[taskIndex] = { ...newTasks[taskIndex], status: newStatus };
        setTasks(newTasks);
      }
      try {
        await trackedDb.tasks.update(taskId, { status: newStatus }, `看板移动任务状态为「${newStatus === 'todo' ? '待办' : newStatus === 'in_progress' ? '进行中' : '已完成'}」`);
      } catch (error) {
        console.error('Failed to update task status:', error);
        if (rawTasks) setTasks(rawTasks);
      }
    } else if (groupBy === 'person') {
      // Move task to another person
      const destColId = destination.droppableId;
      if (destColId === 'person-unassigned') {
        await trackedDb.tasks.update(taskId, { assigneeIds: [] }, '移除任务负责人');
      } else {
        const personId = parseInt(destColId.replace('person-', ''), 10);
        if (!isNaN(personId)) {
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            const currentIds = task.assigneeIds || [];
            // Remove from old person columns, add to new
            const sourceColId = source.droppableId;
            const oldPersonId = sourceColId === 'person-unassigned' ? null : parseInt(sourceColId.replace('person-', ''), 10);
            let newIds = currentIds.filter(id => id !== oldPersonId);
            if (!newIds.includes(personId)) newIds.push(personId);
            await trackedDb.tasks.update(taskId, { assigneeIds: newIds }, '变更任务负责人');
          }
        }
      }
      // Refresh
      const updated = await db.tasks.toArray();
      setTasks(updated);
    } else if (groupBy === 'priority') {
      const destColId = destination.droppableId;
      let newPriority: Task['priority'] | undefined = undefined;
      if (destColId === 'priority-high') newPriority = 'high';
      else if (destColId === 'priority-medium') newPriority = 'medium';
      else if (destColId === 'priority-low') newPriority = 'low';
      
      await trackedDb.tasks.update(taskId, { priority: newPriority as any }, `变更任务优先级为「${newPriority === 'high' ? '高' : newPriority === 'medium' ? '中' : newPriority === 'low' ? '低' : '无'}」`);
      const updated = await db.tasks.toArray();
      setTasks(updated);
    }
  };

  const getPriorityColor = (priority: string | undefined) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'low': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getPriorityLabel = (priority: string | undefined) => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '无';
    }
  };

  const renderAssignees = (assigneeIds?: number[]) => {
    if (!assigneeIds || assigneeIds.length === 0) return null;
    
    const assignedResources = assigneeIds
      .map(id => resources.find(r => r.id === id))
      .filter(Boolean) as Resource[];

    // Sort by role order (UX→UI→Layout→…)
    assignedResources.sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role));

    if (assignedResources.length === 0) return null;

    return (
      <div className="flex -space-x-2 overflow-hidden">
        {assignedResources.slice(0, 3).map((resource, i) => (
          <div key={resource.id} style={{ zIndex: 3 - i }} className="relative group">
            <Avatar
              name={resource.name}
              avatar={resource.avatar}
              type={resource.type}
              size="sm"
              avatarStyle={resource.avatarStyle}
            />
            {/* Status indicator dot */}
            {(() => { const effStatus = getEffectiveStatus(resource); return effStatus && effStatus !== 'active' ? (
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-800 ${
                effStatus === 'wfh' ? 'bg-blue-400' :
                effStatus === 'sick' ? 'bg-orange-400' :
                effStatus === 'leave' ? 'bg-purple-400' :
                effStatus === 'focus' ? 'bg-red-400' : ''
              }`} />
            ) : null; })()}
            {/* Tooltip to show full name */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block px-2 py-1 bg-gray-800 text-xs text-white rounded whitespace-nowrap z-50 shadow-xl border border-gray-700">
              {resource.name}
              {(() => { const effStatus = getEffectiveStatus(resource); return (
                <>{effStatus === 'wfh' && ' (居家)'}
                {effStatus === 'sick' && ' (欠佳)'}
                {effStatus === 'leave' && ' (休假)'}
                {effStatus === 'focus' && ' (专注)'}</>
              ); })()}
            </div>
          </div>
        ))}
        {assignedResources.length > 3 && (
          <div className="inline-block h-6 w-6 rounded-full ring-2 ring-gray-800 bg-gray-600 flex items-center justify-center text-[10px] font-medium text-white z-0">
            +{assignedResources.length - 3}
          </div>
        )}
      </div>
    );
  };

  const clearFilter = () => {
    setFilterPersonId(null);
    setSelectedMemberId(null);
  };

  // Quick create task handler
  const handleQuickCreate = async (columnId: string) => {
    const title = quickCreateTitle.trim();
    if (!title) {
      setQuickCreateColumnId(null);
      setQuickCreateTitle('');
      return;
    }

    // Determine task properties based on groupBy mode and column
    let status: Task['status'] = 'todo';
    let assigneeIds: number[] = [];
    let priority: Task['priority'] | undefined = undefined;

    if (groupBy === 'status') {
      status = columnId as Task['status'];
    } else if (groupBy === 'person') {
      if (columnId !== 'person-unassigned') {
        const personId = parseInt(columnId.replace('person-', ''), 10);
        if (!isNaN(personId)) assigneeIds = [personId];
      }
    } else if (groupBy === 'priority') {
      if (columnId === 'priority-high') priority = 'high';
      else if (columnId === 'priority-medium') priority = 'medium';
      else if (columnId === 'priority-low') priority = 'low';
    }

    try {
      const newTaskId = await trackedDb.tasks.add({
        title,
        status,
        priority: priority || 'medium',
        assigneeIds,
        progress: 0,
        dependencies: [],
        type: 'task',
        projectId: selectedProjectId || 1,
      } as Task, `快速创建任务「${title}」`);
      
      setNewlyCreatedTaskId(newTaskId as number);
      setTimeout(() => setNewlyCreatedTaskId(null), 2000); // Clear highlight after 2s
      
      // Scroll to bottom of the column
      setTimeout(() => {
        const columnEl = document.querySelector(`[data-rbd-droppable-id="${columnId}"]`);
        if (columnEl) {
          columnEl.scrollTop = columnEl.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error('Failed to quick create task:', error);
    }

    setQuickCreateColumnId(null);
    setQuickCreateTitle('');
  };

  // Focus input when quick create opens
  useEffect(() => {
    if (quickCreateColumnId && quickCreateInputRef.current) {
      quickCreateInputRef.current.focus();
    }
  }, [quickCreateColumnId]);

  // WIP limit helpers
  const getWipLimit = (columnId: string) => wipLimits[columnId] || 0;
  const isOverWipLimit = (columnId: string, taskCount: number) => {
    const limit = getWipLimit(columnId);
    return limit > 0 && taskCount > limit;
  };
  const handleWipSave = (columnId: string) => {
    const val = parseInt(wipEditValue, 10);
    if (!isNaN(val) && val >= 0) {
      setWipLimits(prev => ({ ...prev, [columnId]: val }));
    }
    setWipEditingColumnId(null);
    setWipEditValue('');
  };

  const activeFilterName = filterPersonId !== null 
    ? resources.find(r => r.id === filterPersonId)?.name || '未知' 
    : null;

  // Cleanup settle timer
  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, taskId: number) => {
    e.preventDefault();
    
    // Calculate position with boundary detection
    const menuWidth = 160;
    const menuHeight = 80; // Approximate height of the menu
    
    let x = e.clientX;
    let y = e.clientY;
    
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }
    
    setContextMenu({ x, y, taskId });
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

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#0f1115]">
      {/* Header with filters */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-100">看板视图</h2>
          
          {/* Group by selector */}
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-gray-500">分组：</span>
            <div className="flex bg-gray-800/60 rounded-lg p-0.5 border border-gray-700/50">
              {[
                { key: 'status' as const, label: '按状态' },
                { key: 'person' as const, label: '按人员' },
                { key: 'priority' as const, label: '按优先级' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setGroupBy(opt.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    groupBy === opt.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative ml-2">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search size={14} className="text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 pl-8 pr-3 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:bg-gray-800 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-500 hover:text-gray-300"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Person filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                filterPersonId !== null
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              <Filter size={13} />
              {activeFilterName ? `筛选：${activeFilterName}` : '筛选人员'}
              <ChevronDown size={12} />
            </button>
            
            {showFilterDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFilterDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-[#1e1e2e] border border-gray-700/60 rounded-lg shadow-2xl py-1 min-w-[160px]">
                  <button
                    onClick={() => { clearFilter(); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      filterPersonId === null ? 'text-indigo-300 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    全部人员
                  </button>
                  {[...resources].filter(r => r.status !== 'departed').sort(compareResources).map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setFilterPersonId(r.id!); setSelectedMemberId(r.id!); setShowFilterDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                        filterPersonId === r.id ? 'text-indigo-300 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-medium text-white shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <span>{r.name}</span>
                      <span className="text-[10px] text-gray-600 ml-auto">{r.role}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Active filter badge */}
          {filterPersonId !== null && (
            <button
              onClick={clearFilter}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-500/15 text-indigo-300 rounded-md border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
            >
              <X size={11} />
              清除筛选
            </button>
          )}
        </div>

        <button 
          onClick={() => openTaskModal()}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        >
          新建任务
        </button>
      </div>
      
      <div 
        ref={boardRef}
        className={`flex-1 overflow-x-auto overflow-y-hidden p-6 ${isSpacePressed ? 'cursor-grab' : ''} ${isPanning ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={handleBoardMouseUp}
        onMouseLeave={handleBoardMouseUp}
        onWheel={handleBoardWheel}
      >
        <DragDropContext onBeforeCapture={onBeforeCapture} onDragEnd={onDragEnd}>
          <div className="flex h-full gap-6 items-start">
            {columns.map(column => {
              const columnTasks = getTasksForColumn(column);
              const wipLimit = getWipLimit(column.id);
              const overLimit = isOverWipLimit(column.id, columnTasks.length);
              const isCollapsed = collapsedColumns.has(column.id);

              if (isCollapsed) {
                return (
                  <div 
                    key={column.id} 
                    className="flex flex-col w-12 shrink-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer hover:bg-gray-800/30 rounded-xl transition-colors"
                    onClick={() => toggleColumnCollapse(column.id)}
                    title={`展开 ${column.title}`}
                  >
                    <div className={`h-1 rounded-full mb-2 mx-1 opacity-70 ${getColumnAccentColor(column.id)}`} />
                    <div className="flex-1 flex flex-col items-center pt-4 border border-gray-800 rounded-xl bg-gray-900/50">
                      <span className="text-gray-400 mb-4"><ChevronRight size={16} /></span>
                      <div className="writing-vertical-rl text-gray-400 font-medium tracking-widest">
                        {column.title}
                      </div>
                      <div className="mt-4 px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs">
                        {columnTasks.length}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={column.id} className="flex flex-col w-80 shrink-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Column header accent bar */}
                  <div className={`h-1 rounded-full mb-2 mx-1 opacity-70 ${getColumnAccentColor(column.id)}`} />
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2 cursor-pointer group" onClick={() => toggleColumnCollapse(column.id)}>
                      <ChevronDown size={14} className="text-gray-500 group-hover:text-gray-300 transition-colors" />
                      <div>
                        <h3 className="font-medium text-gray-300 flex items-center gap-2">
                          {column.title}
                          <span className={`text-xs px-2 py-0.5 rounded-full transition-all duration-300 ${
                            overLimit
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                              : isDraggingGlobal
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-gray-800 text-gray-400'
                          }`}>
                            {columnTasks.length}{wipLimit > 0 ? `/${wipLimit}` : ''}
                          </span>
                          {overLimit && (
                            <span className="text-[10px] text-red-400 font-normal" title="超出WIP限制">
                              ⚠️ 超限
                            </span>
                          )}
                        </h3>
                        {column.subtitle && (
                          <span className="text-[10px] text-gray-500">{column.subtitle}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* WIP limit setting */}
                      {wipEditingColumnId === column.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={wipEditValue}
                            onChange={(e) => setWipEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleWipSave(column.id);
                              if (e.key === 'Escape') { setWipEditingColumnId(null); setWipEditValue(''); }
                            }}
                            onBlur={() => handleWipSave(column.id)}
                            autoFocus
                            className="w-12 px-1.5 py-0.5 text-xs bg-gray-800 border border-indigo-500/50 rounded text-gray-200 outline-none focus:border-indigo-400"
                            placeholder="0"
                            title="0 = 不限制"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setWipEditingColumnId(column.id);
                            setWipEditValue(wipLimit > 0 ? wipLimit.toString() : '');
                          }}
                          className={`p-1 rounded-md transition-colors ${
                            wipLimit > 0
                              ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10'
                              : 'text-gray-600 hover:text-gray-400 hover:bg-gray-700/50'
                          }`}
                          title={wipLimit > 0 ? `WIP限制: ${wipLimit} (点击修改)` : '设置WIP限制'}
                        >
                          <Settings2 size={13} />
                        </button>
                      )}
                      {/* Quick create button */}
                      <button
                        onClick={() => {
                          setQuickCreateColumnId(column.id);
                          setQuickCreateTitle('');
                        }}
                        className="p-1 rounded-md text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                        title="快速创建任务"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`kanban-column-scrollable flex-1 overflow-y-auto rounded-xl border p-3 transition-all duration-300 ${
                          snapshot.isDraggingOver
                            ? `kanban-column-active ${column.borderColor}`
                            : overLimit
                              ? `border-red-500/30 bg-red-900/5 ${column.color}`
                              : `${column.borderColor} ${column.color}`
                        }`}
                      >
                        {/* Quick create inline input */}
                        {quickCreateColumnId === column.id && (
                          <div className="mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="bg-gray-800/80 border border-indigo-500/40 rounded-lg p-2 shadow-lg shadow-indigo-500/5">
                              <input
                                ref={quickCreateInputRef}
                                type="text"
                                value={quickCreateTitle}
                                onChange={(e) => setQuickCreateTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleQuickCreate(column.id);
                                  } else if (e.key === 'Escape') {
                                    setQuickCreateColumnId(null);
                                    setQuickCreateTitle('');
                                  }
                                }}
                                onBlur={() => {
                                  // Delay to allow button click to register
                                  setTimeout(() => {
                                    if (quickCreateTitle.trim()) {
                                      handleQuickCreate(column.id);
                                    } else {
                                      setQuickCreateColumnId(null);
                                      setQuickCreateTitle('');
                                    }
                                  }, 150);
                                }}
                                placeholder="输入任务名称，回车创建..."
                                className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
                              />
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50">
                                <span className="text-[10px] text-gray-500">
                                  Enter 创建 · Esc 取消
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    onMouseDown={(e) => { e.preventDefault(); handleQuickCreate(column.id); }}
                                    className="px-2 py-0.5 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                                  >
                                    创建
                                  </button>
                                  <button
                                    onMouseDown={(e) => { e.preventDefault(); setQuickCreateColumnId(null); setQuickCreateTitle(''); }}
                                    className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-3 min-h-[100px] relative">
                          {columnTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id!.toString()} index={index}>
                              {(provided, snapshot) => {
                                const isDragging = snapshot.isDragging;
                                const isSettling = settledTaskId === task.id;
                                const isNewlyCreated = newlyCreatedTaskId === task.id;
                                const cardClass = isDragging
                                  ? 'kanban-card-dragging'
                                  : isSettling
                                    ? 'kanban-card-settled'
                                    : 'kanban-card-idle';

                                return (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => !isDragging && openTaskModal(task.id)}
                                    onContextMenu={(e) => handleContextMenu(e, task.id!)}
                                    className={`group/card bg-gray-800 border border-gray-700 rounded-lg overflow-hidden cursor-pointer select-none ${cardClass} ${
                                      isDragging
                                        ? 'shadow-2xl shadow-indigo-500/20 ring-2 ring-indigo-500 scale-105 rotate-2 z-50'
                                        : isNewlyCreated
                                          ? 'shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/50 animate-pulse'
                                          : 'shadow-sm hover:border-gray-500'
                                    }`}
                                    style={{
                                      ...provided.draggableProps.style,
                                      // Override the default drop animation with our physics-based one
                                      ...(snapshot.isDropAnimating ? {
                                        transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                      } : {}),
                                    }}
                                  >
                                    {/* Left status color bar */}
                                    <div className="flex">
                                    <div className={`w-[3px] shrink-0 ${getStatusBarColor(task.status)}`} />
                                    <div className="flex-1 p-4">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="flex items-center gap-2">
                                        {/* Status badge when not grouped by status */}
                                        {groupBy !== 'status' && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const nextStatus = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : task.status === 'done' ? 'cancelled' : 'todo';
                                              await trackedDb.tasks.update(task.id!, { status: nextStatus }, `快速切换任务状态为「${nextStatus === 'todo' ? '待办' : nextStatus === 'in_progress' ? '进行中' : '已完成'}」`);
                                            }}
                                            className={`opacity-0 group-hover/card:opacity-100 text-[10px] px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity cursor-pointer ${
                                            task.status === 'done' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                            task.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                                            'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                                          }`}
                                            title="点击快速切换状态"
                                          >
                                            {task.status === 'done' ? '已完成' : task.status === 'in_progress' ? '进行中' : task.status === 'cancelled' ? '已关闭' : '待办'}
                                          </button>
                                        )}
                                        {groupBy === 'status' && (
                                          <button 
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const nextStatus = task.status === 'done' ? 'todo' : 'done';
                                              await trackedDb.tasks.update(task.id!, { status: nextStatus }, `快速${nextStatus === 'done' ? '完成' : '重置'}任务`);
                                            }}
                                            title={task.status === 'done' ? '标记为未完成' : '标记为已完成'}
                                            className={`opacity-0 group-hover/card:opacity-100 shrink-0 p-0.5 rounded-full border transition-all ${
                                              task.status === 'done' 
                                                ? 'bg-emerald-500 border-emerald-500 text-white' 
                                                : 'bg-transparent border-gray-500 text-transparent hover:border-emerald-500 hover:text-emerald-500'
                                            }`}
                                          >
                                            <CheckCircle2 size={12} strokeWidth={3} />
                                          </button>
                                        )}
                                        <span className={`text-[10px] px-2 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                                          {getPriorityLabel(task.priority)}
                                        </span>
                                      </div>
                                      <button 
                                        className="opacity-0 group-hover/card:opacity-100 text-gray-500 hover:text-gray-300 p-1 -mr-2 -mt-2 rounded-md hover:bg-gray-700 transition-all" 
                                        onClick={(e) => { e.stopPropagation(); handleContextMenu(e, task.id!); }}
                                      >
                                        <MoreVertical size={14} />
                                      </button>
                                    </div>
                                    
                                    <h4 className="text-sm font-medium text-gray-200 mb-2 line-clamp-2">
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
                                    </h4>
                                    
                                    {task.type === 'milestone' && (
                                      <div className="mb-3">
                                        <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">
                                          里程碑
                                        </span>
                                      </div>
                                    )}

                                    {/* Subtasks progress */}
                                    {(() => {
                                      const subtasks = tasks.filter(t => t.parentId === task.id);
                                      if (subtasks.length > 0) {
                                        const completed = subtasks.filter(t => t.status === 'done').length;
                                        return (
                                          <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
                                            <CheckCircle2 size={12} className={completed === subtasks.length ? 'text-emerald-400' : 'text-gray-500'} />
                                            <span className={completed === subtasks.length ? 'text-emerald-400/80' : ''}>
                                              {completed}/{subtasks.length}
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}

                                    <div className="flex items-center justify-between mt-4">
                                      <div className="flex items-center gap-3 text-xs text-gray-500">
                                        {task.endDate ? (
                                        <div className="flex items-center gap-1" title="截止日期">
                                          <Clock size={12} className={new Date(task.endDate) < new Date() && task.status !== 'done' ? 'text-red-400' : ''} />
                                          <span className={new Date(task.endDate) < new Date() && task.status !== 'done' ? 'text-red-400' : ''}>
                                            {format(new Date(task.endDate), 'MM-dd')}
                                          </span>
                                        </div>
                                        ) : (
                                        <div className="flex items-center gap-1 text-gray-600" title="未排期">
                                          <Clock size={12} />
                                          <span>未排期</span>
                                        </div>
                                        )}
                                        {task.dependencies && task.dependencies.length > 0 && (
                                          <div className="flex items-center gap-1" title="有前置依赖">
                                            <AlertCircle size={12} />
                                            <span>{task.dependencies.length}</span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {renderAssignees(task.assigneeIds)}
                                    </div>
                                    </div>{/* end flex-1 p-4 */}
                                    </div>{/* end flex row with status bar */}
                                  </div>
                                );
                              }}
                            </Draggable>
                          ))}
                          {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                            <EmptyState variant="no-tasks" title="暂无任务" size="sm" />
                          )}
                          {columnTasks.length === 0 && snapshot.isDraggingOver && (
                            <div className="kanban-empty-drop-zone rounded-lg py-8 text-center text-indigo-400/60 text-xs border border-dashed border-indigo-500/20">
                              释放以放置到此列
                            </div>
                          )}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { openTaskModal(contextMenu.taskId); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
          >
            <Edit2 size={14} />
            编辑任务
          </button>
          <div className="h-px bg-gray-700 my-1" />
          <button
            onClick={() => handleDeleteTask(contextMenu.taskId)}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
          >
            <Trash2 size={14} />
            删除任务
          </button>
        </div>
      )}
    </div>
  );
};
