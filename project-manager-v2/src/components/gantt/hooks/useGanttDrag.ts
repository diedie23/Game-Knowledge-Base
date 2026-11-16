import { useState, useEffect, useCallback } from 'react';
import { addDays } from 'date-fns';
import type { ResizeState } from '../types';
import type { ProjectCalendarConfig, Resource, ResourceCapacity, Task } from '../../../types';
import { validateGanttScheduleChanges, formatGanttValidationMessage, type GanttScheduleValidation } from '../../../services/ganttScheduleValidator';
import { applyScheduleChanges } from '../../../services/scheduleChangeService';
import { toast } from '../../../store/useToastStore';

export function useGanttDrag(
  dayWidth: number,
  tasks: Task[] | undefined,
  resources: Resource[] = [],
  capacities: ResourceCapacity[] = [],
  calendarConfig?: ProjectCalendarConfig,
) {
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [scheduleValidation, setScheduleValidation] = useState<GanttScheduleValidation | null>(null);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizing.initialX;
      // Magnetic snapping: if close to a day boundary, snap to it
      const rawDays = dx / dayWidth;
      const roundedDays = Math.round(rawDays);
      // Snap if within 20% of a day width
      const daysDelta = Math.abs(rawDays - roundedDays) < 0.2 ? roundedDays : rawDays;
      // Keep resize previews on whole day boundaries and validate the proposed edge immediately.
      const nextDaysDelta = Math.round(daysDelta);
      setResizing(prev => prev ? { ...prev, daysDelta: nextDaysDelta } : null);
      const nextStart = resizing.edge === 'left' ? addDays(resizing.initialStartDate, nextDaysDelta) : resizing.initialStartDate;
      const nextEnd = resizing.edge === 'right' ? addDays(resizing.initialEndDate, nextDaysDelta) : resizing.initialEndDate;
      setScheduleValidation(validateGanttScheduleChanges({
        tasks: tasks || [],
        resources,
        capacities,
        calendarConfig,
        changes: [{ taskId: resizing.taskId, startDate: nextStart, endDate: nextEnd }],
      }));
    };
    const handleMouseUp = async () => {
      if (resizing) {
        const { taskId, edge, initialStartDate, initialEndDate, daysDelta } = resizing;
        if (daysDelta !== 0) {
          const newStart = edge === 'left' ? addDays(initialStartDate, daysDelta) : initialStartDate;
          const newEnd = edge === 'right' ? addDays(initialEndDate, daysDelta) : initialEndDate;
          const validation = validateGanttScheduleChanges({
            tasks: tasks || [],
            resources,
            capacities,
            calendarConfig,
            changes: [{ taskId, startDate: newStart, endDate: newEnd }],
          });
          if (!validation.valid) {
            toast.error(formatGanttValidationMessage(validation));
          } else {
            const result = await applyScheduleChanges({
              source: 'gantt-resize',
              tasks: tasks || [],
              resources,
              capacities,
              calendarConfig,
              changes: [{ taskId, startDate: newStart, endDate: newEnd }],
              reason: edge === 'left' ? '拖拽调整任务开始时间' : '拖拽调整任务结束时间',
              description: '记录甘特图拉伸、成员与容量快照，以及保存后的实际结果。',
              projectId: tasks?.find(task => task.id === taskId)?.projectId,
            });
            if (result.applied) {
              toast.success(result.message);
            } else {
              toast.error(result.message);
            }
          }
        }
      }
      setResizing(null);
      setScheduleValidation(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, dayWidth, tasks, resources, capacities, calendarConfig]);

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

  return { resizing, scheduleValidation, handleResizeStart };
}
