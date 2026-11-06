import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, CalendarDays, ExternalLink, FileText, GitBranch, ListTree, LocateFixed, Search, UserRound, Users, X } from 'lucide-react';
import { db } from '../db/db';
import { useStore } from '../store/useStore';
import type { Resource, Task } from '../types';
import { getTaskAssigneeIds } from '../utils/taskAssignee';
import { buildTaskHierarchyIndex, getActiveLeafTasks } from '../utils/taskHierarchy';
import { findDemandForTask } from '../services/tapdPlanningAssistant';
import { taskStage, taskStatus, type CoreUxStage } from '../services/uxStageView';
import { isTaskCancelled, isTaskTerminal } from '../utils/taskState';
import { compareResources } from './gantt/constants';
import { formatResourceDisplayName } from '../utils/resourceDisplay';

const STAGE_LABEL: Record<CoreUxStage, string> = {
  interaction: '交互',
  ui_design: '视觉',
  implementation: '还原',
  motion: '动效',
};

const STAGE_STYLE: Record<CoreUxStage, { text: string; bg: string; bar: string }> = {
  interaction: { text: 'text-violet-300', bg: 'bg-violet-500/15', bar: 'bg-violet-400' },
  ui_design: { text: 'text-sky-300', bg: 'bg-sky-500/15', bar: 'bg-sky-400' },
  implementation: { text: 'text-amber-300', bg: 'bg-amber-500/15', bar: 'bg-amber-400' },
  motion: { text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15', bar: 'bg-fuchsia-400' },
};

const STATUS_STYLE: Record<string, string> = {
  todo: 'text-gray-400 bg-gray-500/10 border-gray-700',
  in_progress: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
  done: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  blocked: 'text-red-300 bg-red-500/10 border-red-500/20',
  paused: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  cancelled: 'text-gray-500 bg-gray-500/10 border-gray-700',
};

const DAY_COUNT = 21;
const DAY_WIDTH = 40;
type CalendarFocusMode = 'demand' | 'task' | 'dependencies';

function dayLabel(day: Date) {
  return format(day, 'MM/dd', { locale: zhCN });
}

function dateValue(value?: Date) {
  return value ? startOfDay(new Date(value)).getTime() : undefined;
}

function taskOwnerNames(task: Task, resources: Resource[]): string {
  const names = getTaskAssigneeIds(task)
    .map(id => resources.find(resource => resource.id === id))
    .filter((resource): resource is Resource => Boolean(resource))
    .map(formatResourceDisplayName);
  return names.length ? names.join('、') : '待分配';
}

function taskRange(task: Task): string {
  return `${task.startDate ? dayLabel(new Date(task.startDate)) : '未定'}–${task.endDate ? dayLabel(new Date(task.endDate)) : '未定'}`;
}

function taskEstimate(task: Task): string {
  if (task.estimatedHours === undefined || task.estimatedHours === null) return '未设置';
  const hours = Number.isInteger(task.estimatedHours) ? String(task.estimatedHours) : task.estimatedHours.toFixed(1);
  return `${hours}h`;
}

function getTaskBar(task: Task, windowStart: Date) {
  const start = dateValue(task.startDate);
  const end = dateValue(task.endDate) ?? start;
  if (start === undefined || end === undefined) return null;
  const leftDay = Math.max(0, differenceInCalendarDays(new Date(start), windowStart));
  const rightDay = Math.min(DAY_COUNT, differenceInCalendarDays(new Date(end), windowStart) + 1);
  if (rightDay <= 0 || leftDay >= DAY_COUNT) return null;
  return { left: leftDay * DAY_WIDTH, width: Math.max(DAY_WIDTH * 0.8, (rightDay - leftDay) * DAY_WIDTH - 4) };
}

export function ScheduleWorkspace() {
  const { selectedProjectId, openTaskModal, setCurrentView } = useStore();
  const tasks = useLiveQuery(() => selectedProjectId ? db.tasks.where('projectId').equals(selectedProjectId).toArray() : db.tasks.toArray(), [selectedProjectId]);
  const resources = useLiveQuery(() => db.resources.toArray()) || [];
  const [query, setQuery] = useState('');
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState<CalendarFocusMode>('demand');
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()));
  const [ownerFilter, setOwnerFilter] = useState<number | 'all'>('all');

  const allTasks = tasks || [];
  const hierarchy = useMemo(() => buildTaskHierarchyIndex(allTasks), [allTasks]);
  const activeLeaves = useMemo(() => getActiveLeafTasks(allTasks, hierarchy), [allTasks, hierarchy]);
  // The demand timeline keeps completed leaf tasks (but not cancelled work) so
  // earlier stages remain visible when a later stage is planned after a gap.
  const timelineLeaves = useMemo(() => hierarchy.leafTasks.filter(task => !isTaskCancelled(task)), [hierarchy]);

  const demandGroups = useMemo(() => {
    const activeDemandIds = new Set(
      activeLeaves
        .map(task => findDemandForTask(task, allTasks, hierarchy).id)
        .filter((id): id is number => id !== undefined),
    );
    const grouped = new Map<number, { demand: Task; tasks: Task[] }>();
    timelineLeaves.forEach(task => {
      const demand = findDemandForTask(task, allTasks, hierarchy);
      if (!demand.id || !activeDemandIds.has(demand.id)) return;
      const current = grouped.get(demand.id) || { demand, tasks: [] };
      if (!current.tasks.some(item => item.id === task.id)) current.tasks.push(task);
      grouped.set(demand.id, current);
    });
    return [...grouped.values()].map(group => ({
      ...group,
      tasks: [...group.tasks].sort((left, right) => (dateValue(left.startDate) || Infinity) - (dateValue(right.startDate) || Infinity)),
      endDate: group.tasks.reduce<number | undefined>((latest, task) => Math.max(latest || 0, dateValue(task.endDate) || 0) || latest, undefined),
    })).sort((left, right) => (left.endDate || Infinity) - (right.endDate || Infinity));
  }, [activeLeaves, timelineLeaves, allTasks, hierarchy]);

  const visibleDemands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return demandGroups;
    return demandGroups.filter(group => [group.demand.title, group.demand.tapdId, group.demand.module].filter(Boolean).join(' ').toLowerCase().includes(normalized));
  }, [demandGroups, query]);

  const selectedGroup = useMemo(() => {
    const selected = selectedDemandId ? demandGroups.find(group => group.demand.id === selectedDemandId) : undefined;
    return selected || demandGroups[0];
  }, [demandGroups, selectedDemandId]);

  const selectedTask = useMemo(
    () => selectedTaskId === null ? undefined : selectedGroup?.tasks.find(task => task.id === selectedTaskId),
    [selectedGroup, selectedTaskId],
  );
  const dependencyTasks = useMemo(
    () => (selectedTask?.dependencies || [])
      .map(id => allTasks.find(candidate => candidate.id === id))
      .filter((task): task is Task => Boolean(task)),
    [allTasks, selectedTask],
  );
  const selectedTaskIds = useMemo(() => new Set(selectedGroup?.tasks.map(task => task.id).filter((id): id is number => id !== undefined)), [selectedGroup]);
  const focusTaskIds = useMemo(() => {
    if (!selectedTask?.id) return selectedTaskIds;
    if (focusMode === 'task') return new Set([selectedTask.id]);
    if (focusMode === 'dependencies') return new Set([selectedTask.id, ...dependencyTasks.map(task => task.id).filter((id): id is number => id !== undefined)]);
    return selectedTaskIds;
  }, [dependencyTasks, focusMode, selectedTask, selectedTaskIds]);
  const selectedOwners = useMemo(() => new Set(selectedGroup?.tasks.flatMap(getTaskAssigneeIds) || []), [selectedGroup]);
  const focusOwners = useMemo(() => {
    if (!selectedTask || focusMode === 'demand') return selectedOwners;
    const tasks = focusMode === 'dependencies' ? [selectedTask, ...dependencyTasks] : [selectedTask];
    return new Set(tasks.flatMap(getTaskAssigneeIds));
  }, [dependencyTasks, focusMode, selectedOwners, selectedTask]);
  const focusLabel = focusMode === 'task' ? '当前任务' : focusMode === 'dependencies' ? '当前任务 + 前置链' : '整组需求';
  const days = useMemo(() => Array.from({ length: DAY_COUNT }, (_, index) => addDays(windowStart, index)), [windowStart]);
  const activeResources = useMemo(() => resources
    .filter(resource => resource.status !== 'departed' && resource.id != null)
    .filter(resource => ownerFilter === 'all' || resource.id === ownerFilter)
    .sort(compareResources), [resources, ownerFilter]);

  const tasksByResourceAndDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    activeLeaves.forEach(task => {
      const assignees = getTaskAssigneeIds(task);
      if (!task.startDate || !task.endDate || assignees.length === 0) return;
      const start = startOfDay(new Date(task.startDate));
      const end = startOfDay(new Date(task.endDate));
      days.forEach(day => {
        if (day < start || day > end) return;
        assignees.forEach(resourceId => {
          const key = `${resourceId}:${format(day, 'yyyy-MM-dd')}`;
          map.set(key, [...(map.get(key) || []), task]);
        });
      });
    });
    return map;
  }, [activeLeaves, days]);

  const selectedRange = selectedGroup?.tasks.reduce<{ start?: Date; end?: Date }>((range, task) => {
    if (task.startDate && (!range.start || new Date(task.startDate) < range.start)) range.start = new Date(task.startDate);
    if (task.endDate && (!range.end || new Date(task.endDate) > range.end)) range.end = new Date(task.endDate);
    return range;
  }, {});

  const focusDemand = () => {
    if (!selectedRange?.start) return;
    setFocusMode('demand');
    setOwnerFilter('all');
    setWindowStart(startOfDay(selectedRange.start));
  };

  const selectDemand = (demandId: number) => {
    setSelectedDemandId(demandId);
    setSelectedTaskId(null);
    setFocusMode('demand');
    setOwnerFilter('all');
  };

  const selectTask = (task: Task) => {
    if (task.id === undefined) return;
    const demand = findDemandForTask(task, allTasks, hierarchy);
    if (demand.id !== undefined) setSelectedDemandId(demand.id);
    setSelectedTaskId(task.id);
    setFocusMode('task');
  };

  const focusTaskCalendar = (mode: Exclude<CalendarFocusMode, 'demand'>) => {
    if (!selectedTask) return;
    setFocusMode(mode);
    if (mode === 'task') {
      const ownerId = getTaskAssigneeIds(selectedTask)[0];
      setOwnerFilter(ownerId ?? 'all');
    } else {
      setOwnerFilter('all');
    }
    const dates = [selectedTask, ...(mode === 'dependencies' ? dependencyTasks : [])]
      .flatMap(task => [task.startDate, task.endDate])
      .filter((value): value is Date => Boolean(value))
      .map(value => startOfDay(new Date(value)));
    if (dates.length > 0) setWindowStart(new Date(Math.min(...dates.map(date => date.getTime()))));
  };

  const moveWindow = (daysToMove: number) => setWindowStart(current => addDays(current, daysToMove));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f1115] text-gray-300">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div>
          <div className="flex items-center gap-2"><CalendarDays size={18} className="text-indigo-300" /><h1 className="text-base font-semibold text-gray-100">协同排期工作台</h1><span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-300">需求时间 × 团队负荷</span></div>
          <p className="mt-1 text-[11px] text-gray-500">左侧看一组需求的前后置顺序，右侧同时核对每个人每天已有任务；选中需求后，相关任务会在两侧同步高亮。</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={focusDemand} disabled={!selectedRange?.start} className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"><LocateFixed size={13} />定位所选需求</button>
          <button type="button" onClick={() => setCurrentView('gantt')} className="inline-flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/70 px-2.5 py-1.5 text-gray-300 hover:border-indigo-500/40 hover:text-white"><ExternalLink size={13} />去甘特图调整</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 xl:flex-row">
        <section className="flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#121722] xl:min-w-[620px]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2.5">
            <div className="flex items-center gap-2"><GitBranch size={14} className="text-cyan-300" /><span className="text-xs font-semibold text-gray-200">需求前后置时间</span>{selectedGroup && <span className="max-w-[280px] truncate text-[10px] text-gray-500">当前：{selectedGroup.demand.title}</span>}</div>
            <div className="relative"><Search size={12} className="absolute left-2 top-2 text-gray-600" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索需求" className="w-40 rounded border border-gray-700 bg-gray-900/80 py-1.5 pl-7 pr-2 text-[10px] text-gray-300 outline-none focus:border-indigo-500" /></div>
          </div>
          {selectedTask && <div className="shrink-0 border-b border-indigo-500/25 bg-indigo-500/[0.08] px-3 py-2.5" aria-label="当前任务上下文">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-indigo-300"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />当前查看任务</div>
                <div className="mt-1 truncate text-xs font-semibold text-gray-100" title={selectedTask.title}>{selectedTask.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400"><span>{taskOwnerNames(selectedTask, resources)}</span><span>{taskRange(selectedTask)}</span><span className={selectedTask.estimatedHours == null ? 'text-amber-300' : 'text-cyan-200'}>预估 {taskEstimate(selectedTask)}</span><span>{dependencyTasks.length ? `前置 ${dependencyTasks.length} 项` : '无前置任务'}</span></div>
              </div>
              <button type="button" onClick={() => { setSelectedTaskId(null); setFocusMode('demand'); setOwnerFilter('all'); }} className="shrink-0 rounded p-1 text-gray-500 hover:bg-white/[0.08] hover:text-gray-200" title="清除当前任务"><X size={13} /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => focusTaskCalendar('task')} className="inline-flex items-center gap-1 rounded border border-indigo-400/30 bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-100 hover:bg-indigo-500/25"><UserRound size={12} />看负责人排期</button>
              <button type="button" onClick={() => focusTaskCalendar('dependencies')} disabled={dependencyTasks.length === 0} className="inline-flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"><ListTree size={12} />看前置排期</button>
              <button type="button" onClick={() => selectedTask.id !== undefined && openTaskModal(selectedTask.id)} className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-900/70 px-2 py-1 text-[10px] text-gray-300 hover:border-gray-500 hover:text-white"><FileText size={12} />打开详情</button>
            </div>
          </div>}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="w-52 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-950/20">
              {visibleDemands.map(group => {
                const selected = group.demand.id === selectedGroup?.demand.id;
                const hasUnscheduled = group.tasks.some(task => !task.startDate || !task.endDate);
                return <button key={group.demand.id} type="button" onClick={() => group.demand.id !== undefined && selectDemand(group.demand.id)} className={`w-full border-b border-gray-800/70 px-3 py-2.5 text-left transition-colors ${selected ? 'bg-indigo-500/15' : 'hover:bg-white/[0.03]'}`}>
                  <div className="flex items-start gap-1.5"><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${selected ? 'bg-indigo-400' : 'bg-gray-600'}`} /><span className={`line-clamp-2 text-[11px] leading-4 ${selected ? 'text-indigo-100' : 'text-gray-300'}`}>{group.demand.title}</span></div>
                  <div className="mt-1.5 flex items-center justify-between text-[9px] text-gray-600"><span>{group.tasks.length} 个叶子任务</span>{hasUnscheduled && <span className="text-amber-400">有未排期</span>}</div>
                </button>;
              })}
              {visibleDemands.length === 0 && <div className="p-4 text-center text-[11px] text-gray-600">暂无匹配的未完成需求</div>}
            </div>

            <div className="min-w-0 flex-1 overflow-auto">
              {selectedGroup ? <div style={{ minWidth: DAY_COUNT * DAY_WIDTH + 250 }}>
                <div className="border-b border-gray-800 bg-gray-950/25">
                  <div className="flex"><div className="w-[250px] shrink-0 border-r border-gray-800 px-3 py-2 text-[10px] text-gray-500">子需求 / 环节 / 负责人</div><div className="flex">{days.map(day => <div key={day.toISOString()} className={`w-[40px] shrink-0 border-r border-gray-800/70 px-1 py-2 text-center text-[9px] ${isSameDay(day, new Date()) ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-500'}`}>{dayLabel(day)}</div>)}</div></div>
                </div>
                <div className="divide-y divide-gray-800/70">
                  {selectedGroup.tasks.map(task => {
                    const stage = taskStage(task, resources);
                    const style = stage ? STAGE_STYLE[stage] : { text: 'text-gray-400', bg: 'bg-gray-500/10', bar: 'bg-gray-500' };
                    const bar = getTaskBar(task, windowStart);
                    const status = taskStatus(task);
                    const dependencyTasks = (task.dependencies || []).map(id => allTasks.find(candidate => candidate.id === id)).filter(Boolean) as Task[];
                    const isSelected = task.id !== undefined && task.id === selectedTaskId;
                    return <div key={task.id} className={`flex min-h-[54px] transition-colors ${isSelected ? 'bg-indigo-500/[0.08]' : ''}`}>
                      <div role="button" tabIndex={0} onClick={() => selectTask(task)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTask(task); } }} className={`group relative w-[250px] shrink-0 border-r px-3 py-2 text-left outline-none transition-colors ${isSelected ? 'border-indigo-400/70 bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/40' : 'border-gray-800 hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center gap-1.5 pr-5"><span className={`rounded px-1.5 py-0.5 text-[9px] ${style.bg} ${style.text}`}>{stage ? STAGE_LABEL[stage] : '其他'}</span><span className={`rounded border px-1 py-0.5 text-[9px] ${STATUS_STYLE[status] || STATUS_STYLE.todo}`}>{status === 'in_progress' ? '进行中' : status === 'done' ? '已完成' : status === 'blocked' ? '阻塞' : '待开始'}</span></div>
                        <div className={`mt-1 truncate text-[11px] ${isSelected ? 'font-semibold text-indigo-100' : 'text-gray-200'}`} title={task.title}>{task.title}</div>
                        <div className="mt-0.5 truncate text-[9px] text-gray-600">{taskOwnerNames(task, resources)} · {taskRange(task)} · <span className={task.estimatedHours == null ? 'text-amber-400/80' : 'text-cyan-500/90'}>预估 {taskEstimate(task)}</span></div>
                        {dependencyTasks.length > 0 && <div className="mt-0.5 truncate text-[9px] text-cyan-500/80">前置：{dependencyTasks.map(dependency => dependency.title).join('、')}</div>}
                        {isSelected && <span className="absolute right-2 top-2 rounded bg-indigo-400/20 px-1 text-[9px] text-indigo-200">已选</span>}
                        <button type="button" onClick={event => { event.stopPropagation(); if (task.id !== undefined) openTaskModal(task.id); }} className="absolute bottom-1.5 right-2 hidden rounded border border-gray-700 bg-gray-900/90 px-1.5 py-0.5 text-[9px] text-gray-400 group-hover:block hover:border-gray-500 hover:text-white" title="打开任务详情">详情</button>
                      </div>
                      <div className="relative h-[54px] flex" style={{ width: DAY_COUNT * DAY_WIDTH }}>
                        {days.map(day => <div key={day.toISOString()} className={`h-full w-[40px] shrink-0 border-r border-gray-800/60 ${isSameDay(day, new Date()) ? 'bg-indigo-500/[0.06]' : ''}`} />)}
                        {bar && <button type="button" onClick={() => selectTask(task)} title={`${task.title} · 预估 ${taskEstimate(task)} · 点击查看负责人和前置排期`} className={`absolute top-2 h-8 rounded border px-2 text-left text-[9px] font-medium text-white/90 shadow-sm transition-all ${style.bar} ${isTaskTerminal(task) ? 'opacity-60' : ''} ${isSelected ? 'z-10 border-white/80 ring-2 ring-indigo-300/70' : 'border-white/10 hover:brightness-125'}`} style={{ left: bar.left + 2, width: bar.width }}><span className="block truncate">{task.title}</span></button>}
                        {!bar && <div className="absolute inset-0 flex items-center px-2 text-[9px] text-amber-400/80">未排期</div>}
                      </div>
                    </div>;
                  })}
                </div>
              </div> : <div className="flex h-full items-center justify-center text-xs text-gray-600">请选择一个需求</div>}
            </div>
          </div>
        </section>

        <section className="flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#121722] xl:min-w-[520px]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2.5">
            <div className="min-w-0 flex items-center gap-2"><Users size={14} className="shrink-0 text-emerald-300" /><span className="text-xs font-semibold text-gray-200">团队日历负荷</span><span className="text-[10px] text-gray-500">{dayLabel(windowStart)}–{dayLabel(days[days.length - 1])}</span><span className="rounded border border-gray-700 px-1 py-0.5 text-[9px] text-gray-500">{DAY_COUNT}天窗口</span>{selectedTask && <span className="truncate rounded border border-indigo-400/25 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200">正在看：{focusLabel}</span>}</div>
            <div className="flex items-center gap-1.5"><select aria-label="团队成员筛选" value={ownerFilter} onChange={event => setOwnerFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 outline-none"><option value="all">全部成员</option>{resources.filter(resource => resource.id != null && resource.status !== 'departed').sort(compareResources).map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select><button type="button" onClick={() => moveWindow(-7)} className="rounded border border-gray-700 p-1 text-gray-400 hover:text-white" title="前 7 天"><ArrowLeft size={13} /></button><button type="button" onClick={() => moveWindow(7)} className="rounded border border-gray-700 p-1 text-gray-400 hover:text-white" title="后 7 天"><ArrowRight size={13} /></button></div>
          </div>
          {selectedGroup && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800/70 px-3 py-2 text-[10px]"><span className="text-gray-500">已选需求</span><span className="max-w-[260px] truncate text-indigo-200">{selectedGroup.demand.title}</span><span className="text-gray-600">相关人员 {selectedOwners.size} 人</span><span className="text-gray-600">前置链 {selectedGroup.tasks.filter(task => (task.dependencies || []).length > 0).length} 项</span>{selectedTask && <><span className="text-gray-700">|</span><span className="max-w-[250px] truncate text-cyan-200">当前任务：{selectedTask.title}</span></>}</div>}
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-0" style={{ minWidth: 176 + DAY_COUNT * DAY_WIDTH }}>
              <div className="flex border-b border-gray-800 bg-gray-950/25 sticky top-0 z-10"><div className="w-44 shrink-0 border-r border-gray-800 px-3 py-2 text-[10px] text-gray-500">成员 / 工种</div><div className="flex">{days.map(day => <div key={day.toISOString()} className={`w-[40px] shrink-0 border-r border-gray-800/70 px-1 py-2 text-center text-[9px] ${isSameDay(day, new Date()) ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-500'}`}>{dayLabel(day)}</div>)}</div></div>
              <div className="divide-y divide-gray-800/70">
                {activeResources.map(resource => <div key={resource.id} className="flex min-h-[48px]">
                  <div className={`w-44 shrink-0 border-r border-gray-800 px-3 py-2 ${focusOwners.has(resource.id!) ? 'bg-indigo-500/[0.08]' : ''}`}><div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${focusOwners.has(resource.id!) ? 'bg-indigo-400' : 'bg-gray-600'}`} /><span className={`truncate text-[11px] ${focusOwners.has(resource.id!) ? 'text-indigo-200' : 'text-gray-300'}`}>{formatResourceDisplayName(resource)}</span></div><div className="mt-0.5 truncate text-[9px] text-gray-600">{resource.role || '未设置工种'}</div></div>
                  <div className="flex">{days.map(day => {
                    const key = `${resource.id}:${format(day, 'yyyy-MM-dd')}`;
                    const dayTasks = tasksByResourceAndDay.get(key) || [];
                    const related = dayTasks.filter(task => task.id !== undefined && focusTaskIds.has(task.id));
                    const primary = selectedTask?.id !== undefined && dayTasks.some(task => task.id === selectedTask.id);
                    const load = dayTasks.length;
                    const isSelectedDay = related.length > 0;
                    const isOverload = load >= 3;
                    return <button type="button" key={key} onClick={() => dayTasks[0] && selectTask(dayTasks[0])} title={dayTasks.length ? `${dayTasks.map(task => task.title).join('、')} · 点击查看任务上下文` : '当日空闲'} className={`h-12 w-[40px] shrink-0 border-r border-gray-800/60 px-0.5 transition-colors hover:bg-white/[0.06] ${primary ? 'bg-cyan-500/35 ring-2 ring-inset ring-cyan-300/80' : isSelectedDay ? 'bg-indigo-500/25 ring-1 ring-inset ring-indigo-400/60' : isOverload ? 'bg-red-500/20' : load === 2 ? 'bg-amber-500/15' : load === 1 ? 'bg-emerald-500/10' : 'bg-gray-900/10'}`}><span className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded text-[10px] font-semibold ${primary ? 'bg-cyan-500/50 text-cyan-50' : isSelectedDay ? 'bg-indigo-500/40 text-indigo-100' : isOverload ? 'text-red-300' : load ? 'text-gray-300' : 'text-gray-700'}`}>{load || '·'}</span>{related.length > 0 && <span className={`mx-auto mt-0.5 block h-1 w-3 rounded-full ${primary ? 'bg-cyan-200' : 'bg-indigo-300'}`} />}</button>;
                  })}</div>
                </div>)}
                {activeResources.length === 0 && <div className="p-8 text-center text-xs text-gray-600">暂无成员资源</div>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-gray-800 px-3 py-2 text-[10px] text-gray-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500/60" />1 项</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500/60" />2 项</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500/60" />3 项以上</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-400" />当前查看范围</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-300" />当前任务</span></div>
        </section>
      </div>
    </div>
  );
}
