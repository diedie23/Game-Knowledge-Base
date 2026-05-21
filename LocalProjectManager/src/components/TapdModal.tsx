import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Save, Link as LinkIcon, RefreshCw, CheckCircle2, AlertCircle,
  Download, Upload, Wifi, WifiOff, Clock, GitMerge, ArrowUpDown,
  ChevronDown, ChevronRight, Shield, Trash2, History, Building2,
  FileSpreadsheet, Info, Filter, CheckSquare, Square, MinusSquare,
  ArrowLeft, Search, Eye, ExternalLink
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useSyncStore } from '../store/useSyncStore';
import { db } from '../db/db';
import type { SyncConflict, SyncResult, ImportResult } from '../types';
import { tapdService, TapdImportService } from '../services/tapdService';
import type { PreviewRow, PreviewResult } from '../services/tapdService';
import type { TapdAuthMode, SyncRangeConfig, ModuleMapping, DuplicateCandidate, RefreshResult, RefreshDetailItem } from '../types/tapd';
import { syncEngine } from '../services/syncEngine';
import { conflictResolver } from '../services/syncEngine';
import { TapdSyncAdapter } from '../services/syncAdapter';
import { syncAllParentDateRanges } from '../services/workloadService';
import { getRoleOrderIndex } from './gantt/constants';

type TabId = 'config' | 'sync' | 'conflicts' | 'log';

export function TapdModal() {
  const { isTapdModalOpen, closeTapdModal, selectedProjectId } = useStore();
  const {
    isOnline, syncStatus, pendingChanges, lastSyncAt,
    unresolvedConflicts, syncLog, refreshStats, refreshConflicts
  } = useSyncStore();

  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [authMode, setAuthMode] = useState<TapdAuthMode>('mcp-gateway');
  const [apiUser, setApiUser] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [mcpAccessToken, setMcpAccessToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [localSyncStatus, setLocalSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
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
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  // ─── Load team members for owner filter tags ───
  const [teamResources, setTeamResources] = useState<{ id?: number; name: string; role?: string; tapdAccount?: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loadResources = async () => {
      try {
        const all = await db.resources.toArray();
        // Only active (non-departed) internal members, exclude CP outsource
        const active = all.filter(r => r.status !== 'departed' && r.type !== 'cp');
        // Sort by role order: UX → UI → Layout → 动效 → 原画 → ...
        active.sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role));
        if (!cancelled) setTeamResources(active.map(r => ({ id: r.id, name: r.name, role: r.role, tapdAccount: r.tapdAccount })));
      } catch (e) {
        console.error('[TapdModal] Failed to load resources:', e);
      }
    };
    if (isTapdModalOpen) loadResources();
    return () => { cancelled = true; };
  }, [isTapdModalOpen]);

  // Preset module feature tags
  const MODULE_FEATURE_PRESETS = ['PUGC', 'UGC小游戏', '运营', 'Rivals', '轻舟编辑器', '2D Avatar'];

  // ─── Tree structure for preview stories ───
  interface StoryTreeNode {
    item: any;
    story: any;
    storyId: string;
    children: StoryTreeNode[];
  }

  const storyTree = useMemo(() => {
    if (previewStories.length === 0) return { roots: [] as StoryTreeNode[], allIds: new Set<string>(), parentChildMap: new Map<string, string[]>() };
    // Build id→item map
    const idMap = new Map<string, any>();
    const allIds = new Set<string>();
    previewStories.forEach((item: any, idx: number) => {
      const story = item.Story || item;
      const sid = story.id || String(idx);
      idMap.set(sid, item);
      allIds.add(sid);
    });
    // Build parent→children map
    // Case 1: parent is in the list → real parent-child
    // Case 2: parent NOT in the list → group siblings under a virtual parent node
    const parentChildMap = new Map<string, string[]>();
    const childSet = new Set<string>();
    // Group by parent_id (including virtual parents)
    const parentGroupMap = new Map<string, string[]>(); // parent_id → child story ids (for items whose parent is NOT in list)
    previewStories.forEach((item: any, idx: number) => {
      const story = item.Story || item;
      const sid = story.id || String(idx);
      const parentId = story.parent_id;
      if (parentId && parentId !== '0') {
        if (idMap.has(parentId)) {
          // Parent is in the list → real parent-child relationship
          childSet.add(sid);
          const siblings = parentChildMap.get(parentId) || [];
          siblings.push(sid);
          parentChildMap.set(parentId, siblings);
        } else {
          // Parent NOT in list → group under virtual parent
          const group = parentGroupMap.get(parentId) || [];
          group.push(sid);
          parentGroupMap.set(parentId, group);
        }
      }
    });
    // Build tree nodes
    const buildNode = (item: any, idx: number): StoryTreeNode => {
      const story = item.Story || item;
      const sid = story.id || String(idx);
      const childIds = parentChildMap.get(sid) || [];
      const children = childIds.map(cid => {
        const childItem = idMap.get(cid)!;
        return buildNode(childItem, 0);
      });
      return { item, story, storyId: sid, children };
    };
    // Build roots
    const roots: StoryTreeNode[] = [];
    // 1) Items with no parent or parent_id=0, and not a child of another item in list
    previewStories.forEach((item: any, idx: number) => {
      const story = item.Story || item;
      const sid = story.id || String(idx);
      const parentId = story.parent_id;
      const hasParent = parentId && parentId !== '0';
      if (!childSet.has(sid) && (!hasParent || idMap.has(parentId))) {
        // This is a true root or a real parent in the list
        roots.push(buildNode(item, idx));
      }
    });
    // 2) Virtual parent groups: siblings sharing the same absent parent_id
    parentGroupMap.forEach((childSids, virtualParentId) => {
      if (childSids.length === 1) {
        // Only one child → just add as root directly (no need for virtual parent)
        const childItem = idMap.get(childSids[0])!;
        roots.push(buildNode(childItem, 0));
      } else {
        // Multiple children → create a virtual parent node to group them
        const firstChildItem = idMap.get(childSids[0])!;
        const firstChildStory = firstChildItem.Story || firstChildItem;
        // Try to extract a common prefix from children names for the virtual parent title
        const childNames = childSids.map(cid => {
          const ci = idMap.get(cid)!;
          const cs = ci.Story || ci;
          return cs.name || cs.title || '';
        });
        // Find common prefix by splitting on common delimiters like 】
        let commonPrefix = '';
        if (childNames.length > 0 && childNames[0]) {
          const first = childNames[0];
          // Try to find the longest common prefix up to a delimiter
          for (let i = 0; i < first.length; i++) {
            const char = first[i];
            if (childNames.every(n => n[i] === char)) {
              commonPrefix += char;
            } else {
              break;
            }
          }
          // Trim to last 】 or ] for a clean title
          const lastBracket = Math.max(commonPrefix.lastIndexOf('】'), commonPrefix.lastIndexOf(']'));
          if (lastBracket > 0) {
            commonPrefix = commonPrefix.substring(0, lastBracket + 1);
          } else {
            commonPrefix = ''; // No clean prefix found
          }
        }
        const virtualParentName = commonPrefix || `父需求 #${virtualParentId.slice(-6)}`;
        // Build children nodes
        const childNodes: StoryTreeNode[] = childSids.map(cid => {
          const childItem = idMap.get(cid)!;
          return buildNode(childItem, 0);
        });
        // Create virtual parent node
        const virtualId = `_virtual_${virtualParentId}`;
        allIds.add(virtualId);
        // Register in parentChildMap so selection cascade works
        parentChildMap.set(virtualId, childSids);
        childSids.forEach(cid => childSet.add(cid));
        const virtualStory = {
          id: virtualId,
          name: virtualParentName,
          owner: '',
          status: '',
          _isVirtual: true,
          _realParentId: virtualParentId,
        };
        roots.push({
          item: { Story: virtualStory },
          story: virtualStory,
          storyId: virtualId,
          children: childNodes,
        });
      }
    });
    return { roots, allIds, parentChildMap };
  }, [previewStories]);

  // Toggle parent selection → cascade to children
  const toggleStorySelection = (storyId: string, isParent: boolean) => {
    setSelectedStories(prev => {
      const next = new Set(prev);
      const childIds = storyTree.parentChildMap.get(storyId) || [];
      if (next.has(storyId)) {
        // Deselect this + all children
        next.delete(storyId);
        if (isParent) {
          const removeChildren = (pid: string) => {
            const cids = storyTree.parentChildMap.get(pid) || [];
            cids.forEach(cid => { next.delete(cid); removeChildren(cid); });
          };
          removeChildren(storyId);
        }
      } else {
        // Select this + all children
        next.add(storyId);
        if (isParent) {
          const addChildren = (pid: string) => {
            const cids = storyTree.parentChildMap.get(pid) || [];
            cids.forEach(cid => { next.add(cid); addChildren(cid); });
          };
          addChildren(storyId);
        }
      }
      return next;
    });
  };

  // Toggle collapse/expand for a parent node
  const toggleParentCollapse = (storyId: string) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  // Manual query instead of useLiveQuery to prevent unhandled errors from crashing the component
  const [existingConfig, setExistingConfig] = useState<any>(undefined);
  useEffect(() => {
    if (!selectedProjectId) {
      setExistingConfig(undefined);
      return;
    }
    let cancelled = false;
    const loadConfig = async () => {
      try {
        const config = await db.tapdConfigs.where('projectId').equals(selectedProjectId).first();
        if (!cancelled) setExistingConfig(config || null);
      } catch (e) {
        console.error('[TapdModal] Failed to load tapdConfig:', e);
        if (!cancelled) setExistingConfig(null);
      }
    };
    loadConfig();
    return () => { cancelled = true; };
  }, [selectedProjectId, isTapdModalOpen]);

  useEffect(() => {
    if (existingConfig) {
      setWorkspaceId(existingConfig.workspaceId);
      setWorkspaceName(existingConfig.workspaceName || '');
      setAuthMode(existingConfig.authMode || 'mcp-gateway');
      setApiUser(existingConfig.apiUser || '');
      setApiPassword(existingConfig.apiPassword || '');
      setApiToken(existingConfig.apiToken || '');
      setMcpAccessToken(existingConfig.mcpAccessToken || '');
      // Load sync range config
      const sr = existingConfig.syncRange;
      setSyncRangeMode(sr?.mode || 'all');
      setSyncRecentDays(sr?.recentDays || 30);
      setSyncStartDate(sr?.startDate || '');
      setSyncEndDate(sr?.endDate || '');
      setSyncLimit(sr?.limit || 200);
      setCategoryKeywords((sr?.categoryKeywords || []).join(', '));
      setOwnerFilterInput([...new Set(sr?.ownerFilter || [])].join(', '));
      setModuleFeatureInput((sr?.moduleFeatureFilter || []).join(', '));
      setOwnerFilterMode(sr?.ownerFilterMode || 'server');
      setPipelineFilter(sr?.pipelineFilter || false);
      setPipelineStages(sr?.pipelineStages || ['interaction', 'ui_design', 'layout']);
      setModuleMappings(sr?.moduleMappings || []);
    } else {
      setWorkspaceId('');
      setWorkspaceName('');
      setAuthMode('mcp-gateway');
      setApiUser('');
      setApiPassword('');
      setApiToken('');
      setMcpAccessToken('');
      setSyncRangeMode('all');
      setSyncRecentDays(30);
      setSyncStartDate('');
      setSyncEndDate('');
      setSyncLimit(200);
      setCategoryKeywords('');
      setOwnerFilterInput('');
      setModuleFeatureInput('');
      setOwnerFilterMode('server');
      setPipelineFilter(false);
      setPipelineStages(['interaction', 'ui_design', 'layout']);
      setModuleMappings([]);
    }
    setTestStatus('idle');
    setLocalSyncStatus('idle');
    setErrorMessage('');
    setSyncResult(null);
    setUpsertResult(null);
  }, [existingConfig, isTapdModalOpen]);

  useEffect(() => {
    if (isTapdModalOpen) {
      try {
        refreshStats();
        refreshConflicts();
      } catch (e) {
        console.error('[TapdModal] Failed to refresh stats/conflicts:', e);
      }
    }
    // Reset render error when modal opens
    if (isTapdModalOpen) {
      setRenderError(null);
    }
  }, [isTapdModalOpen]);

  // If modal is not open or no project selected, return null
  if (!isTapdModalOpen) return null;

  // If no project selected, show a minimal modal with close button
  if (!selectedProjectId) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200]">
        <div className="bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/60 w-full max-w-sm border border-white/10 p-6 text-center">
          <AlertCircle size={32} className="mx-auto text-amber-400 mb-3" />
          <div className="text-sm text-gray-300 mb-2">请先选择一个项目</div>
          <div className="text-xs text-gray-500 mb-4">需要选择项目后才能使用 TAPD 同步功能</div>
          <button
            onClick={closeTapdModal}
            className="px-4 py-2 bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all duration-200 border border-gray-600/30"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  // If there's a render error, show error recovery UI
  if (renderError) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200]">
        <div className="bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/60 w-full max-w-sm border border-white/10 p-6 text-center">
          <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
          <div className="text-sm text-gray-300 mb-2">TAPD 同步中心加载失败</div>
          <div className="text-xs text-gray-500 mb-4 break-all">{renderError}</div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setRenderError(null)}
              className="px-4 py-2 bg-blue-600/60 hover:bg-blue-600 text-white text-sm rounded-lg transition-all duration-200"
            >
              重试
            </button>
            <button
              onClick={closeTapdModal}
              className="px-4 py-2 bg-gray-700/60 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all duration-200 border border-gray-600/30"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  /** Extract numeric workspace ID from a TAPD URL or raw input */
  const extractWorkspaceId = (input: string): string => {
    const trimmed = input.trim();
    // If it contains comma/semicolon separators, handle multiple IDs
    if (/[,;，；]/.test(trimmed)) {
      const parts = trimmed.split(/[,;，；]/).map(part => {
        const p = part.trim();
        if (/^\d+$/.test(p)) return p;
        const urlMatch = p.match(/tapd[^/]*\/(?:tapd_fe\/)?(\d+)/);
        if (urlMatch) return urlMatch[1];
        const digitMatch = p.match(/(\d{6,})/);
        if (digitMatch) return digitMatch[1];
        return p;
      }).filter(Boolean);
      return parts.join(',');
    }
    // Single ID handling
    // If it's purely digits, return as-is
    if (/^\d+$/.test(trimmed)) return trimmed;
    // Try to extract from TAPD URL patterns:
    // https://tapd.woa.com/tapd_fe/70203092/...
    // https://www.tapd.cn/70203092/...
    const urlMatch = trimmed.match(/tapd[^/]*\/(?:tapd_fe\/)?(\d+)/);
    if (urlMatch) return urlMatch[1];
    // Fallback: find any long digit sequence (>= 6 digits)
    const digitMatch = trimmed.match(/(\d{6,})/);
    if (digitMatch) return digitMatch[1];
    return trimmed;
  };

  const handleWorkspaceIdChange = (rawInput: string) => {
    setWorkspaceId(rawInput);
    setTestStatus('idle');
    setWorkspaceName('');
    setErrorMessage('');
  };

  /** When input loses focus, auto-extract the numeric ID */
  const handleWorkspaceIdBlur = () => {
    const extracted = extractWorkspaceId(workspaceId);
    if (extracted !== workspaceId.trim() && extracted !== workspaceId) {
      setWorkspaceId(extracted);
    }
  };

  /** Handle file selection → parse for preview (no direct import) */
  const handleFileSelect = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsParsing(true);
      setPreviewData(null);
      setImportResult(null);
      setErrorMessage('');
      setSelectedRows(new Set());
      setFilterStatus('all');
      setFilterOwner('all');
      setFilterExistence('all');
      setSearchQuery('');
      try {
        const result = await TapdImportService.previewFile(file, selectedProjectId);
        setPreviewData(result);
        if (result.errors.length > 0 && result.rows.length === 0) {
          setErrorMessage('文件解析失败，请检查文件格式');
        } else {
          // Auto-select all new (non-existing) rows by default
          const newRowIndices = new Set(result.rows.filter(r => !r.existsLocally).map(r => r.rowIndex));
          setSelectedRows(newRowIndices);
        }
      } catch (err: any) {
        setErrorMessage(err.message || '文件解析失败');
      } finally {
        setIsParsing(false);
      }
    };
    input.click();
  };

  /** Filtered rows based on current filter state */
  const filteredPreviewRows = useMemo(() => {
    if (!previewData) return [];
    return previewData.rows.filter(row => {
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      if (filterOwner !== 'all' && row.owner !== filterOwner) return false;
      if (filterExistence === 'new' && row.existsLocally) return false;
      if (filterExistence === 'existing' && !row.existsLocally) return false;
      if (filterDuplicate === 'duplicate' && !row.duplicateInfo) return false;
      if (filterDuplicate === 'unique' && row.duplicateInfo) return false;
      if (filterHierarchy === 'parent' && (row.depth || 0) > 0) return false;
      if (filterHierarchy === 'child' && (row.depth || 0) === 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!row.title.toLowerCase().includes(q) && !row.owner.toLowerCase().includes(q) && !row.tapdId.includes(q)) return false;
      }
      return true;
    });
  }, [previewData, filterStatus, filterOwner, filterExistence, filterDuplicate, filterHierarchy, searchQuery]);

  /** Toggle a single row selection */
  const toggleRowSelection = (rowIndex: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  /** Select/deselect all filtered rows */
  const toggleSelectAllFiltered = () => {
    const filteredIndices = filteredPreviewRows.map(r => r.rowIndex);
    const allSelected = filteredIndices.every(i => selectedRows.has(i));
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIndices.forEach(i => next.delete(i));
      } else {
        filteredIndices.forEach(i => next.add(i));
      }
      return next;
    });
  };

  /** Confirm import of selected rows */
  const handleConfirmImport = async () => {
    if (!previewData || selectedRows.size === 0) return;
    setIsImporting(true);
    setImportResult(null);
    setErrorMessage('');
    try {
      const rowsToImport = previewData.rows.filter(r => selectedRows.has(r.rowIndex));
      const result = await TapdImportService.importSelectedRows(rowsToImport, selectedProjectId);
      setImportResult(result);
      if (result.errors.length > 0 && result.inserted === 0 && result.updated === 0) {
        setErrorMessage('导入失败，请检查数据');
      } else {
        await syncAllParentDateRanges();
        // Clear preview after successful import
        setPreviewData(null);
      }
    } catch (err: any) {
      setErrorMessage(err.message || '导入失败');
    } finally {
      setIsImporting(false);
    }
  };

  /** Go back from preview to file selection */
  const handleBackFromPreview = () => {
    setPreviewData(null);
    setSelectedRows(new Set());
    setImportResult(null);
    setErrorMessage('');
  };

  /** Legacy direct import (kept for backward compatibility) */
  const handleFileImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsImporting(true);
      setImportResult(null);
      setErrorMessage('');
      try {
        const result = await TapdImportService.importFromFile(file, selectedProjectId);
        setImportResult(result);
        if (result.errors.length > 0 && result.inserted === 0 && result.updated === 0) {
          setErrorMessage('导入失败，请检查文件格式是否正确');
        } else {
          await syncAllParentDateRanges();
        }
      } catch (err: any) {
        setErrorMessage(err.message || '文件导入失败');
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const handleSave = async () => {
    if (!workspaceId.trim()) {
      setErrorMessage('请填写工作区 ID');
      return;
    }
    // Validate based on auth mode
    if (authMode === 'mcp-gateway' && !mcpAccessToken.trim()) {
      setErrorMessage('请填写 MCP 个人访问令牌');
      return;
    }
    if (authMode === 'rest' && !apiUser.trim()) {
      setErrorMessage('请填写 API 账号');
      return;
    }
    setIsSaving(true);
    setErrorMessage('');
    try {
      const parsedKeywords = categoryKeywords
        .split(/[,，]/)
        .map(k => k.trim())
        .filter(Boolean);
      const parsedOwners = ownerFilterInput
        .split(/[,，;；]/)
        .map(k => k.trim())
        .filter(Boolean);
      const parsedModuleFeatures = moduleFeatureInput
        .split(/[,，;；]/)
        .map(k => k.trim())
        .filter(Boolean);
      const syncRange: SyncRangeConfig = {
        mode: syncRangeMode,
        recentDays: syncRecentDays,
        startDate: syncStartDate || undefined,
        endDate: syncEndDate || undefined,
        limit: syncLimit,
        categoryKeywords: parsedKeywords.length > 0 ? parsedKeywords : undefined,
        moduleMappings: moduleMappings.length > 0 ? moduleMappings : undefined,
        ownerFilter: parsedOwners.length > 0 ? parsedOwners : undefined,
        moduleFeatureFilter: parsedModuleFeatures.length > 0 ? parsedModuleFeatures : undefined,
        ownerFilterMode: ownerFilterMode,
        pipelineFilter: pipelineFilter || undefined,
        pipelineStages: pipelineFilter && pipelineStages.length > 0 ? pipelineStages : undefined,
      };
      const configData = {
        workspaceId: workspaceId.trim(),
        workspaceName,
        authMode,
        apiUser: apiUser.trim(),
        apiPassword: apiPassword.trim(),
        apiToken: apiToken.trim(),
        mcpAccessToken: mcpAccessToken.trim(),
        syncRange,
      };
      if (existingConfig?.id) {
        await db.tapdConfigs.update(existingConfig.id, configData);
      } else {
        await db.tapdConfigs.add({
          ...configData,
          projectId: selectedProjectId,
        });
      }
      // Inject TapdSyncAdapter into syncEngine when config is saved
      const wsId = workspaceId.trim();
      if (wsId) {
        syncEngine.setAdapter(new TapdSyncAdapter(wsId));
        console.log('[TapdModal] TapdSyncAdapter injected for workspace:', wsId);
      }
      setErrorMessage('');
      // Show save success feedback
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (error) {
      setErrorMessage('保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!workspaceId.trim()) {
      setErrorMessage('请先填写工作区 ID');
      return;
    }
    setIsTesting(true);
    setTestStatus('idle');
    setErrorMessage('');
    setWorkspaceName('');
    setPreviewStories([]);
    setSelectedStories(new Set());
    try {
      // Build syncRange config for preview filtering
      const parsedKeywords = categoryKeywords
        .split(/[,，]/)
        .map(k => k.trim())
        .filter(Boolean);
      const parsedOwnersPrev = ownerFilterInput
        .split(/[,，;；]/)
        .map(k => k.trim())
        .filter(Boolean);
      const parsedModulesPrev = moduleFeatureInput
        .split(/[,，;；]/)
        .map(k => k.trim())
        .filter(Boolean);
      const currentSyncRange = {
        mode: syncRangeMode,
        recentDays: syncRecentDays,
        startDate: syncStartDate || undefined,
        endDate: syncEndDate || undefined,
        limit: syncLimit,
        categoryKeywords: parsedKeywords.length > 0 ? parsedKeywords : undefined,
        ownerFilter: parsedOwnersPrev.length > 0 ? parsedOwnersPrev : undefined,
        moduleFeatureFilter: parsedModulesPrev.length > 0 ? parsedModulesPrev : undefined,
        ownerFilterMode: ownerFilterMode,
        pipelineFilter: pipelineFilter || undefined,
        pipelineStages: pipelineFilter && pipelineStages.length > 0 ? pipelineStages : undefined,
      };
      const result = await tapdService.testConnection(workspaceId.trim(), apiUser.trim(), apiPassword.trim(), apiToken.trim(), authMode, mcpAccessToken.trim(), currentSyncRange);
      if (result.success) {
        setTestStatus('success');
        setWorkspaceName(result.workspaceName);
        // Save preview stories for display
        if (result.previewStories && result.previewStories.length > 0) {
          setPreviewStories(result.previewStories);
          // Auto-select all stories (use same ID extraction as list rendering)
          const allIds = new Set(result.previewStories.map((s: any, idx: number) => {
            const story = s.Story || s;
            return story.id || String(idx);
          }));
          setSelectedStories(allIds);
        }
      } else {
        setTestStatus('error');
        setErrorMessage(result.error);
      }
    } catch (err: any) {
      setTestStatus('error');
      setErrorMessage(err.message || '连接测试失败，请稍后重试');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!existingConfig) {
      setErrorMessage('请先保存配置');
      return;
    }
    setIsRefreshing(true);
    setErrorMessage('');
    setRefreshResult(null);
    setRefreshDetailExpanded(false);
    try {
      const result = await tapdService.refreshExistingTasks(selectedProjectId);
      setRefreshResult(result);
      if (result.updatedCount > 0) {
        setRefreshDetailExpanded(true);
      }
    } catch (err: any) {
      console.error('[TapdModal] Refresh failed:', err);
      setErrorMessage(err.message || '刷新状态时发生错误');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDirectSync = async () => {
    if (!existingConfig) {
      setErrorMessage('请先保存配置');
      return;
    }
    setIsSyncing(true);
    setLocalSyncStatus('idle');
    setErrorMessage('');
    setUpsertResult(null);
    setSyncDetailExpanded(false);
    try {
      // Load config - try by projectId first, then ensure credentials are available
      const config = await tapdService.loadConfig(selectedProjectId);
      if (!config) {
        throw new Error('未找到 TAPD 配置，请先在配置页签中保存配置');
      }
      console.log('[TapdModal] Starting sync with config:', {
        workspaceId: config.workspaceId,
        hasApiUser: !!config.apiUser,
        hasApiToken: !!config.apiToken,
        hasApiPassword: !!config.apiPassword,
      });
      // Filter out virtual parent node IDs before syncing
      const realSelectedStories = new Set(Array.from(selectedStories).filter(id => !id.startsWith('_virtual_')));
      const result = await tapdService.syncTasksToLocal(
        selectedProjectId,
        mergeDecisions.size > 0 ? mergeDecisions : undefined,
        realSelectedStories.size > 0 && realSelectedStories.size < previewStories.length ? realSelectedStories : undefined
      );
      setUpsertResult(result);
      setLocalSyncStatus('success');
      // Clear merge decisions after successful sync
      if (mergeDecisions.size > 0) {
        setMergeDecisions(new Map());
        setDuplicates([]);
        setShowDedupPanel(false);
      }
      // Auto-sync parent dates after sync
      await syncAllParentDateRanges();

      // Auto-detect duplicates after sync
      try {
        setIsDetectingDupes(true);
        setShowDedupPanel(true);
        const dupes = await tapdService.detectDuplicates(selectedProjectId);
        setDuplicates(dupes);
      } catch (dedupErr: any) {
        console.error('[TapdModal] Auto dedup detection failed:', dedupErr);
      } finally {
        setIsDetectingDupes(false);
      }
    } catch (err: any) {
      setLocalSyncStatus('error');
      console.error('[TapdModal] Sync failed:', err);
      setErrorMessage(err.message || '同步过程中发生错误');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFullSync = async () => {
    if (!existingConfig) {
      setErrorMessage('请先保存配置');
      return;
    }
    setIsSyncing(true);
    setLocalSyncStatus('idle');
    setErrorMessage('');
    setSyncResult(null);
    try {
      await tapdService.loadConfig(selectedProjectId);
      const result = await syncEngine.fullSync(selectedProjectId);
      setSyncResult(result);
      setLocalSyncStatus(result.errors > 0 ? 'error' : 'success');
      // Auto-sync parent dates after sync
      await syncAllParentDateRanges();
      await refreshStats();
      await refreshConflicts();
    } catch {
      setLocalSyncStatus('error');
      setErrorMessage('同步过程中发生错误');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushOnly = async () => {
    setIsSyncing(true);
    try {
      const result = await syncEngine.pushPendingChanges();
      setSyncResult({ pushed: result.pushed, pulled: 0, conflicts: 0, errors: result.failed });
      await refreshStats();
    } catch {
      setErrorMessage('推送失败');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullOnly = async () => {
    setIsSyncing(true);
    try {
      const result = await syncEngine.pullRemoteChanges(selectedProjectId);
      setSyncResult({ pushed: 0, pulled: result.pulled, conflicts: result.conflicts, errors: 0 });
      // Auto-sync parent dates after pull
      await syncAllParentDateRanges();
      await refreshStats();
      await refreshConflicts();
    } catch {
      setErrorMessage('拉取失败');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveConflict = async (conflict: SyncConflict, resolution: 'local' | 'remote') => {
    if (!conflict.id) return;
    await conflictResolver.resolveConflict(conflict.id, resolution);
    await refreshConflicts();
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return '从未';
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'config', label: '配置', icon: <LinkIcon size={14} /> },
    { id: 'sync', label: '同步', icon: <ArrowUpDown size={14} /> },
    { id: 'conflicts', label: '冲突', icon: <GitMerge size={14} />, badge: unresolvedConflicts.length },
    { id: 'log', label: '日志', icon: <History size={14} /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200]">
<div className="bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/60 w-full max-w-7xl border border-white/10 overflow-hidden flex flex-col h-[calc(83vh+15px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-gray-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <LinkIcon className="text-blue-400" size={18} />
            <h2 className="text-base font-semibold text-white">TAPD 同步中心</h2>
            {/* Online indicator */}
            <div className={`flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              isOnline
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/15 text-red-400 border border-red-500/20'
            }`}>
              {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isOnline ? '在线' : '离线'}
            </div>
          </div>
          <button
            onClick={closeTapdModal}
            className="text-gray-400 hover:text-white transition-all duration-200 p-1.5 hover:bg-white/10 rounded-lg hover:-translate-y-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/10 bg-gray-900/40 px-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all duration-200 relative ${
                activeTab === tab.id
                  ? 'text-blue-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold font-mono tabular-nums min-w-[16px] text-center">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-blue-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-hidden ${activeTab !== 'config' ? 'overflow-y-auto p-4 space-y-3' : ''}`} style={{ minHeight: 0 }}>
          {/* ─── Config Tab ─── */}
          {activeTab === 'config' && (
            <div className="flex h-full">
              {/* Left Panel: Config Form */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-w-0">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-[11px] text-blue-200 leading-relaxed backdrop-blur-sm">
                <Shield size={12} className="inline mr-1 -mt-0.5" />
                绑定 TAPD 后，只需填写工作区 ID 即可关联项目。API 账号和口令请在 tapd.woa.com → 公司管理 → 安全与集成 → 开放平台 中获取。
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-0.5">
                    工作区 ID <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={workspaceId}
                    onChange={(e) => handleWorkspaceIdChange(e.target.value)}
                    onBlur={handleWorkspaceIdBlur}
                    onPaste={(e) => {
                      // Auto-extract on paste
                      setTimeout(() => {
                        const val = (e.target as HTMLInputElement).value;
                        const extracted = extractWorkspaceId(val);
                        if (extracted !== val) {
                          setWorkspaceId(extracted);
                        }
                      }, 0);
                    }}
                    className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    placeholder="输入工作区 ID（多个用逗号分隔，如：70203092,70203093）"
                  />
                  <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
                    <Info size={10} className="shrink-0" />
                    支持填写多个工作区 ID（逗号分隔），也可直接粘贴 TAPD 项目 URL 自动提取
                  </p>
                </div>

                <div className="pt-1.5 border-t border-white/10">
                  <div className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1">
                    <Shield size={12} />
                    认证方式
                  </div>

                  {/* Auth Mode Selector */}
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setAuthMode('mcp-gateway')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                        authMode === 'mcp-gateway'
                          ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-sm shadow-purple-500/10'
                          : 'bg-gray-800/40 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <Wifi size={12} />
                      MCP 网关
                      <span className="px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[9px] font-bold">推荐</span>
                    </button>
                    <button
                      onClick={() => setAuthMode('rest')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                        authMode === 'rest'
                          ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-500/10'
                          : 'bg-gray-800/40 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <Shield size={12} />
                      REST API
                    </button>
                  </div>

                  {/* MCP Gateway Auth */}
                  {authMode === 'mcp-gateway' && (
                    <div className="space-y-1.5">
                      <div className="bg-purple-500/8 border border-purple-500/15 rounded-lg p-2 text-[10px] text-purple-200/80 leading-relaxed">
                        通过 MCP 网关连接 TAPD，只需个人访问令牌即可。在{' '}
                        <a
                          href="https://tapd.woa.com/platform/myhome?not_direct=1&from=mcp#tab-tab-mytoken"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-300 underline underline-offset-2 hover:text-purple-200"
                        >
                          TAPD 个人中心
                        </a>
                        {' '}点"创建个人访问令牌"获取（令牌只显示一次，请保存好）。
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">
                          个人访问令牌 <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="password"
                          value={mcpAccessToken}
                          onChange={(e) => setMcpAccessToken(e.target.value)}
                          className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all duration-200 font-mono"
                          placeholder="粘贴 TAPD 个人访问令牌 (X-Tapd-Access-Token)"
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                        <span className="text-yellow-500/80">安全提示：</span> 令牌仅保存在本地浏览器中。请求通过 Vite 代理转发至 MCP 网关（mcpgw.knot.woa.com），不经过第三方服务器。
                      </p>
                    </div>
                  )}

                  {/* REST API Auth */}
                  {authMode === 'rest' && (
                    <div className="space-y-2">
                      <div className="bg-blue-500/8 border border-blue-500/15 rounded-lg p-2.5 text-[10px] text-blue-200/80 leading-relaxed">
                        通过 REST API 直接连接 TAPD。需要 API 账号和口令，在 tapd.woa.com → 公司管理 → 安全与集成 → 开放平台 中获取。
                      </div>
                      {/* API User */}
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">
                          API 账号 <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={apiUser}
                          onChange={(e) => setApiUser(e.target.value)}
                          className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                          placeholder="开放平台中的 API 账号"
                        />
                      </div>

                      {/* Personal Token */}
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                          <span className="px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-bold">推荐</span>
                          个人令牌 (Personal Token)
                        </label>
                        <input
                          type="password"
                          value={apiToken}
                          onChange={(e) => { setApiToken(e.target.value); if (e.target.value) setApiPassword(''); }}
                          className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all duration-200 font-mono"
                          placeholder="粘贴开放平台中的 API 口令或个人令牌"
                        />
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-[10px] text-gray-600">或者</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>

                      {/* API Password */}
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">API 密钥</label>
                        <input
                          type="password"
                          value={apiPassword}
                          onChange={(e) => { setApiPassword(e.target.value); if (e.target.value) setApiToken(''); }}
                          className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                          placeholder="输入 API 密钥"
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                        <span className="text-yellow-500/80">安全提示：</span> 凭证仅保存在本地浏览器 IndexedDB 中。请求通过本地 Vite 代理转发至 apiv2.tapd.woa.com，不经过任何第三方服务器。
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Workspace name display after successful test */}
              {testStatus === 'success' && workspaceName && (
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-emerald-400/70 font-medium">已验证的工作区</div>
                    <div className="text-sm text-emerald-300 font-semibold truncate">{workspaceName}</div>
                  </div>
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                </div>
              )}

              {/* Existing binding info */}
              {existingConfig && !testStatus.includes('success') && existingConfig.workspaceName && (
                <div className="flex items-center gap-3 bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-500 font-medium">当前绑定的工作区</div>
                    <div className="text-sm text-gray-300 font-medium truncate">{existingConfig.workspaceName}</div>
                  </div>
                  <LinkIcon size={14} className="text-blue-400/50 shrink-0" />
                </div>
              )}

              {/* Preview Stories summary (full list shown in right panel) */}
              {testStatus === 'success' && previewStories.length > 0 && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-400/10 p-2 rounded-lg border border-emerald-400/20">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>已获取 {previewStories.length} 条需求，已选择 {Array.from(selectedStories).filter(id => !id.startsWith('_virtual_')).length} 条 → 右侧面板查看详情</span>
                </div>
              )}

              {errorMessage && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 p-2.5 rounded-lg border border-red-400/20">
                  <AlertCircle size={14} className="shrink-0" />
                  {errorMessage}
                </div>
              )}

              {/* ─── Sync Range Settings ─── */}
              <div className="pt-1.5 border-t border-white/10">
                <div className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1">
                  <Filter size={12} />
                  数据拉取范围
                </div>

                {/* Range Mode Selector */}
                <div className="flex gap-1.5 mb-2">
                  {([
                    { value: 'all', label: '全部', desc: '拉取所有数据' },
                    { value: 'recent', label: '最近', desc: '按天数过滤' },
                    { value: 'custom', label: '自定义', desc: '指定日期范围' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSyncRangeMode(opt.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 border ${
                        syncRangeMode === opt.value
                          ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                          : 'bg-gray-800/40 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                      }`}
                      title={opt.desc}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Recent Days Input */}
                {syncRangeMode === 'recent' && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-500 shrink-0">最近</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={syncRecentDays}
                      onChange={(e) => setSyncRecentDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 30)))}
                      className="w-16 bg-gray-950/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200 font-mono"
                    />
                    <span className="text-[10px] text-gray-500 shrink-0">天内修改过的需求</span>
                  </div>
                )}

                {/* Custom Date Range */}
                {syncRangeMode === 'custom' && (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="date"
                      value={syncStartDate}
                      onChange={(e) => setSyncStartDate(e.target.value)}
                      className="flex-1 bg-gray-950/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    />
                    <span className="text-[10px] text-gray-500">至</span>
                    <input
                      type="date"
                      value={syncEndDate}
                      onChange={(e) => setSyncEndDate(e.target.value)}
                      className="flex-1 bg-gray-950/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    />
                  </div>
                )}

                {/* Fetch Limit */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 shrink-0">最大拉取条数</span>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={10}
                    value={syncLimit}
                    onChange={(e) => setSyncLimit(Math.max(10, Math.min(1000, parseInt(e.target.value) || 200)))}
                    className="w-20 bg-gray-950/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200 font-mono"
                  />
                  <span className="text-[10px] text-gray-600">（10~1000）</span>
                </div>

                {/* Category Keywords + Module Feature Filter - Two Column Layout */}
                <div className="mt-2 pt-1.5 border-t border-white/5 grid grid-cols-2 gap-3">

                  {/* Pipeline Smart Filter Toggle */}
                  <div className="col-span-2 mb-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPipelineFilter(!pipelineFilter)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                          pipelineFilter ? 'bg-blue-500' : 'bg-gray-700'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${
                          pipelineFilter ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`} />
                      </button>
                      <span className="text-[11px] text-gray-400">
                        🎯 Pipeline 智能筛选（仅拉取交互/视觉/Layout相关任务）
                      </span>
                    </div>
                    {pipelineFilter && (
                      <div className="mt-1.5 ml-11 flex flex-wrap gap-1.5">
                        {[
                          { id: 'interaction', label: '交互设计', icon: '🔄' },
                          { id: 'ui_design', label: 'UI设计', icon: '🎨' },
                          { id: 'layout', label: 'Layout', icon: '📐' },
                          { id: 'motion_design', label: '动效设计', icon: '✨' },
                          { id: 'formal_blueprint', label: '正式蓝图', icon: '📋' },
                          { id: 'func_blueprint', label: '功能蓝图', icon: '⚙️' },
                        ].map(stage => {
                          const isSelected = pipelineStages.includes(stage.id);
                          return (
                            <button
                              key={stage.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setPipelineStages(pipelineStages.filter(s => s !== stage.id));
                                } else {
                                  setPipelineStages([...pipelineStages, stage.id]);
                                }
                              }}
                              className={`px-2 py-0.5 rounded-md text-[11px] border transition-all duration-150 ${
                                isSelected
                                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                                  : 'bg-gray-800/60 border-white/10 text-gray-400 hover:border-blue-500/30 hover:text-blue-300'
                              }`}
                            >
                              {stage.icon} {stage.label}
                            </button>
                          );
                        })}
                        <p className="w-full text-[10px] text-gray-600 mt-0.5">
                          开启后只拉取匹配选中阶段的子任务，并自动保留父任务结构
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Category Keywords Filter */}
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">标题关键词过滤</div>
                    <input
                      type="text"
                      value={categoryKeywords}
                      onChange={(e) => setCategoryKeywords(e.target.value)}
                      className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                      placeholder="交互, 设计, layout, 动效"
                    />
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      <Info size={10} className="inline mr-0.5 -mt-0.5" />
                      留空拉取全部，支持逗号分隔
                    </p>
                  </div>

                  {/* Module Feature Filter (custom_field_one) */}
                  <div>
                  <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-1">
                    <Filter size={11} className="text-purple-400" />
                    模块特性筛选（TAPD 自定义字段）
                  </div>
                  {/* Preset module feature tags */}
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {MODULE_FEATURE_PRESETS.map(tag => {
                      const currentList = moduleFeatureInput.split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
                      const isSelected = currentList.some(k => k === tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              const newList = currentList.filter(k => k !== tag);
                              setModuleFeatureInput(newList.join(', '));
                            } else {
                              const newList = [...currentList, tag];
                              setModuleFeatureInput(newList.join(', '));
                            }
                          }}
                          className={`px-2 py-0.5 rounded-md text-[11px] border transition-all duration-150 ${
                            isSelected
                              ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                              : 'bg-gray-800/60 border-white/10 text-gray-400 hover:border-purple-500/30 hover:text-purple-300'
                          }`}
                        >
                          {isSelected && <span className="mr-0.5">✓</span>}{tag}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={moduleFeatureInput}
                    onChange={(e) => setModuleFeatureInput(e.target.value)}
                    className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all duration-200"
                    placeholder="点击上方标签快速选择，或手动输入（多个用逗号分隔）"
                  />
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    <Info size={10} className="inline mr-0.5 -mt-0.5" />
                    按 TAPD 需求的「模块特性」字段筛选。支持模糊匹配，如输入                  </p>
                  </div>
                </div>

                {/* Owner Filter */}
                <div className="mt-2 pt-1.5 border-t border-white/5">
                  <div className="text-[11px] text-gray-500 mb-1.5 flex items-center gap-1">
                    <Filter size={11} className="text-amber-400" />
                    处理人筛选
                  </div>
                  {/* Team member tags from project resources */}
                  {teamResources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {teamResources.map(member => {
                        // Use tapdAccount as filter value if available, otherwise fall back to Chinese name
                        const filterValue = member.tapdAccount || member.name;
                        const currentList = ownerFilterInput.split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
                        // Extract pure account name before parentheses for matching, e.g. "chenhaoran36_zzmj(陈浩冉)" → "chenhaoran36_zzmj"
                        const extractAccount = (v: string) => v.replace(/\(.*?\)$/, '').replace(/（.*?）$/, '').trim().toLowerCase();
                        const isSelected = currentList.some(k => {
                          const kAccount = extractAccount(k);
                          const fAccount = extractAccount(filterValue);
                          return kAccount === fAccount || k.toLowerCase() === filterValue.toLowerCase();
                        });
                        const hasTapdAccount = !!member.tapdAccount;
                        return (
                          <button
                            key={member.id || member.name}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                // Remove all matching entries (including those with parenthesized Chinese name suffix)
                                const fAccount = extractAccount(filterValue);
                                const newList = currentList.filter(k => {
                                  const kAccount = extractAccount(k);
                                  return kAccount !== fAccount && k.toLowerCase() !== filterValue.toLowerCase();
                                });
                                setOwnerFilterInput(newList.join(', '));
                              } else {
                                // Deduplicate before adding
                                const fAccount = extractAccount(filterValue);
                                const deduped = currentList.filter(k => {
                                  const kAccount = extractAccount(k);
                                  return kAccount !== fAccount && k.toLowerCase() !== filterValue.toLowerCase();
                                });
                                const newList = [...deduped, filterValue];
                                setOwnerFilterInput(newList.join(', '));
                              }
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] border transition-all duration-150 ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : hasTapdAccount
                                  ? 'bg-gray-800/60 border-white/10 text-gray-400 hover:border-amber-500/30 hover:text-amber-300'
                                  : 'bg-gray-800/60 border-white/10 text-gray-500 hover:border-gray-500/30 hover:text-gray-400'
                            }`}
                            title={hasTapdAccount ? `TAPD账号: ${member.tapdAccount}` : '未配置TAPD账号，点击编辑成员信息添加'}
                          >
                            {isSelected && <span className="mr-0.5">✓</span>}
                            {member.name}
                            {hasTapdAccount && <span className="ml-0.5 text-[8px] opacity-60">🔗</span>}
                            {!hasTapdAccount && <span className="ml-0.5 text-[8px] opacity-40">⚠</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {teamResources.length === 0 && (
                    <p className="text-[11px] text-gray-600 mb-1.5 italic">暂无团队成员数据，请先在侧边栏添加成员</p>
                  )}
                  {teamResources.length > 0 && teamResources.some(m => !m.tapdAccount) && (
                    <p className="text-[11px] text-amber-600/80 mb-1.5 flex items-center gap-1">
                      <Info size={11} className="shrink-0" />
                      <span>⚠ 标记的成员未配置TAPD账号，筛选可能不准确。请在侧边栏编辑成员信息，填写TAPD英文账号ID。</span>
                    </p>
                  )}
                  <input
                    type="text"
                    value={ownerFilterInput}
                    onChange={(e) => setOwnerFilterInput(e.target.value)}
                    className="w-full bg-gray-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all duration-200"
                    placeholder="点击上方成员标签快速选择，或手动输入TAPD英文账号（多个用逗号或分号分隔）"
                  />
                  <div className="flex items-center gap-3 mt-1">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="ownerFilterMode"
                        checked={ownerFilterMode === 'server'}
                        onChange={() => setOwnerFilterMode('server')}
                        className="w-3 h-3 accent-amber-500"
                      />
                      <span className="text-[11px] text-gray-500">服务端筛选</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="ownerFilterMode"
                        checked={ownerFilterMode === 'client'}
                        onChange={() => setOwnerFilterMode('client')}
                        className="w-3 h-3 accent-amber-500"
                      />
                      <span className="text-[11px] text-gray-500">客户端筛选</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                    <Info size={10} className="inline mr-0.5 -mt-0.5" />
                    🔗标记的成员已绑定TAPD账号，点击即可精确筛选。⚠标记的成员需先编辑配置TAPD账号。留空则拉取所有人的需求。
                  </p>
                </div>

                {/* Module Mapping Configuration */}
                <div className="mt-2 pt-1.5 border-t border-white/5">
                  <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-1">
                    <Building2 size={11} />
                    项目模块映射（按关键词自动分配到不同项目）
                  </div>
                  
                  {/* Existing mappings */}
                  {moduleMappings.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {moduleMappings.map((mapping, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-800/40 rounded-lg px-2.5 py-1.5 border border-white/5">
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-gray-400 truncate">
                              关键词: <span className="text-blue-300">{mapping.keywords.join(', ')}</span>
                            </div>
                            <div className="text-[11px] text-gray-400 truncate">
                              → 项目: <span className="text-emerald-300">{mapping.targetProjectName}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setModuleMappings(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-gray-600 hover:text-red-400 transition-colors p-0.5"
                            title="删除映射"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new mapping */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newMappingKeywords}
                      onChange={(e) => setNewMappingKeywords(e.target.value)}
                      className="flex-1 bg-gray-950/80 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 transition-all duration-200"
                      placeholder="关键词（逗号分隔）"
                    />
                    <input
                      type="text"
                      value={newMappingProject}
                      onChange={(e) => setNewMappingProject(e.target.value)}
                      className="flex-1 bg-gray-950/80 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 transition-all duration-200"
                      placeholder="目标项目名称"
                    />
                    <button
                      onClick={() => {
                        if (!newMappingKeywords.trim() || !newMappingProject.trim()) return;
                        const keywords = newMappingKeywords.split(/[,，]/).map(k => k.trim()).filter(Boolean);
                        if (keywords.length === 0) return;
                        setModuleMappings(prev => [...prev, { keywords, targetProjectName: newMappingProject.trim() }]);
                        setNewMappingKeywords('');
                        setNewMappingProject('');
                      }}
                      disabled={!newMappingKeywords.trim() || !newMappingProject.trim()}
                      className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-500 disabled:opacity-30 text-white text-[11px] font-medium rounded-lg transition-all duration-200"
                    >
                      添加
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    <Info size={10} className="inline mr-0.5 -mt-0.5" />
                    根据需求标题关键词自动分配到对应项目。如："2D Avatar"→ 分配到"2D Avatar"项目。
                  </p>
                </div>

                {syncRangeMode !== 'all' && (
                  <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                    <Info size={10} className="inline mr-0.5 -mt-0.5" />
                    仅拉取指定时间范围内<strong className="text-gray-400">修改过</strong>的 TAPD 需求，可减少同步数据量。
                  </p>
                )}
              </div>

              <div className="flex justify-between pt-1.5">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting || !workspaceId.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-xs font-medium rounded-lg transition-all duration-200 border border-white/10 hover:-translate-y-0.5"
                >
                  {isTesting ? <RefreshCw size={13} className="animate-spin" /> : <LinkIcon size={13} />}
                  {isTesting ? '验证中...' : '验证连接'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !workspaceId.trim()}
                  className={`flex items-center gap-1.5 px-4 py-1.5 ${saveSuccess ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-lg ${saveSuccess ? 'shadow-emerald-500/20' : 'shadow-blue-500/20'} hover:-translate-y-0.5`}
                >
                  {saveSuccess ? <CheckCircle2 size={13} /> : <Save size={13} />}
                  {isSaving ? '保存中...' : saveSuccess ? '已保存 ✓' : '保存配置'}
                </button>
              </div>
              </div>

              {/* Right Panel: Story Preview List (Tree View) */}
              <div className="w-[380px] shrink-0 border-l border-white/10 flex flex-col bg-gray-950/30">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gray-800/40">
                  <div className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                    <Eye size={13} className="text-blue-400" />
                    需求预览
                    {previewStories.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[9px] font-bold">
                        {previewStories.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {previewStories.length > 0 && storyTree.parentChildMap.size > 0 && (
                      <button
                        onClick={() => {
                          if (collapsedParents.size > 0) {
                            setCollapsedParents(new Set());
                          } else {
                            setCollapsedParents(new Set(storyTree.parentChildMap.keys()));
                          }
                        }}
                        className="text-[10px] text-gray-400 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-700/30"
                        title={collapsedParents.size > 0 ? '全部展开' : '全部折叠'}
                      >
                        {collapsedParents.size > 0 ? '展开' : '折叠'}
                      </button>
                    )}
                    {previewStories.length > 0 && (
                      <button
                        onClick={() => {
                          if (selectedStories.size >= storyTree.allIds.size) {
                            setSelectedStories(new Set());
                          } else {
                            setSelectedStories(new Set(storyTree.allIds));
                          }
                        }}
                        className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors px-2 py-0.5 rounded hover:bg-blue-500/10"
                      >
                        {selectedStories.size >= storyTree.allIds.size ? '取消全选' : '全选'}
                      </button>
                    )}
                  </div>
                </div>

                {previewStories.length > 0 ? (
                  <>
                    {/* Stats bar */}
                    <div className="px-4 py-2 border-b border-white/5 bg-gray-800/20 flex items-center gap-2 text-[9px]">
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        已选 {Array.from(selectedStories).filter(id => !id.startsWith('_virtual_')).length}/{previewStories.length}
                      </span>
                      {(() => {
                        const owners = new Set(previewStories.map((s: any) => (s.Story || s).owner).filter(Boolean));
                        return owners.size > 0 && (
                          <span className="text-gray-500">{owners.size} 位处理人</span>
                        );
                      })()}
                      {storyTree.parentChildMap.size > 0 && (
                        <span className="text-gray-600">{storyTree.roots.length} 组</span>
                      )}
                    </div>

                    {/* Story tree - scrollable */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {storyTree.roots.map((node) => {
                        const { story, storyId, children } = node;
                        const hasChildren = children.length > 0;
                        const isCollapsed = collapsedParents.has(storyId);
                        const isSelected = selectedStories.has(storyId);
                        // Check partial selection for parent nodes
                        const allChildIds: string[] = [];
                        const collectChildIds = (n: StoryTreeNode) => { n.children.forEach(c => { allChildIds.push(c.storyId); collectChildIds(c); }); };
                        if (hasChildren) collectChildIds(node);
                        const selectedChildCount = allChildIds.filter(id => selectedStories.has(id)).length;
                        const isPartial = hasChildren && selectedChildCount > 0 && selectedChildCount < allChildIds.length;

                        // Render a single story row
                        const renderStoryRow = (s: any, sid: string, depth: number, isParent: boolean, childCount: number, isCollapsedNode: boolean, isPartialSel: boolean) => {
                          const sel = selectedStories.has(sid);
                          return (
                            <div
                              key={sid}
                              className={`flex items-start gap-1.5 py-2 pr-3 cursor-pointer transition-all duration-150 border-b border-white/5 last:border-b-0 ${sel ? 'bg-blue-500/10 hover:bg-blue-500/15' : 'hover:bg-gray-800/40'}`}
                              style={{ paddingLeft: `${12 + depth * 18}px` }}
                            >
                              {/* Expand/collapse toggle for parents */}
                              {isParent ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleParentCollapse(sid); }}
                                  className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                  {isCollapsedNode ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                </button>
                              ) : (
                                <div className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center">
                                  <div className="w-1 h-1 rounded-full bg-gray-600" />
                                </div>
                              )}
                              {/* Checkbox */}
                              <div
                                onClick={(e) => { e.stopPropagation(); toggleStorySelection(sid, isParent); }}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
                                  sel ? 'bg-blue-500 border-blue-500' : isPartialSel ? 'bg-blue-500/40 border-blue-400' : 'border-gray-600 hover:border-gray-400'
                                }`}
                              >
                                {sel && <CheckCircle2 size={10} className="text-white" />}
                                {!sel && isPartialSel && <MinusSquare size={10} className="text-white" />}
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0" onClick={() => toggleStorySelection(sid, isParent)}>
                                <div className={`text-[11px] leading-relaxed break-words flex items-center gap-1 ${s._isVirtual ? 'text-gray-400 font-medium' : 'text-gray-200'}`}>
                                  {s._isVirtual && <span className="text-[10px]">📁</span>}
                                  {s.name || s.title || '未命名需求'}
                                  {isParent && (
                                    <span className="text-[9px] text-gray-500 shrink-0">({childCount})</span>
                                  )}
                                  {s._isVirtual && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 shrink-0">父需求</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                                  {s.owner && <span className="flex items-center gap-0.5">👤 {s.owner}</span>}
                                  {s.status && !s._isVirtual && (
                                    <span className={`px-1 py-0.5 rounded text-[9px] ${
                                      s.status === 'done' || s.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-400' :
                                      s.status === 'progressing' || s.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400' :
                                      'bg-gray-700/50 text-gray-400'
                                    }`}>{s.status}</span>
                                  )}
                                  {s._isVirtual && s._realParentId && (
                                    <span className="text-[9px] text-gray-600">TAPD #{s._realParentId.slice(-6)}</span>
                                  )}
                                </div>
                              </div>
                              {/* TAPD link - hide for virtual parent nodes */}
                              {!s._isVirtual ? (
                                <a
                                  href={`https://tapd.woa.com/${workspaceId.trim()}/stories/view/${sid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="shrink-0 p-1 rounded hover:bg-blue-500/20 text-gray-500 hover:text-blue-400 transition-colors mt-0.5"
                                  title="在 TAPD 中查看"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              ) : s._realParentId ? (
                                <a
                                  href={`https://tapd.woa.com/${workspaceId.trim()}/stories/view/${s._realParentId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="shrink-0 p-1 rounded hover:bg-purple-500/20 text-gray-600 hover:text-purple-400 transition-colors mt-0.5"
                                  title="在 TAPD 中查看父需求"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              ) : null}
                            </div>
                          );
                        };

                        // Recursively render children
                        const renderChildren = (nodes: StoryTreeNode[], depth: number): React.ReactNode[] => {
                          return nodes.map(child => {
                            const cHasChildren = child.children.length > 0;
                            const cIsCollapsed = collapsedParents.has(child.storyId);
                            const cAllChildIds: string[] = [];
                            const cCollect = (n: StoryTreeNode) => { n.children.forEach(c2 => { cAllChildIds.push(c2.storyId); cCollect(c2); }); };
                            if (cHasChildren) cCollect(child);
                            const cSelCount = cAllChildIds.filter(id => selectedStories.has(id)).length;
                            const cIsPartial = cHasChildren && cSelCount > 0 && cSelCount < cAllChildIds.length;
                            return (
                              <React.Fragment key={child.storyId}>
                                {renderStoryRow(child.story, child.storyId, depth, cHasChildren, child.children.length, cIsCollapsed, cIsPartial)}
                                {cHasChildren && !cIsCollapsed && renderChildren(child.children, depth + 1)}
                              </React.Fragment>
                            );
                          });
                        };

                        return (
                          <React.Fragment key={storyId}>
                            {renderStoryRow(story, storyId, 0, hasChildren, children.length, isCollapsed, isPartial)}
                            {hasChildren && !isCollapsed && renderChildren(children, 1)}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-6">
                    <Eye size={32} className="mb-3 opacity-30" />
                    <div className="text-xs text-center">
                      {isTesting ? (
                        <span className="text-blue-400">正在获取需求列表...</span>
                      ) : testStatus === 'error' ? (
                        <span className="text-red-400">连接失败，请检查配置</span>
                      ) : (
                        <>
                          <div className="mb-1">点击左侧「验证连接」</div>
                          <div className="text-gray-700">获取 TAPD 需求预览</div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Sync Tab ─── */}
          {activeTab === 'sync' && (
            <>
              {/* Status dashboard */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800/40 backdrop-blur-sm rounded-lg p-4 border border-white/10 flex flex-col items-center justify-center hover:bg-gray-800/60 transition-all duration-200 min-h-[72px]">
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-400">{pendingChanges}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">待推送变更</div>
                </div>
                <div className="bg-gray-800/40 backdrop-blur-sm rounded-lg p-4 border border-white/10 flex flex-col items-center justify-center hover:bg-gray-800/60 transition-all duration-200 min-h-[72px]">
                  <div className="text-lg font-bold font-mono tabular-nums text-red-400">{unresolvedConflicts.length}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">未解决冲突</div>
                </div>
                <div className="bg-gray-800/40 backdrop-blur-sm rounded-lg p-4 border border-white/10 flex flex-col items-center justify-center hover:bg-gray-800/60 transition-all duration-200 min-h-[72px]">
                  <div className="text-[11px] font-medium font-mono tabular-nums text-gray-300">{formatTime(lastSyncAt)}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">上次同步</div>
                </div>
              </div>

              {/* Sync engine status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                syncStatus === 'idle' ? 'bg-gray-800/30 text-gray-400' :
                syncStatus === 'pulling' || syncStatus === 'pushing' ? 'bg-blue-500/10 text-blue-400' :
                syncStatus === 'resolving' ? 'bg-amber-500/10 text-amber-400' :
                syncStatus === 'offline' ? 'bg-gray-800/50 text-gray-500' :
                'bg-red-500/10 text-red-400'
              }`}>
                {(syncStatus === 'pulling' || syncStatus === 'pushing') && (
                  <RefreshCw size={12} className="animate-spin" />
                )}
                {syncStatus === 'idle' && <CheckCircle2 size={12} />}
                {syncStatus === 'offline' && <WifiOff size={12} />}
                {syncStatus === 'error' && <AlertCircle size={12} />}
                {syncStatus === 'resolving' && <GitMerge size={12} />}
                <span>
                  {syncStatus === 'idle' && '同步引擎就绪'}
                  {syncStatus === 'pulling' && '正在拉取远程变更...'}
                  {syncStatus === 'pushing' && '正在推送本地变更...'}
                  {syncStatus === 'resolving' && '存在冲突需要解决'}
                  {syncStatus === 'offline' && '离线模式 — 变更已缓存到本地队列'}
                  {syncStatus === 'error' && '同步出错'}
                </span>
              </div>

              {/* Refresh result */}
              {refreshResult && (
                <div className="bg-sky-500/10 rounded-lg border border-sky-500/20 overflow-hidden">
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-sky-300">🔄 状态刷新结果</div>
                      {refreshResult.details.length > 0 && (
                        <button
                          onClick={() => setRefreshDetailExpanded(!refreshDetailExpanded)}
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          {refreshDetailExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          {refreshDetailExpanded ? '收起详情' : '展开详情'}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-[11px]">
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-sky-400">{refreshResult.totalChecked}</div>
                        <div className="text-gray-500">已检查</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">{refreshResult.newlyBoundCount || 0}</div>
                        <div className="text-gray-500">新绑定</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-blue-400">{refreshResult.updatedCount}</div>
                        <div className="text-gray-500">有变更</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-gray-400">{refreshResult.unchangedCount}</div>
                        <div className="text-gray-500">无变化</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-amber-400">{refreshResult.failedCount}</div>
                        <div className="text-gray-500">未匹配</div>
                      </div>
                    </div>
                  </div>

                  {/* Expandable refresh detail list */}
                  {refreshDetailExpanded && refreshResult.details.length > 0 && (
                    <div className="border-t border-sky-500/15">
                      <div className="max-h-[300px] overflow-y-auto px-3 py-2 space-y-1.5">
                        {refreshResult.details.map((item, idx) => (
                          <div key={`${item.tapdId}-${idx}`} className="py-2 px-2.5 rounded-md bg-gray-800/30 hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center gap-2 mb-1.5">
                              {item.externalUrl ? (
                                <a
                                  href={item.externalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-sky-300 hover:text-sky-200 truncate flex-1 min-w-0 hover:underline"
                                  title={item.title}
                                >
                                  {item.title}
                                </a>
                              ) : (
                                <span className="text-[11px] text-gray-300 truncate flex-1 min-w-0" title={item.title}>
                                  {item.title}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {item.changes.map((change, ci) => {
                                const fieldLabels: Record<string, string> = {
                                  status: '状态',
                                  startDate: '开始日期',
                                  endDate: '结束日期',
                                  priority: '优先级',
                                  progress: '进度',
                                  assignee: '处理人',
                                  bind: '🔗 绑定TAPD',
                                };
                                const statusLabels: Record<string, string> = {
                                  todo: '待办',
                                  in_progress: '进行中',
                                  done: '已完成',
                                };
                                const formatValue = (field: string, val: string) => {
                                  if (field === 'status') return statusLabels[val] || val;
                                  if (field === 'bind') return '已绑定';
                                  return val;
                                };
                                // For "bind" type, show a special green badge
                                if (change.field === 'bind') {
                                  return (
                                    <span key={ci} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25">
                                      <span className="text-emerald-300">{fieldLabels[change.field]}</span>
                                    </span>
                                  );
                                }
                                return (
                                  <span key={ci} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/15">
                                    <span className="text-gray-400">{fieldLabels[change.field] || change.field}:</span>
                                    <span className="text-red-300 line-through">{formatValue(change.field, change.oldValue)}</span>
                                    <span className="text-gray-500">→</span>
                                    <span className="text-emerald-300">{formatValue(change.field, change.newValue)}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Upsert sync result */}
              {upsertResult && (
                <div className="bg-emerald-500/10 rounded-lg border border-emerald-500/20 overflow-hidden">
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-emerald-300">TAPD 同步结果</div>
                      {upsertResult.details && upsertResult.details.length > 0 && (
                        <button
                          onClick={() => setSyncDetailExpanded(!syncDetailExpanded)}
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          {syncDetailExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          {syncDetailExpanded ? '收起详情' : '展开详情'}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px]">
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">{upsertResult.inserted}</div>
                        <div className="text-gray-500">新增</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-blue-400">{upsertResult.updated}</div>
                        <div className="text-gray-500">更新</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-purple-400">{upsertResult.merged || 0}</div>
                        <div className="text-gray-500">合并</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-white">{upsertResult.total}</div>
                        <div className="text-gray-500">合计</div>
                      </div>
                    </div>
                  </div>

                  {/* Expandable detail list */}
                  {syncDetailExpanded && upsertResult.details && upsertResult.details.length > 0 && (
                    <div className="border-t border-emerald-500/15">
                      {/* Detail filter tabs */}
                      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
                        {(['all', 'inserted', 'updated', 'merged', 'skipped'] as const).map(filterType => {
                          const count = filterType === 'all'
                            ? upsertResult.details!.length
                            : upsertResult.details!.filter(d => d.action === filterType).length;
                          if (filterType !== 'all' && count === 0) return null;
                          const labels: Record<string, { text: string; color: string }> = {
                            all: { text: '全部', color: 'text-gray-300 bg-gray-700/50' },
                            inserted: { text: '新增', color: 'text-emerald-300 bg-emerald-600/20' },
                            updated: { text: '更新', color: 'text-blue-300 bg-blue-600/20' },
                            merged: { text: '合并', color: 'text-purple-300 bg-purple-600/20' },
                            skipped: { text: '跳过', color: 'text-gray-400 bg-gray-600/20' },
                          };
                          const { text, color } = labels[filterType];
                          return (
                            <button
                              key={filterType}
                              onClick={() => setSyncDetailFilter(filterType)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                                syncDetailFilter === filterType
                                  ? `${color} ring-1 ring-white/10`
                                  : 'text-gray-500 hover:text-gray-300'
                              }`}
                            >
                              {text} ({count})
                            </button>
                          );
                        })}
                      </div>
                      {/* Detail items */}
                      <div className="max-h-[280px] overflow-y-auto px-3 pb-2 space-y-1">
                        {upsertResult.details
                          .filter(d => syncDetailFilter === 'all' || d.action === syncDetailFilter)
                          .map((item, idx) => {
                            const actionConfig: Record<string, { label: string; color: string; bg: string }> = {
                              inserted: { label: '新增', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
                              updated: { label: '更新', color: 'text-blue-400', bg: 'bg-blue-500/15' },
                              merged: { label: '合并', color: 'text-purple-400', bg: 'bg-purple-500/15' },
                              skipped: { label: '跳过', color: 'text-gray-500', bg: 'bg-gray-500/15' },
                            };
                            const ac = actionConfig[item.action] || actionConfig.inserted;
                            return (
                              <div key={`${item.tapdId}-${idx}`} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-gray-800/30 hover:bg-gray-800/50 transition-colors group">
                                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${ac.color} ${ac.bg}`}>
                                  {ac.label}
                                </span>
                                <div className="flex-1 min-w-0">
                                  {item.externalUrl ? (
                                    <a
                                      href={item.externalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-blue-300/90 hover:text-blue-200 hover:underline truncate block"
                                      title={item.title}
                                    >
                                      {item.title}
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-gray-300 truncate block" title={item.title}>
                                      {item.title}
                                    </span>
                                  )}
                                </div>
                                {item.owner && (
                                  <span className="shrink-0 text-[10px] text-gray-500 max-w-[60px] truncate" title={item.owner}>
                                    {item.owner}
                                  </span>
                                )}
                                {item.externalUrl && (
                                  <a
                                    href={item.externalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-gray-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="在 TAPD 中查看"
                                  >
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bidirectional sync result */}
              {syncResult && (
                <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30 space-y-1.5">
                  <div className="text-xs font-medium text-gray-300 mb-2">双向同步结果</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Upload size={11} className="text-blue-400" />
                      <span className="text-gray-400">推送:</span>
                      <span className="text-white font-medium font-mono tabular-nums">{syncResult.pushed} 条</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Download size={11} className="text-green-400" />
                      <span className="text-gray-400">拉取:</span>
                      <span className="text-white font-medium font-mono tabular-nums">{syncResult.pulled} 条</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <GitMerge size={11} className="text-amber-400" />
                      <span className="text-gray-400">冲突:</span>
                      <span className={`font-medium font-mono tabular-nums ${syncResult.conflicts > 0 ? 'text-amber-400' : 'text-white'}`}>
                        {syncResult.conflicts} 条
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AlertCircle size={11} className="text-red-400" />
                      <span className="text-gray-400">失败:</span>
                      <span className={`font-medium font-mono tabular-nums ${syncResult.errors > 0 ? 'text-red-400' : 'text-white'}`}>
                        {syncResult.errors} 条
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Dedup Detection Panel */}
              <div className="border-t border-white/10 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Search size={12} className="text-purple-400" />
                    <span className="text-xs font-medium text-gray-300">重复检测</span>
                  </div>
                  <button
                    onClick={async () => {
                      setIsDetectingDupes(true);
                      setShowDedupPanel(true);
                      try {
                        const dupes = await tapdService.detectDuplicates(selectedProjectId);
                        setDuplicates(dupes);
                      } catch (err: any) {
                        setErrorMessage(err.message || '重复检测失败');
                      } finally {
                        setIsDetectingDupes(false);
                      }
                    }}
                    disabled={isDetectingDupes || !existingConfig}
                    className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-40 text-purple-300 text-[10px] font-medium rounded-lg transition-all duration-200 border border-purple-500/20"
                  >
                    {isDetectingDupes ? <RefreshCw size={10} className="animate-spin" /> : <Search size={10} />}
                    {isDetectingDupes ? '检测中...' : '检测重复'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 mb-2">
                  检测手动录入的任务与 TAPD 需求是否重复，可选择合并关联。
                </p>

                {showDedupPanel && duplicates.length > 0 && (
                  <div>
                    {/* Summary bar */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[10px] text-gray-400">
                        检测到 <span className="text-purple-300 font-medium">{duplicates.length}</span> 组疑似重复
                        {mergeDecisions.size > 0 && (
                          <span className="ml-2 text-emerald-400">（已处理 {mergeDecisions.size} 组）</span>
                        )}
                      </span>
                      {mergeDecisions.size > 0 && (
                        <span className="text-[10px] text-gray-600">下次同步时自动应用</span>
                      )}
                    </div>
                    {/* Duplicate list */}
                    <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5">
                      {duplicates.map((dup, idx) => {
                        const decision = mergeDecisions.get(dup.tapdId);
                        return (
                          <div key={dup.tapdId} className={`bg-gray-800/40 rounded-lg border transition-all ${
                            decision === dup.localTaskId ? 'border-emerald-500/25 bg-emerald-900/10' :
                            decision === 'skip' ? 'border-gray-600/20 opacity-60' :
                            'border-white/5'
                          }`}>
                            <div className="flex items-stretch">
                              {/* Left: info area */}
                              <div className="flex-1 min-w-0 p-2.5 pr-2 space-y-1">
                                {/* TAPD title row */}
                                <div className="flex items-start gap-1.5">
                                  <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium leading-none mt-0.5">TAPD</span>
                                  <span className="text-[11px] text-blue-200 leading-snug break-all">{dup.tapdTitle}</span>
                                </div>
                                {/* Local title row */}
                                <div className="flex items-start gap-1.5">
                                  <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium leading-none mt-0.5">本地</span>
                                  <span className="text-[11px] text-amber-200 leading-snug break-all">{dup.localTitle}</span>
                                </div>
                                {/* Meta row: similarity + owner */}
                                <div className="flex items-center gap-2 pt-0.5">
                                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    dup.similarity >= 95 ? 'bg-emerald-500/20 text-emerald-300' :
                                    dup.similarity >= 85 ? 'bg-amber-500/20 text-amber-300' :
                                    'bg-gray-500/20 text-gray-300'
                                  }`}>
                                    {dup.similarity >= 95 ? '🟢' : dup.similarity >= 85 ? '🟡' : '⚪'} {dup.similarity}%
                                  </span>
                                  {dup.tapdOwner && (
                                    <span className="text-[10px] text-gray-500">
                                      处理人: <span className="text-gray-300">{dup.tapdOwner}</span>
                                    </span>
                                  )}
                                  {decision === dup.localTaskId && (
                                    <span className="text-[9px] text-emerald-400 ml-auto">✓ 已关联</span>
                                  )}
                                  {decision === 'skip' && (
                                    <span className="text-[9px] text-gray-500 ml-auto">已跳过</span>
                                  )}
                                </div>
                              </div>
                              {/* Right: action buttons (vertical) */}
                              <div className="shrink-0 flex flex-col border-l border-white/5 w-[60px]">
                                <button
                                  onClick={() => {
                                    setMergeDecisions(prev => {
                                      const next = new Map(prev);
                                      next.set(dup.tapdId, dup.localTaskId);
                                      return next;
                                    });
                                  }}
                                  className={`flex-1 flex items-center justify-center text-[10px] font-medium transition-all ${
                                    decision === dup.localTaskId
                                      ? 'bg-emerald-600/25 text-emerald-300'
                                      : 'text-gray-500 hover:text-emerald-300 hover:bg-emerald-600/10'
                                  }`}
                                  title="合并关联"
                                >
                                  关联
                                </button>
                                <div className="border-t border-white/5" />
                                <button
                                  onClick={() => {
                                    setMergeDecisions(prev => {
                                      const next = new Map(prev);
                                      next.set(dup.tapdId, 'skip');
                                      return next;
                                    });
                                  }}
                                  className={`flex-1 flex items-center justify-center text-[10px] font-medium transition-all ${
                                    decision === 'skip'
                                      ? 'bg-gray-600/25 text-gray-300'
                                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-600/10'
                                  }`}
                                  title="跳过"
                                >
                                  跳过
                                </button>
                                <div className="border-t border-white/5" />
                                <button
                                  onClick={() => {
                                    setMergeDecisions(prev => {
                                      const next = new Map(prev);
                                      next.delete(dup.tapdId);
                                      return next;
                                    });
                                  }}
                                  className="flex-1 flex items-center justify-center text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
                                  title="重置"
                                >
                                  重置
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showDedupPanel && duplicates.length === 0 && !isDetectingDupes && (
                  <div className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded-lg p-2 text-center border border-emerald-500/20">
                    ✓ 未检测到重复任务
                  </div>
                )}
              </div>

              {/* Sync actions */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDirectSync}
                    disabled={isSyncing || isRefreshing || !existingConfig}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5"
                  >
                    {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                    {isSyncing ? '同步中...' : '拉取任务'}
                  </button>
                  <button
                    onClick={handleRefreshStatus}
                    disabled={isSyncing || isRefreshing || !existingConfig}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-lg shadow-sky-500/20 hover:-translate-y-0.5"
                  >
                    {isRefreshing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isRefreshing ? '刷新中...' : '刷新状态'}
                  </button>
                </div>
                <button
                  onClick={handleFullSync}
                  disabled={isSyncing || !isOnline || !existingConfig}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-xs font-medium rounded-lg transition-all duration-200 border border-white/10 hover:-translate-y-0.5"
                >
                  {isSyncing ? <RefreshCw size={13} className="animate-spin" /> : <ArrowUpDown size={13} />}
                  双向增量同步
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePushOnly}
                    disabled={isSyncing || !isOnline || pendingChanges === 0}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-30 text-gray-300 text-xs font-medium rounded-lg transition-all duration-200 border border-white/10 hover:-translate-y-0.5"
                  >
                    <Upload size={12} />
                    仅推送 (<span className="font-mono tabular-nums">{pendingChanges}</span>)
                  </button>
                  <button
                    onClick={handlePullOnly}
                    disabled={isSyncing || !isOnline}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800/80 hover:bg-gray-700 disabled:opacity-30 text-gray-300 text-xs font-medium rounded-lg transition-all duration-200 border border-white/10 hover:-translate-y-0.5"
                  >
                    <Download size={12} />
                    仅拉取
                  </button>
                </div>
              </div>

              {!existingConfig && (
                <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                  <AlertCircle size={14} />
                  请先在「配置」页签中绑定 TAPD 工作区。
                </div>
              )}

              {!isOnline && (
                <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                  <WifiOff size={14} />
                  当前处于离线状态，所有变更已安全缓存到本地队列，恢复网络后将自动推送。
                </div>
              )}

              {/* ─── File Import Section ─── */}
              <div className="border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <FileSpreadsheet size={14} className="text-violet-400" />
                  <span className="text-xs font-medium text-gray-300">从文件导入（半自动方式）</span>
                </div>

                {/* ── Preview Mode ── */}
                {previewData && previewData.rows.length > 0 ? (
                  <div className="space-y-3">
                    {/* Preview header with back button */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleBackFromPreview}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
                      >
                        <ArrowLeft size={12} />
                        返回
                      </button>
                      <div className="text-[10px] text-gray-500">
                        共 <span className="text-white font-medium font-mono">{previewData.rows.length}</span> 条记录，
                        已选 <span className="text-violet-400 font-medium font-mono">{selectedRows.size}</span> 条
                      </div>
                    </div>

                    {/* Search bar */}
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索标题、处理人、ID..."
                        className="w-full bg-gray-950/80 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all duration-200"
                      />
                    </div>

                    {/* Filter bar - Row 1: Primary filters */}
                    <div className="flex flex-wrap gap-1.5">
                      {/* Status filter */}
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-gray-800/80 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                      >
                        <option value="all">全部状态</option>
                        <option value="todo">待处理</option>
                        <option value="in_progress">进行中</option>
                        <option value="done">已完成</option>
                      </select>

                      {/* Owner filter */}
                      <select
                        value={filterOwner}
                        onChange={(e) => setFilterOwner(e.target.value)}
                        className="bg-gray-800/80 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-violet-500 cursor-pointer max-w-[120px]"
                      >
                        <option value="all">全部处理人</option>
                        {previewData.owners.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>

                      {/* Existence filter */}
                      <select
                        value={filterExistence}
                        onChange={(e) => setFilterExistence(e.target.value as any)}
                        className="bg-gray-800/80 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                      >
                        <option value="all">新增/已有</option>
                        <option value="new">仅新增</option>
                        <option value="existing">仅已有</option>
                      </select>

                      {/* Duplicate filter */}
                      <select
                        value={filterDuplicate}
                        onChange={(e) => setFilterDuplicate(e.target.value as any)}
                        className={`bg-gray-800/80 border rounded-md px-2 py-1 text-[10px] focus:outline-none focus:border-violet-500 cursor-pointer ${
                          filterDuplicate === 'duplicate' ? 'border-amber-500/40 text-amber-300' : 'border-white/10 text-gray-300'
                        }`}
                      >
                        <option value="all">重复状态</option>
                        <option value="duplicate">⚠ 仅重复项</option>
                        <option value="unique">仅无重复</option>
                      </select>

                      {/* Hierarchy filter */}
                      <select
                        value={filterHierarchy}
                        onChange={(e) => setFilterHierarchy(e.target.value as any)}
                        className="bg-gray-800/80 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                      >
                        <option value="all">全部层级</option>
                        <option value="parent">仅父任务</option>
                        <option value="child">仅子任务</option>
                      </select>

                      {/* Module filter (only show if modules exist) */}
                      {previewData.modules && previewData.modules.length > 0 && (
                        <select
                          value={filterModule}
                          onChange={(e) => setFilterModule(e.target.value)}
                          className="bg-gray-800/80 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-violet-500 cursor-pointer max-w-[120px]"
                        >
                          <option value="all">全部模块</option>
                          {previewData.modules.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Quick stats bar */}
                    <div className="flex items-center gap-1.5 text-[9px] flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        新增 {previewData.rows.filter(r => !r.existsLocally).length}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        已有 {previewData.rows.filter(r => r.existsLocally).length}
                      </span>
                      {previewData.rows.filter(r => r.duplicateInfo).length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium animate-pulse">
                          ⚠ 重复 {previewData.rows.filter(r => r.duplicateInfo).length}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                        父 {previewData.rows.filter(r => (r.depth || 0) === 0).length}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-400 border border-gray-500/20">
                        子 {previewData.rows.filter(r => (r.depth || 0) > 0).length}
                      </span>
                      {/* Active filter indicator */}
                      {(filterStatus !== 'all' || filterOwner !== 'all' || filterExistence !== 'all' || filterDuplicate !== 'all' || filterHierarchy !== 'all' || filterModule !== 'all') && (
                        <button
                          onClick={() => {
                            setFilterStatus('all');
                            setFilterOwner('all');
                            setFilterExistence('all');
                            setFilterDuplicate('all');
                            setFilterHierarchy('all');
                            setFilterModule('all');
                          }}
                          className="ml-auto px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer"
                        >
                          ✕ 清除筛选
                        </button>
                      )}
                    </div>

                    {/* Select all / deselect */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleSelectAllFiltered}
                        className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        {filteredPreviewRows.length > 0 && filteredPreviewRows.every(r => selectedRows.has(r.rowIndex))
                          ? <CheckSquare size={12} />
                          : filteredPreviewRows.some(r => selectedRows.has(r.rowIndex))
                            ? <MinusSquare size={12} />
                            : <Square size={12} />
                        }
                        {filteredPreviewRows.length > 0 && filteredPreviewRows.every(r => selectedRows.has(r.rowIndex))
                          ? '取消全选'
                          : `全选筛选结果 (${filteredPreviewRows.length})`
                        }
                      </button>
                    </div>

                    {/* Preview table */}
                    <div className="max-h-[280px] overflow-y-auto rounded-lg border border-white/10 bg-gray-950/50">
                      {filteredPreviewRows.length === 0 ? (
                        <div className="text-center py-6 text-[11px] text-gray-500">
                          没有匹配的记录
                        </div>
                      ) : (
                        <div className="divide-y divide-white/5">
                          {filteredPreviewRows.map(row => {
                            const indent = (row.depth || 0) * 16;
                            const isChild = (row.depth || 0) > 0;
                            return (
                            <div
                              key={row.rowIndex}
                              onClick={() => toggleRowSelection(row.rowIndex)}
                              className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-all duration-150 hover:bg-white/5 ${
                                selectedRows.has(row.rowIndex) ? 'bg-violet-500/8' : ''
                              } ${row.duplicateInfo ? 'border-l-2 border-l-amber-500/60' : ''}`}
                              style={{ paddingLeft: `${12 + indent}px` }}
                            >
                              {/* Hierarchy connector line for children */}
                              {isChild && (
                                <div className="shrink-0 flex items-center pt-1.5 -ml-1 mr-0.5">
                                  <span className="text-gray-600 text-[10px]">└</span>
                                </div>
                              )}

                              {/* Checkbox */}
                              <div className="pt-0.5 shrink-0">
                                {selectedRows.has(row.rowIndex)
                                  ? <CheckSquare size={13} className="text-violet-400" />
                                  : <Square size={13} className="text-gray-600" />
                                }
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {/* Duplicate warning badge (highest priority) */}
                                  {row.duplicateInfo ? (
                                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                                      重复 {row.duplicateInfo.similarity}%
                                    </span>
                                  ) : row.existsLocally ? (
                                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
                                      已有
                                    </span>
                                  ) : (
                                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                      新增
                                    </span>
                                  )}
                                  {/* Parent/Child indicator */}
                                  {!isChild && row.parentTapdId === undefined && filteredPreviewRows.some(r => r.parentTapdId === row.tapdId) && (
                                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                                      父
                                    </span>
                                  )}
                                  {isChild && (
                                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-gray-600/30 text-gray-400 border border-gray-500/20">
                                      子
                                    </span>
                                  )}
                                  {/* Title */}
                                  <span className={`text-[11px] truncate font-medium ${isChild ? 'text-gray-300' : 'text-gray-200'}`}>{row.title}</span>
                                </div>
                                {/* Duplicate match info */}
                                {row.duplicateInfo && (
                                  <div className="text-[9px] text-amber-400/70 bg-amber-500/5 rounded px-1.5 py-0.5">
                                    ⚠ 与本地「{row.duplicateInfo.localTitle}」疑似重复（{row.duplicateInfo.matchReason === 'title_exact' ? '标题完全匹配' : row.duplicateInfo.matchReason === 'title_fuzzy' ? '标题模糊匹配' : '负责人+时间匹配'}）
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-[9px] text-gray-500">
                                  {/* Status */}
                                  <span className={`px-1 py-0.5 rounded ${
                                    row.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
                                    row.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' :
                                    'bg-gray-700/50 text-gray-400'
                                  }`}>
                                    {row.statusRaw || (row.status === 'done' ? '已完成' : row.status === 'in_progress' ? '进行中' : '待处理')}
                                  </span>
                                  {/* Priority */}
                                  <span className={`${
                                    row.priority === 'high' ? 'text-red-400' :
                                    row.priority === 'medium' ? 'text-amber-400' :
                                    'text-gray-500'
                                  }`}>
                                    {row.priorityRaw || row.priority}
                                  </span>
                                  {/* Owner */}
                                  {row.owner && <span className="text-gray-400">👤 {row.owner}</span>}
                                  {/* Date range */}
                                  {(row.startDate || row.endDate) && (
                                    <span className="text-gray-600">
                                      {row.startDate || '?'} ~ {row.endDate || '?'}
                                    </span>
                                  )}
                                  {/* TAPD ID */}
                                  {row.tapdId && <span className="text-gray-600 font-mono">#{row.tapdId}</span>}
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Parse errors */}
                    {previewData.errors.length > 0 && (
                      <div className="space-y-1">
                        {previewData.errors.slice(0, 3).map((err, i) => (
                          <div key={i} className="text-[10px] text-amber-400/80 flex items-start gap-1">
                            <AlertCircle size={10} className="shrink-0 mt-0.5" />
                            {err}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Confirm import button */}
                    <button
                      onClick={handleConfirmImport}
                      disabled={isImporting || selectedRows.size === 0}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg shadow-violet-500/20 hover:-translate-y-0.5"
                    >
                      {isImporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                      {isImporting ? '导入中...' : `确认导入 ${selectedRows.size} 条任务`}
                    </button>
                  </div>
                ) : (
                  /* ── File Selection Mode ── */
                  <>
                    <div className="bg-violet-500/8 border border-violet-500/15 rounded-lg p-3 text-[11px] text-violet-200/80 leading-relaxed mb-3">
                      <p className="mb-1.5">如果无法通过 MCP 代理连接 TAPD，可以使用以下半自动方式：</p>
                      <ol className="list-decimal list-inside space-y-1 text-[10px] text-gray-400">
                        <li>打开 TAPD 项目 → 需求/任务列表</li>
                        <li>点击右上角「导出」→ 选择 CSV 或 Excel 格式</li>
                        <li>点击下方按钮选择文件 → <span className="text-violet-300">预览筛选</span> → 确认导入</li>
                      </ol>
                    </div>

                    <button
                      onClick={handleFileSelect}
                      disabled={isParsing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg shadow-violet-500/20 hover:-translate-y-0.5"
                    >
                      {isParsing ? <RefreshCw size={15} className="animate-spin" /> : <Eye size={15} />}
                      {isParsing ? '解析中...' : '选择文件并预览'}
                    </button>

                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-px bg-white/5" />
                      <span className="text-[9px] text-gray-600">或</span>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>

                    <button
                      onClick={handleFileImport}
                      disabled={isImporting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-1.5 bg-gray-800/60 hover:bg-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed text-gray-400 text-[11px] font-medium rounded-lg transition-all duration-200 border border-white/5"
                    >
                      {isImporting ? <RefreshCw size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
                      {isImporting ? '导入中...' : '直接全量导入（跳过预览）'}
                    </button>
                  </>
                )}

                {/* Import result */}
                {importResult && (
                  <div className={`mt-3 rounded-lg p-3 border space-y-1.5 ${
                    importResult.errors.length > 0 && importResult.inserted === 0
                      ? 'bg-red-500/10 border-red-500/20'
                      : 'bg-emerald-500/10 border-emerald-500/20'
                  }`}>
                    <div className={`text-xs font-medium mb-2 ${
                      importResult.errors.length > 0 && importResult.inserted === 0
                        ? 'text-red-300' : 'text-emerald-300'
                    }`}>文件导入结果</div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">{importResult.inserted}</div>
                        <div className="text-gray-500">新增</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-blue-400">{importResult.updated}</div>
                        <div className="text-gray-500">更新</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold font-mono tabular-nums text-amber-400">{importResult.skipped}</div>
                        <div className="text-gray-500">跳过</div>
                      </div>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {importResult.errors.slice(0, 3).map((err, i) => (
                          <div key={i} className="text-[10px] text-red-400/80 flex items-start gap-1">
                            <AlertCircle size={10} className="shrink-0 mt-0.5" />
                            {err}
                          </div>
                        ))}
                        {importResult.errors.length > 3 && (
                          <div className="text-[10px] text-gray-500">...还有 {importResult.errors.length - 3} 条错误</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ─── Conflicts Tab ─── */}
          {activeTab === 'conflicts' && (
            <>
              {unresolvedConflicts.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-500/50 mb-3" />
                    <div className="text-sm text-gray-400">没有未解决的冲突</div>
                    <div className="text-xs text-gray-600 mt-1">所有数据已保持一致</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500">
                    以下记录在本地和远程同时被修改，请选择保留哪个版本：
                  </div>
                  {unresolvedConflicts.map(conflict => (
                    <ConflictCard
                      key={conflict.id}
                      conflict={conflict}
                      onResolve={handleResolveConflict}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Log Tab ─── */}
          {activeTab === 'log' && (
            <>
              {syncLog.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <History size={32} className="mx-auto text-gray-700 mb-3" />
                    <div className="text-sm text-gray-500">暂无同步日志</div>
                  </div>
                </div>
              ) : (
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conflict Resolution Card ────────────────────────────────────
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
          {/* Conflict fields comparison */}
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

          {/* Resolution buttons */}
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