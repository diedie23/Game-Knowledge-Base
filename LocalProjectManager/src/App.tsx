import React, { useEffect, Suspense, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { useStore } from './store/useStore';
import { initMockData } from './db/mockData';
// Lazy-loaded view components for code-splitting
const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const GanttChart = React.lazy(() => import('./components/GanttChart').then(m => ({ default: m.GanttChart })));
const KanbanBoard = React.lazy(() => import('./components/KanbanBoard').then(m => ({ default: m.KanbanBoard })));
const ResourceMatrix = React.lazy(() => import('./components/ResourceMatrix').then(m => ({ default: m.ResourceMatrix })));
const TableView = React.lazy(() => import('./components/TableView').then(m => ({ default: m.TableView })));
const ProjectNotebook = React.lazy(() => import('./components/ProjectNotebook').then(m => ({ default: m.ProjectNotebook })));
// Lazy-loaded Modal components — loaded on first use, not on initial page load
const TaskModal = React.lazy(() => import('./components/TaskModal').then(m => ({ default: m.TaskModal })));
const ResourceModal = React.lazy(() => import('./components/ResourceModal').then(m => ({ default: m.ResourceModal })));
// TapdModal is directly imported (not lazy) to ensure it always loads reliably
import { TapdModal } from './components/TapdModal';
const CommandPalette = React.lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));
const AiSuggestionPanel = React.lazy(() => import('./components/AiSuggestionPanel').then(m => ({ default: m.AiSuggestionPanel })));
const ChangeSnapshotModal = React.lazy(() => import('./components/ChangeSnapshotModal').then(m => ({ default: m.ChangeSnapshotModal })));
const ChangeSnapshotListModal = React.lazy(() => import('./components/ChangeSnapshotListModal').then(m => ({ default: m.ChangeSnapshotListModal })));
import { useUndoRedoKeys } from './store/useUndoRedoKeys';
import { useGlobalShortcuts } from './store/useGlobalShortcuts';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/ToastContainer';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { syncAllParentDateRanges } from './services/workloadService';
import { db } from './db/db';
import { syncEngine } from './services/syncEngine';
import { TapdSyncAdapter } from './services/syncAdapter';
import { BACKUP_STORAGE_KEY } from './services/dataExportService';
import { toast } from './store/useToastStore';

// View transition wrapper — triggers fade-in animation on view change
function ViewTransition({ viewKey, children }: { viewKey: string; children: React.ReactNode }) {
  const [animClass, setAnimClass] = useState('view-enter');
  const prevKey = useRef(viewKey);

  useEffect(() => {
    if (prevKey.current !== viewKey) {
      setAnimClass('view-exit');
      const timer = setTimeout(() => {
        setAnimClass('view-enter');
        prevKey.current = viewKey;
      }, 150); // match exit animation duration
      return () => clearTimeout(timer);
    }
  }, [viewKey]);

  return (
    <div key={viewKey} className={animClass} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}

// Skeleton loading fallback for lazy-loaded views
function ViewSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-4 p-6 animate-pulse">
      <div className="h-10 bg-gray-800/50 rounded-lg w-1/3" />
      <div className="flex-1 bg-gray-800/30 rounded-xl border border-gray-800/50" />
    </div>
  );
}

// Wrapper for TapdModal — provides overlay + error boundary with visible error details
function TapdModalWrapper() {
  const { isTapdModalOpen, closeTapdModal } = useStore();
  if (!isTapdModalOpen) return null;
  return (
    <ErrorBoundary label="TAPD同步中心" fallback={
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200]">
        <div className="bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/60 w-full max-w-md border border-white/10 p-6 text-center">
          <div className="text-red-400 text-2xl mb-3">⚠️</div>
          <div className="text-sm text-gray-300 mb-2">TAPD 同步中心加载失败</div>
          <div className="text-xs text-gray-500 mb-3">组件渲染时发生错误，请打开浏览器控制台(F12)查看详细错误信息</div>
          <div className="text-[10px] text-gray-600 mb-4 p-2 bg-gray-950/50 rounded border border-gray-800/50 text-left font-mono">
            提示：按 F12 → Console 面板查看 [ErrorBoundary — TAPD同步中心] 开头的错误日志
          </div>
          <button
            onClick={closeTapdModal}
            className="px-4 py-2 bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all duration-200 border border-gray-600/30"
          >
            关闭
          </button>
        </div>
      </div>
    }>
      <TapdModal />
    </ErrorBoundary>
  );
}

function App() {
  const { currentView } = useStore();

  // Global Ctrl+Z / Ctrl+Shift+Z shortcuts
  useUndoRedoKeys();
  // Global shortcuts (C, 1/2/3/4, /)
  useGlobalShortcuts();

  useEffect(() => {
    const init = async () => {
      await initMockData();
      // Select the first available project (or create default if none exist)
      const allProjects = await db.projects.toArray();
      if (allProjects.length > 0) {
        useStore.getState().setSelectedProjectId(allProjects[0].id!);
      } else {
        // Create a default project if none exist
        const id = await db.projects.add({ name: '项目 Alpha' });
        useStore.getState().setSelectedProjectId(id as number);
      }
      // Auto-sync parent dates on load to fix any inconsistencies (e.g. after TAPD import)
      await syncAllParentDateRanges();
      // Auto-inject TapdSyncAdapter if a TAPD config exists
      try {
        const tapdConfig = await db.tapdConfigs.toCollection().first();
        if (tapdConfig?.workspaceId) {
          syncEngine.setAdapter(new TapdSyncAdapter(tapdConfig.workspaceId));
          console.log('[App] TapdSyncAdapter auto-injected for workspace:', tapdConfig.workspaceId);
        }
      } catch (e) {
        console.warn('[App] Failed to auto-inject TapdSyncAdapter:', e);
      }

      // Check backup reminder
      const lastBackup = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (!lastBackup) {
        // Never backed up — remind after a short delay so UI is ready
        setTimeout(() => {
          toast.warning('您尚未备份过项目数据，建议通过「数据 → 导出 JSON 快照」进行首次备份', 8000);
        }, 3000);
      } else {
        const daysSinceBackup = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceBackup >= 7) {
          setTimeout(() => {
            toast.warning(`距离上次备份已过 ${daysSinceBackup} 天，建议及时导出 JSON 快照备份数据`, 8000);
          }, 3000);
        }
      }
    };
    init();
  }, []);

  return (
    <Layout>
      <div className="h-full text-gray-300 flex flex-col">
        <ViewTransition viewKey={currentView}>
          <Suspense fallback={<ViewSkeleton />}>
            {currentView === 'dashboard' && (
              <ErrorBoundary label="仪表盘">
                <Dashboard />
              </ErrorBoundary>
            )}
            {currentView === 'gantt' && (
              <ErrorBoundary label="甘特图">
                <GanttChart />
              </ErrorBoundary>
            )}
            {currentView === 'board' && (
              <ErrorBoundary label="看板">
                <KanbanBoard />
              </ErrorBoundary>
            )}
            {currentView === 'matrix' && (
              <ErrorBoundary label="资源矩阵">
                <ResourceMatrix />
              </ErrorBoundary>
            )}
            {currentView === 'table' && (
              <ErrorBoundary label="表格视图">
                <TableView />
              </ErrorBoundary>
            )}
            {currentView === 'notes' && (
              <ErrorBoundary label="项目记事本">
                <ProjectNotebook />
              </ErrorBoundary>
            )}
          </Suspense>
        </ViewTransition>
      </div>
      <Suspense fallback={null}>
        <TaskModal />
        <ResourceModal />
        <CommandPalette />
        <AiSuggestionPanel />
        <ChangeSnapshotModal />
        <ChangeSnapshotListModal />
      </Suspense>
      <TapdModalWrapper />
      <ToastContainer />
      <ConfirmDialog />
    </Layout>
  );
}

export default App;