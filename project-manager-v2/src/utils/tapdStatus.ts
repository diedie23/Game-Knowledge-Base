import type { TaskStatus } from '../types/enums';

/** Convert TAPD's workspace-specific status label or code without conflating rejection with completion. */
export function mapTapdStatus(value: unknown): TaskStatus {
  const status = String(value ?? '').trim().toLowerCase();
  const exact: Record<string, TaskStatus> = {
    planning: 'todo', open: 'todo', new: 'todo',
    developing: 'in_progress', progressing: 'in_progress', testing: 'in_progress', implemented: 'in_progress',
    resolved: 'done', closed: 'done', done: 'done', auditing: 'done', in_review: 'done',
    accepted: 'done', accepting: 'done', verified: 'done', delivered: 'done',
    '无需合入': 'done', no_merge: 'done', no_merge_needed: 'done', not_required: 'done',
    rejected: 'cancelled', cancelled: 'cancelled', canceled: 'cancelled',
  };
  if (exact[status]) return exact[status];
  if (/已拒绝|拒绝|驳回|已取消|取消/.test(status)) return 'cancelled';
  if (/验收|已完成|已关闭|已解决|无需合入|无需/.test(status)) return 'done';
  if (/开发|进行|处理|测试|实现/.test(status)) return 'in_progress';
  return 'todo';
}
