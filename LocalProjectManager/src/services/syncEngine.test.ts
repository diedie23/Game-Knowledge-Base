import { describe, it, expect, vi } from 'vitest';

// Mock browser globals before importing syncEngine (which references window/navigator)
vi.stubGlobal('navigator', { onLine: true });
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Dynamic import to ensure stubs are in place before module loads
const { conflictResolver } = await import('./syncEngine');

// ─── conflictResolver.detectConflicts ───────────────────────────
describe('conflictResolver.detectConflicts', () => {
  it('detects no conflict when records are identical', () => {
    const local = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const remote = { ...local };

    const result = conflictResolver.detectConflicts(local, remote);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictFields).toHaveLength(0);
  });

  it('auto-merges when only local changed (three-way)', () => {
    const base = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const local = { ...base, title: 'Task A Updated' }; // Local changed title
    const remote = { ...base }; // Remote unchanged

    const result = conflictResolver.detectConflicts(local, remote, base);
    expect(result.hasConflict).toBe(false);
    expect(result.autoMerged.title).toBe('Task A Updated');
  });

  it('auto-merges when only remote changed (three-way)', () => {
    const base = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const local = { ...base }; // Local unchanged
    const remote = { ...base, priority: 'high' }; // Remote changed priority

    const result = conflictResolver.detectConflicts(local, remote, base);
    expect(result.hasConflict).toBe(false);
    expect(result.autoMerged.priority).toBe('high');
  });

  it('detects conflict when both sides changed the same field (three-way)', () => {
    const base = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const local = { ...base, status: 'in_progress' }; // Local changed status
    const remote = { ...base, status: 'done' }; // Remote also changed status

    const result = conflictResolver.detectConflicts(local, remote, base);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictFields).toContain('status');
  });

  it('flags critical fields as conflicts without base (two-way)', () => {
    const local = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const remote = { ...local, status: 'done', startDate: '2026-05-03' };

    const result = conflictResolver.detectConflicts(local, remote);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictFields).toContain('status');
    expect(result.conflictFields).toContain('startDate');
  });

  it('remote wins for non-critical fields without base (two-way)', () => {
    const local = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const remote = { ...local, title: 'Task B', priority: 'high' };

    const result = conflictResolver.detectConflicts(local, remote);
    expect(result.hasConflict).toBe(false);
    expect(result.autoMerged.title).toBe('Task B');
    expect(result.autoMerged.priority).toBe('high');
  });

  it('handles complex assigneeIds change', () => {
    const base = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const local = { ...base, assigneeIds: [1, 2] }; // Added member 2
    const remote = { ...base, assigneeIds: [1, 3] }; // Added member 3

    const result = conflictResolver.detectConflicts(local, remote, base);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictFields).toContain('assigneeIds');
  });

  it('auto-merges non-overlapping changes', () => {
    const base = { title: 'Task A', status: 'todo', priority: 'medium', startDate: '2026-05-01', endDate: '2026-05-10', progress: 0, assigneeIds: [1], description: 'abc' };
    const local = { ...base, title: 'Task A v2' }; // Changed title
    const remote = { ...base, progress: 50 }; // Changed progress

    const result = conflictResolver.detectConflicts(local, remote, base);
    expect(result.hasConflict).toBe(false);
    expect(result.autoMerged.title).toBe('Task A v2');
    expect(result.autoMerged.progress).toBe(50);
  });
});
