export type TapdEffortUnit = 'days' | 'hours';

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