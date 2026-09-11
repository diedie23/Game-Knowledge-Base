import { describe, it, expect } from 'vitest';
import { SmartAssignService } from './smartAssignService';
import type { Task, Resource } from '../types';

// ─── Helpers ────────────────────────────────────────────────────
function makeTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    title: 'Test Task',
    status: 'in_progress',
    priority: 'medium',
    progress: 0,
    dependencies: [],
    type: 'task',
    projectId: 1,
    ...overrides,
  } as Task;
}

function makeResource(id: number, name: string, role: string, type: string = 'internal'): Resource {
  return { id, name, role, type } as Resource;
}

const d = (str: string) => new Date(str);

const service = new SmartAssignService();

// ─── detectRequiredSkill ────────────────────────────────────────
describe('SmartAssignService.detectRequiredSkill', () => {
  it('detects interaction design skill', () => {
    expect(service.detectRequiredSkill('交互设计稿')).toBe('interaction_design');
    expect(service.detectRequiredSkill('UX Review')).toBe('interaction_design');
  });

  it('detects UI design skill', () => {
    expect(service.detectRequiredSkill('UI设计-首页')).toBe('ui_design');
    expect(service.detectRequiredSkill('视觉稿')).toBe('ui_design');
  });

  it('detects development skill', () => {
    expect(service.detectRequiredSkill('正式蓝图-登录页')).toBe('development');
  });

  it('detects layout skill', () => {
    expect(service.detectRequiredSkill('Layout-组件库')).toBe('layout');
  });

  it('detects motion design skill', () => {
    expect(service.detectRequiredSkill('动效-过渡动画')).toBe('motion_design');
  });

  it('returns null for unknown task types', () => {
    expect(service.detectRequiredSkill('会议记录')).toBeNull();
    expect(service.detectRequiredSkill('随便什么')).toBeNull();
  });
});

// ─── getResourceSkills ──────────────────────────────────────────
describe('SmartAssignService.getResourceSkills', () => {
  it('returns skills for exact role match', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const skills = service.getResourceSkills(r);
    expect(skills).toContain('interaction_design');
    expect(skills).toContain('ui_design');
    expect(skills).toContain('motion_design');
  });

  it('returns skills for Layout role', () => {
    const r = makeResource(2, 'Bob', 'Layout');
    const skills = service.getResourceSkills(r);
    expect(skills).toContain('layout');
    expect(skills).toContain('development');
  });

  it('returns skills for UE设计 role', () => {
    const r = makeResource(3, 'Charlie', 'UE设计');
    const skills = service.getResourceSkills(r);
    expect(skills).toContain('ue_development');
  });

  it('returns empty for unknown role', () => {
    const r = makeResource(4, 'Diana', 'Manager');
    expect(service.getResourceSkills(r)).toEqual([]);
  });

  it('handles partial role name match', () => {
    const r = makeResource(5, 'Eve', 'UX设计师');
    const skills = service.getResourceSkills(r);
    expect(skills.length).toBeGreaterThan(0);
  });
});

// ─── calcSkillScore ─────────────────────────────────────────────
describe('SmartAssignService.calcSkillScore', () => {
  it('returns 40 for perfect skill match', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const result = service.calcSkillScore(r, '交互设计稿', []);
    expect(result.score).toBe(40);
  });

  it('returns higher score for historical match', () => {
    const r = makeResource(1, 'Alice', 'Manager'); // No direct match
    const pastTasks = [
      makeTask({ id: 100, title: '交互设计-A', assigneeIds: [1], status: 'done' }),
      makeTask({ id: 101, title: '交互-B', assigneeIds: [1], status: 'done' }),
    ];
    const result = service.calcSkillScore(r, '交互稿-新页面', pastTasks);
    expect(result.score).toBeGreaterThan(25); // 25 + bonus
  });

  it('returns 20 for tasks without identifiable skill', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const result = service.calcSkillScore(r, '开会讨论', []);
    expect(result.score).toBe(20);
  });

  it('returns 15 for partial skill overlap (QA has some skills)', () => {
    const r = makeResource(1, 'Alice', 'QA');
    const result = service.calcSkillScore(r, '交互设计-首页', []);
    expect(result.score).toBe(15); // QA has testing skill, partial overlap
  });

  it('returns 15 for partial skill overlap', () => {
    const r = makeResource(1, 'Alice', 'Layout'); // has development, layout
    const result = service.calcSkillScore(r, '交互设计-首页', []); // requires interaction_design
    expect(result.score).toBe(15);
  });
});

// ─── calcWorkloadScore ──────────────────────────────────────────
describe('SmartAssignService.calcWorkloadScore', () => {
  it('returns 30 for no concurrent tasks', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const result = service.calcWorkloadScore(r, [], d('2026-05-01'), d('2026-05-10'));
    expect(result.score).toBe(30);
    expect(result.activeCount).toBe(0);
  });

  it('returns 20 for 1 concurrent task', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const tasks = [
      makeTask({ id: 10, parentId: 100, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
    ];
    const result = service.calcWorkloadScore(r, tasks, d('2026-05-03'), d('2026-05-08'));
    expect(result.score).toBe(20);
    expect(result.activeCount).toBe(1);
  });

  it('returns 10 for 2 concurrent tasks', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const tasks = [
      makeTask({ id: 10, parentId: 100, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      makeTask({ id: 11, parentId: 100, assigneeIds: [1], startDate: d('2026-05-03'), endDate: d('2026-05-08'), status: 'in_progress' }),
    ];
    const result = service.calcWorkloadScore(r, tasks, d('2026-05-03'), d('2026-05-08'));
    expect(result.score).toBe(10);
  });

  it('returns 0 for 3+ concurrent tasks', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const tasks = [
      makeTask({ id: 10, parentId: 100, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      makeTask({ id: 11, parentId: 100, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
      makeTask({ id: 12, parentId: 100, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'in_progress' }),
    ];
    const result = service.calcWorkloadScore(r, tasks, d('2026-05-03'), d('2026-05-08'));
    expect(result.score).toBe(0);
  });

  it('ignores done tasks', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const tasks = [
      makeTask({ id: 10, parentId: 100, assigneeIds: [1], startDate: d('2026-05-01'), endDate: d('2026-05-10'), status: 'done' }),
    ];
    const result = service.calcWorkloadScore(r, tasks, d('2026-05-03'), d('2026-05-08'));
    expect(result.score).toBe(30);
  });
});

// ─── calcAvailabilityScore ──────────────────────────────────────
describe('SmartAssignService.calcAvailabilityScore', () => {
  it('returns 30 when all workdays are free', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    // Mon-Fri, 5 May 2026 to 9 May 2026 (5 working days, no tasks)
    const result = service.calcAvailabilityScore(r, [], d('2026-05-04'), d('2026-05-08'));
    expect(result.score).toBe(30);
    expect(result.freeDays).toBeGreaterThan(0);
  });

  it('returns lower score when many days are occupied', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    const tasks = [
      makeTask({ id: 10, parentId: 100, assigneeIds: [1], startDate: d('2026-05-04'), endDate: d('2026-05-08'), status: 'in_progress' }),
    ];
    const result = service.calcAvailabilityScore(r, tasks, d('2026-05-04'), d('2026-05-08'));
    expect(result.score).toBeLessThan(30);
    expect(result.freeDays).toBe(0);
  });

  it('returns 15 when no workdays in period', () => {
    const r = makeResource(1, 'Alice', 'Designer');
    // Sat-Sun, 9-10 May 2026
    const result = service.calcAvailabilityScore(r, [], d('2026-05-09'), d('2026-05-10'));
    expect(result.score).toBe(15);
  });
});
