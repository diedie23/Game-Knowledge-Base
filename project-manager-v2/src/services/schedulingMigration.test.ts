import { describe, it, expect } from 'vitest';
import { buildUxDemandGroups } from './uxWorkPackageService';
import { getEffectiveDailyCapacity } from './capacityService';
import { generateScheduleSuggestions } from './schedulingService';
import type { TapdStory } from '../types/tapd';
import type { Resource, ResourceCapacity } from '../types';
import type { UxWorkPackage } from '../types/scheduling';
import { UX_STAGE_META } from '../types/scheduling';

describe('migrated UX scheduling core', () => {
  const stories = [
    { id: 'parent', name: '商城' },
    ...['交互案', '视觉设计', '还原', '动效', '程序'].map((stage, index) => ({
      id: String(index), parent_id: 'parent', name: `【${stage}】商城`, effort: 4,
    })),
  ] as unknown as TapdStory[];
  it('groups the four UX disciplines and excludes unrelated work', () => {
    const groups = buildUxDemandGroups(stories);
    expect(groups).toHaveLength(1);
    expect(groups[0].packages.map(p => p.stage)).toEqual(['interaction', 'ui_design', 'implementation', 'motion']);
    expect(groups[0].packages[0].estimatedPersonDays).toBe(4);
  });
  it('uses the confirmed overall pipeline order: interaction → UI → implementation → motion', () => {
    expect(UX_STAGE_META.interaction.dependsOn).toEqual([]);
    expect(UX_STAGE_META.ui_design.dependsOn).toEqual(['interaction']);
    expect(UX_STAGE_META.implementation.dependsOn).toEqual(['ui_design']);
    expect(UX_STAGE_META.motion.dependsOn).toEqual(['implementation']);
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

  it('reserves earlier suggestions when checking WIP for later suggestions', () => {
    const resource: Resource = { id: 1, name: '视觉', role: 'UI设计', type: 'internal' };
    const capacity: ResourceCapacity = { resourceId: 1, dailyCapacity: 1, capacityFactor: 1, availabilityRatio: 1, maxParallelTasks: 1, updatedAt: 1 };
    const packageFor = (id: string): UxWorkPackage => ({
      id,
      parentTapdId: 'parent',
      tapdId: id,
      parentTitle: '商城',
      title: `【视觉设计】${id}`,
      stage: 'ui_design',
      estimatedPersonDays: 1,
      estimateSource: 'manual',
      status: 'not_started',
      updatedAt: 1,
    });
    const result = generateScheduleSuggestions({
      packages: [packageFor('a'), packageFor('b')],
      resources: [resource],
      tasks: [],
      capacities: [capacity],
      startDate: '2026-09-11',
    });
    expect(result[0].resourceId).toBe(1);
    expect(result[1].risks.some(risk => risk.type === 'wip_limit')).toBe(true);
  });
});
