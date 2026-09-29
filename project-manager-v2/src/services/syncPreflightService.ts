import { db } from '../db/db';
import type { ChangeLog, Resource, Task } from '../types';

export interface PendingSyncField {
  field: string;
  from: unknown;
  to: unknown;
}

export interface PendingSyncPreview {
  table: ChangeLog['table'];
  recordId: number;
  action: ChangeLog['action'];
  title: string;
  task?: Task;
  resource?: Resource;
  fields: PendingSyncField[];
  logIds: number[];
  lastChangedAt: number;
  impact: 'high' | 'medium' | 'low';
  impactReason: string;
}

export function buildPendingSyncPreview(logs: ChangeLog[], tasks: Task[], resources: Resource[]): PendingSyncPreview[] {
  const taskById = new Map(tasks.filter(task => task.id).map(task => [task.id!, task]));
  const resourceById = new Map(resources.filter(resource => resource.id).map(resource => [resource.id!, resource]));
  const grouped = new Map<string, ChangeLog[]>();
  logs.filter(log => !log.synced).sort((a, b) => a.timestamp - b.timestamp).forEach(log => {
    const key = `${log.table}:${log.recordId}`;
    grouped.set(key, [...(grouped.get(key) || []), log]);
  });

  return [...grouped.values()].map(recordLogs => {
    const first = recordLogs[0];
    const task = first.table === 'tasks' ? taskById.get(first.recordId) : undefined;
    const resource = first.table === 'resources' ? resourceById.get(first.recordId) : undefined;
    const fieldMap = new Map<string, PendingSyncField>();
    recordLogs.forEach(log => {
      Object.entries(log.changes || {}).forEach(([field, value]) => {
        const change = value as { from?: unknown; to?: unknown };
        const existing = fieldMap.get(field);
        fieldMap.set(field, { field, from: existing ? existing.from : change?.from, to: change?.to });
      });
    });
    const last = recordLogs[recordLogs.length - 1];
    const fields = [...fieldMap.values()].filter(field => JSON.stringify(field.from) !== JSON.stringify(field.to));
    const fieldNames = new Set(fields.map(field => field.field));
    const impact: PendingSyncPreview['impact'] = last.action === 'delete' || fieldNames.has('parentId')
      ? 'high'
      : first.action === 'create' || ['startDate', 'endDate', 'assigneeIds', 'status', 'priority'].some(field => fieldNames.has(field))
        ? 'medium'
        : 'low';
    const impactReason = last.action === 'delete'
      ? '将删除 TAPD 对应记录'
      : fieldNames.has('parentId')
        ? '父子层级将发生变化'
        : fieldNames.has('assigneeIds') && (fieldNames.has('startDate') || fieldNames.has('endDate'))
          ? '处理人与排期将同时变化'
          : fieldNames.has('assigneeIds')
            ? '处理人将发生变化'
            : fieldNames.has('startDate') || fieldNames.has('endDate')
              ? '排期日期将发生变化'
              : first.action === 'create'
                ? '将新建 TAPD 记录'
                : '常规字段更新';
    return {
      table: first.table,
      recordId: first.recordId,
      action: recordLogs.some(log => log.action === 'create') ? 'create' : last.action,
      title: task?.title || resource?.name || first.snapshot?.title || first.snapshot?.name || `记录 #${first.recordId}`,
      task,
      resource,
      fields,
      logIds: recordLogs.map(log => log.id).filter((id): id is number => !!id),
      lastChangedAt: last.timestamp,
      impact,
      impactReason,
    };
  }).sort((a, b) => b.lastChangedAt - a.lastChangedAt);
}

/** Restore records to the state before their unsynced changes, then clear only those pending logs. */
export async function discardPendingSyncChanges(logs: ChangeLog[]): Promise<void> {
  const pending = logs.filter(log => !log.synced && log.id).sort((a, b) => b.timestamp - a.timestamp);
  await db.transaction('rw', db.tasks, db.resources, db.changeLogs, async () => {
    for (const log of pending) {
      const table = log.table === 'tasks' ? db.tasks : db.resources;
      if (log.action === 'create') await table.delete(log.recordId);
      else if (log.action === 'delete' && log.snapshot) await table.put(log.snapshot);
      else if (log.action === 'update') {
        const restored = Object.fromEntries(Object.entries(log.changes || {}).map(([field, value]) => [field, (value as { from?: unknown })?.from]));
        await table.update(log.recordId, restored);
      }
    }
    await db.changeLogs.bulkDelete(pending.map(log => log.id!));
  });
}
