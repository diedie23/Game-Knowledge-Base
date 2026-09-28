// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UxStageTable } from './UxStageTable';

const state = vi.hoisted(() => ({ open: vi.fn(), tasks: [
  { id: 1, title: '商城需求', projectId: 1, status: 'todo', priority: 'high', module: '商城' },
  { id: 2, parentId: 1, title: '【视觉设计】商城初稿', status: 'done', projectId: 1, assigneeIds: [1] },
  { id: 3, parentId: 1, title: '【视觉设计】商城修改', status: 'todo', projectId: 1, assigneeIds: [2], isBlocked: true, blockReason: '等待素材' },
  { id: 6, parentId: 1, title: '商城程序接入', status: 'in_progress', projectId: 1, tapdWorkitemTypeName: '开发子需求', externalUrl: 'https://tapd.example/story/6' },
  { id: 4, title: '活动需求', projectId: 1, status: 'done', priority: 'medium', module: '活动' },
  { id: 5, title: '拒绝需求', projectId: 1, status: 'cancelled', priority: 'low', module: '活动' },
] }));
vi.mock('../db/db', () => ({ db: { tasks: { toArray: () => state.tasks }, resources: { toArray: () => [{ id: 1, name: '小林', role: 'UI设计' }, { id: 2, name: '小陈', role: 'UI设计' }] } } }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (query: () => unknown) => query() }));
vi.mock('../store/useStore', () => ({ useStore: () => ({ selectedProjectId: null, openTaskModal: state.open }) }));

beforeEach(() => { cleanup(); state.open.mockClear(); });
describe('UX stage table', () => {
  it('shows owners and opens the exact child from stage details', () => {
    render(<UxStageTable />);
    expect(screen.getByText('UI设计-小林、UI设计-小陈')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '商城需求 · 视觉：阻塞' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('等待素材')).toBeTruthy();
    fireEvent.click(screen.getAllByText('查看 / 编辑任务')[1]);
    expect(state.open).toHaveBeenCalledWith(3);
  });
  it('shows an unfinished development child as a compact program-integration checkpoint', () => {
    render(<UxStageTable />);
    const checkpoint = screen.getByText('卡点：程序接入 · 接入中');
    expect(checkpoint.closest('a')?.getAttribute('href')).toBe('https://tapd.example/story/6');
    expect(screen.queryByText('开发')).toBeNull();
  });
  it('shows a completed parent with the same overall treatment in green', () => {
    render(<UxStageTable />);
    const completedLabel = screen.getByText('父需求已完成');
    expect(completedLabel.closest('tr')?.className).toContain('bg-emerald');
    expect(completedLabel.className).toContain('text-emerald');
  });
  it('shows a rejected parent as an overall rejected row', () => {
    render(<UxStageTable />);
    const rejectedLabel = screen.getByText('父需求已拒绝');
    expect(rejectedLabel.closest('tr')?.className).toContain('bg-red');
    fireEvent.change(screen.getByLabelText('环节状态筛选'), { target: { value: 'cancelled' } });
    expect(screen.getByRole('button', { name: '拒绝需求' })).toBeTruthy();
  });
  it('combines owner and status on the same child', () => {
    render(<UxStageTable />);
    fireEvent.change(screen.getByLabelText('视觉处理人筛选'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('环节状态筛选'), { target: { value: 'blocked' } });
    expect(screen.getByText('没有符合条件的需求')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('视觉处理人筛选'), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: '商城需求' })).toBeTruthy();
  });
  it('searches child titles and resets filters', () => {
    render(<UxStageTable />);
    fireEvent.change(screen.getByLabelText('搜索需求'), { target: { value: '初稿' } });
    expect(screen.queryByRole('button', { name: '活动需求' })).toBeNull();
    fireEvent.click(screen.getByText('清除筛选'));
    expect(screen.getByRole('button', { name: '活动需求' })).toBeTruthy();
  });
  it('filters by module category and places completed demands after unfinished work', () => {
    render(<UxStageTable />);
    const titles = screen.getAllByText(/商城需求|活动需求/).map(node => node.textContent);
    expect(titles).toEqual(['商城需求', '活动需求']);
    fireEvent.change(screen.getByLabelText('模块分类筛选'), { target: { value: '活动' } });
    expect(screen.queryByRole('button', { name: '商城需求' })).toBeNull();
    expect(screen.getByRole('button', { name: '活动需求' })).toBeTruthy();
  });
  it('filters missing work by the selected stage', () => {
    render(<UxStageTable />);
    fireEvent.change(screen.getByLabelText('环节筛选'), { target: { value: 'ui_design' } });
    fireEvent.change(screen.getByLabelText('环节状态筛选'), { target: { value: 'missing' } });
    expect(screen.queryByRole('button', { name: '商城需求' })).toBeNull();
    expect(screen.getByRole('button', { name: '活动需求' })).toBeTruthy();
  });
});
