/**
 * useTapdState.ts — Centralized state management for TapdModal
 * 
 * This hook extracts all state declarations from TapdModal into a single
 * reusable hook, enabling:
 * 1. Each tab component to consume only the state it needs
 * 2. Clear separation between state management and UI rendering
 * 3. Easier testing of state logic in isolation
 * 
 * Architecture:
 * TapdModal (container) → useTapdState() → passes slices to tab components
 */

import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useSyncStore } from '../../store/useSyncStore';
import { db } from '../../db/db';
import { getRoleOrderIndex } from '../gantt/constants';
import type { SyncResult, ImportResult } from '../../types';
import type { PreviewResult } from '../../services/tapdService';
import type { TapdAuthMode, SyncRangeConfig, ModuleMapping, DuplicateCandidate, RefreshResult } from '../../types/tapd';

// ─── Types ───

export type TabId = 'config' | 'sync' | 'conflicts' | 'log';

export interface TeamResource {
  id?: number;
  name: string;
  role?: string;
  tapdAccount?: string;
}

// ─── Hook ───

export function useTapdState() {
  const { isTapdModalOpen, closeTapdModal, selectedProjectId } = useStore();
  const {
    isOnline, syncStatus, pendingChanges, lastSyncAt,
    unresolvedConflicts, syncLog, refreshStats, refreshConflicts
  } = useSyncStore();

  // ─── Tab State ───
  const [activeTab, setActiveTab] = useState<TabId>('config');

  // ─── Config State ───
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [authMode, setAuthMode] = useState<TapdAuthMode>('mcp-gateway');
  const [apiUser, setApiUser] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [mcpAccessToken, setMcpAccessToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ─── Sync State ───
  const [isSyncing, setIsSyncing] = useState(false);
  const [localSyncStatus, setLocalSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<{ pushed: number; pulled: number; conflicts: number; errors: number } | null>(null);
  const [upsertResult, setUpsertResult] = useState<SyncResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // ─── Sync Range State ───
  const [syncRangeMode, setSyncRangeMode] = useState<SyncRangeConfig['mode']>('all');
  const [syncRecentDays, setSyncRecentDays] = useState<number>(30);
  const [syncStartDate, setSyncStartDate] = useState<string>('');
  const [syncEndDate, setSyncEndDate] = useState<string>('');
  const [syncLimit, setSyncLimit] = useState<number>(200);
  const [categoryKeywords, setCategoryKeywords] = useState<string>('');
  const [ownerFilterInput, setOwnerFilterInput] = useState<string>('');
  const [moduleFeatureInput, setModuleFeatureInput] = useState<string>('');
  const [ownerFilterMode, setOwnerFilterMode] = useState<'server' | 'client'>('server');
  const [pipelineFilter, setPipelineFilter] = useState<boolean>(false);
  const [pipelineStages, setPipelineStages] = useState<string[]>(['interaction', 'ui_design', 'layout']);

  // ─── CSV Preview & Filter State ───
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterExistence, setFilterExistence] = useState<'all' | 'new' | 'existing'>('all');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterDuplicate, setFilterDuplicate] = useState<'all' | 'duplicate' | 'unique'>('all');
  const [filterHierarchy, setFilterHierarchy] = useState<'all' | 'parent' | 'child'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // ─── Preview Stories from Test Connection ───
  const [previewStories, setPreviewStories] = useState<any[]>([]);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  // ─── Module Mapping State ───
  const [moduleMappings, setModuleMappings] = useState<ModuleMapping[]>([]);
  const [newMappingKeywords, setNewMappingKeywords] = useState('');
  const [newMappingProject, setNewMappingProject] = useState('');

  // ─── Dedup Detection State ───
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [isDetectingDupes, setIsDetectingDupes] = useState(false);
  const [mergeDecisions, setMergeDecisions] = useState<Map<string, number | 'skip'>>(new Map());
  const [showDedupPanel, setShowDedupPanel] = useState(false);
  const [syncDetailExpanded, setSyncDetailExpanded] = useState(false);
  const [syncDetailFilter, setSyncDetailFilter] = useState<'all' | 'inserted' | 'updated' | 'merged' | 'skipped'>('all');

  // ─── Refresh State ───
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [refreshDetailExpanded, setRefreshDetailExpanded] = useState(false);

  // ─── Team Resources ───
  const [teamResources, setTeamResources] = useState<TeamResource[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loadResources = async () => {
      try {
        const all = await db.resources.toArray();
        const active = all.filter(r => r.status !== 'departed' && r.type !== 'cp');
        active.sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role));
        if (!cancelled) setTeamResources(active.map(r => ({ id: r.id, name: r.name, role: r.role, tapdAccount: r.tapdAccount })));
      } catch (e) {
        console.error('[TapdModal] Failed to load resources:', e);
      }
    };
    if (isTapdModalOpen) loadResources();
    return () => { cancelled = true; };
  }, [isTapdModalOpen]);

  // ─── Module Feature Presets ───
  const MODULE_FEATURE_PRESETS = useMemo(() => ['PUGC', 'UGC小游戏', '运营', 'Rivals', '轻舟编辑器', '2D Avatar'], []);

  return {
    // Global
    isTapdModalOpen, closeTapdModal, selectedProjectId,
    isOnline, syncStatus, pendingChanges, lastSyncAt,
    unresolvedConflicts, syncLog, refreshStats, refreshConflicts,

    // Tab
    activeTab, setActiveTab,

    // Config
    workspaceId, setWorkspaceId,
    workspaceName, setWorkspaceName,
    authMode, setAuthMode,
    apiUser, setApiUser,
    apiPassword, setApiPassword,
    apiToken, setApiToken,
    mcpAccessToken, setMcpAccessToken,
    isSaving, setIsSaving,
    isTesting, setIsTesting,
    testStatus, setTestStatus,
    errorMessage, setErrorMessage,
    saveSuccess, setSaveSuccess,

    // Sync
    isSyncing, setIsSyncing,
    localSyncStatus, setLocalSyncStatus,
    syncResult, setSyncResult,
    upsertResult, setUpsertResult,
    isImporting, setIsImporting,
    importResult, setImportResult,
    renderError, setRenderError,

    // Sync Range
    syncRangeMode, setSyncRangeMode,
    syncRecentDays, setSyncRecentDays,
    syncStartDate, setSyncStartDate,
    syncEndDate, setSyncEndDate,
    syncLimit, setSyncLimit,
    categoryKeywords, setCategoryKeywords,
    ownerFilterInput, setOwnerFilterInput,
    moduleFeatureInput, setModuleFeatureInput,
    ownerFilterMode, setOwnerFilterMode,
    pipelineFilter, setPipelineFilter,
    pipelineStages, setPipelineStages,

    // CSV Preview
    previewData, setPreviewData,
    selectedRows, setSelectedRows,
    filterStatus, setFilterStatus,
    filterOwner, setFilterOwner,
    filterExistence, setFilterExistence,
    filterModule, setFilterModule,
    filterDuplicate, setFilterDuplicate,
    filterHierarchy, setFilterHierarchy,
    searchQuery, setSearchQuery,
    isParsing, setIsParsing,

    // Preview Stories
    previewStories, setPreviewStories,
    selectedStories, setSelectedStories,
    collapsedParents, setCollapsedParents,

    // Module Mapping
    moduleMappings, setModuleMappings,
    newMappingKeywords, setNewMappingKeywords,
    newMappingProject, setNewMappingProject,

    // Dedup
    duplicates, setDuplicates,
    isDetectingDupes, setIsDetectingDupes,
    mergeDecisions, setMergeDecisions,
    showDedupPanel, setShowDedupPanel,
    syncDetailExpanded, setSyncDetailExpanded,
    syncDetailFilter, setSyncDetailFilter,

    // Refresh
    isRefreshing, setIsRefreshing,
    refreshResult, setRefreshResult,
    refreshDetailExpanded, setRefreshDetailExpanded,

    // Team
    teamResources, setTeamResources,
    MODULE_FEATURE_PRESETS,
  };
}

/** Type of the return value of useTapdState for prop-drilling to sub-components */
export type TapdState = ReturnType<typeof useTapdState>;
