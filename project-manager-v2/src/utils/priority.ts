import type { TaskPriority } from '../types/enums';

export const PRIORITY_META: Record<TaskPriority, { label: string; title: string }> = {
  high: { label: 'P0', title: 'P0 · 最高优先级' },
  medium: { label: 'P1', title: 'P1 · 中优先级' },
  low: { label: 'P2', title: 'P2 · 普通优先级' },
};

export function getPriorityLabel(priority?: TaskPriority | string): string {
  return priority && priority in PRIORITY_META
    ? PRIORITY_META[priority as TaskPriority].label
    : '—';
}
