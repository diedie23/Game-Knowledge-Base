// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UxStageTable } from './UxStageTable';

const state = vi.hoisted(() => ({ open: vi.fn(), tasks: [
  { id: 1, title: '商城需求', projectId: 1, status: 'todo', priority: 'high' },
  { id: 2, parentId: 1, title: '【视觉设计】商城初稿', status: 'done', projectId: 1, assigneeIds: [1] },
  { id: 3, parentId: 1, title: '【视觉设计】商城修改', status: 'todo', projectId: 1, assigneeIds: [2], isBlocked: true, blockReason: '等待素材' },
  { id: 4, title: '活动需求', projectId: 1, status: 'done', priority: 'medium' },
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
  it('highlights an explicitly completed parent across the whole row', () => {
    render(<UxStageTable />);
    expect(screen.getByRole('button', { name: '活动需求' }).closest('tr')?.className).toContain('bg-emerald');
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
  it('filters missing work by the selected stage', () => {
    render(<UxStageTable />);
    fireEvent.change(screen.getByLabelText('环节筛选'), { target: { value: 'ui_design' } });
    fireEvent.change(screen.getByLabelText('环节状态筛选'), { target: { value: 'missing' } });
    expect(screen.queryByRole('button', { name: '商城需求' })).toBeNull();
    expect(screen.getByRole('button', { name: '活动需求' })).toBeTruthy();
  });
});
