import React from 'react';

type EmptyVariant = 'no-tasks' | 'no-data' | 'no-members' | 'celebration' | 'search-empty' | 'no-content';

interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Inline SVG illustrations for each variant
const illustrations: Record<EmptyVariant, React.ReactNode> = {
  'no-tasks': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="35" y="15" width="50" height="65" rx="4" fill="#1e293b" stroke="#475569" strokeWidth="1.5"/>
      <rect x="45" y="10" width="30" height="10" rx="5" fill="#334155" stroke="#475569" strokeWidth="1"/>
      <rect x="43" y="32" width="34" height="3" rx="1.5" fill="#334155"/>
      <rect x="43" y="40" width="28" height="3" rx="1.5" fill="#334155"/>
      <rect x="43" y="48" width="30" height="3" rx="1.5" fill="#334155"/>
      <rect x="43" y="56" width="20" height="3" rx="1.5" fill="#334155"/>
      <circle cx="85" cy="65" r="15" fill="#0f172a" stroke="#6366f1" strokeWidth="1.5" opacity="0.9"/>
      <path d="M78 65l4 4 8-8" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="25" cy="30" r="2" fill="#6366f1" opacity="0.3"/>
      <circle cx="100" cy="25" r="1.5" fill="#8b5cf6" opacity="0.4"/>
      <circle cx="20" cy="70" r="1" fill="#06b6d4" opacity="0.3"/>
    </svg>
  ),
  'no-data': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="25" y="60" width="12" height="20" rx="2" fill="#334155" opacity="0.6"/>
      <rect x="42" y="45" width="12" height="35" rx="2" fill="#334155" opacity="0.6"/>
      <rect x="59" y="50" width="12" height="30" rx="2" fill="#334155" opacity="0.6"/>
      <rect x="76" y="55" width="12" height="25" rx="2" fill="#334155" opacity="0.6"/>
      <line x1="20" y1="82" x2="100" y2="82" stroke="#475569" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="90" cy="30" r="14" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" opacity="0.9"/>
      <text x="90" y="36" textAnchor="middle" fill="#f59e0b" fontSize="16" fontWeight="bold">?</text>
      <circle cx="15" cy="40" r="1.5" fill="#f59e0b" opacity="0.3"/>
      <circle cx="105" cy="70" r="2" fill="#6366f1" opacity="0.3"/>
    </svg>
  ),
  'no-members': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="45" cy="35" r="10" fill="#334155" stroke="#475569" strokeWidth="1"/>
      <path d="M30 70c0-8.284 6.716-15 15-15s15 6.716 15 15" fill="#334155" stroke="#475569" strokeWidth="1"/>
      <circle cx="75" cy="35" r="10" fill="#1e293b" stroke="#475569" strokeWidth="1" strokeDasharray="3 2"/>
      <path d="M60 70c0-8.284 6.716-15 15-15s15 6.716 15 15" fill="#1e293b" stroke="#475569" strokeWidth="1" strokeDasharray="3 2"/>
      <circle cx="95" cy="25" r="10" fill="#0f172a" stroke="#10b981" strokeWidth="1.5"/>
      <line x1="95" y1="20" x2="95" y2="30" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
      <line x1="90" y1="25" x2="100" y2="25" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="20" cy="55" r="1.5" fill="#10b981" opacity="0.3"/>
      <circle cx="105" cy="60" r="1" fill="#8b5cf6" opacity="0.4"/>
    </svg>
  ),
  'celebration': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M50 35h20v20c0 5.523-4.477 10-10 10s-10-4.477-10-10V35z" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5"/>
      <path d="M50 40c-5 0-10-2-10-8h10" fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.6"/>
      <path d="M70 40c5 0 10-2 10-8H70" fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.6"/>
      <rect x="55" y="65" width="10" height="8" rx="1" fill="#334155" stroke="#f59e0b" strokeWidth="1"/>
      <rect x="50" y="73" width="20" height="4" rx="2" fill="#334155" stroke="#f59e0b" strokeWidth="1"/>
      <path d="M30 25l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#f59e0b" opacity="0.6"/>
      <path d="M90 20l1.5 3 3 .75-2.25 2.25.75 3-3-1.5-3 1.5.75-3-2.25-2.25 3-.75z" fill="#8b5cf6" opacity="0.5"/>
      <path d="M95 55l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2-1.5-1.5 2-.5z" fill="#06b6d4" opacity="0.5"/>
      <path d="M25 60l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2-1.5-1.5 2-.5z" fill="#10b981" opacity="0.4"/>
      <circle cx="35" cy="45" r="2" fill="#f43f5e" opacity="0.5"/>
      <circle cx="85" cy="40" r="1.5" fill="#6366f1" opacity="0.5"/>
      <circle cx="40" cy="75" r="1" fill="#06b6d4" opacity="0.4"/>
    </svg>
  ),
  'search-empty': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="52" cy="45" r="20" fill="#0f172a" stroke="#475569" strokeWidth="2"/>
      <circle cx="52" cy="45" r="14" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 3"/>
      <line x1="66" y1="59" x2="82" y2="75" stroke="#475569" strokeWidth="3" strokeLinecap="round"/>
      <line x1="46" y1="39" x2="58" y2="51" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <line x1="58" y1="39" x2="46" y2="51" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <circle cx="90" cy="30" r="2" fill="#6366f1" opacity="0.3"/>
      <circle cx="25" cy="70" r="1.5" fill="#8b5cf6" opacity="0.3"/>
      <circle cx="95" cy="65" r="1" fill="#06b6d4" opacity="0.4"/>
    </svg>
  ),
  'no-content': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="35" y="15" width="45" height="60" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1.5"/>
      <path d="M65 15v12h15" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="72" y="50" width="6" height="28" rx="1" fill="#334155" stroke="#6366f1" strokeWidth="1" transform="rotate(-30 72 50)"/>
      <path d="M68 73l-3 8 8-3" fill="#6366f1" opacity="0.6"/>
      <rect x="43" y="35" width="25" height="2.5" rx="1.25" fill="#334155"/>
      <rect x="43" y="42" width="20" height="2.5" rx="1.25" fill="#334155"/>
      <rect x="43" y="49" width="22" height="2.5" rx="1.25" fill="#334155"/>
      <circle cx="25" cy="35" r="1.5" fill="#6366f1" opacity="0.3"/>
      <circle cx="100" cy="45" r="2" fill="#8b5cf6" opacity="0.3"/>
    </svg>
  ),
};

const sizeConfig = {
  sm: { wrapper: 'py-4', icon: 'w-12 h-12', title: 'text-xs', desc: 'text-[10px]' },
  md: { wrapper: 'py-8', icon: 'w-20 h-20', title: 'text-sm', desc: 'text-xs' },
  lg: { wrapper: 'py-12', icon: 'w-28 h-28', title: 'text-base', desc: 'text-sm' },
};

const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'no-tasks',
  title,
  description,
  size = 'md',
  className = '',
}) => {
  const config = sizeConfig[size];

  return (
    <div className={`flex flex-col items-center justify-center ${config.wrapper} ${className}`}>
      <div className={`${config.icon} mb-3 opacity-60`}>        {illustrations[variant]}
      </div>
      {title && (
        <p className={`${config.title} text-gray-400 font-medium mb-1`}>{title}</p>
      )}
      {description && (
        <p className={`${config.desc} text-gray-600`}>{description}</p>
      )}
    </div>
  );
};

export default EmptyState;
