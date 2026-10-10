export type TapdEffortUnit = 'days' | 'hours';

function tapdFieldText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(item => tapdFieldText(item)).find(Boolean) || '';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['label', 'name', 'text', 'value', 'id']) {
      const text = tapdFieldText(record[key]);
      if (text) return text;
    }
    return '';
  }
  return String(value ?? '').trim();
}

/** Locate TAPD fields whose configured display label is “模块分类”. */
export function findTapdModuleCategoryFields(labels: Record<string, unknown>): string[] {
  const fields = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    Object.entries(value as Record<string, unknown>).forEach(([fieldName, label]) => {
      // TAPD may return either a plain label or an option descriptor such as
      // { label: '模块分类', options: ... }. Keep the owning field name.
      if (!['label', 'name', 'text', 'value', 'options', 'option', 'values'].includes(fieldName)
        && tapdFieldText(label) === '模块分类') fields.add(fieldName);
      if (label && typeof label === 'object') visit(label);
    });
  };
  visit(labels);
  return [...fields];
}

/**
 * Resolve the visible module category from TAPD.
 * Project custom fields take precedence, followed by the standard module field,
 * then the category_id-to-name lookup returned by /story_categories.
 */
export function getTapdModuleCategoryValue(
  story: Record<string, unknown>,
  fieldNames: Iterable<string>,
  categoryNames: ReadonlyMap<string, string> = new Map()
): string | undefined {
  for (const fieldName of fieldNames) {
    const value = tapdFieldText(story[fieldName]);
    if (value) return value;
  }
  const standardModule = tapdFieldText(story.module);
  if (standardModule) return standardModule;
  const categoryId = tapdFieldText(story.category_id);
  return categoryId ? categoryNames.get(categoryId) : undefined;
}

/** Resolve the display name of a TAPD work-item type without leaking its numeric ID into the UI. */
export function getTapdWorkitemTypeName(
  story: Record<string, unknown>,
  typeNames: ReadonlyMap<string, string> = new Map()
): string | undefined {
  const directName = tapdFieldText(story.workitem_type_name ?? story.workitem_type);
  if (directName && !/^\d+$/.test(directName)) return directName;
  const typeId = tapdFieldText(story.workitem_type_id);
  return typeId ? typeNames.get(typeId) || directName || undefined : directName || undefined;
}

export function parseTapdDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : new Date(value.getTime());
  const text = String(value ?? '').trim();
  if (!text || text === '0000-00-00') return undefined;

  const dateOnly = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) return parsed;
    return undefined;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Format a TAPD calendar field in local time so midnight never shifts to the previous UTC day. */
export function formatTapdCalendarDate(value: unknown): string | undefined {
  const parsed = parseTapdDate(value);
  if (!parsed) return undefined;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function parseTapdEffortHours(value: unknown, unit: TapdEffortUnit = 'days', hoursPerDay = 8): number | undefined {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return undefined;
  const amount = Number.parseFloat(text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || '');
  if (!Number.isFinite(amount) || amount < 0) return undefined;

  const explicitHours = /小时|人时|h(?:ours?)?\b/.test(text);
  const explicitDays = /人天|工作日|d(?:ays?)?\b|天/.test(text);
  const multiplier = explicitHours ? 1 : (explicitDays || unit === 'days' ? Math.max(0.1, hoursPerDay) : 1);
  return Math.round(amount * multiplier * 100) / 100;
}
