import { db } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import type { Task, Project } from '../types';
import type { ProjectStatus, TaskStatus } from '../types';
import { toast } from '../store/useToastStore';

/**
 * Service for project-level pause/resume operations.
 * When a project is "killed" or shelved, all non-completed tasks
 * are paused and can be resumed later if the project restarts.
 */
export const projectPauseService = {
  /**
   * Pause a project: set project status to 'paused' and pause all non-done tasks.
   * Each task's current status is saved as previousStatus for later restoration.
   */
  async pauseProject(projectId: number, reason?: string): Promise<{ pausedCount: number }> {
    const project = await db.projects.get(projectId);
    if (!project) {
      toast.error('项目不存在');
      return { pausedCount: 0 };
    }

    // Update project status
    await db.projects.update(projectId, {
      status: 'paused' as ProjectStatus,
      pausedAt: new Date(),
      pauseReason: reason || '项目暂停',
    });

    // Get all non-done, non-paused tasks under this project
    const tasks = await db.tasks
      .where('projectId')
      .equals(projectId)
      .filter(t => t.status !== 'done' && t.status !== 'paused')
      .toArray();

    if (tasks.length === 0) {
      toast.info(`项目「${project.name}」已暂停，无需要暂停的任务`);
      return { pausedCount: 0 };
    }

    // Batch pause all tasks, saving their previous status
    const updates = tasks.map(t => ({
      id: t.id!,
      changes: {
        status: 'paused' as TaskStatus,
        previousStatus: t.status as TaskStatus,
        pausedAt: new Date(),
      } as Partial<Task>,
    }));

    await trackedDb.tasks.bulkUpdate(updates, `暂停项目「${project.name}」下 ${tasks.length} 个任务`);

    toast.success(`已暂停项目「${project.name}」，共 ${tasks.length} 个任务被暂停`);
    return { pausedCount: tasks.length };
  },

  /**
   * Resume a project: set project status back to 'active' and restore all paused tasks.
   * Tasks are restored to their previousStatus (or 'todo' if not recorded).
   */
  async resumeProject(projectId: number): Promise<{ resumedCount: number }> {
    const project = await db.projects.get(projectId);
    if (!project) {
      toast.error('项目不存在');
      return { resumedCount: 0 };
    }

    // Update project status
    await db.projects.update(projectId, {
      status: 'active' as ProjectStatus,
      pausedAt: undefined,
      pauseReason: undefined,
    });

    // Get all paused tasks under this project
    const pausedTasks = await db.tasks
      .where('projectId')
      .equals(projectId)
      .filter(t => t.status === 'paused')
      .toArray();

    if (pausedTasks.length === 0) {
      toast.info(`项目「${project.name}」已恢复，无需要恢复的任务`);
      return { resumedCount: 0 };
    }

    // Restore each task to its previous status
    const updates = pausedTasks.map(t => ({
      id: t.id!,
      changes: {
        status: (t.previousStatus || 'todo') as TaskStatus,
        previousStatus: undefined,
        pausedAt: undefined,
      } as Partial<Task>,
    }));

    await trackedDb.tasks.bulkUpdate(updates, `恢复项目「${project.name}」下 ${pausedTasks.length} 个任务`);

    toast.success(`已恢复项目「${project.name}」，共 ${pausedTasks.length} 个任务已恢复`);
    return { resumedCount: pausedTasks.length };
  },

  /**
   * Archive a project: permanently cancel all tasks and mark project as 'archived'.
   * Tasks are set to 'cancelled' status (cascading close).
   */
  async archiveProject(projectId: number, reason?: string): Promise<{ archivedCount: number }> {
    console.log(`[Cascade Close] Starting archiveProject for project ${projectId}`);
    
    const project = await db.projects.get(projectId);
    if (!project) {
      toast.error('项目不存在');
      return { archivedCount: 0 };
    }

    console.log(`[Cascade Close] Project found: ${project.name}, current status: ${project.status}`);

    // Update project status to archived
    await db.projects.update(projectId, {
      status: 'archived' as ProjectStatus,
      pausedAt: new Date(),
      pauseReason: reason || '项目已归档',
    });

    console.log(`[Cascade Close] Project status updated to 'archived'`);

    // Get all non-done, non-cancelled tasks under this project
    const tasks = await db.tasks
      .where('projectId')
      .equals(projectId)
      .filter(t => t.status !== 'done' && t.status !== 'cancelled')
      .toArray();

    console.log(`[Cascade Close] Found ${tasks.length} tasks to cancel`);

    if (tasks.length === 0) {
      toast.info(`项目「${project.name}」已归档，无需要关闭的任务`);
      return { archivedCount: 0 };
    }

    // Batch cancel all tasks (cascading close)
    const updates = tasks.map(t => ({
      id: t.id!,
      changes: {
        status: 'cancelled' as TaskStatus,
        previousStatus: t.status as TaskStatus,
        pausedAt: new Date(),
      } as Partial<Task>,
    }));

    console.log(`[Cascade Close] Cancelling ${tasks.length} tasks:`, tasks.map(t => `${t.id}:${t.title}`));

    await trackedDb.tasks.bulkUpdate(updates, `归档项目「${project.name}」— 级联关闭 ${tasks.length} 个任务`);

    console.log(`[Cascade Close] Successfully cancelled ${tasks.length} tasks`);

    toast.success(`已归档项目「${project.name}」，共 ${tasks.length} 个任务已关闭`);
    return { archivedCount: tasks.length };
  },

  /**
   * Get project status info for display purposes.
   */
  async getProjectPauseInfo(projectId: number): Promise<{
    status: ProjectStatus;
    pausedAt?: Date;
    pauseReason?: string;
    pausedTaskCount: number;
    totalTaskCount: number;
  } | null> {
    const project = await db.projects.get(projectId);
    if (!project) return null;

    const allTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    const pausedTasks = allTasks.filter(t => t.status === 'paused');

    return {
      status: project.status || 'active',
      pausedAt: project.pausedAt,
      pauseReason: project.pauseReason,
      pausedTaskCount: pausedTasks.length,
      totalTaskCount: allTasks.length,
    };
  },
};