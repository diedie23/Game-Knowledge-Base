// Re-export isHoliday from centralized dateUtils
export { isHoliday } from '../../utils/dateUtils';

// Zoom level configuration: semantic zoom presets
export const ZOOM_PRESETS = [
  { label: '月', dayWidth: 8, visibleDays: 365, showDayNumber: false, showWeekday: false, showWeekMarker: true },
  { label: '月', dayWidth: 12, visibleDays: 365, showDayNumber: false, showWeekday: false, showWeekMarker: true },
  { label: '周', dayWidth: 18, visibleDays: 365, showDayNumber: true, showWeekday: false, showWeekMarker: false },
  { label: '周', dayWidth: 24, visibleDays: 365, showDayNumber: true, showWeekday: false, showWeekMarker: false },
  { label: '日', dayWidth: 36, visibleDays: 365, showDayNumber: true, showWeekday: true, showWeekMarker: false },
  { label: '日', dayWidth: 48, visibleDays: 365, showDayNumber: true, showWeekday: true, showWeekMarker: false },
  { label: '日', dayWidth: 64, visibleDays: 365, showDayNumber: true, showWeekday: true, showWeekMarker: false },
  { label: '日', dayWidth: 80, visibleDays: 365, showDayNumber: true, showWeekday: true, showWeekMarker: false },
] as const;

export type ZoomConfig = (typeof ZOOM_PRESETS)[number];

export const DEFAULT_ZOOM_INDEX = 5;
export const LEFT_PANEL_WIDTH = 1360;
export const ROW_HEIGHT = 44;

// Enhanced visual scaling for better readability
export const VISUAL_SCALE = {
  taskName: {
    base: 'text-sm',
    hover: 'text-base font-semibold',
    expanded: 'text-lg font-bold'
  },
  avatar: {
    base: 'scale-100',
    hover: 'scale-110',
    focus: 'scale-125'
  },
  taskBar: {
    base: 'h-8',
    hover: 'h-9 brightness-110',
    selected: 'h-10 brightness-120'
  }
};

// Role-based color mapping for avatar backgrounds
// Covers all game development pipeline roles
export const ROLE_COLORS: Record<string, { from: string; to: string; icon?: string }> = {
  // --- Art / Design --- (muted, desaturated tones)
  'UI设计': { from: '#5b5fc7', to: '#7578d4', icon: '🎨' },
  'UX设计': { from: '#7c6bb5', to: '#9585c9', icon: '🧠' },
  '交互设计': { from: '#c48a3c', to: '#d4a05a', icon: '🔄' },
  'Layout': { from: '#3d9e8f', to: '#5ab5a7', icon: '📐' },
  '动效': { from: '#c75a6e', to: '#d87587', icon: '✨' },
  '角色原画': { from: '#b5545e', to: '#c96e78', icon: '🖌️' },
  '场景原画': { from: '#8f6b4a', to: '#a88360', icon: '🏔️' },
  '原画': { from: '#b5545e', to: '#c96e78', icon: '🖌️' },
  '角色模型': { from: '#9b6aad', to: '#b183c2', icon: '🧍' },
  '场景模型': { from: '#7d6db5', to: '#9686c7', icon: '🏗️' },
  '模型': { from: '#9b6aad', to: '#b183c2', icon: '🧊' },
  '动作': { from: '#c07840', to: '#d49058', icon: '🏃' },
  '特效': { from: '#a89540', to: '#bfac58', icon: '💥' },
  // --- Blueprint / Tech ---
  '正式蓝图': { from: '#3a9aaa', to: '#55b0be', icon: '📋' },
  '功能蓝图': { from: '#3d9470', to: '#58ab88', icon: '⚙️' },
  '开发': { from: '#4a7ec4', to: '#6595d4', icon: '💻' },
  '测试': { from: '#b06090', to: '#c478a5', icon: '🧪' },
  '产品': { from: '#b87848', to: '#cc9060', icon: '📊' },
  '策划': { from: '#b87848', to: '#cc9060', icon: '📝' },
  '音频': { from: '#4090b5', to: '#5aa5c8', icon: '🎵' },
  // --- English aliases ---
  'Designer': { from: '#5b5fc7', to: '#7578d4', icon: '🎨' },
  'Developer': { from: '#4a7ec4', to: '#6595d4', icon: '💻' },
  'QA': { from: '#b06090', to: '#c478a5', icon: '🧪' },
  'Product': { from: '#b87848', to: '#cc9060', icon: '📊' },
  'VFX': { from: '#a89540', to: '#bfac58', icon: '💥' },
  'Animator': { from: '#c07840', to: '#d49058', icon: '🏃' },
};

export const DEFAULT_ROLE_COLOR = { from: '#6b7280', to: '#9ca3af', icon: '👤' };

export function getRoleColor(role: string) {
  return ROLE_COLORS[role] || DEFAULT_ROLE_COLOR;
}

// ─── Unified Role Sort Order ─────────────────────────────────────
// Defines the canonical display order for member roles across ALL views.
// Lower index = displayed first.  Roles not in this list go to the end.
export const ROLE_ORDER: { keywords: string[]; order: number }[] = [
  { keywords: ['UX', 'ux', '交互', '体验'],                order: 0 },
  { keywords: ['UI', 'ui', '视觉'],                         order: 1 },
  { keywords: ['Layout', 'layout', '排版'],                  order: 2 },
  { keywords: ['动效', '动画', 'Motion', 'VX'],             order: 3 },
  { keywords: ['角色原画'],                                  order: 4 },
  { keywords: ['场景原画'],                                  order: 5 },
  { keywords: ['原画', '概念', 'Concept'],                   order: 6 },
  { keywords: ['角色模型'],                                  order: 7 },
  { keywords: ['场景模型'],                                  order: 8 },
  { keywords: ['模型'],                                      order: 9 },
  { keywords: ['动作', 'Animator'],                          order: 10 },
  { keywords: ['特效', 'VFX'],                               order: 11 },
  { keywords: ['音频', 'Audio'],                             order: 12 },
  { keywords: ['设计', 'Design'],                            order: 13 },
  { keywords: ['前端', 'Frontend', 'FE'],                    order: 14 },
  { keywords: ['后端', 'Backend', 'BE', '服务端'],           order: 15 },
  { keywords: ['开发', 'Dev', '工程'],                       order: 16 },
  { keywords: ['测试', 'QA', 'Test'],                        order: 17 },
  { keywords: ['产品', 'PM', '策划'],                        order: 18 },
  { keywords: ['运维', 'Ops', 'DevOps'],                     order: 19 },
  { keywords: ['平面'],                                      order: 20 },
];

const ROLE_ORDER_FALLBACK = 999;

/** Get the sort-order index for a given role string. */
export function getRoleOrderIndex(role: string): number {
  if (!role) return ROLE_ORDER_FALLBACK;
  for (const entry of ROLE_ORDER) {
    if (entry.keywords.some(kw => role.includes(kw))) return entry.order;
  }
  return ROLE_ORDER_FALLBACK;
}

/**
 * Compare two resources by: type (internal→cp) → group → role order → sortOrder/id.
 * Use this as the standard comparator wherever member lists are displayed.
 * @param groupMode - 'group' to sort by project group first, 'role' (default) to sort by role first
 */
export function compareResources(
  a: { role: string; type?: string; sortOrder?: number; id?: number; group?: string },
  b: { role: string; type?: string; sortOrder?: number; id?: number; group?: string },
  groupMode: 'role' | 'group' = 'role',
): number {
  // 1. type: internal first, cp second
  const typeOrder = (t?: string) => t === 'cp' ? 1 : 0;
  const typeDiff = typeOrder(a.type) - typeOrder(b.type);
  if (typeDiff !== 0) return typeDiff;
  // 2. group-first mode: sort by group name alphabetically
  if (groupMode === 'group') {
    const groupA = (a.group || '未分组').toLowerCase();
    const groupB = (b.group || '未分组').toLowerCase();
    if (groupA !== groupB) {
      // '未分组' always goes last
      if (groupA === '未分组') return 1;
      if (groupB === '未分组') return -1;
      return groupA.localeCompare(groupB, 'zh-CN');
    }
  }
  // 3. role order
  const roleDiff = getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role);
  if (roleDiff !== 0) return roleDiff;
  // 4. fallback: sortOrder / id
  return (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0);
}

// Task type color mapping based on keywords
export interface TaskTypeColor {
  keywords: string[];
  bg: string;
  border: string;
  color: string;
  label: string;
}

export const TASK_TYPE_COLORS: TaskTypeColor[] = [
  { keywords: ['交互设计', '交互'], bg: 'bg-amber-600', border: 'border-amber-500', color: '#c48a3c', label: '交互设计' },
  { keywords: ['功能蓝图', '功能'], bg: 'bg-cyan-600', border: 'border-cyan-500', color: '#3d9470', label: '功能蓝图' },
  { keywords: ['UI设计', 'UI', 'ui'], bg: 'bg-indigo-600', border: 'border-indigo-500', color: '#5b5fc7', label: 'UI设计' },
  { keywords: ['正式蓝图', '蓝图'], bg: 'bg-violet-600', border: 'border-violet-500', color: '#3a9aaa', label: '正式蓝图' },
  { keywords: ['动效', '动画'], bg: 'bg-rose-600', border: 'border-rose-500', color: '#c75a6e', label: '动效设计' },
  { keywords: ['测试', 'QA'], bg: 'bg-teal-600', border: 'border-teal-500', color: '#b06090', label: '测试' },
  { keywords: ['开发', '编码'], bg: 'bg-blue-600', border: 'border-blue-500', color: '#4a7ec4', label: '开发' },
];

export const DEFAULT_TASK_TYPE_COLOR: TaskTypeColor = {
  keywords: [], bg: 'bg-gray-500', border: 'border-gray-400', color: '#6b7280', label: '其他',
};

export const getTaskTypeColor = (title: string): TaskTypeColor => {
  for (const type of TASK_TYPE_COLORS) {
    if (type.keywords.some(kw => title.includes(kw))) {
      return type;
    }
  }
  return DEFAULT_TASK_TYPE_COLOR;
};

// CSS keyframes for dependency line animations
export const dependencyLineStyles = `
@keyframes breathingDash {
  0%, 100% { stroke-opacity: 0.3; stroke-dashoffset: 0; }
  50% { stroke-opacity: 1; stroke-dashoffset: -12; }
}
@keyframes flowDash {
  to { stroke-dashoffset: -20; }
}
`;

export interface StatusConfig {
  bg: string;
  border: string;
  glow: string;
  progress: string;
  label: string;
  /** Hex color for inline style usage */
  barColor: string;
  /** Secondary lighter hex for progress fill background */
  barBgColor: string;
  /** Whether the bar should render with a dashed border (for todo) */
  dashed: boolean;
}

export const getStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'done': return {
      bg: 'bg-gradient-to-r from-emerald-600 to-emerald-500',
      border: 'border-emerald-400/60',
      glow: 'shadow-emerald-500/20',
      progress: 'bg-emerald-400/30',
      label: '已完成',
      barColor: '#10b981',
      barBgColor: '#065f46',
      dashed: false,
    };
    case 'in_progress': return {
      bg: 'bg-gradient-to-r from-blue-600 to-blue-500',
      border: 'border-blue-400/60',
      glow: 'shadow-blue-500/25',
      progress: 'bg-blue-400/30',
      label: '进行中',
      barColor: '#3b82f6',
      barBgColor: '#1e3a5f',
      dashed: false,
    };
    case 'blocked': return {
      bg: 'bg-gradient-to-r from-orange-600 to-red-500',
      border: 'border-orange-400/70',
      glow: 'shadow-orange-500/30',
      progress: 'bg-orange-400/30',
      label: '阻塞',
      barColor: '#f97316',
      barBgColor: '#7c2d12',
      dashed: false,
    };
    case 'paused': return {
      bg: 'bg-gradient-to-r from-gray-600/40 to-gray-500/40',
      border: 'border-gray-500/30',
      glow: 'shadow-gray-500/5',
      progress: 'bg-transparent',
      label: '暂停',
      barColor: '#6b7280',
      barBgColor: '#1f2937',
      dashed: true,
    };
    default: return {
      bg: 'bg-gradient-to-r from-slate-600/60 to-slate-500/60',
      border: 'border-slate-400/30',
      glow: 'shadow-slate-500/10',
      progress: 'bg-transparent',
      label: '待办',
      barColor: '#94a3b8',
      barBgColor: '#1e293b',
      dashed: true,
    };
  }
};

// Orange color usage explanations
export const ORANGE_USAGE = {
  IN_PROGRESS: '进行中任务的进度指示和动态效果',
  CONFLICT: '任务排期冲突时的警告颜色',
  URGENT: '临近截止日期的紧急提醒',
  INTERACTION_DESIGN: '交互设计类任务的专属颜色'
};

// Color legend for task bars
export const TASK_COLOR_LEGEND = {
  UI_DESIGN: { color: '#5b5fc7', label: 'UI设计' },
  INTERACTION_DESIGN: { color: '#c48a3c', label: '交互设计' },
  FORMAL_BLUEPRINT: { color: '#3a9aaa', label: '正式蓝图' },
  IN_PROGRESS: { color: '#4a7ec4', label: '进行中' },
  DONE: { color: '#3d9470', label: '已完成' },
  TODO: { color: '#64748b', label: '待办' }
};

// Comprehensive color legend system for the entire interface
export const COLOR_LEGEND = {
  // Task status colors
  STATUS: {
    TODO: { color: '#64748b', label: '待办任务', description: '未开始的任务，显示为虚线边框' },
    IN_PROGRESS: { color: '#3b82f6', label: '进行中', description: '正在执行的任务，蓝色进度条' },
    DONE: { color: '#10b981', label: '已完成', description: '已完成的任务，绿色带勾选标记' },
    BLOCKED: { color: '#f97316', label: '阻塞', description: '遇到问题的任务，橙红色警告' }
  },
  
  // Task type colors
  TASK_TYPE: {
    UI_DESIGN: { color: '#5b5fc7', label: 'UI设计', icon: '🎨' },
    UX_DESIGN: { color: '#7c6bb5', label: 'UX设计', icon: '🧠' },
    INTERACTION_DESIGN: { color: '#c48a3c', label: '交互设计', icon: '🔄' },
    FORMAL_BLUEPRINT: { color: '#3a9aaa', label: '正式蓝图', icon: '📋' },
    FUNCTIONAL_BLUEPRINT: { color: '#3d9470', label: '功能蓝图', icon: '⚙️' },
    DEVELOPMENT: { color: '#4a7ec4', label: '开发', icon: '💻' },
    TESTING: { color: '#b06090', label: '测试', icon: '🧪' },
    PRODUCT: { color: '#b87848', label: '产品', icon: '📊' }
  },
  
  // Role-based avatar colors — full game dev pipeline (muted tones)
  ROLE_COLORS: {
    UI_DESIGN: { color: '#5b5fc7', label: 'UI设计师' },
    UX_DESIGN: { color: '#7c6bb5', label: 'UX设计师' },
    INTERACTION_DESIGN: { color: '#c48a3c', label: '交互设计师' },
    LAYOUT: { color: '#3d9e8f', label: 'Layout排版' },
    MOTION_DESIGN: { color: '#c75a6e', label: '动效设计师' },
    CHARACTER_CONCEPT: { color: '#b5545e', label: '角色原画' },
    SCENE_CONCEPT: { color: '#8f6b4a', label: '场景原画' },
    CHARACTER_MODEL: { color: '#9b6aad', label: '角色模型' },
    SCENE_MODEL: { color: '#7d6db5', label: '场景模型' },
    ANIMATOR: { color: '#c07840', label: '动作' },
    VFX: { color: '#a89540', label: '特效' },
    FORMAL_BLUEPRINT: { color: '#3a9aaa', label: '蓝图制作' },
    DEVELOPMENT: { color: '#4a7ec4', label: '开发工程师' },
    TESTING: { color: '#b06090', label: '测试工程师' },
    PRODUCT: { color: '#b87848', label: '产品/策划' },
    AUDIO: { color: '#4090b5', label: '音频' }
  },
  
  // Special indicators
  INDICATORS: {
    CONFLICT: { color: '#c94a4a', label: '冲突警告', description: '任务排期冲突时的红色警告' },
    URGENT: { color: '#c07840', label: '紧急任务', description: '临近截止日期的橙色提醒' },
    TODAY: { color: '#7c6bb5', label: '今日指示线', description: '紫色竖线标记当前日期' },
    GHOST: { color: '#9585c9', label: '推演模式', description: '拖拽调整时的紫色虚线预览' }
  }
};

// Helper function to get color explanation
export function getColorExplanation(type: 'status' | 'taskType' | 'role' | 'indicator', key: string): string {
  const category = COLOR_LEGEND[type.toUpperCase() as keyof typeof COLOR_LEGEND] as any;
  const item = category?.[key];
  return item?.description || item?.label || '未知颜色';
}

// ─── Pipeline Dependency Inference ───────────────────────────────
// Defines the standard production pipeline order for game UI tasks.
// Each stage has keywords for matching and a numeric order for sequencing.
// Tasks at a lower order are upstream of tasks at a higher order.

export interface PipelineStage {
  /** Unique stage identifier */
  id: string;
  /** Display label */
  label: string;
  /** Keywords to match against task titles */
  keywords: string[];
  /** Pipeline order (lower = earlier in the pipeline) */
  order: number;
  /** Which stage IDs this stage directly depends on */
  dependsOn: string[];
}

/**
 * Standard game UI production pipeline (based on ui-workflow-sync):
 *
 *   策划需求 → 交互设计 → 交互交付
 *                           ↓
 *              ┌────────────┴────────────┐
 *              ↓                         ↓
 *        ⑤-a Layout白模蓝图         ⑥ UI设计
 *        ⑤-b 客户端功能制作              ↓
 *              ↓                    ⑧ UI交付 → ⑨ 资产合规
 *              └──── 汇合 ───────────────┘
 *                      ↓
 *              ⑩ Layout切正式资产
 *              ┌───────┴───────┐
 *              ↓               ↓
 *        ⑪ 正式蓝图       ⑫ VX动效
 *              └──── 汇合 ────┘
 *                      ↓
 *              ⑭ 界面走查 → ⑮ VX动效制作 → ⑯ 客户端集成 → ⑰ 交付
 *
 * Key dependency rules:
 * - 功能蓝图(白模) depends on 交互设计
 * - UI设计 depends on 交互设计
 * - 正式蓝图 depends on UI设计 (UI资产+白模汇合后切正式资产)
 * - 动效设计 depends on UI设计
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'interaction',       label: '交互设计',       keywords: ['交互设计', '交互'],                         order: 0, dependsOn: [] },
  { id: 'ui_design',         label: 'UI设计',         keywords: ['UI设计', 'ui设计', '视觉设计'],             order: 1, dependsOn: ['interaction'] },
  { id: 'func_blueprint',    label: '功能蓝图',       keywords: ['功能蓝图', '白模蓝图', '白模'],              order: 1, dependsOn: ['interaction'] },
  { id: 'layout',            label: 'Layout',         keywords: ['layout', 'Layout', 'LAYOUT'],               order: 2, dependsOn: ['ui_design'] },
  { id: 'formal_blueprint',  label: '正式蓝图',       keywords: ['正式蓝图'],                                 order: 3, dependsOn: ['layout'] },
  { id: 'motion_design',     label: '动效设计',       keywords: ['动效', '动画', 'VX'],                       order: 3, dependsOn: ['ui_design'] },
  { id: 'client_dev',        label: '客户端功能制作', keywords: ['客户端功能', '客户端制作', '功能制作'],       order: 1, dependsOn: ['interaction'] },
];

/**
 * Identify which pipeline stage a task title belongs to.
 * Uses the suffix after the last dash (e.g., "xxx-UI设计" → "UI设计") for matching
 * to avoid false matches from parent task title keywords.
 * Falls back to full title matching if no dash is found.
 * Returns the stage or null if no match.
 */
export function identifyPipelineStage(title: string): PipelineStage | null {
  // Extract the suffix after the last dash for more precise matching
  const dashIdx = title.lastIndexOf('-');
  const suffix = dashIdx !== -1 ? title.substring(dashIdx + 1).trim() : '';
  
  // First pass: try to match against the suffix (most precise)
  if (suffix) {
    for (const stage of PIPELINE_STAGES) {
      if (stage.keywords.some(kw => suffix === kw || suffix.includes(kw))) {
        return stage;
      }
    }
  }
  
  // Second pass: match against full title, but use longer keywords first
  // Sort stages by keyword length (longest first) to prefer specific matches
  const sortedStages = [...PIPELINE_STAGES].sort((a, b) => {
    const maxA = Math.max(...a.keywords.map(k => k.length));
    const maxB = Math.max(...b.keywords.map(k => k.length));
    return maxB - maxA;
  });
  
  for (const stage of sortedStages) {
    if (stage.keywords.some(kw => title.includes(kw))) {
      return stage;
    }
  }
  return null;
}

/**
 * Given a list of sibling tasks (children of the same parent),
 * automatically infer dependency relationships based on the pipeline order.
 *
 * Returns a Map: taskId -> dependencyTaskIds[]
 *
 * Only sets dependencies between tasks that match known pipeline stages.
 * Tasks that don't match any stage are left untouched.
 */
export function inferPipelineDependencies(
  siblingTasks: { id: number; title: string; dependencies: number[]; assigneeIds?: number[] }[],
  resources?: { id: number; role: string }[]
): Map<number, number[]> {
  const result = new Map<number, number[]>();

  // Step 1: Identify each task's pipeline stage
  const taskStageMap = new Map<number, PipelineStage>();
  const stageTaskMap = new Map<string, number>(); // stageId -> taskId

  for (const task of siblingTasks) {
    // First try title-based matching
    let stage = identifyPipelineStage(task.title);
    // Fallback: try assignee role-based matching
    if (!stage && task.assigneeIds && task.assigneeIds.length > 0 && resources) {
      stage = identifyPipelineStageByAssignee(task.assigneeIds, resources);
    }
    if (stage) {
      taskStageMap.set(task.id, stage);
      stageTaskMap.set(stage.id, task.id);
    }
  }

  // Step 2: For each task with a known stage, find its upstream dependencies
  for (const task of siblingTasks) {
    const stage = taskStageMap.get(task.id);
    if (!stage) continue;

    const deps: number[] = [];
    for (const upstreamStageId of stage.dependsOn) {
      const upstreamTaskId = stageTaskMap.get(upstreamStageId);
      if (upstreamTaskId !== undefined) {
        deps.push(upstreamTaskId);
      }
    }

    if (deps.length > 0) {
      result.set(task.id, deps);
    }
  }

  return result;
}

// ─── Role → Pipeline Stage Mapping ───────────────────────────────
// Maps resource roles to pipeline stages for assignee-based inference.

const ROLE_TO_PIPELINE_STAGE: Record<string, string> = {
  // Exact role labels from ROLE_COLORS
  '交互设计师': 'interaction',
  '交互设计': 'interaction',
  '交互': 'interaction',
  'UX设计师': 'interaction',
  'UI设计师': 'ui_design',
  'UI设计': 'ui_design',
  'Layout排版': 'layout',
  'Layout': 'layout',
  'layout': 'layout',
  '白模': 'func_blueprint',
  '蓝图制作': 'formal_blueprint',
  '正式蓝图': 'formal_blueprint',
  '动效设计师': 'motion_design',
  '动效设计': 'motion_design',
  '动效': 'motion_design',
  '开发工程师': 'client_dev',
  '客户端': 'client_dev',
};

/**
 * Identify pipeline stage by task assignee roles.
 * Looks up the role of each assigned resource and maps it to a pipeline stage.
 * Returns the first matching stage found, or null if no match.
 */
export function identifyPipelineStageByAssignee(
  assigneeIds: number[],
  resources: { id: number; role: string }[]
): PipelineStage | null {
  for (const assigneeId of assigneeIds) {
    const resource = resources.find(r => r.id === assigneeId);
    if (!resource || !resource.role) continue;
    
    const role = resource.role.trim();
    // Try exact match first
    const stageId = ROLE_TO_PIPELINE_STAGE[role];
    if (stageId) {
      return PIPELINE_STAGES.find(s => s.id === stageId) || null;
    }
    // Try partial match (role contains or is contained by a key)
    for (const [key, sid] of Object.entries(ROLE_TO_PIPELINE_STAGE)) {
      if (role.includes(key) || key.includes(role)) {
        return PIPELINE_STAGES.find(s => s.id === sid) || null;
      }
    }
  }
  return null;
}
