import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { buildResourceLoadIndex } from './resourceLoadIndex';

const resources: Resource[] = [
  { id: 1, name: '小王', type: 'internal', role: '设计', status: 'active' },
  { id: 2, name: '小李', type: 'internal', role: '设计', status: 'active' },
];

const task = (overrides: Partial<Task>): Task => ({
  id: 10,
  projectId: 1,
  title: '任务',
  type: 'task',
  status: 'todo',
  priority: 'P1',
  assigneeIds: [1],
  startDate: new Date('2026-10-20T00:00:00+08:00'),
  endDate: new Date('2026-10-21T00:00:00+08:00'),
  ...overrides,
});

describe('resource load index', () => {
  it('indexes each task once per assigned resource and covered day', () => {
    const index = buildResourceLoadIndex(
      [task({}), task({ id: 11, assigneeIds: [2] })],
      resources,
      [new Date('2026-10-20T00:00:00+08:00'), new Date('2026-10-21T00:00:00+08:00')],
      new Set(),
    );

    expect(index.loadByResourceDate.get(1)?.get('2026-10-20')).toBe(1);
    expect(index.loadByResourceDate.get(1)?.get('2026-10-21')).toBe(1);
    expect(index.loadByResourceDate.get(2)?.get('2026-10-20')).toBe(1);
    expect(index.totalTasksByResource.get(1)).toBe(1);
    expect(index.maxLoad).toBe(3);
  });

  it('excludes completed and parent tasks from load', () => {
    const index = buildResourceLoadIndex(
      [
        task({}),
        task({ id: 11, status: 'done' }),
        task({ id: 12 }),
      ],
      resources,
      [new Date('2026-10-20T00:00:00+08:00')],
      new Set([12]),
    );

    expect(index.totalTasksByResource.get(1)).toBe(1);
    expect(index.loadByResourceDate.get(1)?.get('2026-10-20')).toBe(1);
  });
});
