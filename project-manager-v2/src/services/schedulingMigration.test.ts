import { describe, it, expect } from 'vitest';
import { buildUxDemandGroups } from './uxWorkPackageService';
import { getEffectiveDailyCapacity } from './capacityService';
import { generateScheduleSuggestions } from './schedulingService';
import type { TapdStory } from '../types/tapd';

describe('migrated UX scheduling core', () => {
  const stories = [
    { id: 'parent', name: '商城' },
    ...['交互案', '视觉设计', '还原', '动效', '程序'].map((stage, index) => ({
      id: String(index), parent_id: 'parent', name: `【${stage}】商城`, effort: 4,
    })),
  ] as TapdStory[];
  it('groups the four UX disciplines and excludes unrelated work', () => {
    const groups = buildUxDemandGroups(stories);
    expect(groups).toHaveLength(1);
    expect(groups[0].packages.map(p => p.stage)).toEqual(['interaction', 'ui_design', 'implementation', 'motion']);
    expect(groups[0].packages[0].estimatedPersonDays).toBe(4);
  });
  it('combines personal capacity and available time', () => {
    expect(getEffectiveDailyCapacity({ resourceId: 1, dailyCapacity: 1, capacityFactor: 1.2, availabilityRatio: 0.8, maxParallelTasks: 3, updatedAt: 0 })).toBe(0.96);
  });
  it('reports missing resources and excludes finished work', () => {
    const packages = buildUxDemandGroups(stories)[0].packages;
    packages[0].status = 'done';
    const result = generateScheduleSuggestions({ packages, resources: [], capacities: [], tasks: [], startDate: '2026-09-11' });
    expect(result).toHaveLength(3);
    expect(result.every(p => p.risks.some(r => r.type === 'unassigned'))).toBe(true);
  });
});