import { describe, expect, it } from 'vitest';
import type { ChangeLog, Task } from '../types';
import { buildPendingSyncPreview } from './syncPreflightService';

const source: Task = { id: 1, title: '视觉任务', status: 'todo', progress: 0, dependencies: [], type: 'task', projectId: 1 };
const log = (id: number, changes: ChangeLog['changes'], timestamp: number): ChangeLog => ({ id, table: 'tasks', recordId: 1, action: 'update', changes, timestamp, synced: false, syncAttempts: 0 });

describe('buildPendingSyncPreview', () => {
  it('collapses sequential edits into one record with the original and final value', () => {
    const preview = buildPendingSyncPreview([
      log(1, { startDate: { from: undefined, to: new Date('2026-09-28') } }, 1),
      log(2, { startDate: { from: new Date('2026-09-28'), to: new Date('2026-09-29') }, endDate: { from: undefined, to: new Date('2026-09-30') } }, 2),
    ], [source], []);
    expect(preview).toHaveLength(1);
    expect(preview[0].title).toBe('视觉任务');
    expect(preview[0].fields.find(field => field.field === 'startDate')).toMatchObject({ from: undefined });
    expect(preview[0].fields.find(field => field.field === 'startDate')?.to).toEqual(new Date('2026-09-29'));
    expect(preview[0].logIds).toEqual([1, 2]);
  });

  it('ignores already synced logs', () => {
    expect(buildPendingSyncPreview([{ ...log(1, {}, 1), synced: true }], [source], [])).toEqual([]);
  });
});
