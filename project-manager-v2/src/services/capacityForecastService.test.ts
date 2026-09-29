import { describe, expect, it } from 'vitest';
import type { Resource, Task } from '../types';
import { buildStageCapacityForecast } from './capacityForecastService';

const task = (id: number, overrides: Partial<Task> = {}): Task => ({ id, title: `任务${id}`, status: 'todo', priority: 'medium', progress: 0, dependencies: [], type: 'task', projectId: 1, tapdId: String(id), ...overrides });

describe('buildStageCapacityForecast', () => {
  const resources: Resource[] = [{ id: 1, name: '视觉', role: 'UI设计', type: 'internal' } as Resource];

  it('separates scheduled and pending demand for the same UX trade', () => {
    const result = buildStageCapacityForecast([
      task(1, { title: '【视觉设计】已排', assigneeIds: [1], estimatedHours: 24, startDate: new Date('2026-09-28'), endDate: new Date('2026-09-30') }),
      task(2, { title: '【视觉设计】待排', assigneeIds: [1], estimatedHours: 16 }),
    ], resources, new Date('2026-09-28'), 10);
    const visual = result.find(item => item.stage === 'ui_design')!;
    expect(visual.capacityHours).toBe(80);
    expect(visual.scheduledHours).toBe(24);
    expect(visual.pendingHours).toBe(16);
    expect(visual.projectedUtilization).toBe(50);
  });

  it('marks a trade with pending work and no resources as danger', () => {
    const result = buildStageCapacityForecast([task(3, { title: '【动效】待排', estimatedHours: 8 })], [], new Date('2026-09-28'));
    expect(result.find(item => item.stage === 'motion')?.status).toBe('danger');
  });
});
