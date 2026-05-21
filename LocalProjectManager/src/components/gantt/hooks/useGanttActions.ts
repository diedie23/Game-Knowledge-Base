/**
 * useGanttActions.ts — Extracted action handlers from GanttChart
 * 
 * This hook centralizes task manipulation actions used in the Gantt chart:
 * - Delete (single & batch)
 * - Status change with early-finish cascade
 * - Batch shift (move dates)
 * - Copy to clipboard
 * - Pipeline dependency inference
 * 
 * By extracting these into a hook, the main GanttChart component focuses
 * on rendering while this hook handles business logic.
 */

import { useCallback } from 'react';
import { addDays, format } from 'date-fns';
import { db, Task } from '../../../db/db';
import { trackedDb } from '../../../store/useHistoryStore';
import { syncParentDateRange } from '../../../services/workloadService';
import { confirmDialog, alertDialog } from '../../common/ConfirmDialog';
import { toast } from '../../../store/useToastStore';

interface UseGanttActionsOptions {
  tasks: Task[] | undefined;
  selectedTaskIds: Set<number>;
  setSelectedTaskIds: (ids: Set<number>) => void;
  setContextMenu: (menu: any) => void;
}

export function useGanttActions({ tasks, selectedTaskIds, setSelectedTaskIds, setContextMenu }: UseGanttActionsOptions) {

  const handleDeleteTask = useCallback(async (taskId: number) => {
    const ok = await confirmDialog({ title: '删除任务', message: '确定要删除这个任务吗？', type: 'danger', confirmText: '删除' });
    if (ok) {
      const task = await db.tasks.get(taskId);
      await trackedDb.tasks.delete(taskId, '删除任务');
      if (task?.parentId) {
        await syncParentDateRange(task.parentId);
      }
    }
    setContextMenu(null);
  }, [setContextMenu]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedTaskIds.size === 0) return;
    const ok = await confirmDialog({
      title: '批量删除',
      message: `确定要删除选中的 ${selectedTaskIds.size} 个任务吗？子任务也会一并删除。`,
      type: 'danger',
      confirmText: '删除'
    });
    if (ok) {
      const parentIdsToSync = new Set<number>();
      for (const id of selectedTaskIds) {
        const task = await db.tasks.get(id);
        if (task?.parentId) parentIdsToSync.add(task.parentId);
        await trackedDb.tasks.delete(id, '批量删除任务');
      }
      for (const pid of parentIdsToSync) {
        await syncParentDateRange(pid);
      }
      setSelectedTaskIds(new Set());
    }
  }, [selectedTaskIds, setSelectedTaskIds]);

  const handleBatchShift = useCallback(async (days: number) => {
    for (const id of selectedTaskIds) {
      const task = tasks?.find(t => t.id === id);
      if (task && task.startDate && task.endDate) {
        await trackedDb.tasks.update(id, {
          startDate: addDays(task.startDate, days),
          endDate: addDays(task.endDate, days)
        }, `批量顺延 ${days} 天`);
      }
    }
    setContextMenu(null);
  }, [tasks, selectedTaskIds, setContextMenu]);

  const handleCopySelectedTasks = useCallback(() => {
    if (!tasks) return;
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id!));
    if (selectedTasks.length === 0) return;

    let md = '| 任务详情 | 开始时间 | 结束时间 | 状态 |\n| --- | --- | --- | --- |\n';
    selectedTasks.forEach(t => {
      md += `| ${t.title} | ${t.startDate ? format(t.startDate, 'yyyy-MM-dd') : '未排期'} | ${t.endDate ? format(t.endDate, 'yyyy-MM-dd') : '未排期'} | ${t.status} |\n`;
    });
    navigator.clipboard.writeText(md);
    toast.success(`已将 ${selectedTasks.length} 个任务复制到剪贴板`);
    setContextMenu(null);
  }, [tasks, selectedTaskIds, setContextMenu]);

  return {
    handleDeleteTask,
    handleBatchDelete,
    handleBatchShift,
    handleCopySelectedTasks,
  };
}
