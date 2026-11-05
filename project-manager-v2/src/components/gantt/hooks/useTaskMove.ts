import { useState, useEffect, useCallback, useRef } from 'react';
import { addDays, differenceInDays } from 'date-fns';
import { trackedDb } from '../../../store/useHistoryStore';
import { db, Task } from '../../../db/db';
import type { Resource, ResourceCapacity } from '../../../types';
import { syncParentDateRange } from '../../../services/workloadService';
import { validateGanttScheduleChanges, formatGanttValidationMessage, type GanttScheduleValidation } from '../../../services/ganttScheduleValidator';
import { toast } from '../../../store/useToastStore';
import { createScheduleSnapshot } from '../../../services/scheduleSnapshotService';

export function useTaskMove(
  dayWidth: number,
  tasks: Task[] | undefined,
  resources: Resource[] = [],
  capacities: ResourceCapacity[] = [],
) {
  const [movingTask, setMovingTask] = useState<{
    taskId: number;
    initialX: number;
    initialStartDate: Date;
    initialEndDate: Date;
    daysDelta: number;
  } | null>(null);

  const [cascadeShifts, setCascadeShifts] = useState<Map<number, number>>(new Map());
  const [scheduleValidation, setScheduleValidation] = useState<GanttScheduleValidation | null>(null);

  const buildDateChanges = useCallback((shifts: Map<number, number>) => {
    if (!tasks) return [];
    return [...shifts.entries()]
      .filter(([, shift]) => shift !== 0)
      .map(([taskId, shift]) => {
        const task = tasks.find(candidate => candidate.id === taskId);
        if (!task?.startDate || !task.endDate) return null;
        return {
          taskId,
          startDate: addDays(task.startDate, shift),
          endDate: addDays(task.endDate, shift),
        };
      })
      .filter((change): change is NonNullable<typeof change> => change !== null);
  }, [tasks]);

  // Track if a move just completed to prevent click from firing
  const justMovedRef = useRef(false);

  // Calculate cascade shifts when movingTask changes
  useEffect(() => {
    if (!movingTask || !tasks) {
      setCascadeShifts(new Map());
      setScheduleValidation(null);
      return;
    }

    const { taskId, daysDelta } = movingTask;
    const shifts = new Map<number, number>();
    shifts.set(taskId, daysDelta);

    if (daysDelta !== 0) {
      // Build dependency graph: depId -> tasks that depend on it
      const dependentsMap = new Map<number, Task[]>();
      tasks.forEach(t => {
        t.dependencies?.forEach(depId => {
          if (!dependentsMap.has(depId)) dependentsMap.set(depId, []);
          dependentsMap.get(depId)!.push(t);
        });
      });

      const queue = [taskId];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentShift = shifts.get(currentId)!;
        const currentTask = tasks.find(t => t.id === currentId)!;
        if (!currentTask.endDate) continue;
        const newEndDate = addDays(currentTask.endDate, currentShift);

        const dependents = dependentsMap.get(currentId) || [];
        for (const dep of dependents) {
          if (!dep.startDate || !dep.endDate) continue;

          if (daysDelta > 0) {
            // Moving right (delay): push downstream if it would overlap
            if (newEndDate > dep.startDate) {
              const requiredShift = differenceInDays(newEndDate, dep.startDate);
              const existingShift = shifts.get(dep.id!) || 0;
              if (requiredShift > existingShift) {
                shifts.set(dep.id!, requiredShift);
                queue.push(dep.id!);
              }
            }
          } else {
            // Moving left (advance): pull downstream forward by the same amount
            // Regardless of gap (positive or negative/overlapping), maintain relative position
            const advanceShift = currentShift;
            if (advanceShift < 0) {
              const existingShift = shifts.get(dep.id!) || 0;
              if (advanceShift < existingShift) {
                shifts.set(dep.id!, advanceShift);
                queue.push(dep.id!);
              }
            }
          }
        }
      }
    }

    setCascadeShifts(shifts);
    setScheduleValidation(validateGanttScheduleChanges({
      tasks,
      resources,
      capacities,
      changes: buildDateChanges(shifts),
    }));
  }, [movingTask?.daysDelta, movingTask?.taskId, tasks, resources, capacities, buildDateChanges]);

  useEffect(() => {
    if (!movingTask) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - movingTask.initialX;
      // Magnetic snapping
      const rawDays = dx / dayWidth;
      const roundedDays = Math.round(rawDays);
      const daysDelta = Math.abs(rawDays - roundedDays) < 0.2 ? roundedDays : Math.round(rawDays);
      setMovingTask(prev => prev ? { ...prev, daysDelta } : null);
    };

    const handleMouseUp = async () => {
      // Mark move completed BEFORE any async operations to prevent click from firing
      if (movingTask && movingTask.daysDelta !== 0) {
        justMovedRef.current = true;
        setTimeout(() => { justMovedRef.current = false; }, 300);
      }

      if (movingTask && tasks) {
        const { taskId, daysDelta } = movingTask;
        if (daysDelta !== 0) {
          // Apply cascade shifts
          const shiftsToApply = cascadeShifts;
          
          const validation = validateGanttScheduleChanges({
            tasks,
            resources,
            capacities,
            changes: buildDateChanges(shiftsToApply),
          });

          if (!validation.valid) {
            toast.error(formatGanttValidationMessage(validation));
          } else {
            // Apply all shifts only after the complete cascade passes one shared validation.
            const affectedParentIds = new Set<number>();
            for (const [id, shift] of shiftsToApply.entries()) {
              if (shift !== 0) {
                const t = tasks.find(t => t.id === id);
                if (t && t.startDate && t.endDate) {
                  await trackedDb.tasks.update(id, {
                    startDate: addDays(t.startDate, shift),
                    endDate: addDays(t.endDate, shift)
                  }, id === taskId ? '拖拽移动任务排期' : (shift > 0 ? '级联顺延依赖任务' : '级联提前依赖任务'));
                  if (t.parentId) affectedParentIds.add(t.parentId);
                }
              }
            }
            for (const pid of affectedParentIds) {
              await syncParentDateRange(pid);
            }
            const affectedTaskIds = [...shiftsToApply.entries()]
              .filter(([, shift]) => shift !== 0)
              .map(([id]) => id);
            const tasksAfter = await db.tasks.where('id').anyOf(affectedTaskIds).toArray();
            await createScheduleSnapshot({
              source: 'gantt-move',
              status: 'applied',
              projectId: tasks.find(task => task.id === taskId)?.projectId,
              reason: `甘特图移动任务：${tasks.find(task => task.id === taskId)?.title || `#${taskId}`}`,
              description: '记录甘特图拖拽、级联影响、成员与容量快照，以及保存后的实际结果。',
              taskIds: affectedTaskIds,
              tasksBefore: tasks.filter(task => affectedTaskIds.includes(task.id!)),
              tasksAfter,
              resources,
              capacities,
              changes: buildDateChanges(shiftsToApply),
              validation,
              appliedAt: Date.now(),
            });
            toast.success(formatGanttValidationMessage(validation));
          }
        }
      }
      setMovingTask(null);
      setCascadeShifts(new Map());
      setScheduleValidation(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [movingTask, dayWidth, cascadeShifts, tasks, resources, capacities, buildDateChanges]);

  const handleMoveStart = useCallback((
    e: React.MouseEvent,
    taskId: number,
    taskStartDate: Date,
    taskEndDate: Date,
  ) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();
    setMovingTask({
      taskId,
      initialX: e.clientX,
      initialStartDate: taskStartDate,
      initialEndDate: taskEndDate,
      daysDelta: 0,
    });
  }, []);

  return { movingTask, cascadeShifts, scheduleValidation, handleMoveStart, justMovedRef };
}
