import type { Task, ChangeLog } from '../types';

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
export class TapdSyncAdapter implements SyncAdapter {
  readonly name = 'tapd';
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  async pushChanges(logs: ChangeLog[]): Promise<void> {
    const { tapdService } = await import('./tapdService');
    const { db } = await import('../db/db');

    // Ensure config is loaded so credentials are available
    // Support multi-workspace: config stores comma-separated IDs, match by first ID or contains
    const allConfigs = await db.tapdConfigs.toArray();
    const config = allConfigs.find(c => c.workspaceId === this.workspaceId || c.workspaceId.includes(this.workspaceId));
    if (config) {
      await tapdService.loadConfig(config.projectId);
    }

    for (const log of logs) {
      if (log.table !== 'tasks') continue; // Only sync tasks to TAPD for now

      try {
        const task = await db.tasks.get(log.recordId);
        if (!task || !task.tapdId) {
          // Skip tasks that don't exist or aren't linked to TAPD
          continue;
        }

        // Extract the fields that actually changed
        const updates: Partial<Task> = {};
        if (log.action === 'update' && log.changes) {
          for (const [field, change] of Object.entries(log.changes)) {
            (updates as any)[field] = change.to;
          }
        } else if (log.action === 'create' && log.snapshot) {
           // For create, we might want to push the whole snapshot, but TAPD creation is complex.
           // For now, we focus on updating existing TAPD stories.
           console.warn('[TapdSyncAdapter] Creating new TAPD stories from local is not fully supported yet.');
           continue;
        }

        if (Object.keys(updates).length > 0) {
          await tapdService.updateTask(this.workspaceId, task.tapdId, updates);
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
    const config = allConfigs.find(c => c.workspaceId === this.workspaceId || c.workspaceId.includes(this.workspaceId));
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
      const config = allConfigs.find(c => c.workspaceId === this.workspaceId || c.workspaceId.includes(this.workspaceId));
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
