// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Resource, Task } from '../types';
import { ScheduleWorkspace } from './ScheduleWorkspace';

const state = vi.hoisted(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateAt = (offset: number) => {
    const value = new Date(today);
    value.setDate(value.getDate() + offset);
    return value;
  };
  const makeTask = (task: Partial<Task>): Task => ({
    id: 0,
    title: '测试任务',
    status: 'todo',
    progress: 0,
    dependencies: [],
    type: 'story',
    projectId: 1,
    ...task,
  });

  return {
    open: vi.fn(),
    setView: vi.fn(),
    dateAt,
    tasks: [
      makeTask({ id: 1, title: '商城界面需求', tapdWorkitemTypeName: 'UIStory', module: '商城' }),
      makeTask({ id: 2, parentId: 1, title: '商城交互方案', status: 'done', assigneeIds: [10], startDate: dateAt(-2), endDate: dateAt(-1), estimatedHours: 6 }),
      makeTask({ id: 3, parentId: 1, title: '商城视觉设计', status: 'in_progress', assigneeIds: [11], startDate: dateAt(1), endDate: dateAt(3), dependencies: [2], estimatedHours: 12.5, externalUrl: 'https://tapd.example/story/3' }),
      makeTask({ id: 4, parentId: 1, title: '商城还原开发', status: 'todo', assigneeIds: [10], startDate: dateAt(4), endDate: dateAt(6), dependencies: [3], estimatedHours: 20 }),
      makeTask({ id: 7, parentId: 1, title: '商城程序接入', status: 'todo', assigneeIds: [12], tapdWorkitemTypeName: '开发子需求', startDate: dateAt(2), endDate: dateAt(5) }),
      makeTask({ id: 8, parentId: 1, title: '【交互】商城历史完成环节', status: 'done', assigneeIds: [12], completedAt: dateAt(-3) }),
      makeTask({ id: 9, parentId: 1, title: '商城窗口外排期任务', status: 'todo', assigneeIds: [11], startDate: dateAt(30), endDate: dateAt(32) }),
      makeTask({ id: 5, title: '活动界面需求', tapdWorkitemTypeName: 'UIStory', module: '活动' }),
      makeTask({ id: 6, parentId: 5, title: '活动视觉设计', status: 'todo', assigneeIds: [11], startDate: dateAt(2), endDate: dateAt(5) }),
    ] as Task[],
    resources: [
      { id: 10, name: '小林', role: '交互设计', status: 'active' },
      { id: 11, name: '小陈', role: '视觉设计', status: 'active' },
      { id: 12, name: '小赵', role: '程序开发', status: 'active' },
    ] as Resource[],
  };
});

vi.mock('../db/db', () => ({
  db: {
    tasks: { toArray: () => state.tasks },
    resources: { toArray: () => state.resources },
    resourceCapacities: { toArray: () => [] },
  },
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (query: () => unknown) => query() }));
vi.mock('../store/useStore', () => ({
  useStore: () => ({
    selectedProjectId: null,
    openTaskModal: state.open,
    setCurrentView: state.setView,
  }),
}));

beforeEach(() => {
  cleanup();
  state.open.mockClear();
  state.setView.mockClear();
});

describe('ScheduleWorkspace', () => {
  it('groups active demands while retaining completed prerequisite tasks', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /商城界面需求/ }));
    expect(screen.getAllByText('商城界面需求').length).toBeGreaterThan(0);
    expect(screen.getAllByText('活动界面需求').length).toBeGreaterThan(0);
    expect(screen.getByText('商城交互方案')).toBeTruthy();
    expect(screen.getAllByText('商城视觉设计').length).toBeGreaterThan(0);
    expect(screen.getAllByText('商城还原开发').length).toBeGreaterThan(0);
    expect(screen.queryByText('商城程序接入')).toBeNull();
    expect(screen.getByText(/完成于/)).toBeTruthy();
    expect(screen.getAllByText('已完成')).toHaveLength(1);
    expect(screen.queryByText('未排期')).toBeNull();
    expect(screen.queryByText('暂无匹配的未完成需求')).toBeNull();
  });

  it('selects a task, focuses its owner and prerequisite schedule, then opens details explicitly', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /商城界面需求/ }));
    expect((screen.getByLabelText('团队成员筛选') as HTMLSelectElement).value).toBe('demand');
    const calendarPanel = within(screen.getByLabelText('团队日历负荷面板'));
    expect(calendarPanel.getByText('视觉设计-小陈')).toBeTruthy();
    expect(calendarPanel.queryByText('程序开发-小赵')).toBeNull();
    expect(screen.getByText('相关人员 2 人')).toBeTruthy();
    expect(screen.getByText('前置链 2 项')).toBeTruthy();
    expect(screen.getByText('商城交互方案').closest('[role="button"]')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /商城视觉设计/ })[0]);
    expect((screen.getByLabelText('团队成员筛选') as HTMLSelectElement).value).toBe('11');
    expect(screen.getByText('当前查看任务')).toBeTruthy();
    expect(screen.getByText('当前任务：商城视觉设计')).toBeTruthy();
    expect(screen.getAllByText('预估 1.6人日').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /商城视觉设计/ }).getAttribute('href')).toBe('https://tapd.example/story/3');

    fireEvent.click(screen.getByRole('button', { name: '看负责人排期' }));
    expect((screen.getByLabelText('团队成员筛选') as HTMLSelectElement).value).toBe('11');
    fireEvent.click(screen.getByRole('button', { name: '看前置排期' }));
    expect(screen.getByText('正在看：当前任务 + 前置链')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /商城还原开发/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: '打开详情' }));
    expect(state.open).toHaveBeenCalledWith(4);
  });

  it('lets a calendar cell switch to the task and demand it belongs to', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getAllByTitle('活动视觉设计 · 点击查看任务上下文')[0]);
    expect(screen.getByText('当前任务：活动视觉设计')).toBeTruthy();
    expect(screen.getAllByText('活动界面需求')[0].closest('button')).toBeTruthy();
  });

  it('filters demands by category before scheduling', () => {
    render(<ScheduleWorkspace />);

    fireEvent.change(screen.getByLabelText('需求分类筛选'), { target: { value: '商城' } });
    expect(screen.getByRole('button', { name: /商城界面需求/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /活动界面需求/ })).toBeNull();
    expect(screen.getByText('商城界面需求')).toBeTruthy();
  });

  it('shows the real schedule when a task is outside the current window', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /商城界面需求/ }));
    expect(screen.getAllByText(/已排期：\d{2}\/\d{2}–\d{2}\/\d{2}/).length).toBeGreaterThan(0);
    expect(screen.queryByText('未排期')).toBeNull();
    expect(screen.getByText('需求前后置链')).toBeTruthy();
    expect(screen.queryByText('需求前后置时间')).toBeNull();
    expect(screen.getByText('子需求 / 当前阶段 / 负责人 / 预估人日 / 排期状态')).toBeTruthy();
  });

  it('moves the calendar window and supports member filtering', () => {
    render(<ScheduleWorkspace />);

    expect(screen.getByText('28天窗口')).toBeTruthy();
    expect(screen.getAllByText('周末').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/可排/).length).toBeGreaterThan(0);
    const initialHeader = screen.getByText(/团队日历负荷/).parentElement?.textContent;
    fireEvent.click(screen.getByTitle('后 7 天'));
    const movedHeader = screen.getByText(/团队日历负荷/).parentElement?.textContent;
    expect(movedHeader).not.toBe(initialHeader);

    fireEvent.change(screen.getByDisplayValue('全部成员'), { target: { value: '10' } });
    const calendarPanel = within(screen.getByLabelText('团队日历负荷面板'));
    expect(calendarPanel.getByText('交互设计-小林')).toBeTruthy();
    expect(calendarPanel.queryByText('视觉设计-小陈')).toBeNull();
  });

  it('navigates to the gantt view for detailed adjustments', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '去甘特图调整' }));
    expect(state.setView).toHaveBeenCalledWith('gantt');
  });
});
