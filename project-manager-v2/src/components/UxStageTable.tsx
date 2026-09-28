import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, X, ArrowUpDown, ExternalLink, ChevronRight } from 'lucide-react';
import { db } from '../db/db';
import { useStore } from '../store/useStore';
import type { Task } from '../types/task';
import type { CoreUxStage } from '../services/uxStageView';
import { buildStageRows, isDemandComplete, isUiStoryOverallComplete, STAGES, STAGE_STATUS, stageStatus, taskStatus } from '../services/uxStageView';
import { getPriorityLabel } from '../utils/priority';
import { formatResourceDisplayName } from '../utils/resourceDisplay';

function dateLabel(value?: Date) {
  if (!value) return '未排期';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未排期' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function taskRangeLabel(items: Task[]) {
  const starts = items.flatMap(item => item.startDate ? [new Date(item.startDate)] : []).filter(date => !Number.isNaN(date.getTime()));
  const ends = items.flatMap(item => item.endDate ? [new Date(item.endDate)] : []).filter(date => !Number.isNaN(date.getTime()));
  if (!starts.length && !ends.length) return '未排期';
  const start = starts.length ? new Date(Math.min(...starts.map(date => date.getTime()))) : undefined;
  const end = ends.length ? new Date(Math.max(...ends.map(date => date.getTime()))) : undefined;
  return dateLabel(start) + ' → ' + dateLabel(end);
}

type StageOwnerFilters = Record<CoreUxStage, string>;

const EMPTY_STAGE_OWNERS: StageOwnerFilters = {
  interaction: 'all',
  ui_design: 'all',
  implementation: 'all',
  motion: 'all',
};

const STAGE_ROLE_PATTERN: Record<CoreUxStage, RegExp> = {
  interaction: /UX|交互/i,
  ui_design: /UI|视觉|美术/i,
  implementation: /Layout|还原|实现/i,
  motion: /动效|动画|Motion|VFX/i,
};

const STAGE_CARD_STYLE: Record<keyof typeof STAGE_STATUS, string> = {
  done: 'border-emerald-400/20 bg-emerald-500/[0.07]',
  in_progress: 'border-blue-400/20 bg-blue-500/[0.07]',
  blocked: 'border-red-400/25 bg-red-500/[0.08]',
  todo: 'border-slate-400/15 bg-slate-400/[0.05]',
  paused: 'border-amber-400/20 bg-amber-500/[0.07]',
  cancelled: 'border-gray-500/20 bg-gray-500/[0.05]',
  missing: 'border-gray-700/50 bg-gray-900/20',
};

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
  const [moduleCategory, setModuleCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [stageOwners, setStageOwners] = useState<StageOwnerFilters>(EMPTY_STAGE_OWNERS);
  const [priority, setPriority] = useState('all');
  const [descending, setDescending] = useState(false);
  const [detail, setDetail] = useState<{ rootId: number; stage: CoreUxStage } | null>(null);
  const rows = useMemo(() => buildStageRows(tasks || [], resources), [tasks, resources]);
  const moduleCategories = useMemo(() => [...new Set(
    rows.map(row => row.root.module?.trim()).filter((value): value is string => Boolean(value))
  )].sort((left, right) => left.localeCompare(right, 'zh-CN')), [rows]);
  const names = (items: Task[]) => {
    const ids = [...new Set(items.flatMap(t => t.assigneeIds || []))];
    const result = ids.map(id => {
      const resource = resources.find(r => r.id === id);
      return resource ? formatResourceDisplayName(resource) : `未知成员 #${id}`;
    });
    if (items.some(t => !t.assigneeIds?.length)) result.push('待分配');
    return result.join('、') || '—';
  };
  const filtered = rows.filter(row => {
    const text = query.trim().toLowerCase();
    if (text && ![row.root, ...row.descendants].some(t => `${t.title} ${t.tapdId || ''} ${t.module || ''}`.toLowerCase().includes(text))) return false;
    if (priority !== 'all' && row.root.priority !== priority) return false;
    if (moduleCategory !== 'all' && row.root.module !== moduleCategory) return false;
    const visibleStages = STAGES.filter(s => stage === 'all' || s.key === stage);
    const ownersMatch = STAGES.every(s => {
      const selectedOwner = stageOwners[s.key];
      if (selectedOwner === 'all') return true;
      const items = row.stages[s.key];
      if (selectedOwner === 'unassigned') return items.some(t => !t.assigneeIds?.length);
      return items.some(t => t.assigneeIds?.includes(Number(selectedOwner)));
    });
    if (!ownersMatch) return false;
    // “已完成” follows TAPD workflow progress, with all-stage completion as a fallback.
    if (status === 'done') return isUiStoryOverallComplete(row.root) || isDemandComplete(row.stages);
    if (status === 'cancelled' && taskStatus(row.root) === 'cancelled') return true;
    if (status === 'missing') return visibleStages.some(s => row.stages[s.key].length === 0);
    if (status === 'all') return stage === 'all' || visibleStages.some(s => row.stages[s.key].length > 0);
    return visibleStages.some(s => {
      const selectedOwner = stageOwners[s.key];
      return row.stages[s.key].some(t => taskStatus(t) === status && (
        selectedOwner === 'all' ||
        (selectedOwner === 'unassigned' ? !t.assigneeIds?.length : t.assigneeIds?.includes(Number(selectedOwner)))
      ));
    });
  }).sort((a, b) => {
    const aDone = isUiStoryOverallComplete(a.root) || isDemandComplete(a.stages);
    const bDone = isUiStoryOverallComplete(b.root) || isDemandComplete(b.stages);
    if (aDone !== bDone) return aDone ? 1 : -1;

    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    if (!aDone) {
      const priorityDifference = (priorityRank[a.root.priority || ''] ?? 3) - (priorityRank[b.root.priority || ''] ?? 3);
      if (priorityDifference !== 0) return priorityDifference;
    }

    const left = a.root.endDate ? new Date(a.root.endDate).getTime() : Infinity;
    const right = b.root.endDate ? new Date(b.root.endDate).getTime() : Infinity;
    if (left === right) return (a.root.id || 0) - (b.root.id || 0);
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return descending ? right - left : left - right;
  });
  const detailRow = rows.find(row => row.root.id === detail?.rootId);
  const detailTasks = detail && detailRow ? detailRow.stages[detail.stage] : [];
  const hasFilters = query || stage !== 'all' || moduleCategory !== 'all' || status !== 'all' || Object.values(stageOwners).some(value => value !== 'all') || priority !== 'all';
  const clearFilters = () => { setQuery(''); setStage('all'); setModuleCategory('all'); setStatus('all'); setStageOwners(EMPTY_STAGE_OWNERS); setPriority('all'); };
  const selectClass = 'h-9 bg-[#151923] border border-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return <div className="flex min-h-0 flex-1 flex-col bg-[#0f1115]">
    <div className="shrink-0 border-b border-gray-800 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-gray-100">UX 环节总览</h2><p className="mt-1 text-xs text-gray-500">一行一个需求 · 点击环节查看子任务与排期</p></div>
        <button onClick={() => openTaskModal()} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"><Plus size={15} />新建任务</button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[220px] max-w-sm flex-1 flex-col gap-1">
          <span className="px-1 text-[10px] font-medium text-gray-500">搜索</span>
          <span className="relative block"><Search size={15} className="absolute left-3 top-2.5 text-gray-500" /><input aria-label="搜索需求" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索需求、子任务、TAPD ID…" className={selectClass + ' w-full pl-9'} /></span>
        </label>
        <label className="flex min-w-[96px] flex-col gap-1"><span className="px-1 text-[10px] font-medium text-gray-500">环节</span><select aria-label="环节筛选" className={selectClass} value={stage} onChange={e => setStage(e.target.value)}><option value="all">全部</option>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <label className="flex min-w-[120px] flex-col gap-1"><span className="px-1 text-[10px] font-medium text-gray-500">模块分类</span><select aria-label="模块分类筛选" className={selectClass} value={moduleCategory} onChange={e => setModuleCategory(e.target.value)}><option value="all">全部</option>{moduleCategories.map(module => <option key={module} value={module}>{module}</option>)}</select></label>
        {STAGES.map(s => <label key={s.key} className="flex min-w-[128px] flex-col gap-1">
          <span className="px-1 text-[10px] font-medium text-gray-500">{s.label}处理人</span>
          <select aria-label={s.label + '处理人筛选'} className={selectClass} value={stageOwners[s.key]} onChange={e => setStageOwners(current => ({ ...current, [s.key]: e.target.value }))}>
            <option value="all">全部</option>
            {resources.filter(resource => STAGE_ROLE_PATTERN[s.key].test(resource.role || '')).map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
          </select>
        </label>)}
        <label className="flex min-w-[120px] flex-col gap-1"><span className="px-1 text-[10px] font-medium text-gray-500">环节状态</span><select aria-label="环节状态筛选" className={selectClass} value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部</option>{Object.entries(STAGE_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></label>
        <label className="flex min-w-[96px] flex-col gap-1"><span className="px-1 text-[10px] font-medium text-gray-500">优先级</span><select aria-label="优先级筛选" className={selectClass} value={priority} onChange={e => setPriority(e.target.value)}><option value="all">全部</option><option value="high">P0</option><option value="medium">P1</option><option value="low">P2</option></select></label>
        {hasFilters && <button onClick={clearFilters} className="h-9 px-2 text-xs text-indigo-300 hover:text-white">清除筛选</button>}
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-gray-500"><span>显示 <strong className="text-gray-200">{filtered.length}</strong> / {rows.length} 个需求</span><span>已完成 = 父需求进入测试阶段，或交互、视觉、还原、动效全部完成 · — 表示未建任务</span></div>
    <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
      <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0 text-left text-xs">
        <colgroup><col style={{ width: '21%' }} /><col style={{ width: '9%' }} /><col style={{ width: '6%' }} />{STAGES.map(s => <col key={s.key} style={{ width: '14%' }} />)}<col style={{ width: '8%' }} /></colgroup>
        <thead className="sticky top-0 z-20"><tr className="text-gray-400">
          <th className="sticky left-0 z-30 border-y border-gray-800 bg-[#171b25] px-4 py-3 font-medium">UIStory</th>
          <th className="border-y border-l border-gray-800 bg-[#171b25] px-3 py-3 text-center align-middle text-sm font-semibold text-gray-200">模块分类</th>
          <th className="border-y border-gray-800 bg-[#171b25] px-2 py-3 text-center align-middle text-sm font-semibold text-gray-200">优先级</th>
          {STAGES.map((s, index) => <th key={s.key} className="border-y border-l border-gray-800 bg-[#171b25] px-3 py-3 font-medium"><span className="mr-2 text-[10px] text-indigo-400">0{index + 1}</span><span className="text-gray-200">{s.label}</span><div className="mt-1 text-[10px] font-normal text-gray-500">负责人 / 状态</div></th>)}
          <th className="border-y border-l border-gray-800 bg-[#171b25] px-3 py-3 text-center align-middle text-sm font-semibold text-gray-200"><button onClick={() => setDescending(!descending)} className="flex w-full items-center justify-center gap-1" aria-label={descending ? '截止日期降序，点击升序' : '截止日期升序，点击降序'}>截止日期<ArrowUpDown size={13} /></button></th>
        </tr></thead>
        <tbody>{filtered.map(({ root, stages }) => { const rootDone = isUiStoryOverallComplete(root) || isDemandComplete(stages); const rootCancelled = taskStatus(root) === 'cancelled'; return <tr key={root.id} className={'group ' + (rootCancelled ? 'bg-red-500/[0.07]' : rootDone ? 'bg-emerald-500/[0.055]' : '')}>
          <td className={'sticky left-0 z-10 border-b border-gray-800 px-4 py-3 ' + (rootCancelled ? 'bg-[#28171c] group-hover:bg-[#341b22]' : rootDone ? 'bg-[#10231d] group-hover:bg-[#153027]' : 'bg-[#11151d] group-hover:bg-[#191e2b]')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5"><span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">UIStory · 父需求</span>{rootCancelled && <span className="rounded border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">父需求已拒绝</span>}</div>
              {root.externalUrl && <a href={root.externalUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-white">打开 TAPD<ExternalLink size={10} /></a>}
            </div>
            {root.externalUrl ? <a href={root.externalUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="line-clamp-2 text-left text-[13px] font-medium leading-5 text-gray-200 hover:text-indigo-300 hover:underline" title={`${root.title} · 点击前往 TAPD`}>{root.title}</a> : <button onClick={() => openTaskModal(root.id)} className="line-clamp-2 text-left text-[13px] font-medium leading-5 text-gray-200 hover:text-indigo-300" title={root.title}>{root.title}</button>}
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-500">{root.tapdId && <span>#{root.tapdId}</span>}<button onClick={() => openTaskModal(root.id)} className="text-gray-400 hover:text-white">本地详情</button></div>
          </td>
          <td className="border-b border-l border-gray-800 px-3 py-5 text-center align-middle text-sm font-semibold text-blue-300">{root.module || '未分类'}</td>
          <td className="border-b border-gray-800 px-2 py-3 text-center align-middle"><span className={`inline-flex min-w-9 justify-center rounded px-2.5 py-1 text-xs font-semibold ${root.priority === 'high' ? 'bg-red-500/10 text-red-300' : root.priority === 'medium' ? 'bg-amber-500/10 text-amber-300' : 'bg-gray-800 text-gray-400'}`}>{getPriorityLabel(root.priority)}</span></td>
          {STAGES.map(s => {
            const items = stages[s.key];
            const summary = stageStatus(items);
            const firstTapdTask = items.find(item => item.externalUrl);
            const openStage = () => {
              if (items.length === 1 && firstTapdTask?.externalUrl) {
                window.open(firstTapdTask.externalUrl, '_blank', 'noopener,noreferrer');
                return;
              }
              setDetail({ rootId: root.id!, stage: s.key });
            };
            return <td key={s.key} className="border-b border-l border-gray-800/80 px-2 py-2 align-top group-hover:bg-white/[0.015]">
              {items.length ? <div className={'overflow-hidden rounded-lg border ' + STAGE_CARD_STYLE[summary]}>
                <button aria-label={root.title + ' · ' + s.label + '：' + STAGE_STATUS[summary].label} onClick={openStage} className="w-full p-2 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-indigo-400">
                  <div className="mb-2 flex items-center justify-between gap-2"><span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">UI · 子需求 {items.length}</span><span className="whitespace-nowrap text-[11px] font-semibold text-gray-300">{taskRangeLabel(items)}</span></div>
                  <div className={'mb-2 truncate text-xs ' + (items.some(t => !t.assigneeIds?.length) ? 'text-amber-200/80' : 'text-gray-300')} title={names(items)}>{names(items)}</div>
                  <div className="flex flex-wrap items-center gap-1"><StatusBadge status={summary} />{items.length > 1 && <span className="text-[10px] text-gray-500">{items.filter(t => t.status === 'done').length}/{items.length}</span>}</div>
                </button>
                {firstTapdTask?.externalUrl && <a href={firstTapdTask.externalUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="flex items-center justify-center gap-1 border-t border-white/[0.06] px-2 py-1.5 text-[10px] text-indigo-300 hover:bg-indigo-500/10 hover:text-white">{items.length > 1 ? '打开首个 TAPD' : '打开 TAPD'}<ExternalLink size={10} /></a>}
              </div> : <div className="rounded-lg border border-gray-800/50 bg-gray-900/20 px-2 py-2"><div className="mb-2 text-gray-600">—</div><span className="text-[10px] text-gray-600">未建任务</span></div>}
            </td>;
          })}
          <td className="border-b border-l border-gray-800 px-3 py-5 text-center align-middle text-base font-semibold text-gray-200">{dateLabel(root.endDate)}</td>
        </tr>; })}</tbody>
      </table>
      {!filtered.length && <div className="py-20 text-center"><p className="text-sm text-gray-400">{tasks === undefined ? '正在加载需求…' : hasFilters ? '没有符合条件的需求' : '暂无需求，创建或导入 TAPD 任务后即可查看环节状态'}</p>{hasFilters && <button onClick={clearFilters} className="mt-3 text-sm text-indigo-300">清除筛选</button>}</div>}
    </div>
    {detail && detailRow && <div className="absolute inset-0 z-40 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
      <section role="dialog" aria-modal="true" aria-label="环节子任务" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setDetail(null); }} className="flex h-full w-full max-w-md flex-col border-l border-gray-700 bg-[#151923] shadow-2xl">
        <div className="border-b border-gray-800 p-5"><div className="flex items-center justify-between"><h3 className="font-semibold text-gray-100">{STAGES.find(s => s.key === detail.stage)?.label} · {detailTasks.length} 个子任务</h3><button autoFocus aria-label="关闭环节详情" onClick={() => setDetail(null)} className="rounded p-1 text-gray-400 hover:bg-gray-700"><X size={18} /></button></div><p className="mt-2 text-xs leading-5 text-gray-500">{detailRow.root.title}</p></div>
        <div className="flex-1 space-y-3 overflow-auto p-5">{detailTasks.map(task => <div key={task.id} className="rounded-xl border border-gray-700/70 bg-[#11151d] p-4"><div className="mb-3 flex items-start justify-between gap-3"><h4 className="text-sm leading-5 text-gray-200">{task.title}</h4><StatusBadge status={taskStatus(task)} /></div><p className="text-xs text-gray-400">负责人：{names([task])}</p><p className="mt-2 text-xs text-gray-500">{dateLabel(task.startDate)} → {dateLabel(task.endDate)}</p>{taskStatus(task) === 'blocked' && <p className="mt-3 rounded bg-red-500/10 p-2 text-xs text-red-300">{task.blockReason || '任务已标记阻塞，尚未填写原因'}</p>}<div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={() => { setDetail(null); openTaskModal(task.id); }} className="flex items-center gap-1 text-xs text-indigo-300 hover:text-white">查看 / 编辑任务<ChevronRight size={13} /></button>{task.externalUrl && <a href={task.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-sky-300 hover:text-white">打开 TAPD<ExternalLink size={12} /></a>}</div></div>)}</div>
      </section>
    </div>}
  </div>;
}
