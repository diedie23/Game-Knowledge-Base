import type { Task, ChangeLog } from '../types';
import { configContainsTapdWorkspace, parseTapdWorkspaceIds } from '../utils/tapdIdentity';

/**
 * SyncAdapter interface - abstracts the remote data source for bidirectional sync.
 * Implementations can target TAPD, mock, or any future backend.
 */
export interface SyncAdapter {
  /** Unique identifier for this adapter (e.g. 'tapd', 'mock') */
  readonly name: string;

  /** Push a batch of local change logs to the remote source */
  pushChanges(logs: ChangeLog[]): Promise<void>;

  /** Pull remote changes since a given timestamp, returning partial Task records */
  pullChanges(since: number): Promise<Partial<Task>[]>;

  /** Check if the remote source is reachable */
  isAvailable(): Promise<boolean>;
}

/**
 * MockSyncAdapter - simulates network latency and occasional failures.
 * Used for development and testing when no real backend is available.
 */
export class MockSyncAdapter implements SyncAdapter {
  readonly name = 'mock';

  async pushChanges(_logs: ChangeLog[]): Promise<void> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    // Simulate occasional failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Network timeout: remote server did not respond');
    }
  }

  async pullChanges(_since: number): Promise<Partial<Task>[]> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
    // Return empty - no new remote changes in mock mode
    return [];
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock is always "available"
  }
}

/**
 * TapdSyncAdapter - real TAPD integration via MCP proxy.
 * Delegates to tapdService for actual API calls.
 */
const TAPD_WRITE_FIELDS = new Set(['title', 'description', 'status', 'priority', 'startDate', 'endDate']);

export class TapdSyncAdapter implements SyncAdapter {
  readonly name = 'tapd';
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  async pushChanges(logs: ChangeLog[]): Promise<void> {
    const { tapdService } = await import('./tapdService');
    const { db } = await import('../db/db');

    // Ensure config is loaded so credentials are available.
    const allConfigs = await db.tapdConfigs.toArray();
    const adapterWorkspaceIds = parseTapdWorkspaceIds(this.workspaceId);
    const config = allConfigs.find(c => adapterWorkspaceIds.some(id => configContainsTapdWorkspace(c.workspaceId, id)));
    if (config) {
      await tapdService.loadConfig(config.projectId);
    }

    for (const log of logs) {
      try {
        if (log.table !== 'tasks') {
          throw new Error(`TAPD 当前不支持同步 ${log.table} 表变更，请保留待同步记录并人工处理`);
        }
        if (log.action !== 'update') {
          throw new Error(`TAPD 当前不支持本地 ${log.action === 'create' ? '新建' : '删除'}任务回写，请先在 TAPD 中操作`);
        }

        const task = await db.tasks.get(log.recordId);
        if (!task) throw new Error(`本地任务 #${log.recordId} 不存在，无法确认 TAPD 回写对象`);
        if (!task.tapdId) throw new Error(`本地任务「${task.title}」没有 TAPD ID，无法安全回写`);

        const changedFields = Object.keys(log.changes || {});
        const unsupportedFields = changedFields.filter(field => !TAPD_WRITE_FIELDS.has(field));
        if (unsupportedFields.length > 0) {
          throw new Error(`TAPD 暂不支持回写字段：${unsupportedFields.join('、')}`);
        }

        const updates: Partial<Task> = {};
        for (const [field, change] of Object.entries(log.changes || {})) {
          (updates as any)[field] = change.to;
        }
        if (Object.keys(updates).length === 0) {
          throw new Error(`任务 #${log.recordId} 没有可回写的字段变化`);
        }

        const workspaceId = task.tapdWorkspaceId || adapterWorkspaceIds[0];
        if (!workspaceId) throw new Error(`任务「${task.title}」缺少 TAPD 工作区身份，无法安全回写`);
        const updated = await tapdService.updateTask(workspaceId, task.tapdId, updates);
        if (!updated) {
          throw new Error(`TAPD 未确认任务 ${task.tapdId} 的更新`);
        }
      } catch (error) {
        console.error(`[TapdSyncAdapter] Failed to push change for task ${log.recordId}:`, error);
        throw error; // Re-throw to let syncEngine handle the failure
      }
    }
  }

  async pullChanges(_since: number): Promise<Partial<Task>[]> {
    const { tapdService } = await import('./tapdService');
    // Ensure config is loaded so credentials are available
    const { db } = await import('../db/db');
    const allConfigs = await db.tapdConfigs.toArray();
    const workspaceIds = parseTapdWorkspaceIds(this.workspaceId);
    const config = allConfigs.find(c => workspaceIds.some(id => configContainsTapdWorkspace(c.workspaceId, id)));
    if (config) {
      await tapdService.loadConfig(config.projectId);
    }
    return tapdService.fetchTasks(this.workspaceId);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { tapdService } = await import('./tapdService');
      const { db } = await import('../db/db');
      const allConfigs = await db.tapdConfigs.toArray();
      const workspaceIds = parseTapdWorkspaceIds(this.workspaceId);
      const config = allConfigs.find(c => workspaceIds.some(id => configContainsTapdWorkspace(c.workspaceId, id)));
      const result = await tapdService.testConnection(
        this.workspaceId,
        config?.apiUser,
        config?.apiPassword,
        config?.apiToken
      );
      return result.success;
    } catch {
      return false;
    }
  }
}
