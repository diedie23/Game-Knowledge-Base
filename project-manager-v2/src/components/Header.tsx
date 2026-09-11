import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { BarChart2, Calendar, Columns, Table as TableIcon, Plus, Link as LinkIcon, Search, Undo2, Redo2, History, Clock, Wifi, WifiOff, RefreshCw, Download, Upload, FileDown, Copy, Check, LayoutDashboard, BookOpen } from 'lucide-react';
import { useSyncStore } from '../store/useSyncStore';
import { dataExportService, BACKUP_STORAGE_KEY } from '../services/dataExportService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { toast } from '../store/useToastStore';

export function Header() {
  const { currentView, setCurrentView, openTaskModal, openTapdModal, selectedProjectId } = useStore();
  const { canUndo, canRedo, undo, redo, undoStack, redoStack } = useHistoryStore();
  const { isOnline, syncStatus, pendingChanges } = useSyncStore();
  const [showHistory, setShowHistory] = useState(false);
  const [showDataMenu, setShowDataMenu] = useState(false);
  const [showWeeklyReportModal, setShowWeeklyReportModal] = useState(false);
  const [weeklyReportContent, setWeeklyReportContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedWeCom, setCopiedWeCom] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(
    localStorage.getItem(BACKUP_STORAGE_KEY)
  );
  
  // Dynamic project name from DB based on selected project
  const project = useLiveQuery(
    () => selectedProjectId ? db.projects.get(selectedProjectId) : db.projects.toCollection().first(),
    [selectedProjectId]
  );
  const projectName = project?.name || '项目 Alpha';
  const projectInitial = projectName.charAt(0).toUpperCase();
  const projectStatus = project?.status;
  const historyRef = useRef<HTMLDivElement>(null);
  const dataMenuRef = useRef<HTMLDivElement>(null);
  const dataMenuBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close history panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        const historyPortalEl = (historyRef.current as any).__portalEl;
        if (!historyPortalEl || !historyPortalEl.contains(e.target as Node)) {
          setShowHistory(false);
        }
      }
      if (dataMenuRef.current && !dataMenuRef.current.contains(e.target as Node)) {
        const portalEl = (dataMenuRef.current as any).__portalEl;
        if (!portalEl || !portalEl.contains(e.target as Node)) {
          setShowDataMenu(false);
        }
      }
    };
    if (showHistory || showDataMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory, showDataMenu]);

  const handleExportJSON = async () => {
    await dataExportService.exportJSON();
    setLastBackupTime(new Date().toISOString());
    setShowDataMenu(false);
  };

  const handleExportCSV = async () => {
    await dataExportService.exportCSV();
    setShowDataMenu(false);
  };

  const handleExportWeeklyReport = async () => {
    const md = await dataExportService.exportWeeklyReport(0);
    setWeeklyReportContent(md);
    setShowWeeklyReportModal(true);
    setShowDataMenu(false);
  };

  const handleImportJSON = () => {
    fileInputRef.current?.click();
    setShowDataMenu(false);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await dataExportService.importJSON(file);
      toast.success(`导入成功！共导入 ${result.tasks} 个任务、${result.resources} 个资源、${result.projects} 个项目`);
      window.location.reload();
    } catch (err: any) {
      toast.error(`导入失败：${err.message}`);
    }
    e.target.value = '';
  };

  const views = [
    { id: 'dashboard', name: '仪表盘', icon: LayoutDashboard },
    { id: 'gantt', name: '甘特图', icon: Calendar },
    { id: 'board', name: '看板', icon: Columns },
    { id: 'matrix', name: '矩阵', icon: BarChart2 },
    { id: 'table', name: '表格', icon: TableIcon },
    { id: 'notes', name: '记事本', icon: BookOpen },
  ] as const;

  return (
    <div className="h-14 border-b border-gray-800/80 bg-gray-900/95 backdrop-blur-sm flex items-center px-5 sticky top-0 z-40">
      {/* Left: Logo + Project Name + View Tabs */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-indigo-500/20">
            {projectInitial}
          </div>
          <h2 className="text-base font-bold text-white tracking-tight truncate max-w-[120px]">{projectName}</h2>
          {projectStatus === 'paused' && (
            <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full shrink-0">暂停</span>
          )}
          {projectStatus === 'archived' && (
            <span className="text-[9px] bg-gray-500/15 text-gray-400 border border-gray-500/30 px-1.5 py-0.5 rounded-full shrink-0">归档</span>
          )}
        </div>
        <div className="h-5 w-px bg-gray-800/80 shrink-0"></div>
        <nav className="flex bg-gray-950/40 rounded-lg p-0.5 border border-gray-800/40">
          {views.map((view) => {
            const Icon = view.icon;
            const isActive = currentView === view.id;
            return (
              <button
                key={view.id}
                onClick={() => setCurrentView(view.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 relative ${
                  isActive 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
                }`}
                title={view.name}
              >
                <Icon size={14} className={isActive ? 'text-indigo-400' : ''} />
                <span className="hidden xl:inline">{view.name}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center: Search (flex-1 to push to center) */}
      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-700/70 text-gray-400 hover:text-gray-200 text-xs rounded-lg transition-all duration-200 border border-gray-700/40 hover:border-gray-600 w-full max-w-[220px]"
          title="搜索命令 (Ctrl+K)"
        >
          <Search size={13} className="text-gray-500" />
          <span className="flex-1 text-left text-[11px] text-gray-500">搜索任务或命令…</span>
          <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-700/50 border border-gray-600/30 text-[9px] text-gray-500 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Undo/Redo compact group */}
        <div className="flex items-center gap-0.5 bg-gray-800/40 rounded-lg border border-gray-700/30 p-0.5" ref={historyRef}>
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            className={`p-1.5 rounded-md transition-all duration-200 ${
              canUndo ? 'text-gray-400 hover:text-white hover:bg-gray-700/70 active:scale-95' : 'text-gray-700 cursor-not-allowed'
            }`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            className={`p-1.5 rounded-md transition-all duration-200 ${
              canRedo ? 'text-gray-400 hover:text-white hover:bg-gray-700/70 active:scale-95' : 'text-gray-700 cursor-not-allowed'
            }`}
            title="重做 (Ctrl+Shift+Z)"
          >
            <Redo2 size={13} />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-md transition-all duration-200 relative ${
              showHistory ? 'text-indigo-300 bg-indigo-500/15' :
              undoStack.length > 0 ? 'text-gray-400 hover:text-white hover:bg-gray-700/70' : 'text-gray-700 cursor-not-allowed'
            }`}
            title="操作历史"
            disabled={undoStack.length === 0 && redoStack.length === 0}
          >
            <History size={13} />
            {undoStack.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 flex items-center justify-center rounded-full bg-indigo-500/30 text-indigo-300 text-[8px] font-bold px-0.5">
                {undoStack.length}
              </span>
            )}
          </button>

          {/* History dropdown panel */}
          {showHistory && (undoStack.length > 0 || redoStack.length > 0) && createPortal(
            <div
              className="fixed w-72 bg-[#1a1d2e] border border-gray-700/60 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-[9999]"
              style={{
                animation: 'historyPanelIn 0.15s ease-out',
                ...(historyRef.current ? (() => {
                  const rect = historyRef.current!.getBoundingClientRect();
                  return { top: rect.bottom + 8, right: window.innerWidth - rect.right };
                })() : { top: 64, right: 16 }),
              }}
              ref={(el) => {
                if (el && historyRef.current) {
                  (historyRef.current as any).__portalEl = el;
                }
              }}
            >
              <div className="px-4 py-3 border-b border-gray-700/40 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                  <Clock size={13} className="text-gray-500" />
                  操作历史
                </span>
                <span className="text-[10px] text-gray-500">{undoStack.length} 步可撤销</span>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {[...undoStack].reverse().map((cmd, i) => (
                  <div
                    key={cmd.id}
                    className={`px-4 py-2.5 flex items-center gap-3 text-xs transition-colors ${
                      i === 0 ? 'bg-indigo-500/10 text-indigo-200' : 'text-gray-400 hover:bg-gray-800/50'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? 'bg-indigo-400' : 'bg-gray-600'}`} />
                    <span className="truncate flex-1">{cmd.label}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">
                      {new Date(cmd.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
                {redoStack.length > 0 && (
                  <>
                    <div className="px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wider border-t border-gray-700/30 mt-1">
                      已撤销
                    </div>
                    {[...redoStack].reverse().map((cmd) => (
                      <div key={cmd.id} className="px-4 py-2 flex items-center gap-3 text-xs text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-gray-700" />
                        <span className="truncate flex-1 line-through">{cmd.label}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* TAPD + Data group */}
        <div className="flex items-center gap-0.5 bg-gray-800/40 rounded-lg border border-gray-700/30 p-0.5">
          <button 
            onClick={() => openTapdModal()}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              syncStatus === 'error' ? 'text-red-300 bg-red-500/10' :
              syncStatus === 'pushing' || syncStatus === 'pulling' ? 'text-blue-300 bg-blue-500/10' :
              pendingChanges > 0 ? 'text-amber-300 bg-amber-500/10' :
              'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
            }`}
            title="TAPD 同步中心"
          >
            {syncStatus === 'pushing' || syncStatus === 'pulling' ? (
              <RefreshCw size={12} className="text-blue-400 animate-spin" />
            ) : isOnline ? (
              <Wifi size={12} className="text-emerald-400/70" />
            ) : (
              <WifiOff size={12} className="text-red-400/70" />
            )}
            <LinkIcon size={12} className="text-blue-400" />
            <span className="hidden lg:inline">TAPD</span>
            {pendingChanges > 0 && (
              <span className="min-w-[12px] h-3 flex items-center justify-center rounded-full bg-amber-500/25 text-amber-400 text-[8px] font-bold px-0.5">
                {pendingChanges}
              </span>
            )}
          </button>
          <div className="w-px h-3.5 bg-gray-700/40" />
          <div className="relative" ref={dataMenuRef}>
            <button
              ref={dataMenuBtnRef}
              onClick={() => setShowDataMenu(!showDataMenu)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                showDataMenu ? 'text-white bg-gray-700/80' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
              }`}
              title="数据导入/导出"
            >
              <FileDown size={12} />
              <span className="hidden lg:inline">数据</span>
            </button>
            {showDataMenu && createPortal(
              <div
                className="fixed w-48 bg-[#1a1d2e] border border-gray-700/60 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-[9999]"
                style={{
                  animation: 'historyPanelIn 0.15s ease-out',
                  top: dataMenuBtnRef.current ? dataMenuBtnRef.current.getBoundingClientRect().bottom + 8 : 0,
                  left: dataMenuBtnRef.current ? dataMenuBtnRef.current.getBoundingClientRect().right - 192 : 0,
                }}
                ref={(el) => {
                  if (el && dataMenuRef.current) {
                    (dataMenuRef.current as any).__portalEl = el;
                  }
                }}
              >
                <div className="py-1">
                  {lastBackupTime && (
                    <div className="px-4 py-2 text-[10px] text-gray-500 border-b border-gray-700/30 flex items-center gap-1.5">
                      <Clock size={10} className="text-gray-600" />
                      上次备份：{new Date(lastBackupTime).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} {new Date(lastBackupTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <button onClick={handleExportJSON} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors">
                    <Download size={14} className="text-indigo-400" />
                    导出 JSON 快照
                  </button>
                  <button onClick={handleExportCSV} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors">
                    <Download size={14} className="text-emerald-400" />
                    导出 CSV
                  </button>
                  <button onClick={handleExportWeeklyReport} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors">
                    <FileDown size={14} className="text-purple-400" />
                    生成周报
                  </button>
                  <div className="h-px bg-gray-700/40 mx-3 my-1" />
                  <button onClick={handleImportJSON} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors">
                    <Upload size={14} className="text-amber-400" />
                    导入 JSON 快照
                  </button>
                </div>
              </div>,
              document.body
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>
        </div>

        {/* Primary Action: New Task */}
        <button
          onClick={() => openTaskModal()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 active:scale-95 ml-1"
        >
          <Plus size={14} />
          新建
        </button>
      </div>

      {/* Weekly Report Modal */}
      {showWeeklyReportModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar size={18} className="text-purple-400" />
                周报预览
              </h3>
              <button
                onClick={() => { setShowWeeklyReportModal(false); setCopied(false); setCopiedWeCom(false); }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="weekly-report-prose bg-gray-950/50 rounded-lg border border-gray-800/50 p-6">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold text-white mb-3 pb-2 border-b border-purple-500/30">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-semibold text-purple-300 mt-5 mb-2.5 flex items-center gap-2">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-amber-300 mt-3 mb-2">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-gray-300 leading-relaxed mb-2">{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-white">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="text-gray-500 not-italic">{children}</em>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-3 border-purple-500/40 pl-3 my-2 text-xs text-gray-500">{children}</blockquote>
                    ),
                    hr: () => (
                      <hr className="border-gray-700/50 my-4" />
                    ),
                    ul: ({ children }) => (
                      <ul className="space-y-1 mb-3 text-sm">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-gray-300 leading-relaxed pl-1">{children}</li>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4 rounded-lg border border-gray-700/40">
                        <table className="w-full text-sm border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-purple-500/10 border-b border-gray-700/50">{children}</thead>
                    ),
                    th: ({ children, style }) => (
                      <th className="px-3 py-2 text-xs font-semibold text-purple-300 uppercase tracking-wider whitespace-nowrap" style={style}>{children}</th>
                    ),
                    td: ({ children, style }) => (
                      <td className="px-3 py-2 text-sm text-gray-300 border-t border-gray-800/50 whitespace-nowrap" style={style}>{children}</td>
                    ),
                    tr: ({ children }) => (
                      <tr className="hover:bg-gray-800/30 transition-colors">{children}</tr>
                    ),
                  }}
                >
                  {weeklyReportContent}
                </ReactMarkdown>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => { setShowWeeklyReportModal(false); setCopied(false); setCopiedWeCom(false); }}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                关闭
              </button>
              <button
                onClick={async () => {
                  await dataExportService.downloadWeeklyReport(0);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Download size={14} />
                下载 .md
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(weeklyReportContent);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-all shadow-lg flex items-center gap-1.5 ${
                  copied ? 'bg-emerald-600 shadow-emerald-500/20' : 'bg-gray-600 hover:bg-gray-500 shadow-gray-500/20'
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制 Markdown'}
              </button>
              <button
                onClick={() => {
                  const plainText = dataExportService.convertToWeCom(weeklyReportContent);
                  navigator.clipboard.writeText(plainText);
                  setCopiedWeCom(true);
                  setTimeout(() => setCopiedWeCom(false), 2000);
                }}
                className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-all shadow-lg flex items-center gap-1.5 ${
                  copiedWeCom ? 'bg-emerald-600 shadow-emerald-500/20' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20'
                }`}
              >
                {copiedWeCom ? <Check size={14} /> : <Copy size={14} />}
                {copiedWeCom ? '已复制' : '复制企微版'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}