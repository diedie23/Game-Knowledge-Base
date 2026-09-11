import React from 'react';
import { format, differenceInDays } from 'date-fns';
import { Clock, Flag, Users, User, Building2 } from 'lucide-react';
import type { Task, Resource } from '../../types';
import { Avatar } from '../common/Avatar';
import { getTaskTypeColor, getStatusConfig, getRoleOrderIndex } from './constants';

// --- Avatar Group ---

interface AvatarGroupProps {
  assigneeIds?: number[];
  resources?: Resource[];
}

export const AvatarGroup = React.memo(function AvatarGroup({ assigneeIds, resources }: AvatarGroupProps) {
  if (!assigneeIds || assigneeIds.length === 0) return null;
  const assignedResources = assigneeIds.map(id => resources?.find(r => r.id === id)).filter(Boolean);
  // Sort by role order (UX→UI→Layout→…)
  assignedResources.sort((a, b) => getRoleOrderIndex(a?.role || '') - getRoleOrderIndex(b?.role || ''));
  const maxDisplay = 2;
  const displayResources = assignedResources.slice(0, maxDisplay);
  const remainingCount = assignedResources.length - maxDisplay;

  return (
    <div className="flex -space-x-1.5 overflow-visible ml-2 shrink-0">
      {displayResources.map((r, idx) => (
        <div key={r?.id} style={{ zIndex: assignedResources.length - idx }} className="relative">
          <Avatar
            name={r?.name || '?'}
            size="xs"
            type={((r as any).type as 'internal' | 'cp') || 'internal'}
            avatar={r?.avatar}
            avatarStyle={(r as any)?.avatarStyle}
            tooltip={r ? `${r.name}${r.role ? ' · ' + r.role : ''}` : undefined}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="inline-flex h-6 w-6 rounded-lg ring-1 ring-white/10 bg-gray-700 items-center justify-center text-[9px] font-bold text-gray-300" style={{ zIndex: 0 }}>
          +{remainingCount}
        </div>
      )}
    </div>
  );
});

// --- Task Tooltip ---

interface TaskTooltipProps {
  task: Task;
  displayStartDate: Date;
  displayEndDate: Date;
  resources?: Resource[];
}

export const TaskTooltip = React.memo(function TaskTooltip({ task, displayStartDate, displayEndDate, resources }: TaskTooltipProps) {
  const assignedNames = task.assigneeIds?.map(id => resources?.find(r => r.id === id)?.name).filter(Boolean) || [];
  const config = getStatusConfig(task.status);
  const typeColor = task.parentId ? getTaskTypeColor(task.title) : null;

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl px-3 py-2 min-w-[180px] text-left">
        <div className="text-xs font-semibold text-white mb-1.5 truncate max-w-[200px] flex items-center gap-1.5">
          {typeColor && <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: typeColor.color }} />}
          {task.title}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Clock size={10} />
            <span>{format(displayStartDate, 'MM/dd')} - {format(displayEndDate, 'MM/dd')}</span>
            <span className="text-gray-600">({differenceInDays(displayEndDate, displayStartDate) + 1}天)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Flag size={10} />
            <span>{config.label}</span>
            {typeColor && <span className="text-gray-600">� {typeColor.label}</span>}
          </div>
          {assignedNames.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <Users size={10} />
              <span>{assignedNames.join('、')}</span>
            </div>
          )}
          {task.workCategory && (
            <div className="flex items-center gap-1.5 text-[10px]">
              {task.workCategory === 'cp_follow' ? (
                <><Building2 size={10} className="text-cyan-400" /><span className="text-cyan-400">CP跟进</span></>
              ) : (
                <><User size={10} className="text-indigo-400" /><span className="text-indigo-400">自制内容</span></>
              )}
            </div>
          )}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700" />
      </div>
    </div>
  );
});
