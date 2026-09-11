import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, User, AlertTriangle, CheckCircle2, Loader2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { smartAssignService } from '../services/smartAssignService';
import type { RecommendationScore } from '../services/smartAssignService';
import { format } from 'date-fns';
import type { Task } from '../types';

interface TaskRecommendation {
  task: Task;
  recommendations: RecommendationScore[];
  loading: boolean;
}

export function AiSuggestionPanel() {
  const { isAiPanelOpen, closeAiPanel, openTaskModal, selectedProjectId } = useStore();
  const [taskRecs, setTaskRecs] = useState<TaskRecommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const tasks = useLiveQuery(
    () => selectedProjectId
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  );

  const eligibleTasks = React.useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t =>
      t.parentId &&
      t.status !== 'done' &&
      (!t.assigneeIds || t.assigneeIds.length === 0 || t.status === 'in_progress')
    ).slice(0, 20);
  }, [tasks]);

  useEffect(() => {
    if (!isAiPanelOpen || !eligibleTasks.length) return;

    let cancelled = false;
    setAnalyzing(true);
    setTaskRecs([]);

    const analyze = async () => {
      const results: TaskRecommendation[] = [];

      for (const task of eligibleTasks) {
        if (cancelled) break;
        try {
          const recs = await smartAssignService.recommend(
            task.title,
            new Date(task.startDate || new Date()),
            new Date(task.endDate || new Date())
          );
          results.push({ task, recommendations: recs.slice(0, 3), loading: false });
        } catch {
          results.push({ task, recommendations: [], loading: false });
        }
      }

      if (!cancelled) {
        setTaskRecs(results);
        setAnalyzing(false);
        if (results.length > 0 && results[0].task.id) {
          setExpandedTaskId(results[0].task.id);
        }
      }
    };

    analyze();
    return () => { cancelled = true; };
  }, [isAiPanelOpen, eligibleTasks]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 避免点击打开按钮本身时立即触发关闭
      const target = e.target as HTMLElement;
      if (target.closest('.ai-suggest-btn')) return;
      
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeAiPanel();
      }
    };
    
    // 使用 setTimeout 延迟绑定，避免在点击打开按钮的同一次事件循环中触发
    let timer: number;
    if (isAiPanelOpen) {
      timer = window.setTimeout(() => {
        document.addEventListener('mousedown', handler);
      }, 0);
    }
    
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isAiPanelOpen, closeAiPanel]);

  if (!isAiPanelOpen) return null;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-emerald-500/15 border-emerald-500/25';
    if (score >= 50) return 'bg-amber-500/15 border-amber-500/25';
    return 'bg-red-500/15 border-red-500/25';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'todo': return { text: '未开始', cls: 'text-gray-400 bg-gray-500/15' };
      case 'in_progress': return { text: '进行中', cls: 'text-blue-400 bg-blue-500/15' };
      default: return { text: status, cls: 'text-gray-400 bg-gray-500/15' };
    }
  };

  const unassignedCount = taskRecs.filter(r => !r.task.assigneeIds || r.task.assigneeIds.length === 0).length;
  const highMatchCount = taskRecs.filter(r => r.recommendations[0]?.totalScore >= 70).length;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        ref={panelRef}
        className="w-[480px] h-full bg-[#12141f]/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl shadow-black/60 ring-1 ring-white/[0.04] flex flex-col overflow-hidden"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
      >
        {/* Header */}
          <div className="px-6 py-5 border-b border-white/[0.06] bg-gradient-to-r from-[#161830]/90 to-[#1a1c30]/90 backdrop-blur-sm shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
                <Sparkles size={18} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">AI 智能建议</h3>
                <p className="text-xs text-gray-400 mt-0.5">基于技能匹配、工作负载和可用性分析</p>
              </div>
            </div>
            <button
              onClick={closeAiPanel}
              className="p-2 rounded-lg hover:bg-gray-700/60 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {!analyzing && taskRecs.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-[#1a1d30]/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/30 hover:border-gray-600/50 hover:-translate-y-0.5 transition-all duration-200">
                <div className="text-lg font-bold font-mono tabular-nums text-gray-100">{taskRecs.length}</div>
                <div className="text-[9px] text-gray-500 font-medium">分析任务</div>
              </div>
              <div className="bg-amber-500/5 backdrop-blur-sm rounded-lg px-3 py-2 border border-amber-500/15 hover:border-amber-500/30 hover:-translate-y-0.5 transition-all duration-200">
                <div className="text-lg font-bold font-mono tabular-nums text-amber-400">{unassignedCount}</div>
                <div className="text-[9px] text-amber-400/60 font-medium">待分配</div>
              </div>
              <div className="bg-emerald-500/5 backdrop-blur-sm rounded-lg px-3 py-2 border border-emerald-500/15 hover:border-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200">
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">{highMatchCount}</div>
                <div className="text-[9px] text-emerald-400/60 font-medium">高匹配</div>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {analyzing ? (
            <div className="py-3">
              {/* Skeleton header stats */}
              <div className="grid grid-cols-3 gap-2 mx-3 mb-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="relative overflow-hidden bg-[#1a1d30]/80 rounded-lg px-3 py-2 border border-gray-700/30">
                    <div className="h-5 w-10 bg-gray-700/40 rounded mb-1" />
                    <div className="h-2.5 w-14 bg-gray-700/30 rounded" />
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
                  </div>
                ))}
              </div>
              {/* Skeleton task cards */}
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="mx-3 mb-2">
                  <div className="relative overflow-hidden px-4 py-3 rounded-xl border border-gray-700/30 bg-[#161825]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-12 bg-gray-700/40 rounded" />
                      <div className="h-4 w-10 bg-gray-700/30 rounded" />
                    </div>
                    <div className="h-4 w-3/4 bg-gray-700/40 rounded mb-1.5" />
                    <div className="h-3 w-24 bg-gray-700/30 rounded" />
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" style={{ animation: `shimmer 1.5s infinite ${i * 0.15}s` }} />
                  </div>
                </div>
              ))}
              {/* Analyzing indicator */}
              <div className="flex items-center justify-center gap-2.5 mt-4 mb-2">
                <Loader2 size={14} className="text-amber-400 animate-spin" />
                <p className="text-xs text-gray-400">正在分析任务与资源匹配度…</p>
              </div>
            </div>
          ) : taskRecs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <CheckCircle2 size={40} className="text-emerald-400/50" />
              <p className="text-sm text-gray-400">所有任务已分配完毕，暂无建议</p>
            </div>
          ) : (
            <div className="py-3">
              {taskRecs.map(({ task, recommendations }) => {
                const isExpanded = expandedTaskId === task.id;
                const topRec = recommendations[0];
                const statusInfo = getStatusLabel(task.status);

                return (
                  <div key={task.id} className="mx-3 mb-2">
                    <button
                      onClick={() => setExpandedTaskId(isExpanded ? null : (task.id ?? null))}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                        isExpanded
                          ? 'bg-[#1a1d30] border-indigo-500/30'
                          : 'bg-[#161825] border-gray-700/30 hover:border-gray-600/50 hover:bg-[#1a1d30]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${statusInfo.cls}`}>
                              {statusInfo.text}
                            </span>
                            {topRec && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tabular-nums border ${getScoreBg(topRec.totalScore)}`}>
                                <span className={getScoreColor(topRec.totalScore)}>
                                  {topRec.totalScore}分
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-gray-200 font-medium truncate">{task.title}</p>
                          <p className="text-[10px] text-gray-500 font-mono tabular-nums mt-0.5">
                            {task.startDate ? format(new Date(task.startDate), 'MM/dd') : '未排期'} - {task.endDate ? format(new Date(task.endDate), 'MM/dd') : '未排期'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {topRec && !isExpanded && (
                            <span className="text-[11px] text-gray-400">
                              推荐: <span className="text-indigo-300 font-medium">{topRec.resource.name}</span>
                            </span>
                          )}
                          {isExpanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-1.5 space-y-1.5 pl-2">
                        {recommendations.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-gray-400 bg-[#161825] rounded-lg border border-gray-700/20">
                            <AlertTriangle size={13} className="inline mr-1.5 text-amber-400/60" />
                            暂无合适的推荐人选
                          </div>
                        ) : (
                          recommendations.map((rec, idx) => (
                            <div
                              key={rec.resourceId}
                              className={`px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer select-none hover:border-indigo-500/30 active:scale-[0.98] active:brightness-90 ${
                                idx === 0
                                  ? 'bg-indigo-500/5 border-indigo-500/20'
                                  : 'bg-[#161825] border-gray-700/20 hover:bg-[#1a1d30]/60'
                              }`}
                              onClick={() => {
                                if (task.id) openTaskModal(task.id);
                                closeAiPanel();
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2.5">
                                  {idx === 0 && (
                                    <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center">
                                      <Zap size={11} className="text-amber-400" />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <User size={13} className="text-gray-500" />
                                    <span className={`text-sm font-semibold ${idx === 0 ? 'text-indigo-200' : 'text-gray-300'}`}>
                                      {rec.resource.name}
                                    </span>
                                    <span className="text-[10px] text-gray-500">{rec.resource.role}</span>
                                  </div>
                                </div>
                                <span className={`text-sm font-bold font-mono tabular-nums ${getScoreColor(rec.totalScore)}`}>
                                  {rec.totalScore}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <div className="text-center">
                                  <div className="text-[10px] text-gray-400 mb-0.5">技能</div>
                                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(rec.skillScore / 40) * 100}%` }} />
                                  </div>
                                  <div className="text-[11px] text-gray-300 font-mono tabular-nums mt-0.5">{rec.skillScore}/40</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-[10px] text-gray-400 mb-0.5">负载</div>
                                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(rec.workloadScore / 30) * 100}%` }} />
                                  </div>
                                  <div className="text-[11px] text-gray-300 font-mono tabular-nums mt-0.5">{rec.workloadScore}/30</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-[10px] text-gray-400 mb-0.5">空闲</div>
                                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(rec.availabilityScore / 30) * 100}%` }} />
                                  </div>
                                  <div className="text-[11px] text-gray-300 font-mono tabular-nums mt-0.5">{rec.availabilityScore}/30</div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {rec.reasons.map((reason, i) => (
                                  <span key={i} className="text-[10px] text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/[0.06] bg-[#12141f]/80 backdrop-blur-sm shrink-0">
          <p className="text-[11px] text-gray-500 text-center">
            {'\ud83d\udca1'} 点击推荐卡片可跳转到任务详情进行分配
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.8; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
