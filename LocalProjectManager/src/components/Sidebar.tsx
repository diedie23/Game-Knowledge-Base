import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { FolderKanban, Users, Settings, LayoutDashboard, Plus, ChevronDown, ChevronRight, Edit2, Trash2, X, Filter, GripVertical, PanelLeftClose, PanelLeftOpen, Building2, BookOpen, UserX, Archive, Pause, Check, Sparkles, Search } from 'lucide-react';
import { Avatar } from './common/Avatar';
import { useStore } from '../store/useStore';
import { db } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { startOfToday } from 'date-fns';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { getEffectiveStatus, isResourceDeparted } from '../types/resource';
import { compareResources } from './gantt/constants';
import { TaskHandoverModal } from './TaskHandoverModal';
import type { Resource } from '../db/db';
import type { Project } from '../types';
import { getRoleBadgeStyle } from '../constants/theme';
import { MemberOverviewPopover } from './sidebar/MemberOverviewPopover';
import { useMemberStats } from './sidebar/hooks/useMemberStats';
import EmptyState from './common/EmptyState';
import { confirmDialog, alertDialog } from './common/ConfirmDialog';
import { toast } from '../store/useToastStore';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { openResourceModal, selectedMemberId, setSelectedMemberId, currentView, setCurrentView, selectedProjectId, setSelectedProjectId, openAiPanel } = useStore();
  const { resources, tasks, today, sortedResources, getResourceColor, getMemberOverview, getMemberTaskStats } = useMemberStats();
  const [isTeamExpanded, setIsTeamExpanded] = useState(true);
  const [isDepartedExpanded, setIsDepartedExpanded] = useState(false);
  // Member grouping mode: 'role' = by function/role, 'group' = by project team
  const [memberGroupMode, setMemberGroupMode] = useState<'role' | 'group'>('role');
  const [overviewMemberId, setOverviewMemberId] = useState<number | null>(null);
  const [overviewPosition, setOverviewPosition] = useState<{ top: number } | null>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const memberListRef = useRef<HTMLUListElement>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Project list state
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const editProjectInputRef = useRef<HTMLInputElement>(null);

  // Live query all projects from DB
  const projects = useLiveQuery(() => db.projects.toArray()) || [];

  // Focus input when adding/editing project
  useEffect(() => {
    if (isAddingProject && newProjectInputRef.current) {
      newProjectInputRef.current.focus();
    }
  }, [isAddingProject]);
  useEffect(() => {
    if (editingProjectId !== null && editProjectInputRef.current) {
      editProjectInputRef.current.focus();
    }
  }, [editingProjectId]);

  // Create new project
  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) {
      setIsAddingProject(false);
      return;
    }
    const id = await db.projects.add({ name, status: 'active' } as Project);
    setNewProjectName('');
    setIsAddingProject(false);
    setSelectedProjectId(id as number);
    setCurrentView('gantt');
  }, [newProjectName, setSelectedProjectId, setCurrentView]);

  // Rename project
  const handleRenameProject = useCallback(async (projectId: number) => {
    const name = editingProjectName.trim();
    if (!name) {
      setEditingProjectId(null);
      return;
    }
    await db.projects.update(projectId, { name });
    setEditingProjectId(null);
    setEditingProjectName('');
  }, [editingProjectName]);

  // Delete project (only if no tasks)
  const handleDeleteProject = useCallback(async (projectId: number) => {
    const taskCount = await db.tasks.where('projectId').equals(projectId).count();
    if (taskCount > 0) {
      toast.warning(`该项目下还有 ${taskCount} 个任务，请先删除或转移任务后再删除项目`);
      return;
    }
    const ok = await confirmDialog({ title: '删除项目', message: '确定要删除该项目吗？', type: 'danger', confirmText: '删除' });
    if (!ok) return;
    await db.projects.delete(projectId);
    // If deleted project was selected, switch to first available
    if (selectedProjectId === projectId) {
      const remaining = await db.projects.toArray();
      if (remaining.length > 0) {
        setSelectedProjectId(remaining[0].id!);
      } else {
        setSelectedProjectId(null);
      }
    }
  }, [selectedProjectId, setSelectedProjectId]);

  // Split resources into active and departed, sorted by current group mode
  const activeResources = useMemo(() => {
    let active = sortedResources?.filter(r => !isResourceDeparted(r)) || [];
    // Apply search filter
    if (memberSearchQuery.trim()) {
      const q = memberSearchQuery.trim().toLowerCase();
      active = active.filter(r => 
        r.name.toLowerCase().includes(q) || 
        (r.role || '').toLowerCase().includes(q) ||
        (r.group || '').toLowerCase().includes(q)
      );
    }
    if (memberGroupMode === 'group') {
      // Re-sort by group when in group mode
      return [...active].sort((a, b) => compareResources(a, b, 'group'));
    }
    return active;
  }, [sortedResources, memberGroupMode, memberSearchQuery]);
  const departedResources = useMemo(() => sortedResources?.filter(r => isResourceDeparted(r)) || [], [sortedResources]);

  // Compute member overview data on demand
  const memberOverview = overviewMemberId !== null ? getMemberOverview(overviewMemberId) : null;

  // Track drag state to prevent click events after dragging
  const wasDraggingRef = useRef(false);
  const dragStartTimeRef = useRef(0);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  // Close popover on outside click (exclude both popover and member list)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking inside the popover itself
      if (overviewRef.current && overviewRef.current.contains(target)) return;
      // Don't close if clicking inside the member list (let onClick handle toggle)
      if (memberListRef.current && memberListRef.current.contains(target)) return;
      setOverviewMemberId(null);
    };
    if (overviewMemberId !== null) {
      document.addEventListener('click', handleClickOutside, { capture: true });
    }
    return () => document.removeEventListener('click', handleClickOutside, { capture: true });
  }, [overviewMemberId]);

  // Close popover on outside click (exclude both popover and member list)
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !sortedResources) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const newList = Array.from(sortedResources);
    const [moved] = newList.splice(srcIdx, 1);
    newList.splice(destIdx, 0, moved);

    // Update sortOrder in DB
    const updates = newList.map((r, i) => 
      db.resources.update(r.id!, { sortOrder: i })
    );
    await Promise.all(updates);
  };

  const handleDeleteResource = async (id: number) => {
    const ok = await confirmDialog({ title: '删除成员', message: '确定要删除这个资源吗？', type: 'danger', confirmText: '删除' });
    if (ok) {
      await trackedDb.resources.delete(id, '删除团队成员');
      const tasks = await db.tasks.toArray();
      for (const task of tasks) {
        if (task.assigneeIds?.includes(id)) {
          await trackedDb.tasks.update(task.id!, { 
            assigneeIds: task.assigneeIds.filter(aId => aId !== id) 
          }, '移除已删除成员的任务分配');
        }
      }
      if (selectedMemberId === id) {
        setSelectedMemberId(null);
      }
      if (overviewMemberId === id) {
        setOverviewMemberId(null);
      }
    }
  };

  // Set member as departed and trigger handover
  const handleSetDeparted = async (resource: Resource) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await trackedDb.resources.update(resource.id!, {
      status: 'departed',
      departDate: resource.departDate || todayStr,
    }, `设置「${resource.name}」为已离职`);
    // Open handover modal
    setHandoverResource({ ...resource, status: 'departed', departDate: resource.departDate || todayStr });
  };

  const handleMemberClick = (resourceId: number, e: React.MouseEvent) => {
    // Show overview popover
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOverviewPosition({ top: rect.top });
    setOverviewMemberId(prev => prev === resourceId ? null : resourceId);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    wasDraggingRef.current = false;
    dragStartTimeRef.current = Date.now();
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (resourceId: number, e: React.MouseEvent) => {
    const timeDiff = Date.now() - dragStartTimeRef.current;
    const dist = Math.sqrt(
      Math.pow(e.clientX - dragStartPosRef.current.x, 2) + 
      Math.pow(e.clientY - dragStartPosRef.current.y, 2)
    );
    
    // If it was a quick click with little movement, and not clicking an action button
    if (timeDiff < 300 && dist < 5) {
      if (!(e.target as HTMLElement).closest('[data-action-btn]')) {
        handleMemberClick(resourceId, e);
      }
    }
  };

  const handleFilterClick = (resourceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedMemberId === resourceId) {
      setSelectedMemberId(null);
    } else {
      setSelectedMemberId(resourceId);
    }
  };

  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  // Task handover modal state
  const [handoverResource, setHandoverResource] = useState<Resource | null>(null);

  const toggleMemberSelection = (id: number) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedMemberIds.size === 0) return;
    const ok = await confirmDialog({ title: '批量删除成员', message: `确定要删除选中的 ${selectedMemberIds.size} 个成员吗？这会同时移除他们在所有任务上的分配。`, type: 'danger', confirmText: '删除' });
    if (!ok) return;
    
    for (const id of selectedMemberIds) {
      await trackedDb.resources.delete(id, '批量删除团队成员');
      const allTasks = await db.tasks.toArray();
      for (const task of allTasks) {
        if (task.assigneeIds?.includes(id)) {
          await trackedDb.tasks.update(task.id!, {
            assigneeIds: task.assigneeIds.filter(aId => aId !== id)
          }, '移除已删除成员的任务分配');
        }
      }
    }
    if (selectedMemberId && selectedMemberIds.has(selectedMemberId)) {
      setSelectedMemberId(null);
    }
    setSelectedMemberIds(new Set());
    setBatchMode(false);
  };

  const handleBatchEdit = () => {
    if (selectedMemberIds.size === 0) return;
    // Open edit modal for the first selected member
    const firstId = Array.from(selectedMemberIds)[0];
    openResourceModal(firstId);
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!(target as HTMLElement).closest('[data-action-menu]')) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuId]);

  return (
    <div className="w-full bg-gray-950/95 backdrop-blur-xl h-full flex flex-col border-r border-white/[0.06] shadow-xl z-30 overflow-hidden">
      <div className="h-16 px-3 flex items-center gap-3 text-white font-bold text-xl border-b border-white/[0.06] bg-gray-900/60 backdrop-blur-sm">
        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
          <LayoutDashboard className="text-blue-500" size={20} />
        </div>
        {!collapsed && <span className="tracking-tight whitespace-nowrap">LocalPM</span>}
        <div className="flex-1" />
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>
      
      <div className="flex-1 py-6 overflow-y-auto custom-scrollbar">
        {!collapsed && <div className="px-6 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">工作区</div>}
        {collapsed && <div className="px-3 mb-3"><div className="h-px bg-gray-800" /></div>}
        <ul className="space-y-1.5 px-3">
          {/* Project List Section */}
          <li>
            <div 
              className={`flex items-center justify-between ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 text-gray-300 hover:text-white rounded-lg group cursor-pointer transition-colors`}
              onClick={() => !collapsed && setIsProjectsExpanded(!isProjectsExpanded)}
            >
              <div className="flex items-center gap-2.5 font-medium">
                <FolderKanban size={18} className="text-indigo-400 shrink-0" />
                {!collapsed && (
                  <>
                    <span>项目看板</span>
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                      {projects.length}
                    </span>
                  </>
                )}
              </div>
              {!collapsed && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAddingProject(true);
                      setIsProjectsExpanded(true);
                    }}
                    className="p-1 rounded-md hover:bg-gray-700 text-gray-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="新增项目"
                  >
                    <Plus size={14} />
                  </button>
                  {isProjectsExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                </div>
              )}
            </div>
            
            {/* Project List */}
            {!collapsed && isProjectsExpanded && (
              <ul className="mt-1 space-y-0.5 pl-2">
                {projects.map(project => {
                  const isSelected = selectedProjectId === project.id;
                  const isEditing = editingProjectId === project.id;
                  const statusIcon = project.status === 'paused' 
                    ? <Pause size={10} className="text-amber-400" />
                    : project.status === 'archived'
                    ? <Archive size={10} className="text-gray-500" />
                    : null;

                  return (
                    <li key={project.id} className="group/project">
                      {isEditing ? (
                        <div className="flex items-center gap-1 px-2 py-1">
                          <input
                            ref={editProjectInputRef}
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameProject(project.id!);
                              if (e.key === 'Escape') setEditingProjectId(null);
                            }}
                            onBlur={() => handleRenameProject(project.id!)}
                            className="flex-1 bg-gray-800 border border-indigo-500/50 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 min-w-0"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            // Use timeout to distinguish single click from double click
                            if ((window as any).__projectClickTimer) {
                              clearTimeout((window as any).__projectClickTimer);
                              (window as any).__projectClickTimer = null;
                              return; // Double click will handle it
                            }
                            (window as any).__projectClickTimer = setTimeout(() => {
                              (window as any).__projectClickTimer = null;
                              setSelectedProjectId(project.id!);
                              if (currentView === 'notes') setCurrentView('gantt');
                            }, 250);
                          }}
                          onDoubleClick={() => {
                            if ((window as any).__projectClickTimer) {
                              clearTimeout((window as any).__projectClickTimer);
                              (window as any).__projectClickTimer = null;
                            }
                            setEditingProjectId(project.id!);
                            setEditingProjectName(project.name);
                          }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
                          } ${project.status === 'archived' ? 'opacity-50' : ''}`}
                          title={`${project.name}${project.status === 'paused' ? ' (已暂停)' : project.status === 'archived' ? ' (已归档)' : ''}\n双击重命名`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            isSelected ? 'bg-indigo-400' : project.status === 'paused' ? 'bg-amber-400' : project.status === 'archived' ? 'bg-gray-600' : 'bg-gray-600'
                          }`} />
                          <span className="truncate flex-1 text-left">{project.name}</span>
                          {statusIcon}
                          {/* Edit button on hover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProjectId(project.id!);
                              setEditingProjectName(project.name);
                            }}
                            className="p-0.5 rounded hover:bg-indigo-500/20 text-gray-600 hover:text-indigo-400 opacity-0 group-hover/project:opacity-100 transition-all shrink-0"
                            title="重命名项目"
                          >
                            <Edit2 size={11} />
                          </button>
                          {/* Delete button on hover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project.id!);
                            }}
                            className="p-0.5 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 opacity-0 group-hover/project:opacity-100 transition-all shrink-0"
                            title="删除项目"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
                
                {/* New project input */}
                {isAddingProject && (
                  <li className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        ref={newProjectInputRef}
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProject();
                          if (e.key === 'Escape') { setIsAddingProject(false); setNewProjectName(''); }
                        }}
                        onBlur={() => { if (!newProjectName.trim()) setIsAddingProject(false); else handleCreateProject(); }}
                        placeholder="输入项目名称..."
                        className="flex-1 bg-gray-800 border border-indigo-500/50 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-w-0"
                      />
                    </div>
                  </li>
                )}
                
                {projects.length === 0 && !isAddingProject && (
                  <li className="px-3 py-2 text-[10px] text-gray-600 italic">
                    暂无项目，点击 + 新建
                  </li>
                )}
              </ul>
            )}
          </li>
          <li>
            <button
              onClick={() => setCurrentView('notes')}
              className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-all duration-200 font-medium border ${
                currentView === 'notes'
                  ? 'text-amber-200 bg-amber-500/15 border-amber-500/25'
                  : 'text-gray-300 hover:text-white hover:bg-gray-800 border-transparent hover:border-gray-700/50'
              }`}
              title="项目记事本"
            >
              <BookOpen size={18} className={`shrink-0 ${currentView === 'notes' ? 'text-amber-400' : 'text-amber-400/60'}`} />
              {!collapsed && <span>项目记事本</span>}
            </button>
          </li>
          
          <li className="pt-4">
            <div 
              className={`flex items-center justify-between ${collapsed ? 'px-1' : 'px-3'} py-2 text-gray-400 hover:text-gray-200 rounded-lg group cursor-pointer transition-colors`}
              onClick={() => collapsed ? undefined : setIsTeamExpanded(!isTeamExpanded)}
            >
              <div className="flex items-center gap-2 font-medium">
                <Users size={16} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span>团队成员</span>
                    <span className="ml-1 text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                      {activeResources.length}
                    </span>
                  </>
                )}
              </div>
              {!collapsed && (
                <div className="flex items-center gap-1">
                  <div className="relative" data-action-menu>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === -1 ? null : -1); // Use -1 for team-level menu
                      }}
                      className={`p-1 rounded-md transition-colors ${
                        activeMenuId === -1 
                          ? 'bg-gray-700 text-gray-200' 
                          : 'hover:bg-gray-800 text-gray-500 hover:text-indigo-400'
                      }`}
                      title="团队管理"
                    >
                      <Settings size={14} />
                    </button>
                    
                    {/* Team Management Dropdown Menu */}
                    {activeMenuId === -1 && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 py-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            openResourceModal();
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                        >
                          <Plus size={12} />
                          添加成员
                        </button>
                        <div className="h-px bg-gray-700 my-1" />
                        {/* Group mode toggle */}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setMemberGroupMode(memberGroupMode === 'role' ? 'group' : 'role');
                            setActiveMenuId(null);
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                        >
                          <Filter size={12} />
                          {memberGroupMode === 'role' ? '按项目组分组' : '按职能分组'}
                        </button>
                        <div className="h-px bg-gray-700 my-1" />
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            setBatchMode(true);
                            setSelectedMemberIds(new Set());
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                        >
                          <Edit2 size={12} />
                          批量管理
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(null);
                            setBatchMode(true);
                            setSelectedMemberIds(new Set());
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 size={12} />
                          批量删除
                        </button>
                      </div>
                    )}
                  </div>
                  {isTeamExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              )}
            </div>
            
            {/* Member search input */}
            {isTeamExpanded && !collapsed && !batchMode && (
              <div className="mx-2 mt-1 mb-1">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="搜索成员..."
                    className="w-full bg-gray-800/40 border border-gray-700/30 rounded-md pl-7 pr-7 py-1.5 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 focus:bg-gray-800/60 transition-all"
                  />
                  {memberSearchQuery && (
                    <button
                      onClick={() => setMemberSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Batch mode toolbar */}
            {batchMode && !collapsed && (
              <div className="mx-2 mt-1 mb-1 px-2.5 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-indigo-300 font-medium">
                    批量管理 · 已选 {selectedMemberIds.size}/{activeResources.length}
                  </span>
                  <button 
                    onClick={() => { setBatchMode(false); setSelectedMemberIds(new Set()); }}
                    className="p-0.5 hover:bg-indigo-500/20 rounded text-indigo-400 hover:text-indigo-200 transition-colors"
                    title="退出批量模式"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (selectedMemberIds.size === activeResources.length) {
                        setSelectedMemberIds(new Set());
                      } else {
                        setSelectedMemberIds(new Set(activeResources.map(r => r.id!) || []));
                      }
                    }}
                    className="px-2 py-1 text-[10px] rounded bg-gray-800/60 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors border border-gray-700/50"
                  >
                    {selectedMemberIds.size === activeResources.length ? '取消全选' : '全选'}
                  </button>
                  <button
                    onClick={handleBatchEdit}
                    disabled={selectedMemberIds.size === 0}
                    className="px-2 py-1 text-[10px] rounded bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-colors border border-indigo-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    编辑
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedMemberIds.size === 0}
                    className="px-2 py-1 text-[10px] rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors border border-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    删除 ({selectedMemberIds.size})
                  </button>
                </div>
              </div>
            )}

            {/* Selected member filter indicator */}
            {selectedMemberId && !collapsed && !batchMode && (
              <div className="mx-2 mt-1 mb-1 px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg flex items-center justify-between">
                <span className="text-[10px] text-indigo-300 font-medium">
                  筛选: {resources?.find(r => r.id === selectedMemberId)?.name}
                </span>
                <button 
                  onClick={() => setSelectedMemberId(null)}
                  className="p-0.5 hover:bg-indigo-500/20 rounded text-indigo-400 hover:text-indigo-200 transition-colors"
                  title="清除筛选"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            
            <div className={`transition-all duration-300 ease-in-out ${isTeamExpanded ? 'max-h-[3000px] opacity-100 mt-1' : 'max-h-0 opacity-0 overflow-hidden'}`}>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="team-members">
                  {(provided) => (
                    <>
                    <ul 
                      className="space-y-1.5 px-2"
                      ref={(el) => {
                        provided.innerRef(el);
                        (memberListRef as React.MutableRefObject<HTMLUListElement | null>).current = el;
                      }}
                      {...provided.droppableProps}
                    >
                      {activeResources?.map((resource, index) => {
                        const isSelected = selectedMemberId === resource.id;
                        const isOverviewOpen = overviewMemberId === resource.id;
                        const avatarColor = getResourceColor(resource.id!);
                        // Show group divider when switching from internal to cp
                        const prevResource = index > 0 ? activeResources[index - 1] : null;
                        const showCpDivider = resource.type === 'cp' && (!prevResource || prevResource.type !== 'cp');
                        const hasCpMembers = activeResources.some(r => r.type === 'cp');
                        const internalCount = activeResources.filter(r => r.type !== 'cp').length;
                        const cpCount = activeResources.filter(r => r.type === 'cp').length;
                        
                        // Role-based sub-group divider for internal members
                        const showRoleGroupDivider = (() => {
                          if (resource.type === 'cp') return false;
                          if (index === 0) return true; // First internal member always shows group header
                          if (!prevResource || prevResource.type === 'cp') return false;
                          if (memberGroupMode === 'group') {
                            // Show divider when project group changes
                            const currGroup = resource.group || '未分组';
                            const prevGroup = prevResource.group || '未分组';
                            return currGroup !== prevGroup;
                          } else {
                            // Show divider when role group changes
                            const currRole = resource.role || '';
                            const prevRole = prevResource.role || '';
                            return currRole !== prevRole;
                          }
                        })();
                        const roleGroupLabel = memberGroupMode === 'group' 
                          ? (resource.group || '未分组')
                          : (resource.role || '其他');
                        const roleGroupCount = resource.type !== 'cp' 
                          ? memberGroupMode === 'group'
                            ? activeResources.filter(r => r.type !== 'cp' && (r.group || '未分组') === (resource.group || '未分组')).length
                            : activeResources.filter(r => r.type !== 'cp' && (r.role || '') === (resource.role || '')).length 
                          : 0;

                        // Use hook-provided stats for micro indicator
                        const { inProgress: memberInProgress, todo: memberTodo, done: memberDone, overdue: memberOverdue } = getMemberTaskStats(resource.id!);
                        
                        return (
                          <React.Fragment key={resource.id}>
                            {index === 0 && !collapsed && (
                              <li className="px-3 pt-1.5 pb-0.5">
                                <div className="flex items-center gap-2">
                                  <div className="text-[10px] font-semibold text-indigo-400/60 uppercase tracking-widest">内部成员 ({internalCount})</div>
                                  <div className="flex-1 h-px bg-indigo-500/10" />
                                </div>
                              </li>
                            )}
                            {index === 0 && collapsed && (
                              <li className="px-1 pt-1.5 pb-0.5">
                                <div className="h-px bg-indigo-500/20" />
                              </li>
                            )}
                            {showRoleGroupDivider && resource.type !== 'cp' && !collapsed && (
                              <li className="px-3 pt-2 pb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="text-[9px] font-medium text-gray-500/80 tracking-wide">{roleGroupLabel} ({roleGroupCount})</div>
                                  <div className="flex-1 h-px bg-white/[0.04]" />
                                </div>
                              </li>
                            )}
                            {showCpDivider && !collapsed && (
                              <li className="px-3 pt-3 pb-0.5">
                                <div className="flex items-center gap-2">
                                  <Building2 size={12} className="text-emerald-400/60 shrink-0" />
                                  <div className="text-[10px] font-semibold text-emerald-400/60 uppercase tracking-widest">CP 外包 ({cpCount})</div>
                                  <div className="flex-1 h-px bg-emerald-500/10" />
                                </div>
                              </li>
                            )}
                            {showCpDivider && collapsed && (
                              <li className="px-1 pt-3 pb-0.5">
                                <div className="h-px bg-emerald-500/20" />
                              </li>
                            )}
                          <Draggable draggableId={`member-${resource.id}`} index={index}>
                            {(dragProvided, dragSnapshot) => {
                              return (
                              <li 
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={`relative flex items-center ${collapsed ? 'justify-center px-1' : 'px-3 pr-2'} py-2.5 text-sm rounded-lg group cursor-pointer transition-all duration-200 ${
                                  dragSnapshot.isDragging
                                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                                    : isResourceDeparted(resource)
                                      ? 'opacity-50 bg-gray-800/30 border border-dashed border-gray-700/40 hover:opacity-75 hover:bg-gray-800/40'
                                      : isOverviewOpen
                                        ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                                        : isSelected 
                                          ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30' 
                                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
                                }`}
                                onClick={(e) => {
                                  // Don't trigger if clicking on action buttons, batch checkbox, or drag handle
                                  const target = e.target as HTMLElement;
                                  if (target.closest('[data-action-btn]') || target.closest('input[type="checkbox"]') || target.closest('[data-drag-handle]')) return;
                                  if (batchMode) {
                                    toggleMemberSelection(resource.id!);
                                    return;
                                  }
                                  handleMemberClick(resource.id!, e);
                                }}
                                title={collapsed ? resource.name : undefined}
                              >
                                {collapsed ? (
                                  /* Collapsed: just Avatar */
                                  <div className="relative" {...dragProvided.dragHandleProps}>
                                    <Avatar
                                      name={resource.name}
                                      size="sm"
                                      type={(resource.type as 'internal' | 'cp') || 'internal'}
                                      avatar={resource.avatar}
                                      avatarStyle={resource.avatarStyle}
                                      role={resource.role}
                                    />
                                    {/* Status indicator emoji outside avatar for collapsed view */}
                                    {(() => { const effStatus = getEffectiveStatus(resource); return effStatus && effStatus !== 'active' ? (
                                      <div className={`absolute -bottom-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[#12141e] shadow-sm ${
                                        effStatus === 'wfh' ? 'bg-blue-500/20' :
                                        effStatus === 'sick' ? 'bg-orange-500/20' :
                                        effStatus === 'leave' ? 'bg-purple-500/20' :
                                        effStatus === 'focus' ? 'bg-red-500/20' :
                                        effStatus === 'departed' ? 'bg-gray-500/20' : ''
                                      }`} title={
                                        effStatus === 'wfh' ? '居家办公' :
                                        effStatus === 'sick' ? '身体欠佳' :
                                        effStatus === 'leave' ? '休假中' :
                                        effStatus === 'focus' ? '专注模式' :
                                        effStatus === 'departed' ? '已离职' : ''
                                      }>
                                        <span className="text-[8px] leading-none">
                                          {effStatus === 'wfh' ? '🏠' :
                                           effStatus === 'sick' ? '🤒' :
                                           effStatus === 'leave' ? '🌴' :
                                           effStatus === 'focus' ? '🎯' :
                                           effStatus === 'departed' ? '👋' : ''}
                                        </span>
                                      </div>
                                    ) : null; })()}
                                    {(memberInProgress > 0 || memberOverdue > 0) && (
                                      <div className="absolute -top-0.5 -right-0.5 flex gap-[1px]">
                                        {memberOverdue > 0 && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                                        {memberOverdue === 0 && memberInProgress > 0 && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* Expanded: full row */
                                  <>
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {/* Batch selection checkbox */}
                                  {batchMode && (
                                    <label className="shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={selectedMemberIds.has(resource.id!)}
                                        onChange={() => toggleMemberSelection(resource.id!)}
                                        className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer w-3.5 h-3.5"
                                      />
                                    </label>
                                  )}
                                  {/* Drag handle */}
                                  <div 
                                    {...dragProvided.dragHandleProps}
                                    data-drag-handle
                                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-400 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GripVertical size={12} />
                                  </div>
                                  <div className="relative">
                                    <Avatar
                                      name={resource.name}
                                      size="md"
                                      type={(resource.type as 'internal' | 'cp') || 'internal'}
                                      avatar={resource.avatar}
                                      avatarStyle={resource.avatarStyle}
                                      role={resource.role}
                                    />
                                  </div>
                                  <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`font-medium text-sm leading-tight whitespace-nowrap ${isResourceDeparted(resource) ? 'text-gray-500 line-through decoration-gray-600' : 'text-gray-200'}`}>{resource.name}</span>
                                      {/* Default: compact role dot indicator */}
                                      {resource.role && (
                                        <span className={`shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border opacity-60 group-hover:opacity-100 transition-opacity ${
                                          getRoleBadgeStyle(resource.role)
                                        }`}>
                                          {resource.role}
                                        </span>
                                      )}
                                      {resource.type === 'cp' && (
                                        <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border text-emerald-300 bg-emerald-500/15 border-emerald-500/25 opacity-60 group-hover:opacity-100 transition-opacity">
                                          CP
                                        </span>
                                      )}
                                      {/* Status emoji - always visible if active */}
                                      {(() => { const effStatus = getEffectiveStatus(resource); return effStatus && effStatus !== 'active' ? (
                                        <span className="text-[11px] leading-tight shrink-0" title={
                                          effStatus === 'wfh' ? '居家办公' :
                                          effStatus === 'sick' ? '身体欠佳' :
                                          effStatus === 'leave' ? '休假中' :
                                          effStatus === 'focus' ? '专注模式' :
                                          effStatus === 'departed' ? '已离职' : ''
                                        }>
                                          {effStatus === 'wfh' ? '🏠' :
                                           effStatus === 'sick' ? '🤒' :
                                           effStatus === 'leave' ? '🌴' :
                                           effStatus === 'focus' ? '🎯' :
                                           effStatus === 'departed' ? '👋' : ''}
                                        </span>
                                      ) : null; })()}
                                    </div>
                                    {/* Second row: task counts - show on hover with slide-down animation */}
                                    <div className="flex items-center gap-1 h-0 group-hover:h-5 overflow-hidden transition-all duration-200 ease-out opacity-0 group-hover:opacity-100">
                                      {memberOverdue > 0 && (
                                        <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-red-500/15 border border-red-500/20" title={`${memberOverdue} 个逾期任务`}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                          <span className="text-[10px] text-red-400 font-medium">{memberOverdue}</span>
                                        </span>
                                      )}
                                      {memberInProgress > 0 && (
                                        <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-blue-500/15 border border-blue-500/20" title={`${memberInProgress} 个进行中`}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                          <span className="text-[10px] text-blue-400 font-medium">{memberInProgress}</span>
                                        </span>
                                      )}
                                      {memberTodo > 0 && (
                                        <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-gray-700/40 border border-gray-600/20" title={`${memberTodo} 个待办`}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                                          <span className="text-[10px] text-gray-500 font-medium">{memberTodo}</span>
                                        </span>
                                      )}
                                      {memberOverdue === 0 && memberInProgress === 0 && memberTodo === 0 && (
                                        <span className="text-[10px] text-gray-600 italic">暂无任务</span>
                                      )}
                                    </div>
                                    {/* Default: only show critical indicator (overdue) when not hovered */}
                                    {memberOverdue > 0 && (
                                      <div className="flex items-center gap-1 h-4 group-hover:h-0 group-hover:opacity-0 overflow-hidden transition-all duration-200">
                                        <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-red-500/15 border border-red-500/20">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                          <span className="text-[10px] text-red-400 font-medium">{memberOverdue} 逾期</span>
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {/* Action buttons - compact, right-aligned to avoid blocking clicks */}
                                <div data-action-btn className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/95 pl-1.5 pr-1 py-1 rounded-lg z-10">
                                  <button 
                                    onClick={(e) => handleFilterClick(resource.id!, e)}
                                    className={`p-1.5 rounded-md transition-all ${
                                      isSelected
                                        ? 'bg-indigo-500/20 text-indigo-400 opacity-100'
                                        : 'hover:bg-gray-700 text-gray-500 hover:text-indigo-400'
                                    }`}
                                    title={isSelected ? '取消筛选' : '筛选此成员任务'}
                                  >
                                    <Filter size={11} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openResourceModal(resource.id);
                                    }}
                                    className="p-1.5 rounded-md hover:bg-gray-700 text-gray-500 hover:text-indigo-400 transition-colors"
                                    title="编辑成员"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                  {!isResourceDeparted(resource) && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetDeparted(resource);
                                      }}
                                      className="p-1.5 rounded-md hover:bg-gray-700 text-gray-500 hover:text-amber-400 transition-colors"
                                      title="设为离职"
                                    >
                                      <UserX size={11} />
                                    </button>
                                  )}
                                </div>
                                {/* Always-visible filter indicator when selected */}
                                {isSelected && (
                                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 group-hover:hidden">
                                    <span className="p-1.5 rounded-md bg-indigo-500/20 text-indigo-400 inline-flex">
                                      <Filter size={11} />
                                    </span>
                                  </div>
                                )}
                                  </>
                                )}
                              </li>
                              );
                            }}
                          </Draggable>
                          </React.Fragment>
                        );
                      })}
                      {provided.placeholder}
                      {/* Show CP group header after all members when no CP exists */}
                      {activeResources.length > 0 && !activeResources.some(r => r.type === 'cp') && !collapsed && (
                        <>
                        <li className="px-3 pt-3 pb-0.5">
                          <div className="flex items-center gap-2">
                            <Building2 size={12} className="text-emerald-400/40 shrink-0" />
                            <div className="text-[10px] font-semibold text-emerald-400/40 uppercase tracking-widest">CP 外包 (0)</div>
                            <div className="flex-1 h-px bg-emerald-500/10" />
                          </div>
                        </li>
                        <li className="px-4 py-2 text-xs text-gray-500 italic text-center">
                          暂无
                        </li>
                        </>
                      )}
                      {activeResources.length === 0 && departedResources.length === 0 && (
                        <li className="px-4 py-3">
                          <EmptyState variant="no-members" title="暂无团队成员" size="sm" />
                        </li>
                      )}
                      {activeResources.length === 0 && departedResources.length > 0 && (
                        <li className="px-4 py-2 text-xs text-gray-500 italic text-center">
                          暂无在职成员
                        </li>
                      )}
                    </ul>
                    </>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
            {/* Departed members section — independent collapsible group */}
            {isTeamExpanded && departedResources.length > 0 && !collapsed && (
              <div className="px-2 mt-2">
                <button
                  onClick={() => setIsDepartedExpanded(!isDepartedExpanded)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-gray-400 hover:bg-gray-800/30 transition-all group/departed"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <UserX size={12} className="text-gray-600 shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">已离职</span>
                    <span className="text-[10px] bg-gray-800/80 text-gray-500 px-1.5 py-0.5 rounded-full">{departedResources.length}</span>
                    <div className="flex-1 h-px bg-gray-800/50" />
                  </div>
                  {isDepartedExpanded ? <ChevronDown size={12} className="text-gray-600" /> : <ChevronRight size={12} className="text-gray-600" />}
                </button>
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isDepartedExpanded ? 'max-h-[1000px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                  <ul className="space-y-1 px-1">
                    {departedResources.map((resource) => {
                      const isSelected = selectedMemberId === resource.id;
                      const isOverviewOpen = overviewMemberId === resource.id;
                      return (
                        <li
                          key={resource.id}
                          className={`relative flex items-center px-3 pr-2 py-2 text-sm rounded-lg group cursor-pointer transition-all duration-200 ${
                            isOverviewOpen
                              ? 'bg-gray-700/20 border border-gray-600/30'
                              : isSelected
                                ? 'bg-gray-700/15 border border-gray-600/25'
                                : 'border border-transparent hover:bg-gray-800/30 hover:border-gray-700/20'
                          }`}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('[data-action-btn]')) return;
                            handleMemberClick(resource.id!, e);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="relative opacity-50">
                              <Avatar
                                name={resource.name}
                                size="md"
                                type={(resource.type as 'internal' | 'cp') || 'internal'}
                                avatar={resource.avatar}
                                avatarStyle={resource.avatarStyle}
                                role={resource.role}
                              />
                            </div>
                            <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm leading-tight whitespace-nowrap text-gray-500 line-through decoration-gray-600">{resource.name}</span>
                                {resource.role && (
                                  <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border opacity-40 border-gray-600 text-gray-500 bg-gray-800/30">
                                    {resource.role}
                                  </span>
                                )}
                                <span className="text-[11px] leading-tight shrink-0" title="已离职">👋</span>
                              </div>
                              {resource.departDate && (
                                <span className="text-[10px] text-gray-600">{resource.departDate} 离职</span>
                              )}
                            </div>
                          </div>
                          {/* Action buttons for departed members */}
                          <div data-action-btn className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/95 pl-1.5 pr-1 py-1 rounded-lg z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openResourceModal(resource.id);
                              }}
                              className="p-1.5 rounded-md hover:bg-gray-700 text-gray-500 hover:text-indigo-400 transition-colors"
                              title="编辑成员"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteResource(resource.id!);
                              }}
                              className="p-1.5 rounded-md hover:bg-gray-700 text-gray-500 hover:text-red-400 transition-colors"
                              title="删除成员"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
            {/* Collapsed view: departed indicator */}
            {isTeamExpanded && departedResources.length > 0 && collapsed && (
              <div className="px-2 mt-2">
                <button
                  onClick={() => setIsDepartedExpanded(!isDepartedExpanded)}
                  className="w-full flex items-center justify-center p-1.5 rounded-md hover:bg-gray-800/30 text-gray-600 hover:text-gray-500 transition-colors"
                  title={`已离职 (${departedResources.length})`}
                >
                  <UserX size={14} />
                </button>
              </div>
            )}

            {/* Status color legend — placed OUTSIDE the scroll container so tooltips are always visible */}
            {isTeamExpanded && sortedResources && sortedResources.length > 0 && !collapsed && (
              <div className="px-5 pt-4 pb-1 mt-2 flex items-center justify-center gap-3 flex-wrap border-t border-gray-800/30">
                <div className="group/tip relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/15 border border-red-500/20 cursor-help">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]" />
                  <span className="text-[10px] font-medium text-red-400">逾期</span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-[10px] text-gray-200 rounded-lg border border-gray-700 shadow-xl whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999]">
                    逾期：已超过截止时间的任务
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700" />
                  </div>
                </div>
                <div className="group/tip relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/15 border border-blue-500/20 cursor-help">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.6)]" />
                  <span className="text-[10px] font-medium text-blue-400">进行中</span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-[10px] text-gray-200 rounded-lg border border-gray-700 shadow-xl whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999]">
                    进行中：正在进行的任务数量
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700" />
                  </div>
                </div>
                <div className="group/tip relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-700/40 border border-gray-600/20 cursor-help">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                  <span className="text-[10px] font-medium text-gray-500">待办</span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-[10px] text-gray-200 rounded-lg border border-gray-700 shadow-xl whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999]">
                    待办：尚未开始的任务数量
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700" />
                  </div>
                </div>
              </div>
            )}
          </li>
        </ul>
      </div>
      
      <div className="p-3 border-t border-white/[0.06] bg-gray-900/40 backdrop-blur-sm space-y-1">
        <button
          onClick={() => openAiPanel()}
          className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-gray-400 hover:text-white hover:bg-gradient-to-r hover:from-amber-500/10 hover:to-orange-500/10 rounded-lg transition-all font-medium group relative`}
          title="AI 助手"
        >
          <Sparkles size={18} className="shrink-0 text-amber-400 group-hover:text-amber-300 transition-colors" />
          {!collapsed && (
            <>
              <span>AI 助手</span>
              <span className="ml-auto px-1.5 py-[1px] bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-bold rounded-full leading-none shadow-sm">β</span>
            </>
          )}
          {collapsed && (
            <span className="absolute -top-1 -right-1 px-1 py-[1px] bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[7px] font-bold rounded-full leading-none">β</span>
          )}
        </button>
        <a href="#" className={`flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors font-medium`} title="系统设置">
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>系统设置</span>}
        </a>
      </div>

      {/* Task Handover Modal */}
      {handoverResource && (
        <TaskHandoverModal
          departingResource={handoverResource}
          allResources={resources || []}
          onClose={() => setHandoverResource(null)}
          onComplete={() => setHandoverResource(null)}
        />
      )}

      {/* Member Overview Popover — rendered via Portal */}
      {overviewMemberId !== null && memberOverview && ReactDOM.createPortal(
        <MemberOverviewPopover
          overview={memberOverview}
          position={overviewPosition}
          collapsed={collapsed}
          overviewRef={overviewRef as React.RefObject<HTMLDivElement>}
          onClose={() => setOverviewMemberId(null)}
          onFilterMember={(memberId) => {
            setSelectedMemberId(memberId);
            setOverviewMemberId(null);
          }}
        />,
        document.body
      )}
    </div>
  );
}