import type { Task } from '../types/task';
import type { Resource } from '../types/resource';
import { isTaskCancelled, isTaskCompleted, isTaskOverdue } from '../utils/taskState';
import { detectUxStage } from './uxWorkPackageService';

export type CoreUxStage = 'interaction' | 'ui_design' | 'implementation' | 'motion';

export const STAGES: { key: CoreUxStage; label: string }[] = [
  { key: 'interaction', label: '交互' },
  { key: 'ui_design', label: '视觉' },
  { key: 'implementation', label: '还原' },
  { key: 'motion', label: '动效' },
];

export type DemandKind = 'interface' | 'icon_template';

const ICON_TEMPLATE_PATTERN = /图标(?:模板|类|设计|制作|资源|规范)|小图标|icon(?:[\s_-]*(?:template|asset|design|制作|模板))?/i;

/**
 * Distinguish ordinary interface work from icon-template work. When TAPD
 * exposes a named template, it is checked first; title/type markers remain the
 * fallback because older workspaces may not return template metadata.
 */
export function getDemandKind(task: Task, relatedTasks: Task[] = []): DemandKind {
  const descriptors = [task, ...relatedTasks].map(item => `${item.tapdTemplateName || ''} ${item.title || ''} ${item.tapdWorkitemTypeName || ''}`);
  return descriptors.some(value => ICON_TEMPLATE_PATTERN.test(value)) ? 'icon_template' : 'interface';
}

export function getRequiredStages(kind: DemandKind): CoreUxStage[] {
  return kind === 'icon_template'
    ? ['ui_design', 'implementation', 'motion']
    : STAGES.map(stage => stage.key);
}

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

const RESOURCE_STAGE_PATTERNS: Array<{ stage: CoreUxStage; pattern: RegExp }> = [
  { stage: 'interaction', pattern: /UX|交互|体验/i },
  { stage: 'ui_design', pattern: /UI|视觉|美术/i },
  { stage: 'implementation', pattern: /还原|Layout|排版|实现/i },
  { stage: 'motion', pattern: /动效|动画|Motion|VFX|VX/i },
];

export function resourceStage(resource: Resource): CoreUxStage | undefined {
  return RESOURCE_STAGE_PATTERNS.find(rule => rule.pattern.test(resource.role || ''))?.stage;
}

/** Prefer an explicit title marker, then use the TAPD owner's configured role as a safe fallback. */
export function taskStage(task: Task, resources: Resource[] = []): CoreUxStage | undefined {
  const isIconTemplateTask = getDemandKind(task) === 'icon_template';
  const detected = detectUxStage(task.title).stage;
  if (detected && STAGES.some(stage => stage.key === detected) && !(isIconTemplateTask && detected === 'interaction')) return detected as CoreUxStage;
  // Local templates use these names instead of TAPD's bracketed titles.
  if (/^(?:【|\[)?交互设计/.test(task.title)) return 'interaction';
  if (/^(?:【|\[)?UI设计/i.test(task.title)) return 'ui_design';

  const ownerTokens = String(task.tapdOwner || '').split(/[;,，；]/).map(value => value.trim().toLowerCase()).filter(Boolean);
  const assigned = resources.filter(resource =>
    task.assigneeIds?.includes(resource.id || -1) ||
    ownerTokens.some(token => token === String(resource.tapdAccount || '').toLowerCase() || token === resource.name.trim().toLowerCase())
  );
  const matchedStages = new Set<CoreUxStage>();
  assigned.forEach(resource => {
    const matched = resourceStage(resource);
    if (matched) matchedStages.add(matched);
  });
  return matchedStages.size === 1 ? [...matchedStages][0] : undefined;
}

export function taskStatus(task: Task): StageStatus {
  // TAPD terminal fields are authoritative for synced tasks. This keeps the
  // table consistent even when the local status was not updated by an older sync.
  if (isTaskCancelled(task)) return 'cancelled';
  if (isTaskCompleted(task)) return 'done';
  return task.isBlocked ? 'blocked' : task.status;
}

const CHECKPOINT_RULES = [
  { label: '程序接入', task: /开发|程序|客户端|前端|工程|接入|development|developer|client/i, role: /开发|程序|客户端|前端|工程|development|developer|client/i },
  { label: '音频制作', task: /音频|声音|配音|音乐|音效|audio|sound|music|voice/i, role: /音频|声音|配音|音乐|音效|audio|sound|music|voice/i },
] as const;

export interface RelatedCheckpoint {
  task: Task;
  label: string;
}

function assignedRoleText(task: Task, resources: Resource[]): string {
  const ownerTokens = String(task.tapdOwner || '').split(/[;,，；]/).map(value => value.trim().toLowerCase()).filter(Boolean);
  return resources.filter(resource =>
    task.assigneeIds?.includes(resource.id || -1) ||
    ownerTokens.some(token => token === String(resource.tapdAccount || '').toLowerCase() || token === resource.name.trim().toLowerCase())
  ).map(resource => resource.role || '').join(' ');
}

/** Identify work that affects UX delivery but belongs to another production pipeline. */
export function relatedCheckpointLabel(task: Task, resources: Resource[] = []): string | undefined {
  const descriptor = `${task.tapdWorkitemTypeName || ''} ${task.title || ''}`;
  const roleText = assignedRoleText(task, resources);
  return CHECKPOINT_RULES.find(item => item.task.test(descriptor) || item.role.test(roleText))?.label;
}

/** Find unfinished cross-category children without adding them to the four UX stage columns. */
export function relatedCheckpointItems(tasks: Task[], resources: Resource[] = []): RelatedCheckpoint[] {
  const rank: Record<StageStatus, number> = { blocked: 0, in_progress: 1, todo: 2, paused: 3, missing: 4, done: 5, cancelled: 6 };
  return tasks.flatMap(task => {
    if (isTaskCompleted(task) || isTaskCancelled(task) || taskStage(task, resources)) return [];
    const label = relatedCheckpointLabel(task, resources);
    return label ? [{ task, label }] : [];
  }).sort((left, right) => (rank[taskStatus(left.task)] ?? 9) - (rank[taskStatus(right.task)] ?? 9));
}

export function stageStatus(tasks: Task[]): StageStatus {
  if (!tasks.length) return 'missing';
  const statuses = tasks.map(taskStatus);
  const active = statuses.filter(status => status !== 'cancelled');
  if (!active.length) return 'cancelled';
  if (active.every(status => status === 'done')) return 'done';
  if (active.some(status => status === 'blocked')) return 'blocked';
  if (active.some(status => status === 'paused')) return 'paused';
  if (active.some(status => status === 'in_progress' || status === 'done')) return 'in_progress';
  return 'todo';
}

/** A demand is complete only when every applicable stage exists and is done. */
export function isDemandComplete(
  stages: Record<CoreUxStage, Task[]>,
  requiredStages: CoreUxStage[] = STAGES.map(stage => stage.key),
): boolean {
  return requiredStages.every(key => stages[key].length > 0 && stageStatus(stages[key]) === 'done');
}

const COMPLETED_WORKFLOW_STAGE = /测试|提测|验收|发布|部署|上线|\btest(?:ing)?\b|\bqa\b|acceptance|release|deploy/i;

export function isUiStoryOverallComplete(task: Task): boolean {
  if (isTaskCancelled(task)) return false;
  if (isTaskCompleted(task)) return true;
  return COMPLETED_WORKFLOW_STAGE.test(`${task.tapdStep || ''} ${task.tapdStatus || ''}`);
}

function normalizedWorkitemType(task: Task): string {
  return String(task.tapdWorkitemTypeName || '').trim().toLowerCase().replace(/[\s·_\-—:：]/g, '');
}

function isExplicitUiStory(task: Task): boolean {
  const typeName = normalizedWorkitemType(task);
  return typeName === 'uistory' || typeName === 'uistory父需求' || typeName === 'ui需求';
}

function isExplicitEpic(task: Task): boolean {
  return /epic|史诗/i.test(String(task.tapdWorkitemTypeName || '').trim());
}

export interface StageRow {
  root: Task;
  stages: Record<CoreUxStage, Task[]>;
  descendants: Task[];
}

export function buildStageRows(tasks: Task[], resources: Resource[] = []): StageRow[] {
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
      const stage = task === root ? undefined : taskStage(task, resources);
      if (stage) stages[stage].push(task);
      (children.get(task.id) || []).forEach(visit);
    };
    visit(root);
    return { root, stages, descendants };
  });
}

export type DemandDisplayState = 'blocked' | 'overdue' | 'due_soon' | 'unscheduled' | 'in_progress' | 'todo' | 'done' | 'cancelled';

export interface DemandProgressSummary {
  kind: DemandKind;
  requiredStages: CoreUxStage[];
  state: DemandDisplayState;
  currentStage: CoreUxStage | 'other' | 'completed' | 'cancelled';
  progress: number;
  doneCount: number;
  totalCount: number;
  deadline?: Date;
  blockers: string[];
  isOverdue: boolean;
  isDueSoon: boolean;
  isUnscheduled: boolean;
}

/** Derive the small, action-oriented summary shown before the detailed stage cards. */
export function getDemandProgressSummary(
  row: StageRow,
  resources: Resource[] = [],
  allTasks: Task[] = [],
  referenceDate = new Date(),
): DemandProgressSummary {
  const rootStatus = taskStatus(row.root);
  const kind = getDemandKind(row.root, row.descendants);
  const requiredStages = getRequiredStages(kind);
  const checkpoints = relatedCheckpointItems(row.descendants, resources);
  const stageTasks = requiredStages.flatMap(stage => row.stages[stage]);
  const activeTasks = stageTasks.filter(task => taskStatus(task) !== 'cancelled');
  const doneCount = activeTasks.filter(task => taskStatus(task) === 'done').length;
  const totalCount = activeTasks.length;
  const hasTapdCompletion = isUiStoryOverallComplete(row.root);
  const rootCancelled = rootStatus === 'cancelled';
  const stageSummaries = requiredStages.map(stageKey => {
    const stage = STAGES.find(item => item.key === stageKey)!;
    return { stage, status: stageStatus(row.stages[stageKey]) };
  });
  const blockers = new Set<string>();

  checkpoints.slice(0, 3).forEach(item => blockers.add(`卡点：${item.label}`));
  activeTasks.filter(task => taskStatus(task) === 'blocked').slice(0, 3).forEach(task => blockers.add(task.blockReason || '任务已阻塞'));
  activeTasks.filter(task => taskStage(task, resources) && !task.assigneeIds?.length).slice(0, 2).forEach(() => blockers.add('环节未分配负责人'));
  stageSummaries.filter(item => item.status === 'missing').forEach(item => blockers.add(`缺少${item.stage.label}任务`));

  const taskById = new Map([...allTasks, ...row.descendants].filter(task => task.id != null).map(task => [task.id!, task]));
  activeTasks.forEach(task => {
    (task.dependencies || []).forEach(dependencyId => {
      const dependency = taskById.get(dependencyId);
      if (!dependency) blockers.add('前置依赖未找到');
      else if (!isTaskCompleted(dependency) && !isTaskCancelled(dependency)) blockers.add('前置依赖未完成');
    });
  });

  const dates = [row.root, ...row.descendants].map(task => task.endDate).filter((value): value is Date => !!value && !Number.isNaN(new Date(value).getTime()));
  const deadline = row.root.endDate || (dates.length ? new Date(Math.max(...dates.map(date => new Date(date).getTime()))) : undefined);
  const isOverdue = !!deadline && !hasTapdCompletion && isTaskOverdue({ ...row.root, endDate: deadline }, referenceDate);
  const isDueSoon = !!deadline && !hasTapdCompletion && !isOverdue && (new Date(deadline).getTime() - referenceDate.getTime()) <= 7 * 86_400_000;
  const isUnscheduled = !hasTapdCompletion && activeTasks.some(task => !task.startDate || !task.endDate);
  const allDone = hasTapdCompletion || (totalCount > 0 && isDemandComplete(row.stages, requiredStages) && checkpoints.length === 0);
  const blocked = !allDone && blockers.size > 0;
  const inProgress = activeTasks.some(task => taskStatus(task) === 'in_progress' || taskStatus(task) === 'done');
  const currentStage = rootCancelled
    ? 'cancelled'
    : allDone
      ? 'completed'
      : stageSummaries.find(item => item.status === 'blocked' || item.status === 'in_progress' || item.status === 'todo' || item.status === 'missing')?.stage.key || (checkpoints.length ? 'other' : 'completed');
  const state: DemandDisplayState = rootCancelled
    ? 'cancelled'
    : allDone
      ? 'done'
      : blocked
        ? 'blocked'
        : isOverdue
          ? 'overdue'
          : isDueSoon
            ? 'due_soon'
            : isUnscheduled
              ? 'unscheduled'
              : inProgress
                ? 'in_progress'
                : 'todo';

  return {
    kind,
    requiredStages,
    state,
    currentStage,
    progress: hasTapdCompletion ? 100 : totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
    doneCount,
    totalCount,
    deadline,
    blockers: [...blockers],
    isOverdue,
    isDueSoon,
    isUnscheduled,
  };
}
