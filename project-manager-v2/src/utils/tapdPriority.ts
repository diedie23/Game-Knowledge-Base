export type LocalTaskPriority = 'low' | 'medium' | 'high';

/** Convert TAPD's project-specific display priority into the local P0/P1/P2 scale. */
export function mapTapdPriority(value: unknown): LocalTaskPriority {
  const priority = String(value ?? '').trim().toLowerCase();

  if (/\bp0\b/.test(priority) || priority === '4' || ['urgent', 'high', '高'].includes(priority) || /紧急|最高|高优先级/.test(priority)) {
    return 'high';
  }
  if (/\bp1\b/.test(priority) || priority === '3' || ['medium', 'middle', '中'].includes(priority) || /中优先级/.test(priority)) {
    return 'medium';
  }
  if (/\bp[2-4]\b/.test(priority) || ['1', '2', 'low', 'nice', 'nice to have', '低'].includes(priority) || /低优先级|无关紧要/.test(priority)) {
    return 'low';
  }

  return 'medium';
}

export function getLocalPriorityLabel(priority: LocalTaskPriority): 'P0' | 'P1' | 'P2' {
  if (priority === 'high') return 'P0';
  if (priority === 'low') return 'P2';
  return 'P1';
}