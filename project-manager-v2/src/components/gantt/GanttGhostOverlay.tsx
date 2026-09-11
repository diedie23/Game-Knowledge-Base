import React from 'react';
import { differenceInDays } from 'date-fns';
import type { Task } from '../../db/db';
import type { GhostSchedule } from '../WhatIfPanel';
import { ROW_HEIGHT } from './constants';
import type { VisibleTaskRow } from './types';

interface Props {
  ghostSchedules: GhostSchedule[];
  visibleTaskRows: VisibleTaskRow[];
  startDate: Date;
  dayWidth: number;
}

export const GanttGhostOverlay = React.memo(function GanttGhostOverlay({
  ghostSchedules, visibleTaskRows, startDate, dayWidth
}: Props) {
  if (ghostSchedules.length === 0) return null;

  return (
    <>
      {ghostSchedules.map((ghost) => {
        const row = visibleTaskRows.find(r => r.task.id === ghost.taskId);
        if (!row) return null;
        const offset = differenceInDays(ghost.newStart, startDate);
        const duration = differenceInDays(ghost.newEnd, ghost.newStart) + 1;
        const left = offset * dayWidth;
        const width = duration * dayWidth;
        const top = row.rowIndex * ROW_HEIGHT + 8;
        return (
          <div
            key={'ghost-' + ghost.taskId}
            className="absolute h-7 rounded-md border-2 border-dashed border-amber-400/60 bg-amber-500/10 z-[4] pointer-events-none"
            style={{ left, width, top }}
            title={'What-If: ' + ghost.reason}
          />
        );
      })}
    </>
  );
});
