import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildTaskHierarchyIndex, getRequirementKind, getRequirementKindLabel, isEpicRequirement, isEpicWorkitemTypeName } from './taskHierarchy';

const task = (overrides: Partial<Task> = {}): Task => ({
  title: '需求', status: 'todo', progress: 0, dependencies: [], type: 'task', projectId: 1, ...overrides,
});

describe('task hierarchy labels', () => {
  it('uses TAPD work item types when available', () => {
    expect(getRequirementKindLabel(task({ tapdWorkitemTypeName: 'UIStory' }))).toBe('UIStory · 父需求');
    expect(getRequirementKindLabel(task({ tapdWorkitemTypeName: 'UI需求' }))).toBe('UIStory · 父需求');
    expect(getRequirementKindLabel(task({ tapdWorkitemTypeName: 'UI' }))).toBe('UI · 子需求');
    expect(getRequirementKindLabel(task({ tapdWorkitemTypeName: 'UI子需求' }))).toBe('UI · 子需求');
    expect(getRequirementKindLabel(task({ tapdWorkitemTypeName: 'UIStory子需求' }))).toBe('UI · 子需求');
  });

  it('falls back to the resolved local hierarchy', () => {
    expect(getRequirementKind(task(), true)).toBe('parent');
    expect(getRequirementKind(task({ parentId: 10 }))).toBe('child');
    expect(getRequirementKind(task({ tapdParentId: '9876' }))).toBe('child');
    expect(getRequirementKind(task())).toBe('standalone');
  });

  it('identifies explicit TAPD EPIC types without matching ordinary titles', () => {
    expect(isEpicWorkitemTypeName('EPIC')).toBe(true);
    expect(isEpicWorkitemTypeName('产品 EPIC')).toBe(true);
    expect(isEpicWorkitemTypeName('史诗需求')).toBe(true);
    expect(isEpicWorkitemTypeName('UIStory')).toBe(false);
    expect(isEpicRequirement(task({ tapdWorkitemTypeName: 'EPIC' }))).toBe(true);
  });

  it('resolves TAPD-only parent links before local parentId backfill', () => {
    const parent = task({ id: 10, tapdId: 'story-10', tapdWorkitemTypeName: 'UIStory' });
    const child = task({ id: 11, tapdId: 'story-11', tapdParentId: 'story-10' });
    const hierarchy = buildTaskHierarchyIndex([parent, child]);

    expect(hierarchy.parentTaskIds.has(10)).toBe(true);
    expect(hierarchy.childrenByParentId.get(10)?.map(item => item.id)).toEqual([11]);
    expect(hierarchy.leafTasks.map(item => item.id)).toEqual([11]);
  });

  it('excludes an explicit parent row even when its children were not returned', () => {
    const parent = task({ id: 20, tapdId: 'story-20', tapdWorkitemTypeName: 'UIStory' });
    const hierarchy = buildTaskHierarchyIndex([parent]);

    expect(hierarchy.leafTasks).toEqual([]);
  });
});
