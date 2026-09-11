// --- TAPD Config ---

/** Authentication mode for TAPD integration */
export type TapdAuthMode = 'rest' | 'mcp-gateway';

/** Module mapping: maps keywords to a local project for automatic categorization */
export interface ModuleMapping {
  /** Keywords to match in story title (case-insensitive) */
  keywords: string[];
  /** Target local project ID to assign matched stories to */
  targetProjectId?: number;
  /** Target project name (for display / auto-creation) */
  targetProjectName: string;
}

export interface TapdConfig {
  id?: number;
  workspaceId: string;
  workspaceName?: string;
  projectId: number;
  /** Authentication mode: 'rest' (API user+token via Vite proxy) or 'mcp-gateway' (streamable-http via MCP gateway) */
  authMode?: TapdAuthMode;
  apiUser?: string;
  apiPassword?: string;
  /** Personal access token for TAPD REST API authentication */
  apiToken?: string;
  /** MCP Gateway URL (e.g. https://mcpgw.knot.woa.com/tapd/) */
  mcpGatewayUrl?: string;
  /** Personal access token for MCP Gateway (X-Tapd-Access-Token header) */
  mcpAccessToken?: string;
  /** Data fetch range configuration */
  syncRange?: SyncRangeConfig;
}

/** Configuration for controlling the scope of data pulled from TAPD */
export interface SyncRangeConfig {
  /** Time range mode: 'all' | 'recent' | 'custom' */
  mode: 'all' | 'recent' | 'custom';
  /** Number of recent days to fetch (used when mode='recent') */
  recentDays?: number;
  /** Custom start date ISO string (used when mode='custom') */
  startDate?: string;
  /** Custom end date ISO string (used when mode='custom') */
  endDate?: string;
  /** Filter by TAPD status (empty = all statuses) */
  statusFilter?: string[];
  /** Max number of stories to fetch (default 200) */
  limit?: number;
  /** Category/module keywords filter — only sync stories whose title contains any of these keywords */
  categoryKeywords?: string[];
  /** Module mappings for automatic project categorization */
  moduleMappings?: ModuleMapping[];
  /** Filter by TAPD owner (处理人), semicolon-separated names. Only sync stories assigned to these owners. */
  ownerFilter?: string[];
  /** Filter by TAPD custom_field_one (模块特性), e.g. ["轻舟编辑器/主体", "运营"]. Only sync stories matching these module features. */
  moduleFeatureFilter?: string[];
  /** Whether to use server-side owner filter (via API param) or client-side filter */
  ownerFilterMode?: 'server' | 'client';
  /** Pipeline smart filter: only pull tasks related to interaction/UI/Layout pipeline stages */
  pipelineFilter?: boolean;
  /** Custom pipeline stage IDs to filter (default: interaction, ui_design, layout) */
  pipelineStages?: string[];
}

// --- TAPD API Response Types ---

export interface TapdWorkspaceInfo {
  Workspace: {
    id: string;
    name: string;
    pretty_name?: string;
    status?: string;
    description?: string;
    creator?: string;
  };
}

export interface TapdStory {
  Story: {
    id: string;
    name: string;
    description: string;
    status: string;
    priority: string;
    owner: string;
    begin: string;
    due: string;
    iteration_id?: string;
    effort?: string;
    progress?: string;
    /** Parent story ID (for parent-child relationship) */
    parent_id?: string;
    /** Children story IDs (comma-separated) */
    children_id?: string;
    /** Category/module ID in TAPD */
    category_id?: string;
    /** Custom field: module feature (模块特性), e.g. "轻舟编辑器/主体" */
    custom_field_one?: string;
    /** Custom field two (备用自定义字段) */
    custom_field_two?: string;
    /** Custom field three (备用自定义字段) */
    custom_field_three?: string;
  };
}

export interface TapdIteration {
  Iteration: {
    id: string;
    name: string;
    status: string;
    startdate: string;
    enddate: string;
    workspace_id: string;
  };
}

// --- Sync Results ---

/** Detail of a single task operation during sync */
export interface SyncDetailItem {
  /** Task title */
  title: string;
  /** TAPD story ID */
  tapdId: string;
  /** Operation type */
  action: 'inserted' | 'updated' | 'merged' | 'skipped';
  /** Owner name from TAPD */
  owner?: string;
  /** External URL (TAPD link) */
  externalUrl?: string;
}

export interface SyncResult {
  inserted: number;
  updated: number;
  merged: number;
  total: number;
  /** Detailed list of each task operation */
  details?: SyncDetailItem[];
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
  errors: string[];
}

// --- Duplicate Detection ---

/** A candidate for duplicate detection during sync */
export interface DuplicateCandidate {
  /** The TAPD story data */
  tapdId: string;
  tapdTitle: string;
  tapdOwner: string;
  tapdStartDate?: string;
  tapdEndDate?: string;
  /** The matching local task */
  localTaskId: number;
  localTitle: string;
  localOwner?: string;
  /** Similarity score (0-100) */
  similarity: number;
  /** Match reason */
  matchReason: 'title_exact' | 'title_fuzzy' | 'owner_date';
}

// --- Refresh (Status Update Only) ---

/** Detail of a single task change during refresh */
export interface RefreshDetailItem {
  /** Task title */
  title: string;
  /** TAPD story ID */
  tapdId: string;
  /** External URL (TAPD link) */
  externalUrl?: string;
  /** Changes detected */
  changes: {
    field: 'status' | 'startDate' | 'endDate' | 'priority' | 'progress' | 'assignee' | 'bind' | 'title';
    oldValue: string;
    newValue: string;
  }[];
}

/** Result of a refresh operation (update existing tasks only, no new inserts) */
export interface RefreshResult {
  /** Total tasks checked (with tapdId) */
  totalChecked: number;
  /** Tasks that had changes */
  updatedCount: number;
  /** Tasks with no changes */
  unchangedCount: number;
  /** Tasks that failed to fetch from TAPD (may have been deleted) */
  failedCount: number;
  /** Manual tasks newly bound to TAPD via title matching */
  newlyBoundCount?: number;
  /** Detailed change list */
  details: RefreshDetailItem[];
}
