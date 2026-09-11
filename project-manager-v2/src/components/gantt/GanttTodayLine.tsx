import React from 'react';
import { differenceInDays, startOfToday } from 'date-fns';

interface Props {
  startDate: Date;
  dayWidth: number;
  leftPanelWidth: number;
}

export const GanttTodayLine = React.memo(function GanttTodayLine({ startDate, dayWidth, leftPanelWidth }: Props) {
  const today = startOfToday();
  const todayOffset = differenceInDays(today, startDate);
  const todayX = leftPanelWidth + todayOffset * dayWidth + dayWidth / 2;

  return (
    <div
      className="absolute top-0 bottom-0 z-[5] pointer-events-none"
      style={{ left: todayX }}
    >
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-lg shadow-red-500/50 -ml-[5px] -mt-1" />
      <div className="w-px h-full bg-gradient-to-b from-red-500/80 to-red-500/10" />
    </div>
  );
});
