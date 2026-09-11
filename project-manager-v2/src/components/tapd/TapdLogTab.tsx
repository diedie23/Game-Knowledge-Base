/**
 * TapdLogTab — Sync log display panel
 */
import React from 'react';
import { History } from 'lucide-react';

interface LogEntry {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  time: number;
}

interface Props {
  syncLog: LogEntry[];
}

export function TapdLogTab({ syncLog }: Props) {
  if (syncLog.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <History size={32} className="mx-auto text-gray-700 mb-3" />
          <div className="text-sm text-gray-500">暂无同步日志</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {syncLog.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-white/5 transition-all duration-200">
          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
            entry.type === 'success' ? 'bg-emerald-400' :
            entry.type === 'warning' ? 'bg-amber-400' :
            entry.type === 'error' ? 'bg-red-400' :
            'bg-gray-600'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-300 leading-relaxed break-all">{entry.message}</div>
            <div className="text-[9px] text-gray-600 mt-0.5 font-mono tabular-nums">
              {new Date(entry.time).toLocaleTimeString('zh-CN')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
