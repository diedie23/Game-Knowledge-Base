import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ExternalLink, Flag, GitBranch, ShieldAlert, Split, UserRound } from 'lucide-react';
import type { ProjectCalendarConfig, Resource, ResourceCapacity, RiskRecord, RiskTrackingStatus, Task } from '../types';
import { db } from '../db/db';
import { buildDemandRiskGroups } from '../services/tapdPlanningAssistant';
import { executeRiskAction, getRiskActionPlanForTags, type RiskActionType } from '../services/riskActionService';
import { useStore } from '../store/useStore';
import { getTaskIdentity } from '../utils/tapdIdentity';

interface Props {
  tasks: Task[];
  resources: Resource[];
  projectId?: number;
  calendarConfig?: ProjectCalendarConfig;
  capacities: ResourceCapacity[];
  riskRecords: RiskRecord[];
}

const LEVEL_STYLE = {
  critical: { label: '严重', border: 'border-red-500/35', badge: 'bg-red-500/15 text-red-300 border-red-500/25' },
  high: { label: '高风险', border: 'border-orange-500/30', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
  medium: { label: '关注', border: 'border-amber-500/25', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  low: { label: '提醒', border: 'border-yellow-500/20', badge: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20' },
} as const;

const RISK_STATUS_LABEL: Record<RiskTrackingStatus, string> = {
  new: '新建',
  confirmed: '已确认',
  handling: '处理中',
  verifying: '待验证',
  closed: '已关闭',
  accepted: '已接受',
};

const demandRiskId = (task: Task) => `demand:${getTaskIdentity(task)}`;

const ACTION_ICON: Record<RiskActionType, React.ReactNode> = {
  delay: <CalendarClock size={11} />,
  reassign: <UserRound size={11} />,
  split: <Split size={11} />,
  reprioritize: <Flag size={11} />,
  move_downstream: <ArrowRight size={11} />,
  confirm_blocker: <CircleHelp size={11} />,
};

export function DashboardDemandRisks({ tasks, resources, projectId, calendarConfig, capacities, riskRecords }: Props) {
  const { openTaskModal } = useStore();
  const [filter, setFilter] = useState<'all' | 'escalate' | 'checkpoint' | 'unowned'>('all');
  const [page, setPage] = useState(1);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [reassignIds, setReassignIds] = useState<Record<number, string>>({});
  const pageSize = 8;
  const recordByRiskId = useMemo(() => new Map(riskRecords.map(record => [record.riskId, record])), [riskRecords]);
  const allGroups = useMemo(() => buildDemandRiskGroups(tasks, resources, new Date(), calendarConfig), [tasks, resources, calendarConfig]);
  const filteredGroups = useMemo(() => allGroups.filter(group => {
    if (filter === 'escalate') return group.escalation === 'escalate';
    if (filter === 'checkpoint') return group.checkpoints.length > 0;
    if (filter === 'unowned') return !recordByRiskId.get(demandRiskId(group.demand))?.ownerId && group.ownerNames.length === 0;
    return true;
  }), [allGroups, filter, recordByRiskId]);
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  React.useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount]);
  React.useEffect(() => setPage(1), [filter]);
  const groups = filteredGroups.slice((page - 1) * pageSize, page * pageSize);
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
  const updateRiskRecord = async (demand: Task, severity: RiskRecord['severity'], changes: Partial<RiskRecord>) => {
    const riskId = demandRiskId(demand);
    const current = recordByRiskId.get(riskId);
    const now = Date.now();
    const nextStatus = changes.status || current?.status || 'new';
    await db.riskRecords.put({
      ownerId: current?.ownerId,
      action: current?.action || '',
      dueDate: current?.dueDate,
      firstDetectedAt: current?.firstDetectedAt || now,
      ...current,
      ...changes,
      riskId,
      projectId: demand.projectId,
      sourceIdentity: getTaskIdentity(demand),
      sourceTaskId: demand.id,
      severity,
      status: nextStatus,
      updatedAt: now,
      closedAt: nextStatus === 'closed' || nextStatus === 'accepted' ? current?.closedAt || now : undefined,
    });
  };

  const runRiskAction = async (
    demand: Task,
    task: Task,
    severity: RiskRecord['severity'],
    action: RiskActionType,
  ) => {
    const actionKey = `${demandRiskId(demand)}:${task.id || task.title}:${action}`;
    setExecutingAction(actionKey);
    setActionMessage('');
    try {
      const result = await executeRiskAction({
        action,
        task,
        tasks,
        resources,
        capacities,
        calendarConfig,
        resourceId: task.id ? Number(reassignIds[task.id] || 0) || undefined : undefined,
      });
      await updateRiskRecord(demand, severity, {
        status: result.applied ? 'handling' : 'confirmed',
        action: `${action === 'confirm_blocker' ? '确认卡点' : action === 'delay' ? '顺延' : action === 'reassign' ? '改派' : action === 'split' ? '拆分' : action === 'reprioritize' ? '降低优先级' : '推动后置阶段'}：${result.message}`,
      });
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(`风险动作执行失败：${error instanceof Error ? error.message : '请稍后重试'}`);
    } finally {
      setExecutingAction(null);
    }
  };

  if (!allGroups.length) return null;

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
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          {[
            { key: 'all' as const, label: '全部', value: allGroups.length },
            { key: 'escalate' as const, label: '升级处理', value: allGroups.filter(group => group.escalation === 'escalate').length },
            { key: 'checkpoint' as const, label: '跨管线卡点', value: allGroups.filter(group => group.checkpoints.length > 0).length },
            { key: 'unowned' as const, label: '责任人待明确', value: allGroups.filter(group => !recordByRiskId.get(demandRiskId(group.demand))?.ownerId && group.ownerNames.length === 0).length },
          ].map(item => <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`rounded-md border px-2 py-1 transition-colors ${filter === item.key ? 'border-orange-500/35 bg-orange-500/15 text-orange-200' : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'}`}>{item.label} {item.value}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {groups.map(group => {
          const key = demandRiskId(group.demand);
          const record = recordByRiskId.get(key);
          const trackedOwner = record?.ownerId ? resources.find(resource => resource.id === record.ownerId)?.name : undefined;
          const riskStatus = record?.status || 'new';
          const isExpanded = expanded.has(key);
          const style = LEVEL_STYLE[group.level];
          const children = [
            ...group.items.map(item => ({ task: item.task, label: item.actionLabel, detail: item.reasons.slice(0, 2).join('；'), tags: item.tags })),
            ...group.checkpoints.map(item => ({ task: item.task, label: item.label, detail: item.task.blockReason || '跨管线环节尚未完成', tags: ['blocked' as const] })),
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
                    {group.escalation === 'escalate' && <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">升级处理</span>}
                    {group.escalation === 'watch' && <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">持续关注</span>}
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>{style.label}</span>
                    <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">UIStory</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${riskStatus === 'closed' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : riskStatus === 'handling' || riskStatus === 'verifying' ? 'border-blue-500/25 bg-blue-500/10 text-blue-300' : 'border-gray-700 bg-gray-800 text-gray-300'}`}>{RISK_STATUS_LABEL[riskStatus]}</span>
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
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                    <span>风险责任人：<span className={trackedOwner || group.ownerNames.length ? 'text-gray-300' : 'text-orange-300'}>{trackedOwner || group.ownerNames.join('、') || '待明确'}</span></span>
                    <span>最近截止：<span className="text-gray-300">{group.nearestDeadline ? `${String(group.nearestDeadline.getMonth() + 1).padStart(2, '0')}/${String(group.nearestDeadline.getDate()).padStart(2, '0')}` : '未设置'}</span></span>
                    {group.maxOverdueDays > 0 && <span className="text-red-300">最长逾期 {group.maxOverdueDays} 天</span>}
                    {group.staleDays !== undefined && group.staleDays >= 3 && <span className="text-amber-300">{group.staleDays} 天未更新</span>}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-800 bg-gray-950/30 px-4 py-3">
                  <div className="mb-3 rounded-lg border border-gray-800 bg-gray-900/70 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white"><CheckCircle2 size={13} className="text-emerald-400" />本地风险处置</div>
                    <div className="grid gap-2 md:grid-cols-[120px_150px_140px_1fr]">
                      <select value={riskStatus} onChange={event => updateRiskRecord(group.demand, group.level, { status: event.target.value as RiskTrackingStatus })} className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500">
                        {Object.entries(RISK_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <select value={record?.ownerId || ''} onChange={event => updateRiskRecord(group.demand, group.level, { ownerId: event.target.value ? Number(event.target.value) : undefined })} className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500">
                        <option value="">选择风险责任人</option>
                        {resources.filter(resource => resource.id && resource.status !== 'departed').map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                      </select>
                      <input type="date" value={record?.dueDate || ''} onChange={event => updateRiskRecord(group.demand, group.level, { dueDate: event.target.value || undefined })} className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500" aria-label="风险目标日期" />
                      <input value={record?.action || ''} onChange={event => updateRiskRecord(group.demand, group.level, { action: event.target.value })} placeholder="填写处置动作，例如：调整负责人并确认交付日" className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500" />
                    </div>
                    <p className="mt-2 text-[10px] text-gray-500">处置信息仅保存在本地，不会回写 TAPD；执行排期动作后会立即重新计算风险。</p>
                  </div>
                  {actionMessage && <div className="mb-3 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-3 py-2 text-[11px] text-indigo-200">{actionMessage}</div>}
                  <div className="space-y-2">
                    {children.map(({ task, label, detail, tags }) => {
                      const actions = getRiskActionPlanForTags(task, tags);
                      return (
                        <div key={`${task.id || task.tapdId}-${label}`} className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 hover:border-blue-500/30 hover:bg-blue-500/5">
                          <div className="flex items-start gap-2">
                            <GitBranch size={13} className="mt-0.5 shrink-0 text-gray-500" />
                            <button type="button" onClick={() => openTask(task)} className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-xs text-gray-200">{task.title}</span>
                              <span className="mt-0.5 block text-[11px] text-gray-500">{label} · {detail}</span>
                            </button>
                            <ExternalLink size={12} className="mt-0.5 shrink-0 text-gray-600" />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-800/80 pt-2">
                            {actions.map(action => {
                              const actionKey = `${key}:${task.id || task.title}:${action.type}`;
                              const isRunning = executingAction === actionKey;
                              return (
                                <React.Fragment key={action.type}>
                                  {action.type === 'reassign' && <select
                                    value={task.id ? (reassignIds[task.id] || '') : ''}
                                    onChange={event => task.id && setReassignIds(current => ({ ...current, [task.id!]: event.target.value }))}
                                    onClick={event => event.stopPropagation()}
                                    className="max-w-28 rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[10px] text-gray-300 outline-none"
                                    aria-label="选择改派成员"
                                  >
                                    <option value="">改派成员</option>
                                    {resources.filter(resource => resource.id && resource.status !== 'departed').map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                                  </select>}
                                  <button
                                    type="button"
                                    disabled={isRunning || (action.type === 'reassign' && !task.id)}
                                    onClick={() => runRiskAction(group.demand, task, group.level, action.type)}
                                    title={action.reason}
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${action.priority === 'primary' ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20' : 'border-gray-700 bg-gray-950/60 text-gray-400 hover:text-gray-200'}`}
                                  >
                                    {ACTION_ICON[action.type]}{isRunning ? '执行中' : action.label}
                                  </button>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {filteredGroups.length > pageSize && (
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5"><AlertTriangle size={12} />完整风险队列共 {filteredGroups.length} 个需求</span>
          <div className="flex items-center gap-2">
            <span>第 {page}/{pageCount} 页</span>
            <button disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} className="rounded border border-gray-700 p-1 text-gray-300 hover:border-gray-500 disabled:opacity-30" aria-label="上一页"><ChevronLeft size={12} /></button>
            <button disabled={page >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className="rounded border border-gray-700 p-1 text-gray-300 hover:border-gray-500 disabled:opacity-30" aria-label="下一页"><ChevronRight size={12} /></button>
          </div>
        </div>
      )}
      {groups.length === 0 && <div className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-xs text-gray-500">当前筛选条件下没有风险需求</div>}
    </section>
  );
}
