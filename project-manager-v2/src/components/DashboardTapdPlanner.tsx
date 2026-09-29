import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarClock, Check, Copy, ExternalLink, LocateFixed, RefreshCw, ShieldAlert, UserRoundX, X } from 'lucide-react';
import type { Resource, Task } from '../types';
import { buildTapdPlanningItems, buildTapdScheduleSuggestion, formatTapdAdjustmentChecklist, latestTapdSyncAt } from '../services/tapdPlanningAssistant';
import { updateTask } from '../services/taskService';
import { useStore } from '../store/useStore';
import { getPriorityLabel } from '../utils/priority';

interface Props {
  tasks: Task[];
  resources: Resource[];
}

type QueueFilter = 'all' | 'severe' | 'unscheduled' | 'blocked' | 'unassigned';

const formatDate = (date?: Date) => date ? `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}` : '未排期';

const LEVEL_STYLE = {
  critical: { label: '严重', card: 'border-red-500/30 bg-red-500/[0.07]', badge: 'border-red-500/30 bg-red-500/15 text-red-300' },
  high: { label: '高风险', card: 'border-orange-500/30 bg-orange-500/[0.06]', badge: 'border-orange-500/30 bg-orange-500/15 text-orange-300' },
  medium: { label: '关注', card: 'border-amber-500/20 bg-amber-500/[0.04]', badge: 'border-amber-500/25 bg-amber-500/10 text-amber-300' },
  low: { label: '提醒', card: 'border-yellow-500/20 bg-yellow-500/[0.03]', badge: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300' },
} as const;

function syncFreshness(timestamp: number | null) {
  if (!timestamp) return { label: '尚无同步记录', tone: 'text-gray-400 bg-gray-800 border-gray-700' };
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 10) return { label: '刚刚同步', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
  if (minutes < 60) return { label: `${minutes} 分钟前同步`, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
  const hours = Math.floor(minutes / 60);
  if (hours < 6) return { label: `${hours} 小时前同步`, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' };
  return { label: `${hours} 小时前同步，建议刷新`, tone: 'text-red-300 bg-red-500/10 border-red-500/20' };
}

export function DashboardTapdPlanner({ tasks, resources }: Props) {
  const { setCurrentView, setHighlightedTaskIds, openTapdModal, openTaskModal } = useStore();
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showChecklist, setShowChecklist] = useState(false);
  const [copied, setCopied] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [appliedMessage, setAppliedMessage] = useState('');
  const [applyError, setApplyError] = useState(false);
  const allItems = useMemo(() => buildTapdPlanningItems(tasks, resources), [tasks, resources]);
  const planningItems = useMemo(() => allItems.filter(item => item.tags.includes('unscheduled')), [allItems]);
  const filteredItems = useMemo(() => planningItems.filter(item => {
    if (filter === 'severe') return item.level === 'critical' || item.level === 'high';
    if (filter === 'unscheduled') return item.tags.includes('unscheduled');
    if (filter === 'blocked') return item.tags.includes('blocked') || item.tags.includes('dependency');
    if (filter === 'unassigned') return item.tags.includes('unassigned');
    return true;
  }), [planningItems, filter]);
  const items = useMemo(() => filteredItems.slice(0, 8).map(item => ({
    ...item,
    suggestion: buildTapdScheduleSuggestion(item.task, item.tags, tasks, resources, new Date()),
  })), [filteredItems, tasks, resources]);
  const latestSyncAt = useMemo(() => latestTapdSyncAt(tasks), [tasks]);
  const freshness = syncFreshness(latestSyncAt);
  const counts = useMemo(() => ({
    severe: planningItems.filter(item => item.level === 'critical' || item.level === 'high').length,
    unscheduled: planningItems.length,
    blocked: planningItems.filter(item => item.tags.includes('blocked') || item.tags.includes('dependency')).length,
    unassigned: planningItems.filter(item => item.tags.includes('unassigned')).length,
  }), [planningItems]);
  const resourceById = useMemo(() => new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource])), [resources]);

  const locateInGantt = (task: Task) => {
    if (task.id) setHighlightedTaskIds([task.id]);
    setCurrentView('gantt');
  };
  const enterRiskGantt = () => {
    setHighlightedTaskIds(items.map(item => item.task.id).filter((id): id is number => !!id));
    setCurrentView('gantt');
  };
  const selectedItems = useMemo(() => planningItems
    .filter(item => item.task.id && selectedIds.has(item.task.id))
    .map(item => ({ ...item, suggestion: buildTapdScheduleSuggestion(item.task, item.tags, tasks, resources, new Date()) })), [planningItems, selectedIds, tasks, resources]);
  const checklist = useMemo(() => formatTapdAdjustmentChecklist(selectedItems, resources), [selectedItems, resources]);
  const toggleSelection = (taskId?: number) => {
    if (!taskId) return;
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };
  const selectVisible = () => setSelectedIds(current => new Set([...current, ...items.map(item => item.task.id).filter((id): id is number => !!id)]));
  const copyChecklist = async () => {
    await navigator.clipboard.writeText(checklist);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const applySuggestedDates = async (item: typeof items[number]) => {
    if (!item.task.id || !item.suggestion) return;
    setApplyingId(item.task.id);
    setApplyError(false);
    try {
      await updateTask(item.task.id, {
        startDate: item.suggestion.startDate,
        endDate: item.suggestion.endDate,
      }, '应用 TAPD 排期助手建议日期');
      setAppliedMessage(`已将「${item.task.title}」的建议日期加入本地待同步，请在 TAPD 同步中心确认推送。`);
    } catch (error) {
      setApplyError(true);
      setAppliedMessage(`应用建议失败：${error instanceof Error ? error.message : '请稍后重试'}`);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] via-gray-900/60 to-gray-900/80 p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={19} className="text-indigo-300" />
            <h2 className="text-base font-bold text-white">TAPD 排期助手</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${freshness.tone}`}>{freshness.label}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">聚焦缺少开始或结束日期的任务，按同工种人员负载生成 TAPD 排期建议。</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={enterRiskGantt} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300 hover:border-indigo-500/40 hover:text-white">
            <CalendarClock size={14} />进入甘特预排
          </button>
          <button onClick={openTapdModal} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 hover:text-white">
            <RefreshCw size={14} />打开 TAPD 同步中心
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { filter: 'severe' as const, label: '待排期高风险', value: counts.severe, icon: AlertCircle, color: 'text-red-300' },
          { filter: 'unscheduled' as const, label: '待排期任务', value: counts.unscheduled, icon: CalendarClock, color: 'text-purple-300' },
          { filter: 'blocked' as const, label: '待排期且有卡点', value: counts.blocked, icon: ShieldAlert, color: 'text-amber-300' },
          { filter: 'unassigned' as const, label: '待排期未匹配人员', value: counts.unassigned, icon: UserRoundX, color: 'text-sky-300' },
        ].map(summary => <button key={summary.label} onClick={() => setFilter(filter === summary.filter ? 'all' : summary.filter)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${filter === summary.filter ? 'border-indigo-500/50 bg-indigo-500/15' : 'border-gray-700/60 bg-gray-950/30 hover:border-gray-600'}`}><summary.icon size={14} className={summary.color} /><span className="text-lg font-bold text-white">{summary.value}</span><span className="text-[11px] text-gray-500">{summary.label}</span></button>)}
      </div>

      {appliedMessage && <div className={`mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${applyError ? 'border-red-500/20 bg-red-500/[0.07] text-red-300' : 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300'}`}><span>{appliedMessage}</span>{!applyError && <button onClick={openTapdModal} className="shrink-0 font-medium text-sky-300 hover:text-white">前往同步中心</button>}</div>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {items.length > 0 && <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-gray-500"><div className="flex items-center gap-2"><span>待排期任务清单</span>{filter !== 'all' && <button onClick={() => setFilter('all')} className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-300 hover:text-white">清除筛选</button>}<button onClick={selectVisible} className="hover:text-white">选择当前 {items.length} 项</button>{selectedIds.size > 0 && <button onClick={() => setSelectedIds(new Set())} className="hover:text-white">清空选择</button>}</div><div className="flex items-center gap-3"><span>显示前 {items.length} 项，共 {filteredItems.length} 项</span><button disabled={selectedItems.length === 0} onClick={() => setShowChecklist(true)} className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 font-medium text-indigo-300 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40">生成排期清单（{selectedItems.length}）</button></div></div>}
        {items.length === 0 && <div className="col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-5 text-center text-sm text-emerald-300">当前没有缺少开始或结束日期的 TAPD 任务</div>}
        {items.map(item => {
          const style = LEVEL_STYLE[item.level];
          const suggestion = item.suggestion!;
          const assignees = (item.task.assigneeIds || []).map(id => resourceById.get(id)?.name).filter(Boolean).join('、') || '未匹配处理人';
          const isSelected = !!item.task.id && selectedIds.has(item.task.id);
          return <article key={item.task.id} className={`rounded-xl border p-3 ${isSelected ? 'ring-1 ring-indigo-400/60' : ''} ${style.card}`}>
            <div className="flex items-start gap-2">
              <button onClick={() => toggleSelection(item.task.id)} className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-gray-600 bg-gray-900/60 text-transparent hover:border-indigo-400'}`} aria-label={isSelected ? '取消选择' : '选择任务'}><Check size={11} /></button>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${style.badge}`}>{style.label}</span>
                  <span className="rounded border border-gray-700 bg-gray-800/70 px-1.5 py-0.5 text-[9px] text-gray-300">{getPriorityLabel(item.task.priority)}</span>
                  <span className="text-[10px] text-gray-500">{assignees}</span>
                </div>
                <button onClick={() => openTaskModal(item.task.id)} title={item.task.title} className="line-clamp-1 text-left text-xs font-medium text-gray-200 hover:text-white">{item.task.title}</button>
                <p className="mt-1 line-clamp-1 text-[10px] text-gray-400">{item.reasons.slice(0, 2).join('；')}</p>
                <div className="mt-2 grid grid-cols-[36px_1fr] gap-x-2 gap-y-1 rounded-lg border border-white/[0.06] bg-black/15 px-2 py-1.5 text-[10px]">
                  <span className="text-gray-500">当前</span><span className="truncate text-gray-400">{assignees} · {formatDate(item.task.startDate)}–{formatDate(item.task.endDate)} · 当期 {suggestion.currentConflictCount} 项任务</span>
                  <span className="font-medium text-indigo-300">建议</span><span className="flex min-w-0 items-center gap-1 text-indigo-200"><span className="truncate">{suggestion.resource?.name || '待人工指定'} · {formatDate(suggestion.startDate)}–{formatDate(suggestion.endDate)} · 当期 {suggestion.suggestedConflictCount} 项任务</span><ArrowRight size={10} className="shrink-0" /></span>
                  <span className="text-gray-500">依据</span><span className="truncate text-gray-500" title={suggestion.reasons.join('；')}>{suggestion.reasons.join('；')}</span>
                </div>
              </div>
              <span className="shrink-0 rounded bg-white/[0.05] px-2 py-1 text-[10px] font-medium text-gray-300">{item.actionLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-end gap-3 border-t border-white/[0.05] pt-2">
              <button onClick={() => locateInGantt(item.task)} className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-300"><LocateFixed size={11} />甘特图定位</button>
              <button disabled={applyingId === item.task.id} onClick={() => applySuggestedDates(item)} className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300 hover:text-white disabled:cursor-wait disabled:opacity-50"><CalendarClock size={11} />{applyingId === item.task.id ? '正在加入...' : '应用建议日期'}</button>
              {item.task.externalUrl ? <a href={item.task.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 hover:text-white">打开 TAPD 调整<ExternalLink size={11} /></a> : <button onClick={() => openTaskModal(item.task.id)} className="text-[10px] font-medium text-sky-300 hover:text-white">查看本地详情</button>}
            </div>
          </article>;
        })}
      </div>
      {showChecklist && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => setShowChecklist(false)}><div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-[#121722] shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b border-gray-700 px-5 py-4"><div><h3 className="font-semibold text-white">TAPD 排期调整清单</h3><p className="mt-1 text-xs text-gray-500">复制后可作为本轮调整记录，按顺序进入 TAPD 修改。</p></div><button onClick={() => setShowChecklist(false)} className="rounded p-1.5 text-gray-500 hover:bg-gray-800 hover:text-white"><X size={16} /></button></div><textarea readOnly value={checklist} className="m-5 min-h-80 flex-1 resize-none rounded-xl border border-gray-700 bg-gray-950/60 p-4 font-mono text-xs leading-6 text-gray-300 outline-none" /><div className="flex items-center justify-between border-t border-gray-700 px-5 py-4"><span className="text-xs text-gray-500">已选择 {selectedItems.length} 项；不会自动回写 TAPD。</span><button onClick={copyChecklist} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制调整清单'}</button></div></div></div>}
    </section>
  );
}
