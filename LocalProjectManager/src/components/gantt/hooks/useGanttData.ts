/**
 * useGanttData.ts — Data processing hook for GanttChart
 * 
 * Extracts the heavy data computation logic from GanttChart:
 * - Dashboard metrics calculation
 * - Critical path detection
 * - Schedule conflict analysis
 * - Task filtering and grouping
 * 
 * This hook is designed to be consumed by the main GanttChart component,
 * reducing its cognitive complexity while keeping all data transformations
 * in one testable location.
 */

import { useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { Task } from '../../../db/db';
import { useConflictDetection } from './useConflictDetection';
import type { Resource } from '../../../db/db';

export interface DashboardMetrics {
  blockedCount: number;
  typeHealth: Map<string, { total: number; onTime: number }>;
  progress: number;
  totalDays: number;
  completedDays: number;
}

export function useGanttData(tasks: Task[] | undefined, resources: Resource[] | undefined) {
  // Conflict detection
  const { scheduleConflicts, usedTaskTypes, getShortTaskName } = useConflictDetection(tasks, resources);

  // Dashboard metrics
  const dashboardMetrics = useMemo<DashboardMetrics | null>(() => {
    if (!tasks) return null;

    const blockedCount = scheduleConflicts.size;

    // Health by type
    const typeHealth = new Map<string, { total: number; onTime: number }>();
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

    // Burn-down (simplified)
    const scheduledTasks = tasks.filter(t => t.startDate && t.endDate);
    const totalDays = scheduledTasks.reduce((sum, t) => sum + differenceInDays(t.endDate!, t.startDate!) + 1, 0);
    const completedDays = scheduledTasks.filter(t => t.status === 'done').reduce((sum, t) => sum + differenceInDays(t.endDate!, t.startDate!) + 1, 0);
    const progress = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

    return { blockedCount, typeHealth, progress, totalDays, completedDays };
  }, [tasks, scheduleConflicts]);

  // Critical path calculation
  const criticalPathTaskIds = useMemo(() => {
    if (!tasks || tasks.length === 0) return new Set<number>();

    const criticalIds = new Set<number>();
    const taskMap = new Map<number, Task>();
    tasks.forEach(t => taskMap.set(t.id!, t));

    // Build reverse dependency graph
    const reverseDeps = new Map<number, Task[]>();
    tasks.forEach(t => {
      t.dependencies?.forEach(depId => {
        if (!reverseDeps.has(depId)) reverseDeps.set(depId, []);
        reverseDeps.get(depId)!.push(t);
      });
    });

    // Find tasks with no successors (end nodes)
    const endNodes = tasks.filter(t => !reverseDeps.has(t.id!) && t.endDate);

    // Trace back from end nodes through dependencies
    const traceCriticalPath = (taskId: number) => {
      criticalIds.add(taskId);
      const task = taskMap.get(taskId);
      if (!task?.dependencies) return;
      for (const depId of task.dependencies) {
        if (!criticalIds.has(depId)) {
          traceCriticalPath(depId);
        }
      }
    };

    // Start from the latest end node
    if (endNodes.length > 0) {
      const latestEnd = endNodes.reduce((latest, t) =>
        t.endDate! > latest.endDate! ? t : latest
      );
      traceCriticalPath(latestEnd.id!);
    }

    return criticalIds;
  }, [tasks]);

  return {
    scheduleConflicts,
    usedTaskTypes,
    getShortTaskName,
    dashboardMetrics,
    criticalPathTaskIds,
  };
}
