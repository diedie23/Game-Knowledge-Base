import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import { addDays, startOfToday, isWeekend } from 'date-fns';
import type { Task, Resource } from '../../../types';
import { isHoliday } from '../../../utils/dateUtils';
import { compareResources } from '../../gantt/constants';
import { getTaskTypeColorValue } from '../../../constants/theme';
import { isTaskCompleted, isTaskOverdue, isTaskTerminal } from '../../../utils/taskState';
import { dedupeResourcesForDisplay, getResourceAliasIds } from '../../../utils/resourceDedup';

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

interface MemberStats {
  inProgress: number;
  todo: number;
  done: number;
  overdue: number;
}

/**
 * Sidebar member indicators are visible on every view. Keep all expensive task
 * indexing here so switching views does not repeatedly scan the whole task tree
 * once per member (the old path was O(member * task * parent-checks)).
 */
export function useMemberStats(projectId?: number | null) {
  const resources = useLiveQuery(() => db.resources.toArray());
  const tasks = useLiveQuery(
    () => projectId != null
      ? db.tasks.where('projectId').equals(projectId).toArray()
      : db.tasks.toArray(),
    [projectId],
  );
  const projects = useLiveQuery(() => db.projects.toArray());
  const today = useMemo(() => startOfToday(), []);

  const archivedProjectIds = useMemo(
    () => new Set((projects || []).filter(project => project.status === 'archived').map(project => project.id)),
    [projects],
  );

  const parentTaskIds = useMemo(() => {
    const ids = new Set<number>();
    (tasks || []).forEach(task => {
      if (task.parentId !== undefined) ids.add(task.parentId);
    });
    return ids;
  }, [tasks]);

  const resourceAliasesById = useMemo(() => {
    const result = new Map<number, number[]>();
    if (!resources) return result;
    resources.forEach(resource => {
      if (resource.id !== undefined) {
        result.set(resource.id, getResourceAliasIds(resource, resources));
      }
    });
    return result;
  }, [resources]);

  // Index leaf tasks once by direct assignee. Member aliases are merged below.
  const tasksByAssigneeId = useMemo(() => {
    const result = new Map<number, Task[]>();
    (tasks || []).forEach(task => {
      if (!task.id || parentTaskIds.has(task.id)) return;
      if (task.projectId !== undefined && archivedProjectIds.has(task.projectId)) return;
      if (projectId != null && task.projectId !== projectId) return;
      (task.assigneeIds || []).forEach(resourceId => {
        const bucket = result.get(resourceId) || [];
        bucket.push(task);
        result.set(resourceId, bucket);
      });
    });
    return result;
  }, [tasks, parentTaskIds, archivedProjectIds, projectId]);

  const memberTasksById = useMemo(() => {
    const result = new Map<number, Task[]>();
    if (!resources) return result;

    resources.forEach(resource => {
      if (resource.id === undefined) return;
      const seen = new Set<number>();
      const memberTasks: Task[] = [];
      const aliasIds = resourceAliasesById.get(resource.id) || [resource.id];
      aliasIds.forEach(aliasId => {
        (tasksByAssigneeId.get(aliasId) || []).forEach(task => {
          if (task.id === undefined || seen.has(task.id)) return;
          seen.add(task.id);
          memberTasks.push(task);
        });
      });
      result.set(resource.id, memberTasks);
    });
    return result;
  }, [resources, resourceAliasesById, tasksByAssigneeId]);

  const allTasksByResourceId = useMemo(() => {
    const result = new Map<number, Task[]>();
    if (!resources) return result;
    const directTasksByAssignee = new Map<number, Task[]>();
    (tasks || []).forEach(task => {
      (task.assigneeIds || []).forEach(resourceId => {
        const bucket = directTasksByAssignee.get(resourceId) || [];
        bucket.push(task);
        directTasksByAssignee.set(resourceId, bucket);
      });
    });

    resources.forEach(resource => {
      if (resource.id === undefined) return;
      const seen = new Set<number>();
      const memberTasks: Task[] = [];
      const aliasIds = resourceAliasesById.get(resource.id) || [resource.id];
      aliasIds.forEach(aliasId => {
        (directTasksByAssignee.get(aliasId) || []).forEach(task => {
          if (task.id === undefined || seen.has(task.id)) return;
          seen.add(task.id);
          memberTasks.push(task);
        });
      });
      result.set(resource.id, memberTasks);
    });
    return result;
  }, [tasks, resources, resourceAliasesById]);

  const getResourceColor = useMemo(() => {
    const colors = new Map<number, string>();
    (resources || []).forEach(resource => {
      if (resource.id === undefined) return;
      const colorCount = new Map<string, number>();
      (allTasksByResourceId.get(resource.id) || [])
        .filter(task => task.parentId !== undefined)
        .forEach(task => {
          const color = getTaskTypeColorValue(task.title);
          colorCount.set(color, (colorCount.get(color) || 0) + 1);
        });
      let maxColor = '#5b5fc7';
      let maxCount = 0;
      colorCount.forEach((count, color) => {
        if (count > maxCount) {
          maxCount = count;
          maxColor = color;
        }
      });
      colors.set(resource.id, maxColor);
    });
    return (resourceId: number) => colors.get(resourceId) || '#5b5fc7';
  }, [resources, allTasksByResourceId]);

  // Sorted resources: type (internal→cp) → role order (UX→UI→Layout→…) → sortOrder
  // Include explicit project members as well as legacy resources with tasks in that project.
  const sortedResources = useMemo(() => {
    if (!resources) return [];
    let filtered = [...resources];
    if (projectId != null && tasks) {
      const projectAssigneeIds = new Set<number>();
      tasks.forEach(task => {
        if (task.projectId === projectId) {
          (task.assigneeIds || []).forEach(id => projectAssigneeIds.add(id));
        }
      });
      filtered = filtered.filter(resource =>
        resource.projectIds?.includes(projectId) || projectAssigneeIds.has(resource.id!),
      );
    }
    return dedupeResourcesForDisplay(filtered).sort(compareResources);
  }, [resources, tasks, projectId]);

  const memberStatsById = useMemo(() => {
    const result = new Map<number, MemberStats>();
    memberTasksById.forEach((memberTasks, resourceId) => {
      result.set(resourceId, {
        inProgress: memberTasks.filter(task => task.status === 'in_progress' && !isTaskTerminal(task)).length,
        todo: memberTasks.filter(task => task.status === 'todo' && !isTaskTerminal(task)).length,
        done: memberTasks.filter(isTaskCompleted).length,
        overdue: memberTasks.filter(task => isTaskOverdue(task, today)).length,
      });
    });
    return result;
  }, [memberTasksById, today]);

  // Compute member overview data on demand, but read from the shared index.
  const getMemberOverview = useMemo(() => {
    return (memberId: number): MemberOverviewData | null => {
      const resource = resources?.find(item => item.id === memberId);
      const myTasks = memberTasksById.get(memberId);
      if (!resource || !myTasks) return null;

      const freeDays: Date[] = [];
      for (let i = 0; i < 14; i++) {
        const day = addDays(today, i);
        if (isWeekend(day) || isHoliday(day)) continue;
        const hasTasks = myTasks.some(task => {
          if (!task.startDate || !task.endDate) return false;
          return day >= new Date(task.startDate) && day <= new Date(task.endDate) && !isTaskTerminal(task);
        });
        if (!hasTasks) freeDays.push(day);
      }

      return {
        resource,
        total: myTasks.length,
        todo: myTasks.filter(task => task.status === 'todo' && !isTaskTerminal(task)),
        inProgress: myTasks.filter(task => task.status === 'in_progress' && !isTaskTerminal(task)),
        done: myTasks.filter(isTaskCompleted),
        overdue: myTasks.filter(task => isTaskOverdue(task, today)),
        freeDays,
        myTasks,
      };
    };
  }, [resources, memberTasksById, today]);

  const getMemberTaskStats = useMemo(() => {
    return (resourceId: number) => memberStatsById.get(resourceId) || {
      inProgress: 0,
      todo: 0,
      done: 0,
      overdue: 0,
    };
  }, [memberStatsById]);

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
