import React, { useEffect, useState } from 'react';
import { useToastStore, Toast as ToastItem } from '../../store/useToastStore';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: {
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    icon: 'text-emerald-400',
    bar: 'bg-emerald-400',
  },
  error: {
    bg: 'bg-red-500/10 border-red-500/30',
    icon: 'text-red-400',
    bar: 'bg-red-400',
  },
  warning: {
    bg: 'bg-amber-500/10 border-amber-500/30',
    icon: 'text-amber-400',
    bar: 'bg-amber-400',
  },
  info: {
    bg: 'bg-blue-500/10 border-blue-500/30',
    icon: 'text-blue-400',
    bar: 'bg-blue-400',
  },
};

function ToastItemComponent({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  const Icon = iconMap[toast.type];
  const colors = colorMap[toast.type];

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration!) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [toast.duration]);

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => removeToast(toast.id), 300);
    }, toast.duration - 300);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  return (
    <div
      className={
        `relative overflow-hidden flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-xl shadow-lg shadow-black/20 transition-all duration-300 ease-out ${colors.bg} ${isExiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'}`
      }
      style={{ minWidth: '280px', maxWidth: '400px' }}
    >      <Icon size={18} className={colors.icon + ' flex-shrink-0'} />
      <span className="text-sm text-gray-200 flex-1">{toast.message}</span>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(() => removeToast(toast.id), 300);
        }}
        className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
      {toast.duration && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800/50">
          <div
            className={'h-full ' + colors.bar + ' transition-all duration-100 ease-linear'}
            style={{ width: progress + '%' }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-auto">
      {toasts.map((t) => (
        <ToastItemComponent key={t.id} toast={t} />
      ))}
    </div>
  );
}
