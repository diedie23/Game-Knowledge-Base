import { useState, useEffect, useCallback } from 'react';
import { addDays } from 'date-fns';
import { trackedDb } from '../../../store/useHistoryStore';
import { db } from '../../../db/db';
import type { ResizeState } from '../types';
import { syncParentDateRange } from '../../../services/workloadService';

export function useGanttDrag(dayWidth: number) {
  const [resizing, setResizing] = useState<ResizeState | null>(null);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizing.initialX;
      // Magnetic snapping: if close to a day boundary, snap to it
      const rawDays = dx / dayWidth;
      const roundedDays = Math.round(rawDays);
      // Snap if within 20% of a day width
      const daysDelta = Math.abs(rawDays - roundedDays) < 0.2 ? roundedDays : rawDays;
      // For UI rendering, we still want integer days to avoid sub-pixel blur, but let's keep it integer for now
      setResizing(prev => prev ? { ...prev, daysDelta: Math.round(daysDelta) } : null);
    };
    const handleMouseUp = async () => {
      if (resizing) {
        const { taskId, edge, initialStartDate, initialEndDate, daysDelta } = resizing;
        if (daysDelta !== 0) {
          if (edge === 'left') {
            const newStart = addDays(initialStartDate, daysDelta);
            if (newStart <= initialEndDate) {
              await trackedDb.tasks.update(taskId, { startDate: newStart }, '拖拽调整任务开始时间');
            }
          } else {
            const newEnd = addDays(initialEndDate, daysDelta);
            if (newEnd >= initialStartDate) {
              await trackedDb.tasks.update(taskId, { endDate: newEnd }, '拖拽调整任务结束时间');
            }
          }
          // Auto-sync parent date range
          const task = await db.tasks.get(taskId);
          if (task?.parentId) {
            await syncParentDateRange(task.parentId);
          }
        }
      }
      setResizing(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, dayWidth]);

  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    taskId: number,
    edge: 'left' | 'right',
    taskStartDate: Date,
    taskEndDate: Date,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      taskId,
      edge,
      initialX: e.clientX,
      initialStartDate: taskStartDate,
      initialEndDate: taskEndDate,
      daysDelta: 0,
    });
  }, []);

  return { resizing, handleResizeStart };
}
