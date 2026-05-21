import { db } from '../db/db';
import type { Task, Resource, Project } from '../types';
import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval, differenceInDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// Full database snapshot type
interface DatabaseSnapshot {
  version: number;
  exportedAt: string;
  projects: Project[];
  tasks: Task[];
  resources: Resource[];
}

export const BACKUP_STORAGE_KEY = 'lpm_last_backup_time';

/**
 * DataExportService - handles JSON full-database export/import and CSV export.
 */
export const dataExportService = {
  // --- JSON Full Snapshot Export ---
  async exportJSON(): Promise<void> {
    const [projects, tasks, resources] = await Promise.all([
      db.projects.toArray(),
      db.tasks.toArray(),
      db.resources.toArray(),
    ]);

    const snapshot: DatabaseSnapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
      tasks,
      resources,
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Record backup time
    localStorage.setItem(BACKUP_STORAGE_KEY, new Date().toISOString());
  },

  // --- JSON Full Snapshot Import ---
  async importJSON(file: File): Promise<{ projects: number; tasks: number; resources: number }> {
    const text = await file.text();
    let snapshot: DatabaseSnapshot;

    try {
      snapshot = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON file');
    }

    if (!snapshot.version || !snapshot.tasks) {
      throw new Error('Invalid snapshot format: missing required fields');
    }

    // Restore date objects from ISO strings
    const tasks = snapshot.tasks.map(t => ({
      ...t,
      id: undefined, // Let Dexie auto-assign new IDs
      startDate: t.startDate ? new Date(t.startDate) : undefined,
      endDate: t.endDate ? new Date(t.endDate) : undefined,
    }));

    const resources = (snapshot.resources || []).map(r => ({
      ...r,
      id: undefined,
    }));

    const projects = (snapshot.projects || []).map(p => ({
      ...p,
      id: undefined,
    }));

    // Clear existing data and import
    await db.transaction('rw', [db.projects, db.tasks, db.resources], async () => {
      await db.projects.clear();
      await db.tasks.clear();
      await db.resources.clear();

      if (projects.length > 0) {
        await db.projects.bulkAdd(projects as Project[]);
      }
      if (resources.length > 0) {
        await db.resources.bulkAdd(resources as Resource[]);
      }
      if (tasks.length > 0) {
        await db.tasks.bulkAdd(tasks as Task[]);
      }
    });

    return {
      projects: projects.length,
      tasks: tasks.length,
      resources: resources.length,
    };
  },

  // --- Weekly Report Export (Markdown) — Professional PM format ---
  async exportWeeklyReport(weekOffset = 0): Promise<string> {
    const [tasks, resources] = await Promise.all([
      db.tasks.toArray(),
      db.resources.toArray(),
    ]);

    const now = new Date();
    const weekStart = startOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 });

    const weekLabel = `${format(weekStart, 'yyyy年M月d日', { locale: zhCN })} ~ ${format(weekEnd, 'M月d日', { locale: zhCN })}`;

    // ─── Data Preparation ────────────────────────────────────────

    // Leaf tasks (no children = actual work items)
    const leafTasks = tasks.filter(t => !tasks.some(c => c.parentId === t.id));
    // Parent tasks (top-level modules)
    const topLevelTasks = tasks.filter(t => !t.parentId);

    // Completed this week
    const completedThisWeek = leafTasks.filter(t =>
      t.status === 'done' && t.endDate &&
      isWithinInterval(new Date(t.endDate), { start: weekStart, end: weekEnd })
    );

    // In progress this week
    const inProgressThisWeek = leafTasks.filter(t =>
      t.status === 'in_progress' ||
      (t.startDate && t.endDate &&
        new Date(t.startDate) <= weekEnd &&
        new Date(t.endDate) >= weekStart &&
        t.status !== 'done')
    );

    // Overdue tasks
    const overdueTasks = leafTasks.filter(t =>
      t.status !== 'done' && t.endDate && new Date(t.endDate) < now
    );

    // Blocked tasks
    const blockedTasks = leafTasks.filter(t => (t as any).isBlocked);

    // Next week tasks
    const nextWeekStart = startOfWeek(subWeeks(now, weekOffset - 1), { weekStartsOn: 1 });
    const nextWeekEnd = endOfWeek(subWeeks(now, weekOffset - 1), { weekStartsOn: 1 });
    const nextWeekTasks = leafTasks.filter(t =>
      t.startDate && new Date(t.startDate) <= nextWeekEnd &&
      (!t.endDate || new Date(t.endDate) >= nextWeekStart) &&
      t.status !== 'done'
    );

    // Overall progress
    const totalLeaf = leafTasks.length;
    const doneLeaf = leafTasks.filter(t => t.status === 'done').length;
    const inProgressCount = leafTasks.filter(t => t.status === 'in_progress').length;
    const todoCount = leafTasks.filter(t => t.status === 'todo').length;
    const progressPct = totalLeaf > 0 ? Math.round((doneLeaf / totalLeaf) * 100) : 0;

    // ─── Helper Functions ────────────────────────────────────────

    const getAssigneeNames = (t: Task) =>
      (t.assigneeIds || []).map(id => resources.find(r => r.id === id)?.name || '').filter(Boolean).join('、') || '未分配';

    const getParentPath = (t: Task): string => {
      if (!t.parentId) return '';
      const parent = tasks.find(p => p.id === t.parentId);
      if (!parent) return '';
      let path = parent.title;
      let currentParent = parent;
      while (currentParent.parentId) {
        const grandParent = tasks.find(p => p.id === currentParent.parentId);
        if (grandParent) {
          path = `${grandParent.title} / ${path}`;
          currentParent = grandParent;
        } else {
          break;
        }
      }
      return path;
    };

    const getTopLevelParentTitle = (t: Task): string => {
      let current = t;
      while (current.parentId) {
        const parent = tasks.find(p => p.id === current.parentId);
        if (parent) current = parent;
        else break;
      }
      return current.title;
    };

    // Shorten module name: extract last meaningful segment from nested brackets
    // e.g. "【UGC小游戏】【外围系统】【公告】公告系统" → "公告系统"
    // e.g. "【元梦之星】【UGC】五一节点可复用活动模板 开发单" → "五一活动模板"
    const shortenModuleName = (name: string): string => {
      // Remove all 【...】 bracket prefixes
      let cleaned = name.replace(/【[^】]*】/g, '').trim();
      // If nothing left after removal, try keeping the last bracket content
      if (!cleaned) {
        const matches = name.match(/【([^】]*)】/g);
        if (matches && matches.length > 0) {
          cleaned = matches[matches.length - 1].replace(/[【】]/g, '');
        } else {
          cleaned = name;
        }
      }
      // Truncate to 20 chars if still too long
      if (cleaned.length > 20) {
        cleaned = cleaned.substring(0, 18) + '…';
      }
      return cleaned;
    };

    // Get the task's own short name (stage name after last dash, or cleaned title)
    const getShortTaskName = (t: Task): string => {
      // For TAPD-synced tasks, preserve the full title (don't truncate by dash)
      if (t.syncSource || t.externalUrl) {
        return shortenModuleName(t.title);
      }
      const title = t.title;
      // Try extracting stage name after last dash/hyphen
      const dashIdx = title.lastIndexOf('-');
      if (dashIdx !== -1 && dashIdx < title.length - 1) {
        return title.substring(dashIdx + 1).trim();
      }
      // Otherwise remove bracket prefixes
      return shortenModuleName(title);
    };

    const formatDateRange = (t: Task): string => {
      if (t.startDate && t.endDate) {
        return `${format(new Date(t.startDate), 'M/d')}~${format(new Date(t.endDate), 'M/d')}`;
      }
      return '';
    };

    // Generate a text progress bar: ████░░░░░░ 40%
    const progressBar = (pct: number): string => {
      const filled = Math.round(pct / 10);
      const empty = 10 - filled;
      return '█'.repeat(filled) + '░'.repeat(empty) + ` ${pct}%`;
    };

    // ─── Project Health Score ────────────────────────────────────
    // Formula: base 100 - (overdue * 8) - (blocked * 5) + (completion_bonus)
    let healthScore = 100;
    healthScore -= overdueTasks.length * 8;
    healthScore -= blockedTasks.length * 5;
    if (progressPct >= 80) healthScore += 5;
    healthScore = Math.max(0, Math.min(100, healthScore));
    const healthEmoji = healthScore >= 80 ? '🟢' : healthScore >= 60 ? '🟡' : '🔴';
    const healthLabel = healthScore >= 80 ? '健康' : healthScore >= 60 ? '需关注' : '有风险';

    // ─── Build Markdown ──────────────────────────────────────────

    let md = `# 📋 项目周报 ${weekLabel}\n\n`;
    md += `> 📅 生成时间：${format(now, 'yyyy-MM-dd HH:mm')} | 报告类型：项目管理周报\n\n`;
    md += `---\n\n`;

    // ── Section 1: Executive Summary (管理摘要) ──
    md += `## 一、管理摘要\n\n`;
    md += `${healthEmoji} **项目健康度：${healthScore}分（${healthLabel}）** ｜ 整体进度 ${progressBar(progressPct)}\n\n`;
    md += `| 📦 总任务 | ✅ 已完成 | 🔄 进行中 | 📝 待办 | ⚠️ 逾期 | 📊 本周完成 |\n`;
    md += `| :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    md += `| ${totalLeaf} | ${doneLeaf} (${progressPct}%) | ${inProgressCount} | ${todoCount} | ${overdueTasks.length > 0 ? `**${overdueTasks.length}**` : '0'} | ${completedThisWeek.length} |\n\n`;

    // ── Section 2: Module Progress (分模块进度) ──
    md += `## 二、分模块进度\n\n`;
    md += `| 模块 | 完成/总计 | 进度 | 状态 |\n| --- | :---: | --- | :---: |\n`;
    
    topLevelTasks.forEach(parentTask => {
      const shortName = shortenModuleName(parentTask.title);
      const children = leafTasks.filter(t => {
        return getTopLevelParentTitle(t) === parentTask.title;
      });
      if (children.length === 0) {
        const pct = parentTask.status === 'done' ? 100 : 0;
        const statusIcon = parentTask.status === 'done' ? '✅' : parentTask.status === 'in_progress' ? '🔄' : '📝';
        md += `| ${shortName} | ${parentTask.status === 'done' ? 1 : 0}/${1} | ${progressBar(pct)} | ${statusIcon} |\n`;
        return;
      }
      const childDone = children.filter(c => c.status === 'done').length;
      const childOverdue = children.filter(c => c.status !== 'done' && c.endDate && new Date(c.endDate) < now).length;
      const pct = children.length > 0 ? Math.round((childDone / children.length) * 100) : 0;
      const statusIcon = childOverdue > 0 ? `⚠️逾期${childOverdue}` : pct === 100 ? '✅完成' : pct > 0 ? '🔄进行中' : '📝待启动';
      md += `| ${shortName} | ${childDone}/${children.length} | ${progressBar(pct)} | ${statusIcon} |\n`;
    });
    md += '\n';

    // ── Section 3: Completed This Week (本周交付) ──
    md += `## 三、本周交付 (${completedThisWeek.length})\n\n`;
    if (completedThisWeek.length > 0) {
      // Group by top-level parent
      const groupedCompleted = new Map<string, Task[]>();
      completedThisWeek.forEach(t => {
        const moduleName = shortenModuleName(getTopLevelParentTitle(t));
        if (!groupedCompleted.has(moduleName)) groupedCompleted.set(moduleName, []);
        groupedCompleted.get(moduleName)!.push(t);
      });
      groupedCompleted.forEach((items, moduleName) => {
        md += `**📦 ${moduleName}**\n`;
        items.forEach(t => {
          const dateStr = formatDateRange(t);
          const assignees = getAssigneeNames(t);
          const stageName = getShortTaskName(t);
          md += `- ✅ ${stageName}${dateStr ? ` (${dateStr})` : ''} — ${assignees}\n`;
        });
        md += '\n';
      });
    } else {
      md += '_本周暂无交付成果_\n\n';
    }

    // ── Section 4: In Progress (进行中工作) ──
    md += `## 四、进行中 (${inProgressThisWeek.length})\n\n`;
    if (inProgressThisWeek.length > 0) {
      const groupedInProgress = new Map<string, Task[]>();
      inProgressThisWeek.forEach(t => {
        const moduleName = shortenModuleName(getTopLevelParentTitle(t));
        if (!groupedInProgress.has(moduleName)) groupedInProgress.set(moduleName, []);
        groupedInProgress.get(moduleName)!.push(t);
      });
      groupedInProgress.forEach((items, moduleName) => {
        md += `**📦 ${moduleName}**\n`;
        items.forEach(t => {
          const dateStr = formatDateRange(t);
          const assignees = getAssigneeNames(t);
          const stageName = getShortTaskName(t);
          const remainDays = t.endDate ? differenceInDays(new Date(t.endDate), now) : null;
          const remainTag = remainDays !== null
            ? remainDays < 0 ? ` ⚠️ 逾期${Math.abs(remainDays)}天` : remainDays <= 2 ? ` ⏰ 剩${remainDays}天` : ''
            : '';
          md += `- 🔄 ${stageName}${dateStr ? ` (${dateStr})` : ''} — ${assignees}${remainTag}\n`;
        });
        md += '\n';
      });
    } else {
      md += '_暂无进行中任务_\n\n';
    }

    // ── Section 5: Risk & Blockers (风险与阻塞项) ──
    if (overdueTasks.length > 0 || blockedTasks.length > 0) {
      md += `## 五、⚠️ 风险清单\n\n`;
      
      if (overdueTasks.length > 0) {
        md += `### 逾期任务 (${overdueTasks.length})\n\n`;
        md += `| 任务 | 模块 | 逾期 | 负责人 | 建议 |\n| --- | --- | :---: | --- | --- |\n`;
        overdueTasks.forEach(t => {
          const overdueDays = differenceInDays(now, new Date(t.endDate!));
          const moduleName = shortenModuleName(getTopLevelParentTitle(t));
          const stageName = getShortTaskName(t);
          const suggestion = overdueDays > 5 ? '🔴 协调资源' : overdueDays > 2 ? '🟡 排查卡点' : '🟢 短期闭环';
          md += `| ${stageName} | ${moduleName} | **${overdueDays}天** | ${getAssigneeNames(t)} | ${suggestion} |\n`;
        });
        md += '\n';
      }

      if (blockedTasks.length > 0) {
        md += `### 阻塞项 (${blockedTasks.length})\n\n`;
        blockedTasks.forEach(t => {
          const reason = (t as any).blockReason || '未说明';
          const stageName = getShortTaskName(t);
          md += `- 🚫 **${stageName}** — 阻塞原因：${reason} — ${getAssigneeNames(t)}\n`;
        });
        md += '\n';
      }
    }

    // ── Section 6: Next Week Plan (下周计划) ──
    md += `## ${overdueTasks.length > 0 || blockedTasks.length > 0 ? '六' : '五'}、📅 下周计划 (${nextWeekTasks.length})\n\n`;
    if (nextWeekTasks.length > 0) {
      // Sort by start date
      const sorted = [...nextWeekTasks].sort((a, b) => {
        const aDate = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const bDate = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        return aDate - bDate;
      });
      // Group by top-level parent
      const groupedNext = new Map<string, Task[]>();
      sorted.forEach(t => {
        const moduleName = shortenModuleName(getTopLevelParentTitle(t));
        if (!groupedNext.has(moduleName)) groupedNext.set(moduleName, []);
        groupedNext.get(moduleName)!.push(t);
      });
      groupedNext.forEach((items, moduleName) => {
        md += `**📦 ${moduleName}**\n`;
        items.forEach(t => {
          const dateStr = formatDateRange(t);
          const assignees = getAssigneeNames(t);
          const stageName = getShortTaskName(t);
          const priorityTag = t.priority === 'high' ? ' 🔴' : t.priority === 'medium' ? ' 🟡' : '';
          md += `- 📌 ${stageName}${dateStr ? ` (${dateStr})` : ''}${priorityTag} — ${assignees}\n`;
        });
        md += '\n';
      });
    } else {
      md += '_暂无下周计划_\n\n';
    }

    // ── Section 7: Resource Utilization (资源利用率) ──
    const sectionNum = (overdueTasks.length > 0 || blockedTasks.length > 0) ? '七' : '六';
    md += `## ${sectionNum}、👥 团队资源概览\n\n`;
    md += `| 成员 | 类型 | 本周完成 | 进行中 | 逾期 | 负载评估 |\n| --- | :---: | :---: | :---: | :---: | --- |\n`;
    
    const activeResources = resources.filter(r => {
      const myTasks = leafTasks.filter(t => t.assigneeIds?.includes(r.id!));
      return myTasks.length > 0;
    });
    
    activeResources.forEach(r => {
      const myTasks = leafTasks.filter(t => t.assigneeIds?.includes(r.id!));
      const myInProgress = myTasks.filter(t => t.status === 'in_progress').length;
      const myDoneThisWeek = myTasks.filter(t =>
        t.status === 'done' && t.endDate &&
        isWithinInterval(new Date(t.endDate), { start: weekStart, end: weekEnd })
      ).length;
      const myOverdue = myTasks.filter(t => t.status !== 'done' && t.endDate && new Date(t.endDate) < now).length;
      const typeLabel = r.type === 'cp' ? 'CP' : '内部';
      
      let loadLabel = '';
      if (myInProgress >= 4) loadLabel = '🔴 超负荷';
      else if (myInProgress >= 3) loadLabel = '🟡 较饱和';
      else if (myInProgress >= 1) loadLabel = '🟢 正常';
      else loadLabel = '⚪ 空闲';

      md += `| ${r.name} | ${typeLabel} | ${myDoneThisWeek} | ${myInProgress} | ${myOverdue > 0 ? `⚠️ ${myOverdue}` : '0'} | ${loadLabel} |\n`;
    });
    md += '\n';

    // ── Footer ──
    md += `---\n\n`;
    md += `> 📊 本报告由项目管理工具自动生成，数据截至 ${format(now, 'yyyy-MM-dd HH:mm')}。如有疑问请联系项目负责人。\n`;

    return md;
  },

  // --- Convert Markdown weekly report to WeCom-friendly plain text ---
  convertToWeCom(md: string): string {
    const lines = md.split('\n');
    let result: string[] = [];
    let inTable = false;
    let tableRows: string[][] = [];
    let colWidths: number[] = [];
    let alignments: string[] = [];

    const flushTable = () => {
      if (tableRows.length === 0) return;
      // Calculate column widths (accounting for wide CJK chars)
      const displayWidth = (s: string): number => {
        let w = 0;
        for (const ch of s) {
          // CJK, emoji and fullwidth chars count as 2
          const code = ch.codePointAt(0) || 0;
          if (code > 0x2E7F || (code >= 0x1F00 && code <= 0x1FFFF)) w += 2;
          else w += 1;
        }
        return w;
      };
      const padCell = (s: string, targetWidth: number): string => {
        const dw = displayWidth(s);
        const padding = Math.max(0, targetWidth - dw);
        return s + ' '.repeat(padding);
      };

      colWidths = [];
      for (const row of tableRows) {
        row.forEach((cell, i) => {
          const w = displayWidth(cell);
          colWidths[i] = Math.max(colWidths[i] || 0, w);
        });
      }

      // Header row
      if (tableRows.length > 0) {
        const header = tableRows[0].map((c, i) => padCell(c, colWidths[i])).join('  ');
        result.push(header);
        // Separator line
        const sep = colWidths.map(w => '─'.repeat(w)).join('──');
        result.push(sep);
        // Data rows
        for (let r = 1; r < tableRows.length; r++) {
          const row = tableRows[r].map((c, i) => padCell(c, colWidths[i])).join('  ');
          result.push(row);
        }
      }
      result.push('');
      tableRows = [];
      colWidths = [];
      inTable = false;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip markdown separator rows (| --- | --- |)
      if (/^\|[\s\-:]+(\|[\s\-:]+)+\|?\s*$/.test(trimmed)) {
        continue;
      }

      // Table row: starts and ends with |
      if (/^\|.*\|/.test(trimmed)) {
        inTable = true;
        const cells = trimmed
          .replace(/^\|/, '').replace(/\|$/, '')
          .split('|')
          .map(c => c.trim().replace(/\*\*/g, ''));
        tableRows.push(cells);
        continue;
      }

      // If we were in a table but this line is not a table row, flush
      if (inTable) {
        flushTable();
      }

      // Transform heading lines
      if (trimmed.startsWith('# ')) {
        const text = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
        result.push('');
        result.push(`${'═'.repeat(30)}`);
        result.push(text);
        result.push(`${'═'.repeat(30)}`);
        result.push('');
        continue;
      }
      if (trimmed.startsWith('## ')) {
        const text = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
        result.push('');
        result.push(`【${text}】`);
        result.push('');
        continue;
      }
      if (trimmed.startsWith('### ')) {
        const text = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
        result.push(`▸ ${text}`);
        result.push('');
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('> ')) {
        result.push(trimmed.replace(/^>\s*/, '  '));
        continue;
      }

      // Horizontal rule
      if (trimmed === '---') {
        result.push('─'.repeat(36));
        continue;
      }

      // Bold text cleanup
      let processed = trimmed.replace(/\*\*([^*]+)\*\*/g, '$1');
      // Italic cleanup
      processed = processed.replace(/_([^_]+)_/g, '$1');

      result.push(processed);
    }

    // Flush any remaining table
    if (inTable) flushTable();

    // Remove excessive blank lines (max 2 consecutive)
    const final: string[] = [];
    let blankCount = 0;
    for (const line of result) {
      if (line.trim() === '') {
        blankCount++;
        if (blankCount <= 2) final.push(line);
      } else {
        blankCount = 0;
        final.push(line);
      }
    }

    return final.join('\n').trim();
  },

  // --- Weekly Report Download ---
  async downloadWeeklyReport(weekOffset = 0): Promise<void> {
    const md = await this.exportWeeklyReport(weekOffset);
    const now = new Date();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-report-${format(now, 'yyyyMMdd')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // --- CSV Export (tasks only) ---
  async exportCSV(): Promise<void> {
    const tasks = await db.tasks.toArray();
    const resources = await db.resources.toArray();

    const headers = [
      'ID', 'Title', 'Status', 'Priority', 'Type',
      'Start Date', 'End Date', 'Progress',
      'Assignees', 'Parent ID', 'Dependencies',
    ];

    const rows = tasks.map(t => {
      const assigneeNames = (t.assigneeIds || [])
        .map(id => resources.find(r => r.id === id)?.name || String(id))
        .join('; ');

      return [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        t.type || '',
        t.startDate ? format(new Date(t.startDate), 'yyyy-MM-dd') : '',
        t.endDate ? format(new Date(t.endDate), 'yyyy-MM-dd') : '',
        t.progress || 0,
        `"${assigneeNames}"`,
        t.parentId || '',
        (t.dependencies || []).join('; '),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${format(new Date(), 'yyyyMMdd-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
