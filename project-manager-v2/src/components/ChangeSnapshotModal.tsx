import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { db } from '../db/db';
import { useStore } from '../store/useStore';

export const ChangeSnapshotModal = () => {
  const { isSnapshotModalOpen, closeSnapshotModal } = useStore();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');

  if (!isSnapshotModalOpen) return null;

  const handleSave = async () => {
    if (!reason.trim()) return;

    await db.changeSnapshots.add({
      id: crypto.randomUUID(),
      date: Date.now(),
      reason: reason.trim(),
      description: description.trim()
    });

    closeSnapshotModal();
    setReason('');
    setDescription('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a1d27] rounded-xl shadow-2xl w-full max-w-md border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">记录变更快照</h2>
          <button
            onClick={closeSnapshotModal}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              变更原因 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：主PM要求加入新功能A"
              className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              详细说明 (可选)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充说明变更的具体影响或细节..."
              className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 h-24 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800 bg-gray-900/30">
          <button
            onClick={closeSnapshotModal}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!reason.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save size={16} />
            保存快照
          </button>
        </div>
      </div>
    </div>
  );
};
