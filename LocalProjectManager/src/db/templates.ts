import type { TaskTemplate } from '../types';

export type { TaskTemplate };

export const defaultTemplates: TaskTemplate[] = [
  {
    id: 'standard-dev',
    name: '标准开发流程',
    description: '包含交互、功能蓝图、UI设计、正式蓝图、动效设计的完整流程',
    icon: 'Code2',
    subTasks: [
      { title: '交互设计', durationDays: 2, roleRequired: 'Designer', type: 'Design' },
      { title: '功能蓝图', durationDays: 3, roleRequired: 'Product', dependsOnIndex: 0, type: 'task' },
      { title: 'UI设计', durationDays: 3, roleRequired: 'Designer', dependsOnIndex: 0, type: 'Design' },
      { title: '正式蓝图', durationDays: 4, roleRequired: 'Developer', dependsOnIndex: 2, type: 'Frontend' },
      { title: '动效设计', durationDays: 2, roleRequired: 'Designer', dependsOnIndex: 2, type: 'Design' }
    ]
  },
  {
    id: 'agile-feature',
    name: '敏捷特性开发',
    description: '适用于无需设计的快速迭代功能',
    icon: 'Zap',
    subTasks: [
      { title: '需求评审与拆解', durationDays: 1, roleRequired: 'Product', type: 'task' },
      { title: '功能开发', durationDays: 3, roleRequired: 'Developer', dependsOnIndex: 0, type: 'Frontend' },
      { title: '代码审查与测试', durationDays: 1, roleRequired: 'Developer', dependsOnIndex: 1, type: 'Testing' }
    ]
  }
];