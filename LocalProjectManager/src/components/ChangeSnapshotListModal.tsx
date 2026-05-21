import React from 'react';
import { X, Clock, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { db } from '../db/db';
import { useStore } from '../store/useStore';
import { confirmDialog } from './common/ConfirmDialog';

export const ChangeSnapshotListModal = () => {
  const { isSnapshotListModalOpen, closeSnapshotListModal } = useStore();
  
  const snapshots = useLiveQuery(
    () => db.changeSnapshots.orderBy('date').reverse().toArray(),
    []
  );

  if (!isSnapshotListModalOpen) return null;

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: '删除快照', message: '确定要删除这条快照记录吗？', type: 'danger', confirmText: '删除' });
    if (ok) {
      await db.changeSnapshots.delete(id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a1d27] rounded-xl shadow-2xl w-full max-w-2xl border border-gray-800 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="text-indigo-400" size={20} />
            <h2 className="text-lg font-semibold text-white">变更快照记录</h2>
          </div>
          <button
            onClick={closeSnapshotListModal}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
          {!snapshots || snapshots.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock size={48} className="mx-auto mb-4 opacity-20" />
              <p>暂无变更快照记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-medium text-white">
                          {snapshot.reason}
                        </span>
                        <span className="text-xs text-gray-500">
                          {format(snapshot.date, 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                        </span>
                      </div>
                      {snapshot.description && (
                        <p className="text-sm text-gray-400 whitespace-pre-wrap">
                          {snapshot.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(snapshot.id)}
                      className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                      title="删除记录"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
