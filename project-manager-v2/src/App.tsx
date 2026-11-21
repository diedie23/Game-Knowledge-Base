import React, { useEffect, Suspense } from 'react';
import { Layout } from './components/Layout';
import { useStore } from './store/useStore';
import { initMockData } from './db/mockData';
// Lazy-loaded view components for code-splitting
const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ScheduleWorkspace = React.lazy(() => import('./components/ScheduleWorkspace').then(m => ({ default: m.ScheduleWorkspace })));
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
import { isEpicRequirement } from './utils/taskHierarchy';
import { repairResourceData } from './services/resourceMaintenance';

type BootStatus = 'loading' | 'ready' | 'error';

function BootScreen({
  status,
  error,
  onRetry,
}: {
  status: BootStatus;
  error?: string | null;
  onRetry?: () => void;
}) {
  const isError = status === 'error';
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gray-900/80 p-7 shadow-2xl shadow-black/30">
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${isError ? 'bg-red-500/15 text-red-300' : 'bg-blue-500/15 text-blue-300'}`}>
          {isError ? '!' : <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />}
        </div>
        <h1 className="text-lg font-semibold text-white">
          {isError ? '项目数据初始化失败' : '正在准备项目工作台'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          {isError
            ? '应用尚未进入可编辑状态，现有数据不会被继续写入。请重试；如果仍然失败，请保留下面的错误信息。'
            : '正在打开数据库、检查项目范围并准备数据。初始化完成前不会加载重型业务视图。'}
        </p>
        {isError && (
          <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-red-400/15 bg-red-950/20 p-3 text-xs text-red-200/80">
            {error || '未知初始化错误'}
          </pre>
        )}
        {isError && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-lg border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-500/25"
          >
            重试初始化
          </button>
        )}
      </div>
    </div>
  );
}

// Keep one stable viewport container while switching views. Remounting the whole
// page with an exit animation caused height/scroll changes during data refresh,
// which made the pointer appear to drift away from the control being used.
function ViewTransition({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 flex flex-col">
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
  const [bootStatus, setBootStatus] = React.useState<BootStatus>('loading');
  const [bootError, setBootError] = React.useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = React.useState(0);

  // Global Ctrl+Z / Ctrl+Shift+Z shortcuts
  useUndoRedoKeys();
  // Global shortcuts (C, 1/2/3/4, /)
  useGlobalShortcuts();

  useEffect(() => {
    let cancelled = false;
    let backupReminderTimer: ReturnType<typeof setTimeout> | undefined;

    const init = async () => {
      setBootStatus('loading');
      setBootError(null);
      try {
        await initMockData();

        // Select the first available project before any project-scoped task query.
        // A missing selection must never fall back to reading the complete task table.
        const allProjects = await db.projects.toArray();
        let selectedProjectId: number;
        if (allProjects.length > 0) {
          selectedProjectId = allProjects[0].id!;
        } else {
          selectedProjectId = await db.projects.add({ name: '项目 Alpha' }) as number;
        }
        useStore.getState().setSelectedProjectId(selectedProjectId);

        // Run the expensive resource cleanup once per migration version. Keeping
        // it out of every startup avoids scanning all tasks/resources on refresh.
        const resourceMaintenanceKey = 'project-manager-v2:resource-maintenance:v1';
        if (localStorage.getItem(resourceMaintenanceKey) !== 'done') {
          const resourceRepair = await repairResourceData();
          localStorage.setItem(resourceMaintenanceKey, 'done');
          if (resourceRepair.mergedResources > 0 || resourceRepair.removedLegacyResources > 0) {
            console.warn('[App] Resource data repaired:', resourceRepair);
          }
        }

        // Remove legacy TAPD EPIC scaffolding only inside the selected project.
        // This keeps startup work index-backed and prevents an accidental full-table scan.
        const staleEpicIds = await db.tasks
          .where('projectId')
          .equals(selectedProjectId)
          .filter(task => Boolean(task.tapdId) && isEpicRequirement(task))
          .primaryKeys();
        const numericEpicIds = staleEpicIds.filter((id: unknown): id is number => typeof id === 'number');
        if (numericEpicIds.length > 0) {
          const epicIdSet = new Set(numericEpicIds);
          await db.tasks
            .where('projectId')
            .equals(selectedProjectId)
            .filter(task => task.parentId != null && epicIdSet.has(task.parentId))
            .modify(task => { delete task.parentId; });
          await db.tasks.bulkDelete(numericEpicIds);
        }

        // Migrate the old English role label while retaining task titles exactly as TAPD supplied them.
        await db.resources.toCollection().modify(resource => {
          if (/^layout$/i.test(String(resource.role || '').trim())) resource.role = '还原';
        });

        // Parent ranges are synchronized after TAPD operations. Avoid scanning
        // the entire task table on every ordinary application startup.
        const parentRangeMaintenanceKey = 'project-manager-v2:parent-range-maintenance:v1';
        if (localStorage.getItem(parentRangeMaintenanceKey) !== 'done') {
          await syncAllParentDateRanges();
          localStorage.setItem(parentRangeMaintenanceKey, 'done');
        }

        // Auto-inject the TAPD adapter configured for the selected project.
        try {
          const tapdConfig = await db.tapdConfigs.where('projectId').equals(selectedProjectId).first();
          if (tapdConfig?.workspaceId) {
            syncEngine.setAdapter(new TapdSyncAdapter(tapdConfig.workspaceId));
          }
        } catch (e) {
          console.warn('[App] Failed to auto-inject TapdSyncAdapter:', e);
        }

        if (!cancelled) {
          setBootStatus('ready');
        }

        // Check backup reminder only after the main UI is ready.
        const lastBackup = localStorage.getItem(BACKUP_STORAGE_KEY);
        if (!lastBackup) {
          backupReminderTimer = setTimeout(() => {
            toast.warning('您尚未备份过项目数据，建议通过「数据 → 导出 JSON 快照」进行首次备份', 8000);
          }, 3000);
        } else {
          const daysSinceBackup = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceBackup >= 7) {
            backupReminderTimer = setTimeout(() => {
              toast.warning(`距离上次备份已过 ${daysSinceBackup} 天，建议及时导出 JSON 快照备份数据`, 8000);
            }, 3000);
          }
        }
      } catch (error) {
        console.error('[App] Initialization failed:', error);
        if (!cancelled) {
          setBootStatus('error');
          setBootError(error instanceof Error ? error.message : String(error || '未知初始化错误'));
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
      if (backupReminderTimer) clearTimeout(backupReminderTimer);
    };
  }, [bootAttempt]);

  if (bootStatus !== 'ready') {
    return (
      <BootScreen
        status={bootStatus}
        error={bootError}
        onRetry={() => setBootAttempt(attempt => attempt + 1)}
      />
    );
  }

  return (
    <Layout>
      <div className="h-full text-gray-300 flex flex-col">
        <ViewTransition>
          <Suspense fallback={<ViewSkeleton />}>
            {currentView === 'dashboard' && (
              <ErrorBoundary label="仪表盘">
                <Dashboard />
              </ErrorBoundary>
            )}
            {currentView === 'planning' && (
              <ErrorBoundary label="协同排期工作台">
                <ScheduleWorkspace />
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
