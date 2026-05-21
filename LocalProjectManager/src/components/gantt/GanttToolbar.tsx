import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { format, addDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  CalendarDays, Users, Ghost, Palette, Focus, Activity,
  ArrowLeftCircle, ArrowRightCircle,
  ZoomIn, ZoomOut, Filter, Search, X, ShieldAlert,
  Camera, History, Undo2, Redo2, Download, LayoutList,
  MoreHorizontal, ChevronDown, RefreshCw, Pause, Play, Archive
} from 'lucide-react';
import { ZOOM_PRESETS, COLOR_LEGEND, compareResources } from './constants';
import type { ZoomConfig, TaskTypeColor } from './constants';
import { useStore } from '../../store/useStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import type { Resource } from '../../types/resource';

interface GanttToolbarProps {
  startDate: Date;
  visibleDays: number;
  zoomIndex: number;
  zoomConfig: ZoomConfig;
  onNavigate: (action: number | 'today') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  usedTaskTypes: TaskTypeColor[];
  showWhatIf: boolean;
  onToggleWhatIf: () => void;
  showMemberPanel: boolean;
  onToggleMemberPanel: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  showDashboard: boolean;
  onToggleDashboard: () => void;
  filterStatus: string;
  onFilterStatusChange: (status: string) => void;
  // Member filter
  resources?: Resource[];
  selectedMemberId: number | null;
  onMemberFilterChange: (id: number | null) => void;
  // Search
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResultCount?: number;
  // Risk panel
  showRiskPanel: boolean;
  onToggleRiskPanel: () => void;
  riskCount?: number;
  // Density
  isCompact: boolean;
  onToggleDensity: () => void;
  // Export
  onExport: () => void;
  // TAPD refresh
  hasTapdConfig?: boolean;
  isTapdRefreshing?: boolean;
  onTapdRefresh?: () => void;
  // Project pause/resume
  projectStatus?: 'active' | 'paused' | 'archived';
  onPauseProject?: () => void;
  onResumeProject?: () => void;
  onArchiveProject?: () => void;
}

export const GanttToolbar = React.memo(function GanttToolbar({
  startDate,
  visibleDays,
  zoomIndex,
  zoomConfig,
  onNavigate,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  usedTaskTypes,
  showWhatIf,
  onToggleWhatIf,
  showMemberPanel,
  onToggleMemberPanel,
  focusMode,
  onToggleFocusMode,
  showDashboard,
  onToggleDashboard,
  filterStatus,
  onFilterStatusChange,
  resources,
  selectedMemberId,
  onMemberFilterChange,
  searchQuery,
  onSearchQueryChange,
  searchResultCount,
  showRiskPanel,
  onToggleRiskPanel,
  riskCount,
  isCompact,
  onToggleDensity,
  onExport,
  hasTapdConfig,
  isTapdRefreshing,
  onTapdRefresh,
  projectStatus,
  onPauseProject,
  onResumeProject,
  onArchiveProject,
}: GanttToolbarProps) {
  const [showColorLegend, setShowColorLegend] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  const legendBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const { openSnapshotModal, openSnapshotListModal } = useStore();
  const { canUndo, canRedo, undo, redo } = useHistoryStore();

  // Close legend when clicking outside
  useEffect(() => {
    if (!showColorLegend) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        legendRef.current && !legendRef.current.contains(e.target as Node) &&
        legendBtnRef.current && !legendBtnRef.current.contains(e.target as Node)
      ) {
        setShowColorLegend(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorLegend]);

  // Close more menu when clicking outside
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node) &&
        moreBtnRef.current && !moreBtnRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  return (
    <div className="px-5 py-2.5 flex items-center justify-between border-b border-gray-800/40 bg-gradient-to-b from-[#0f1119]/90 to-[#0f1119]/70 backdrop-blur-sm shrink-0 relative z-40">
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => onNavigate(-7)}
          className="p-1.5 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          title="向前一周"
        >
          <ArrowLeftCircle size={18} />
        </button>
        <button
          onClick={() => onNavigate('today')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-300 rounded-md border border-indigo-500/20 transition-colors text-xs font-medium"
          title="回到今日"
        >
          <CalendarDays size={14} />
          今日
        </button>
        <button
          onClick={() => onNavigate(7)}
          className="p-1.5 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          title="向后一周"
        >
          <ArrowRightCircle size={18} />
        </button>

        {/* Undo/Redo controls */}
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-gray-700/50">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-gray-700/50">
          <button
            onClick={onZoomOut}
            disabled={zoomIndex === 0}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="缩小 (Ctrl+滚苮↓)"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={onZoomReset}
            className="px-2 py-0.5 rounded hover:bg-gray-800 text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-colors min-w-[32px] text-center"
            title="重置缩放"
          >
            {zoomConfig.label}
          </button>
          <button
            onClick={onZoomIn}
            disabled={zoomIndex === ZOOM_PRESETS.length - 1}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="放大 (Ctrl+滚辮↑)"
          >
            <ZoomIn size={15} />
          </button>
          {/* Zoom level indicator bar */}
          <div className="flex items-center gap-[2px] ml-1" title={`缩放级别 ${zoomIndex + 1}/${ZOOM_PRESETS.length}`}>
            {ZOOM_PRESETS.map((_, i) => (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all duration-200 ${
                  i <= zoomIndex
                    ? 'bg-indigo-400/70 h-2.5'
                    : 'bg-gray-700 h-1.5'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-gray-700/50">
          <Filter size={14} className={filterStatus !== 'all' ? 'text-indigo-400' : 'text-gray-500'} />
          <select
            value={filterStatus}
            onChange={(e) => onFilterStatusChange(e.target.value)}
            className="bg-transparent border border-gray-700/50 rounded-md px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-indigo-500 cursor-pointer hover:text-gray-300 hover:border-gray-600 transition-colors"
          >
            <option value="all" className="bg-gray-900">全部任务</option>
            <option value="active" className="bg-gray-900">进行中 + 未开始</option>
            <option value="collapse_done" className="bg-gray-900">按状态分组</option>
            <option value="group_module" className="bg-gray-900">按模块分组</option>
            <option value="todo" className="bg-gray-900">仅未开始</option>
            <option value="in_progress" className="bg-gray-900">仅进行中</option>
            <option value="done" className="bg-gray-900">仅已完成</option>
            <option value="paused" className="bg-gray-900">仅暂停</option>
            <option value="blocked" className="bg-gray-900">仅阻塞</option>
            <option value="show_all" className="bg-gray-900">全部(含暂停)</option>
          </select>
        </div>

        {/* Member filter */}
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-gray-700/50">
          <Users size={14} className={selectedMemberId ? 'text-cyan-400' : 'text-gray-500'} />
          <select
            value={selectedMemberId ?? ''}
            onChange={(e) => onMemberFilterChange(e.target.value ? Number(e.target.value) : null)}
            className="bg-transparent border border-gray-700/50 rounded-md px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-cyan-500 cursor-pointer hover:text-gray-300 hover:border-gray-600 transition-colors max-w-[120px]"
          >
            <option value="" className="bg-gray-900">全部人员</option>
            {resources?.filter(r => r.type !== 'cp' && r.status !== 'departed').sort((a, b) => compareResources(a as any, b as any)).map(r => (
              <option key={r.id} value={r.id} className="bg-gray-900">{r.name}</option>
            ))}
            {resources?.some(r => r.type === 'cp' && r.status !== 'departed') && (
              <option disabled className="bg-gray-900">── CP供应商 ──</option>
            )}
            {resources?.filter(r => r.type === 'cp' && r.status !== 'departed').sort((a, b) => compareResources(a as any, b as any)).map(r => (
              <option key={r.id} value={r.id} className="bg-gray-900">{r.name}</option>
            ))}
          </select>
        </div>

        {/* Search box */}
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-gray-700/50">
          <div className="relative flex items-center">
            <Search size={13} className={`absolute left-2 ${searchQuery ? 'text-indigo-400' : 'text-gray-500'} pointer-events-none`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="搜索任务..."
              className="bg-gray-800/60 border border-gray-700/50 rounded-md pl-7 pr-7 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:bg-gray-800 hover:border-gray-600 transition-colors w-[160px] focus:w-[200px]"
            />
            {searchQuery && (
              <>
                {searchResultCount !== undefined && (
                  <span className="absolute right-7 text-[10px] text-gray-500 pointer-events-none">
                    {searchResultCount}条
                  </span>
                )}
                <button
                  onClick={() => onSearchQueryChange('')}
                  className="absolute right-1.5 p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                  title="清除搜索"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {/* Color legend */}
        {usedTaskTypes.length > 0 && (
          <div className="flex items-center gap-2 mr-2">
            {usedTaskTypes.map(type => (
              <div key={type.label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: type.color }} />
                <span className="text-[10px] text-gray-500">{type.label}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onToggleDashboard}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
            showDashboard
              ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600'
          }`}
        >
          <Activity size={14} />
          仪表盘
        </button>
        
        {/* Primary actions — always visible */}
        <div className="flex items-center gap-1.5 border-l border-gray-700/50 pl-3 ml-1">
          <button
            onClick={onToggleDensity}
            className={`p-1.5 rounded-md border transition-all ${
              isCompact
                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
                : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600'
            }`}
            title={isCompact ? "切换为舒适视图" : "切换为紧凑视图"}
          >
            <LayoutList size={14} />
          </button>
          <button
            onClick={onExport}
            className="p-1.5 rounded-md border bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600 transition-all"
            title="导出为图片"
          >
            <Download size={14} />
          </button>
        </div>

        {/* TAPD Quick Refresh */}
        {hasTapdConfig && onTapdRefresh && (
          <button
            onClick={onTapdRefresh}
            disabled={isTapdRefreshing}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all ${
              isTapdRefreshing
                ? 'bg-blue-600/20 border-blue-500/30 text-blue-300'
                : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-blue-300 hover:border-blue-500/30 hover:bg-blue-600/10'
            }`}
            title="快速刷新TAPD数据（同步最新状态和排期）"
          >
            <RefreshCw size={14} className={isTapdRefreshing ? 'animate-spin' : ''} />
            {isTapdRefreshing ? '刷新中' : 'TAPD刷新'}
          </button>
        )}

        {/* Member & Risk — high frequency */}
        <button
          onClick={onToggleMemberPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all ${
            showMemberPanel
              ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600'
          }`}
        >
          <Users size={14} />
          成员
        </button>
        <button
          onClick={onToggleRiskPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all relative ${
            showRiskPanel
              ? 'bg-orange-600/20 border-orange-500/30 text-orange-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600'
          }`}
          title="风险面板"
        >
          <ShieldAlert size={14} />
          风险
          {riskCount !== undefined && riskCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold bg-red-500 text-white flex items-center justify-center shadow-sm">
              {riskCount > 99 ? '99+' : riskCount}
            </span>
          )}
        </button>

        {/* More menu — low frequency features */}
        <div className="relative">
          <button
            ref={moreBtnRef}
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all ${
              showMoreMenu || showWhatIf || focusMode
                ? 'bg-gray-700/50 border-gray-600 text-gray-200'
                : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:text-gray-300 hover:border-gray-600'
            }`}
            title="更多功能"
          >
            <MoreHorizontal size={14} />
            更多
            <ChevronDown size={10} className={`transition-transform ${showMoreMenu ? 'rotate-180' : ''}`} />
            {/* Active indicator dot when sub-features are active */}
            {(showWhatIf || focusMode) && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-400 shadow-sm" />
            )}
          </button>

          {/* More dropdown menu */}
          {showMoreMenu && ReactDOM.createPortal(
            <div
              ref={moreMenuRef}
              className="fixed bg-[#1a1d2e] border border-gray-700/60 rounded-xl shadow-2xl shadow-black/60 py-1.5 min-w-[200px] backdrop-blur-xl ring-1 ring-white/5 z-[99999]"
              style={{
                top: moreBtnRef.current ? moreBtnRef.current.getBoundingClientRect().bottom + 6 : 60,
                right: 16,
              }}
            >
              {/* Focus Mode */}
              <button
                onClick={() => { onToggleFocusMode(); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-colors ${
                  focusMode ? 'text-amber-300 bg-amber-500/10' : 'text-gray-300 hover:bg-gray-700/40 hover:text-white'
                }`}
              >
                <Focus size={14} className={focusMode ? 'text-amber-400' : 'text-gray-500'} />
                <span className="flex-1 text-left">专注模式</span>
                {focusMode && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">ON</span>}
              </button>

              {/* What-If */}
              <button
                onClick={() => { onToggleWhatIf(); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-colors ${
                  showWhatIf ? 'text-violet-300 bg-violet-500/10' : 'text-gray-300 hover:bg-gray-700/40 hover:text-white'
                }`}
              >
                <Ghost size={14} className={showWhatIf ? 'text-violet-400' : 'text-gray-500'} />
                <span className="flex-1 text-left">What-If 推演</span>
                {showWhatIf && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">ON</span>}
              </button>

              <div className="my-1.5 border-t border-gray-700/50" />

              {/* Snapshot */}
              <button
                onClick={() => { openSnapshotModal(); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-700/40 hover:text-white transition-colors"
              >
                <Camera size={14} className="text-gray-500" />
                <span className="flex-1 text-left">记录快照</span>
              </button>
              <button
                onClick={() => { openSnapshotListModal(); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-700/40 hover:text-white transition-colors"
              >
                <History size={14} className="text-gray-500" />
                <span className="flex-1 text-left">查看快照记录</span>
              </button>

              <div className="my-1.5 border-t border-gray-700/50" />

              {/* Project Pause/Resume/Archive */}
              {(onPauseProject || onResumeProject || onArchiveProject) && (
                <>
                  <div className="my-1.5 border-t border-gray-700/50" />
                  <div className="px-4 py-1.5">
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">项目操作</span>
                  </div>
                  {projectStatus === 'active' && onPauseProject && (
                    <button
                      onClick={() => { onPauseProject(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-yellow-500/10 hover:text-yellow-300 transition-colors"
                    >
                      <Pause size={14} className="text-yellow-500" />
                      <span className="flex-1 text-left">暂停项目</span>
                      <span className="text-[9px] text-gray-500">项目被砍/搁置</span>
                    </button>
                  )}
                  {projectStatus === 'active' && onArchiveProject && (
                    <button
                      onClick={() => { onArchiveProject(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Archive size={14} className="text-red-500" />
                      <span className="flex-1 text-left">归档项目</span>
                      <span className="text-[9px] text-gray-500">项目永久关闭</span>
                    </button>
                  )}
                  {(projectStatus === 'paused' || projectStatus === 'archived') && onResumeProject && (
                    <button
                      onClick={() => { onResumeProject(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-green-500/10 hover:text-green-300 transition-colors"
                    >
                      <Play size={14} className="text-green-500" />
                      <span className="flex-1 text-left">恢复项目</span>
                      <span className="text-[9px] text-gray-500">恢复所有暂停任务</span>
                    </button>
                  )}
                </>
              )}

              <div className="my-1.5 border-t border-gray-700/50" />

              {/* Color Legend */}
              <button
                ref={legendBtnRef}
                onClick={() => { setShowColorLegend(!showColorLegend); setShowMoreMenu(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-colors ${
                  showColorLegend ? 'text-purple-300 bg-purple-500/10' : 'text-gray-300 hover:bg-gray-700/40 hover:text-white'
                }`}
              >
                <Palette size={14} className={showColorLegend ? 'text-purple-400' : 'text-gray-500'} />
                <span className="flex-1 text-left">颜色图例</span>
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Color Legend Modal — rendered via Portal to document.body to escape all stacking contexts */}
      {showColorLegend && ReactDOM.createPortal(
        <div
          ref={legendRef}
          className="fixed bg-[#0f1119] border border-gray-600 rounded-xl shadow-2xl shadow-black/60 p-5 min-w-[340px] max-w-md max-h-[75vh] overflow-y-auto custom-scrollbar backdrop-blur-xl ring-1 ring-white/5"
          style={{ zIndex: 99999, top: legendBtnRef.current ? legendBtnRef.current.getBoundingClientRect().bottom + 8 : 60, right: 16 }}
        >
          <div className="text-sm font-semibold text-white mb-3 flex items-center justify-between sticky top-0 bg-gray-900 py-1 z-10">
            <span>颜色图例说明</span>
            <button 
              onClick={() => setShowColorLegend(false)}
              className="text-gray-400 hover:text-white text-xs"
            >
              关闭
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Task Status Colors */}
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">任务状态</h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm bg-gray-500 border border-dashed border-gray-400"></div>
                  <span className="text-gray-300">待办</span>
                  <span className="text-gray-500 text-[10px]">- 虚线边框表示未开始</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
                  <span className="text-gray-300">进行中</span>
                  <span className="text-gray-500 text-[10px]">- 蓝色进度条表示正在执行</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                  <span className="text-gray-300">已完成</span>
                  <span className="text-gray-500 text-[10px]">- 绿色带勾选标记</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
                  <span className="text-gray-300">阻塞/紧急</span>
                  <span className="text-gray-500 text-[10px]">- 橙色表示冲突或紧急截止</span>
                </div>
              </div>
            </div>
            
            {/* Task Type Colors */}
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">任务类型</h4>
              <div className="space-y-1.5">
                {Object.values(COLOR_LEGEND.TASK_TYPE).map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }}></div>
                    <span className="text-gray-300">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Role Colors */}
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">角色颜色</h4>
              <div className="space-y-1.5">
                {Object.values(COLOR_LEGEND.ROLE_COLORS).map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                    <span className="text-gray-300">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Special Indicators */}
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">特殊指示器</h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 border border-red-400 bg-red-500/20"></div>
                  <span className="text-gray-300">冲突警告</span>
                  <span className="text-gray-500 text-[10px]">- 红色表示排期冲突</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 border border-purple-400 bg-purple-500/20"></div>
                  <span className="text-gray-300">今日指示线</span>
                  <span className="text-gray-500 text-[10px]">- 紫色竖线标记当前日期</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 border border-dashed border-purple-300"></div>
                  <span className="text-gray-300">推演模式</span>
                  <span className="text-gray-500 text-[10px]">- 紫色虚线预览拖拽效果</span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});
