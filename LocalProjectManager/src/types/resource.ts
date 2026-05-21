// ─── Resource ────────────────────────────────────────────────────

export type ResourceType = 'internal' | 'cp';

/** Avatar display style presets */
export type AvatarStyle = 'circle' | 'rounded' | 'hexagon' | 'diamond' | 'shield';

export const AVATAR_STYLES: { value: AvatarStyle; label: string; desc: string }[] = [
  { value: 'rounded', label: '圆角方形', desc: '默认样式' },
  { value: 'circle', label: '圆形', desc: '经典圆形' },
  { value: 'hexagon', label: '六边形', desc: '独特几何' },
  { value: 'diamond', label: '菱形', desc: '棱角分明' },
  { value: 'shield', label: '盾牌', desc: '徽章风格' },
];

export interface Resource {
  id?: number;
  name: string;
  role: string;
  avatar?: string;
  sortOrder?: number;
  /** 'internal' = 内部成员, 'cp' = CP外包方 */
  type?: ResourceType;
  /** Avatar display style */
  avatarStyle?: AvatarStyle;
  /** 成员状态：'active' = 正常, 'wfh' = 居家办公, 'sick' = 身体欠佳, 'leave' = 休假中, 'focus' = 专注模式, 'departed' = 已离职 */
  status?: 'active' | 'wfh' | 'sick' | 'leave' | 'focus' | 'departed';
  /** 休假日期列表，格式为 YYYY-MM-DD */
  leaveDates?: string[];
  /** TAPD账号名（英文ID），用于同步时自动匹配处理人 */
  tapdAccount?: string;
  /** 项目组/团队分组（如 "2D Avatar"、"轻舟编辑器"、"UGC小游戏"、"元梦之星"） */
  group?: string;
  /** 入职日期，格式为 YYYY-MM-DD */
  joinDate?: string;
  /** 离职日期，格式为 YYYY-MM-DD */
  departDate?: string;
}

/**
 * Check if a resource is on leave TODAY based on leaveDates array.
 * Only returns true when today's date is in the leaveDates list,
 * preventing misleading leave indicators for future leave dates.
 */
export function isOnLeaveToday(resource: Resource): boolean {
  if (!resource.leaveDates || resource.leaveDates.length === 0) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return resource.leaveDates.includes(todayStr);
}

/**
 * Get the effective display status for a resource.
 * If the resource has leaveDates containing today, returns 'leave'.
 * Otherwise returns the resource's actual status (excluding 'leave' from static status).
 */
export function getEffectiveStatus(resource: Resource): Resource['status'] {
  // Departed status always takes priority
  if (resource.status === 'departed') return 'departed';
  if (isOnLeaveToday(resource)) return 'leave';
  // If status was set to 'leave' but today is not a leave day, treat as 'active'
  if (resource.status === 'leave') return 'active';
  return resource.status;
}

/**
 * Check if a resource is departed (left the team).
 */
export function isResourceDeparted(resource: Resource): boolean {
  return resource.status === 'departed';
}

/**
 * Filter out departed resources from a list (for assignment selectors).
 */
export function getActiveResources(resources: Resource[]): Resource[] {
  return resources.filter(r => r.status !== 'departed');
}
