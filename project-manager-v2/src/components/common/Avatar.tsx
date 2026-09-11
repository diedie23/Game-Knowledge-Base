import React from 'react';
import { Building2 } from 'lucide-react';
import type { AvatarStyle } from '../../types/resource';
import { getRoleColor } from '../gantt/constants';

// Backward-compatible: getMemberColor now delegates to the canonical getRoleColor
export function getMemberColor(role: string) {
  return getRoleColor(role);
}

const SIZE_MAP = {
  xs: { wh: 24, text: 'text-[10px]', ring: 'ring-1', cpIcon: 7 },
  sm: { wh: 28, text: 'text-[11px]', ring: 'ring-1', cpIcon: 8 },
  md: { wh: 32, text: 'text-xs', ring: 'ring-1', cpIcon: 8 },
  lg: { wh: 56, text: 'text-sm', ring: 'ring-2', cpIcon: 12 },
} as const;

// Gradient direction varies by style for visual diversity
const GRADIENT_DIRS: Record<AvatarStyle, string> = {
  rounded: '135deg',
  circle: '180deg',
  hexagon: '45deg',
  diamond: '0deg',
  shield: '160deg',
};

// Clip-path definitions for non-standard shapes
const CLIP_PATHS: Partial<Record<AvatarStyle, string>> = {
  hexagon: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
  diamond: 'polygon(50% 4%, 96% 50%, 50% 96%, 4% 50%)',
  shield: 'polygon(50% 0%, 100% 0%, 100% 65%, 50% 100%, 0% 65%, 0% 0%)',
};

// Border-radius for standard shapes
const BORDER_RADIUS: Record<string, string> = {
  rounded: '0.5rem',   // rounded-lg
  circle: '9999px',    // full circle
};

interface AvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  type?: 'internal' | 'cp';
  avatar?: string;
  avatarStyle?: AvatarStyle;
  showStatus?: boolean;
  status?: 'online' | 'busy' | 'offline';
  className?: string;
  /** Custom tooltip text (overrides default name tooltip) */
  tooltip?: string;
  /** Role for color assignment */
  role?: string;
}

export function Avatar({
  name,
  size = 'sm',
  type = 'internal',
  avatar,
  avatarStyle = 'rounded',
  showStatus = false,
  status = 'offline',
  className = '',
  tooltip,
  role = '其他',
}: AvatarProps) {
  const sizeConfig = SIZE_MAP[size];
  const color = getRoleColor(role);
  const isEnglish = /^[a-zA-Z\s]+$/.test(name);
  // Always extract last 2 characters for Chinese names, first 2 for English
  const displayName = name.length <= 2 
    ? name 
    : (isEnglish ? name.slice(0, 2).toUpperCase() : name.slice(-2));
  const isCp = type === 'cp';
  const titleText = tooltip || `${name}${isCp ? ' (CP)' : ''}${role ? ` · ${role}` : ''}`;
  const gradDir = GRADIENT_DIRS[avatarStyle] || '135deg';
  const clipPath = CLIP_PATHS[avatarStyle];
  const borderRadius = BORDER_RADIUS[avatarStyle] || '0.5rem';

  const wh = sizeConfig.wh;
  const whClass = `w-[${wh}px] h-[${wh}px]`;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${sizeConfig.text} font-bold text-white overflow-visible shrink-0 ${className}`}
      style={{ width: wh, height: wh }}
      title={titleText}
    >
      <div
        className={`flex items-center justify-center ${sizeConfig.text} font-bold text-white overflow-hidden shadow-md`}
        style={{
          width: wh,
          height: wh,
          borderRadius: clipPath ? undefined : borderRadius,
          clipPath: clipPath || undefined,
          background: isCp
            ? `linear-gradient(${gradDir}, #059669, #10b981)`
            : `linear-gradient(${gradDir}, ${color.from}, ${color.to})`,
          boxShadow: `0 2px 8px ${color.from}30`,
          // Ring effect via box-shadow for clipped shapes
          ...(clipPath ? {} : {
            outline: isCp ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
          }),
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          displayName
        )}
      </div>
      {/* CP indicator */}
      {isCp && size !== 'xs' && (
        <div title="外部供应商(CP)" className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-600 rounded-full flex items-center justify-center border border-gray-900">
          <Building2 size={sizeConfig.cpIcon} className="text-white" />
        </div>
      )}
      {/* Status indicator */}
      {showStatus && (
        <div
          title={status === 'online' ? '在线' : status === 'busy' ? '忙碌' : '离线'}
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
            status === 'online'
              ? 'bg-emerald-400'
              : status === 'busy'
              ? 'bg-amber-400'
              : 'bg-gray-500'
          }`}
        />
      )}
    </div>
  );
}
