import type { Task } from '../../db/db';
import type { Resource } from '../../types';
import type { GhostSchedule } from '../WhatIfPanel';

// Gantt-local types
export interface VisibleTaskRow {
  task: Task;
  level: number;
  rowIndex: number;
}

export interface DependencyLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isConflict: boolean;
  fromTaskId: number;
  toTaskId: number;
  isGhost?: boolean;
  ghostReason?: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  taskId: number;
}

export interface ResizeState {
  taskId: number;
  edge: 'left' | 'right';
  initialX: number;
  initialStartDate: Date;
  initialEndDate: Date;
  daysDelta: number;
}

export interface MemberSummary {
  resource: Resource;
  tasks: Task[];
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  total: number;
}
