// ─── Unified Theme Constants ────────────────────────────────────
// Single source of truth for all color/style constants used across the app.
// Previously duplicated in: gantt/constants.ts, Sidebar.tsx, Dashboard.tsx,
// ResourceMatrix.tsx, sidebar/hooks/useMemberStats.ts, common/Avatar.tsx

// ─── Role Badge Styles ──────────────────────────────────────────
// Semantic badge styling for member roles (keyword-based matching).
// Master list — Dashboard.tsx 13-entry version (most complete).

export interface RoleBadgeStyle {
  keywords: string[];
  cls: string;
}

export const ROLE_BADGE_STYLES: RoleBadgeStyle[] = [
  { keywords: ['UI', 'ui', '视觉'],           cls: 'text-violet-300 bg-violet-500/15 border-violet-500/25' },
  { keywords: ['UX', 'ux', '交互', '体验'],    cls: 'text-amber-300 bg-amber-500/15 border-amber-500/25' },
  { keywords: ['前端', 'Frontend', 'FE'],       cls: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/25' },
  { keywords: ['后端', 'Backend', 'BE', '服务端'], cls: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25' },
  { keywords: ['测试', 'QA', 'Test'],           cls: 'text-teal-300 bg-teal-500/15 border-teal-500/25' },
  { keywords: ['产品', 'PM', '策划'],           cls: 'text-blue-300 bg-blue-500/15 border-blue-500/25' },
  { keywords: ['动效', '动画', 'Motion'],       cls: 'text-rose-300 bg-rose-500/15 border-rose-500/25' },
  { keywords: ['开发', 'Dev', '工程'],          cls: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/25' },
  { keywords: ['设计', 'Design'],               cls: 'text-pink-300 bg-pink-500/15 border-pink-500/25' },
  { keywords: ['运维', 'Ops', 'DevOps'],        cls: 'text-orange-300 bg-orange-500/15 border-orange-500/25' },
  { keywords: ['平面', '视觉'],                 cls: 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/25' },
  { keywords: ['相关'],                         cls: 'text-gray-300 bg-gray-500/15 border-gray-500/25' },
  { keywords: ['Layout', 'layout'],             cls: 'text-sky-300 bg-sky-500/15 border-sky-500/25' },
];

const DEFAULT_ROLE_BADGE_CLS = 'text-gray-400 bg-gray-500/15 border-gray-500/25';

export function getRoleBadgeStyle(role: string): string {
  for (const style of ROLE_BADGE_STYLES) {
    if (style.keywords.some(kw => role.includes(kw))) {
      return style.cls;
    }
  }
  return DEFAULT_ROLE_BADGE_CLS;
}

// ─── Simple Task Type Color (value only) ────────────────────────
// Lightweight version: returns only the hex color string.
// Used by Sidebar and useMemberStats for quick color lookups.
// The full TaskTypeColor (with bg/border/label) lives in gantt/constants.ts.

export interface SimpleTaskTypeColor {
  keywords: string[];
  color: string;
}

export const SIMPLE_TASK_TYPE_COLORS: SimpleTaskTypeColor[] = [
  { keywords: ['交互'], color: '#c48a3c' },
  { keywords: ['功能蓝图', '功能'], color: '#3d9470' },
  { keywords: ['UI设计', 'UI', 'ui'], color: '#5b5fc7' },
  { keywords: ['正式蓝图', '蓝图'], color: '#3a9aaa' },
  { keywords: ['动效', '动画'], color: '#c75a6e' },
  { keywords: ['测试', 'QA'], color: '#b06090' },
  { keywords: ['开发', '编码'], color: '#4a7ec4' },
];

const DEFAULT_TASK_TYPE_COLOR_VALUE = '#6b7280';

export function getTaskTypeColorValue(title: string): string {
  for (const type of SIMPLE_TASK_TYPE_COLORS) {
    if (type.keywords.some(kw => title.includes(kw))) {
      return type.color;
    }
  }
  return DEFAULT_TASK_TYPE_COLOR_VALUE;
}
