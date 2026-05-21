import React from 'react';
import { format } from 'date-fns';
import { Users, X, Clock, Flag, CheckCircle2 } from 'lucide-react';
import type { Task, Resource } from '../../types';
import { getEffectiveStatus } from '../../types/resource';
import { Avatar } from '../common/Avatar';
import { getTaskTypeColor } from './constants';

interface MemberSummaryItem {
  resource: Resource;
  tasks: Task[];
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  total: number;
}

interface Props {
  memberSummary: MemberSummaryItem[];
  onClose: () => void;
  onOpenTask: (taskId?: number) => void;
}

export const GanttMemberPanel = React.memo(function GanttMemberPanel({
  memberSummary, onClose, onOpenTask
}: Props) {
  return (
    <div className="w-80 border-l border-gray-800/60 bg-[#0f1119] shrink-0 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Users size={15} className="text-indigo-400" />
          成员任务概览
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {memberSummary.map(({ resource, tasks: memberTasks, todo, inProgress, done, overdue, total }) => (
          <div key={resource.id} className="bg-[#161825] rounded-lg border border-gray-800/50 p-3 hover:border-gray-700/60 transition-colors">
            {/* Member header */}
            <div className="flex items-center gap-2.5 mb-2.5">
              <Avatar
                name={resource.name}
                size="md"
                type={((resource as any).type as 'internal' | 'cp') || 'internal'}
                avatar={resource.avatar}
                avatarStyle={(resource as any)?.avatarStyle}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-gray-200 truncate">{resource.name}</div>
                  {getEffectiveStatus(resource) === 'leave' && (
                    <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border text-purple-300 bg-purple-500/15 border-purple-500/25" title="休假中">
                      📅 休假
                    </span>
                  )}
                  {getEffectiveStatus(resource) === 'sick' && (
                    <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border text-orange-300 bg-orange-500/15 border-orange-500/25" title="身体欠佳">
                      🤒 欠佳
                    </span>
                  )}
                  {getEffectiveStatus(resource) === 'wfh' && (
                    <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border text-blue-300 bg-blue-500/15 border-blue-500/25" title="居家办公">
                      🏠 居家
                    </span>
                  )}
                  {getEffectiveStatus(resource) === 'focus' && (
                    <span className="shrink-0 px-1.5 py-[1px] rounded-md text-[9px] font-semibold leading-tight border text-red-300 bg-red-500/15 border-red-500/25" title="专注模式">
                      🔥 专注
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">{resource.role} · {total}个任务</div>
              </div>
            </div>
            
            {/* Stats bar */}
            <div className="flex gap-1.5 mb-2.5">
              {done > 0 && <div className="h-1.5 rounded-full bg-emerald-500" style={{ flex: done }} />}
              {inProgress > 0 && <div className="h-1.5 rounded-full bg-indigo-500" style={{ flex: inProgress }} />}
              {todo > 0 && <div className="h-1.5 rounded-full bg-gray-600" style={{ flex: todo }} />}
              {total === 0 && <div className="h-1.5 rounded-full bg-gray-800 flex-1" />}
            </div>

            {/* Stats numbers */}
            <div className="flex items-center gap-3 text-[10px]">
              {done > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 size={10} />{done}
                </span>
              )}
              {inProgress > 0 && (
                <span className="flex items-center gap-1 text-indigo-400">
                  <Clock size={10} />{inProgress}
                </span>
              )}
              {todo > 0 && (
                <span className="flex items-center gap-1 text-gray-500">
                  <Flag size={10} />{todo}
                </span>
              )}
              {overdue > 0 && (
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  ⚠ {overdue}逾期
                </span>
              )}
            </div>

            {/* Task list */}
            {memberTasks.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-gray-800/50 space-y-1">
                {memberTasks.slice(0, 5).map(t => {
                  const tTypeColor = getTaskTypeColor(t.title);
                  return (
                    <div 
                      key={t.id} 
                      className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-800/50 cursor-pointer transition-colors group/task"
                      onClick={() => onOpenTask(t.id)}
                    >
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: tTypeColor.color }} />
                      <span className="text-[11px] text-gray-400 truncate group-hover/task:text-gray-200 transition-colors">{t.title}</span>
                      <span className="text-[9px] text-gray-600 shrink-0 ml-auto">{t.endDate ? format(t.endDate, 'MM/dd') : '未排期'}</span>
                    </div>
                  );
                })}
                {memberTasks.length > 5 && (
                  <div className="text-[10px] text-gray-600 text-center py-1">
                    还有 {memberTasks.length - 5} 个任务...
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {memberSummary.length === 0 && (
          <div className="text-center text-gray-600 text-sm py-8">暂无成员数据</div>
        )}
      </div>
    </div>
  );
});
