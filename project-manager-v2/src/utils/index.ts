/**
 * LocalPM — Shared utility functions
 * Extracted common helpers for use across components
 */

/**
 * Stable numeric hash of a string (for deterministic color assignment, etc.)
 * Uses simple char-code summation — fast, consistent, no crypto overhead.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Extract a short display name from a task title.
 * Splits on common delimiters (—, -, :, ：) and returns the last segment trimmed.
 * Falls back to the full title if no delimiter found.
 *
 * @example getDisplayName("首页 — UI设计") => "UI设计"
 * @example getDisplayName("UI设计") => "UI设计"
 */
export function getDisplayName(title: string): string {
  const parts = title.split(/[—\-:：]/);
  return (parts[parts.length - 1] || title).trim();
}

/**
 * Tiny className merger — combines strings, filters falsy values.
 * Lighter alternative to clsx/classnames for this project's needs.
 *
 * @example cn('base', isActive && 'active', undefined) => "base active"
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Clamp a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format a number of days into a human-readable Chinese duration string.
 *
 * @example formatDuration(3) => "3天"
 * @example formatDuration(0) => "今天"
 * @example formatDuration(-2) => "已逾期2天"
 */
export function formatDuration(days: number): string {
  if (days === 0) return '今天';
  if (days < 0) return `已逾期${Math.abs(days)}天`;
  return `${days}天`;
}

/**
 * Deterministic pick from an array based on a string key.
 * Useful for assigning colors, icons, etc. by name.
 *
 * @example pickByName(['red','blue','green'], 'Alice') => 'green' (stable result)
 */
export function pickByName<T>(items: T[], name: string): T {
  return items[hashString(name) % items.length];
}
