/**
 * TapdConflictsTab — Conflict resolution panel for TAPD sync
 */
import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, GitMerge } from 'lucide-react';
import type { SyncConflict } from '../../types';

interface Props {
  unresolvedConflicts: SyncConflict[];
  onResolveConflict: (conflict: SyncConflict, resolution: 'local' | 'remote') => void;
}

export function TapdConflictsTab({ unresolvedConflicts, onResolveConflict }: Props) {
  if (unresolvedConflicts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-500/50 mb-3" />
          <div className="text-sm text-gray-400">没有未解决的冲突</div>
          <div className="text-xs text-gray-600 mt-1">所有数据已保持一致</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        以下记录在本地和远程同时被修改，请选择保留哪个版本：
      </div>
      {unresolvedConflicts.map(conflict => (
        <ConflictCard
          key={conflict.id}
          conflict={conflict}
          onResolve={onResolveConflict}
        />
      ))}
    </div>
  );
}

// ─── Conflict Resolution Card ───
function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: SyncConflict;
  onResolve: (conflict: SyncConflict, resolution: 'local' | 'remote') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800/40 backdrop-blur-sm rounded-lg border border-amber-500/20 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-800/60 transition-all duration-200"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={13} className="text-gray-500" /> : <ChevronRight size={13} className="text-gray-500" />}
        <GitMerge size={13} className="text-amber-400" />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-300 font-medium">
            {conflict.table === 'tasks' ? '任务' : '成员'} #{conflict.recordId}
          </span>
          <span className="text-[10px] text-amber-400/70 ml-2">
            {conflict.conflictFields.length} 个字段冲突
          </span>
        </div>
        <div className="text-[10px] text-gray-600 font-mono tabular-nums">
          {new Date(conflict.detectedAt).toLocaleDateString('zh-CN')}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-2">
          <div className="space-y-1.5">
            {conflict.conflictFields.map(field => (
              <div key={field} className="grid grid-cols-[80px_1fr_1fr] gap-1.5 text-[10px]">
                <div className="text-gray-500 font-medium py-1">{field}</div>
                <div className="bg-blue-500/10 border border-blue-500/15 rounded px-2 py-1 text-blue-300 truncate">
                  本地: {JSON.stringify(conflict.localVersion?.[field]) || '—'}
                </div>
                <div className="bg-purple-500/10 border border-purple-500/15 rounded px-2 py-1 text-purple-300 truncate">
                  远程: {JSON.stringify(conflict.remoteVersion?.[field]) || '—'}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onResolve(conflict, 'local')}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[10px] font-medium rounded-md transition-all duration-200 border border-blue-500/20 hover:-translate-y-0.5"
            >
              保留本地版本
            </button>
            <button
              onClick={() => onResolve(conflict, 'remote')}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 text-[10px] font-medium rounded-md transition-all duration-200 border border-purple-500/20 hover:-translate-y-0.5"
            >
              采用远程版本
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
