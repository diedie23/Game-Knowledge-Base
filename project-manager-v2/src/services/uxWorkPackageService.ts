import type { TapdStory } from '../types/tapd';
import {
  UX_STAGE_META,
  type UxDemandGroup,
  type UxStage,
  type UxWorkPackage,
  type WorkPackageStatus,
} from '../types/scheduling';

/**
 * UX 子任务标题关键词。
 * 当前项目 TAPD 命名规范使用：【交互案】【视觉设计】【还原】【动效】。
 * 这里集中维护，后续新增别名不会影响排期逻辑。
 */
const STAGE_KEYWORDS: Array<{ stage: UxStage; keywords: string[] }> = [
  { stage: 'interaction', keywords: ['【交互案】', '[交互案]', '交互案'] },
  { stage: 'ui_design', keywords: ['【视觉设计】', '[视觉设计]', '视觉设计'] },
  { stage: 'implementation', keywords: ['【还原】', '[还原]', '还原'] },
  { stage: 'motion', keywords: ['【动效】', '[动效]', '动效'] },
];

export interface StageDetectionResult {
  stage?: UxStage;
  matchedKeyword?: string;
  confidence: 'high' | 'none';
}

/** 根据 TAPD 子任务标题识别 UX 工种。 */
export function detectUxStage(title: string | undefined | null): StageDetectionResult {
  const normalized = (title ?? '').trim();

  for (const rule of STAGE_KEYWORDS) {
    const keyword = rule.keywords.find((item) => normalized.includes(item));
    if (keyword) {
      return { stage: rule.stage, matchedKeyword: keyword, confidence: 'high' };
    }
  }

  return { confidence: 'none' };
}

/** 尽量兼容 TAPD 不同字段命名。 */
function readStoryId(story: TapdStory): string {
  return String((story as any).id ?? (story as any).story_id ?? '');
}

function readParentId(story: TapdStory): string {
  const value =
    (story as any).parent_id ??
    (story as any).parentId ??
    (story as any).parent_story_id ??
    '';
  return value === null || value === undefined ? '' : String(value);
}

function readTitle(story: TapdStory): string {
  return String((story as any).name ?? (story as any).title ?? '');
}

function mapStatus(story: TapdStory): WorkPackageStatus {
  const status = String((story as any).status ?? '').toLowerCase();

  if (/完成|已完成|done|closed|resolved/.test(status)) return 'done';
  if (/取消|cancel/.test(status)) return 'cancelled';
  if (/阻塞|blocked/.test(status)) return 'blocked';
  if (/进行|开发中|设计中|in.?progress|processing/.test(status)) return 'in_progress';

  return 'not_started';
}

function readDate(story: TapdStory, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = (story as any)[key];
    if (value) return String(value);
  }
  return undefined;
}

function readEffort(story: TapdStory): number | undefined {
  const value =
    (story as any).effort ??
    (story as any).estimated_effort ??
    (story as any).estimate;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function createWorkPackage(
  parent: TapdStory,
  child: TapdStory,
): UxWorkPackage | null {
  const title = readTitle(child);
  const detected = detectUxStage(title);
  if (!detected.stage) return null;

  const effort = readEffort(child);
  const childId = readStoryId(child);

  return {
    id: `tapd-${childId}`,
    parentTapdId: readStoryId(parent),
    tapdId: childId,
    parentTitle: readTitle(parent),
    title,
    stage: detected.stage,
    estimatedPersonDays: effort ?? 0,
    estimateSource: effort ? 'tapd_effort' : 'default_rule',
    status: mapStatus(child),
    priority: (child as any).priority,
    ownerName:
      (child as any).owner ??
      (child as any).owner_name ??
      (child as any).handler,
    beginDate: readDate(child, ['begin', 'begin_date', 'start_date']),
    dueDate: readDate(child, ['due', 'due_date', 'end_date', 'deadline']),
    dependencyTapdIds: UX_STAGE_META[detected.stage].dependsOn.length
      ? []
      : undefined,
    needsStageConfirmation: false,
    updatedAt: Date.now(),
  };
}

/**
 * 将 TAPD Story 转换为 UX 父需求组。
 *
 * 规则：
 * 1. 有 parent_id 的 Story 视为子任务；
 * 2. 子任务标题包含【交互案】【视觉设计】【还原】【动效】时识别工种；
 * 3. 同一个 parent_id 的子任务归为同一个 UxDemandGroup；
 * 4. 没有关键词的子任务不进入 UX 排期，避免误排期。
 */
export function buildUxDemandGroups(stories: TapdStory[]): UxDemandGroup[] {
  const byId = new Map<string, TapdStory>();
  const childrenByParent = new Map<string, TapdStory[]>();

  for (const story of stories) {
    const id = readStoryId(story);
    if (id) byId.set(id, story);

    const parentId = readParentId(story);
    if (parentId) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(story);
      childrenByParent.set(parentId, children);
    }
  }

  const groups: UxDemandGroup[] = [];

  for (const [parentId, children] of childrenByParent) {
    const parent = byId.get(parentId);

    // 如果父需求未被同步进本次数据，则暂不生成不完整工作包。
    if (!parent) continue;

    const packages = children
      .map((child) => createWorkPackage(parent, child))
      .filter((item): item is UxWorkPackage => item !== null);

    if (!packages.length) continue;

    groups.push({
      parentTapdId: parentId,
      parentTitle: readTitle(parent),
      packages,
    });
  }

  return groups;
}

/** 将工作包按 UX 阶段排序，方便排期中心和甘特图使用。 */
export function sortWorkPackagesByPipeline(packages: UxWorkPackage[]): UxWorkPackage[] {
  const order: UxStage[] = [
    'interaction',
    'interaction_review',
    'ui_design',
    'implementation',
    'motion',
    'requester_confirmation',
    'ui_acceptance',
  ];

  return [...packages].sort(
    (a, b) => order.indexOf(a.stage) - order.indexOf(b.stage),
  );
}
