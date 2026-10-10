import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { auditTaskDataQuality, getScheduleGate } from './dataQualityService';

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

  it('does not treat equal TAPD ids from different workspaces as duplicates', () => {
    const audit = auditTaskDataQuality([
      task(5, { tapdId: 'same', tapdWorkspaceId: '1001', syncId: 'tapd:1001:same', assigneeIds: [1] }),
      task(6, { tapdId: 'same', tapdWorkspaceId: '1002', syncId: 'tapd:1002:same', assigneeIds: [1] }),
    ], resources, new Date('2026-09-28'));
    expect(audit.issues.filter(issue => issue.type === 'duplicate')).toHaveLength(0);
  });

  it('flags an unmapped UX owner but ignores program integration staffing', () => {
    const audit = auditTaskDataQuality([
      task(10, { title: '【视觉设计】图标', assigneeIds: [], tapdOwner: 'unknown' }),
      task(11, { title: '程序还原接入', assigneeIds: [], tapdWorkitemTypeName: '开发子需求' }),
    ], resources, new Date('2026-09-28'));
    expect(audit.issues.filter(issue => issue.type === 'unmapped-owner').map(issue => issue.task?.id)).toEqual([10]);
  });

  it('keeps the quality score comparable on large workspaces', () => {
    const tasks = Array.from({ length: 80 }, (_, index) => task(index + 100, { tapdWorkitemTypeName: undefined }));
    const audit = auditTaskDataQuality(tasks, [], new Date('2026-09-28T12:00:00'));
    expect(audit.warningCount).toBe(80);
    expect(audit.score).toBe(70);
  });

  it('blocks affected tasks while leaving warning-only tasks eligible', () => {
    const audit = auditTaskDataQuality([
      task(20, { parentId: 999, assigneeIds: [1] }),
      task(21, { tapdWorkitemTypeName: undefined, assigneeIds: [1] }),
    ], resources, new Date('2026-09-28'));
    expect(getScheduleGate(audit, [20])).toMatchObject({ allowed: false, blockingTaskIds: [20] });
    expect(getScheduleGate(audit, [21]).allowed).toBe(true);
  });
});
