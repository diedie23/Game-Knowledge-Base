// ─── UX Scheduling Types ─────────────────────────────────────────────

/**
 * UX 管线阶段。
 * 与当前实际流程保持一致：
 * 需求策划/交互并行 → 交互评审 → UI设计 → 还原落地 → 需求方确认 → 界面验收
 */
export type UxStage =
  | 'interaction'
  | 'interaction_review'
  | 'ui_design'
  | 'implementation'
  | 'requester_confirmation'
  | 'ui_acceptance'
  | 'motion';

export const UX_STAGE_META: Record<UxStage, {
  label: string;
  shortLabel: string;
  roleKeywords: string[];
  dependsOn: UxStage[];
}> = {
  interaction: {
    label: '交互设计',
    shortLabel: '交互',
    roleKeywords: ['交互', 'interaction', 'ux'],
    dependsOn: [],
  },
  interaction_review: {
    label: '交互评审',
    shortLabel: '交互评审',
    roleKeywords: [],
    dependsOn: ['interaction'],
  },
  ui_design: {
    label: 'UI设计',
    shortLabel: 'UI',
    roleKeywords: ['ui', '视觉', 'visual'],
    dependsOn: ['interaction_review'],
  },
  implementation: {
    label: '还原落地',
    shortLabel: '还原',
    roleKeywords: ['还原', 'layout', '实现'],
    dependsOn: ['ui_design'],
  },
  requester_confirmation: {
    label: '需求方确认',
    shortLabel: '需求确认',
    roleKeywords: [],
    dependsOn: ['implementation'],
  },
  ui_acceptance: {
    label: '界面验收',
    shortLabel: '验收',
    roleKeywords: [],
    dependsOn: ['requester_confirmation'],
  },
  motion: {
    label: '动效',
    shortLabel: '动效',
    roleKeywords: ['动效', 'motion', 'animation'],
    dependsOn: ['ui_design'],
  },
};

export type WorkPackageStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type WorkEstimateSource = 'manual' | 'tapd_effort' | 'default_rule';

export interface UxWorkPackage {
  id?: string;
  /** TAPD 父需求 ID */
  parentTapdId: string;
  /** TAPD 子需求 ID */
  tapdId: string;
  /** TAPD 父需求名称 */
  parentTitle: string;
  /** 当前子需求名称 */
  title: string;
  /** 自动识别或人工指定的 UX 阶段 */
  stage: UxStage;
  /** 预计工作量，单位：人天 */
  estimatedPersonDays: number;
  estimateSource: WorkEstimateSource;
  status: WorkPackageStatus;
  priority?: string;
  ownerName?: string;
  dueDate?: string;
  beginDate?: string;
  /** 前置工作包 TAPD ID */
  dependencyTapdIds?: string[];
  /** 是否需要人工确认阶段识别 */
  needsStageConfirmation?: boolean;
  updatedAt: number;
}

/**
 * 人员排期配置。与 Resource 分离，避免污染原有资源管理模型。
 */
export interface ResourceCapacity {
  resourceId: number;
  /** 基础日产能，默认 1 人天 */
  dailyCapacity: number;
  /** 能力系数，默认 1 */
  capacityFactor: number;
  /** 最大同时进行任务数（WIP） */
  maxParallelTasks: number;
  /** 每日可用于排期的比例，例如 0.8 */
  availabilityRatio: number;
  updatedAt: number;
}

export interface ScheduleRisk {
  type: 'overload' | 'deadline' | 'dependency' | 'wip_limit' | 'unassigned';
  level: 'low' | 'medium' | 'high';
  message: string;
}

export interface ScheduleSuggestion {
  workPackageId: string;
  resourceId?: number;
  startDate?: string;
  endDate?: string;
  risks: ScheduleRisk[];
}

/**
 * TAPD 父子需求解析结果。
 * 一个父需求对应一个 UX 需求包集合，而不是直接把父需求当作单个排期任务。
 */
export interface UxDemandGroup {
  parentTapdId: string;
  parentTitle: string;
  packages: UxWorkPackage[];
}
