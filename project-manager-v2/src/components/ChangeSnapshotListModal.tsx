import React, { useEffect, useMemo, useState } from 'react';
import { X, Clock, Trash2, ArrowRight, GitBranch } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { db } from '../db/db';
import { useStore } from '../store/useStore';
import { compareScheduleSnapshots, type ScheduleSnapshotComparison } from '../services/scheduleSnapshotService';
import type { ChangeSnapshot, Task } from '../types';
import { confirmDialog } from './common/ConfirmDialog';

function snapshotTitle(snapshot: ChangeSnapshot): string {
  return `${snapshot.reason} · ${format(snapshot.date, 'MM/dd HH:mm', { locale: zhCN })}`;
}

function taskDate(value?: Date): string {
  return value ? format(new Date(value), 'yyyy-MM-dd') : '未排期';
}

function taskRange(task?: Task): string {
  if (!task) return '无此任务';
  return `${taskDate(task.startDate)} 至 ${taskDate(task.endDate)}`;
}

function comparisonStateLabel(state: ScheduleSnapshotComparison['rows'][number]['state']): string {
  return state === 'changed' ? '已变化' : state === 'added' ? '新增任务' : state === 'removed' ? '已移除' : '无变化';
}

export const ChangeSnapshotListModal = () => {
  const { isSnapshotListModalOpen, closeSnapshotListModal, selectedProjectId } = useStore();
  const [firstSnapshotId, setFirstSnapshotId] = useState<string>('');
  const [secondSnapshotId, setSecondSnapshotId] = useState<string>('');
  const [showUnchanged, setShowUnchanged] = useState(true);
  
  const snapshots = useLiveQuery(
    () => db.changeSnapshots.orderBy('date').reverse().toArray(),
    []
  );
  const scheduleSnapshots = useMemo(
    () => (snapshots || []).filter(snapshot => snapshot.kind === 'schedule-plan'
      && (selectedProjectId === null || snapshot.projectId === selectedProjectId)),
    [selectedProjectId, snapshots],
  );
  useEffect(() => {
    if (scheduleSnapshots.length === 0) {
      setFirstSnapshotId('');
      setSecondSnapshotId('');
      return;
    }
    setFirstSnapshotId(current => current && scheduleSnapshots.some(snapshot => snapshot.id === current)
      ? current : (scheduleSnapshots[1]?.id || scheduleSnapshots[0].id));
    setSecondSnapshotId(current => current && scheduleSnapshots.some(snapshot => snapshot.id === current)
      ? current : scheduleSnapshots[0].id);
  }, [scheduleSnapshots]);
  const comparison = useMemo(() => {
    const first = scheduleSnapshots.find(snapshot => snapshot.id === firstSnapshotId);
    const second = scheduleSnapshots.find(snapshot => snapshot.id === secondSnapshotId);
    return first && second && first.id !== second.id ? compareScheduleSnapshots(first, second) : undefined;
  }, [firstSnapshotId, scheduleSnapshots, secondSnapshotId]);
  const comparisonRows = comparison?.rows.filter(row => showUnchanged || row.changed || row.state !== 'unchanged') || [];

  if (!isSnapshotListModalOpen) return null;

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: '删除快照', message: '确定要删除这条快照记录吗？', type: 'danger', confirmText: '删除' });
    if (ok) {
      await db.changeSnapshots.delete(id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a1d27] rounded-xl shadow-2xl w-full max-w-2xl border border-gray-800 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="text-indigo-400" size={20} />
            <h2 className="text-lg font-semibold text-white">变更快照记录</h2>
          </div>
          <button
            onClick={closeSnapshotListModal}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <section aria-label="排期方案快照对比" className="shrink-0 border-b border-indigo-500/20 bg-indigo-500/[0.05] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-100"><GitBranch size={16} className="text-indigo-300" />排期方案快照对比</div>
              <p className="mt-1 text-[10px] text-gray-500">只读取快照中的任务状态进行对比，不会修改当前任务或 TAPD 数据。</p>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-gray-400"><input type="checkbox" checked={showUnchanged} onChange={event => setShowUnchanged(event.target.checked)} />显示未变化任务</label>
          </div>
          {scheduleSnapshots.length < 2 ? (
            <div className="mt-3 rounded border border-gray-700/70 bg-gray-950/30 px-3 py-2 text-[10px] text-gray-500">当前项目至少需要两份排期方案快照后才能进行对比。</div>
          ) : (
            <>
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
                <label className="min-w-0 text-[10px] text-gray-400">基准方案<select aria-label="基准排期方案" value={firstSnapshotId} onChange={event => setFirstSnapshotId(event.target.value)} className="mt-1 w-full truncate rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-indigo-400">{scheduleSnapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshotTitle(snapshot)}</option>)}</select></label>
                <ArrowRight size={14} className="hidden text-indigo-300 md:block" />
                <label className="min-w-0 text-[10px] text-gray-400">对比方案<select aria-label="对比排期方案" value={secondSnapshotId} onChange={event => setSecondSnapshotId(event.target.value)} className="mt-1 w-full truncate rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-indigo-400">{scheduleSnapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshotTitle(snapshot)}</option>)}</select></label>
              </div>
              {comparison && <div className="mt-3">
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-1 text-gray-300">共 {comparison.rows.length} 项</span>
                  <span className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-amber-200">变化 {comparison.changedCount} 项</span>
                  <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-200">未变化 {comparison.unchangedCount} 项</span>
                  {comparison.addedCount > 0 && <span className="rounded border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-sky-200">新增 {comparison.addedCount} 项</span>}
                  {comparison.removedCount > 0 && <span className="rounded border border-red-500/25 bg-red-500/10 px-2 py-1 text-red-200">移除 {comparison.removedCount} 项</span>}
                </div>
                <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {comparisonRows.length === 0 && <div className="rounded border border-gray-700/70 bg-gray-950/30 px-3 py-2 text-[10px] text-gray-500">两份方案没有可展示的变化。</div>}
                  {comparisonRows.map(row => <div key={row.taskId} className={`rounded border px-2.5 py-2 ${row.changed ? 'border-amber-500/25 bg-amber-500/[0.06]' : row.state === 'unchanged' ? 'border-gray-800 bg-gray-950/20' : 'border-sky-500/25 bg-sky-500/[0.05]'}`}>
                    <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[11px] text-gray-200" title={row.title}>{row.title}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${row.changed ? 'bg-amber-500/15 text-amber-200' : row.state === 'unchanged' ? 'bg-gray-800 text-gray-500' : 'bg-sky-500/15 text-sky-200'}`}>{comparisonStateLabel(row.state)}</span></div>
                    <div className="mt-1 grid gap-1 text-[9px] text-gray-500 md:grid-cols-2"><div>基准：{taskRange(row.first)} · 负责人 {row.first?.assigneeIds?.join('、') || '未分配'}</div><div>对比：{taskRange(row.second)} · 负责人 {row.second?.assigneeIds?.join('、') || '未分配'}</div></div>
                    {row.changed && <div className="mt-1 text-[9px] text-amber-300">变化字段：{[row.startChanged && '开始日期', row.endChanged && '结束日期', row.assigneesChanged && '负责人'].filter(Boolean).join('、')}</div>}
                  </div>)}
                </div>
              </div>}
            </>
          )}
        </section>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
          {!snapshots || snapshots.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock size={48} className="mx-auto mb-4 opacity-20" />
              <p>暂无变更快照记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-medium text-white">
                          {snapshot.reason}
                        </span>
                        {snapshot.kind === 'schedule-plan' && (
                          <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300">排期方案</span>
                        )}
                        <span className="text-xs text-gray-500">
                          {format(snapshot.date, 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                        </span>
                      </div>
                      {snapshot.kind === 'schedule-plan' && snapshot.scheduleData && (
                        <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-gray-400">
                          <span className="rounded bg-gray-800 px-1.5 py-0.5">{snapshot.scheduleData.source === 'tapd-planner' ? 'TAPD 排期助手' : snapshot.scheduleData.source === 'gantt-move' ? '甘特图移动' : '甘特图拉伸'}</span>
                          <span className={`rounded px-1.5 py-0.5 ${snapshot.scheduleData.status === 'applied' ? 'bg-emerald-500/10 text-emerald-300' : snapshot.scheduleData.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>{snapshot.scheduleData.status === 'applied' ? '已应用' : snapshot.scheduleData.status === 'rejected' ? '未通过校验' : '已生成'}</span>
                          <span className="rounded bg-gray-800 px-1.5 py-0.5">影响 {snapshot.scheduleData.taskIds.length} 项任务</span>
                          {snapshot.scheduleData.validation?.beforeAfter?.afterEndDate && <span className="rounded bg-gray-800 px-1.5 py-0.5">结束日 {format(snapshot.scheduleData.validation.beforeAfter.afterEndDate, 'MM月dd日')}</span>}
                        </div>
                      )}
                      {snapshot.description && (
                        <p className="text-sm text-gray-400 whitespace-pre-wrap">
                          {snapshot.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(snapshot.id)}
                      className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                      title="删除记录"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
