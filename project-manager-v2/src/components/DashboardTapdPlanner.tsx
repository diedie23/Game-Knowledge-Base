import React, { useMemo } from 'react';
import { AlertCircle, CalendarClock, ExternalLink, LocateFixed, RefreshCw, ShieldAlert, UserRoundX } from 'lucide-react';
import type { Resource, Task } from '../types';
import { buildTapdPlanningItems, latestTapdSyncAt } from '../services/tapdPlanningAssistant';
import { useStore } from '../store/useStore';
import { getPriorityLabel } from '../utils/priority';

interface Props {
  tasks: Task[];
  resources: Resource[];
}

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
  const allItems = useMemo(() => buildTapdPlanningItems(tasks, resources), [tasks, resources]);
  const items = allItems.slice(0, 8);
  const latestSyncAt = useMemo(() => latestTapdSyncAt(tasks), [tasks]);
  const freshness = syncFreshness(latestSyncAt);
  const counts = useMemo(() => ({
    severe: allItems.filter(item => item.level === 'critical' || item.level === 'high').length,
    unscheduled: allItems.filter(item => item.tags.includes('unscheduled')).length,
    blocked: allItems.filter(item => item.tags.includes('blocked') || item.tags.includes('dependency')).length,
    unassigned: allItems.filter(item => item.tags.includes('unassigned')).length,
  }), [allItems]);
  const resourceById = useMemo(() => new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource])), [resources]);

  const locateInGantt = (task: Task) => {
    if (task.id) setHighlightedTaskIds([task.id]);
    setCurrentView('gantt');
  };
  const enterRiskGantt = () => {
    setHighlightedTaskIds(items.map(item => item.task.id).filter((id): id is number => !!id));
    setCurrentView('gantt');
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
          <p className="mt-1 text-xs text-gray-400">本页用于识别风险和预判影响；负责人、日期与状态的最终调整以 TAPD 为准。</p>
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
          { label: '严重 / 高风险', value: counts.severe, icon: AlertCircle, color: 'text-red-300' },
          { label: '缺少排期', value: counts.unscheduled, icon: CalendarClock, color: 'text-purple-300' },
          { label: '依赖 / 卡点', value: counts.blocked, icon: ShieldAlert, color: 'text-amber-300' },
          { label: '未匹配处理人', value: counts.unassigned, icon: UserRoundX, color: 'text-sky-300' },
        ].map(summary => <div key={summary.label} className="flex items-center gap-2 rounded-lg border border-gray-700/60 bg-gray-950/30 px-3 py-2"><summary.icon size={14} className={summary.color} /><span className="text-lg font-bold text-white">{summary.value}</span><span className="text-[11px] text-gray-500">{summary.label}</span></div>)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {items.length > 0 && <div className="col-span-2 flex items-center justify-between px-1 text-[10px] text-gray-500"><span>优先处理清单</span><span>显示前 {items.length} 项，共 {allItems.length} 项</span></div>}
        {items.length === 0 && <div className="col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-5 text-center text-sm text-emerald-300">当前没有需要优先调整的 TAPD 排期项</div>}
        {items.map(item => {
          const style = LEVEL_STYLE[item.level];
          const assignees = (item.task.assigneeIds || []).map(id => resourceById.get(id)?.name).filter(Boolean).join('、') || '未匹配处理人';
          return <article key={item.task.id} className={`rounded-xl border p-3 ${style.card}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${style.badge}`}>{style.label}</span>
                  <span className="rounded border border-gray-700 bg-gray-800/70 px-1.5 py-0.5 text-[9px] text-gray-300">{getPriorityLabel(item.task.priority)}</span>
                  <span className="text-[10px] text-gray-500">{assignees}</span>
                </div>
                <button onClick={() => openTaskModal(item.task.id)} title={item.task.title} className="line-clamp-1 text-left text-xs font-medium text-gray-200 hover:text-white">{item.task.title}</button>
                <p className="mt-1 line-clamp-1 text-[10px] text-gray-400">{item.reasons.slice(0, 2).join('；')}</p>
              </div>
              <span className="shrink-0 rounded bg-white/[0.05] px-2 py-1 text-[10px] font-medium text-gray-300">{item.actionLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-end gap-3 border-t border-white/[0.05] pt-2">
              <button onClick={() => locateInGantt(item.task)} className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-300"><LocateFixed size={11} />甘特图定位</button>
              {item.task.externalUrl ? <a href={item.task.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 hover:text-white">打开 TAPD 调整<ExternalLink size={11} /></a> : <button onClick={() => openTaskModal(item.task.id)} className="text-[10px] font-medium text-sky-300 hover:text-white">查看本地详情</button>}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}
