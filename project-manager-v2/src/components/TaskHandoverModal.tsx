import React, { useState, useEffect, useMemo } from 'react';
import { db, Resource } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { X, ArrowRight, UserX, AlertTriangle, CheckCircle2, Users2 } from 'lucide-react';
import { Avatar } from './common/Avatar';
import { compareResources } from './gantt/constants';
import type { Task } from '../types';

interface TaskHandoverModalProps {
  /** The resource being departed / removed */
  departingResource: Resource;
  /** All resources for transfer target selection */
  allResources: Resource[];
  /** Callback when handover is complete or cancelled */
  onClose: () => void;
  /** Callback after handover is done (to refresh UI) */
  onComplete?: () => void;
}

export function TaskHandoverModal({ departingResource, allResources, onClose, onComplete }: TaskHandoverModalProps) {
  const [unfinishedTasks, setUnfinishedTasks] = useState<Task[]>([]);
  const [targetResourceId, setTargetResourceId] = useState<number | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferComplete, setTransferComplete] = useState(false);

  // Load unfinished tasks for the departing member
  useEffect(() => {
    const loadTasks = async () => {
      const allTasks = await db.tasks.toArray();
      const memberTasks = allTasks.filter(t =>
        t.assigneeIds?.includes(departingResource.id!) &&
        t.status !== 'done'
      );
      setUnfinishedTasks(memberTasks);
    };
    loadTasks();
  }, [departingResource.id]);

  // Available transfer targets: active members (excluding the departing one)
  const availableTargets = useMemo(() => {
    return allResources
      .filter(r => r.id !== departingResource.id && r.status !== 'departed')
      .sort(compareResources);
  }, [allResources, departingResource.id]);

  const selectedTarget = availableTargets.find(r => r.id === targetResourceId);

  const handleTransfer = async () => {
    if (!targetResourceId || unfinishedTasks.length === 0) return;
    setIsTransferring(true);

    try {
      for (const task of unfinishedTasks) {
        const currentIds = task.assigneeIds || [];
        // Replace departing member with target, keep other assignees
        const newIds = currentIds
          .filter(id => id !== departingResource.id!)
          .concat(targetResourceId);
        // Deduplicate
        const uniqueIds = [...new Set(newIds)];
        await trackedDb.tasks.update(
          task.id!,
          { assigneeIds: uniqueIds },
          `任务交接：${departingResource.name} → ${selectedTarget?.name}`
        );
      }
      setTransferComplete(true);
      setTimeout(() => {
        onComplete?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Task handover failed:', err);
      setIsTransferring(false);
    }
  };

  const handleSkip = () => {
    // Just remove the departing member from all unfinished tasks without reassigning
    const doSkip = async () => {
      for (const task of unfinishedTasks) {
        const currentIds = task.assigneeIds || [];
        const newIds = currentIds.filter(id => id !== departingResource.id!);
        await trackedDb.tasks.update(
          task.id!,
          { assigneeIds: newIds },
          `移除已离职成员「${departingResource.name}」的任务分配`
        );
      }
      onComplete?.();
      onClose();
    };
    doSkip();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[210] p-4">
      <div className="bg-[#1e1e2e]/95 backdrop-blur-xl border border-white/10 rounded-xl w-full max-w-lg shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/[0.06] bg-[#181825]/80 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <UserX size={18} className="text-amber-400" />
            任务交接
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-all duration-200 p-1.5 hover:bg-white/[0.06] rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {transferComplete ? (
            /* Success state */
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-100">交接完成</div>
                <div className="text-sm text-gray-400 mt-1">
                  已将 {unfinishedTasks.length} 个任务转交给 {selectedTarget?.name}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Departing member info */}
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/25 rounded-lg">
                <Avatar
                  name={departingResource.name}
                  size="md"
                  type={(departingResource.type as 'internal' | 'cp') || 'internal'}
                  avatar={departingResource.avatar}
                  avatarStyle={departingResource.avatarStyle}
                />
                <div>
                  <div className="text-sm font-medium text-amber-200">{departingResource.name}</div>
                  <div className="text-[11px] text-amber-400/70">{departingResource.role}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-2xl font-bold text-amber-300">{unfinishedTasks.length}</div>
                  <div className="text-[10px] text-amber-400/60 uppercase tracking-wider">未完成任务</div>
                </div>
              </div>

              {unfinishedTasks.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-sm text-gray-400">该成员没有未完成的任务，无需交接</div>
                  <button
                    onClick={onClose}
                    className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all"
                  >
                    确定
                  </button>
                </div>
              ) : (
                <>
                  {/* Task list preview */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">待交接任务</div>
                    <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1 bg-[#11111b]/60 rounded-lg p-2 border border-white/[0.04]">
                      {unfinishedTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            task.status === 'in_progress' ? 'bg-blue-400' : 'bg-gray-500'
                          }`} />
                          <span className="text-xs text-gray-300 truncate flex-1">{task.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            task.status === 'in_progress'
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-gray-700/40 text-gray-500'
                          }`}>
                            {task.status === 'in_progress' ? '进行中' : '待办'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transfer target selector */}
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      转交给
                    </div>
                    {availableTargets.length === 0 ? (
                      <div className="px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-red-300">
                          <AlertTriangle size={14} />
                          没有可用的转交目标成员
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {availableTargets.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setTargetResourceId(r.id!)}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                              targetResourceId === r.id
                                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200 ring-1 ring-indigo-500/20'
                                : 'bg-[#11111b] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300 hover:-translate-y-0.5'
                            }`}
                          >
                            <Avatar
                              name={r.name}
                              size="sm"
                              type={(r.type as 'internal' | 'cp') || 'internal'}
                              avatar={r.avatar}
                              avatarStyle={r.avatarStyle}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{r.name}</div>
                              {r.role && <div className="text-[10px] text-gray-500 truncate">{r.role}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Transfer preview */}
                  {targetResourceId && selectedTarget && (
                    <div className="flex items-center justify-center gap-3 px-4 py-3 bg-indigo-500/5 border border-indigo-500/15 rounded-lg">
                      <div className="text-center">
                        <Avatar name={departingResource.name} size="sm" type={(departingResource.type as 'internal' | 'cp') || 'internal'} avatar={departingResource.avatar} avatarStyle={departingResource.avatarStyle} />
                        <div className="text-[10px] text-gray-500 mt-1">{departingResource.name}</div>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <ArrowRight size={16} className="text-indigo-400" />
                        <span className="text-[10px] text-indigo-400 font-medium">{unfinishedTasks.length} 个任务</span>
                      </div>
                      <div className="text-center">
                        <Avatar name={selectedTarget.name} size="sm" type={(selectedTarget.type as 'internal' | 'cp') || 'internal'} avatar={selectedTarget.avatar} avatarStyle={selectedTarget.avatarStyle} />
                        <div className="text-[10px] text-gray-500 mt-1">{selectedTarget.name}</div>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex justify-between items-center pt-4 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded-lg transition-all"
                      title="不交接，直接移除该成员在所有未完成任务上的分配"
                    >
                      跳过交接（仅移除分配）
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-lg transition-all"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={!targetResourceId || isTransferring}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isTransferring ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            交接中...
                          </>
                        ) : (
                          <>
                            <Users2 size={14} />
                            确认交接
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
