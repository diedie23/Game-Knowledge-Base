import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Calendar, AlertCircle, Clock, Users, CheckCircle2, AlertTriangle, Edit2, Check, X } from 'lucide-react';
import { format, differenceInDays, isToday, isPast, isFuture, addDays, startOfDay, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Avatar } from './common/Avatar';
import { getEffectiveStatus } from '../types/resource';
import { getRoleBadgeStyle } from '../constants/theme';
import EmptyState from './common/EmptyState';

export function Dashboard() {
  const { setCurrentView, openTaskModal, selectedProjectId } = useStore();
  const allTasks = useLiveQuery(
    () => selectedProjectId
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  ) || [];
  const resources = useLiveQuery(() => db.resources.toArray()) || [];
  // Exclude paused and cancelled tasks from dashboard statistics
  const tasks = useMemo(() => allTasks.filter(t => t.status !== 'paused' && t.status !== 'cancelled'), [allTasks]);

  // 1. 顶部一行：今天是几号、本周第几天、距离下个版本节点还有几天
  const today = new Date();
  const todayStr = format(today, 'yyyy年MM月dd日 EEEE', { locale: zhCN });
  const weekDay = today.getDay() === 0 ? 7 : today.getDay(); // 1-7
  
  // 手动管理重要节点 — 持久化到 IndexedDB (projects 表)
  const project = useLiveQuery(() => db.projects.toCollection().first());
  const milestoneName = project?.milestoneName || '下个版本';
  const milestoneDate = project?.milestoneDate || '';
  const [isEditingMilestone, setIsEditingMilestone] = useState(false);
  const [tempMilestoneName, setTempMilestoneName] = useState(milestoneName);
  const [tempMilestoneDate, setTempMilestoneDate] = useState(milestoneDate);

  // Sync temp values when DB data loads/changes
  React.useEffect(() => {
    if (!isEditingMilestone) {
      setTempMilestoneName(milestoneName);
      setTempMilestoneDate(milestoneDate);
    }
  }, [milestoneName, milestoneDate, isEditingMilestone]);

  const handleSaveMilestone = async () => {
    if (project?.id) {
      await db.projects.update(project.id, {
        milestoneName: tempMilestoneName,
        milestoneDate: tempMilestoneDate,
      });
    } else {
      await db.projects.add({
        name: '项目 Alpha',
        milestoneName: tempMilestoneName,
        milestoneDate: tempMilestoneDate,
      });
    }
    setIsEditingMilestone(false);
  };

  const handleCancelMilestone = () => {
    setTempMilestoneName(milestoneName);
    setTempMilestoneDate(milestoneDate);
    setIsEditingMilestone(false);
  };

  const daysToMilestone = milestoneDate ? differenceInDays(new Date(milestoneDate), today) : 0;

  // Tab state for due/overdue section
  const [dueTab, setDueTab] = useState<'overdue' | 'dueToday'>('overdue');

  // Expanded member ID for member status section
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);

  // 2. 今日需要关注:今天到期的任务，已延期的任务，今天新开始的任务
  const todayTasksGrouped = useMemo(() => {
    const dueToday = tasks.filter(t => {
      if (!t.endDate || t.status === 'done' || t.status === 'cancelled') return false;
      const endDate = new Date(t.endDate);
      // Include tasks due today OR already overdue (endDate in the past)
      return isToday(endDate) || isPast(endDate);
    });
    const startToday = tasks.filter(t => t.startDate && isToday(new Date(t.startDate)) && t.status !== 'done' && t.status !== 'cancelled');
    
    // 红色=已延期，橙色=今日到期，绿色=正常
    const getTaskColor = (task: any) => {
      if (task.endDate && isPast(new Date(task.endDate)) && !isToday(new Date(task.endDate))) return 'text-red-300 border-red-500/20 bg-red-500/10 hover:bg-red-500/20';
      if (task.endDate && isToday(new Date(task.endDate))) return 'text-orange-300 border-orange-500/20 bg-orange-500/10 hover:bg-orange-500/20';
      return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20';
    };

    // Task status label: overdue vs due today
    const getTaskLabel = (task: any): { text: string; cls: string } | null => {
      if (!task.endDate) return null;
      const endDate = new Date(task.endDate);
      if (isPast(endDate) && !isToday(endDate)) {
        const daysOverdue = differenceInDays(new Date(), endDate);
        return { text: `已延期${daysOverdue}天`, cls: 'text-red-400 bg-red-500/20 border-red-500/30' };
      }
      if (isToday(endDate)) {
        return { text: '今日到期', cls: 'text-orange-400 bg-orange-500/20 border-orange-500/30' };
      }
      return null;
    };

    const overdueCount = dueToday.filter(t => t.endDate && isPast(new Date(t.endDate)) && !isToday(new Date(t.endDate))).length;
    const dueTodayCount = dueToday.filter(t => t.endDate && isToday(new Date(t.endDate))).length;

    const groupTasksByParent = (taskList: any[]) => {
      const groups = new Map<string, { parentTitle: string, items: any[], isStandalone?: boolean, parentTask?: any, isParentInList?: boolean }>();
      taskList.forEach(task => {
        if (task.parentId) {
          const parent = tasks.find(t => t.id === task.parentId);
          const parentTitle = parent ? parent.title : '独立子任务';
          if (!groups.has(task.parentId)) {
            groups.set(task.parentId, { parentTitle, items: [], parentTask: parent });
          }
          groups.get(task.parentId)!.items.push(task);
        } else {
          const hasChildren = tasks.some(t => t.parentId === task.id);
          if (hasChildren) {
            if (!groups.has(task.id)) {
              groups.set(task.id, { parentTitle: task.title, items: [], parentTask: task, isParentInList: true });
            } else {
              groups.get(task.id)!.isParentInList = true;
              groups.get(task.id)!.parentTask = task;
            }
          } else {
            groups.set(`standalone_${task.id}`, { parentTitle: task.title, items: [task], isStandalone: true });
          }
        }
      });
      return Array.from(groups.values());
    };

    // Split dueToday into overdue and due-today-only lists
    const overdueTasks = dueToday.filter(t => t.endDate && isPast(new Date(t.endDate)) && !isToday(new Date(t.endDate)));
    const dueTodayOnlyTasks = dueToday.filter(t => t.endDate && isToday(new Date(t.endDate)));

    return { 
      dueTodayGroups: groupTasksByParent(dueToday), 
      overdueGroups: groupTasksByParent(overdueTasks),
      dueTodayOnlyGroups: groupTasksByParent(dueTodayOnlyTasks),
      startTodayGroups: groupTasksByParent(startToday), 
      getTaskColor,
      getTaskLabel,
      overdueCount,
      dueTodayCount,
      totalCount: dueToday.length + startToday.length
    };
  }, [tasks]);

  // Smart default tab: auto-select based on data
  React.useEffect(() => {
    if (todayTasksGrouped.overdueCount === 0 && todayTasksGrouped.dueTodayCount > 0) {
      setDueTab('dueToday');
    } else if (todayTasksGrouped.overdueCount > 0) {
      setDueTab('overdue');
    }
  }, [todayTasksGrouped.overdueCount, todayTasksGrouped.dueTodayCount]);

  // 3. 排期预警:未来3天内有冲突的任务
  const conflictWarnings = useMemo(() => {
    const warningsByResource = new Map<number, any>();
    const next3Days = addDays(today, 3);

    // Build a set of CP resource IDs for quick lookup
    const cpResourceIdSet = new Set(resources.filter(r => r.type === 'cp' && r.id).map(r => r.id!));

    // Helper: check if a task involves CP resources (CP-tracked tasks don't have schedule conflicts)
    const isCpTrackedTask = (task: any): boolean => {
      if (!task.assigneeIds || task.assigneeIds.length === 0 || cpResourceIdSet.size === 0) return false;
      return task.assigneeIds.some((id: number) => cpResourceIdSet.has(id));
    };
    
    resources.forEach(resource => {
      if (!resource.id) return;
      // Skip conflict detection for CP resources — they only track workload, not schedule conflicts
      if (resource.type === 'cp') return;
      const resourceTasks = tasks.filter(t => 
        t.assigneeIds?.includes(resource.id!) && 
        t.status !== 'done' &&
        t.startDate && t.endDate &&
        new Date(t.startDate) <= next3Days &&
        new Date(t.endDate) >= today &&
        // Skip tasks tracked by CP resources — no schedule conflict concept
        !isCpTrackedTask(t)
      );

      // 简单冲突检测：同一天有多个任务
      const daysMap = new Map<string, any[]>();
      resourceTasks.forEach(task => {
        if (!task.startDate || !task.endDate) return;
        let current = startOfDay(new Date(task.startDate));
        const end = startOfDay(new Date(task.endDate));
        while (current <= end && current <= next3Days) {
          if (current >= startOfDay(today)) {
            const dateStr = format(current, 'MM-dd');
            if (!daysMap.has(dateStr)) daysMap.set(dateStr, []);
            daysMap.get(dateStr)!.push(task);
          }
          current = addDays(current, 1);
        }
      });

      const conflictDays: string[] = [];
      const uniqueConflictTasks = new Map<number, any>();

      daysMap.forEach((dayTasks, dateStr) => {
        if (dayTasks.length > 1) {
          conflictDays.push(dateStr);
          dayTasks.forEach(t => uniqueConflictTasks.set(t.id, t));
        }
      });

      if (conflictDays.length > 0) {
        warningsByResource.set(resource.id, {
          resource,
          days: conflictDays.sort(),
          tasks: Array.from(uniqueConflictTasks.values())
        });
      }
    });

    return Array.from(warningsByResource.values());
  }, [tasks, resources, today]);

  // 4. 未排期任务:所有还没有开始时间的任务列表
  const unscheduledTasksGrouped = useMemo(() => {
    const unscheduled = tasks.filter(t => !t.startDate || !t.endDate);
    const groups = new Map<string, { parentTitle: string, items: any[], isStandalone?: boolean, parentTask?: any, isParentInList?: boolean }>();
    
    unscheduled.forEach(task => {
      if (task.parentId) {
        const parent = tasks.find(t => t.id === task.parentId);
        const parentTitle = parent ? parent.title : '独立子任务';
        const key = String(task.parentId);
        if (!groups.has(key)) {
          groups.set(key, { parentTitle, items: [], parentTask: parent });
        }
        groups.get(key)!.items.push(task);
      } else {
        const hasChildren = tasks.some(t => t.parentId === task.id);
        if (hasChildren) {
          const key = String(task.id);
          if (!groups.has(key)) {
            groups.set(key, { parentTitle: task.title, items: [], parentTask: task, isParentInList: true });
          } else {
            groups.get(key)!.isParentInList = true;
            groups.get(key)!.parentTask = task;
          }
        } else {
          groups.set(`standalone_${task.id}`, { parentTitle: task.title, items: [task], isStandalone: true });
        }
      }
    });
    
    return Array.from(groups.values());
  }, [tasks]);

  // 5. 底部一行：成员今日状态
  const memberStatus = useMemo(() => {
    const roleOrder: Record<string, number> = {
      'UX设计': 1,
      'UX': 1,
      'UI设计': 2,
      'UI': 2,
      'Layout': 3,
      'CP': 4
    };

    const getRoleWeight = (role?: string) => {
      if (!role) return 99;
      for (const key in roleOrder) {
        if (role.includes(key) || role.toUpperCase().includes(key.toUpperCase())) return roleOrder[key];
      }
      return 99;
    };

    // Pre-compute parent task IDs to exclude them from member task counts
    const parentTaskIds = new Set<number>();
    tasks.forEach(t => {
      if (t.parentId) parentTaskIds.add(t.parentId);
    });

    const statuses = resources.filter(r => r.status !== 'departed').map(resource => {
      const memberTasks = tasks.filter(t => t.assigneeIds?.includes(resource.id!) && !parentTaskIds.has(t.id!));
      const memberInProgress = memberTasks.filter(t => t.status === 'in_progress').length;
      const memberTodo = memberTasks.filter(t => t.status === 'todo').length;
      const memberOverdue = memberTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.endDate && new Date(t.endDate) < today).length;

      // Collect active tasks (in_progress + overdue) for expandable detail
      const memberActiveTasks = memberTasks.filter(t => 
        t.status === 'in_progress' || (t.status !== 'done' && t.status !== 'cancelled' && t.endDate && new Date(t.endDate) < today)
      );

      return {
        ...resource,
        memberInProgress,
        memberTodo,
        memberOverdue,
        memberActiveTasks,
        weight: getRoleWeight(resource.role)
      };
    });

    return statuses.sort((a, b) => a.weight - b.weight);
  }, [resources, tasks, today]);

  // 6. 数据概览统计
  const stats = useMemo(() => {
    // 过滤出真正的"工作项"：即没有子任务的任务（独立任务或具体的子任务）
    // 这样可以避免父任务和子任务重复统计，导致数据对不上
    const workItems = tasks.filter(task => !tasks.some(t => t.parentId === task.id));
    
    const total = workItems.length;
    const completed = workItems.filter(t => t.status === 'done').length;
    const inProgress = workItems.filter(t => t.status === 'in_progress').length;
    const unscheduled = workItems.filter(t => !t.startDate || !t.endDate).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Weekly completion trend: this week vs last week
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });

    // Count tasks completed (status=done) whose endDate falls within each week
    const thisWeekCompleted = workItems.filter(t => {
      if (t.status !== 'done' || !t.endDate) return false;
      const end = new Date(t.endDate);
      return end >= thisWeekStart && end <= thisWeekEnd;
    }).length;

    const lastWeekCompleted = workItems.filter(t => {
      if (t.status !== 'done' || !t.endDate) return false;
      const end = new Date(t.endDate);
      return end >= lastWeekStart && end <= lastWeekEnd;
    }).length;

    const weeklyTrend = thisWeekCompleted - lastWeekCompleted; // positive = up, negative = down

    return { total, completed, inProgress, unscheduled, completionRate, thisWeekCompleted, lastWeekCompleted, weeklyTrend };
  }, [tasks]);
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#0f111a] text-gray-300 space-y-8 custom-scrollbar">
      {/* 1. 顶部时间信息栏 — 橙色渐变横条 + 信息卡片 */}
      <div className="rounded-2xl overflow-hidden shadow-lg">
        {/* 橙色渐变横条 */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 px-8 py-4 flex items-center gap-4">
          <span className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-sm shadow-white/30 animate-pulse" />
          <span className="text-lg font-bold text-white drop-shadow-sm tracking-wide">
            今天是 {todayStr}
          </span>
          <span className="ml-auto flex items-center gap-4 text-sm text-white/80 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock size={15} className="text-white/70" />
              本周第 {weekDay} 天
            </span>
          </span>
        </div>
        {/* 下方信息卡片区域 */}
        <div className="bg-gray-900/70 border border-gray-600/30 border-t-0 rounded-b-2xl p-5 grid grid-cols-2 gap-5">
          {/* 里程碑节点卡片 */}
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-xl p-4 flex items-center gap-4 group relative hover:border-amber-500/30 transition-colors">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <AlertCircle size={22} />
            </div>
            <div className="flex-1 min-w-0">
              {isEditingMilestone ? (
                <div className="flex flex-col gap-2.5">
                  <input 
                    type="text" 
                    value={tempMilestoneName} 
                    onChange={e => setTempMilestoneName(e.target.value)}
                    placeholder="节点名称"
                    className="bg-gray-800/80 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white w-full focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <div className="flex items-center gap-2">
                    <input 
                      type="date" 
                      value={tempMilestoneDate} 
                      onChange={e => setTempMilestoneDate(e.target.value)}
                      onClick={e => (e.target as HTMLInputElement).showPicker()}
                      className="bg-gray-800/80 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white flex-1 min-w-[160px] focus:outline-none focus:border-amber-500/50 transition-colors cursor-pointer"
                    />
                    <button onClick={handleSaveMilestone} className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"><Check size={18} /></button>
                    <button onClick={handleCancelMilestone} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"><X size={18} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5 flex items-center gap-1.5">
                      距离 {milestoneName}
                      <button onClick={() => setIsEditingMilestone(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-300 p-0.5 hover:bg-gray-700/50 rounded">
                        <Edit2 size={12} />
                      </button>
                    </div>
                    <div className="text-2xl font-bold text-white tracking-wide">
                      {milestoneDate ? (
                        daysToMilestone >= 0 ? (
                          <span>{daysToMilestone} <span className="text-base font-medium text-gray-400">天</span></span>
                        ) : (
                          <span className="text-red-400">已过 {Math.abs(daysToMilestone)} <span className="text-base font-medium">天</span></span>
                        )
                      ) : (
                        <span className="text-sm text-gray-500 font-normal">未设置日期</span>
                      )}
                    </div>
                  </div>
                  {milestoneDate && (
                    <span className="text-xs text-gray-500 ml-auto shrink-0">
                      {format(new Date(milestoneDate), 'MM月dd日')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* 整体进度卡片 */}
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-xl p-4 flex flex-col gap-3 hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">整体完成进度</div>
                  <div className="text-2xl font-bold text-white">{stats.completionRate}<span className="text-base font-medium text-gray-400">%</span></div>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <span className="text-emerald-400 font-medium">{stats.completed}</span> / {stats.total} 项已完成
              </div>
            </div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
              <div 
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 relative rounded-full"
                style={{ width: `${stats.completionRate}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 实时数据看板 — 紧凑横向布局 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="w-1.5 h-5 bg-blue-500 rounded-full"></span>
          实时数据看板
        </h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '总任务数', subLabel: '项目全部规划任务', value: stats.total, color: 'border-l-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: '已完成', subLabel: '已验收通过', value: stats.completed, color: 'border-l-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10', trend: stats.weeklyTrend, thisWeek: stats.thisWeekCompleted, lastWeek: stats.lastWeekCompleted },
            { label: '进行中', subLabel: '正在开发/处理', value: stats.inProgress, color: 'border-l-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: '未排期', subLabel: '待规划时间', value: stats.unscheduled, color: 'border-l-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/10' },
          ].map((stat, i) => (
            <div key={i} className={`relative px-5 py-4 rounded-xl bg-gray-800/60 border border-gray-700/50 border-l-4 ${stat.color} flex items-center gap-4 transition-transform hover:scale-[1.02] shadow-md`}>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}>
                <span className={`text-2xl font-bold ${stat.text}`}>{stat.value}</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-gray-200 font-medium">{stat.label}</span>
                <span className="text-[11px] text-gray-500">{stat.subLabel}</span>
              </div>
              {/* Weekly trend indicator for "已完成" card */}
              {'trend' in stat && stat.trend !== undefined && (
                <div className="ml-auto shrink-0" title={`本周完成 ${stat.thisWeek} 项，上周完成 ${stat.lastWeek} 项`}>
                  {stat.trend > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 rounded-full">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0"><path d="M6 2.5V9.5M6 2.5L3 5.5M6 2.5L9 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      +{stat.trend}
                    </span>
                  ) : stat.trend < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-400 bg-red-500/15 border border-red-500/25 px-1.5 py-0.5 rounded-full">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0"><path d="M6 9.5V2.5M6 9.5L3 6.5M6 9.5L9 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {stat.trend}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] font-medium text-gray-400 bg-gray-500/15 border border-gray-500/25 px-1.5 py-0.5 rounded-full">
                      —
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8 h-[620px]" style={{ gridAutoRows: '1fr' }}>
        {/* 2. 今日到期 / 已延期 — Tab 切换 */}
        <div className={`relative bg-gray-800/30 rounded-2xl p-6 flex flex-col gap-5 shadow-lg overflow-hidden border min-h-0 ${
          todayTasksGrouped.overdueCount > 0 
            ? 'border-red-500/40 shadow-red-500/10' 
            : todayTasksGrouped.dueTodayCount > 0 
              ? 'border-orange-500/30 shadow-orange-500/10' 
              : 'border-gray-700/40'
        }`}>
          {/* Urgency glow indicator */}
          {todayTasksGrouped.overdueCount > 0 && (
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-500 via-red-400 to-red-600 animate-pulse" />
          )}
          {todayTasksGrouped.overdueCount === 0 && todayTasksGrouped.dueTodayCount > 0 && (
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 via-orange-400 to-orange-600 opacity-80" />
          )}
          {/* 统一表头 */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock size={20} className="text-orange-400" />
              今日到期 / 已延期
            </h3>
            <div className="flex items-center gap-1.5">
              {todayTasksGrouped.overdueCount > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  延期 {todayTasksGrouped.overdueCount}
                </span>
              )}
              {todayTasksGrouped.dueTodayCount > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  今日 {todayTasksGrouped.dueTodayCount}
                </span>
              )}
            </div>
          </div>
          {/* Tab 切换条 */}
          <div className="flex items-center gap-0 bg-gray-900/40 rounded-lg p-0.5 border border-gray-700/30">
            <button
              onClick={() => setDueTab('overdue')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                dueTab === 'overdue'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-gray-300 border border-transparent'
              }`}
            >
              已延期
              {todayTasksGrouped.overdueCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full ${
                  dueTab === 'overdue' ? 'bg-red-500/30 text-red-300' : 'bg-gray-700 text-gray-400'
                }`}>
                  {todayTasksGrouped.overdueCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setDueTab('dueToday')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                dueTab === 'dueToday'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-gray-300 border border-transparent'
              }`}
            >
              今日到期
              {todayTasksGrouped.dueTodayCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full ${
                  dueTab === 'dueToday' ? 'bg-orange-500/30 text-orange-300' : 'bg-gray-700 text-gray-400'
                }`}>
                  {todayTasksGrouped.dueTodayCount}
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {(() => {
            const activeGroups = dueTab === 'overdue' ? todayTasksGrouped.overdueGroups : todayTasksGrouped.dueTodayOnlyGroups;
            const emptyText = dueTab === 'overdue' ? '暂无延期任务 🎉' : '今日无到期任务 🎉';
            return (
              <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 custom-scrollbar">
{activeGroups.length === 0 && (
                  <EmptyState variant={dueTab === 'overdue' ? 'celebration' : 'no-tasks'} title={emptyText} size="sm" className="bg-gray-800/20 rounded-xl border border-gray-700/30" />
                )}
                {activeGroups.map(group => {
                  if (group.isStandalone) {
                    const task = group.items[0];
                    return (
                      <div 
                        key={`standalone_${task.id}`} 
                        className={`p-3 rounded-xl border ${todayTasksGrouped.getTaskColor(task)} flex flex-col gap-2 transition-all shadow-sm cursor-pointer hover:brightness-110`}
                        onClick={() => openTaskModal(task.id)}
                      >
                        <div className="flex justify-between items-center gap-4">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-medium leading-snug truncate text-sm" title={task.title}>
                              {task.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs opacity-50 font-normal whitespace-nowrap">
                              {task.startDate ? format(new Date(task.startDate), 'MM-dd') : ''} ~ {task.endDate ? format(new Date(task.endDate), 'MM-dd') : ''}
                            </span>
                            {task.assigneeIds?.map((id: number) => {
                              const res = resources.find(r => r.id === id);
return res ? <Avatar key={id} name={res.name} avatar={res.avatar} size="xs" type={(res as any).type || 'internal'} avatarStyle={(res as any).avatarStyle} role={res.role} /> : null;
                            })}
                          </div>
                        </div>
                        {(() => {
                          const label = todayTasksGrouped.getTaskLabel(task);
                          return label ? (
                            <span className={`self-start text-[10px] font-medium px-1.5 py-[1px] rounded border ${label.cls}`}>
                              {label.text}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    );
                  }

                  return (
                    <div key={group.parentTitle} className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 flex flex-col gap-3">
                      <div 
                        className={`text-sm font-semibold border-b border-gray-700/50 pb-2 flex justify-between items-center cursor-pointer hover:text-white transition-colors ${group.isParentInList ? todayTasksGrouped.getTaskColor(group.parentTask).split(' ')[0] : 'text-gray-300'}`} 
                        title={group.parentTitle}
                        onClick={() => group.parentTask && openTaskModal(group.parentTask.id)}
                      >
                        <span className="truncate">{group.parentTitle}</span>
                        {group.parentTask && (group.parentTask.startDate || group.parentTask.endDate) && (
                          <span className="text-xs opacity-60 font-normal whitespace-nowrap ml-4 shrink-0">
                            {group.parentTask.startDate ? format(new Date(group.parentTask.startDate), 'MM-dd') : ''} ~ {group.parentTask.endDate ? format(new Date(group.parentTask.endDate), 'MM-dd') : ''}
                          </span>
                        )}
                      </div>
                      {group.items.length > 0 && (
                        <div className="space-y-2">
                          {group.items.map(task => {
                            return (
                              <div 
                                key={task.id} 
                                className={`p-3 rounded-lg border ${todayTasksGrouped.getTaskColor(task)} flex flex-col gap-2 transition-all cursor-pointer hover:brightness-110`}
                                onClick={() => openTaskModal(task.id)}
                              >
                                <div className="flex justify-between items-center gap-4">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="font-medium leading-snug truncate text-sm" title={task.title}>
                                      {task.title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs opacity-50 font-normal whitespace-nowrap">
                                      {task.startDate ? format(new Date(task.startDate), 'MM-dd') : ''} ~ {task.endDate ? format(new Date(task.endDate), 'MM-dd') : ''}
                                    </span>
                                    {task.assigneeIds?.map((id: number) => {
                                      const res = resources.find(r => r.id === id);
return res ? <Avatar key={id} name={res.name} avatar={res.avatar} size="xs" type={(res as any).type || 'internal'} avatarStyle={(res as any).avatarStyle} role={res.role} /> : null;
                                    })}
                                  </div>
                                </div>
                                {(() => {
                                  const label = todayTasksGrouped.getTaskLabel(task);
                                  return label ? (
                                    <span className={`self-start text-[10px] font-medium px-1.5 py-[1px] rounded border ${label.cls}`}>
                                      {label.text}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* 3. 今日开始 */}
        <div className={`relative bg-gray-800/30 rounded-2xl p-6 flex flex-col gap-5 shadow-lg overflow-hidden border min-h-0 ${
          todayTasksGrouped.startTodayGroups.length > 0
            ? 'border-blue-500/30 shadow-blue-500/10' 
            : 'border-gray-700/40'
        }`}>
          {/* Static blue indicator */}
          {todayTasksGrouped.startTodayGroups.length > 0 && (
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 via-blue-400 to-blue-600 opacity-80" />
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar size={20} className="text-blue-400" />
              今日开始
            </h3>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {todayTasksGrouped.startTodayGroups.reduce((acc, g) => acc + g.items.length, 0)} 项
            </span>
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 custom-scrollbar">
{todayTasksGrouped.startTodayGroups.length === 0 && (
              <EmptyState variant="no-tasks" title="今日无新开始任务" size="sm" className="bg-gray-800/20 rounded-xl border border-gray-700/30" />
            )}
            {todayTasksGrouped.startTodayGroups.map(group => {
              if (group.isStandalone) {
                const task = group.items[0];
                return (
                  <div 
                    key={`standalone_${task.id}`} 
                    className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 flex justify-between items-center gap-4 transition-all shadow-sm cursor-pointer"
                    onClick={() => openTaskModal(task.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-medium leading-snug truncate text-sm" title={task.title}>
                        {task.title}
                      </span>
                      <span className="text-xs opacity-50 font-normal whitespace-nowrap ml-auto">
                        {task.startDate ? format(new Date(task.startDate), 'MM-dd') : ''} ~ {task.endDate ? format(new Date(task.endDate), 'MM-dd') : ''}
                      </span>
                    </div>
                    <div className="flex -space-x-2 shrink-0">
                      {task.assigneeIds?.map((id: number) => {
                        const res = resources.find(r => r.id === id);
return res ? <Avatar key={id} name={res.name} avatar={res.avatar} size="xs" type={(res as any).type || 'internal'} avatarStyle={(res as any).avatarStyle} role={res.role} /> : null;
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <div key={group.parentTitle} className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 flex flex-col gap-3">
                  <div 
                    className={`text-sm font-semibold border-b border-gray-700/50 pb-2 flex justify-between items-center cursor-pointer hover:text-white transition-colors ${group.isParentInList ? 'text-blue-300' : 'text-gray-300'}`} 
                    title={group.parentTitle}
                    onClick={() => group.parentTask && openTaskModal(group.parentTask.id)}
                  >
                    <span className="truncate">{group.parentTitle}</span>
                    {group.parentTask && (group.parentTask.startDate || group.parentTask.endDate) && (
                      <span className="text-xs opacity-60 font-normal whitespace-nowrap ml-4 shrink-0">
                        {group.parentTask.startDate ? format(new Date(group.parentTask.startDate), 'MM-dd') : ''} ~ {group.parentTask.endDate ? format(new Date(group.parentTask.endDate), 'MM-dd') : ''}
                      </span>
                    )}
                  </div>
                  {group.items.length > 0 && (
                    <div className="space-y-2">
                      {group.items.map(task => {
                        return (
                          <div 
                            key={task.id} 
                            className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 flex justify-between items-center gap-4 transition-all cursor-pointer"
                            onClick={() => openTaskModal(task.id)}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-medium leading-snug truncate text-sm" title={task.title}>
                                {task.title}
                              </span>
                              <span className="text-xs opacity-50 font-normal whitespace-nowrap ml-auto">
                                {task.startDate ? format(new Date(task.startDate), 'MM-dd') : ''} ~ {task.endDate ? format(new Date(task.endDate), 'MM-dd') : ''}
                              </span>
                            </div>
                            <div className="flex -space-x-2 shrink-0">
                              {task.assigneeIds?.map((id: number) => {
                                const res = resources.find(r => r.id === id);
return res ? <Avatar key={id} name={res.name} avatar={res.avatar} size="xs" type={(res as any).type || 'internal'} avatarStyle={(res as any).avatarStyle} role={res.role} /> : null;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. 排期预警 */}
        <div className={`relative bg-gray-800/30 rounded-2xl p-6 flex flex-col gap-5 shadow-lg overflow-hidden border min-h-0 ${
          conflictWarnings.length > 0 
            ? 'border-amber-500/30 shadow-amber-500/10' 
            : 'border-gray-700/40'
        }`}>
          {/* Amber breathing indicator */}
          {conflictWarnings.length > 0 && (
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-500 via-amber-400 to-amber-600 animate-pulse" style={{ animationDuration: '2s' }} />
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-400" />
              排期预警 (未来3天)
            </h3>
            {conflictWarnings.length > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {conflictWarnings.length} 人有冲突
              </span>
            )}
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 custom-scrollbar">
{conflictWarnings.length === 0 && (
              <EmptyState variant="celebration" title="未来3天无排期冲突" size="sm" className="bg-gray-800/20 rounded-xl border border-gray-700/30" />
            )}
            {conflictWarnings.map((warning, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 flex flex-col gap-3 cursor-pointer hover:bg-amber-500/20 transition-all group" onClick={() => setCurrentView('gantt')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-amber-400">
                    <Avatar name={warning.resource.name} avatar={warning.resource.avatar} size="sm" />
                    <span className="font-semibold">{warning.resource.name}</span>
                    <div className="flex gap-1">
                      {warning.days.map((day: string) => (
                        <span key={day} className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                          {day}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-amber-400/50 group-hover:text-amber-400/80 transition-colors flex items-center gap-1">
                    去调整 <Edit2 size={10} />
                  </span>
                </div>
                <div className="bg-black/20 rounded-lg p-3 border border-amber-500/10">
                  <ul className="text-sm text-amber-200/80 list-disc list-inside space-y-1.5">
                    {warning.tasks.map((t: any) => (
                      <li 
                        key={t.id} 
                        className="truncate cursor-pointer hover:text-amber-100 transition-colors" 
                        title={t.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          openTaskModal(t.id);
                        }}
                      >
                        {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. 未排期任务 */}
      <div className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-6 flex flex-col gap-5 shadow-lg">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock size={20} className="text-gray-400" />
            未排期任务
          </h3>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-700/50 text-gray-400">
            {unscheduledTasksGrouped.reduce((acc, group) => acc + group.items.length, 0)} 项
          </span>
        </div>
        <div className="flex flex-col gap-4 max-h-80 overflow-y-auto custom-scrollbar pr-2">
{unscheduledTasksGrouped.length === 0 && (
            <EmptyState variant="celebration" title="所有任务均已排期" size="sm" className="w-full bg-gray-800/20 rounded-xl border border-gray-700/30" />
          )}
          {unscheduledTasksGrouped.map(group => {
            if (group.isStandalone) {
              const item = group.items[0];
              return (
                <div 
                  key={`standalone_${item.id}`} 
                  className="px-4 py-3 rounded-xl bg-gray-800/40 border border-gray-700/50 text-sm text-gray-300 flex items-center gap-3 hover:bg-gray-700/30 transition-colors cursor-pointer group/item"
                  onClick={() => openTaskModal(item.id)}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 group-hover/item:bg-gray-400 transition-colors shrink-0"></span>
                  <span className="truncate flex-1" title={item.title}>
                    {item.title}
                  </span>
                </div>
              );
            }

            return (
              <div key={group.parentTitle} className="bg-gray-800/40 rounded-xl border border-gray-700/50 p-4 flex flex-col gap-3">
                <div 
                  className={`text-sm font-semibold border-b border-gray-700/50 pb-2 flex justify-between items-center cursor-pointer hover:text-white transition-colors ${group.isParentInList ? 'text-gray-200' : 'text-gray-400'}`} 
                  title={group.parentTitle}
                  onClick={() => group.parentTask && openTaskModal(group.parentTask.id)}
                >
                  <span className="truncate">{group.parentTitle}</span>
                  {group.isParentInList && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700/50 text-gray-400 ml-4 shrink-0">主任务未排期</span>
                  )}
                </div>
                {group.items.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {group.items.map(item => (
                      <div 
                        key={item.id} 
                        className="px-4 py-2 rounded-lg bg-gray-900/50 border border-gray-700/50 text-sm text-gray-300 flex items-center gap-2 hover:bg-gray-700/50 transition-colors cursor-pointer group/item max-w-[500px]"
                        onClick={() => openTaskModal(item.id)}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 group-hover/item:bg-gray-400 transition-colors shrink-0"></span>
                        <span className="truncate" title={item.title}>
                          {item.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. 底部一行：成员今日状态 */}
      <div className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-6 flex flex-col gap-5 shadow-lg">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Users size={20} className="text-blue-400" />
          成员今日状态
        </h3>
        <div className="flex flex-wrap gap-5">
          {memberStatus.map(member => {
            const isExpanded = expandedMemberId === member.id;
            const hasActiveTasks = member.memberActiveTasks && member.memberActiveTasks.length > 0;
            return (
            <div key={member.id} className="flex flex-col">
              <div 
                className={`flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border min-w-[220px] transition-all shadow-sm ${
                  isExpanded ? 'border-blue-500/40 bg-gray-800/60 rounded-b-none' : 'border-gray-700/40 hover:bg-gray-800/60'
                } ${hasActiveTasks ? 'cursor-pointer' : ''}`}
                onClick={() => hasActiveTasks && setExpandedMemberId(isExpanded ? null : member.id!)}
              >
              <div className="relative">
                <Avatar name={member.name} avatar={member.avatar} size="md" type={(member.type as 'internal' | 'cp') || 'internal'} role={member.role} />
              </div>
              <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                <span className="font-medium text-sm leading-tight whitespace-nowrap text-gray-200">{member.name}</span>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    {member.type === 'cp' && (
                      <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border text-emerald-300 bg-emerald-500/15 border-emerald-500/25">
                        CP
                      </span>
                    )}
                    {member.role && (
                      <span className={`shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border ${getRoleBadgeStyle(member.role)}`}>
                        {member.role}
                      </span>
                    )}
                    {/* Status indicator emoji */}
                    {(() => { const effStatus = getEffectiveStatus(member); return effStatus && effStatus !== 'active' ? (
                      <div className={`shrink-0 inline-flex items-center justify-center px-1.5 py-[1px] rounded border shadow-sm ${
                        effStatus === 'wfh' ? 'bg-blue-500/10 border-blue-500/20 shadow-blue-400/10' :
                        effStatus === 'sick' ? 'bg-orange-500/10 border-orange-500/20 shadow-orange-400/10' :
                        effStatus === 'leave' ? 'bg-purple-500/10 border-purple-500/20 shadow-purple-500/10' :
                        effStatus === 'focus' ? 'bg-red-500/10 border-red-500/20 shadow-red-400/10' : ''
                      }`} title={
                        effStatus === 'wfh' ? '居家办公' :
                        effStatus === 'sick' ? '身体欠佳' :
                        effStatus === 'leave' ? '休假中' :
                        effStatus === 'focus' ? '专注模式' : ''
                      }>
                        <span className="text-[11px] leading-tight">
                          {effStatus === 'wfh' ? '🏠' :
                           effStatus === 'sick' ? '🤒' :
                           effStatus === 'leave' ? '🌴' :
                           effStatus === 'focus' ? '🎯' : ''}
                        </span>
                      </div>
                    ) : null; })()}
                  </div>
                  {/* Micro task status indicator with count badges */}
                  <div className="flex items-center gap-1 shrink-0">
                    {member.memberOverdue > 0 && (
                      <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-red-500/15 border border-red-500/20" title={`${member.memberOverdue} 个逾期任务`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <span className="text-[10px] text-red-400 font-medium">{member.memberOverdue}</span>
                      </span>
                    )}
                    {member.memberInProgress > 0 && (
                      <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-blue-500/15 border border-blue-500/20" title={`${member.memberInProgress} 个进行中`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        <span className="text-[10px] text-blue-400 font-medium">{member.memberInProgress}</span>
                      </span>
                    )}
                    {member.memberTodo > 0 && (
                      <span className="inline-flex items-center gap-[2px] px-1.5 py-[1px] rounded bg-gray-700/40 border border-gray-600/20" title={`${member.memberTodo} 个待办`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span className="text-[10px] text-gray-500 font-medium">{member.memberTodo}</span>
                      </span>
                    )}
                    {hasActiveTasks && (
                      <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    )}
                  </div>
                </div>
              </div>
              </div>
              {/* Expanded task list */}
              {isExpanded && member.memberActiveTasks && member.memberActiveTasks.length > 0 && (
                <div className="bg-gray-900/60 border border-blue-500/30 border-t-0 rounded-b-xl px-3 py-2 space-y-1.5 min-w-[220px]">
                  {member.memberActiveTasks.map((task: any) => {
                    const isOverdue = task.endDate && isPast(new Date(task.endDate)) && !isToday(new Date(task.endDate));
                    return (
                      <div 
                        key={task.id} 
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isOverdue ? 'bg-red-500/10 hover:bg-red-500/20 text-red-300' : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300'
                        }`}
                        onClick={(e) => { e.stopPropagation(); openTaskModal(task.id); }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-blue-400'}`} />
                        <span className="truncate flex-1" title={task.title}>{task.title}</span>
                        {task.endDate && (
                          <span className="text-[10px] opacity-60 shrink-0">{format(new Date(task.endDate), 'MM-dd')}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
