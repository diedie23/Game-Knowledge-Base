import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, ExternalLink, RefreshCw } from 'lucide-react';
import type { Resource, Task } from '../types';
import { auditTaskDataQuality } from '../services/dataQualityService';
import { useStore } from '../store/useStore';

interface Props { tasks: Task[]; resources: Resource[] }

export function DashboardDataQuality({ tasks, resources }: Props) {
  const { openTapdModal, openTaskModal } = useStore();
  const [expanded, setExpanded] = useState(false);
  const audit = useMemo(() => auditTaskDataQuality(tasks, resources), [tasks, resources]);
  const visible = expanded ? audit.issues : audit.issues.slice(0, 4);
  const healthy = audit.issues.length === 0;
  const openTask = (task?: Task) => {
    if (!task) return openTapdModal();
    if (task.externalUrl) window.open(task.externalUrl, '_blank', 'noopener,noreferrer');
    else openTaskModal(task.id);
  };

  return <section className={`rounded-2xl border p-5 shadow-lg ${healthy ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : audit.criticalCount ? 'border-red-500/25 bg-red-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.04]'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-base font-semibold text-white"><Database size={18} className={healthy ? 'text-emerald-400' : 'text-amber-400'} />排期数据质量</h3><p className="mt-1 text-xs text-gray-500">排期建议前先检查 TAPD 类型、层级、日期、处理人映射和同步时效。</p></div>
      <div className="flex items-center gap-2"><span className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${audit.score >= 90 ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : audit.score >= 70 ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>{audit.score} 分</span><button type="button" onClick={openTapdModal} className="flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/20"><RefreshCw size={13} />打开同步中心</button></div>
    </div>
    {healthy ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-3 text-sm text-emerald-300"><CheckCircle2 size={16} />当前未发现影响排期的数据问题</div> : <>
      <div className="mt-4 flex gap-2 text-xs"><span className="rounded-md bg-red-500/10 px-2 py-1 text-red-300">严重 {audit.criticalCount}</span><span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300">提醒 {audit.warningCount}</span><span className="rounded-md bg-gray-900/50 px-2 py-1 text-gray-400">合计 {audit.issues.length}</span></div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">{visible.map((issue, index) => <button key={`${issue.type}-${issue.task?.id || index}`} type="button" onClick={() => openTask(issue.task)} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left ${issue.severity === 'critical' ? 'border-red-500/20 bg-red-500/[0.05]' : 'border-amber-500/15 bg-gray-950/25'}`}><AlertTriangle size={14} className={`mt-0.5 shrink-0 ${issue.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} /><span className="min-w-0 flex-1"><span className="block text-xs font-medium text-gray-200">{issue.title}</span><span className="mt-0.5 block truncate text-[11px] text-gray-500">{issue.task?.title ? `${issue.task.title} · ` : ''}{issue.detail}</span></span>{issue.task && <ExternalLink size={11} className="mt-0.5 shrink-0 text-gray-600" />}</button>)}</div>
      {audit.issues.length > 4 && <button type="button" onClick={() => setExpanded(value => !value)} className="mt-3 text-xs text-indigo-300 hover:text-white">{expanded ? '收起问题' : `查看全部 ${audit.issues.length} 项`}</button>}
    </>}
  </section>;
}
