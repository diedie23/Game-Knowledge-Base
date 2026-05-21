import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';

// ─── Types ───
type DialogType = 'confirm' | 'alert' | 'warning' | 'danger';

interface DialogConfig {
  type: DialogType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConfirmStore {
  dialog: DialogConfig | null;
  showDialog: (config: DialogConfig) => void;
  closeDialog: () => void;
}

// ─── Store ───
export const useConfirmStore = create<ConfirmStore>((set) => ({
  dialog: null,
  showDialog: (config) => set({ dialog: config }),
  closeDialog: () => set({ dialog: null }),
}));

// ─── Imperative API ───

/**
 * Show a confirm dialog and return a promise that resolves to true/false.
 * Usage: const ok = await confirmDialog({ title: '...', message: '...' });
 */
export function confirmDialog(options: {
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().showDialog({
      type: options.type || 'confirm',
      title: options.title || '确认操作',
      message: options.message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      onConfirm: () => {
        useConfirmStore.getState().closeDialog();
        resolve(true);
      },
      onCancel: () => {
        useConfirmStore.getState().closeDialog();
        resolve(false);
      },
    });
  });
}

/**
 * Show an alert-style dialog (info only, single "OK" button).
 * Usage: await alertDialog({ title: '...', message: '...' });
 */
export function alertDialog(options: {
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    useConfirmStore.getState().showDialog({
      type: options.type || 'alert',
      title: options.title || '提示',
      message: options.message,
      confirmText: options.confirmText || '知道了',
      onConfirm: () => {
        useConfirmStore.getState().closeDialog();
        resolve();
      },
      onCancel: () => {
        useConfirmStore.getState().closeDialog();
        resolve();
      },
    });
  });
}

// ─── Visual Config ───
const typeConfig = {
  confirm: {
    icon: Info,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    btnColor: 'bg-indigo-600 hover:bg-indigo-500',
  },
  alert: {
    icon: CheckCircle,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    btnColor: 'bg-indigo-600 hover:bg-indigo-500',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    btnColor: 'bg-amber-600 hover:bg-amber-500',
  },
  danger: {
    icon: XCircle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    btnColor: 'bg-red-600 hover:bg-red-500',
  },
};

// ─── Component ───
export function ConfirmDialog() {
  const dialog = useConfirmStore((s) => s.dialog);
  const closeDialog = useConfirmStore((s) => s.closeDialog);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus confirm button when dialog opens
  useEffect(() => {
    if (dialog && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [dialog]);

  // Handle Escape key
  useEffect(() => {
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dialog.onCancel?.();
        closeDialog();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        dialog.onConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog, closeDialog]);

  if (!dialog) return null;

  const config = typeConfig[dialog.type];
  const Icon = config.icon;
  const isAlertOnly = dialog.type === 'alert' || !dialog.cancelText;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          dialog.onCancel?.();
          closeDialog();
        }}
      />
      {/* Dialog */}
      <div className="relative bg-[#1e1e2e] border border-gray-700/60 rounded-xl shadow-2xl shadow-black/40 w-full max-w-md mx-4 transform transition-all">
        {/* Close button */}
        <button
          onClick={() => {
            dialog.onCancel?.();
            closeDialog();
          }}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}>
              <Icon size={20} className={config.iconColor} />
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-100 mb-1.5">{dialog.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{dialog.message}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 px-6 pb-5">
          {!isAlertOnly && (
            <button
              onClick={() => {
                dialog.onCancel?.();
                closeDialog();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 rounded-lg transition-colors"
            >
              {dialog.cancelText || '取消'}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            onClick={dialog.onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${config.btnColor}`}
          >
            {dialog.confirmText || '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
