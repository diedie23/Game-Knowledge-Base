import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import type { Resource } from '../types/resource';
import { buildStageRows, childDemandComposition, getDemandKind, getDemandProgressSummary, getRequiredStages, hasTaskAssignee, relatedCheckpointItems, isDemandComplete, isUiStoryOverallComplete, resourceStage, stageStatus, taskStage, taskStatus } from './uxStageView';

const task = (id: number, title: string, props: Partial<Task> = {}): Task => ({ id, title, status: 'todo', priority: 'medium', projectId: 1, progress: 0, dependencies: [], type: 'task', ...props });

const resources: Resource[] = [
  { id: 1, name: '柴姣', role: 'UI设计', tapdAccount: 'chaichai' },
  { id: 2, name: '张云鹏', role: '还原', tapdAccount: 'v_zypgzhang' },
  { id: 3, name: '罗梦晨', role: '动效', tapdAccount: 'luomengchen' },
  { id: 4, name: '金天', role: '策划', tapdAccount: 'ritianjin' },
];

describe('UX stage rows', () => {
  it('rolls nested children into their demand without mixing unrelated work', () => {
    const rows = buildStageRows([task(1, '商城'), task(2, '子模块', { parentId: 1 }), task(3, '【交互案】商城', { parentId: 2 }), task(4, '【程序】商城', { parentId: 1 }), task(5, '活动')]);
    expect(rows).toHaveLength(2);
    expect(rows[0].stages.interaction.map(t => t.id)).toEqual([3]);
    expect(rows[0].descendants).toHaveLength(3);
    expect(rows[1].stages.interaction).toEqual([]);
  });
  it('starts TAPD rows at UIStory and never promotes EPIC into the first column', () => {
    const rows = buildStageRows([
      task(1, '版本总览', { tapdWorkitemTypeName: 'EPIC' }),
      task(2, '商城 UIStory', { parentId: 1, tapdWorkitemTypeName: 'UI需求' }),
      task(3, '【交互案】商城', { parentId: 2, tapdWorkitemTypeName: 'UI子需求' }),
      task(4, '另一个 UIStory', { parentId: 1, tapdWorkitemTypeName: 'UIStory' }),
      task(5, '普通子需求', { parentId: 2, tapdWorkitemTypeName: 'UIStory子需求' }),
    ]);
    expect(rows.map(row => row.root.id)).toEqual([2, 4]);
    expect(rows[0].stages.interaction.map(item => item.id)).toEqual([3]);
  });
  it('treats UIStory testing and later workflow stages as overall complete', () => {
    expect(isUiStoryOverallComplete(task(30, '测试父需求', { status: 'in_progress', tapdStep: '测试阶段' }))).toBe(true);
    expect(isUiStoryOverallComplete(task(31, '发布父需求', { status: 'todo', tapdStatus: '发布部署' }))).toBe(true);
    expect(isUiStoryOverallComplete(task(32, '开发父需求', { status: 'in_progress', tapdStep: '开发阶段' }))).toBe(false);
    expect(isUiStoryOverallComplete(task(33, '拒绝父需求', { status: 'cancelled', tapdStep: '测试阶段', tapdStatus: '已拒绝' }))).toBe(false);
  });

  it('only treats a demand as complete when all four stages exist and are complete', () => {
    const done = (id: number, title: string) => task(id, title, { status: 'done' });
    const full = buildStageRows([task(1, '需求'), done(2, '【交互案】A'), done(3, '【视觉设计】A'), done(4, '【还原】A'), done(5, '【动效】A')
      ].map((item, index) => index === 0 ? item : { ...item, parentId: 1 }))[0].stages;
    expect(isDemandComplete(full)).toBe(true);
    full.motion[0] = { ...full.motion[0], status: 'in_progress' };
    expect(isDemandComplete(full)).toBe(false);
    full.motion = [];
    expect(isDemandComplete(full)).toBe(false);
  });
  it('does not archive a completed parent while a child is still unfinished', () => {
    const root = task(90, '已完成父需求', { status: 'done', tapdStep: '测试阶段' });
    const child = task(91, '【视觉设计】仍需跟进', { parentId: 90, status: 'todo' });
    const row = buildStageRows([root, child])[0];
    const summary = getDemandProgressSummary(row, [], [root, child], new Date('2026-11-03'));
    expect(summary.state).not.toBe('done');
    expect(summary.currentStage).toBe('ui_design');
    expect(summary.blockers).not.toContain('缺少交互任务');
  });

  it('does not report an owner blocker for a completed stage task without an owner', () => {
    const root = task(92, '已完成视觉需求');
    const child = task(93, '【视觉设计】已完成', { parentId: 92, status: 'done' });
    const row = buildStageRows([root, child])[0];
    const summary = getDemandProgressSummary(row, [], [root, child], new Date('2026-11-03'));
    expect(summary.blockers).not.toContain('环节未分配负责人');
  });

  it('uses UI plus SUBSTORY children to classify an interface demand', () => {
    const root = task(115, '系统组版本需求');
    const children = [
      task(116, '交互案', { parentId: 115, tapdWorkitemTypeName: 'UI子需求' }),
      task(117, '视觉设计', { parentId: 115, tapdWorkitemTypeName: 'UI子需求' }),
      task(118, '还原', { parentId: 115, tapdWorkitemTypeName: 'UI子需求' }),
      task(119, '动效', { parentId: 115, tapdWorkitemTypeName: 'UI子需求' }),
      task(120, '程序接入', { parentId: 115, tapdWorkitemTypeName: 'SUBSTORY' }),
    ];
    expect(childDemandComposition(children)).toBe('interface');
    expect(getDemandKind(root, children)).toBe('interface');
    const row = buildStageRows([root, ...children])[0];
    expect(getDemandProgressSummary(row, [], [root, ...children]).requiredStages).toEqual(['interaction', 'ui_design', 'implementation', 'motion']);
  });

  it('uses UI plus CONFIG children to classify an icon demand', () => {
    const root = task(120, 'UI资源需求总单');
    const children = [
      task(121, '图标设计', { parentId: 120, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(122, '图标入版', { parentId: 120, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(123, '配置', { parentId: 120, tapdWorkitemTypeName: 'CONFIG', status: 'done' }),
    ];
    expect(childDemandComposition(children)).toBe('icon_template');
    expect(getDemandKind(root, children)).toBe('icon_template');
    const row = buildStageRows([root, ...children])[0];
    const summary = getDemandProgressSummary(row, [], [root, ...children]);
    expect(summary.requiredStages).toEqual(['ui_design', 'implementation']);
    expect(summary.state).toBe('done');
    expect(summary.currentStage).toBe('completed');
    expect(summary.blockers).not.toContain('缺少交互任务');
  });

  it('does not require an interaction stage when an interface demand only has visual and implementation children', () => {
    const tasks = [
      task(95, '纯界面需求'),
      task(96, '【视觉设计】纯界面需求', { parentId: 95, status: 'done' }),
      task(97, '【还原】纯界面需求', { parentId: 95, status: 'done' }),
    ];
    const row = buildStageRows(tasks)[0];
    const summary = getDemandProgressSummary(row, [], tasks, new Date('2026-11-03'));
    expect(summary.kind).toBe('interface');
    expect(summary.requiredStages).toEqual(['ui_design', 'implementation']);
    expect(summary.state).toBe('done');
    expect(summary.blockers).not.toContain('缺少交互任务');
    expect(summary.blockers).not.toContain('缺少动效任务');
  });

  it('ignores downstream integration children when calculating UX completion', () => {
    const root = task(124, '界面需求');
    const children = [
      task(125, '交互', { parentId: 124, status: 'done' }),
      task(126, '视觉设计', { parentId: 124, status: 'done' }),
      task(127, '还原', { parentId: 124, status: 'done' }),
      task(128, '动效', { parentId: 124, status: 'done' }),
      task(129, '待还原接入', { parentId: 124, status: 'todo', tapdWorkitemTypeName: 'SUBSTORY' }),
    ];
    const row = buildStageRows([root, ...children])[0];
    const summary = getDemandProgressSummary(row, [], [root, ...children]);
    expect(row.stages.implementation.map(item => item.id)).toEqual([127]);
    expect(summary.progress).toBe(100);
    expect(summary.state).toBe('done');
    expect(summary.blockers).not.toContain('卡点：程序接入');
    expect(summary.blockers).not.toContain('存在1项未完成子需求');
  });

  it('recognizes a completed generic icon placement child as 入版', () => {
    const root = task(1240, '图标资源需求');
    const children = [
      task(1241, 'UI设计-资源', { parentId: 1240, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(1242, '还原入版', { parentId: 1240, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(1243, '策划配置', { parentId: 1240, tapdWorkitemTypeName: 'CONFIG', status: 'todo' }),
    ];
    const row = buildStageRows([root, ...children])[0];
    const summary = getDemandProgressSummary(row, [], [root, ...children]);
    expect(row.stages.implementation.map(item => item.id)).toEqual([1242]);
    expect(summary.totalCount).toBe(2);
    expect(summary.doneCount).toBe(2);
    expect(summary.progress).toBe(100);
    expect(summary.blockers).not.toContain('缺少图标入版任务');
  });

  it('keeps an interface-template demand as interface after only design and restore remain', () => {
    const root = task(1244, '图标功能界面', { tapdTemplateName: '界面模板' });
    const children = [
      task(1245, 'UI设计', { parentId: 1244, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(1246, '还原入版', { parentId: 1244, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
    ];
    const row = buildStageRows([root, ...children])[0];
    const summary = getDemandProgressSummary(row, [], [root, ...children]);
    expect(summary.kind).toBe('interface');
    expect(summary.requiredStages).toEqual(['ui_design', 'implementation']);
    expect(summary.blockers).not.toContain('缺少图标入版任务');
    expect(summary.state).toBe('done');
  });

  it('uses icon template metadata when the title is not icon-specific', () => {
    const root = task(1247, '商业化资源配置', { tapdTemplateName: '图标模板' });
    const children = [
      task(1248, 'UI设计-资源', { parentId: 1247, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(1249, '还原入版', { parentId: 1247, tapdWorkitemTypeName: 'UI子需求', status: 'todo' }),
      task(1250, '配置资源', { parentId: 1247, tapdWorkitemTypeName: 'CONFIG', status: 'todo' }),
    ];
    const row = buildStageRows([root, ...children])[0];
    const summary = getDemandProgressSummary(row, [], [root, ...children]);
    expect(summary.kind).toBe('icon_template');
    expect(summary.requiredStages).toEqual(['ui_design', 'implementation']);
    expect(summary.blockers).not.toContain('缺少图标设计任务');
    expect(summary.blockers).not.toContain('缺少图标入版任务');
    expect(summary.currentStage).toBe('implementation');
  });

  it('does not count CONFIG work in icon UX progress or completion', () => {
    const root = task(125, '图标资源需求');
    const children = [
      task(126, '图标设计', { parentId: 125, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(127, '图标入版', { parentId: 125, tapdWorkitemTypeName: 'UI子需求', status: 'done' }),
      task(128, '配置', { parentId: 125, tapdWorkitemTypeName: 'CONFIG', status: 'todo' }),
    ];
    const row = buildStageRows([root, ...children])[0];
    const summary = getDemandProgressSummary(row, [], [root, ...children]);
    expect(summary.kind).toBe('icon_template');
    expect(summary.totalCount).toBe(2);
    expect(summary.doneCount).toBe(2);
    expect(summary.progress).toBe(100);
    expect(summary.state).toBe('done');
    expect(summary.blockers).not.toContain('缺少图标配置任务');
    expect(summary.currentStage).toBe('completed');
  });

  it('keeps icon classification when the standard icon order has an extra child', () => {
    const tasks = [
      task(98, '资源需求'),
      task(99, '图标设计', { parentId: 98, status: 'done' }),
      task(100, '图标入版', { parentId: 98, status: 'done' }),
      task(101, '图标配置', { parentId: 98, status: 'done' }),
      task(102, '图标验收备注', { parentId: 98, status: 'todo' }),
    ];
    const row = buildStageRows(tasks)[0];
    expect(getDemandKind(row.root, row.descendants)).toBe('icon_template');
    expect(getDemandProgressSummary(row, [], tasks, new Date('2026-11-03')).requiredStages).toEqual(['ui_design', 'implementation']);
  });

  it('classifies the standard three-child icon order and omits interaction and motion', () => {
    const done = (id: number, title: string) => task(id, title, { status: 'done', parentId: 100 });
    const tasks = [
      task(100, '模板化资源需求'),
      done(101, '图标设计'),
      done(102, '图标入版'),
      done(103, '图标配置'),
    ];
    const row = buildStageRows(tasks)[0];
    expect(getDemandKind(row.root, row.descendants)).toBe('icon_template');
    expect(getRequiredStages('icon_template')).toEqual(['ui_design', 'implementation']);
    const summary = getDemandProgressSummary(row, [], tasks, new Date('2026-11-03'));
    expect(summary.kind).toBe('icon_template');
    expect(summary.state).toBe('done');
    expect(summary.progress).toBe(100);
    expect(summary.currentStage).toBe('completed');
    expect(summary.blockers).not.toContain('缺少交互任务');
    expect(summary.blockers).not.toContain('缺少动效任务');
  });

  it('does not classify a generic three-child interface order as an icon order', () => {
    const tasks = [
      task(110, '商城界面需求'),
      task(111, '【交互案】商城', { parentId: 110 }),
      task(112, '【视觉设计】商城', { parentId: 110 }),
      task(113, '【还原】商城', { parentId: 110 }),
    ];
    const row = buildStageRows(tasks)[0];
    expect(getDemandKind(row.root, row.descendants)).toBe('interface');
    expect(getRequiredStages('interface')).toEqual(['interaction', 'ui_design', 'implementation', 'motion']);
  });
  it('preserves orphan tasks and rejects cross-project parents', () => {
    expect(buildStageRows([task(1, '父需求'), task(2, '【动效】孤立任务', { parentId: 99 }), task(3, '【还原】其他项目', { parentId: 1, projectId: 2 })])).toHaveLength(3);
  });
  it('uses title first and falls back to the TAPD owner role when titles are generic', () => {
    expect(['【交互案】A', '【视觉设计】A', '【还原】A', '【动效】A', '交互设计', 'UI设计'].map((name, i) => taskStage(task(i, name), resources))).toEqual(['interaction', 'ui_design', 'implementation', 'motion', 'interaction', 'ui_design']);
    expect(taskStage(task(9, '图标设计', { assigneeIds: [1] }), resources)).toBe('ui_design');
    expect(taskStage(task(10, '资源入版', { tapdOwner: 'v_zypgzhang' }), resources)).toBe('implementation');
    expect(taskStage(task(11, '动效稿', { assigneeIds: [1] }), resources)).toBe('motion');
    expect(taskStage(task(12, '策划配置', { assigneeIds: [4] }), resources)).toBeUndefined();
    expect(taskStage(task(13, '多人协作', { assigneeIds: [1, 2] }), resources)).toBeUndefined();
    expect(resources.map(resourceStage)).toEqual(['ui_design', 'implementation', 'motion', undefined]);
  });
  it('treats a TAPD owner as assigned even before local assigneeIds are mapped', () => {
    expect(hasTaskAssignee(task(14, '视觉设计', { tapdOwner: 'v_zypgzhang' }))).toBe(true);
    expect(hasTaskAssignee(task(15, '视觉设计', { tapdOwner: '待分配' }))).toBe(false);
    expect(hasTaskAssignee(task(16, '视觉设计'))).toBe(false);
  });

  it('normalizes legacy and string assignee IDs before deciding whether a stage is unassigned', () => {
    expect(hasTaskAssignee(task(17, '视觉设计', { assigneeIds: ['123'] as unknown as number[] }))).toBe(true);
    expect(hasTaskAssignee(task(18, '视觉设计', { assigneeId: '123' }))).toBe(true);
    expect(hasTaskAssignee(task(19, '视觉设计', { tapdOwner: '姓名（v_zypgzhang）' }))).toBe(true);
  });

  it('places generic UI children by their handler role without classifying the parent itself', () => {
    const rows = buildStageRows([
      task(20, '【会议流程】图标', { status: 'done', tapdWorkitemTypeName: 'UIStory' }),
      task(21, '图标设计（CP萌动）', { parentId: 20, status: 'done', assigneeIds: [1], tapdWorkitemTypeName: 'UI' }),
      task(22, '资源入版', { parentId: 20, status: 'done', tapdOwner: 'v_zypgzhang', tapdWorkitemTypeName: 'UI' }),
      task(23, '策划配置', { parentId: 20, status: 'done', assigneeIds: [4], tapdWorkitemTypeName: 'CONFIG' }),
    ], resources);
    expect(rows[0].stages.ui_design.map(item => item.id)).toEqual([21]);
    expect(rows[0].stages.implementation.map(item => item.id)).toEqual([22]);
    expect(rows[0].descendants.map(item => item.id)).toEqual([21, 22, 23]);
  });
  it('finds unfinished development children without adding them to UX stages', () => {
    const development = task(30, '程序接入', { status: 'in_progress', tapdWorkitemTypeName: '开发子需求' });
    const blockedDevelopment = task(31, '客户端接入', { status: 'todo', isBlocked: true });
    const completedDevelopment = task(32, '程序接入完成', { status: 'done' });
    const visual = task(33, '动效接入', { status: 'in_progress' });
    const audio = task(34, '环境音效制作', { status: 'todo', tapdWorkitemTypeName: '音频子需求' });
    expect(relatedCheckpointItems([development, completedDevelopment, visual, audio, blockedDevelopment]).map(item => [item.task.id, item.label])).toEqual([[31, '程序接入'], [30, '程序接入'], [34, '音频制作']]);
  });

  it('distinguishes absent tasks from pending and cancelled work', () => {
    expect(stageStatus([])).toBe('missing');
    expect(stageStatus([task(1, '')])).toBe('todo');
    expect(stageStatus([task(1, '', { status: 'cancelled' })])).toBe('cancelled');
  });
  it('never marks a partially completed stage done', () => {
    expect(stageStatus([task(1, '', { status: 'done' }), task(2, '')])).toBe('in_progress');
    expect(stageStatus([task(1, '', { status: 'done' }), task(2, '', { status: 'cancelled' })])).toBe('done');
  });
  it('prioritizes blockers and paused work but ignores stale blockers on terminal tasks', () => {
    expect(stageStatus([task(1, '', { status: 'in_progress' }), task(2, '', { isBlocked: true })])).toBe('blocked');
    expect(stageStatus([task(1, '', { status: 'in_progress' }), task(2, '', { status: 'paused' })])).toBe('paused');
    expect(taskStatus(task(1, '', { status: 'done', isBlocked: true }))).toBe('done');
  });
});
