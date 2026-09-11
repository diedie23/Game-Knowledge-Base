import React from 'react';
import { format, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface GanttScrollbarProps {
  startDate: Date;
  scrollOffset: number;
  onScrollOffsetChange: (updater: number | ((prev: number) => number)) => void;
  isDraggingScrollbar: boolean;
  onScrollbarMouseDown: (e: React.MouseEvent) => void;
  scrollbarRef: React.Ref<HTMLDivElement>;
}

export const GanttScrollbar = React.memo(function GanttScrollbar({
  startDate,
  scrollOffset,
  onScrollOffsetChange,
  isDraggingScrollbar,
  onScrollbarMouseDown,
  scrollbarRef,
}: GanttScrollbarProps) {
  return (
    <div className="border-t border-gray-700/60 bg-[#0e1018] px-4 py-2 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onScrollOffsetChange((prev: number) => prev - 7)}
          className="p-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-400 transition-colors shrink-0"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Scrollbar track */}
        <div
          ref={scrollbarRef}
          className="flex-1 h-6 bg-gray-800/50 rounded-full relative cursor-grab active:cursor-grabbing select-none group"
          onMouseDown={onScrollbarMouseDown}
        >
          {/* Track background with center marker */}
          <div className="absolute inset-0 flex items-center px-2">
            <div className="flex-1 h-[2px] bg-gray-700/50 rounded-full relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rose-500/60" />
            </div>
          </div>
          {/* Thumb / handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 bg-indigo-500/40 group-hover:bg-indigo-500/60 rounded-full border border-indigo-400/30 transition-colors flex items-center justify-center"
            style={{
              left: `${Math.max(0, Math.min(85, 50 + scrollOffset * 0.8))}%`,
              width: '15%',
            }}
          >
            <div className="flex gap-0.5">
              <div className="w-0.5 h-2 bg-indigo-300/40 rounded-full" />
              <div className="w-0.5 h-2 bg-indigo-300/40 rounded-full" />
              <div className="w-0.5 h-2 bg-indigo-300/40 rounded-full" />
            </div>
          </div>
          {/* Date label */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-gray-600 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            {format(startDate, 'MM/dd')} — {format(addDays(startDate, 29), 'MM/dd')}
          </div>
        </div>

        <button
          onClick={() => onScrollOffsetChange((prev: number) => prev + 7)}
          className="p-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-400 transition-colors shrink-0"
        >
          <ChevronRight size={14} />
        </button>

        <button
          onClick={() => onScrollOffsetChange(-5)}
          className="text-[10px] text-gray-600 hover:text-indigo-400 transition-colors px-2 py-0.5 rounded hover:bg-gray-800/50 shrink-0"
        >
          今日
        </button>
      </div>
    </div>
  );
});
