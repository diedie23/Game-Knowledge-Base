import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, GitBranch, ShieldAlert } from 'lucide-react';
import type { Resource, Task } from '../types';
import { buildDemandRiskGroups } from '../services/tapdPlanningAssistant';
import { useStore } from '../store/useStore';

interface Props {
  tasks: Task[];
  resources: Resource[];
}

const LEVEL_STYLE = {
  critical: { label: '严重', border: 'border-red-500/35', badge: 'bg-red-500/15 text-red-300 border-red-500/25' },
  high: { label: '高风险', border: 'border-orange-500/30', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
  medium: { label: '关注', border: 'border-amber-500/25', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  low: { label: '提醒', border: 'border-yellow-500/20', badge: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20' },
} as const;

export function DashboardDemandRisks({ tasks, resources }: Props) {
  const { openTaskModal } = useStore();
  const groups = useMemo(() => buildDemandRiskGroups(tasks, resources).slice(0, 8), [tasks, resources]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const openTask = (task: Task) => {
    if (task.externalUrl) window.open(task.externalUrl, '_blank', 'noopener,noreferrer');
    else openTaskModal(task.id);
  };
  const toggle = (key: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (!groups.length) return null;

  return (
    <section className="rounded-2xl border border-gray-700/50 bg-gray-900/35 p-5 shadow-lg">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <ShieldAlert size={18} className="text-orange-400" />
            需求风险总览
          </h3>
          <p className="mt-1 text-xs text-gray-500">按 UIStory 汇总 UX 子任务与跨管线卡点，先处理影响面最大的父需求。</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="rounded-md border border-gray-700 bg-gray-900/50 px-2 py-1">{groups.length} 个需求需关注</span>
          <span className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-300">
            {groups.filter(group => group.level === 'critical' || group.level === 'high').length} 个高风险
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {groups.map(group => {
          const key = group.demand.tapdId || String(group.demand.id || group.demand.title);
          const isExpanded = expanded.has(key);
          const style = LEVEL_STYLE[group.level];
          const children = [
            ...group.items.map(item => ({ task: item.task, label: item.actionLabel, detail: item.reasons.slice(0, 2).join('；') })),
            ...group.checkpoints.map(item => ({ task: item.task, label: item.label, detail: item.task.blockReason || '跨管线环节尚未完成' })),
          ];
          return (
            <article key={key} className={`overflow-hidden rounded-xl border bg-gray-900/50 ${style.border}`}>
              <div className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="mt-0.5 rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                  aria-label={isExpanded ? '收起风险明细' : '展开风险明细'}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>{style.label}</span>
                    <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">UIStory</span>
                    <span className="text-[11px] text-gray-500">{children.length} 个风险项</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTask(group.demand)}
                    className="mt-2 flex max-w-full items-center gap-1.5 text-left text-sm font-medium text-gray-100 hover:text-blue-300"
                    title="打开父需求"
                  >
                    <span className="truncate">{group.demand.title}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.summaryReasons.map(reason => (
                      <span key={reason} className="rounded-md bg-gray-800 px-2 py-1 text-[11px] text-gray-300">{reason}</span>
                    ))}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-800 bg-gray-950/30 px-4 py-3">
                  <div className="space-y-2">
                    {children.map(({ task, label, detail }) => (
                      <button
                        key={`${task.id || task.tapdId}-${label}`}
                        type="button"
                        onClick={() => openTask(task)}
                        className="group flex w-full items-start gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-left hover:border-blue-500/30 hover:bg-blue-500/5"
                      >
                        <GitBranch size={13} className="mt-0.5 shrink-0 text-gray-500 group-hover:text-blue-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-gray-200">{task.title}</span>
                          <span className="mt-0.5 block text-[11px] text-gray-500">{label} · {detail}</span>
                        </span>
                        <ExternalLink size={12} className="mt-0.5 shrink-0 text-gray-600 group-hover:text-blue-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {groups.length === 8 && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
          <AlertTriangle size={12} /> 当前展示优先级最高的 8 个需求
        </div>
      )}
    </section>
  );
}
