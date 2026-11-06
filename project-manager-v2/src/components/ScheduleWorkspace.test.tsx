// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      makeTask({ id: 1, title: '商城界面需求', tapdWorkitemTypeName: 'UIStory' }),
      makeTask({ id: 2, parentId: 1, title: '商城交互方案', status: 'done', assigneeIds: [10], startDate: dateAt(-2), endDate: dateAt(-1) }),
      makeTask({ id: 3, parentId: 1, title: '商城视觉设计', status: 'in_progress', assigneeIds: [11], startDate: dateAt(1), endDate: dateAt(3), dependencies: [2] }),
      makeTask({ id: 4, parentId: 1, title: '商城还原开发', status: 'todo', assigneeIds: [10], startDate: dateAt(4), endDate: dateAt(6), dependencies: [3] }),
      makeTask({ id: 5, title: '活动界面需求', tapdWorkitemTypeName: 'UIStory' }),
      makeTask({ id: 6, parentId: 5, title: '活动视觉设计', status: 'todo', assigneeIds: [11], startDate: dateAt(2), endDate: dateAt(5) }),
    ] as Task[],
    resources: [
      { id: 10, name: '小林', role: '交互设计', status: 'active' },
      { id: 11, name: '小陈', role: '视觉设计', status: 'active' },
    ] as Resource[],
  };
});

vi.mock('../db/db', () => ({
  db: {
    tasks: { toArray: () => state.tasks },
    resources: { toArray: () => state.resources },
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
    expect(screen.queryByText('暂无匹配的未完成需求')).toBeNull();
  });

  it('highlights the selected demand in the team calendar and opens tasks', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /商城界面需求/ }));
    expect(screen.getByText('相关人员 2 人')).toBeTruthy();
    expect(screen.getByText('前置链 2 项')).toBeTruthy();
    expect(screen.getByText('商城交互方案').closest('button')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /商城视觉设计/ })[0]);
    expect(screen.getAllByText('商城界面需求').length).toBeGreaterThan(0);
    expect(screen.getAllByText('活动界面需求').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /商城还原开发/ })[0]);
    expect(state.open).toHaveBeenCalledWith(4);
  });

  it('moves the calendar window and supports member filtering', () => {
    render(<ScheduleWorkspace />);

    const initialHeader = screen.getByText(/团队日历负荷/).parentElement?.textContent;
    fireEvent.click(screen.getByTitle('后 7 天'));
    const movedHeader = screen.getByText(/团队日历负荷/).parentElement?.textContent;
    expect(movedHeader).not.toBe(initialHeader);

    fireEvent.change(screen.getByDisplayValue('全部成员'), { target: { value: '10' } });
    expect(screen.getByText('交互设计-小林')).toBeTruthy();
    expect(screen.queryByText('视觉设计-小陈')).toBeNull();
  });

  it('navigates to the gantt view for detailed adjustments', () => {
    render(<ScheduleWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '去甘特图调整' }));
    expect(state.setView).toHaveBeenCalledWith('gantt');
  });
});
