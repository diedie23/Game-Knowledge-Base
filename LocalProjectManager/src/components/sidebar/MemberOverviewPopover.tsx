import React from 'react';
import { X, Calendar, Clock, Flag, AlertTriangle, ListTodo, CircleDot, CircleCheck, CirclePause } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Avatar } from '../common/Avatar';
import { useStore } from '../../store/useStore';
import type { MemberOverviewData } from './hooks/useMemberStats';

interface MemberOverviewPopoverProps {
  overview: MemberOverviewData;
  position: { top: number } | null;
  collapsed: boolean;
  overviewRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onFilterMember: (memberId: number) => void;
}

export const MemberOverviewPopover = React.memo(function MemberOverviewPopover({
  overview,
  position,
  collapsed,
  overviewRef,
  onClose,
  onFilterMember,
}: MemberOverviewPopoverProps) {
  const today = new Date();

  return (
    <div
      ref={overviewRef}
      className="fixed z-[9999] bg-gradient-to-b from-[#1c1f33]/95 to-[#171a2c]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-white/[0.04] w-[340px] overflow-hidden animate-in fade-in slide-in-from-left-2"
      style={{
        left: `${collapsed ? 64 + 8 : 288 + 8}px`,
        top: position ? `${Math.min(position.top, window.innerHeight - 520)}px` : '120px',
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#1a1d30] to-[#1e2138] border-b border-gray-700/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar
            name={overview.resource.name}
            size="md"
            type={(overview.resource.type as 'internal' | 'cp') || 'internal'}
            avatar={overview.resource.avatar}
            avatarStyle={overview.resource.avatarStyle}
            role={overview.resource.role}
          />
          <div>
            <div className="text-sm font-bold text-gray-100 tracking-wide">{overview.resource.name}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{overview.resource.role}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-700/60 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-4 gap-2.5">
          <div className="bg-[#12142080] backdrop-blur-sm rounded-xl p-2.5 text-center border border-gray-700/30 hover:border-gray-600/50 hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center justify-center mb-1.5">
              <ListTodo size={13} className="text-gray-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-gray-100">{overview.total}</div>
            <div className="text-[9px] text-gray-500 mt-1 font-medium">总任务</div>
          </div>
          <div className="bg-blue-500/8 backdrop-blur-sm rounded-xl p-2.5 text-center border border-blue-500/15 hover:border-blue-500/30 hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center justify-center mb-1.5">
              <CircleDot size={13} className="text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-blue-400">{overview.inProgress.length}</div>
            <div className="text-[9px] text-blue-400/60 mt-1 font-medium">进行中</div>
          </div>
          <div className="bg-[#12142080] backdrop-blur-sm rounded-xl p-2.5 text-center border border-gray-700/30 hover:border-gray-600/50 hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center justify-center mb-1.5">
              <CirclePause size={13} className="text-gray-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-gray-300">{overview.todo.length}</div>
            <div className="text-[9px] text-gray-500 mt-1 font-medium">未开始</div>
          </div>
          <div className="bg-emerald-500/8 backdrop-blur-sm rounded-xl p-2.5 text-center border border-emerald-500/15 hover:border-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center justify-center mb-1.5">
              <CircleCheck size={13} className="text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-400">{overview.done.length}</div>
            <div className="text-[9px] text-emerald-400/60 mt-1 font-medium">已完成</div>
          </div>
        </div>

        {/* Progress bar */}
        {overview.total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-gray-500 font-medium">完成进度</span>
              <span className="text-[10px] text-gray-400 font-bold font-mono tabular-nums">
                {Math.round((overview.done.length / overview.total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${(overview.done.length / overview.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Overdue warning */}
      {overview.overdue.length > 0 && (
        <div className="mx-5 mb-3 px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 rounded-xl flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle size={12} className="text-red-400" />
          </div>
          <span className="text-[11px] text-red-300 font-medium">
            {overview.overdue.length} 个任务已逾期
          </span>
        </div>
      )}

      {/* Free days */}
      <div className="px-5 py-3 border-t border-gray-700/30">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <Calendar size={11} className="text-emerald-400" />
          </div>
          <span className="text-[11px] font-semibold text-gray-300">未来两周空档日期</span>
        </div>
        {overview.freeDays.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {overview.freeDays.slice(0, 10).map(day => (
              <span
                key={day.toISOString()}
                className="px-2.5 py-1 bg-emerald-500/8 text-emerald-300 text-[10px] rounded-lg border border-emerald-500/15 font-medium hover:bg-emerald-500/15 transition-colors"
              >
                {format(day, 'M/d E', { locale: zhCN })}
              </span>
            ))}
            {overview.freeDays.length > 10 && (
              <span className="px-2 py-1 text-[10px] text-gray-500 font-medium">
                +{overview.freeDays.length - 10}天
              </span>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-amber-300/80 bg-amber-500/8 px-3 py-2 rounded-lg border border-amber-500/15 flex items-center gap-2">
            <Clock size={11} className="text-amber-400 shrink-0" />
            未来两周工作日均已排满
          </div>
        )}
      </div>

      {/* Active task list (in_progress + todo) */}
      <div className="px-5 py-3 border-t border-gray-700/30 max-h-52 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-md bg-gray-700/50 flex items-center justify-center">
            <Flag size={11} className="text-gray-400" />
          </div>
          <span className="text-[11px] font-semibold text-gray-300">当前手上的任务</span>
          <span className="text-[9px] text-gray-600 ml-auto">{overview.inProgress.length + overview.todo.length} 项</span>
        </div>
        {overview.inProgress.length > 0 && (
          <div className="mb-2">
            <div className="text-[9px] font-semibold text-blue-400/70 uppercase tracking-wider mb-1 px-1">进行中 ({overview.inProgress.length})</div>
            <div className="space-y-0.5">
              {overview.inProgress.map(t => {
                const isOverdue = t.endDate && new Date(t.endDate) < today;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg hover:bg-gray-800/60 cursor-pointer transition-colors group/task"
                    onClick={() => {
                      useStore.getState().openTaskModal(t.id);
                      onClose();
                    }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0 bg-blue-400 animate-pulse" />
                    <span className="text-[11px] truncate group-hover/task:text-gray-200 transition-colors flex-1 min-w-0 text-gray-300">
                      {t.title}
                    </span>
                    <span className={`text-[9px] shrink-0 font-medium font-mono tabular-nums ${isOverdue ? 'text-red-400' : 'text-gray-600'}`}>
                      {t.endDate ? format(new Date(t.endDate), 'MM/dd') : '未排期'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {overview.todo.length > 0 && (
          <div className="mb-2">
            <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1 px-1">待开始 ({overview.todo.length})</div>
            <div className="space-y-0.5">
              {overview.todo.map(t => (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg hover:bg-gray-800/60 cursor-pointer transition-colors group/task"
                  onClick={() => {
                    useStore.getState().openTaskModal(t.id);
                    onClose();
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0 bg-gray-500" />
                  <span className="text-[11px] truncate group-hover/task:text-gray-200 transition-colors flex-1 min-w-0 text-gray-400">
                    {t.title}
                  </span>
                  <span className="text-[9px] shrink-0 font-medium font-mono tabular-nums text-gray-600">
                    {t.startDate ? format(new Date(t.startDate), 'MM/dd') : '未排期'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {overview.inProgress.length === 0 && overview.todo.length === 0 && (
          <div className="text-[11px] text-gray-600 text-center py-4 bg-gray-800/20 rounded-lg">暂无进行中或待开始的任务</div>
        )}
        {overview.done.length > 0 && (
          <div className="mt-1">
            <div className="text-[9px] font-semibold text-emerald-500/60 uppercase tracking-wider mb-1 px-1">已完成 ({overview.done.length})</div>
            <div className="space-y-0.5">
              {overview.done.slice(0, 3).map(t => (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-gray-800/60 cursor-pointer transition-colors group/task opacity-60"
                  onClick={() => {
                    useStore.getState().openTaskModal(t.id);
                    onClose();
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-400" />
                  <span className="text-[11px] truncate group-hover/task:text-gray-200 transition-colors flex-1 min-w-0 text-gray-500 line-through">
                    {t.title}
                  </span>
                </div>
              ))}
              {overview.done.length > 3 && (
                <span className="text-[9px] text-gray-600 px-2.5">+{overview.done.length - 3} 项</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer action */}
      <div className="px-5 py-3 border-t border-gray-700/30 bg-[#161825]/80 backdrop-blur-sm">
        <button
          onClick={() => onFilterMember(overview.resource.id!)}
          className="w-full text-center text-[11px] text-indigo-400 hover:text-indigo-300 py-2 rounded-lg hover:bg-indigo-500/10 transition-all duration-200 font-semibold tracking-wide hover:-translate-y-0.5"
        >
          在甘特图中筛选此成员的任务 →
        </button>
      </div>
    </div>
  );
});
