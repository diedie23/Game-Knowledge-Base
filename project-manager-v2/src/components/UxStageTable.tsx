import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, X, ArrowUpDown, ExternalLink, ChevronRight } from 'lucide-react';
import { db } from '../db/db';
import { useStore } from '../store/useStore';
import type { Task } from '../types/task';
import type { UxStage } from '../types/scheduling';
import { buildStageRows, STAGES, STAGE_STATUS, stageStatus, taskStatus } from '../services/uxStageView';

function dateLabel(value?: Date) {
  if (!value) return '未排期';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未排期' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function StatusBadge({ status }: { status: keyof typeof STAGE_STATUS }) {
  const meta = STAGE_STATUS[status];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium ${meta.color}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{meta.label}
  </span>;
}

export function UxStageTable() {
  const { selectedProjectId, openTaskModal } = useStore();
  const tasks = useLiveQuery(() => selectedProjectId ? db.tasks.where('projectId').equals(selectedProjectId).toArray() : db.tasks.toArray(), [selectedProjectId]);
  const resources = useLiveQuery(() => db.resources.toArray()) || [];
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [status, setStatus] = useState('all');
  const [person, setPerson] = useState('all');
  const [priority, setPriority] = useState('all');
  const [descending, setDescending] = useState(false);
  const [detail, setDetail] = useState<{ rootId: number; stage: UxStage } | null>(null);
  const rows = useMemo(() => buildStageRows(tasks || []), [tasks]);
  const names = (items: Task[]) => {
    const ids = [...new Set(items.flatMap(t => t.assigneeIds || []))];
    const result = ids.map(id => resources.find(r => r.id === id)?.name || `未知成员 #${id}`);
    if (items.some(t => !t.assigneeIds?.length)) result.push('待分配');
    return result.join('、') || '—';
  };
  const filtered = rows.filter(row => {
    const text = query.trim().toLowerCase();
    if (text && ![row.root, ...row.descendants].some(t => `${t.title} ${t.tapdId || ''} ${t.module || ''}`.toLowerCase().includes(text))) return false;
    if (priority !== 'all' && row.root.priority !== priority) return false;
    return STAGES.filter(s => stage === 'all' || s.key === stage).some(s => {
      const items = row.stages[s.key];
      if (status === 'missing') return !items.length && person === 'all';
      if (status === 'all' && person === 'all') return stage === 'all' || items.length > 0;
      // Owner and status must match the same task.
      return items.some(t => (status === 'all' || taskStatus(t) === status) &&
        (person === 'all' || (person === 'unassigned' ? !t.assigneeIds?.length : t.assigneeIds?.includes(Number(person)))));
    });
  }).sort((a, b) => {
    const left = a.root.endDate ? new Date(a.root.endDate).getTime() : Infinity;
    const right = b.root.endDate ? new Date(b.root.endDate).getTime() : Infinity;
    if (left === right) return (a.root.id || 0) - (b.root.id || 0);
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return descending ? right - left : left - right;
  });
  const detailRow = rows.find(row => row.root.id === detail?.rootId);
  const detailTasks = detail && detailRow ? detailRow.stages[detail.stage] : [];
  const hasFilters = query || stage !== 'all' || status !== 'all' || person !== 'all' || priority !== 'all';
  const clearFilters = () => { setQuery(''); setStage('all'); setStatus('all'); setPerson('all'); setPriority('all'); };
  const selectClass = 'bg-[#151923] border border-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return <div className="flex min-h-0 flex-1 flex-col bg-[#0f1115]">
    <div className="shrink-0 border-b border-gray-800 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-gray-100">UX 环节总览</h2><p className="mt-1 text-xs text-gray-500">一行一个需求 · 点击环节查看子任务与排期</p></div>
        <button onClick={() => openTaskModal()} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"><Plus size={15} />新建任务</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 max-w-sm"><Search size={15} className="absolute left-3 top-3 text-gray-500" /><input aria-label="搜索需求" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索需求、子任务、TAPD ID…" className={`${selectClass} w-full pl-9`} /></label>
        <select aria-label="环节筛选" className={selectClass} value={stage} onChange={e => setStage(e.target.value)}><option value="all">全部环节</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <select aria-label="负责人筛选" className={selectClass} value={person} onChange={e => setPerson(e.target.value)}><option value="all">全部负责人</option><option value="unassigned">待分配</option>{resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select aria-label="环节状态筛选" className={selectClass} value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部环节状态</option>{Object.entries(STAGE_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select>
        <select aria-label="优先级筛选" className={selectClass} value={priority} onChange={e => setPriority(e.target.value)}><option value="all">全部优先级</option><option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option></select>
        {hasFilters && <button onClick={clearFilters} className="px-2 text-xs text-indigo-300 hover:text-white">清除筛选</button>}
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-gray-500"><span>显示 <strong className="text-gray-200">{filtered.length}</strong> / {rows.length} 个需求</span><span>状态筛选匹配子任务 · — 表示未建任务</span></div>
    <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
      <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0 text-left text-xs">
        <colgroup><col style={{ width: '28%' }} /><col style={{ width: '6%' }} />{STAGES.map(s => <col key={s.key} style={{ width: '14%' }} />)}<col style={{ width: '10%' }} /></colgroup>
        <thead className="sticky top-0 z-20"><tr className="text-gray-400">
          <th className="sticky left-0 z-30 border-y border-gray-800 bg-[#171b25] px-4 py-3 font-medium">需求 / 分类</th>
          <th className="border-y border-gray-800 bg-[#171b25] px-2 py-3 font-medium">优先级</th>
          {STAGES.map((s, index) => <th key={s.key} className="border-y border-l border-gray-800 bg-[#171b25] px-3 py-3 font-medium"><span className="mr-2 text-[10px] text-indigo-400">0{index + 1}</span><span className="text-gray-200">{s.label}</span><div className="mt-1 text-[10px] font-normal text-gray-500">负责人 / 状态</div></th>)}
          <th className="border-y border-l border-gray-800 bg-[#171b25] px-3 py-3 font-medium"><button onClick={() => setDescending(!descending)} className="flex items-center gap-1" aria-label={descending ? '截止日期降序，点击升序' : '截止日期升序，点击降序'}>截止日期<ArrowUpDown size={12} /></button></th>
        </tr></thead>
        <tbody>{filtered.map(({ root, stages }) => <tr key={root.id} className="group">
          <td className="sticky left-0 z-10 border-b border-gray-800 bg-[#11151d] px-4 py-3 group-hover:bg-[#191e2b]">
            <button onClick={() => openTaskModal(root.id)} className="line-clamp-2 text-left text-[13px] font-medium leading-5 text-gray-200 hover:text-indigo-300" title={root.title}>{root.title}</button>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-500">{root.module && <span className="truncate rounded bg-gray-800 px-1.5 py-0.5">{root.module}</span>}{root.tapdId && <span>#{root.tapdId}</span>}{root.externalUrl && <a href={root.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-400">TAPD<ExternalLink size={10} /></a>}</div>
          </td>
          <td className="border-b border-gray-800 px-2 py-3 align-top pt-5"><span className={`rounded px-2 py-1 text-[10px] ${root.priority === 'high' ? 'bg-red-500/10 text-red-300' : root.priority === 'medium' ? 'bg-amber-500/10 text-amber-300' : 'bg-gray-800 text-gray-400'}`}>{({ high: '高', medium: '中', low: '低' })[root.priority] || '—'}</span></td>
          {STAGES.map(s => { const items = stages[s.key]; const summary = stageStatus(items); return <td key={s.key} className="border-b border-l border-gray-800/80 px-2 py-2 align-top group-hover:bg-white/[0.015]">
            {items.length ? <button aria-label={`${root.title} · ${s.label}：${STAGE_STATUS[summary].label}`} onClick={() => setDetail({ rootId: root.id!, stage: s.key })} className="w-full rounded-lg p-2 text-left transition-colors hover:bg-indigo-500/10 focus-visible:outline focus-visible:outline-indigo-400">
              <div className={`mb-2 truncate text-xs ${items.some(t => !t.assigneeIds?.length) ? 'text-amber-200/80' : 'text-gray-300'}`} title={names(items)}>{names(items)}</div>
              <div className="flex flex-wrap items-center gap-1"><StatusBadge status={summary} />{items.length > 1 && <span className="text-[10px] text-gray-500">{items.filter(t => t.status === 'done').length}/{items.length}</span>}</div>
            </button> : <div className="px-2 py-2"><div className="mb-2 text-gray-600">—</div><span className="text-[10px] text-gray-600">未建任务</span></div>}
          </td>; })}
          <td className="border-b border-l border-gray-800 px-3 py-5 align-top text-gray-400">{dateLabel(root.endDate)}</td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <div className="py-20 text-center"><p className="text-sm text-gray-400">{tasks === undefined ? '正在加载需求…' : hasFilters ? '没有符合条件的需求' : '暂无需求，创建或导入 TAPD 任务后即可查看环节状态'}</p>{hasFilters && <button onClick={clearFilters} className="mt-3 text-sm text-indigo-300">清除筛选</button>}</div>}
    </div>
    {detail && detailRow && <div className="absolute inset-0 z-40 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
      <section role="dialog" aria-modal="true" aria-label="环节子任务" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setDetail(null); }} className="flex h-full w-full max-w-md flex-col border-l border-gray-700 bg-[#151923] shadow-2xl">
        <div className="border-b border-gray-800 p-5"><div className="flex items-center justify-between"><h3 className="font-semibold text-gray-100">{STAGES.find(s => s.key === detail.stage)?.label} · {detailTasks.length} 个子任务</h3><button autoFocus aria-label="关闭环节详情" onClick={() => setDetail(null)} className="rounded p-1 text-gray-400 hover:bg-gray-700"><X size={18} /></button></div><p className="mt-2 text-xs leading-5 text-gray-500">{detailRow.root.title}</p></div>
        <div className="flex-1 space-y-3 overflow-auto p-5">{detailTasks.map(task => <div key={task.id} className="rounded-xl border border-gray-700/70 bg-[#11151d] p-4"><div className="mb-3 flex items-start justify-between gap-3"><h4 className="text-sm leading-5 text-gray-200">{task.title}</h4><StatusBadge status={taskStatus(task)} /></div><p className="text-xs text-gray-400">负责人：{names([task])}</p><p className="mt-2 text-xs text-gray-500">{dateLabel(task.startDate)} → {dateLabel(task.endDate)}</p>{taskStatus(task) === 'blocked' && <p className="mt-3 rounded bg-red-500/10 p-2 text-xs text-red-300">{task.blockReason || '任务已标记阻塞，尚未填写原因'}</p>}<button onClick={() => { setDetail(null); openTaskModal(task.id); }} className="mt-4 flex items-center gap-1 text-xs text-indigo-300 hover:text-white">查看 / 编辑任务<ChevronRight size={13} /></button></div>)}</div>
      </section>
    </div>}
  </div>;
}
