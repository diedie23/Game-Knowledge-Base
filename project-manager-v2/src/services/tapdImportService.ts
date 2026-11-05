import { db } from '../db/db';
import type { Task, ImportResult } from '../types';
import { mapTapdPriority } from '../utils/tapdPriority';
import { mapTapdStatus } from '../utils/tapdStatus';
import { createTapdSyncId, parseTapdWorkspaceIds } from '../utils/tapdIdentity';

// ─── TAPD File Import Service (Semi-automatic) ──────────────────

/** A single parsed row for preview before import */
export interface PreviewRow {
  rowIndex: number;
  tapdId: string;
  title: string;
  status: Task['status'];
  statusRaw: string;
  priority?: 'low' | 'medium' | 'high';
  priorityRaw: string;
  owner: string;
  startDate: string;
  endDate: string;
  progress: number;
  description: string;
  module?: string;
  estimatedHours?: number;
  /** Whether this row already exists in local DB (by tapdId or title) */
  existsLocally: boolean;
  /** The local task id if it exists */
  localTaskId?: number;
  /** Parent task TAPD ID (for hierarchy display) */
  parentTapdId?: string;
  /** Nesting depth level (0 = root) */
  depth?: number;
  /** Duplicate detection info */
  duplicateInfo?: {
    similarity: number;
    matchReason: 'tapdId_exact' | 'title_exact' | 'title_fuzzy' | 'owner_date';
    localTitle: string;
  };
}

/** Result of parsing a file for preview */
export interface PreviewResult {
  rows: PreviewRow[];
  headers: string[];
  errors: string[];
  /** Unique status values found */
  statuses: string[];
  /** Unique owner values found */
  owners: string[];
  /** Unique module/category values found */
  modules: string[];
}

export class TapdImportService {
  /**
   * Import tasks from a TAPD-exported CSV or Excel file.
   * Supports standard TAPD export columns (Chinese headers).
   */
  static async importFromFile(file: File, projectId: number): Promise<ImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const text = await file.text();
      return TapdImportService.parseAndImportCSV(text, projectId);
    } else if (ext === 'xlsx' || ext === 'xls') {
      // For Excel files, try to read as CSV (basic support)
      // Full xlsx parsing would require a library like SheetJS
      try {
        const text = await file.text();
        return TapdImportService.parseAndImportCSV(text, projectId);
      } catch {
        throw new Error('Excel 文件解析失败。建议从 TAPD 导出时选择 CSV 格式，兼容性更好。');
      }
    } else {
      throw new Error('不支持的文件格式，请选择 CSV 或 Excel 文件');
    }
  }

  /**
   * Parse a file for preview (without importing).
   * Returns structured rows with local-existence check.
   */
  static async previewFile(file: File, projectId: number): Promise<PreviewResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let text: string;

    if (ext === 'csv') {
      text = await file.text();
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        text = await file.text();
      } catch {
        throw new Error('Excel 文件解析失败。建议从 TAPD 导出时选择 CSV 格式，兼容性更好。');
      }
    } else {
      throw new Error('不支持的文件格式，请选择 CSV 或 Excel 文件');
    }

    return TapdImportService.parseForPreview(text, projectId);
  }

  /** Parse CSV text into preview rows with local-existence detection, dedup, and hierarchy */
  private static async parseForPreview(csvText: string, projectId: number): Promise<PreviewResult> {
    const errors: string[] = [];
    const rows: PreviewRow[] = [];

    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      errors.push('文件为空或只有表头');
      return { rows, headers: [], errors, statuses: [], owners: [], modules: [] };
    }

    const headers = TapdImportService.parseCSVLine(lines[0]);
    const headerMap = TapdImportService.buildHeaderMap(headers);

    if (!headerMap.title) {
      errors.push('未找到标题/需求名称列，请确认文件来自 TAPD 导出');
      return { rows, headers, errors, statuses: [], owners: [], modules: [] };
    }

    // Pre-load all local tasks for this project for efficient matching
    const localTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    const tapdIdSet = new Map<string, number>();
    const titleSet = new Map<string, { id: number; title: string }>();
    for (const t of localTasks) {
      if (t.tapdId) tapdIdSet.set(t.tapdId, t.id!);
      if (t.title) titleSet.set(t.title.trim().toLowerCase(), { id: t.id!, title: t.title });
    }

    const statusSet = new Set<string>();
    const ownerSet = new Set<string>();
    const moduleSet = new Set<string>();

    // First pass: parse all rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = TapdImportService.parseCSVLine(lines[i]);
        const get = (key: string): string => {
          const idx = headerMap[key];
          return idx !== null && idx !== undefined && idx < cols.length ? cols[idx].trim() : '';
        };

        const title = get('title');
        if (!title) continue;

        const statusRaw = get('status');
        const priorityRaw = get('priority');
        const owner = get('owner');
        const tapdId = get('id');
        const parentTapdId = get('parentId');
        const module = get('module');
        const effortRaw = get('estimatedHours');
        const estimatedHours = effortRaw ? Number.parseFloat(effortRaw.replace(/[^\d.]/g, '')) : undefined;
        const status = TapdImportService.mapImportStatus(statusRaw);
        const priority = TapdImportService.mapImportPriority(priorityRaw);
        const progressStr = get('progress');
        const progress = progressStr
          ? parseInt(progressStr.replace('%', ''), 10)
          : (status === 'done' ? 100 : status === 'in_progress' ? 50 : 0);

        if (statusRaw) statusSet.add(statusRaw);
        if (owner) ownerSet.add(owner);
        if (module) moduleSet.add(module);

        // Enhanced duplicate detection: tapdId exact → title exact → title fuzzy
        let existsLocally = false;
        let localTaskId: number | undefined;
        let duplicateInfo: PreviewRow['duplicateInfo'] | undefined;

        if (tapdId && tapdIdSet.has(tapdId)) {
          existsLocally = true;
          localTaskId = tapdIdSet.get(tapdId);
          duplicateInfo = {
            similarity: 100,
            matchReason: 'tapdId_exact',
            localTitle: localTasks.find(t => t.tapdId === tapdId)?.title || '',
          };
        } else if (titleSet.has(title.trim().toLowerCase())) {
          existsLocally = true;
          const match = titleSet.get(title.trim().toLowerCase())!;
          localTaskId = match.id;
          duplicateInfo = {
            similarity: 100,
            matchReason: 'title_exact',
            localTitle: match.title,
          };
        } else {
          // Fuzzy title matching against all local tasks
          const titleLower = title.trim().toLowerCase();
          for (const t of localTasks) {
            if (!t.title) continue;
            const similarity = TapdImportService.calculateSimilarity(titleLower, t.title.trim().toLowerCase());
            if (similarity >= 75) {
              existsLocally = true;
              localTaskId = t.id;
              duplicateInfo = {
                similarity,
                matchReason: 'title_fuzzy',
                localTitle: t.title,
              };
              break;
            }
          }
        }

        rows.push({
          rowIndex: i,
          tapdId,
          title,
          status,
          statusRaw,
          priority,
          priorityRaw,
          owner,
          startDate: get('startDate'),
          endDate: get('endDate'),
          progress: isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress)),
          description: get('description'),
          module: module || undefined,
          estimatedHours: estimatedHours !== undefined && Number.isFinite(estimatedHours) ? estimatedHours : undefined,
          existsLocally,
          localTaskId,
          parentTapdId: parentTapdId || undefined,
          duplicateInfo,
        });
      } catch (err: any) {
        errors.push(`第 ${i + 1} 行: ${err.message || '解析失败'}`);
      }
    }

    // Second pass: resolve parent-child hierarchy depth
    const tapdIdToRow = new Map<string, PreviewRow>();
    for (const row of rows) {
      if (row.tapdId) tapdIdToRow.set(row.tapdId, row);
    }
    for (const row of rows) {
      let depth = 0;
      let currentParent = row.parentTapdId;
      const visited = new Set<string>();
      while (currentParent && tapdIdToRow.has(currentParent) && !visited.has(currentParent)) {
        visited.add(currentParent);
        depth++;
        currentParent = tapdIdToRow.get(currentParent)?.parentTapdId;
      }
      row.depth = depth;
    }

    // Sort rows: parent first, then children (tree order)
    const sortedRows = TapdImportService.sortRowsAsTree(rows);

    return {
      rows: sortedRows,
      headers,
      errors,
      statuses: Array.from(statusSet),
      owners: Array.from(ownerSet),
      modules: Array.from(moduleSet),
    };
  }

  /** Sort rows into tree order (parents before children, preserving sibling order) */
  private static sortRowsAsTree(rows: PreviewRow[]): PreviewRow[] {
    const tapdIdToRow = new Map<string, PreviewRow>();
    const childrenMap = new Map<string, PreviewRow[]>(); // parentId → children
    const roots: PreviewRow[] = [];

    for (const row of rows) {
      if (row.tapdId) tapdIdToRow.set(row.tapdId, row);
    }

    for (const row of rows) {
      if (row.parentTapdId && tapdIdToRow.has(row.parentTapdId)) {
        const children = childrenMap.get(row.parentTapdId) || [];
        children.push(row);
        childrenMap.set(row.parentTapdId, children);
      } else {
        roots.push(row);
      }
    }

    // DFS to flatten tree
    const result: PreviewRow[] = [];
    const addWithChildren = (row: PreviewRow) => {
      result.push(row);
      const children = childrenMap.get(row.tapdId) || [];
      for (const child of children) {
        addWithChildren(child);
      }
    };
    for (const root of roots) {
      addWithChildren(root);
    }

    // Add any orphan rows not reached by DFS
    const resultSet = new Set(result.map(r => r.rowIndex));
    for (const row of rows) {
      if (!resultSet.has(row.rowIndex)) {
        result.push(row);
      }
    }

    return result;
  }

  /** Calculate title similarity (0-100) for dedup detection */
  private static calculateSimilarity(a: string, b: string): number {
    if (a === b) return 100;
    // One contains the other
    if (a.includes(b) || b.includes(a)) {
      const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      return Math.round(70 + ratio * 30);
    }
    // Token overlap
    const tokensA = a.split(/[\s\-_/|,，、()（）【】[\]]+/).filter(Boolean);
    const tokensB = b.split(/[\s\-_/|,，、()（）【】[\]]+/).filter(Boolean);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    const setA = new Set(tokensA);
    const intersection = tokensB.filter(t => setA.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    return Math.round((intersection / union) * 100);
  }

  /**
   * Import selected preview rows into local DB.
   * Enhanced with: fuzzy dedup, parent-child relationship, and auto member matching.
   */
  static async importSelectedRows(
    selectedRows: PreviewRow[],
    projectId: number
  ): Promise<ImportResult> {
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, total: 0, errors: [] };

    // Build TAPD id → local id mapping for parent-child resolution within this import.
    const tapdIdToLocalId = new Map<string, number>();

    // Keep import matching inside the selected local project. A TAPD numeric ID is
    // not globally unique and may legitimately exist in another workspace/project.
    const allProjectTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    for (const task of allProjectTasks) {
      if (task.tapdId && task.id) tapdIdToLocalId.set(task.tapdId, task.id);
    }

    // Pre-load resources for owner matching
    const allResources = await db.resources.toArray();

    // CSV/preview rows do not carry workspace metadata. Only assign a stable remote
    // identity when the selected project has exactly one configured workspace.
    const tapdConfig = await db.tapdConfigs.where('projectId').equals(projectId).first();
    const configuredWorkspaceIds = parseTapdWorkspaceIds(tapdConfig?.workspaceId);
    const workspaceId = configuredWorkspaceIds.length === 1 ? configuredWorkspaceIds[0] : '';

    // Track rows with parent relationships for second pass
    const rowsWithParent: { localId: number; parentTapdId: string }[] = [];

    for (const row of selectedRows) {
      result.total++;
      try {
        if (!row.title?.trim()) {
          result.skipped++;
          continue;
        }

        // Skip rows that user confirmed as duplicates (already marked in preview)
        if (row.duplicateInfo && row.duplicateInfo.similarity >= 90 && row.existsLocally && row.localTaskId) {
          // Auto-link tapdId to existing task if not already linked
          if (row.tapdId) {
            await db.tasks.update(row.localTaskId, {
              tapdId: row.tapdId,
              tapdWorkspaceId: workspaceId || undefined,
              syncId: workspaceId ? createTapdSyncId(workspaceId, row.tapdId) : undefined,
              externalUrl: workspaceId ? `https://tapd.woa.com/${workspaceId}/prong/stories/view/${row.tapdId}` : undefined,
              syncSource: 'tapd-import',
              syncedAt: Date.now(),
              updatedAt: Date.now(),
            });
            tapdIdToLocalId.set(row.tapdId, row.localTaskId);
          }
          if (row.parentTapdId) {
            rowsWithParent.push({ localId: row.localTaskId, parentTapdId: row.parentTapdId });
          }
          result.updated++;
          continue;
        }

        // Match owner to local resources
        const matchedAssigneeIds: number[] = [];
        if (row.owner) {
          const ownerNames = row.owner.split(/[;；,，]/).map(n => n.trim()).filter(Boolean);
          for (const name of ownerNames) {
            const exact = allResources.find(r => r.name === name);
            if (exact?.id) {
              matchedAssigneeIds.push(exact.id);
            } else {
              const partial = allResources.find(r => r.name.includes(name) || name.includes(r.name));
              if (partial?.id) matchedAssigneeIds.push(partial.id);
            }
          }
        }

        const taskData: Partial<Task> = {
          title: row.title,
          description: row.description,
          status: row.status,
          priority: row.priority,
          // Leave dates undefined when no schedule info (don't fill with current date)
          startDate: row.startDate ? new Date(row.startDate) : undefined,
          endDate: row.endDate ? new Date(row.endDate) : undefined,
          progress: row.progress,
          assigneeIds: matchedAssigneeIds.length > 0 ? matchedAssigneeIds : [],
          tapdId: row.tapdId || undefined,
          tapdWorkspaceId: workspaceId || undefined,
          syncId: workspaceId && row.tapdId ? createTapdSyncId(workspaceId, row.tapdId) : undefined,
          module: row.module,
          estimatedHours: row.estimatedHours,
          // Build TAPD external URL for direct navigation
          externalUrl: workspaceId && row.tapdId
            ? `https://tapd.woa.com/${workspaceId}/prong/stories/view/${row.tapdId}`
            : undefined,
        };

        // Enhanced dedup: stable workspace identity first, then a project-scoped
        // legacy TAPD id match, then exact/fuzzy title matching.
        let existingId: number | undefined;

        if (taskData.syncId) {
          const bySyncId = allProjectTasks.find(task => task.syncId === taskData.syncId);
          if (bySyncId?.id) existingId = bySyncId.id;
        }
        if (!existingId && taskData.tapdId) {
          const legacyMatches = allProjectTasks.filter(task => task.tapdId === taskData.tapdId && !task.tapdWorkspaceId && !task.syncId);
          if (legacyMatches.length === 1) existingId = legacyMatches[0].id;
        }

        if (!existingId) {
          // Exact title match
          const byTitle = allProjectTasks.find(
            t => t.title.trim().toLowerCase() === row.title.trim().toLowerCase()
          );
          if (byTitle?.id) existingId = byTitle.id;
        }

        if (!existingId) {
          // Fuzzy title match (≥80% similarity)
          const titleLower = row.title.trim().toLowerCase();
          for (const t of allProjectTasks) {
            if (!t.title) continue;
            const similarity = TapdImportService.calculateSimilarity(titleLower, t.title.trim().toLowerCase());
            if (similarity >= 80) {
              existingId = t.id;
              break;
            }
          }
        }

        if (existingId) {
          await db.tasks.update(existingId, {
            title: taskData.title,
            description: taskData.description,
            status: taskData.status,
            priority: taskData.priority,
            startDate: taskData.startDate,
            endDate: taskData.endDate,
            progress: taskData.progress,
            assigneeIds: matchedAssigneeIds.length > 0 ? matchedAssigneeIds : undefined,
            tapdId: taskData.tapdId || undefined,
            tapdWorkspaceId: taskData.tapdWorkspaceId,
            syncId: taskData.syncId,
            externalUrl: taskData.externalUrl,
            module: taskData.module,
            estimatedHours: taskData.estimatedHours,
            updatedAt: Date.now(),
            syncedAt: Date.now(),
            syncSource: 'tapd-import',
          });
          if (row.tapdId) tapdIdToLocalId.set(row.tapdId, existingId);
          if (row.parentTapdId) rowsWithParent.push({ localId: existingId, parentTapdId: row.parentTapdId });
          result.updated++;
        } else {
          const newId = await db.tasks.add({
            ...taskData,
            projectId,
            dependencies: [],
            type: 'task',
            updatedAt: Date.now(),
            syncedAt: Date.now(),
            syncSource: 'tapd-import',
          } as Task);
          if (row.tapdId) tapdIdToLocalId.set(row.tapdId, newId as number);
          if (row.parentTapdId) rowsWithParent.push({ localId: newId as number, parentTapdId: row.parentTapdId });
          result.inserted++;
        }
      } catch (err: any) {
        result.errors.push(`"${row.title}": ${err.message || '导入失败'}`);
      }
    }

    // Second pass: resolve parent-child relationships
    for (const { localId, parentTapdId } of rowsWithParent) {
      if (parentTapdId && parentTapdId !== '0') {
        const parentLocalId = tapdIdToLocalId.get(parentTapdId);
        if (parentLocalId) {
          await db.tasks.update(localId, { parentId: parentLocalId });
        }
      }
    }

    return result;
  }

  /** Parse CSV text and import into local DB */
  private static async parseAndImportCSV(csvText: string, projectId: number): Promise<ImportResult> {
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, total: 0, errors: [] };

    // Split lines and handle potential BOM
    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      result.errors.push('文件为空或只有表头');
      return result;
    }

    // Parse header row
    const headers = TapdImportService.parseCSVLine(lines[0]);
    const headerMap = TapdImportService.buildHeaderMap(headers);

    if (!headerMap.title) {
      result.errors.push('未找到标题/需求名称列，请确认文件来自 TAPD 导出');
      return result;
    }

    const tapdConfig = await db.tapdConfigs.where('projectId').equals(projectId).first();
    const configuredWorkspaceIds = parseTapdWorkspaceIds(tapdConfig?.workspaceId);
    const workspaceId = configuredWorkspaceIds.length === 1 ? configuredWorkspaceIds[0] : '';
    const allProjectTasks = await db.tasks.where('projectId').equals(projectId).toArray();

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      result.total++;
      try {
        const cols = TapdImportService.parseCSVLine(lines[i]);
        const task = TapdImportService.mapRowToTask(cols, headerMap, projectId);

        if (!task.title?.trim()) {
          result.skipped++;
          continue;
        }

        // CSV rows do not identify their TAPD workspace. Use a stable identity only
        // when the selected project maps to exactly one workspace.
        const externalUrl = workspaceId && task.tapdId
          ? `https://tapd.woa.com/${workspaceId}/prong/stories/view/${task.tapdId}`
          : undefined;
        const syncId = workspaceId && task.tapdId ? createTapdSyncId(workspaceId, task.tapdId) : undefined;

        // Upsert by workspace-scoped identity first. An ambiguous legacy TAPD id is
        // only reusable when it has exactly one match inside the selected project.
        let existingId: number | undefined;
        if (syncId) {
          const bySyncId = allProjectTasks.find(candidate => candidate.syncId === syncId);
          if (bySyncId?.id) existingId = bySyncId.id;
        }
        if (!existingId && task.tapdId) {
          const legacyMatches = allProjectTasks.filter(candidate => candidate.tapdId === task.tapdId && !candidate.tapdWorkspaceId && !candidate.syncId);
          if (legacyMatches.length === 1) existingId = legacyMatches[0].id;
        }
        // Fallback: match by title + projectId when no remote identity match
        if (!existingId && task.title) {
          const byTitle = allProjectTasks.find(
            t => t.title.trim().toLowerCase() === task.title!.trim().toLowerCase()
          );
          if (byTitle?.id) existingId = byTitle.id;
        }

        if (existingId) {
            await db.tasks.update(existingId, {
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              startDate: task.startDate,
              endDate: task.endDate,
              progress: task.progress,
              tapdId: task.tapdId || undefined,
              tapdWorkspaceId: workspaceId || undefined,
              syncId,
              externalUrl,
              updatedAt: Date.now(),
              syncedAt: Date.now(),
              syncSource: 'tapd-import',
            });
            result.updated++;
            continue;
        }

        // Insert new task
        await db.tasks.add({
          ...task,
          projectId,
          dependencies: [],
          type: 'task',
          tapdWorkspaceId: workspaceId || undefined,
          syncId,
          externalUrl,
          updatedAt: Date.now(),
          syncedAt: Date.now(),
          syncSource: 'tapd-import',
        } as Task);
        result.inserted++;
      } catch (err: any) {
        result.errors.push(`第 ${i + 1} 行: ${err.message || '解析失败'}`);
      }
    }

    return result;
  }

  /** Parse a single CSV line respecting quoted fields */
  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  /** Build a mapping from semantic field names to column indices */
  private static buildHeaderMap(headers: string[]): Record<string, number | null> {
    const map: Record<string, number | null> = {
      id: null,
      title: null,
      description: null,
      status: null,
      priority: null,
      owner: null,
      startDate: null,
      endDate: null,
      progress: null,
      parentId: null,
      module: null,
      estimatedHours: null,
    };

    const patterns: Record<string, RegExp> = {
      id: /^(ID|编号|需求ID|任务ID|id)$/i,
      title: /^(标题|需求名称|任务名称|名称|name|title)$/i,
      description: /^(描述|详细描述|说明|description|content)$/i,
      status: /^(状态|当前状态|status)$/i,
      priority: /^(优先级|priority)$/i,
      owner: /^(处理人|负责人|当前处理人|经办人|owner|assignee)$/i,
      startDate: /^(开始时间|开始日期|预计开始|begin|start)$/i,
      endDate: /^(结束时间|结束日期|预计结束|截止时间|due|end)$/i,
      progress: /^(进度|完成度|progress)$/i,
      parentId: /^(父需求|父任务|父需求ID|parent_id|parent|parentId)$/i,
      module: /^(模块|分类|需求分类|类别|module|category)$/i,
      estimatedHours: /^(预估工时|预计工时|工时|工作量|effort|hours?)$/i,
    };

    headers.forEach((h, idx) => {
      const cleaned = h.replace(/["\s]/g, '');
      for (const [key, regex] of Object.entries(patterns)) {
        if (regex.test(cleaned) && map[key] === null) {
          map[key] = idx;
        }
      }
    });

    return map;
  }

  /** Map a CSV row to a partial Task object */
  private static mapRowToTask(
    cols: string[],
    headerMap: Record<string, number | null>,
    _projectId: number
  ): Partial<Task> {
    const get = (key: string): string => {
      const idx = headerMap[key];
      return idx !== null && idx < cols.length ? cols[idx].trim() : '';
    };

    const statusStr = get('status');
    const status = TapdImportService.mapImportStatus(statusStr);
    const progress = get('progress')
      ? parseInt(get('progress').replace('%', ''), 10)
      : (status === 'done' ? 100 : status === 'in_progress' ? 50 : 0);

    const startStr = get('startDate');
    const endStr = get('endDate');

    return {
      title: get('title'),
      description: get('description'),
      status,
      priority: TapdImportService.mapImportPriority(get('priority')),
      // Leave dates undefined when no schedule info (don't fill with current date)
      startDate: startStr ? new Date(startStr) : undefined,
      endDate: endStr ? new Date(endStr) : undefined,
      progress: isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress)),
      assigneeIds: [],
      tapdId: get('id') || undefined,
      module: get('module') || undefined,
      estimatedHours: get('estimatedHours') ? Number.parseFloat(get('estimatedHours').replace(/[^\d.]/g, '')) : undefined,
    };
  }

  /** Map Chinese status strings from TAPD export */
  private static mapImportStatus(status: string): Task['status'] {
    return mapTapdStatus(status);
  }

  /** Map Chinese priority strings from TAPD export */
  private static mapImportPriority(priority: string): Task['priority'] {
    return mapTapdPriority(priority);
  }
}
