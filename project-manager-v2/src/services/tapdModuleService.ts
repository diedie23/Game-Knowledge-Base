import { db } from '../db/db';

/**
 * Reclassify modules for all tasks in a project.
 * Extracts module name from task titles (bracket tags like 【xxx】) and updates the module field.
 * Also propagates module from child tasks to parent tasks if parent has no module.
 * This is useful for existing tasks that were synced before the module feature was added.
 */
export async function reclassifyModules(projectId?: number): Promise<{ updated: number; total: number }> {
  const allTasks = projectId
    ? await db.tasks.where('projectId').equals(projectId).toArray()
    : await db.tasks.toArray();

  let updated = 0;

  // Phase 1: Extract module from title for all tasks
  for (const task of allTasks) {
    if (!task.module) {
      const newModule = extractModuleFromTitle(task.title);
      if (newModule) {
        await db.tasks.update(task.id!, { module: newModule });
        task.module = newModule; // Update in-memory for Phase 2
        updated++;
      }
    }
  }

  // Phase 2: Propagate module from children to parent (if parent has no module)
  for (const task of allTasks) {
    if (!task.module && !task.parentId) {
      // This is a root task without module - check if any child has a module
      const children = allTasks.filter(t => t.parentId === task.id);
      const childModule = children.find(c => c.module)?.module;
      if (childModule) {
        await db.tasks.update(task.id!, { module: childModule });
        task.module = childModule;
        updated++;
      }
    }
  }

  console.log(`[TapdService] Reclassified modules: ${updated}/${allTasks.length} tasks updated`);
  return { updated, total: allTasks.length };
}

/**
 * Extract module name from a task title.
 * Looks for bracket tags like 【UGC小游戏】, 【轻舟编辑器】, 【2D Avatar】 etc.
 * Returns the first meaningful tag (skips short uppercase project codes like QZ, MX).
 */
export function extractModuleFromTitle(title: string): string | undefined {
  if (!title) return undefined;

  // Known module keywords ordered by specificity (more specific first)
  const knownModules = [
    '2D Avatar', '2DAvatar', 'UGC小游戏', '轻舟编辑器', '元梦之星',
    '外围系统', '核心玩法', '社交系统', '任务系统', '新手引导',
    'UGC', 'AI',
    '商城', '活动', '主界面', '编辑器', '地图', '角色', '装扮',
    '聊天', '好友', '公会', '匹配', '排行', '成就', '设置',
  ];

  // Normalize title for matching (strip brackets for content scanning)
  const titleLower = title.toLowerCase();

  // 1. First, scan the entire title (including text outside brackets) for specific module keywords
  // This handles cases like "【UGC】2D Avatar - xxx" where "2D Avatar" is more specific than "UGC"
  for (const mod of knownModules) {
    if (titleLower.includes(mod.toLowerCase())) {
      // Normalize: treat "2DAvatar" as "2D Avatar"
      if (mod === '2DAvatar') return '2D Avatar';
      return mod;
    }
  }

  // 2. Fallback: Extract bracket tags from title
  const bracketMatches = title.match(/[【[](.*?)[】\]]/g);
  if (!bracketMatches || bracketMatches.length === 0) return undefined;

  // Skip patterns: short uppercase codes (QZ, MX, etc.), single chars, common non-module tags
  const skipPatterns = [
    /^[A-Z]{1,4}$/, // Short uppercase codes like QZ, MX
    /^[a-z]{1,2}$/i, // Very short tags
    /^(P[0-9]|S[0-9]|v[0-9])/, // Priority/Sprint/Version tags
    /^美术$/, // Non-module category tags
    /^端外热更$/, // Non-module process tags
    /^模型生成$/, // Non-module process tags
  ];

  for (const tag of bracketMatches) {
    const content = tag.replace(/[【】[\]]/g, '').trim();
    if (!content) continue;

    // Skip if matches skip patterns
    const shouldSkip = skipPatterns.some(p => p.test(content));
    if (shouldSkip) continue;

    // Accept if length > 2 (meaningful tag)
    if (content.length > 2) {
      return content;
    }
  }

  return undefined;
}
