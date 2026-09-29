import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, ClipboardCopy, ExternalLink, FileText, History, Save } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import type { Resource, Task } from '../types';
import { buildWeeklyUxReport, formatWeeklyUxReport } from '../services/weeklyReportService';
import { db } from '../db/db';

interface Props {
  tasks: Task[];
  resources: Resource[];
  projectId?: number;
}

export function DashboardWeeklyReport({ tasks, resources, projectId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const report = useMemo(() => buildWeeklyUxReport(tasks, resources), [tasks, resources]);
  const reportText = useMemo(() => formatWeeklyUxReport(report), [report]);
  const weekKey = format(report.weekStart, 'yyyy-MM-dd');
  const snapshots = useLiveQuery(
    () => db.changeSnapshots.filter(snapshot => snapshot.kind === 'weekly-report' && (!projectId || snapshot.projectId === projectId)).reverse().sortBy('date'),
    [projectId],
  ) || [];
  const previousSnapshot = snapshots.find(snapshot => snapshot.weekKey !== weekKey);
  const previousRiskKeys = useMemo(() => new Set(previousSnapshot?.reportData?.riskKeys || []), [previousSnapshot]);
  const currentRiskKeys = useMemo(() => new Set(report.riskActions.map(item => item.key)), [report.riskActions]);
  const newRiskCount = report.riskActions.filter(item => !previousRiskKeys.has(item.key)).length;
  const resolvedRiskCount = [...previousRiskKeys].filter(key => !currentRiskKeys.has(key)).length;
  const openTask = (task: Task) => task.externalUrl && window.open(task.externalUrl, '_blank', 'noopener,noreferrer');
  const copy = async () => {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const saveSnapshot = async () => {
    const highRiskCount = report.risks.filter(group => group.level === 'critical' || group.level === 'high').length;
    await db.changeSnapshots.put({
      id: `weekly-report:${projectId || 'all'}:${weekKey}`,
      date: Date.now(),
      reason: `UX 管线周报 ${format(report.weekStart, 'MM/dd')} - ${format(report.weekEnd, 'MM/dd')}`,
      description: reportText,
      kind: 'weekly-report',
      projectId,
      weekKey,
      reportData: {
        completed: report.completed.length,
        inProgress: report.inProgress.length,
        nextWeek: report.nextWeek.length,
        riskCount: report.risks.length,
        highRiskCount,
        capacityRiskCount: report.capacityRisks.length,
        dataQualityScore: report.dataQuality.score,
        dataQualityCriticalCount: report.dataQuality.criticalCount,
        riskKeys: report.riskActions.map(item => item.key),
        text: reportText,
      },
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };
  const copySnapshot = async (text?: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const stats = [
    { label: '本周完成', value: report.completed.length, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
    { label: '进行中', value: report.inProgress.length, tone: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
    { label: '下周计划', value: report.nextWeek.length, tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
    { label: '风险需求', value: report.risks.length, tone: 'text-orange-300 bg-orange-500/10 border-orange-500/20' },
    { label: '数据质量', value: `${report.dataQuality.score}分`, tone: report.dataQuality.criticalCount ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-700/50 bg-gray-900/35 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white"><FileText size={18} className="text-violet-400" />UX 管线周报</h3>
          <p className="mt-1 text-xs text-gray-500">自动汇总当前数据，可复制到周会或项目群，并通过 TAPD 链接核查。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={saveSnapshot} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20">
            {saved ? <Check size={14} /> : <Save size={14} />}{saved ? '已保存' : '保存本周快照'}
          </button>
          <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/20">
            {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}{copied ? '已复制' : '复制周报'}
          </button>
          <button type="button" onClick={() => setExpanded(value => !value)} className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300 hover:text-white">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? '收起明细' : '查看明细'}
          </button>
          <button type="button" onClick={() => setShowHistory(value => !value)} className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300 hover:text-white">
            <History size={14} />历史 {snapshots.length}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-gray-800 px-5 py-4 md:grid-cols-5">
        {stats.map(stat => <div key={stat.label} className={`rounded-lg border px-3 py-2 ${stat.tone}`}><div className="text-lg font-semibold">{stat.value}</div><div className="text-[11px] opacity-80">{stat.label}</div></div>)}
      </div>
      {previousSnapshot?.reportData && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-800 bg-gray-950/20 px-5 py-2.5 text-[11px] text-gray-500">
          <span>较上次周报</span>
          <span className={report.completed.length - previousSnapshot.reportData.completed >= 0 ? 'text-emerald-300' : 'text-orange-300'}>完成 {report.completed.length - previousSnapshot.reportData.completed >= 0 ? '+' : ''}{report.completed.length - previousSnapshot.reportData.completed}</span>
          <span className={report.risks.length - previousSnapshot.reportData.riskCount <= 0 ? 'text-emerald-300' : 'text-red-300'}>风险 {report.risks.length - previousSnapshot.reportData.riskCount >= 0 ? '+' : ''}{report.risks.length - previousSnapshot.reportData.riskCount}</span>
          <span className={report.risks.filter(group => group.level === 'critical' || group.level === 'high').length - previousSnapshot.reportData.highRiskCount <= 0 ? 'text-emerald-300' : 'text-red-300'}>高风险 {report.risks.filter(group => group.level === 'critical' || group.level === 'high').length - previousSnapshot.reportData.highRiskCount >= 0 ? '+' : ''}{report.risks.filter(group => group.level === 'critical' || group.level === 'high').length - previousSnapshot.reportData.highRiskCount}</span>
          <span className={report.capacityRisks.length - (previousSnapshot.reportData.capacityRiskCount || 0) <= 0 ? 'text-emerald-300' : 'text-red-300'}>容量预警 {report.capacityRisks.length - (previousSnapshot.reportData.capacityRiskCount || 0) >= 0 ? '+' : ''}{report.capacityRisks.length - (previousSnapshot.reportData.capacityRiskCount || 0)}</span>
          <span className={newRiskCount ? 'text-red-300' : 'text-emerald-300'}>新增风险 {newRiskCount}</span>
          <span className="text-emerald-300">已解除 {resolvedRiskCount}</span>
          {previousSnapshot.reportData.dataQualityScore !== undefined && <span className={report.dataQuality.score - previousSnapshot.reportData.dataQualityScore >= 0 ? 'text-emerald-300' : 'text-red-300'}>数据质量 {report.dataQuality.score - previousSnapshot.reportData.dataQualityScore >= 0 ? '+' : ''}{report.dataQuality.score - previousSnapshot.reportData.dataQualityScore}</span>}
        </div>
      )}
      {showHistory && (
        <div className="border-t border-gray-800 bg-gray-950/30 p-5">
          <h4 className="mb-3 text-xs font-semibold text-gray-300">历史周报快照</h4>
          <div className="grid gap-2 lg:grid-cols-2">
            {snapshots.map(snapshot => (
              <div key={snapshot.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-gray-200">{snapshot.reason}</div>
                  <div className="mt-1 flex gap-3 text-[10px] text-gray-500"><span>保存于 {format(snapshot.date, 'MM/dd HH:mm')}</span>{snapshot.reportData && <><span>完成 {snapshot.reportData.completed}</span><span>风险 {snapshot.reportData.riskCount}</span></>}</div>
                </div>
                <button type="button" onClick={() => copySnapshot(snapshot.reportData?.text || snapshot.description)} className="shrink-0 rounded-md border border-gray-700 px-2 py-1 text-[10px] text-violet-300 hover:bg-violet-500/10">复制</button>
              </div>
            ))}
            {!snapshots.length && <div className="rounded-lg border border-dashed border-gray-800 px-3 py-6 text-center text-xs text-gray-600">尚未保存周报快照</div>}
          </div>
        </div>
      )}
      {expanded && (
        <div className="grid gap-4 border-t border-gray-800 bg-gray-950/25 p-5 xl:grid-cols-4">
          {[
            { title: '本周完成', tasks: report.completed },
            { title: '下周计划', tasks: report.nextWeek },
          ].map(section => (
            <div key={section.title}>
              <h4 className="mb-2 text-xs font-semibold text-gray-300">{section.title}</h4>
              <div className="space-y-1.5">
                {section.tasks.slice(0, 6).map(task => (
                  <button key={task.id || task.tapdId} type="button" onClick={() => openTask(task)} className="flex w-full items-center gap-1.5 rounded-md bg-gray-900/70 px-2.5 py-2 text-left text-xs text-gray-300 hover:text-blue-300">
                    <span className="truncate">{task.title}</span>{task.externalUrl && <ExternalLink size={11} className="ml-auto shrink-0" />}
                  </button>
                ))}
                {!section.tasks.length && <div className="rounded-md border border-dashed border-gray-800 px-3 py-4 text-center text-xs text-gray-600">暂无内容</div>}
              </div>
            </div>
          ))}
          <div>
            <h4 className="mb-2 text-xs font-semibold text-gray-300">风险与卡点</h4>
            <div className="space-y-1.5">
              {report.riskActions.map(item => (
                <button key={item.key} type="button" onClick={() => openTask(item.demand)} className="w-full rounded-md bg-gray-900/70 px-2.5 py-2 text-left hover:bg-orange-500/5">
                  <span className="flex items-center gap-1.5 text-xs text-gray-300"><span className="truncate">{item.demand.title}</span>{!previousRiskKeys.has(item.key) && <span className="shrink-0 rounded bg-red-500/15 px-1 py-0.5 text-[9px] text-red-300">新增</span>}</span>
                  <span className="mt-1 block text-[11px] text-orange-300/80">{item.action}</span>
                  <span className="mt-0.5 block text-[10px] text-gray-500">责任人：{item.ownerNames.join('、') || '待明确'} · 目标 {format(item.targetDate, 'MM/dd')}</span>
                </button>
              ))}
              {report.capacityRisks.map(item => (
                <button key={item.stage} type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-full rounded-md border border-amber-500/10 bg-amber-500/[0.04] px-2.5 py-2 text-left">
                  <span className="block text-xs text-amber-200">{item.label}岗位容量{item.status === 'danger' ? '不足' : '接近饱和'}</span>
                  <span className="mt-0.5 block text-[11px] text-gray-500">预计占用 {item.projectedUtilization > 900 ? '无可用容量' : `${item.projectedUtilization}%`} · 待排 {item.pendingHours}h</span>
                </button>
              ))}
              {!report.riskActions.length && !report.capacityRisks.length && <div className="rounded-md border border-dashed border-gray-800 px-3 py-4 text-center text-xs text-gray-600">暂无显著风险</div>}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-gray-300">数据质量</h4>
            <div className="space-y-1.5">
              {report.dataQuality.issues.slice(0, 8).map((issue, index) => (
                <button key={`${issue.type}-${issue.task?.id || index}`} type="button" onClick={() => issue.task && openTask(issue.task)} className={`w-full rounded-md border px-2.5 py-2 text-left ${issue.severity === 'critical' ? 'border-red-500/15 bg-red-500/[0.05]' : 'border-amber-500/10 bg-amber-500/[0.04]'}`}>
                  <span className={`block text-xs ${issue.severity === 'critical' ? 'text-red-200' : 'text-amber-200'}`}>{issue.title}</span>
                  <span className="mt-0.5 block text-[11px] text-gray-500">{issue.detail}</span>
                </button>
              ))}
              {!report.dataQuality.issues.length && <div className="rounded-md border border-dashed border-emerald-500/20 px-3 py-4 text-center text-xs text-emerald-400">当前数据检查通过</div>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
