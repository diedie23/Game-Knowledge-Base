import { describe, expect, it } from 'vitest';
import { evaluateTapdSyncStatus, formatSyncScope } from './syncHealthService';
import type { SyncMeta } from '../types/sync';

const syncedMeta = (overrides: Partial<SyncMeta> = {}): SyncMeta => ({
  source: 'tapd',
  projectId: 1,
  lastPullAt: 1_000,
  lastPushAt: 0,
  status: 'idle',
  lastSuccessfulSyncAt: 1_000,
  lastRemoteTaskCount: 10,
  lastSyncComparable: true,
  lastSyncOperation: 'pull',
  ...overrides,
});

describe('syncHealthService', () => {
  it('formats the configured TAPD scope for the credibility panel', () => {
    expect(formatSyncScope({
      mode: 'recent',
      recentDays: 14,
      workitemTypeFilter: ['story', 'ui'],
      releaseFilter: ['release-1'],
      categoryKeywords: ['UI'],
      pipelineFilter: true,
    })).toBe('最近修改 · 14 天 · 需求类别 2 类 · 发布计划 1 项 · 关键词 1 个 · UX 管线筛选');
  });

  it('marks a clean full-scope sync as aligned', () => {
    expect(evaluateTapdSyncStatus({
      meta: syncedMeta(),
      linkedTaskCount: 10,
      pendingChanges: 0,
      unresolvedConflicts: 0,
    }).status).toBe('aligned');
  });

  it('flags count drift and unresolved work instead of claiming alignment', () => {
    expect(evaluateTapdSyncStatus({
      meta: syncedMeta(),
      linkedTaskCount: 9,
      pendingChanges: 0,
      unresolvedConflicts: 0,
    }).status).toBe('attention');
    expect(evaluateTapdSyncStatus({
      meta: syncedMeta(),
      linkedTaskCount: 10,
      pendingChanges: 2,
      unresolvedConflicts: 0,
    }).status).toBe('attention');
  });

  it('does not compare counts when only a selected subset was synced', () => {
    expect(evaluateTapdSyncStatus({
      meta: syncedMeta({ lastSyncComparable: false }),
      linkedTaskCount: 9,
      pendingChanges: 0,
      unresolvedConflicts: 0,
    }).status).toBe('partial');
  });
});
