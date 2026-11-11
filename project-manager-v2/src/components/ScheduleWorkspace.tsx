import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, format, isSameDay, isWeekend, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, CalendarDays, ExternalLink, FileText, GitBranch, ListTree, LocateFixed, Search, UserRound, Users, X } from 'lucide-react';
import { db } from '../db/db';
import { useStore } from '../store/useStore';
import type { ProjectCalendarConfig, Resource, Task } from '../types';
import { getTaskAssigneeIds } from '../utils/taskAssignee';
import { buildTaskHierarchyIndex, getActiveLeafTasks } from '../utils/taskHierarchy';
import { findDemandForTask } from '../services/tapdPlanningAssistant';
import { isUxTrackedTask, taskStage, taskStatus, type CoreUxStage } from '../services/uxStageView';
import { isTaskCancelled, isTaskCompleted } from '../utils/taskState';
import { compareResources } from './gantt/constants';
import { formatResourceDisplayName } from '../utils/resourceDisplay';
import { countWorkingDays, DEFAULT_PROJECT_CALENDAR, isHoliday, isMakeupWorkingDay, isNonWorkingDay } from '../utils/dateUtils';
import { isResourceAvailableOn, getEffectiveDailyCapacity, mergeCapacity } from '../services/capacityService';
import { useVirtualizer } from '@tanstack/react-virtual';

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

const DAY_COUNT = 28;
const DAY_WIDTH = 40;
const DEMAND_LIST_WIDTH = 280;
type CalendarFocusMode = 'demand' | 'task' | 'dependencies';
type PlanningView = 'all' | 'unscheduled' | 'capacity' | 'dependency' | 'overdue';
type ResourceLoadFilter = 'all' | 'free' | 'full' | 'overload' | 'unavailable' | 'unknown';

function dayLabel(day: Date) {
  return format(day, 'MM/dd', { locale: zhCN });
}

function dateValue(value?: Date) {
  return value ? startOfDay(new Date(value)).getTime() : undefined;
}

function taskOwnerNames(task: Task, resources: Resource[] | Map<number, Resource>): string {
  const names = getTaskAssigneeIds(task)
    .map(id => resources instanceof Map ? resources.get(id) : resources.find(resource => resource.id === id))
    .filter((resource): resource is Resource => Boolean(resource))
    .map(formatResourceDisplayName);
  return names.length ? names.join('、') : '待分配';
}

function taskRange(task: Task): string {
  return `${task.startDate ? dayLabel(new Date(task.startDate)) : '未定'}–${task.endDate ? dayLabel(new Date(task.endDate)) : '未定'}`;
}

function hasTaskSchedule(task: Task): boolean {
  return Boolean(task.startDate || task.endDate);
}

function taskTiming(task: Task): string {
  if (!isTaskCompleted(task)) return hasTaskSchedule(task) ? `已排期：${taskRange(task)}` : '未排期';
  const completedDate = task.completedAt || task.endDate || task.startDate;
  return completedDate ? `完成于 ${dayLabel(new Date(completedDate))}` : '已完成（时间未同步）';
}

function formatPersonDays(value: number): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}人日`;
}

function taskEstimate(task: Task): string {
  if (task.estimatedHours === undefined || task.estimatedHours === null) return '未设置';
  return formatPersonDays(task.estimatedHours / 8);
}

interface ScheduleCellMetrics {
  dayTasks: Task[];
  estimatedLoad: number;
  hasUnestimated: boolean;
  workingDay: boolean;
  available: boolean;
  dailyCapacity: number;
  capacityKnown: boolean;
  remaining?: number;
  isOverload: boolean;
  isFree: boolean;
}

function calendarDayLabel(day: Date, calendar: ProjectCalendarConfig = DEFAULT_PROJECT_CALENDAR): string {
  if (isHoliday(day, calendar)) return '节假';
  if (isMakeupWorkingDay(day, calendar)) return '调休';
  if (isWeekend(day)) return '周末';
  return format(day, 'EEE', { locale: zhCN });
}

function parseCalendarDates(value: string): string[] {
  return [...new Set(
    value
      .split(/[\s,，、;；]+/)
      .map(item => item.trim())
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)),
  )];
}

export function ScheduleWorkspace() {
  const { selectedProjectId, openTaskModal, setCurrentView } = useStore();
  const tasks = useLiveQuery(() => selectedProjectId ? db.tasks.where('projectId').equals(selectedProjectId).toArray() : db.tasks.toArray(), [selectedProjectId]);
  const project = useLiveQuery(() => selectedProjectId ? db.projects.get(selectedProjectId) : undefined, [selectedProjectId]);
  const resources = useLiveQuery(() => db.resources.toArray()) || [];
  const capacities = useLiveQuery(() => db.resourceCapacities.toArray()) || [];
  const projectCalendar = project?.calendarConfig || DEFAULT_PROJECT_CALENDAR;
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [planningView, setPlanningView] = useState<PlanningView>('all');
  const [focusMode, setFocusMode] = useState<CalendarFocusMode>('demand');
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()));
  const [ownerFilter, setOwnerFilter] = useState<number | 'all' | 'demand'>('all');
  const [resourceLoadFilter, setResourceLoadFilter] = useState<ResourceLoadFilter>('all');
  const [calendarEditorOpen, setCalendarEditorOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState({ holidayDates: '', workingDayOverrides: '', nonWorkingDayOverrides: '' });
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const config = project?.calendarConfig || DEFAULT_PROJECT_CALENDAR;
    setCalendarDraft({
      holidayDates: (config.holidayDates || []).join('\n'),
      workingDayOverrides: (config.workingDayOverrides || []).join('\n'),
      nonWorkingDayOverrides: (config.nonWorkingDayOverrides || []).join('\n'),
    });
  }, [project?.calendarConfig, project?.id]);

  const saveCalendarConfig = async () => {
    if (!selectedProjectId) return;
    const config: ProjectCalendarConfig = {
      holidayDates: parseCalendarDates(calendarDraft.holidayDates),
      workingDayOverrides: parseCalendarDates(calendarDraft.workingDayOverrides),
      nonWorkingDayOverrides: parseCalendarDates(calendarDraft.nonWorkingDayOverrides),
    };
    await db.projects.update(selectedProjectId, { calendarConfig: config });
    setCalendarEditorOpen(false);
  };

  const allTasks = tasks || [];
  const hierarchy = useMemo(() => buildTaskHierarchyIndex(allTasks), [allTasks]);
  const activeLeaves = useMemo(() => getActiveLeafTasks(allTasks, hierarchy), [allTasks, hierarchy]);
  // The collaborative view is intentionally limited to the UX pipeline. Downstream
  // work such as program integration and audio remains available in TAPD, but it
  // should not distort UX sequencing or the people-load view here.
  const schedulableLeaves = useMemo(
    () => activeLeaves.filter(task => isUxTrackedTask(task, resources)),
    [activeLeaves, resources],
  );
  // Keep completed UX stages for history, but exclude cancelled and downstream work.
  const timelineLeaves = useMemo(
    () => hierarchy.leafTasks.filter(task => !isTaskCancelled(task) && isUxTrackedTask(task, resources)),
    [hierarchy, resources],
  );

  const demandByTaskId = useMemo(() => {
    const map = new Map<number, Task>();
    hierarchy.leafTasks.forEach(task => {
      if (task.id !== undefined) map.set(task.id, findDemandForTask(task, allTasks, hierarchy));
    });
    return map;
  }, [allTasks, hierarchy]);

  const demandGroups = useMemo(() => {
    const activeDemandIds = new Set(
      schedulableLeaves
        .map(task => task.id === undefined ? undefined : demandByTaskId.get(task.id)?.id)
        .filter((id): id is number => id !== undefined),
    );
    const grouped = new Map<number, { demand: Task; tasks: Task[] }>();
    timelineLeaves.forEach(task => {
      const demand = task.id === undefined ? task : demandByTaskId.get(task.id) || task;
      if (!demand.id || !activeDemandIds.has(demand.id)) return;
      const current = grouped.get(demand.id) || { demand, tasks: [] };
      if (!current.tasks.some(item => item.id === task.id)) current.tasks.push(task);
      grouped.set(demand.id, current);
    });
    return [...grouped.values()].map(group => ({
      ...group,
      category: group.demand.module?.trim() || '未分类',
      tasks: [...group.tasks].sort((left, right) => (dateValue(left.startDate) || Infinity) - (dateValue(right.startDate) || Infinity)),
      endDate: group.tasks.reduce<number | undefined>((latest, task) => Math.max(latest || 0, dateValue(task.endDate) || 0) || latest, undefined),
    })).sort((left, right) => (left.endDate || Infinity) - (right.endDate || Infinity));
  }, [demandByTaskId, schedulableLeaves, timelineLeaves]);

  const categoryOptions = useMemo(
    () => [...new Set(demandGroups.map(group => group.category))].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [demandGroups],
  );

  const visibleDemands = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return demandGroups.filter(group => {
      if (categoryFilter !== 'all' && group.category !== categoryFilter) return false;
      if (!normalized) return true;
      return [group.demand.title, group.demand.tapdId, group.demand.module].filter(Boolean).join(' ').toLowerCase().includes(normalized);
    });
  }, [categoryFilter, demandGroups, deferredQuery]);

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
      .map(id => hierarchy.taskById.get(id))
      .filter((task): task is Task => Boolean(task)),
    [hierarchy, selectedTask],
  );
  const taskById = hierarchy.taskById;
  const resourceById = useMemo(() => new Map(resources.filter(resource => resource.id != null).map(resource => [resource.id as number, resource])), [resources]);
  const selectedTaskIds = useMemo(() => new Set(selectedGroup?.tasks.map(task => task.id).filter((id): id is number => id !== undefined)), [selectedGroup]);
  const focusTaskIds = useMemo(() => {
    if (!selectedTask?.id) return selectedTaskIds;
    if (focusMode === 'task') return new Set([selectedTask.id]);
    if (focusMode === 'dependencies') return new Set([selectedTask.id, ...dependencyTasks.map(task => task.id).filter((id): id is number => id !== undefined)]);
    return selectedTaskIds;
  }, [dependencyTasks, focusMode, selectedTask, selectedTaskIds]);
  const selectedOwners = useMemo(
    () => new Set(selectedGroup?.tasks.filter(task => !isTaskCompleted(task)).flatMap(getTaskAssigneeIds) || []),
    [selectedGroup],
  );
  const focusOwners = useMemo(() => {
    if (!selectedTask || focusMode === 'demand') return selectedOwners;
    const tasks = focusMode === 'dependencies' ? [selectedTask, ...dependencyTasks] : [selectedTask];
    return new Set(tasks.flatMap(getTaskAssigneeIds));
  }, [dependencyTasks, focusMode, selectedOwners, selectedTask]);
  const focusLabel = focusMode === 'task' ? '当前任务' : focusMode === 'dependencies' ? '当前任务 + 前置链' : '整组需求';
  const days = useMemo(() => Array.from({ length: DAY_COUNT }, (_, index) => addDays(windowStart, index)), [windowStart]);
  const availableResources = useMemo(
    () => resources.filter(resource => resource.status !== 'departed' && resource.id != null).sort(compareResources),
    [resources],
  );
  const capacityByResourceId = useMemo(
    () => new Map(capacities.map(capacity => [capacity.resourceId, capacity])),
    [capacities],
  );
  const tasksByResourceAndDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    schedulableLeaves.forEach(task => {
      const assignees = getTaskAssigneeIds(task);
      if (!task.startDate || !task.endDate || assignees.length === 0) return;
      const start = startOfDay(new Date(task.startDate));
      const end = startOfDay(new Date(task.endDate));
      days.forEach(day => {
        if (day < start || day > end) return;
        assignees.forEach(resourceId => {
          const key = `${resourceId}:${format(day, 'yyyy-MM-dd')}`;
          const existing = map.get(key);
          if (existing) existing.push(task);
          else map.set(key, [task]);
        });
      });
    });
    return map;
  }, [days, schedulableLeaves]);

  const taskPersonDaysById = useMemo(() => {
    const result = new Map<number, number | undefined>();
    schedulableLeaves.forEach(task => {
      if (task.id === undefined || task.estimatedHours == null || !task.startDate || !task.endDate) {
        if (task.id !== undefined) result.set(task.id, undefined);
        return;
      }
      const workingDays = countWorkingDays(new Date(task.startDate), new Date(task.endDate), projectCalendar);
      result.set(task.id, workingDays > 0 ? task.estimatedHours / 8 / workingDays : undefined);
    });
    return result;
  }, [projectCalendar, schedulableLeaves]);

  // Build all calendar-cell load metrics once. The calendar, summary, filters,
  // and overload highlighting all read this same matrix instead of recalculating
  // task estimates for every consumer and every rendered cell.
  const cellMetrics = useMemo(() => {
    const result = new Map<string, ScheduleCellMetrics>();
    availableResources.forEach(resource => {
      if (resource.id === undefined) return;
      days.forEach(day => {
        const key = `${resource.id}:${format(day, 'yyyy-MM-dd')}`;
        const dayTasks = tasksByResourceAndDay.get(key) || [];
        const workingDay = !isNonWorkingDay(day, projectCalendar);
        const available = workingDay && isResourceAvailableOn(resource, day);
        const hasUnestimated = workingDay && dayTasks.some(task => task.id === undefined || taskPersonDaysById.get(task.id) === undefined);
        const estimatedLoad = workingDay
          ? dayTasks.reduce((total, task) => total + (task.id === undefined ? 0 : taskPersonDaysById.get(task.id) || 0), 0)
          : 0;
        const dailyCapacity = available ? getEffectiveDailyCapacity(mergeCapacity(resource, capacityByResourceId.get(resource.id!))) : 0;
        const capacityKnown = !hasUnestimated;
        const remaining = capacityKnown ? Math.max(0, dailyCapacity - estimatedLoad) : undefined;
        result.set(key, {
          dayTasks,
          estimatedLoad,
          hasUnestimated,
          workingDay,
          available,
          dailyCapacity,
          capacityKnown,
          remaining,
          isOverload: available && capacityKnown && estimatedLoad > dailyCapacity + 0.05,
          isFree: available && capacityKnown && remaining !== undefined && remaining >= 0.05,
        });
      });
    });
    return result;
  }, [availableResources, capacityByResourceId, days, projectCalendar, taskPersonDaysById, tasksByResourceAndDay]);

  const resourceLoadFlags = useMemo(() => {
    const flagsByResource = new Map<number, Set<Exclude<ResourceLoadFilter, 'all'>>>();
    availableResources.forEach(resource => {
      const resourceId = resource.id;
      if (resourceId === undefined) return;
      const flags = new Set<Exclude<ResourceLoadFilter, 'all'>>();
      days.forEach(day => {
        const key = `${resourceId}:${format(day, 'yyyy-MM-dd')}`;
        const metrics = cellMetrics.get(key);
        if (!metrics || !metrics.workingDay) return;
        if (!metrics.available) flags.add('unavailable');
        else if (metrics.hasUnestimated) flags.add('unknown');
        else if (metrics.isOverload) flags.add('overload');
        else if (metrics.isFree) flags.add('free');
        else flags.add('full');
      });
      flagsByResource.set(resourceId, flags);
    });
    return flagsByResource;
  }, [availableResources, cellMetrics, days]);

  const activeResources = useMemo(() => {
    let scoped = availableResources;
    if (ownerFilter === 'demand') scoped = scoped.filter(resource => selectedOwners.has(resource.id!));
    else if (ownerFilter !== 'all') scoped = scoped.filter(resource => resource.id === ownerFilter);
    if (resourceLoadFilter === 'all') return scoped;
    return scoped.filter(resource => resource.id !== undefined && resourceLoadFlags.get(resource.id)?.has(resourceLoadFilter));
  }, [availableResources, ownerFilter, resourceLoadFilter, resourceLoadFlags, selectedOwners]);

  const selectedRange = selectedGroup?.tasks.reduce<{ start?: Date; end?: Date }>((range, task) => {
    if (task.startDate && (!range.start || new Date(task.startDate) < range.start)) range.start = new Date(task.startDate);
    if (task.endDate && (!range.end || new Date(task.endDate) > range.end)) range.end = new Date(task.endDate);
    return range;
  }, {});
  const selectedPlanningTasks = useMemo(
    () => selectedGroup?.tasks.filter(task => !isTaskCompleted(task)) || [],
    [selectedGroup],
  );
  const unscheduledTasks = useMemo(
    () => selectedPlanningTasks.filter(task => !task.startDate || !task.endDate),
    [selectedPlanningTasks],
  );
  const unassignedTasks = useMemo(
    () => selectedPlanningTasks.filter(task => getTaskAssigneeIds(task).length === 0),
    [selectedPlanningTasks],
  );
  const unknownEstimateTasks = useMemo(
    () => selectedPlanningTasks.filter(task => task.estimatedHours === undefined || task.estimatedHours === null),
    [selectedPlanningTasks],
  );
  const dependencyRiskTasks = useMemo(
    () => selectedPlanningTasks.filter(task => (task.dependencies || []).some(dependencyId => {
      const dependency = taskById.get(dependencyId);
      if (!dependency) return true;
      if (!isTaskCompleted(dependency)) return true;
      return Boolean(task.startDate && dependency.endDate && new Date(dependency.endDate) > new Date(task.startDate));
    })),
    [selectedPlanningTasks, taskById],
  );
  const overdueTasks = useMemo(() => {
    const today = startOfDay(new Date());
    return selectedPlanningTasks.filter(task => task.endDate && startOfDay(new Date(task.endDate)) < today);
  }, [selectedPlanningTasks]);
  const capacitySummary = useMemo(() => {
    let availablePersonDays = 0;
    let overloadDays = 0;
    let unknownDays = 0;
    activeResources.forEach(resource => days.forEach(day => {
      const metrics = cellMetrics.get(`${resource.id}:${format(day, 'yyyy-MM-dd')}`);
      if (!metrics || !metrics.workingDay || !metrics.available) return;
      if (metrics.hasUnestimated) {
        unknownDays++;
        return;
      }
      if (metrics.isOverload) overloadDays++;
      else availablePersonDays += Math.max(0, metrics.remaining || 0);
    }));
    return { availablePersonDays, overloadDays, unknownDays };
  }, [activeResources, cellMetrics, days]);

  const overloadedTaskIds = useMemo(() => {
    const ids = new Set<number>();
    tasksByResourceAndDay.forEach((dayTasks, key) => {
      const metrics = cellMetrics.get(key);
      if (!metrics?.isOverload || metrics.hasUnestimated) return;
      dayTasks.forEach(task => {
        if (task.id !== undefined) ids.add(task.id);
      });
    });
    return ids;
  }, [cellMetrics, tasksByResourceAndDay]);

  const visiblePlanningTasks = useMemo(() => {
    const tasks = selectedGroup?.tasks || [];
    if (planningView === 'all') return tasks;
    const today = startOfDay(new Date());
    return tasks.filter(task => {
      if (isTaskCompleted(task)) return false;
      if (planningView === 'unscheduled') return !task.startDate || !task.endDate;
      if (planningView === 'capacity') return task.estimatedHours == null || (task.id !== undefined && overloadedTaskIds.has(task.id));
      if (planningView === 'overdue') return Boolean(task.endDate && startOfDay(new Date(task.endDate)) < today);
      return (task.dependencies || []).some(dependencyId => {
        const dependency = taskById.get(dependencyId);
        if (!dependency || !isTaskCompleted(dependency)) return true;
        return Boolean(task.startDate && dependency.endDate && new Date(dependency.endDate) > new Date(task.startDate));
      });
    });
  }, [overloadedTaskIds, planningView, selectedGroup, taskById]);

  const demandListRef = useRef<HTMLDivElement>(null);
  const demandVirtualizer = useVirtualizer({
    count: visibleDemands.length,
    getScrollElement: () => demandListRef.current,
    estimateSize: () => 64,
    overscan: 8,
    initialRect: { width: 0, height: 600 },
  });
  const taskListRef = useRef<HTMLDivElement>(null);
  const taskVirtualizer = useVirtualizer({
    count: visiblePlanningTasks.length,
    getScrollElement: () => taskListRef.current,
    estimateSize: () => 112,
    overscan: 8,
    initialRect: { width: 0, height: 600 },
  });
  const calendarBodyRef = useRef<HTMLDivElement>(null);
  const calendarHeaderDaysRef = useRef<HTMLDivElement>(null);
  const calendarRowVirtualizer = useVirtualizer({
    count: activeResources.length,
    getScrollElement: () => calendarBodyRef.current,
    estimateSize: () => 48,
    overscan: 6,
    initialRect: { width: 0, height: 600 },
  });

  const focusDemand = () => {
    if (!selectedRange?.start) return;
    setPlanningView('all');
    setFocusMode('demand');
    setOwnerFilter('demand');
    setWindowStart(startOfDay(selectedRange.start));
  };

  const selectDemand = (demandId: number) => {
    setSelectedDemandId(demandId);
    setSelectedTaskId(null);
    setFocusMode('demand');
    setOwnerFilter('demand');
  };

  const selectTask = (task: Task) => {
    if (task.id === undefined) return;
    const demand = task.id !== undefined ? demandByTaskId.get(task.id) || findDemandForTask(task, allTasks, hierarchy) : task;
    if (demand.id !== undefined) setSelectedDemandId(demand.id);
    setSelectedTaskId(task.id);
    setFocusMode('task');
    setOwnerFilter(isTaskCompleted(task) ? 'demand' : getTaskAssigneeIds(task)[0] ?? 'demand');
    if (task.startDate) setWindowStart(startOfDay(new Date(task.startDate)));
  };

  const focusSummary = (task?: Task, view: PlanningView = 'all') => {
    setPlanningView(view);
    if (task) {
      selectTask(task);
      return;
    }
    setSelectedTaskId(null);
    setFocusMode('demand');
    setOwnerFilter('demand');
  };

  const focusTaskCalendar = (mode: Exclude<CalendarFocusMode, 'demand'>) => {
    if (!selectedTask) return;
    setFocusMode(mode);
    if (mode === 'task') {
      const ownerId = getTaskAssigneeIds(selectedTask)[0];
      setOwnerFilter(ownerId ?? 'all');
    } else {
      setOwnerFilter('demand');
    }
    const dates = [selectedTask, ...(mode === 'dependencies' ? dependencyTasks : [])]
      .flatMap(task => [task.startDate, task.endDate])
      .filter((value): value is Date => Boolean(value))
      .map(value => startOfDay(new Date(value)));
    if (dates.length > 0) setWindowStart(new Date(Math.min(...dates.map(date => date.getTime()))));
  };

  const moveWindow = (daysToMove: number) => setWindowStart(current => addDays(current, daysToMove));
  const demandRows = visibleDemands.length > 20
    ? demandVirtualizer.getVirtualItems()
    : visibleDemands.map((_, index) => ({ index, start: index * 64, size: 64, key: index }));
  const taskRows = visiblePlanningTasks.length > 20
    ? taskVirtualizer.getVirtualItems()
    : visiblePlanningTasks.map((_, index) => ({ index, start: index * 112, size: 112, key: index }));
  const calendarRows = activeResources.length > 20
    ? calendarRowVirtualizer.getVirtualItems()
    : activeResources.map((_, index) => ({ index, start: index * 48, size: 48, key: index }));
  const handleCalendarScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (calendarHeaderDaysRef.current) {
      calendarHeaderDaysRef.current.style.transform = `translateX(-${event.currentTarget.scrollLeft}px)`;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f1115] text-gray-300">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div>
          <div className="flex items-center gap-2"><CalendarDays size={18} className="text-indigo-300" /><h1 className="text-base font-semibold text-gray-100">协同排期工作台</h1><span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-300">需求时间 × 团队负荷</span></div>
          <p className="mt-1 text-[11px] text-gray-500">左侧看前后置顺序与关键节点，右侧按项目日历核对成员负荷和可排空档；周末、节假日与请假日不会被当作正常产能。</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={focusDemand} disabled={!selectedRange?.start} className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"><LocateFixed size={13} />定位所选需求</button>
          <button type="button" onClick={() => setCalendarEditorOpen(open => !open)} disabled={!selectedProjectId} className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"><CalendarDays size={13} />项目日历</button>
          <button type="button" onClick={() => setCurrentView('gantt')} className="inline-flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/70 px-2.5 py-1.5 text-gray-300 hover:border-indigo-500/40 hover:text-white"><ExternalLink size={13} />去甘特图调整</button>
        </div>
      </header>

      {calendarEditorOpen && <section aria-label="项目日历配置" className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-amber-100">项目日历配置</div>
            <div className="mt-1 text-[10px] text-gray-500">填写 yyyy-MM-dd 日期，支持换行、逗号或顿号分隔。配置会同时影响本页面的工作日、人日分摊和容量判断。</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCalendarEditorOpen(false)} className="rounded border border-gray-700 bg-gray-900/70 px-2.5 py-1.5 text-[10px] text-gray-400 hover:text-white">取消</button>
            <button type="button" onClick={saveCalendarConfig} className="rounded border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[10px] text-amber-100 hover:bg-amber-500/25">保存日历</button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="text-[10px] text-gray-400">项目节假日<textarea aria-label="项目节假日" value={calendarDraft.holidayDates} onChange={event => setCalendarDraft(draft => ({ ...draft, holidayDates: event.target.value }))} placeholder="2026-12-31\n2027-01-01" className="mt-1 min-h-16 w-full resize-y rounded border border-gray-700 bg-gray-950/70 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-amber-400/60" /></label>
          <label className="text-[10px] text-gray-400">调休工作日<textarea aria-label="调休工作日" value={calendarDraft.workingDayOverrides} onChange={event => setCalendarDraft(draft => ({ ...draft, workingDayOverrides: event.target.value }))} placeholder="2026-12-26" className="mt-1 min-h-16 w-full resize-y rounded border border-gray-700 bg-gray-950/70 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-amber-400/60" /></label>
          <label className="text-[10px] text-gray-400">特殊休息日<textarea aria-label="特殊休息日" value={calendarDraft.nonWorkingDayOverrides} onChange={event => setCalendarDraft(draft => ({ ...draft, nonWorkingDayOverrides: event.target.value }))} placeholder="2026-12-28" className="mt-1 min-h-16 w-full resize-y rounded border border-gray-700 bg-gray-950/70 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-amber-400/60" /></label>
        </div>
      </section>}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800 bg-[#111722] px-4 py-2" aria-label="排期风险摘要">
        <span className="mr-1 text-[10px] font-medium text-gray-500">{selectedGroup ? `当前需求：${selectedGroup.demand.title}` : '排期摘要'}</span>
        <button type="button" onClick={() => focusSummary(unscheduledTasks[0], 'unscheduled')} className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-500/20">未排期 <strong>{unscheduledTasks.length}</strong></button>
        <button type="button" onClick={() => focusSummary(unknownEstimateTasks[0], 'capacity')} className="rounded border border-yellow-500/25 bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-200 hover:bg-yellow-500/20">容量待确认 <strong>{unknownEstimateTasks.length}项</strong>{capacitySummary.unknownDays > 0 && <span className="ml-1">/ {capacitySummary.unknownDays}天</span>}</button>
        <button type="button" onClick={() => focusSummary(dependencyRiskTasks[0], 'dependency')} className="rounded border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/20">依赖风险 <strong>{dependencyRiskTasks.length}</strong></button>
        <button type="button" onClick={() => focusSummary(overdueTasks[0], 'overdue')} className="rounded border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-200 hover:bg-orange-500/20">已逾期 <strong>{overdueTasks.length}</strong></button>
        <button type="button" onClick={() => focusSummary()} className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20">当前窗口可排 <strong>{formatPersonDays(Number(capacitySummary.availablePersonDays.toFixed(1)))}</strong></button>
        {capacitySummary.overloadDays > 0 && <span className="rounded border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">容量超载 {capacitySummary.overloadDays} 天</span>}
        {unassignedTasks.length > 0 && <span className="rounded border border-gray-600 bg-gray-800/60 px-2 py-1 text-[10px] text-gray-400">待分配 {unassignedTasks.length}</span>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 xl:flex-row">
        <section className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#121722] xl:min-w-[680px] xl:flex-[0.9]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2"><GitBranch size={14} className="shrink-0 text-cyan-300" /><span className="text-xs font-semibold text-gray-200">需求前后置链</span><span className="text-[10px] text-gray-600">{visibleDemands.length} 个需求</span>{selectedGroup && <span className="max-w-[280px] truncate text-[10px] text-gray-500">当前：{selectedGroup.demand.title}</span>}</div>
            <div className="flex items-center gap-1.5"><label htmlFor="schedule-view" className="text-[10px] text-gray-500">视图</label><select id="schedule-view" aria-label="排期工作模式" value={planningView} onChange={event => { setPlanningView(event.target.value as PlanningView); setSelectedTaskId(null); setFocusMode('demand'); }} className="max-w-[120px] rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[10px] text-gray-300 outline-none focus:border-indigo-500"><option value="all">全部任务</option><option value="unscheduled">待排期</option><option value="capacity">容量风险</option><option value="dependency">依赖风险</option><option value="overdue">已逾期</option></select><label htmlFor="schedule-category" className="text-[10px] text-gray-500">分类</label><select id="schedule-category" aria-label="需求分类筛选" value={categoryFilter} onChange={event => { setCategoryFilter(event.target.value); setSelectedDemandId(null); setSelectedTaskId(null); setPlanningView('all'); setFocusMode('demand'); setOwnerFilter('demand'); }} className="max-w-[150px] rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[10px] text-gray-300 outline-none focus:border-indigo-500"><option value="all">全部分类</option>{categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}</select><div className="relative"><Search size={12} className="absolute left-2 top-2 text-gray-600" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索需求" className="w-36 rounded border border-gray-700 bg-gray-900/80 py-1.5 pl-7 pr-2 text-[10px] text-gray-300 outline-none focus:border-indigo-500" /></div></div>
          </div>
          {selectedTask && <div className="shrink-0 border-b border-indigo-500/25 bg-indigo-500/[0.08] px-3 py-2.5" aria-label="当前任务上下文">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-indigo-300"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />当前查看任务</div>
                <div className="mt-1 truncate text-xs font-semibold text-gray-100" title={selectedTask.title}>{selectedTask.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400"><span>{taskOwnerNames(selectedTask, resourceById)}</span><span>{taskTiming(selectedTask)}</span><span className={selectedTask.estimatedHours == null ? 'text-amber-300' : 'text-cyan-200'}>预估 {taskEstimate(selectedTask)}</span><span>{dependencyTasks.length ? `前置 ${dependencyTasks.length} 项` : '无前置任务'}</span></div>
              </div>
              <button type="button" onClick={() => { setSelectedTaskId(null); setFocusMode('demand'); setOwnerFilter('demand'); }} className="shrink-0 rounded p-1 text-gray-500 hover:bg-white/[0.08] hover:text-gray-200" title="清除当前任务"><X size={13} /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => focusTaskCalendar('task')} className="inline-flex items-center gap-1 rounded border border-indigo-400/30 bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-100 hover:bg-indigo-500/25"><UserRound size={12} />看负责人排期</button>
              <button type="button" onClick={() => focusTaskCalendar('dependencies')} disabled={dependencyTasks.length === 0} className="inline-flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"><ListTree size={12} />看前置排期</button>
              <button type="button" onClick={() => selectedTask.id !== undefined && openTaskModal(selectedTask.id)} className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-900/70 px-2 py-1 text-[10px] text-gray-300 hover:border-gray-500 hover:text-white"><FileText size={12} />打开详情</button>
            </div>
          </div>}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div ref={demandListRef} className="w-[280px] shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-950/20" style={{ width: DEMAND_LIST_WIDTH }}>
              <div className="relative" style={{ height: visibleDemands.length > 20 ? demandVirtualizer.getTotalSize() : visibleDemands.length * 64 }}>
                {demandRows.map(virtualRow => {
                  const group = visibleDemands[virtualRow.index];
                  const selected = group.demand.id === selectedGroup?.demand.id;
                  const hasUnscheduled = group.tasks.some(task => !task.startDate || !task.endDate);
                  return <button
                    key={group.demand.id}
                    ref={demandVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    type="button"
                    onClick={() => group.demand.id !== undefined && selectDemand(group.demand.id)}
                    className={`absolute left-0 top-0 w-full border-b border-gray-800/70 px-3 py-2.5 text-left transition-colors ${selected ? 'bg-indigo-500/15' : 'hover:bg-white/[0.03]'}`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="flex items-start gap-1.5"><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${selected ? 'bg-indigo-400' : 'bg-gray-600'}`} /><span className={`line-clamp-2 text-[11px] leading-4 ${selected ? 'text-indigo-100' : 'text-gray-300'}`}>{group.demand.title}</span></div>
                    <div className="mt-1.5 flex items-center justify-between text-[9px] text-gray-600"><span>{group.tasks.length} 个叶子任务</span>{hasUnscheduled && <span className="text-amber-400">有未排期</span>}</div>
                  </button>;
                })}
                {visibleDemands.length === 0 && <div className="p-4 text-center text-[11px] text-gray-600">暂无匹配的未完成需求</div>}
              </div>
            </div>

            <div ref={taskListRef} className="min-w-0 flex-1 overflow-auto">
              {selectedGroup ? <div className="min-w-0">
                <div className="border-b border-gray-800 bg-gray-950/25 px-3 py-2 text-[10px] text-gray-500">子需求 / 当前阶段 / 负责人 / 预估人日 / 排期状态</div>
                <div className="relative" style={{ height: visiblePlanningTasks.length > 20 ? taskVirtualizer.getTotalSize() : visiblePlanningTasks.length * 112 }}>
                  {taskRows.map(virtualRow => {
                    const task = visiblePlanningTasks[virtualRow.index];
                    const stage = taskStage(task, resources);
                    const style = stage ? STAGE_STYLE[stage] : { text: 'text-gray-400', bg: 'bg-gray-500/10', bar: 'bg-gray-500' };
                    const status = taskStatus(task);
                    const dependencyTasks = (task.dependencies || []).map(id => taskById.get(id)).filter((dependency): dependency is Task => Boolean(dependency));
                    const isSelected = task.id !== undefined && task.id === selectedTaskId;
                    return <div
                      key={task.id}
                      ref={taskVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className={`absolute left-0 top-0 flex min-h-[92px] w-full transition-colors ${isSelected ? 'bg-indigo-500/[0.08]' : ''}`}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div role="button" tabIndex={0} onClick={() => selectTask(task)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTask(task); } }} className={`group relative min-w-0 flex-1 border-b border-gray-800/70 px-4 py-2.5 text-left outline-none transition-colors ${isSelected ? 'border-indigo-400/70 bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/40' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex flex-wrap items-center gap-1.5 pr-5"><span className={`rounded px-1.5 py-0.5 text-[9px] ${style.bg} ${style.text}`}>{stage ? STAGE_LABEL[stage] : '其他'}</span><span className={`rounded border px-1.5 py-0.5 text-[9px] ${STATUS_STYLE[status] || STATUS_STYLE.todo}`}>{status === 'in_progress' ? '进行中' : status === 'done' ? '已完成' : status === 'blocked' ? '阻塞' : '待开始'}</span>{!isTaskCompleted(task) && <span className={`rounded border px-1.5 py-0.5 text-[9px] ${hasTaskSchedule(task) ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>{hasTaskSchedule(task) ? '已排期' : '未排期'}</span>}</div>
                        <div className={`mt-1 line-clamp-2 break-words text-[12px] leading-5 ${isSelected ? 'font-semibold text-indigo-100' : 'text-gray-200'}`} title={task.title}>{task.externalUrl ? <a href={task.externalUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="inline-flex max-w-full items-center gap-1 text-inherit underline decoration-gray-600/70 underline-offset-2 hover:text-cyan-200 hover:decoration-cyan-300" title="打开对应 TAPD 单">{task.title}<ExternalLink size={10} className="shrink-0" /></a> : task.title}</div>
                        <div className="mt-2 grid grid-cols-[minmax(0,1.2fr)_minmax(76px,0.8fr)_minmax(0,1.2fr)] gap-2 text-[10px]"><div className="min-w-0"><div className="text-[9px] text-gray-600">负责人</div><div className="mt-0.5 truncate text-gray-400">{taskOwnerNames(task, resourceById)}</div></div><div className="min-w-0"><div className="text-[9px] text-gray-600">预估人日</div><div className={`mt-0.5 truncate font-medium ${task.estimatedHours == null ? 'text-amber-300' : 'text-cyan-200'}`}>{taskEstimate(task)}</div></div><div className="min-w-0"><div className="text-[9px] text-gray-600">时间节点</div><div className={`mt-0.5 truncate font-medium ${isTaskCompleted(task) ? 'text-emerald-300' : hasTaskSchedule(task) ? 'text-cyan-300' : 'text-amber-300'}`}>{taskTiming(task)}</div></div></div>
                        {dependencyTasks.length > 0 && <div className="mt-1 line-clamp-2 break-words text-[10px] text-cyan-500/80">前置：{dependencyTasks.map(dependency => dependency.title).join('、')}</div>}
                        {isSelected && <span className="absolute right-2 top-2 rounded bg-indigo-400/20 px-1 text-[9px] text-indigo-200">已选</span>}
                        <button type="button" onClick={event => { event.stopPropagation(); if (task.id !== undefined) openTaskModal(task.id); }} className="absolute bottom-2 right-2 hidden rounded border border-gray-700 bg-gray-900/90 px-1.5 py-0.5 text-[9px] text-gray-400 group-hover:block hover:border-gray-500 hover:text-white" title="打开任务详情">详情</button>
                      </div>
                    </div>;
                  })}
                  {visiblePlanningTasks.length === 0 && <div className="p-8 text-center text-xs text-gray-600">当前视图暂无匹配任务</div>}
                </div>
              </div> : <div className="flex h-full items-center justify-center text-xs text-gray-600">请选择一个需求</div>}
            </div>
          </div>
        </section>

        <section aria-label="团队日历负荷面板" className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#121722] xl:min-w-[820px] xl:flex-[1.35]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2.5">
            <div className="min-w-0 flex items-center gap-2"><Users size={14} className="shrink-0 text-emerald-300" /><span className="text-xs font-semibold text-gray-200">团队日历负荷</span><span className="text-[10px] text-gray-500">{dayLabel(windowStart)}–{dayLabel(days[days.length - 1])}</span><span className="rounded border border-gray-700 px-1 py-0.5 text-[9px] text-gray-500">{DAY_COUNT}天窗口</span>{selectedTask && <span className="truncate rounded border border-indigo-400/25 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200">正在看：{focusLabel}</span>}</div>
            <div className="flex items-center gap-1.5"><select aria-label="团队成员筛选" value={ownerFilter} onChange={event => { const value = event.target.value; setOwnerFilter(value === 'all' || value === 'demand' ? value : Number(value)); }} className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 outline-none"><option value="demand">本需求相关人员</option><option value="all">全部成员</option>{availableResources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select><select aria-label="成员负荷筛选" value={resourceLoadFilter} onChange={event => setResourceLoadFilter(event.target.value as ResourceLoadFilter)} className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 outline-none"><option value="all">全部负荷</option><option value="free">有可排空档</option><option value="full">容量已满</option><option value="overload">容量超载</option><option value="unknown">容量待确认</option><option value="unavailable">请假/不可用</option></select><button type="button" onClick={() => moveWindow(-7)} className="rounded border border-gray-700 p-1 text-gray-400 hover:text-white" title="前 7 天"><ArrowLeft size={13} /></button><button type="button" onClick={() => moveWindow(7)} className="rounded border border-gray-700 p-1 text-gray-400 hover:text-white" title="后 7 天"><ArrowRight size={13} /></button></div>
          </div>
          {selectedGroup && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800/70 px-3 py-2 text-[10px]"><span className="text-gray-500">已选需求</span><span className="max-w-[260px] truncate text-indigo-200">{selectedGroup.demand.title}</span><span className="text-gray-600">相关人员 {selectedOwners.size} 人</span><span className="text-gray-600">前置链 {selectedGroup.tasks.filter(task => (task.dependencies || []).length > 0).length} 项</span>{selectedTask && <><span className="text-gray-700">|</span><span className="max-w-[320px] truncate text-cyan-200">当前任务：{selectedTask.title}</span></>}</div>}
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="shrink-0 overflow-hidden border-b border-gray-800 bg-gray-950/25">
              <div className="flex" style={{ minWidth: 176 + DAY_COUNT * DAY_WIDTH }}>
                <div className="w-44 shrink-0 border-r border-gray-800 bg-gray-950/95 px-3 py-2 text-[10px] text-gray-500">成员 / 工种</div>
                <div ref={calendarHeaderDaysRef} className="flex will-change-transform">{days.map(day => { const nonWorking = isNonWorkingDay(day, projectCalendar); const holiday = isHoliday(day, projectCalendar); return <div key={day.toISOString()} title={holiday ? `${dayLabel(day)} 节假日` : nonWorking ? `${dayLabel(day)} 周末` : `${dayLabel(day)} 工作日`} className={`w-[40px] shrink-0 border-r border-gray-800/70 px-1 py-1.5 text-center ${isSameDay(day, new Date()) ? 'bg-indigo-500/15 text-indigo-300' : nonWorking ? 'bg-slate-800/70 text-slate-500' : 'text-gray-500'}`}><div className="text-[9px]">{dayLabel(day)}</div><div className={`mt-0.5 text-[8px] ${holiday ? 'text-amber-300' : nonWorking ? 'text-slate-400' : 'text-gray-600'}`}>{calendarDayLabel(day, projectCalendar)}</div></div>; })}</div>
              </div>
            </div>
            <div ref={calendarBodyRef} onScroll={handleCalendarScroll} className="min-h-0 h-full overflow-auto">
              <div className="relative min-w-0 divide-y divide-gray-800/70" style={{ minWidth: 176 + DAY_COUNT * DAY_WIDTH, height: activeResources.length > 20 ? calendarRowVirtualizer.getTotalSize() : activeResources.length * 48 }}>
                {calendarRows.map(virtualRow => {
                  const resource = activeResources[virtualRow.index];
                  return <div ref={calendarRowVirtualizer.measureElement} data-index={virtualRow.index} key={resource.id} className="absolute left-0 top-0 flex min-h-[48px] w-full" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                    <div className={`sticky left-0 z-10 w-44 shrink-0 border-r border-gray-800 bg-[#121722] px-3 py-2 ${focusOwners.has(resource.id!) ? 'bg-indigo-500/[0.08]' : ''}`}><div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${focusOwners.has(resource.id!) ? 'bg-indigo-400' : 'bg-gray-600'}`} /><span className={`truncate text-[11px] ${focusOwners.has(resource.id!) ? 'text-indigo-200' : 'text-gray-300'}`}>{formatResourceDisplayName(resource)}</span></div><div className="mt-0.5 truncate text-[9px] text-gray-600">{resource.role || '未设置工种'}</div></div>
                    <div className="flex">{days.map(day => {
                      const key = `${resource.id}:${format(day, 'yyyy-MM-dd')}`;
                      const metrics = cellMetrics.get(key);
                      const dayTasks = metrics?.dayTasks || [];
                      const related = dayTasks.filter(task => task.id !== undefined && focusTaskIds.has(task.id));
                      const primary = selectedTask?.id !== undefined && dayTasks.some(task => task.id === selectedTask.id);
                      const load = dayTasks.length;
                      const estimatedLoad = metrics?.estimatedLoad || 0;
                      const workingDay = metrics?.workingDay ?? !isNonWorkingDay(day, projectCalendar);
                      const available = metrics?.available ?? false;
                      const dailyCapacity = metrics?.dailyCapacity || 0;
                      const hasUnestimated = metrics?.hasUnestimated ?? false;
                      const capacityKnown = metrics?.capacityKnown ?? true;
                      const remaining = metrics?.remaining;
                      const isSelectedDay = related.length > 0;
                      const isOverload = metrics?.isOverload ?? false;
                      const isFree = metrics?.isFree ?? false;
                      const dayKind = isHoliday(day, projectCalendar) ? '节假日' : isWeekend(day) ? '周末' : !available ? '请假/不可用' : '工作日';
                      const loadLabel = estimatedLoad > 0 ? formatPersonDays(estimatedLoad) : '无排期';
                      const freeLabel = !capacityKnown ? '容量待确认' : isFree ? `可排 ${formatPersonDays(remaining || 0)}` : isOverload ? `超载 ${formatPersonDays(estimatedLoad - dailyCapacity)}` : '已满';
                      const title = `${dayLabel(day)} ${dayKind} · ${dayTasks.length ? `${dayTasks.map(task => task.title).join('、')}；` : ''}${loadLabel} · ${freeLabel}${hasUnestimated ? ' · 含未设置人日任务' : ''}`;
                      return <button type="button" key={key} onClick={() => dayTasks[0] && selectTask(dayTasks[0])} title={dayTasks.length ? `${dayTasks.map(task => task.title).join('、')} · 点击查看任务上下文` : title} aria-label={title} className={`relative h-12 w-[40px] shrink-0 overflow-hidden border-r border-gray-800/60 px-0.5 transition-colors hover:bg-white/[0.06] ${primary ? 'bg-cyan-500/35 ring-2 ring-inset ring-cyan-300/80' : isSelectedDay ? 'bg-indigo-500/25 ring-1 ring-inset ring-indigo-400/60' : isOverload ? 'bg-red-500/25' : !workingDay ? 'bg-slate-800/75' : !available ? 'bg-amber-950/40' : !capacityKnown ? 'bg-amber-500/15' : isFree ? 'bg-emerald-500/15' : 'bg-gray-900/10'}`}><span className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded text-[9px] font-semibold ${primary ? 'bg-cyan-500/50 text-cyan-50' : isSelectedDay ? 'bg-indigo-500/40 text-indigo-100' : isOverload ? 'text-red-300' : !workingDay ? 'text-slate-400' : !available ? 'text-amber-300' : !capacityKnown ? 'text-amber-200' : isFree ? 'text-emerald-200' : 'text-gray-300'}`}>{!workingDay ? (isHoliday(day, projectCalendar) ? '节' : '休') : !available ? '假' : !capacityKnown ? '?' : load || '·'}</span><span className={`mt-0.5 block truncate text-[8px] ${isFree ? 'text-emerald-300' : isOverload ? 'text-red-300' : !available ? 'text-amber-300' : !capacityKnown ? 'text-amber-200' : 'text-gray-600'}`}>{!workingDay ? (load ? `${load}项` : '休息') : !available ? '不可排' : !capacityKnown ? '待确认' : isFree ? `空${(remaining || 0).toFixed(1)}` : load ? `${estimatedLoad.toFixed(1)}` : '满'}</span>{related.length > 0 && <span className={`absolute bottom-0.5 left-1/2 block h-1 w-3 -translate-x-1/2 rounded-full ${primary ? 'bg-cyan-200' : 'bg-indigo-300'}`} />}{isFree && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-emerald-400/70" />}</button>;
                    })}</div>
                  </div>;
                })}
                {activeResources.length === 0 && <div className="p-8 text-center text-xs text-gray-600">暂无成员资源</div>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-gray-800 px-3 py-2 text-[10px] text-gray-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />可排空档（人日）</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />请假/不可用</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-300" />容量待确认</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-500" />周末/节假日</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500/60" />容量超载</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-400" />当前查看范围</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-300" />当前任务</span></div>
        </section>
      </div>
    </div>
  );
}
