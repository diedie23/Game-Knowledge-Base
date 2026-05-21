import React from 'react';
import { differenceInDays, isWeekend, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronsLeft, ChevronsRight, CheckSquare, ArrowRight, AlignEndHorizontal, Copy, Trash2, X, Settings2, GitMerge, MousePointerClick } from 'lucide-react';
import { isHoliday } from './constants';
import type { ZoomConfig } from './constants';

interface GanttTimelineProps {
  days: Date[];
  dayWidth: number;
  effectiveLpWidth: number;
  today: Date;
  zoomConfig: ZoomConfig;
  monthGroups: { month: string; count: number }[];
  leftPanelCollapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  onLpResizeStart: (e: React.MouseEvent) => void;
  isResizing?: boolean;
  // Batch operation props
  selectedCount?: number;
  onBatchShift?: (days: number) => void;
  onBatchAlignEnd?: () => void;
  onBatchCopyMarkdown?: () => void;
  onBatchDelete?: () => void;
  onClearSelection?: () => void;
  onBatchManage?: () => void;
  onAutoInferDeps?: () => void;
  // Multi-select mode
  multiSelectMode?: boolean;
  onToggleMultiSelect?: () => void;
}

export const GanttTimeline = React.memo(function GanttTimeline({
  days,
  dayWidth,
  effectiveLpWidth,
  today,
  zoomConfig,
  monthGroups,
  leftPanelCollapsed,
  onToggleCollapse,
  onLpResizeStart,
  isResizing = false,
  selectedCount = 0,
  onBatchShift,
  onBatchAlignEnd,
  onBatchCopyMarkdown,
  onBatchDelete,
  onClearSelection,
  onBatchManage,
  onAutoInferDeps,
  multiSelectMode = false,
  onToggleMultiSelect,
}: GanttTimelineProps) {
  return (
    <>
      {/* Header wrapper — sticky positioning handled by parent container in GanttChart */}
      <div>
      {/* Month row */}
      <div className="flex border-b border-gray-700/50 bg-[#1a1d2e]">
        <div className="shrink-0 border-r-2 border-gray-700/80 sticky left-0 z-30 bg-[#1a1d2e]"
          style={{ width: `${effectiveLpWidth}px`, boxShadow: '6px 0 16px rgba(0,0,0,0.5)' }}
        />
        <div className="flex w-full">
          {monthGroups.map((group, idx) => (
            <div
              key={idx}
              className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider py-2 text-center border-r border-gray-700/40 last:border-r-0"
              style={{ width: `${group.count * dayWidth}px` }}
            >
              {group.month}
            </div>
          ))}
        </div>
      </div>

      {/* Day header */}
      <div className="flex border-b-2 border-indigo-500/20 bg-[#161825] backdrop-blur-md" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <div className="shrink-0 font-bold text-gray-300 px-4 py-3 border-r-2 border-gray-700/80 flex items-center justify-between text-sm tracking-wide sticky left-0 z-30 bg-[#161825] relative"
          style={{ width: `${effectiveLpWidth}px`, boxShadow: '6px 0 16px rgba(0,0,0,0.5)' }}
        >
          {/* Resize handle — right edge */}
          {!leftPanelCollapsed && (
            <div
              className={`absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-40 group/resize transition-colors ${
                isResizing ? 'bg-indigo-500/60' : 'hover:bg-indigo-500/40'
              }`}
              onMouseDown={onLpResizeStart}
              title="拖拽调整面板宽度"
            >
              {/* Visual dots indicator */}
              <div className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex flex-col gap-[3px] transition-opacity ${
                isResizing ? 'opacity-100' : 'opacity-0 group-hover/resize:opacity-100'
              }`}>
                <div className="w-[3px] h-[3px] rounded-full bg-indigo-400" />
                <div className="w-[3px] h-[3px] rounded-full bg-indigo-400" />
                <div className="w-[3px] h-[3px] rounded-full bg-indigo-400" />
              </div>
            </div>
          )}
          {leftPanelCollapsed ? (
            <button
              onClick={() => onToggleCollapse(false)}
              className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors mx-auto"
              title="展开任务面板"
            >
              <ChevronsRight size={14} />
            </button>
          ) : selectedCount > 0 ? (
            /* Batch operation toolbar */
            <div className="flex items-center gap-1.5 w-full">
              <div className="flex items-center gap-1 text-xs shrink-0">
                <CheckSquare size={13} className="text-indigo-400" />
                <span className="text-indigo-300 font-semibold">{selectedCount}</span>
                <span className="text-gray-500">项</span>
              </div>
              <div className="w-px h-4 bg-gray-700 mx-0.5" />
              <button
                onClick={() => onBatchShift?.(1)}
                className="px-1.5 py-1 text-[10px] rounded bg-gray-800/80 text-gray-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors border border-gray-700/50 hover:border-indigo-500/30"
                title="批量顺延1天"
              >
                +1天
              </button>
              <button
                onClick={() => onBatchShift?.(3)}
                className="px-1.5 py-1 text-[10px] rounded bg-gray-800/80 text-gray-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors border border-gray-700/50 hover:border-indigo-500/30"
                title="批量顺延3天"
              >
                +3天
              </button>
              <button
                onClick={() => onBatchShift?.(-1)}
                className="px-1.5 py-1 text-[10px] rounded bg-gray-800/80 text-gray-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors border border-gray-700/50 hover:border-amber-500/30"
                title="批量提前1天"
              >
                -1天
              </button>
              <button
                onClick={onBatchAlignEnd}
                className="p-1 rounded text-gray-500 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors"
                title="批量对齐结束时间"
              >
                <AlignEndHorizontal size={13} />
              </button>
              <button
                onClick={onBatchCopyMarkdown}
                className="p-1 rounded text-gray-500 hover:bg-emerald-500/15 hover:text-emerald-300 transition-colors"
                title="复制为Markdown (Ctrl+C)"
              >
                <Copy size={13} />
              </button>
              <button
                onClick={onBatchDelete}
                className="p-1 rounded text-gray-500 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                title="批量删除"
              >
                <Trash2 size={13} />
              </button>
              <div className="w-px h-4 bg-gray-700 mx-0.5" />
              <button
                onClick={onBatchManage}
                className="p-1 rounded text-gray-500 hover:bg-indigo-500/15 hover:text-indigo-400 transition-colors"
                title="批量管理"
              >
                <Settings2 size={13} />
              </button>
              <button
                onClick={onAutoInferDeps}
                className="p-1 rounded text-gray-500 hover:bg-purple-500/15 hover:text-purple-400 transition-colors"
                title="自动推断子任务依赖"
              >
                <GitMerge size={13} />
              </button>
              <div className="flex-1" />
              <button
                onClick={onClearSelection}
                className="p-1 rounded text-gray-600 hover:bg-gray-700 hover:text-gray-300 transition-colors"
                title="取消选择"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <span className="text-base">任务详情</span>
              <div className="flex items-center gap-1 relative z-20">
                <button
                  onClick={onToggleMultiSelect}
                  className={`p-1 rounded transition-colors relative ${
                    multiSelectMode
                      ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30'
                      : 'hover:bg-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                  title={multiSelectMode ? '退出多选模式 (Esc)' : '进入多选模式 — 点击任务勾选，支持批量操作\n快捷键: Ctrl+点击任务也可多选'}
                >
                  <MousePointerClick size={14} />
                  {/* Keyboard shortcut hint */}
                  {!multiSelectMode && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-gray-600 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      多选
                    </span>
                  )}
                </button>
                <button
                  onClick={() => onToggleCollapse(true)}
                  className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                  title="折叠任务面板"
                >
                  <ChevronsLeft size={14} />
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex relative w-full">
          {days.map(day => {
            const isToday = differenceInDays(day, today) === 0;
            const isDayWeekend = isWeekend(day);
            const isDayHoliday = isHoliday(day);
            return (
              <div
                key={day.toISOString()}
                className={`shrink-0 text-center py-2 border-l border-gray-700/30 transition-colors flex flex-col justify-center ${
                  isToday ? 'bg-indigo-500/15' :
                  isDayHoliday ? 'gantt-holiday-header' :
                  isDayWeekend ? 'gantt-weekend-header' : ''
                }`}
                style={{ width: `${dayWidth}px` }}
              >
                {zoomConfig.showDayNumber && (
                  isToday ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-500 text-white rounded-full font-medium" style={{ fontSize: dayWidth < 30 ? '8px' : '10px' }}>
                      {format(day, 'dd')}
                    </span>
                  ) : (
                  <div className={`leading-tight font-medium ${
                    isDayHoliday ? 'text-red-400 font-semibold' :
                    isDayWeekend ? 'text-gray-500' : 'text-gray-400'
                  }`} style={{ fontSize: dayWidth < 30 ? '8px' : '11px' }}>
                    {format(day, 'dd')}
                  </div>
                  )
                )}
                {zoomConfig.showWeekday && (
                  <div className={`text-[9px] leading-tight mt-0.5 ${
                    isToday ? 'text-indigo-400/80' :
                    isDayHoliday ? 'text-red-500/70' :
                    isDayWeekend ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    {format(day, 'E', { locale: zhCN })}
                  </div>
                )}
                {zoomConfig.showWeekMarker && format(day, 'i') === '1' && (
                  <div className="text-[7px] leading-tight text-gray-500 font-medium">
                    W{format(day, 'w')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>{/* end header wrapper */}
    </>
  );
});
