import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import { addDays, startOfToday, isWeekend, format } from 'date-fns';
import type { Task, Resource } from '../../../types';
import { isHoliday } from '../../../utils/dateUtils';
import { compareResources } from '../../gantt/constants';
import { getTaskTypeColorValue } from '../../../constants/theme';

export interface MemberOverviewData {
  resource: Resource;
  total: number;
  todo: Task[];
  inProgress: Task[];
  done: Task[];
  overdue: Task[];
  freeDays: Date[];
  myTasks: Task[];
}

export function useMemberStats(projectId?: number | null) {
  const resources = useLiveQuery(() => db.resources.toArray());
  const tasks = useLiveQuery(() => db.tasks.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const today = startOfToday();

  // Get dominant task type color for a resource
  const getResourceColor = useMemo(() => {
    return (resourceId: number) => {
      if (!tasks) return '#5b5fc7';
      const myTasks = tasks.filter(t => t.assigneeIds?.includes(resourceId) && t.parentId);
      if (myTasks.length === 0) return '#5b5fc7';
      const colorCount = new Map<string, number>();
      myTasks.forEach(t => {
        const c = getTaskTypeColorValue(t.title);
        colorCount.set(c, (colorCount.get(c) || 0) + 1);
      });
      let maxColor = '#5b5fc7';
      let maxCount = 0;
      colorCount.forEach((count, color) => {
        if (count > maxCount) { maxCount = count; maxColor = color; }
      });
      return maxColor;
    };
  }, [tasks]);

  // Sorted resources: type (internal→cp) → role order (UX→UI→Layout→…) → sortOrder
  // When projectId is provided, only include resources with tasks in that project
  const sortedResources = useMemo(() => {
    if (!resources) return [];
    let filtered = [...resources];
    if (projectId != null && tasks) {
      filtered = filtered.filter(r =>
        tasks.some(t => t.assigneeIds?.includes(r.id!) && t.projectId === projectId)
      );
    }
    return filtered.sort(compareResources);
  }, [resources, tasks, projectId]);

  // Compute member overview data
  const getMemberOverview = useMemo(() => {
    return (memberId: number): MemberOverviewData | null => {
      const resource = resources?.find(r => r.id === memberId);
      if (!resource || !tasks) return null;

      // Build archived project id set
      const archivedProjectIds = new Set(
        (projects || []).filter(p => p.status === 'archived').map(p => p.id)
      );

      // Leaf tasks only (exclude parent tasks to match heatmap stats, exclude archived project tasks, filter by selected project)
      const myTasks = tasks.filter(t => {
        if (!t.assigneeIds?.includes(memberId)) return false;
        if (t.projectId !== undefined && archivedProjectIds.has(t.projectId)) return false;
        if (projectId != null && t.projectId !== projectId) return false;
        const hasChildren = tasks.some(child => child.parentId === t.id);
        return !hasChildren;
      });
      const todo = myTasks.filter(t => t.status === 'todo');
      const inProgress = myTasks.filter(t => t.status === 'in_progress');
      const done = myTasks.filter(t => t.status === 'done');
      const overdue = myTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.endDate && new Date(t.endDate) < today);

      // Find free days in the next 14 days (excluding weekends and holidays)
      const freeDays: Date[] = [];
      for (let i = 0; i < 14; i++) {
        const day = addDays(today, i);
        if (isWeekend(day) || isHoliday(day)) continue;
        const hasTasks = myTasks.some(t => {
          if (!t.startDate || !t.endDate) return false;
          const start = new Date(t.startDate);
          const end = new Date(t.endDate);
          return day >= start && day <= end && t.status !== 'done' && t.status !== 'cancelled';
        });
        if (!hasTasks) freeDays.push(day);
      }

      return { resource, total: myTasks.length, todo, inProgress, done, overdue, freeDays, myTasks };
    };
  }, [resources, tasks, projects, today, projectId]);

  // Get task stats for a single member (for micro indicators, leaf tasks only)
  const getMemberTaskStats = useMemo(() => {
    return (resourceId: number) => {
      const archivedProjectIds = new Set(
        (projects || []).filter(p => p.status === 'archived').map(p => p.id)
      );
      const memberTasks = tasks?.filter(t => {
        if (!t.assigneeIds?.includes(resourceId)) return false;
        if (t.projectId !== undefined && archivedProjectIds.has(t.projectId)) return false;
        if (projectId != null && t.projectId !== projectId) return false;
        // Exclude parent tasks
        const hasChildren = tasks.some(child => child.parentId === t.id);
        return !hasChildren;
      }) || [];
      return {
        inProgress: memberTasks.filter(t => t.status === 'in_progress').length,
        todo: memberTasks.filter(t => t.status === 'todo').length,
        done: memberTasks.filter(t => t.status === 'done').length,
        overdue: memberTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.endDate && new Date(t.endDate) < today).length,
      };
    };
  }, [tasks, projects, today, projectId]);

  return {
    resources,
    tasks,
    today,
    sortedResources,
    getResourceColor,
    getMemberOverview,
    getMemberTaskStats,
  };
}
