import { useState, useEffect, useCallback, useRef } from 'react';
import { addDays, differenceInDays } from 'date-fns';
import { trackedDb } from '../../../store/useHistoryStore';
import { Task } from '../../../db/db';
import { syncParentDateRange } from '../../../services/workloadService';

export function useTaskMove(dayWidth: number, tasks: Task[] | undefined) {
  const [movingTask, setMovingTask] = useState<{
    taskId: number;
    initialX: number;
    initialStartDate: Date;
    initialEndDate: Date;
    daysDelta: number;
  } | null>(null);

  const [cascadeShifts, setCascadeShifts] = useState<Map<number, number>>(new Map());

  // Track if a move just completed to prevent click from firing
  const justMovedRef = useRef(false);

  // Calculate cascade shifts when movingTask changes
  useEffect(() => {
    if (!movingTask || !tasks) {
      setCascadeShifts(new Map());
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
  }, [movingTask?.daysDelta, movingTask?.taskId, tasks]);

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
          
          // Check for conflicts if moving left (negative delta)
          let hasConflict = false;
          if (daysDelta < 0) {
            const task = tasks.find(t => t.id === taskId);
            if (task && task.startDate) {
              const newStartDate = addDays(task.startDate, daysDelta);
              hasConflict = task.dependencies.some(depId => {
                const dep = tasks.find(t => t.id === depId);
                return dep && dep.endDate && newStartDate < dep.endDate;
              });
            }
          }

          if (!hasConflict) {
            // Apply all shifts
            const affectedParentIds = new Set<number>();
            for (const [id, shift] of shiftsToApply.entries()) {
              if (shift !== 0) {
                const t = tasks.find(t => t.id === id);
                if (t && t.startDate && t.endDate) {
                  await trackedDb.tasks.update(id, {
                    startDate: addDays(t.startDate, shift),
                    endDate: addDays(t.endDate, shift)
                  }, id === taskId ? '拖拽移动任务排期' : (shift > 0 ? '级联顺延依赖任务' : '级联提前依赖任务'));
                  // Track parent for date range sync
                  if (t.parentId) affectedParentIds.add(t.parentId);
                }
              }
            }
            // Auto-sync parent date ranges
            for (const pid of affectedParentIds) {
              await syncParentDateRange(pid);
            }
          }
        }
      }
      setMovingTask(null);
      setCascadeShifts(new Map());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [movingTask, dayWidth, cascadeShifts, tasks]);

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

  return { movingTask, cascadeShifts, handleMoveStart, justMovedRef };
}
