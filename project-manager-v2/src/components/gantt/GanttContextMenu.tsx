import React from 'react';
import { Edit2, Trash2, ExternalLink, Circle, CircleDot, CheckCircle2, CalendarClock, AlignRight, Copy, GitBranch } from 'lucide-react';
import type { Task } from '../../types';

interface Props {
  x: number;
  y: number;
  task: Task | undefined;
  selectedTaskIds?: Set<number>;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  onStatusChange?: (taskId: number, status: 'todo' | 'in_progress' | 'done' | 'cancelled') => void;
  onBatchShift?: (days: number) => void;
  onBatchAlignEnd?: () => void;
  onBatchCopyMarkdown?: () => void;
  onAutoInferDeps?: (taskId: number) => void;
  hasChildren?: boolean;
}

const STATUS_OPTIONS: { value: 'todo' | 'in_progress' | 'done' | 'cancelled'; label: string; icon: React.ReactNode; activeColor: string; hoverBg: string }[] = [
  {
    value: 'todo',
    label: '待办',
    icon: <Circle size={13} />,
    activeColor: 'text-gray-400',
    hoverBg: 'hover:bg-gray-500/10',
  },
  {
    value: 'in_progress',
    label: '进行中',
    icon: <CircleDot size={13} />,
    activeColor: 'text-blue-400',
    hoverBg: 'hover:bg-blue-500/10',
  },
  {
    value: 'done',
    label: '已完成',
    icon: <CheckCircle2 size={13} />,
    activeColor: 'text-emerald-400',
    hoverBg: 'hover:bg-emerald-500/10',
  },
  {
    value: 'cancelled',
    label: '已关闭',
    icon: <Circle size={13} />,
    activeColor: 'text-red-400',
    hoverBg: 'hover:bg-red-500/10',
  },
];

export const GanttContextMenu = React.memo(function GanttContextMenu({
  x, y, task, selectedTaskIds, onEdit, onRename, onDelete, onClose, onStatusChange,
  onBatchShift, onBatchAlignEnd, onBatchCopyMarkdown, onAutoInferDeps, hasChildren
}: Props) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = React.useState({ top: y, left: x });

  React.useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 8;

    let newTop = y;
    let newLeft = x;

    // If menu overflows bottom, flip upward
    if (y + rect.height + padding > viewportHeight) {
      newTop = Math.max(padding, y - rect.height);
    }

    // If menu overflows right, shift left
    if (x + rect.width + padding > viewportWidth) {
      newLeft = Math.max(padding, viewportWidth - rect.width - padding);
    }

    setAdjustedPos({ top: newTop, left: newLeft });
  }, [x, y]);

  if (!task) return null;

  const isBatchMode = selectedTaskIds && selectedTaskIds.size > 1 && selectedTaskIds.has(task.id!);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[#1e1e2e] border border-gray-700/60 rounded-lg shadow-2xl py-1.5 min-w-[180px] backdrop-blur-sm"
      style={{ top: adjustedPos.top, left: adjustedPos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {isBatchMode ? (
        <>
          <div className="px-3.5 pt-1.5 pb-1 text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
            批量操作 ({selectedTaskIds.size} 个任务)
          </div>
          <button
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-indigo-500/10 hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => onBatchShift?.(1)}
          >
            <CalendarClock size={13} className="text-amber-500" />
            整体顺延 1 天
          </button>
          <button
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-indigo-500/10 hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => onBatchAlignEnd?.()}
          >
            <AlignRight size={13} className="text-blue-500" />
            一键对齐结束时间
          </button>
          <button
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-indigo-500/10 hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => onBatchCopyMarkdown?.()}
          >
            <Copy size={13} className="text-emerald-500" />
            复制为 Markdown (Ctrl+C)
          </button>
        </>
      ) : (
        <>
          {task.externalUrl && (
            <>
              <button
                className="w-full text-left px-3.5 py-2 text-sm text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 flex items-center gap-2.5 transition-colors"
                onClick={() => {
                  window.open(task.externalUrl, '_blank', 'noopener,noreferrer');
                  onClose();
                }}
              >
                <ExternalLink size={13} />
                打开关联链接
              </button>
              <div className="h-px bg-gray-700/50 my-1 mx-2" />
            </>
          )}

          {/* Quick status toggle section */}
          {onStatusChange && (
            <>
              <div className="px-3.5 pt-1.5 pb-1 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                快速切换状态
              </div>
              <div className="flex items-center gap-1 px-2.5 pb-1.5">
                {STATUS_OPTIONS.map(opt => {
                  const isActive = task.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                        isActive
                          ? `${opt.activeColor} bg-white/[0.06] ring-1 ring-white/10`
                          : `text-gray-500 ${opt.hoverBg} hover:text-gray-300`
                      }`}
                      onClick={() => {
                        if (!isActive) {
                          onStatusChange(task.id!, opt.value);
                        }
                        onClose();
                      }}
                      title={opt.label}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="h-px bg-gray-700/50 my-1 mx-2" />
            </>
          )}

          {/* Auto-infer pipeline dependencies (only for parent tasks with children) */}
          {hasChildren && onAutoInferDeps && (
            <>
              <button
                className="w-full text-left px-3.5 py-2 text-sm text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 flex items-center gap-2.5 transition-colors"
                onClick={() => {
                  onAutoInferDeps(task.id!);
                  onClose();
                }}
              >
                <GitBranch size={13} />
                自动推断子任务依赖
              </button>
              <div className="h-px bg-gray-700/50 my-1 mx-2" />
            </>
          )}

          <button
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-indigo-500/10 hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={onEdit}
          >
            <Edit2 size={13} className="text-gray-500" />
            编辑详情
          </button>
          <button
            className="w-full text-left px-3.5 py-2 text-sm text-gray-300 hover:bg-indigo-500/10 hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={onRename}
          >
            <Edit2 size={13} className="text-gray-500" />
            重命名
          </button>
          <div className="h-px bg-gray-700/50 my-1 mx-2" />
          <button
            className="w-full text-left px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2.5 transition-colors"
            onClick={onDelete}
          >
            <Trash2 size={13} />
            删除任务
          </button>
        </>
      )}
    </div>
  );
});
