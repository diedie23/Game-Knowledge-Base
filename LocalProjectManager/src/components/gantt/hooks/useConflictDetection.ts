import { useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import type { Task } from '../../../db/db';
import type { Resource } from '../../../types/resource';
import { getTaskTypeColor } from '../constants';

export function useConflictDetection(tasks: Task[] | undefined, resources?: Resource[]) {
  const getShortTaskName = useCallback((title: string, task?: Task) => {
    // For TAPD-synced tasks, preserve the full title (don't truncate by dash)
    if (task?.syncSource || task?.externalUrl) {
      return title;
    }
    const dashIndex = title.lastIndexOf('-');
    if (dashIndex !== -1 && dashIndex < title.length - 1) {
      return title.substring(dashIndex + 1).trim();
    }
    return title;
  }, []);

  // Build a set of CP resource IDs for quick lookup
  const cpResourceIds = useMemo(() => {
    if (!resources) return new Set<number>();
    return new Set(resources.filter(r => r.type === 'cp' && r.id).map(r => r.id!));
  }, [resources]);

  const scheduleConflicts = useMemo(() => {
    if (!tasks) return new Map<number, string>();
    const conflictMap = new Map<number, string>();

    // Build a quick lookup map for tasks by ID
    const taskMap = new Map<number, Task>();
    tasks.forEach(t => { if (t.id) taskMap.set(t.id, t); });

    // Helper: check if a task involves CP resources (CP-tracked tasks don't have schedule conflicts)
    const isCpTrackedTask = (task: Task): boolean => {
      if (!task.assigneeIds || task.assigneeIds.length === 0 || cpResourceIds.size === 0) return false;
      return task.assigneeIds.some(id => cpResourceIds.has(id));
    };

    // Only check tasks that have EXPLICIT dependencies declared
    tasks.forEach(task => {
      if (!task.dependencies || task.dependencies.length === 0 || !task.id) return;

      // Skip conflict detection for tasks tracked by CP resources
      if (isCpTrackedTask(task)) return;

      task.dependencies.forEach(depId => {
        const upstream = taskMap.get(depId);
        if (!upstream) return;

        // Skip conflict check if upstream is already done (completed tasks don't block)
        if (upstream.status === 'done') return;

        // Skip if upstream is also a CP-tracked task
        if (isCpTrackedTask(upstream)) return;

        // Conflict: downstream starts before upstream ends
        if (task.startDate && upstream.endDate && task.startDate < upstream.endDate) {
          const upstreamName = getShortTaskName(upstream.title);
          const downstreamName = getShortTaskName(task.title);
          
          // 如果是同类需求（如不同渠道的同一个 UI 设计任务），通常是并行关系，忽略冲突警告
          if (upstreamName === downstreamName) return;

          conflictMap.set(task.id!,
            '排期冲突：「' + downstreamName + '」开始时间(' + format(task.startDate, 'MM/dd') + ')早于上游依赖「' + upstreamName + '」结束时间(' + format(upstream.endDate, 'MM/dd') + ')');        }
      });
    });

    return conflictMap;
  }, [tasks, getShortTaskName, cpResourceIds]);

  const usedTaskTypes = useMemo(() => {
    if (!tasks) return [];
    const childTasks = tasks.filter(t => t.parentId);
    const usedSet = new Set<string>();
    const result: ReturnType<typeof getTaskTypeColor>[] = [];
    childTasks.forEach(t => {
      const typeColor = getTaskTypeColor(t.title);
      if (!usedSet.has(typeColor.label)) {
        usedSet.add(typeColor.label);
        result.push(typeColor);
      }
    });
    return result;
  }, [tasks]);

  return { scheduleConflicts, usedTaskTypes, getShortTaskName };
}
