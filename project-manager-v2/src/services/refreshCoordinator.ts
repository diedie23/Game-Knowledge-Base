import { tapdService } from './tapdService';
import type { RefreshResult } from '../types/tapd';
import type { TapdReleasePlan } from './releasePlanService';

export type RefreshResource = 'tasks' | 'members' | 'releasePlans';

export interface RefreshOptions {
  force?: boolean;
  staleAfterMs?: number;
}

export interface RefreshSnapshot<T> {
  projectId: number;
  resource: RefreshResource;
  refreshedAt: number;
  servedFromCache: boolean;
  value: T;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

type RefreshValue = RefreshResult | TapdReleasePlan[] | unknown;

/**
 * Coordinate page-level TAPD refreshes. Views should read local Dexie data first
 * and use this service for one deduplicated, TTL-aware remote refresh per project.
 */
class RefreshCoordinator {
  private readonly inFlight = new Map<string, Promise<RefreshSnapshot<RefreshValue>>>();
  private readonly cache = new Map<string, RefreshSnapshot<RefreshValue>>();

  async refreshTasks(projectId: number, options?: RefreshOptions): Promise<RefreshSnapshot<RefreshResult>> {
    return this.refresh(projectId, 'tasks', () => tapdService.refreshExistingTasks(projectId), options) as Promise<RefreshSnapshot<RefreshResult>>;
  }

  async refreshMembers(projectId: number, options?: RefreshOptions): Promise<RefreshSnapshot<unknown>> {
    return this.refresh(projectId, 'members', () => tapdService.syncProjectMembers(projectId), options);
  }

  async refreshReleasePlans(projectId: number, options?: RefreshOptions): Promise<RefreshSnapshot<TapdReleasePlan[]>> {
    return this.refresh(projectId, 'releasePlans', () => tapdService.getReleasePlans(projectId), options) as Promise<RefreshSnapshot<TapdReleasePlan[]>>;
  }

  getCached<T extends RefreshValue>(projectId: number, resource: RefreshResource): RefreshSnapshot<T> | undefined {
    return this.cache.get(this.key(projectId, resource)) as RefreshSnapshot<T> | undefined;
  }

  clearProject(projectId: number): void {
    for (const resource of ['tasks', 'members', 'releasePlans'] as RefreshResource[]) {
      this.cache.delete(this.key(projectId, resource));
    }
  }

  private key(projectId: number, resource: RefreshResource): string {
    return `${projectId}:${resource}`;
  }

  private async refresh<T extends RefreshValue>(
    projectId: number,
    resource: RefreshResource,
    operation: () => Promise<T>,
    options?: RefreshOptions,
  ): Promise<RefreshSnapshot<T>> {
    const key = this.key(projectId, resource);
    const running = this.inFlight.get(key);
    if (running) return running as Promise<RefreshSnapshot<T>>;

    const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    const cached = this.cache.get(key);
    if (!options?.force && cached && Date.now() - cached.refreshedAt < staleAfterMs) {
      return { ...cached, servedFromCache: true } as RefreshSnapshot<T>;
    }

    const request = operation()
      .then(value => {
        const snapshot: RefreshSnapshot<T> = {
          projectId,
          resource,
          refreshedAt: Date.now(),
          servedFromCache: false,
          value,
        };
        this.cache.set(key, snapshot as RefreshSnapshot<RefreshValue>);
        return snapshot;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request as Promise<RefreshSnapshot<RefreshValue>>);
    return request;
  }
}

export const refreshCoordinator = new RefreshCoordinator();
