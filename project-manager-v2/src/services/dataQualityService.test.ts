import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { auditTaskDataQuality } from './dataQualityService';

const task = (id: number, overrides: Partial<Task> = {}): Task => ({ id, title: `任务${id}`, status: 'todo', progress: 0, dependencies: [], type: 'task', projectId: 1, tapdId: String(id), tapdWorkitemTypeName: 'UI子需求', syncedAt: new Date('2026-09-28').getTime(), ...overrides });

describe('auditTaskDataQuality', () => {
  const resources: Resource[] = [{ id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource];

  it('finds duplicate TAPD ids, orphan parents and invalid date ranges', () => {
    const audit = auditTaskDataQuality([
      task(1, { tapdId: 'same', assigneeIds: [1] }),
      task(2, { tapdId: 'same', assigneeIds: [1] }),
      task(3, { parentId: 999, assigneeIds: [1] }),
      task(4, { assigneeIds: [1], startDate: new Date('2026-10-02'), endDate: new Date('2026-10-01') }),
    ], resources, new Date('2026-09-28'));
    expect(audit.issues.map(issue => issue.type)).toEqual(expect.arrayContaining(['duplicate', 'orphan', 'invalid-date']));
    expect(audit.criticalCount).toBe(3);
  });

  it('flags an unmapped UX owner but ignores program integration staffing', () => {
    const audit = auditTaskDataQuality([
      task(10, { title: '【视觉设计】图标', assigneeIds: [], tapdOwner: 'unknown' }),
      task(11, { title: '程序还原接入', assigneeIds: [], tapdWorkitemTypeName: '开发子需求' }),
    ], resources, new Date('2026-09-28'));
    expect(audit.issues.filter(issue => issue.type === 'unmapped-owner').map(issue => issue.task?.id)).toEqual([10]);
  });
});
