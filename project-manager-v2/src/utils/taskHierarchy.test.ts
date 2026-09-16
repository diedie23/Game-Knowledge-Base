import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { getRequirementKind, getRequirementKindLabel } from './taskHierarchy';

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
});
