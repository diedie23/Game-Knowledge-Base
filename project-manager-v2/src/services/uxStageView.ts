import type { Task } from '../types/task';
import { detectUxStage } from './uxWorkPackageService';

export type CoreUxStage = 'interaction' | 'ui_design' | 'implementation' | 'motion';

export const STAGES: { key: CoreUxStage; label: string }[] = [
  { key: 'interaction', label: '交互' },
  { key: 'ui_design', label: '视觉' },
  { key: 'implementation', label: '还原' },
  { key: 'motion', label: '动效' },
];

export type StageStatus = Task['status'] | 'blocked' | 'missing';
export const STAGE_STATUS: Record<StageStatus, { label: string; color: string }> = {
  missing: { label: '未建任务', color: 'text-gray-500 bg-gray-800/40' },
  todo: { label: '待开始', color: 'text-slate-300 bg-slate-500/15' },
  in_progress: { label: '进行中', color: 'text-blue-300 bg-blue-500/15' },
  done: { label: '已完成', color: 'text-emerald-300 bg-emerald-500/15' },
  blocked: { label: '阻塞', color: 'text-red-300 bg-red-500/15' },
  paused: { label: '已暂停', color: 'text-amber-300 bg-amber-500/15' },
  cancelled: { label: '已取消', color: 'text-gray-400 bg-gray-500/15' },
};

export function taskStage(task: Task): CoreUxStage | undefined {
  const detected = detectUxStage(task.title).stage;
  if (detected && STAGES.some(stage => stage.key === detected)) return detected as CoreUxStage;
  // Local templates use these names instead of TAPD's bracketed titles.
  if (/^(?:【|\[)?交互设计/.test(task.title)) return 'interaction';
  if (/^(?:【|\[)?UI设计/i.test(task.title)) return 'ui_design';
  return undefined;
}

export function taskStatus(task: Task): StageStatus {
  return task.isBlocked && task.status !== 'done' && task.status !== 'cancelled' ? 'blocked' : task.status;
}

export function stageStatus(tasks: Task[]): StageStatus {
  if (!tasks.length) return 'missing';
  const active = tasks.filter(t => t.status !== 'cancelled');
  if (!active.length) return 'cancelled';
  if (active.every(t => t.status === 'done')) return 'done';
  if (active.some(t => taskStatus(t) === 'blocked')) return 'blocked';
  if (active.some(t => t.status === 'paused')) return 'paused';
  if (active.some(t => t.status === 'in_progress' || t.status === 'done')) return 'in_progress';
  return 'todo';
}

/** A demand is complete only when every UX stage exists and every active child is done. */
export function isDemandComplete(stages: Record<CoreUxStage, Task[]>): boolean {
  return STAGES.every(({ key }) => stages[key].length > 0 && stageStatus(stages[key]) === 'done');
}

function isExplicitUiStory(task: Task): boolean {
  const typeName = String(task.tapdWorkitemTypeName || '').trim();
  return /ui\s*story|uistory/i.test(typeName);
}

function isExplicitEpic(task: Task): boolean {
  return /epic|史诗/i.test(String(task.tapdWorkitemTypeName || '').trim());
}

export function buildStageRows(tasks: Task[]) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const children = new Map<number, Task[]>();
  tasks.forEach(t => {
    if (t.parentId && byId.get(t.parentId)?.projectId === t.projectId) {
      children.set(t.parentId, [...(children.get(t.parentId) || []), t]);
    }
  });
  const explicitUiStories = tasks.filter(isExplicitUiStory);
  // TAPD hierarchy can be EPIC -> UIStory -> UI. Once type metadata is present,
  // the table must start at UIStory instead of promoting the highest ancestor.
  const roots = explicitUiStories.length > 0
    ? explicitUiStories
    : tasks.filter(t => !isExplicitEpic(t) && (!t.parentId || byId.get(t.parentId)?.projectId !== t.projectId));

  return roots.map(root => {
    const stages = STAGES.reduce<Record<CoreUxStage, Task[]>>((result, stage) => {
      result[stage.key] = [];
      return result;
    }, {} as Record<CoreUxStage, Task[]>);
    const descendants: Task[] = [];
    const visited = new Set<number>();
    const visit = (task: Task) => {
      if (task.id === undefined || visited.has(task.id)) return;
      visited.add(task.id);
      if (task !== root) descendants.push(task);
      const stage = taskStage(task);
      if (stage) stages[stage].push(task);
      (children.get(task.id) || []).forEach(visit);
    };
    visit(root);
    return { root, stages, descendants };
  });
}
