import { db } from '../db/db';
import type { Task, Resource, TapdConfig, TapdWorkspaceInfo, TapdStory, TapdIteration, SyncResult, SyncDetailItem, ImportResult, DuplicateCandidate, RefreshResult, RefreshDetailItem } from '../types';
import type { TapdAuthMode, ModuleMapping, SyncRangeConfig } from '../types/tapd';
import { getTapdPriorityValue, mapTapdPriority } from '../utils/tapdPriority';
import {
  findTapdModuleCategoryFields,
  formatTapdCalendarDate,
  getTapdModuleCategoryValue,
  parseTapdDate,
  parseTapdEffortHours,
} from '../utils/tapdFields';
import { applyTapdCompletionStatus, mapTapdStatus } from '../utils/tapdStatus';
import {
  extractCpSupplierNames,
  hasFollowupAssignment,
  inferCpSupplierRole,
  matchCpResourcesFromTitle,
  normalizeSupplierName,
} from '../utils/cpSupplier';
import { classifyTapdMember, resolveMemberTypeAfterTapdSync } from '../utils/memberClassification';
import { isEpicWorkitemTypeName } from '../utils/taskHierarchy';

// Re-export for consumers
export type { SyncResult, ImportResult, DuplicateCandidate, RefreshResult, RefreshDetailItem };

// ─── MCP Proxy Configuration ─────────────────────────────────────
const MCP_BASE_URL = import.meta.env.VITE_MCP_BASE_URL || 'http://localhost:3100';
const REQUEST_TIMEOUT_MS = 10_000;
const MCP_GATEWAY_TIMEOUT_MS = 20_000;

// ─── TAPD REST API Configuration ─────────────────────────────────
const TAPD_API_BASE = '/tapd-api'; // Uses Vite proxy
const STORY_FIELDS = 'id,name,owner,status,created,modified,completed,module,custom_field_one,custom_field_two,category_id,workitem_type_id,parent_id,children_id,release_id,iteration_id,priority,priority_label,description,progress,effort,effort_completed,remain,exceed,begin,due,step';
const RELATED_CHECKPOINT_PATTERN = /开发|程序|客户端|前端|工程|接入|音频|声音|配音|音乐|音效|development|developer|client|audio|sound|music|voice/i;
const UI_STORY_TYPE_PATTERN = /ui\s*story|uistory|ui需求/i;

// ─── MCP Gateway Configuration (streamable-http) ─────────────────
const MCP_GATEWAY_PROXY = '/mcp-gateway/'; // Uses Vite proxy → https://mcpgw.knot.woa.com/tapd/

// ─── MCP Proxy Fetch Helper ──────────────────────────────────────

async function mcpFetch<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${MCP_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        response.status === 404
          ? 'MCP 代理服务未找到该接口，请检查代理是否已启动'
          : `请求失败 (${response.status}): ${errorText || '未知错误'}`
      );
    }

    return await response.json() as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查 MCP 代理服务是否正常运行');
    }
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('无法连接到 MCP 代理服务，请确认服务已启动（默认端口 3100）');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── MCP Gateway Fetch Helper (streamable-http protocol) ─────────

let mcpGatewayRequestId = 0;
// Cache the MCP session ID to avoid re-initializing on every call
let mcpSessionId: string | null = null;
let mcpSessionToken: string | null = null; // Track which token the session belongs to

/**
 * Initialize MCP session with the gateway (required before tools/call).
 * Returns the session ID from the Mcp-Session-Id response header.
 */
async function mcpGatewayInitialize(accessToken: string, gatewayUrl?: string): Promise<string | null> {
  const url = gatewayUrl || MCP_GATEWAY_PROXY;
  const requestId = ++mcpGatewayRequestId;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Tapd-Access-Token': accessToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'LocalProjectManager', version: '1.0.0' },
      },
    }),
  });

  if (response.headers.get('x-tapd-gateway-error') === 'woa-access-denied') {
    throw new Error('WOA Passport 未授权访问 TAPD MCP 网关，请先申请 mcpgw.knot.woa.com 访问权限，或切换 REST API');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new Error('MCP 网关认证失败：请检查个人访问令牌是否正确或已过期');
    }
    console.warn('[MCP] Initialize failed:', response.status, errorText);
    return null;
  }

  // Extract session ID from response header
  const sessionId = response.headers.get('mcp-session-id');
  console.log('[MCP] Initialize response, session:', sessionId);

  // Parse response body (may be SSE or JSON)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    // Consume the SSE response
    await response.text();
  } else {
    await response.json().catch(() => null);
  }

  return sessionId;
}

/**
 * Call a tool on the TAPD MCP Gateway using the streamable-http protocol.
 * Uses JSON-RPC 2.0 format with tools/call method.
 * Automatically handles session initialization.
 */
async function mcpGatewayFetch<T>(
  toolName: string,
  args: Record<string, unknown>,
  accessToken: string,
  gatewayUrl?: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_GATEWAY_TIMEOUT_MS);

  // Use Vite proxy by default, or custom gateway URL if provided
  const url = gatewayUrl || MCP_GATEWAY_PROXY;

  // Initialize session if needed (or if token changed)
  if (!mcpSessionId || mcpSessionToken !== accessToken) {
    try {
      mcpSessionId = await mcpGatewayInitialize(accessToken, gatewayUrl);
      mcpSessionToken = accessToken;
    } catch (initErr) {
      console.warn('[MCP] Session init failed, proceeding without session:', initErr);
      mcpSessionId = null;
      mcpSessionToken = accessToken;
    }
  }

  const requestId = ++mcpGatewayRequestId;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Tapd-Access-Token': accessToken,
    };
    // Attach session ID if available
    if (mcpSessionId) {
      headers['Mcp-Session-Id'] = mcpSessionId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
      signal: controller.signal,
    });

    if (response.headers.get('x-tapd-gateway-error') === 'woa-access-denied') {
      throw new Error('WOA Passport 未授权访问 TAPD MCP 网关，请先申请 mcpgw.knot.woa.com 访问权限，或切换 REST API');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        // Invalidate session on auth failure
        mcpSessionId = null;
        throw new Error('MCP 网关认证失败：请检查个人访问令牌是否正确或已过期');
      }
      // If session expired (404 or specific error), retry with new session
      if (response.status === 404 || response.status === 400) {
        console.warn('[MCP] Session may have expired, re-initializing...');
        mcpSessionId = null;
        // Retry once with fresh session
        mcpSessionId = await mcpGatewayInitialize(accessToken, gatewayUrl);
        mcpSessionToken = accessToken;
        if (mcpSessionId) {
          headers['Mcp-Session-Id'] = mcpSessionId;
        }
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: ++mcpGatewayRequestId,
            method: 'tools/call',
            params: { name: toolName, arguments: args },
          }),
          signal: controller.signal,
        });
        if (!retryResponse.ok) {
          const retryError = await retryResponse.text().catch(() => '');
          throw new Error(`MCP 网关请求失败 (${retryResponse.status}): ${retryError || '未知错误'}`);
        }
        return await parseMcpResponse<T>(retryResponse);
      }
      throw new Error(`MCP 网关请求失败 (${response.status}): ${errorText || '未知错误'}`);
    }

    // Update session ID if server sends a new one
    const newSessionId = response.headers.get('mcp-session-id');
    if (newSessionId) {
      mcpSessionId = newSessionId;
    }

    return await parseMcpResponse<T>(response);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('MCP 网关请求超时（20s），请检查网络连接');
    }
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      throw new Error('无法连接到 MCP 网关，请检查网络连接');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse MCP gateway response (handles both SSE and JSON formats).
 */
async function parseMcpResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';

  // Handle SSE (text/event-stream) response
  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    // Parse SSE events - find the last "data:" line with JSON-RPC result
    const lines = text.split('\n');
    let lastData = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        lastData = line.slice(6);
      }
    }
    if (lastData) {
      const parsed = JSON.parse(lastData);
      if (parsed.error) {
        throw new Error(`MCP 网关工具调用失败: ${parsed.error.message || JSON.stringify(parsed.error)}`);
      }
      // Extract result content from JSON-RPC response
      return mcpGatewayExtractResult<T>(parsed);
    }
    throw new Error('MCP 网关返回了空的 SSE 响应');
  }

  // Handle regular JSON response
  const jsonResponse = await response.json();
  if (jsonResponse.error) {
    throw new Error(`MCP 网关工具调用失败: ${jsonResponse.error.message || JSON.stringify(jsonResponse.error)}`);
  }
  return mcpGatewayExtractResult<T>(jsonResponse);
}

/** Extract the actual result data from a JSON-RPC response */
function mcpGatewayExtractResult<T>(jsonRpcResponse: any): T {
  const result = jsonRpcResponse?.result;
  if (!result) return jsonRpcResponse as T;

  // MCP tools/call returns { content: [{ type: 'text', text: '...' }] }
  if (result.content && Array.isArray(result.content)) {
    const textContent = result.content.find((c: any) => c.type === 'text');
    if (textContent?.text) {
      try {
        return JSON.parse(textContent.text) as T;
      } catch {
        // If not JSON, check if it's an AI-generated "no data found" response
        const text = textContent.text as string;
        const noDataPatterns = ['未找到', '没有找到', '无匹配', '未查询到', '不存在', 'no data', 'not found', 'no results', '0条', '0 条'];
        const isNoDataResponse = noDataPatterns.some(p => text.toLowerCase().includes(p.toLowerCase()));
        if (isNoDataResponse) {
          console.warn('[MCP] Gateway returned natural language "no data" response, treating as empty result:', text.slice(0, 200));
          // Return empty array - the caller expects array data for stories_get
          return [] as unknown as T;
        }
        // For other non-JSON text, return as-is
        return text as T;
      }
    }
  }
  return result as T;
}

// ─── TAPD REST API Fetch Helper ──────────────────────────────────

async function tapdRestFetch<T>(
  endpoint: string,
  config: TapdConfig,
  params: Record<string, string> = {},
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(`${window.location.origin}${TAPD_API_BASE}${endpoint}`);
    if (method === 'GET') {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // TAPD API uses HTTP Basic Auth: curl -u 'api_user:api_password'
    // Personal token is used as api_password, paired with api_user (TAPD login email/account)
    // Priority: apiUser + apiToken > apiUser + apiPassword
    const user = config.apiUser || '';
    const password = config.apiToken || config.apiPassword || '';
    if (user && password) {
      const encodedCredentials = btoa(unescape(encodeURIComponent(`${user}:${password}`)));
      headers['Authorization'] = `Basic ${encodedCredentials}`;
    } else if (password && !user) {
      // If only token/password is provided without user, try token:token as fallback
      const encodedCredentials = btoa(`${password}:${password}`);
      headers['Authorization'] = `Basic ${encodedCredentials}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (method === 'POST') {
      // TAPD API usually expects form-urlencoded for POST, but we'll try JSON first or adapt based on requirements.
      // For standard TAPD REST API, it often requires form data. Let's use URLSearchParams for body if it's a POST.
      if (body) {
        const formBody = new URLSearchParams();
        Object.entries(body).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formBody.append(key, String(value));
          }
        });
        // Also append workspace_id and current_user to body if needed by TAPD
        Object.entries(params).forEach(([key, value]) => {
           formBody.append(key, value);
        });
        fetchOptions.body = formBody.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      if (response.status === 401) {
        const errorBody = await response.text().catch(() => '');
        console.error('[TAPD Auth] 401 response body:', errorBody);
        throw new Error('认证失败(401)：请确认 API 账号和口令是否正确。在 tapd.woa.com → 公司管理 → 安全与集成 → 开放平台 中获取。');
      }
      const errorText = await response.text().catch(() => '');
      console.error(`[TAPD] ${response.status} response:`, errorText);
      throw new Error(`请求失败 (${response.status}): ${errorText || '未知错误'}`);
    }

    return await response.json() as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── TAPD Service ────────────────────────────────────────────────

export class TapdService {
  private config: TapdConfig | null = null;
  private customPriorityFieldsByWorkspace = new Map<string, string[]>();
  private activeCustomPriorityFields = new Set<string>();
  private moduleCategoryFieldsByWorkspace = new Map<string, string[]>();
  private activeModuleCategoryFields = new Set<string>();
  private categoryNamesByWorkspace = new Map<string, Map<string, string>>();
  private activeCategoryNames = new Map<string, string>();
  private statusLabelsByWorkspace = new Map<string, Map<string, string>>();
  private activeStatusLabels = new Map<string, string>();
  private stepLabelsByWorkspace = new Map<string, Map<string, string>>();
  private activeStepLabels = new Map<string, string>();
  private workitemTypeNamesByWorkspace = new Map<string, Map<string, string>>();
  private activeWorkitemTypeNames = new Map<string, string>();
  private refreshRequestsByProject = new Map<number, Promise<RefreshResult>>();

  private getStoryFields(): string {
    return [...new Set([
      ...STORY_FIELDS.split(','),
      ...this.activeCustomPriorityFields,
      ...this.activeModuleCategoryFields,
    ])].join(',');
  }

  private async discoverModuleCategoryFields(config: TapdConfig, workspaceId: string): Promise<string[]> {
    const cached = this.moduleCategoryFieldsByWorkspace.get(workspaceId);
    if (cached) {
      cached.forEach(fieldName => this.activeModuleCategoryFields.add(fieldName));
      return cached;
    }
    try {
      const response = await tapdRestFetch<{ status: number; data: Record<string, unknown>; info: string }>(
        '/stories/get_fields_lable',
        config,
        { workspace_id: workspaceId }
      );
      const labels = response?.data && typeof response.data === 'object' ? response.data : {};
      const fields = findTapdModuleCategoryFields(labels);
      this.moduleCategoryFieldsByWorkspace.set(workspaceId, fields);
      fields.forEach(fieldName => this.activeModuleCategoryFields.add(fieldName));
      if (fields.length > 0) {
        console.log('[TapdService] Module category field detected:', workspaceId, fields);
      }
      return fields;
    } catch (error) {
      console.warn('[TapdService] Failed to discover 模块分类 field:', error);
      this.moduleCategoryFieldsByWorkspace.set(workspaceId, []);
      return [];
    }
  }

  private async discoverStoryCategories(config: TapdConfig, workspaceId: string): Promise<Map<string, string>> {
    const cached = this.categoryNamesByWorkspace.get(workspaceId);
    if (cached) {
      cached.forEach((name, id) => this.activeCategoryNames.set(id, name));
      return cached;
    }
    const names = new Map<string, string>();
    try {
      for (let page = 1; page <= 50; page++) {
        const response = await tapdRestFetch<{ status: number; data: any[]; info: string }>(
          '/story_categories',
          config,
          { workspace_id: workspaceId, limit: '200', page: String(page), fields: 'id,name,parent_id' }
        );
        if (response?.status !== 1) throw new Error(response?.info || 'TAPD 需求分类接口返回失败');
        const batch = Array.isArray(response.data) ? response.data : [];
        batch.map(item => item?.Category || item)
          .filter(item => item?.id != null && item?.name)
          .forEach(item => names.set(String(item.id), String(item.name).trim()));
        if (batch.length < 200) break;
      }
    } catch (error) {
      console.warn('[TapdService] Failed to discover TAPD story categories:', error);
    }
    this.categoryNamesByWorkspace.set(workspaceId, names);
    names.forEach((name, id) => this.activeCategoryNames.set(id, name));
    return names;
  }

  private async discoverCustomPriorityFields(config: TapdConfig, workspaceId: string): Promise<string[]> {
    const cached = this.customPriorityFieldsByWorkspace.get(workspaceId);
    if (cached) return cached;
    try {
      const response = await tapdRestFetch<{ status: number; data: Record<string, unknown>; info: string }>(
        '/stories/get_fields_lable',
        config,
        { workspace_id: workspaceId }
      );
      const labels = response?.data && typeof response.data === 'object' ? response.data : {};
      const fields = Object.entries(labels)
        .filter(([fieldName, label]) =>
          /^(custom_field_|custom_plan_field_)/.test(fieldName) &&
          /优先级|priority/i.test(String(label ?? '').trim())
        )
        .sort(([, left], [, right]) => {
          const leftExact = String(left).trim() === '需求优先级' ? 0 : 1;
          const rightExact = String(right).trim() === '需求优先级' ? 0 : 1;
          return leftExact - rightExact;
        })
        .map(([fieldName]) => fieldName);
      this.customPriorityFieldsByWorkspace.set(workspaceId, fields);
      fields.forEach(fieldName => this.activeCustomPriorityFields.add(fieldName));
      if (fields.length > 0) {
        console.log('[TapdService] Custom priority field detected:', workspaceId, fields);
      }
      return fields;
    } catch (error) {
      console.warn('[TapdService] Failed to discover custom priority field, using priority_label:', error);
      this.customPriorityFieldsByWorkspace.set(workspaceId, []);
      return [];
    }
  }

  private resolveStoryPriority(story: Record<string, unknown>): string {
    const value = getTapdPriorityValue(story, [...this.activeCustomPriorityFields]);
    story._tapdResolvedPriority = value;
    return value;
  }

  private parseTapdFieldOptionLabels(rawField: any): Map<string, string> {
    const labels = new Map<string, string>();
    const field = rawField?.Field || rawField || {};
    const options = field.options || field.option || field.values || {};
    if (Array.isArray(options)) {
      options.forEach((option: any) => {
        const value = String(option?.value ?? option?.id ?? option?.key ?? '').trim();
        const label = String(option?.label ?? option?.name ?? option?.text ?? value).trim();
        if (value && label) { labels.set(value, label); labels.set(label, label); }
      });
    } else if (options && typeof options === 'object') {
      Object.entries(options).forEach(([value, rawLabel]) => {
        const label = typeof rawLabel === 'object'
          ? String((rawLabel as any)?.label ?? (rawLabel as any)?.name ?? (rawLabel as any)?.text ?? value).trim()
          : String(rawLabel ?? '').trim();
        if (!value || !label) return;
        const key = value.trim();
        const keyIsLabel = /[㐀-鿿]/.test(key) && !/[㐀-鿿]/.test(label);
        const optionValue = keyIsLabel ? label : key;
        const optionLabel = keyIsLabel ? key : label;
        labels.set(optionValue, optionLabel);
        labels.set(optionLabel, optionLabel);
      });
    }
    return labels;
  }

  private async discoverStatusLabels(config: TapdConfig, workspaceId: string): Promise<Map<string, string>> {
    const cached = this.statusLabelsByWorkspace.get(workspaceId);
    if (cached) {
      cached.forEach((label, value) => this.activeStatusLabels.set(value, label));
      this.stepLabelsByWorkspace.get(workspaceId)?.forEach((label, value) => this.activeStepLabels.set(value, label));
      return cached;
    }
    let labels = new Map<string, string>();
    let stepLabels = new Map<string, string>();
    try {
      const response = await tapdRestFetch<{ status: number; data: Record<string, any>; info: string }>(
        '/stories/get_fields_info', config, { workspace_id: workspaceId }
      );
      labels = this.parseTapdFieldOptionLabels(response?.data?.status);
      stepLabels = this.parseTapdFieldOptionLabels(response?.data?.step);
    } catch (error) {
      console.warn('[TapdService] Failed to discover TAPD status/step labels:', error);
    }
    this.statusLabelsByWorkspace.set(workspaceId, labels);
    this.stepLabelsByWorkspace.set(workspaceId, stepLabels);
    labels.forEach((label, value) => this.activeStatusLabels.set(value, label));
    stepLabels.forEach((label, value) => this.activeStepLabels.set(value, label));
    return labels;
  }

  private async discoverWorkitemTypes(config: TapdConfig, workspaceId: string): Promise<Map<string, string>> {
    const cached = this.workitemTypeNamesByWorkspace.get(workspaceId);
    if (cached) {
      cached.forEach((name, id) => this.activeWorkitemTypeNames.set(id, name));
      return cached;
    }
    const names = new Map<string, string>();
    try {
      const response = await tapdRestFetch<{ status: number; data: any[]; info: string }>(
        '/workitem_types', config, { workspace_id: workspaceId, limit: '200', fields: 'id,name,entity_type,status' }
      );
      (Array.isArray(response?.data) ? response.data : []).map(item => item?.WorkitemType || item)
        .filter(item => item?.id && item?.name && String(item.status || '3') !== '2')
        .forEach(item => names.set(String(item.id), String(item.name)));
    } catch (error) {
      console.warn('[TapdService] Failed to discover TAPD requirement types:', error);
    }
    this.workitemTypeNamesByWorkspace.set(workspaceId, names);
    names.forEach((name, id) => this.activeWorkitemTypeNames.set(id, name));
    return names;
  }

  private resolveStoryStatus(rawStatus: unknown): string {
    const value = String(rawStatus ?? '').trim();
    return this.activeStatusLabels.get(value) || value;
  }

  private resolveStoryStep(rawStep: unknown): string {
    const value = String(rawStep ?? '').trim();
    return this.activeStepLabels.get(value) || value;
  }

  /** Load TAPD config for a given project (fallback: first available config) */
  async loadConfig(projectId: number): Promise<TapdConfig | null> {
    // Try by projectId first
    this.config = (await db.tapdConfigs.where('projectId').equals(projectId).first()) || null;
    // Fallback: try first available config (for cases where projectId doesn't match)
    if (!this.config) {
      this.config = (await db.tapdConfigs.toCollection().first()) || null;
    }
    if (this.config) {
      console.log('[TapdService] Config loaded:', {
        workspaceId: this.config.workspaceId,
        hasApiUser: !!this.config.apiUser,
        hasApiToken: !!this.config.apiToken,
        hasApiPassword: !!this.config.apiPassword,
        projectId: this.config.projectId,
      });
    } else {
      console.warn('[TapdService] No config found for projectId:', projectId);
    }
    return this.config;
  }

  /** Load TAPD config by workspaceId */
  async loadConfigByWorkspace(workspaceId: string): Promise<TapdConfig | null> {
    this.config = (await db.tapdConfigs.where('workspaceId').equals(workspaceId).first()) || null;
    return this.config;
  }

  /** Read active TAPD requirement types for the current workspace. */
  async getWorkitemTypes(projectId: number): Promise<{ id: string; name: string }[]> {
    const config = await this.loadConfig(projectId);
    if (!config || config.authMode !== 'rest' || !this.hasRestCredentials()) return [];
    const response = await tapdRestFetch<{ status: number; data: any[]; info: string }>(
      '/workitem_types',
      config,
      { workspace_id: config.workspaceId.trim(), limit: '200', fields: 'id,name,entity_type,status' }
    );
    if (response?.status !== 1) throw new Error(response?.info || '无法读取 TAPD 需求类别');
    return (Array.isArray(response.data) ? response.data : [])
      .map(item => item?.WorkitemType || item)
      .filter(item => item?.id && item?.name && String(item.status || '3') !== '2')
      .map(item => ({ id: String(item.id), name: String(item.name) }));
  }

  /** Read TAPD release plans for the current workspace. */
  async getReleasePlans(projectId: number): Promise<{ id: string; name: string; status?: string; startdate?: string; enddate?: string }[]> {
    const config = await this.loadConfig(projectId);
    if (!config || config.authMode !== 'rest' || !this.hasRestCredentials()) return [];
    const response = await tapdRestFetch<{ status: number; data: any[]; info: string }>(
      '/releases', config,
      { workspace_id: config.workspaceId.trim(), limit: '200', fields: 'id,name,status,startdate,enddate', order: 'startdate desc' }
    );
    if (response?.status !== 1) throw new Error(response?.info || '无法读取 TAPD 发布计划');
    return (Array.isArray(response.data) ? response.data : []).map(item => item?.Release || item)
      .filter(item => item?.id && item?.name).map(item => ({
        id: String(item.id), name: String(item.name),
        status: item.status ? String(item.status) : undefined,
        startdate: item.startdate ? String(item.startdate) : undefined,
        enddate: item.enddate ? String(item.enddate) : undefined,
      }));
  }

  /** Enforce work-item type and release filters even if TAPD ignores combined server parameters. */
  private filterStoriesBySyncScope(stories: any[], syncRange?: SyncRangeConfig): any[] {
    const typeIds = new Set((syncRange?.workitemTypeFilter || []).map(String));
    const releaseIds = new Set((syncRange?.releaseFilter || []).map(String));
    if (typeIds.size === 0 && releaseIds.size === 0) return stories;
    return stories.filter(item => {
      const story = item?.Story || item;
      if (story?._tapdStructuralAncestor || story?._tapdRelatedCheckpoint) return true;
      const typeMatches = typeIds.size === 0 || typeIds.has(String(story?.workitem_type_id || ''));
      const releaseMatches = releaseIds.size === 0 || releaseIds.has(String(story?.release_id || ''));
      return typeMatches && releaseMatches;
    });
  }

  /** Keep structural EPIC ancestors out of local demand views even after ancestor completion. */
  private filterEpicStories(stories: any[]): any[] {
    return stories.filter(item => {
      const story = item?.Story || item;
      const typeId = String(story?.workitem_type_id || '');
      const typeName = this.activeWorkitemTypeNames.get(typeId)
        || String(story?.workitem_type_name || story?.workitem_type || '');
      return !isEpicWorkitemTypeName(typeName);
    });
  }

  /** Fill missing parent_id values from TAPD children_id so both hierarchy response shapes are supported. */
  private normalizeStoryHierarchy(stories: any[]): any[] {
    const storyById = new Map<string, any>();
    stories.forEach(item => {
      const story = item?.Story || item;
      if (story?.id != null) storyById.set(String(story.id), story);
    });
    stories.forEach(item => {
      const parent = item?.Story || item;
      if (!parent?.id || !parent?.children_id) return;
      const childIds = Array.isArray(parent.children_id)
        ? parent.children_id.map(String)
        : String(parent.children_id).split(/[,，;；|]/).map((id: string) => id.trim()).filter(Boolean);
      childIds.forEach((childId: string) => {
        const child = storyById.get(childId);
        if (child && (!child.parent_id || String(child.parent_id) === '0')) {
          child.parent_id = String(parent.id);
        }
      });
    });
    return stories;
  }

  /** Apply user-facing filter dimensions. Values inside a dimension use OR; active dimensions default to AND. */
  private filterStoriesByAdvancedFilters(stories: any[], syncRange?: SyncRangeConfig): any[] {
    const keywords = (syncRange?.categoryKeywords || []).map(value => value.toLowerCase().trim()).filter(Boolean);
    const modules = (syncRange?.moduleFeatureFilter || []).map(value => value.toLowerCase().trim()).filter(Boolean);
    const owners = (syncRange?.ownerFilter || []).map(value => value.toLowerCase().trim()).filter(Boolean);
    if (keywords.length === 0 && modules.length === 0 && owners.length === 0) return stories;
    return stories.filter(item => {
      const story = item?.Story || item;
      const title = String(story?.name || '').toLowerCase();
      const moduleText = [story?.custom_field_one, story?.custom_field_two, story?.category_id, story?.category].filter(Boolean).join(' ').toLowerCase();
      const ownerNames = String(story?.owner || '').toLowerCase().split(/[;；]/).map(value => value.trim()).filter(Boolean);
      const matches: boolean[] = [];
      if (keywords.length > 0) matches.push(keywords.some(keyword => title.includes(keyword)));
      if (modules.length > 0) matches.push(modules.some(module => moduleText.includes(module) || title.includes('【' + module + '】') || title.includes('[' + module + ']')));
      if (owners.length > 0) matches.push(owners.some(owner => ownerNames.some(name => name.includes(owner) || owner.includes(name))));
      return syncRange?.filterLogic === 'or' ? matches.some(Boolean) : matches.every(Boolean);
    });
  }

  /** TAPD REST returns at most 200 stories per page. Fetch up to the configured total and deduplicate by story ID. */
  private async fetchRestStoriesPaginated(config: TapdConfig, params: Record<string, string>, totalLimit: number): Promise<any[]> {
    const target = Math.max(1, Math.min(20000, totalLimit));
    const results: any[] = [];
    const seenIds = new Set<string>();
    for (let page = 1; results.length < target; page++) {
      const pageSize = 200;
      const response = await tapdRestFetch<{ status: number; data: any; info: string }>('/stories', config, { order: 'id asc', ...params, limit: String(pageSize), page: String(page) });
      if (response?.status !== 1) throw new Error(response?.info || 'TAPD API 返回错误状态: ' + response?.status);
      const batch = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
      const beforeCount = results.length;
      for (const item of batch) {
        const story = item?.Story || item;
        const id = String(story?.id || '');
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);
        results.push(item);
        if (results.length >= target) break;
      }
      if (results.length === beforeCount || batch.length < pageSize) break;
    }
    return results;
  }

  /** Query one requirement type (or release) at a time because TAPD multi-value parameters are inconsistent across gateways. */
  private async fetchRestStoriesForSyncScope(
    config: TapdConfig,
    params: Record<string, string>,
    totalLimit: number,
    syncRange?: SyncRangeConfig
  ): Promise<any[]> {
    const typeIds = (syncRange?.workitemTypeFilter || []).map(String).filter(Boolean);
    const releaseIds = (syncRange?.releaseFilter || []).map(String).filter(Boolean);
    const scopes: Record<string, string>[] = typeIds.length > 0
      ? typeIds.map(workitemTypeId => ({ workitem_type_id: workitemTypeId }))
      : releaseIds.length > 0
        ? releaseIds.map(releaseId => ({ release_id: releaseId }))
        : [{}];
    const results: any[] = [];
    const seenIds = new Set<string>();
    const requiresClientScan = Boolean(
      syncRange?.categoryKeywords?.length ||
      syncRange?.moduleFeatureFilter?.length ||
      syncRange?.ownerFilter?.length ||
      syncRange?.pipelineFilter
    );
    const scanLimit = requiresClientScan ? 20000 : totalLimit;
    for (const scope of scopes) {
      const batch = await this.fetchRestStoriesPaginated(config, { ...params, ...scope }, scanLimit);
      for (const item of batch) {
        const story = item?.Story || item;
        const id = String(story?.id || '');
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);
        results.push(item);
      }
    }
    return this.filterStoriesBySyncScope(results, syncRange);
  }

  private storyChildIds(story: any): string[] {
    if (!story?.children_id) return [];
    return (Array.isArray(story.children_id) ? story.children_id : String(story.children_id).split(/[,，;；|]/))
      .map((id: unknown) => String(id).trim()).filter((id: string) => id && id !== '0');
  }

  private isUiStory(story: any): boolean {
    const typeName = this.activeWorkitemTypeNames.get(String(story?.workitem_type_id || ''))
      || String(story?.workitem_type_name || story?.workitem_type || '');
    return UI_STORY_TYPE_PATTERN.test(typeName);
  }

  private isRelatedCheckpointStory(story: any): boolean {
    const typeName = this.activeWorkitemTypeNames.get(String(story?.workitem_type_id || ''))
      || String(story?.workitem_type_name || story?.workitem_type || '');
    return RELATED_CHECKPOINT_PATTERN.test(`${typeName} ${story?.name || ''}`);
  }

  /** Fetch cross-category program/audio children for selected UIStory roots without widening the main sync scope. */
  private async fetchRelatedCheckpointChildren(
    workspaceId: string,
    initialStories: any[],
    config?: TapdConfig,
    mcpAccessToken?: string
  ): Promise<any[]> {
    const stories = [...initialStories];
    const knownIds = new Set(stories.map(item => String((item?.Story || item)?.id || '')).filter(Boolean));
    let frontier = stories.filter(item => this.isUiStory(item?.Story || item));
    const fields = this.getStoryFields();

    for (let depth = 0; depth < 6 && frontier.length > 0; depth++) {
      const childIds = [...new Set(frontier.flatMap(item => this.storyChildIds(item?.Story || item)).filter(id => !knownIds.has(id)))];
      if (childIds.length === 0) break;
      const fetched: any[] = [];
      for (let offset = 0; offset < childIds.length; offset += 200) {
        const ids = childIds.slice(offset, offset + 200).join(',');
        let batch: any[] = [];
        if (mcpAccessToken) {
          const data = await mcpGatewayFetch<any>('stories_get', { workspace_id: workspaceId, id: ids, limit: 200, fields }, mcpAccessToken);
          batch = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
        } else if (config && (config.apiToken || (config.apiUser && config.apiPassword))) {
          const data = await tapdRestFetch<{ status: number; data: any; info: string }>('/stories', config, { workspace_id: workspaceId, id: ids, limit: '200', fields });
          if (data?.status === 1 && data?.data) batch = Array.isArray(data.data) ? data.data : [data.data];
        } else {
          const data = await mcpFetch<{ data: any[] }>('/tapd/stories_get', { workspace_id: workspaceId, id: ids, limit: 200, fields });
          batch = Array.isArray(data?.data) ? data.data : [];
        }
        fetched.push(...batch);
      }

      frontier = [];
      fetched.forEach(item => {
        const story = item?.Story || item;
        const id = String(story?.id || '');
        if (!id || knownIds.has(id)) return;
        knownIds.add(id);
        frontier.push(item);
        if (this.isRelatedCheckpointStory(story)) {
          story._tapdRelatedCheckpoint = true;
          stories.push(item);
        }
      });
    }
    return stories;
  }

  /** Recursively fetch every missing ancestor so deep TAPD hierarchies remain intact. */
  private async fetchStoryAncestors(
    workspaceId: string,
    initialStories: any[],
    config?: TapdConfig,
    mcpAccessToken?: string
  ): Promise<any[]> {
    const stories = [...initialStories];
    const knownIds = new Set(stories.map(item => String((item?.Story || item)?.id || '')).filter(Boolean));
    const fields = this.getStoryFields();

    for (let depth = 0; depth < 20; depth++) {
      const missingIds = new Set<string>();
      for (const item of stories) {
        const parentId = String((item?.Story || item)?.parent_id || '');
        if (parentId && parentId !== '0' && !knownIds.has(parentId)) missingIds.add(parentId);
      }
      if (missingIds.size === 0) break;

      let fetched: any[] = [];
      const missingIdList = Array.from(missingIds);
      for (let offset = 0; offset < missingIdList.length; offset += 200) {
        const ids = missingIdList.slice(offset, offset + 200).join(',');
        let batch: any[] = [];
        if (mcpAccessToken) {
          const data = await mcpGatewayFetch<any>('stories_get', { workspace_id: workspaceId, id: ids, limit: 200, fields }, mcpAccessToken);
          batch = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
        } else if (config && (config.apiToken || (config.apiUser && config.apiPassword))) {
          const data = await tapdRestFetch<{ status: number; data: any; info: string }>('/stories', config, { workspace_id: workspaceId, id: ids, limit: '200', fields });
          if (data?.status === 1 && data?.data) batch = Array.isArray(data.data) ? data.data : [data.data];
        } else {
          const data = await mcpFetch<{ data: any[] }>('/tapd/stories_get', { workspace_id: workspaceId, id: ids, limit: '200', fields });
          batch = Array.isArray(data?.data) ? data.data : [];
        }
        fetched.push(...batch);
      }

      let added = 0;
      for (const item of fetched) {
        const story = item?.Story || item;
        const id = String(story?.id || '');
        if (!id || knownIds.has(id)) continue;
        story._tapdStructuralAncestor = true;
        knownIds.add(id);
        stories.unshift(item);
        added++;
      }
      if (added === 0) break;
    }
    return stories;
  }

  /** Import the UX team from TAPD member-management role groups. */
  async syncProjectMembers(projectId: number): Promise<{
    inserted: number;
    updated: number;
    total: number;
    groupCounts: Record<string, number>;
    groupMembers: Record<string, string[]>;
  }> {
    const config = this.config || (await this.loadConfig(projectId));
    if (!config) {
      throw new Error('未找到 TAPD 配置，请先保存配置');
    }
    if (config.authMode !== 'rest' || !this.hasRestCredentials()) {
      throw new Error('成员分组同步目前需要 REST API 账号和密钥');
    }

    const workspaceId = config.workspaceId.trim();
    const [rolesResponse, usersResponse] = await Promise.all([
      tapdRestFetch<{ status: number; data: Record<string, string>; info: string }>(
        '/roles',
        config,
        { workspace_id: workspaceId }
      ),
      tapdRestFetch<{ status: number; data: any[]; info: string }>(
        '/workspaces/users',
        config,
        {
          workspace_id: workspaceId,
          fields: 'user,user_id,role_id,name,email,real_join_time',
        }
      ),
    ]);

    if (rolesResponse?.status !== 1) {
      throw new Error(rolesResponse?.info || '无法读取 TAPD 成员分组');
    }
    if (usersResponse?.status !== 1 || !Array.isArray(usersResponse?.data)) {
      throw new Error(usersResponse?.info || '无法读取 TAPD 项目成员');
    }

    const targetGroupRoles: Record<string, string> = {
      'UX-交互': 'UX设计',
      'UX-视觉': 'UI设计',
      'UX-动效': '动效',
      'UX-还原': '还原',
    };
    const targetGroupOrder = Object.keys(targetGroupRoles);
    const roleNames: Record<string, string> = Object.fromEntries(
      Object.entries(rolesResponse.data || {}).map(([id, name]) => [String(id), String(name).trim()])
    );
    const existingResources = await db.resources.toArray();
    let nextSortOrder = existingResources.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0) + 1;
    let inserted = 0;
    let updated = 0;
    const groupCounts: Record<string, number> = Object.fromEntries(targetGroupOrder.map(group => [group, 0]));
    const groupMembers: Record<string, string[]> = Object.fromEntries(targetGroupOrder.map(group => [group, []]));
    const processedMemberKeys = new Set<string>();
    const accountGroupOverrides: Record<string, string> = workspaceId === '70182144'
      ? { klaudzhang: 'UX-交互', v_zypgzhang: 'UX-还原' }
      : {};

    for (const item of usersResponse.data) {
      const member = item?.UserWorkspace || item;
      if (!member || String(member.status ?? '1') === '0') continue;

      const roleIds = Array.isArray(member.role_id)
        ? member.role_id.map(String)
        : String(member.role_id || '').split(',').map((value: string) => value.trim()).filter(Boolean);
      const memberGroups: string[] = Array.from(new Set(
        roleIds
          .map((roleId: string) => roleNames[roleId]?.trim())
          .filter((name: string | undefined): name is string => Boolean(name))
      ));
      const rawName = String(member.name || member.user || '').trim();
      const normalizedName = rawName.replace(/\s+/g, '');
      const account = String(member.user || '').trim();
      const accountKey = account.toLowerCase();
      const explicitGroup = accountGroupOverrides[accountKey];
      const tapdGroup = explicitGroup || targetGroupOrder.find(group => memberGroups.includes(group));
      if (!tapdGroup) continue;

      const userId = String(member.user_id || '').trim();
      const memberKey = (account || userId || normalizedName).toLowerCase();
      if (!memberKey || processedMemberKeys.has(memberKey)) continue;
      processedMemberKeys.add(memberKey);

      const name = rawName || account || userId;
      const classification = classifyTapdMember(memberGroups, tapdGroup, targetGroupRoles[tapdGroup], name);
      const { role, workforceType, type: memberType, supplierAffiliation } = classification;
      const resourceGroup = classification.group;
      const joinDate = String(member.real_join_time || member.join_project_time || '').slice(0, 10) || undefined;
      const existing = existingResources.find(resource => {
        if (account) {
          return resource.tapdAccount?.trim().toLowerCase() === accountKey;
        }
        return !!name && !resource.tapdAccount && resource.name.trim() === name;
      });

      if (existing?.id) {
        const resolvedType = resolveMemberTypeAfterTapdSync(existing, memberType);
        const resolvedWorkforceType = resolvedType.typeLocked
          ? existing.workforceType || (resolvedType.type === 'base' ? '基地人员' : resolvedType.type === 'cp' ? '供应商' : undefined)
          : workforceType || existing.workforceType;
        const projectIds = Array.from(new Set([...(existing.projectIds || []), projectId]));
        await db.resources.update(existing.id, {
          name,
          role,
          group: resourceGroup,
          tapdAccount: account || existing.tapdAccount,
          projectIds,
          tapdGroups: memberGroups,
          workforceType: resolvedWorkforceType,
          supplierAffiliation: supplierAffiliation || existing.supplierAffiliation,
          type: resolvedType.type,
          typeLocked: resolvedType.typeLocked,
          status: existing.status === 'departed' ? 'active' : (existing.status || 'active'),
          joinDate: joinDate || existing.joinDate,
        });
        updated++;
      } else {
        const newResource = {
          name,
          role,
          group: resourceGroup,
          tapdAccount: account || undefined,
          projectIds: [projectId],
          tapdGroups: memberGroups,
          workforceType,
          supplierAffiliation,
          type: memberType,
          typeLocked: false,
          status: 'active' as const,
          joinDate,
          sortOrder: nextSortOrder++,
        };
        const newId = await db.resources.add(newResource);
        existingResources.push({ ...newResource, id: newId });
        inserted++;
      }
      groupCounts[tapdGroup]++;
      groupMembers[tapdGroup].push(account ? name + ' (' + account + ')' : name);
    }

    return {
      inserted,
      updated,
      total: inserted + updated,
      groupCounts,
      groupMembers,
    };
  }

  /**
   * Test connection by fetching workspace info via MCP proxy.
   * Returns workspace name on success.
   */
  async testConnection(
    workspaceId: string,
    apiUser?: string,
    apiPassword?: string,
    apiToken?: string,
    authMode?: TapdAuthMode,
    mcpAccessToken?: string,
    syncRange?: import('../types/tapd').SyncRangeConfig
  ): Promise<{ success: true; workspaceName: string; previewStories?: any[]; workitemTypes?: { id: string; name: string }[]; releasePlans?: { id: string; name: string; status?: string; startdate?: string; enddate?: string }[] } | { success: false; error: string }> {
    try {
      if (!workspaceId.trim()) {
        return { success: false, error: '请输入工作区 ID' };
      }

      // Support multiple workspace IDs separated by comma or semicolon
      const workspaceIds = workspaceId.split(/[,;，；]/).map(id => id.trim()).filter(Boolean);
      
      if (workspaceIds.length > 1) {
        // Multiple workspaces: test each and merge results
        console.log(`[TapdService] Testing connection for ${workspaceIds.length} workspaces:`, workspaceIds);
        const allPreviewStories: any[] = [];
        const results: string[] = [];
        let hasSuccess = false;

        for (const wsId of workspaceIds) {
          const result = await this.testConnection(wsId, apiUser, apiPassword, apiToken, authMode, mcpAccessToken, syncRange);
          if (result.success) {
            hasSuccess = true;
            results.push(result.workspaceName);
            if (result.previewStories) {
              allPreviewStories.push(...result.previewStories);
            }
          } else {
            results.push(`工作区 ${wsId}: ${result.error}`);
          }
        }

        if (hasSuccess) {
          const totalCount = allPreviewStories.length;
          const successCount = results.filter(r => !r.startsWith('工作区')).length;
          const failedResults = results.filter(r => r.startsWith('工作区'));
          let workspaceName = `已连接 ${successCount}/${workspaceIds.length} 个工作区 (共 ${totalCount} 条需求)`;
          if (failedResults.length > 0) {
            workspaceName += ` | 失败: ${failedResults.join(', ')}`;
          }
          return {
            success: true,
            workspaceName,
            previewStories: allPreviewStories.length > 0 ? allPreviewStories : undefined,
          };
        } else {
          return { success: false, error: results.join('; ') };
        }
      }

      // If MCP Gateway mode is selected, test via MCP Gateway
      if (authMode === 'mcp-gateway' && mcpAccessToken) {
        try {
          console.log('[TAPD] Testing MCP Gateway connection...');
          console.log('[TAPD] Workspace ID:', workspaceId.trim());
          console.log('[TAPD] Token length:', mcpAccessToken.length);
          
          // Build query params from syncRange config for preview
          const previewLimit = syncRange?.limit || 1000;
          const previewParams: Record<string, unknown> = { workspace_id: workspaceId.trim(), limit: previewLimit, fields: this.getStoryFields() };
          if (syncRange) {
            if (syncRange.mode === 'recent' && syncRange.recentDays) {
              const endDate = new Date();
              const startDate = new Date();
              startDate.setDate(startDate.getDate() - syncRange.recentDays);
              previewParams.modified = `${startDate.toISOString().slice(0, 10)}~${endDate.toISOString().slice(0, 10)}`;
            } else if (syncRange.mode === 'custom' && syncRange.startDate) {
              const start = syncRange.startDate;
              const end = syncRange.endDate || new Date().toISOString().slice(0, 10);
              previewParams.modified = `${start}~${end}`;
            }
            // Owner filter (server-side) — skip when keyword or module filter is active
            // when cross-dimension OR requires client-side union matching
            const hasClientFilters = (syncRange.categoryKeywords && syncRange.categoryKeywords.length > 0) || 
              (syncRange.moduleFeatureFilter && syncRange.moduleFeatureFilter.length > 0);
            if (syncRange.ownerFilter && syncRange.ownerFilter.length > 0 && syncRange.ownerFilterMode !== 'client' && !hasClientFilters) {
              previewParams.owner = syncRange.ownerFilter.join(';');
            }
            if (syncRange.workitemTypeFilter?.length) previewParams.workitem_type_id = syncRange.workitemTypeFilter.join('|');
            if (syncRange.releaseFilter?.length) previewParams.release_id = syncRange.releaseFilter.join('|');
          }
          // Helper: fetch stories from MCP gateway and parse response
          const fetchAndParseStories = async (): Promise<{ count: number; stories: any[] }> => {
            const data = await mcpGatewayFetch<any>(
              'stories_get',
              previewParams,
              mcpAccessToken
            );
            console.log('[TAPD] MCP Gateway test response:', JSON.stringify(data).slice(0, 500));
            
            // Handle various response formats from MCP gateway
            let count = 0;
            let stories: any[] = [];
            if (Array.isArray(data)) {
              count = data.length;
              stories = data;
            } else if (data?.data && Array.isArray(data.data)) {
              count = data.data.length;
              stories = data.data;
            } else if (typeof data?.count === 'number') {
              count = data.count;
              if (data?.data) stories = Array.isArray(data.data) ? data.data : [data.data];
            } else if (data?.data) {
              count = 1;
              stories = [data.data];
            } else if (typeof data === 'string') {
              try {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                  count = parsed.length;
                  stories = parsed;
                } else if (parsed?.data && Array.isArray(parsed.data)) {
                  count = parsed.data.length;
                  stories = parsed.data;
                } else if (typeof parsed?.count === 'number') {
                  count = parsed.count;
                  if (parsed?.data) stories = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
                }
              } catch {
                console.log('[TAPD] Response is plain text:', data.slice(0, 200));
              }
            }
            return { count, stories };
          };

          // First attempt
          let { count, stories: previewStories } = await fetchAndParseStories();
          console.log('[TAPD] Parsed count (attempt 1):', count);

          // If got 0 results, retry once with fresh session (MCP gateway may have returned AI text instead of data)
          if (count === 0) {
            console.warn('[TAPD] Got 0 results on first attempt, resetting session and retrying...');
            mcpSessionId = null; // Force session re-initialization
            mcpSessionToken = '';
            try {
              const retryResult = await fetchAndParseStories();
              console.log('[TAPD] Parsed count (attempt 2):', retryResult.count);
              if (retryResult.count > 0) {
                count = retryResult.count;
                previewStories = retryResult.stories;
              }
            } catch (retryErr) {
              console.warn('[TAPD] Retry also failed:', retryErr);
            }
          }

          previewStories = this.filterStoriesBySyncScope(previewStories, syncRange);

          // Apply category keyword filter + module feature filter (client-side)
          // Apply combined filter: keyword, module, and owner use the configured cross-dimension logic
          // Values within one dimension use OR; active dimensions default to AND
          const hasKeywordFilter = syncRange?.categoryKeywords && syncRange.categoryKeywords.length > 0;
          const hasModuleFilter = syncRange?.moduleFeatureFilter && syncRange.moduleFeatureFilter.length > 0;
          const hasOwnerFilter = syncRange?.ownerFilter && syncRange.ownerFilter.length > 0;

          if (hasKeywordFilter || hasModuleFilter || hasOwnerFilter) {
            const keywords = hasKeywordFilter 
              ? syncRange!.categoryKeywords!.map(k => k.toLowerCase().trim()).filter(Boolean) 
              : [];
            const moduleFilters = hasModuleFilter 
              ? syncRange!.moduleFeatureFilter!.map(m => m.toLowerCase().trim()).filter(Boolean) 
              : [];
            const ownerFilters = hasOwnerFilter
              ? syncRange!.ownerFilter!.map(o => o.toLowerCase().trim()).filter(Boolean)
              : [];

            const beforeCount = previewStories.length;

            // Debug: log sample story structure
            if (previewStories.length > 0 && hasModuleFilter) {
              const sampleItem = previewStories[0];
              const sampleStory = sampleItem?.Story || sampleItem;
              console.log(`[TAPD] Module filter debug - sample story keys:`, Object.keys(sampleStory));
              console.log(`[TAPD] Module filter debug - name: "${sampleStory?.name}", custom_field_one: "${sampleStory?.custom_field_one}"`);
            }

            previewStories = previewStories.filter((item: any) => {
              const story = item?.Story || item;
              const title = (story?.name || '').toLowerCase();
              const moduleFeature = (story?.custom_field_one || '').toLowerCase();
              // Also check custom_field_two/three as fallback for module info
              const customField2 = (story?.custom_field_two || '').toLowerCase();
              const category = (story?.category_id || story?.category || '').toLowerCase();

              // Keyword match: title contains any keyword (supports fuzzy matching)
              // Match logic: title.includes(kw) OR kw.includes(title) OR sub-tokens of kw found in title
              const keywordMatch = keywords.length > 0 && keywords.some(kw => {
                if (title.includes(kw)) return true;
                if (kw.length > 5 && title.length > 5 && kw.includes(title)) return true;
                // Split keyword into meaningful tokens (by brackets, dashes, spaces) and check if most are in title
                const tokens = kw.split(/[【】\[\]——\-\s]+/).filter(t => t.length >= 2);
                if (tokens.length >= 2) {
                  const matchedTokens = tokens.filter(t => title.includes(t));
                  // If >= 60% of tokens match, consider it a match
                  return matchedTokens.length >= Math.ceil(tokens.length * 0.6);
                }
                return false;
              });

              // Module match: custom_field_one/two OR title bracket tags (e.g. 【运营】) contain module name
              const moduleMatch = moduleFilters.length > 0 && moduleFilters.some(mf => {
                // Direct match on custom fields
                if (moduleFeature && moduleFeature.includes(mf)) return true;
                if (customField2 && customField2.includes(mf)) return true;
                if (category && category.includes(mf)) return true;
                // Match bracket tags in title like 【UGC小游戏】【运营】
                const bracketContent = title.match(/[【\[](.*?)[】\]]/g);
                if (bracketContent) {
                  return bracketContent.some((tag: string) => tag.toLowerCase().includes(mf));
                }
                return false;
              });

              // Owner match: story owner contains any of the configured owner names
              const ownerMatch = ownerFilters.length > 0 && (() => {
                const owner = (story?.owner || '').toLowerCase();
                if (!owner) return false;
                const ownerNames = owner.split(/[;；]/).map((n: string) => n.trim());
                return ownerFilters.some(of => ownerNames.some((on: string) => on.includes(of) || of.includes(on)));
              })();

              const activeMatches: boolean[] = [];
              if (hasKeywordFilter) activeMatches.push(keywordMatch);
              if (hasModuleFilter) activeMatches.push(moduleMatch);
              if (hasOwnerFilter) activeMatches.push(ownerMatch);
              return syncRange?.filterLogic === 'or' ? activeMatches.some(Boolean) : activeMatches.every(Boolean);
            });

            count = previewStories.length;
            const keywordInfo = keywords.length > 0 ? `keywords: ${keywords.join(', ')}` : '';
            const moduleInfo = moduleFilters.length > 0 ? `modules: ${moduleFilters.join(', ')}` : '';
            const ownerInfo = ownerFilters.length > 0 ? `owners: ${ownerFilters.join(', ')}` : '';
            const filterDesc = [keywordInfo, moduleInfo, ownerInfo].filter(Boolean).join(' | ');
            console.log(`[TAPD] Combined filter in preview: ${beforeCount} → ${count} stories (${filterDesc})`);
          }

          // --- Pipeline Smart Filter for preview ---
          if (syncRange?.pipelineFilter) {
            const activeStages = syncRange.pipelineStages && syncRange.pipelineStages.length > 0
              ? syncRange.pipelineStages
              : ['interaction', 'ui_design', 'layout'];

            const { PIPELINE_STAGES } = await import('../components/gantt/constants');
            const pipelineKeywords: string[] = [];
            for (const stageId of activeStages) {
              const stage = PIPELINE_STAGES.find(s => s.id === stageId);
              if (stage) {
                pipelineKeywords.push(...stage.keywords.map(k => k.toLowerCase()));
              }
            }

            const beforePipelineCount = previewStories.length;
            const matchedStoryIds = new Set<string>();
            const parentIdsToKeep = new Set<string>();

            for (const item of previewStories) {
              const story = (item as any)?.Story || item;
              const title = (story?.name || '').toLowerCase();
              const storyId = String(story?.id || '');

              const dashIdx = title.lastIndexOf('-');
              const suffix = dashIdx !== -1 ? title.substring(dashIdx + 1).trim() : '';

              let matched = false;
              if (suffix) {
                matched = pipelineKeywords.some(kw => suffix.includes(kw) || kw.includes(suffix));
              }
              if (!matched) {
                matched = pipelineKeywords.some(kw => title.includes(kw));
              }

              if (matched) {
                matchedStoryIds.add(storyId);
                const parentId = story?.parent_id;
                if (parentId && parentId !== '0') {
                  parentIdsToKeep.add(String(parentId));
                }
              }
            }

            previewStories = previewStories.filter((item: any) => {
              const story = item?.Story || item;
              const storyId = String(story?.id || '');
              return matchedStoryIds.has(storyId) || parentIdsToKeep.has(storyId);
            });
            count = previewStories.length;
            console.log(`[TAPD] Pipeline filter in preview (stages: ${activeStages.join(', ')}): ${beforePipelineCount} → ${count} stories`);
          }


          // Apply the configured cap after all client-side filters, so later matching pages are not lost.
          previewStories = previewStories.slice(0, previewLimit);

          // Fetch missing parent stories that are not in the filtered results
          if (previewStories.length > 0) {
            const existingIds = new Set<string>();
            const missingParentIds = new Set<string>();
            previewStories.forEach((item: any) => {
              const story = item?.Story || item;
              if (story?.id) existingIds.add(String(story.id));
            });
            previewStories.forEach((item: any) => {
              const story = item?.Story || item;
              const parentId = story?.parent_id;
              if (parentId && parentId !== '0' && !existingIds.has(String(parentId))) {
                missingParentIds.add(String(parentId));
              }
            });
            if (missingParentIds.size > 0) {
              console.log(`[TAPD] Fetching ${missingParentIds.size} missing parent stories by ID...`);
              try {
                const parentData = await mcpGatewayFetch<any>(
                  'stories_get',
                  { workspace_id: workspaceId.trim(), id: Array.from(missingParentIds).join(','), fields: this.getStoryFields() },
                  mcpAccessToken
                );
                let parentStories: any[] = [];
                if (Array.isArray(parentData)) {
                  parentStories = parentData;
                } else if (parentData?.data && Array.isArray(parentData.data)) {
                  parentStories = parentData.data;
                } else if (parentData?.data) {
                  parentStories = [parentData.data];
                }
                if (parentStories.length > 0) {
                  previewStories = [...parentStories, ...previewStories];
                  count = previewStories.length;
                  console.log(`[TAPD] Added ${parentStories.length} parent stories, total now: ${count}`);
                }
              } catch (parentErr) {
                console.warn('[TAPD] Failed to fetch missing parent stories:', parentErr);
              }
            }
          }

          previewStories = await this.fetchStoryAncestors(workspaceId.trim(), previewStories, undefined, mcpAccessToken);
          previewStories = this.normalizeStoryHierarchy(previewStories);
          previewStories = this.filterEpicStories(this.filterStoriesBySyncScope(previewStories, syncRange));
          previewStories.forEach(item => this.resolveStoryPriority((item?.Story || item) as Record<string, unknown>));
          count = previewStories.length;

          return {
            success: true,
            workspaceName: count > 0
              ? `MCP 网关已连接 (ID: ${workspaceId.trim()}, 获取到 ${count} 条需求 ✓)`
              : `MCP 网关已连接 (ID: ${workspaceId.trim()}, 未获取到数据，可尝试重新验证或调整筛选条件)`,
            previewStories: previewStories.length > 0 ? previewStories : undefined,
          };
        } catch (err: any) {
          console.error('[TAPD] MCP Gateway test failed:', err);
          return {
            success: false,
            error: err.message || 'MCP 网关连接测试失败',
          };
        }
      }

      // If API credentials or token are provided, test via REST API
      const hasCredentials = (apiUser && apiToken) || (apiUser && apiPassword) || apiToken;
      if (hasCredentials) {
        const tempConfig: TapdConfig = {
          workspaceId: workspaceId.trim(),
          projectId: 0,
          apiUser: apiUser || undefined,
          apiPassword: apiPassword || undefined,
          apiToken: apiToken || undefined,
        };

        console.log('[TAPD] Testing connection with:', {
          workspaceId: workspaceId.trim(),
          hasApiUser: !!apiUser,
          hasApiToken: !!apiToken,
          hasApiPassword: !!apiPassword,
        });

        // Step 1: Use /quickstart/testauth to verify credentials (official TAPD test endpoint)
        try {
          const authData = await tapdRestFetch<{ status: number; data: string; info: string }>(
            '/quickstart/testauth',
            tempConfig,
            {}
          );
          console.log('[TAPD] testauth response:', authData);

          if (authData?.status !== 1) {
            return {
              success: false,
              error: authData?.info || '认证失败，请检查 API 账号和口令是否正确',
            };
          }
        } catch (authError: any) {
          console.error('[TAPD] testauth failed:', authError);
          return {
            success: false,
            error: authError.message || '认证失败',
          };
        }

        // Step 2: Verify workspace access by fetching actual stories.
        // The internal API may not expose /stories/count even when /stories is available.
        try {
          await Promise.all([
            this.discoverCustomPriorityFields(tempConfig, workspaceId.trim()),
            this.discoverModuleCategoryFields(tempConfig, workspaceId.trim()),
            this.discoverStoryCategories(tempConfig, workspaceId.trim()),
            this.discoverStatusLabels(tempConfig, workspaceId.trim()),
            this.discoverWorkitemTypes(tempConfig, workspaceId.trim()),
          ]);
          const previewLimit = syncRange?.limit || 1000;
          const previewData = await this.fetchRestStoriesForSyncScope(
            tempConfig,
            {
              workspace_id: workspaceId.trim(),
              fields: this.getStoryFields(),
            },
            previewLimit,
            syncRange
          );
          const data = { status: 1, data: previewData, info: '' };
          console.log('[TAPD] stories preview response:', {
            status: data?.status,
            count: Array.isArray(data?.data) ? data.data.length : 0,
          });

          if (data?.status !== 1) {
            return {
              success: false,
              error: data?.info || '认证成功，但无法读取该工作区的需求',
            };
          }

          let previewStories = this.filterStoriesBySyncScope(Array.isArray(data?.data) ? data.data : [], syncRange);
          previewStories = this.filterStoriesByAdvancedFilters(previewStories, syncRange).slice(0, previewLimit);
          previewStories = await this.fetchStoryAncestors(workspaceId.trim(), previewStories, tempConfig);
          previewStories = this.normalizeStoryHierarchy(previewStories);
          previewStories = this.filterEpicStories(this.filterStoriesBySyncScope(previewStories, syncRange));
          previewStories.forEach(item => this.resolveStoryPriority((item?.Story || item) as Record<string, unknown>));
          let workitemTypes: { id: string; name: string }[] = [];
          let releasePlans: { id: string; name: string; status?: string; startdate?: string; enddate?: string }[] = [];
          try {
            const [typeData, releaseData] = await Promise.all([
              tapdRestFetch<{ status: number; data: any[]; info: string }>('/workitem_types', tempConfig, { workspace_id: workspaceId.trim(), limit: '200', fields: 'id,name,entity_type,status' }),
              tapdRestFetch<{ status: number; data: any[]; info: string }>('/releases', tempConfig, { workspace_id: workspaceId.trim(), limit: '200', fields: 'id,name,status,startdate,enddate', order: 'startdate desc' }),
            ]);
            workitemTypes = (Array.isArray(typeData?.data) ? typeData.data : []).map(item => item?.WorkitemType || item)
              .filter(item => item?.id && item?.name && String(item.status || '3') !== '2')
              .map(item => ({ id: String(item.id), name: String(item.name) }));
            releasePlans = (Array.isArray(releaseData?.data) ? releaseData.data : []).map(item => item?.Release || item)
              .filter(item => item?.id && item?.name)
              .map(item => ({ id: String(item.id), name: String(item.name), status: item.status, startdate: item.startdate, enddate: item.enddate }));
          } catch (metadataError) {
            console.warn('[TAPD] Failed to load filter metadata:', metadataError);
          }
          return {
            success: true,
            workspaceName: '已连接 (ID: ' + workspaceId.trim() + ', 获取到 ' + previewStories.length + ' 条需求)',
            previewStories,
            workitemTypes,
            releasePlans,
          };
        } catch (wsError: any) {
          console.warn('[TAPD] workspace stories query failed:', wsError);
          return {
            success: false,
            error: 'API 认证成功，但读取工作区需求失败：' + (wsError.message || '未知错误'),
          };
        }
      }

      // Fallback to MCP proxy if no credentials
      const data = await mcpFetch<{ data: TapdWorkspaceInfo }>(
        '/tapd/workspace_get',
        { workspace_id: workspaceId.trim() }
      );

      const workspace = data?.data?.Workspace;
      if (!workspace?.name) {
        return { success: false, error: '未找到该工作区，请检查 ID 是否正确' };
      }

      return {
        success: true,
        workspaceName: workspace.pretty_name || workspace.name,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '连接测试失败，请稍后重试',
      };
    }
  }

  /**
   * Fetch stories (requirements) from TAPD via MCP proxy.
   * Supports optional sync range filtering (time range, status, limit).
   */
  async fetchTasks(workspaceId: string): Promise<Partial<Task>[]> {
    try {
      // Support multiple workspace IDs separated by comma or semicolon
      const workspaceIds = workspaceId.split(/[,;，；]/).map(id => id.trim()).filter(Boolean);
      
      if (workspaceIds.length > 1) {
        // Multiple workspaces: fetch from each and merge results
        console.log(`[TapdService] Fetching tasks from ${workspaceIds.length} workspaces:`, workspaceIds);
        const allTasks: Partial<Task>[] = [];
        for (const wsId of workspaceIds) {
          try {
            const tasks = await this.fetchTasksFromSingleWorkspace(wsId);
            allTasks.push(...tasks);
          } catch (err: any) {
            console.warn(`[TapdService] Failed to fetch from workspace ${wsId}:`, err.message);
          }
        }
        console.log(`[TapdService] Total tasks from all workspaces: ${allTasks.length}`);
        return allTasks;
      }

      // Single workspace: use original logic
      return await this.fetchTasksFromSingleWorkspace(workspaceIds[0] || workspaceId.trim());
    } catch (error: any) {
      console.error('[TapdService] fetchTasks error:', error);
      throw error;
    }
  }

  /** Fetch tasks from a single workspace */
  private async fetchTasksFromSingleWorkspace(workspaceId: string): Promise<Partial<Task>[]> {
    try {
      // Ensure config is loaded if not already
      if (!this.config || (!this.hasRestCredentials() && !this.hasMcpGatewayCredentials())) {
        await this.loadConfigByWorkspace(workspaceId);
      }

      // Build query params from syncRange config
      const syncRange = this.config?.syncRange;
      const limit = syncRange?.limit || 1000;
      const extraParams: Record<string, unknown> = {};

      // Debug: log active filter conditions
      console.log('[TapdService] fetchTasksFromSingleWorkspace syncRange:', JSON.stringify({
        workspaceId,
        mode: syncRange?.mode,
        limit,
        categoryKeywords: syncRange?.categoryKeywords,
        moduleFeatureFilter: syncRange?.moduleFeatureFilter,
        ownerFilter: syncRange?.ownerFilter,
        ownerFilterMode: syncRange?.ownerFilterMode,
      }));

      if (syncRange) {
        // Time range filter — uses TAPD's "modified" field (format: "YYYY-MM-DD~YYYY-MM-DD")
        if (syncRange.mode === 'recent' && syncRange.recentDays) {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - syncRange.recentDays);
          extraParams.modified = `${startDate.toISOString().slice(0, 10)}~${endDate.toISOString().slice(0, 10)}`;
        } else if (syncRange.mode === 'custom' && syncRange.startDate) {
          const start = syncRange.startDate;
          const end = syncRange.endDate || new Date().toISOString().slice(0, 10);
          extraParams.modified = `${start}~${end}`;
        }
        // Status filter
        if (syncRange.statusFilter && syncRange.statusFilter.length > 0) {
          extraParams.status = syncRange.statusFilter.join('|');
        }
        if (syncRange.workitemTypeFilter && syncRange.workitemTypeFilter.length > 0) {
          extraParams.workitem_type_id = syncRange.workitemTypeFilter.join('|');
        }
        if (syncRange.releaseFilter && syncRange.releaseFilter.length > 0) {
          extraParams.release_id = syncRange.releaseFilter.join('|');
        }
        // Owner filter (server-side) — skip when keyword or module filter is active
        // when cross-dimension OR requires client-side union matching
        const hasClientFiltersForOwner = (syncRange.categoryKeywords && syncRange.categoryKeywords.length > 0) ||
          (syncRange.moduleFeatureFilter && syncRange.moduleFeatureFilter.length > 0);
        if (syncRange.ownerFilter && syncRange.ownerFilter.length > 0 && syncRange.ownerFilterMode !== 'client' && !hasClientFiltersForOwner) {
          extraParams.owner = syncRange.ownerFilter.join(';');
        }
      }

      let stories: any[] = [];

      if (this.hasMcpGatewayCredentials()) {
        console.log('[TapdService] Fetching tasks via MCP Gateway for workspace:', workspaceId, 'range:', syncRange?.mode || 'all');
        // Fetch via MCP Gateway (streamable-http) — include fields param to get custom fields for filtering
        const data = await mcpGatewayFetch<{ status?: number; data?: any; count?: number }>(
          'stories_get',
          { workspace_id: workspaceId.trim(), limit, fields: this.getStoryFields(), ...extraParams },
          this.config!.mcpAccessToken!
        );
        console.log('[TapdService] MCP Gateway response:', typeof data, Array.isArray(data));
        // Handle various response formats from MCP gateway
        if (Array.isArray(data)) {
          stories = data;
        } else if (data?.data && Array.isArray(data.data)) {
          stories = data.data;
        } else if (data?.data) {
          stories = [data.data];
        }
      } else if (this.hasRestCredentials()) {
        console.log('[TapdService] Fetching tasks via REST API for workspace:', workspaceId, 'range:', syncRange?.mode || 'all');
        // Fetch via REST API — convert all params to strings
        await Promise.all([
          this.discoverCustomPriorityFields(this.config!, workspaceId.trim()),
          this.discoverModuleCategoryFields(this.config!, workspaceId.trim()),
          this.discoverStoryCategories(this.config!, workspaceId.trim()),
          this.discoverStatusLabels(this.config!, workspaceId.trim()),
          this.discoverWorkitemTypes(this.config!, workspaceId.trim()),
        ]);
        const restParams: Record<string, string> = {
          workspace_id: workspaceId.trim(),
          fields: this.getStoryFields(),
        };
        if (extraParams.modified) restParams.modified = String(extraParams.modified);
        if (extraParams.status) restParams.status = String(extraParams.status);
        if (extraParams.owner) restParams.owner = String(extraParams.owner);
        stories = await this.fetchRestStoriesForSyncScope(this.config!, restParams, limit, syncRange);
        console.log('[TapdService] REST API paginated response count:', stories.length);
      } else {
        console.log('[TapdService] Fetching tasks via MCP proxy for workspace:', workspaceId);
        // Fetch via MCP proxy
        const data = await mcpFetch<{ data: TapdStory[] }>(
          '/tapd/stories_get',
          { workspace_id: workspaceId.trim(), limit, ...extraParams }
        );
        stories = data?.data || [];
      }

      if (!Array.isArray(stories)) {
        console.warn('[TapdService] stories is not an array:', typeof stories, stories);
        return [];
      }

      stories = this.filterStoriesBySyncScope(stories, syncRange);
      console.log('[TapdService] Fetched', stories.length, 'strictly scoped stories');
      if (stories.length > 0) {
        console.log('[TapdService] First story structure:', JSON.stringify(stories[0]).substring(0, 300));
      }

      // Apply combined filter: keyword, module, and owner use the configured cross-dimension logic
      // Values within one dimension use OR; active dimensions default to AND
      const hasKeywordFilter = syncRange?.categoryKeywords && syncRange.categoryKeywords.length > 0;
      const hasModuleFilter = syncRange?.moduleFeatureFilter && syncRange.moduleFeatureFilter.length > 0;
      const hasOwnerFilter = syncRange?.ownerFilter && syncRange.ownerFilter.length > 0;

      if (hasKeywordFilter || hasModuleFilter || hasOwnerFilter) {
        const keywords = hasKeywordFilter 
          ? syncRange!.categoryKeywords!.map(k => k.toLowerCase().trim()).filter(Boolean) 
          : [];
        const moduleFilters = hasModuleFilter 
          ? syncRange!.moduleFeatureFilter!.map(m => m.toLowerCase().trim()).filter(Boolean) 
          : [];
        const ownerFilters = hasOwnerFilter
          ? syncRange!.ownerFilter!.map(o => o.toLowerCase().trim()).filter(Boolean)
          : [];

        const beforeCount = stories.length;

        stories = stories.filter(item => {
          const story = item?.Story || item;
          const title = (story?.name || '').toLowerCase();
          const moduleFeature = (story?.custom_field_one || '').toLowerCase();
          const customField2 = (story?.custom_field_two || '').toLowerCase();
          const category = (story?.category_id || story?.category || '').toLowerCase();

          // Keyword match: title contains any keyword (supports fuzzy matching)
          // Match logic: title.includes(kw) OR kw.includes(title) OR sub-tokens of kw found in title
          const keywordMatch = keywords.length > 0 && keywords.some(kw => {
            if (title.includes(kw)) return true;
            if (kw.length > 5 && title.length > 5 && kw.includes(title)) return true;
            // Split keyword into meaningful tokens (by brackets, dashes, spaces) and check if most are in title
            const tokens = kw.split(/[【】\[\]——\-\s]+/).filter(t => t.length >= 2);
            if (tokens.length >= 2) {
              const matchedTokens = tokens.filter(t => title.includes(t));
              // If >= 60% of tokens match, consider it a match
              return matchedTokens.length >= Math.ceil(tokens.length * 0.6);
            }
            return false;
          });

          // Module match: custom_field_one/two OR title bracket tags contain module name
          const moduleMatch = moduleFilters.length > 0 && moduleFilters.some(mf => {
            if (moduleFeature && moduleFeature.includes(mf)) return true;
            if (customField2 && customField2.includes(mf)) return true;
            if (category && category.includes(mf)) return true;
            // Match bracket tags in title like 【UGC小游戏】【运营】
            const bracketContent = title.match(/[【\[](.*?)[】\]]/g);
            if (bracketContent) {
              return bracketContent.some((tag: string) => tag.toLowerCase().includes(mf));
            }
            return false;
          });

          // Owner match: story owner contains any of the configured owner names
          const ownerMatch = ownerFilters.length > 0 && (() => {
            const owner = (story?.owner || '').toLowerCase();
            if (!owner) return false;
            const ownerNames = owner.split(/[;；]/).map((n: string) => n.trim());
            return ownerFilters.some(of => ownerNames.some((on: string) => on.includes(of) || of.includes(on)));
          })();

          const activeMatches: boolean[] = [];
          if (hasKeywordFilter) activeMatches.push(keywordMatch);
          if (hasModuleFilter) activeMatches.push(moduleMatch);
          if (hasOwnerFilter) activeMatches.push(ownerMatch);
          return syncRange?.filterLogic === 'or' ? activeMatches.some(Boolean) : activeMatches.every(Boolean);
        });

        const keywordInfo = keywords.length > 0 ? `keywords: ${keywords.join(', ')}` : '';
        const moduleInfo = moduleFilters.length > 0 ? `modules: ${moduleFilters.join(', ')}` : '';
        const ownerInfo = ownerFilters.length > 0 ? `owners: ${ownerFilters.join(', ')}` : '';
        const filterDesc = [keywordInfo, moduleInfo, ownerInfo].filter(Boolean).join(' | ');
        console.log(`[TapdService] Combined filter: ${beforeCount} → ${stories.length} stories (${filterDesc})`);
      }

      // --- Pipeline Smart Filter: Only keep tasks related to specific pipeline stages ---
      // When enabled, filters stories to only include those matching pipeline stage keywords
      // (e.g., 交互设计, UI设计, Layout) and their parent tasks for proper hierarchy
      if (syncRange?.pipelineFilter) {
        const activeStages = syncRange.pipelineStages && syncRange.pipelineStages.length > 0
          ? syncRange.pipelineStages
          : ['interaction', 'ui_design', 'layout']; // Default: 交互/视觉/Layout

        // Import pipeline stage definitions
        const { PIPELINE_STAGES } = await import('../components/gantt/constants');
        
        // Collect all keywords from active pipeline stages
        const pipelineKeywords: string[] = [];
        for (const stageId of activeStages) {
          const stage = PIPELINE_STAGES.find(s => s.id === stageId);
          if (stage) {
            pipelineKeywords.push(...stage.keywords.map(k => k.toLowerCase()));
          }
        }

        const beforePipelineCount = stories.length;
        const matchedStoryIds = new Set<string>();
        const parentIdsToKeep = new Set<string>();

        // First pass: identify stories that match pipeline keywords
        for (const item of stories) {
          const story = item?.Story || item;
          const title = (story?.name || '').toLowerCase();
          const storyId = String(story?.id || '');
          
          // Check if title contains any pipeline keyword (suffix match preferred)
          const dashIdx = title.lastIndexOf('-');
          const suffix = dashIdx !== -1 ? title.substring(dashIdx + 1).trim() : '';
          
          let matched = false;
          // Suffix match (more precise)
          if (suffix) {
            matched = pipelineKeywords.some(kw => suffix.includes(kw) || kw.includes(suffix));
          }
          // Full title match (fallback)
          if (!matched) {
            matched = pipelineKeywords.some(kw => title.includes(kw));
          }

          if (matched) {
            matchedStoryIds.add(storyId);
            // Also keep the parent for proper hierarchy
            const parentId = story?.parent_id;
            if (parentId && parentId !== '0') {
              parentIdsToKeep.add(String(parentId));
            }
          }
        }

        // Second pass: keep matched stories + their parents
        stories = stories.filter(item => {
          const story = item?.Story || item;
          const storyId = String(story?.id || '');
          return matchedStoryIds.has(storyId) || parentIdsToKeep.has(storyId);
        });

        console.log(`[TapdService] Pipeline filter (stages: ${activeStages.join(', ')}): ${beforePipelineCount} → ${stories.length} stories (keywords: ${pipelineKeywords.join(', ')})`);
      }

      // Apply the configured cap after client-side filters, then add required structural parents.
      stories = stories.slice(0, limit);

      // Fetch missing parent stories that are not in the filtered results
      const existingIds = new Set<string>();
      const missingParentIds = new Set<string>();
      stories.forEach(item => {
        const story = item?.Story || item;
        if (story?.id) existingIds.add(String(story.id));
      });
      stories.forEach(item => {
        const story = item?.Story || item;
        const parentId = story?.parent_id;
        if (parentId && parentId !== '0' && !existingIds.has(String(parentId))) {
          missingParentIds.add(String(parentId));
        }
      });
      if (missingParentIds.size > 0) {
        console.log(`[TapdService] Fetching ${missingParentIds.size} missing parent stories by ID...`);
        try {
          let parentStories: any[] = [];
          const parentIds = Array.from(missingParentIds).join(',');
          if (this.hasMcpGatewayCredentials()) {
            const data = await mcpGatewayFetch<{ status?: number; data?: any }>(
              'stories_get',
              { workspace_id: workspaceId, id: parentIds, fields: this.getStoryFields() },
              this.config!.mcpAccessToken!
            );
            if (Array.isArray(data)) {
              parentStories = data;
            } else if (data?.data && Array.isArray(data.data)) {
              parentStories = data.data;
            } else if (data?.data) {
              parentStories = [data.data];
            }
          } else if (this.hasRestCredentials()) {
            const data = await tapdRestFetch<{ status: number; data: any }>(
              '/stories',
              this.config!,
              { workspace_id: workspaceId, id: parentIds, limit: '200', fields: this.getStoryFields() }
            );
            if (data?.status === 1 && data?.data) {
              parentStories = Array.isArray(data.data) ? data.data : [data.data];
            }
          } else {
            const data = await mcpFetch<{ data: any[] }>(
              '/tapd/stories_get',
              { workspace_id: workspaceId, id: parentIds, limit: '200', fields: this.getStoryFields() }
            );
            parentStories = data?.data || [];
          }
          if (parentStories.length > 0) {
            stories = [...parentStories, ...stories];
            console.log(`[TapdService] Added ${parentStories.length} parent stories, total now: ${stories.length}`);
          }
        } catch (parentErr) {
          console.warn('[TapdService] Failed to fetch missing parent stories:', parentErr);
        }
      }

      // Handle both { Story: {...} } and direct story object formats
      stories = await this.fetchStoryAncestors(workspaceId.trim(), stories, this.config || undefined);
      stories = await this.fetchRelatedCheckpointChildren(
        workspaceId.trim(), stories, this.config || undefined,
        this.hasMcpGatewayCredentials() ? this.config!.mcpAccessToken : undefined
      );
      stories = await this.fetchStoryAncestors(workspaceId.trim(), stories, this.config || undefined);
      stories = this.normalizeStoryHierarchy(stories);
      stories = this.filterEpicStories(this.filterStoriesBySyncScope(stories, syncRange));

      return stories.map(item => {
        const story = item?.Story || item;
        return this.mapTapdStoryToTask(story);
      });
    } catch (error: any) {
      console.error(`[TapdService] fetchTasksFromSingleWorkspace failed for workspace ${workspaceId}:`, error);
      throw new Error(`获取 TAPD 任务失败 (工作区 ${workspaceId}): ${error.message}`);
    }
  }

  /**
   * Fetch iterations from TAPD via MCP proxy.
   */
  async fetchIterations(workspaceId: string): Promise<TapdIteration['Iteration'][]> {
    try {
      // Ensure config is loaded if not already
      if (!this.config || (!this.hasRestCredentials() && !this.hasMcpGatewayCredentials())) {
        await this.loadConfigByWorkspace(workspaceId);
      }

      let iterations: any[] = [];

      if (this.hasMcpGatewayCredentials()) {
        // Fetch via MCP Gateway
        const data = await mcpGatewayFetch<{ data?: any }>(
          'iterations_get',
          { workspace_id: workspaceId.trim() },
          this.config!.mcpAccessToken!
        );
        if (Array.isArray(data)) {
          iterations = data;
        } else if (data?.data && Array.isArray(data.data)) {
          iterations = data.data;
        }
      } else if (this.hasRestCredentials()) {
        // Fetch via REST API
        const data = await tapdRestFetch<{ status: number; data: any; info: string }>(
          '/iterations',
          this.config!,
          { workspace_id: workspaceId.trim(), limit: '200' }
        );
        if (data?.status !== 1) {
          throw new Error(data?.info || `TAPD API 返回错误状态: ${data?.status}`);
        }
        iterations = data?.data || [];
      } else {
        // Fetch via MCP proxy
        const data = await mcpFetch<{ data: TapdIteration[] }>(
          '/tapd/iterations_get',
          { workspace_id: workspaceId.trim() }
        );
        iterations = data?.data || [];
      }

      if (!Array.isArray(iterations)) {
        return [];
      }

      // Handle both { Iteration: {...} } and direct iteration object formats
      return iterations.map(item => item?.Iteration || item);
    } catch (error: any) {
      console.error('[TapdService] fetchIterations failed:', error);
      throw new Error(`获取 TAPD 迭代失败: ${error.message}`);
    }
  }

  /**
   * Update a story in TAPD.
   */
  async updateTask(workspaceId: string, tapdId: string, updates: Partial<Task>): Promise<boolean> {
    try {
      const config = this.config || (await db.tapdConfigs.where('workspaceId').equals(workspaceId).first());
      if (!config) {
        throw new Error('未找到 TAPD 配置');
      }

      // Map local fields to TAPD fields
      const tapdUpdates: Record<string, any> = {
        workspace_id: workspaceId,
        id: tapdId,
        current_user: config.apiUser || 'system', // Required by TAPD API for updates
      };

      if (updates.title !== undefined) tapdUpdates.name = updates.title;
      if (updates.description !== undefined) tapdUpdates.description = updates.description;
      if (updates.status !== undefined && updates.status !== 'paused') tapdUpdates.status = this.mapLocalStatusToTapd(updates.status as 'todo' | 'in_progress' | 'done');
      if (updates.priority !== undefined) tapdUpdates.priority = this.mapLocalPriorityToTapd(updates.priority);
      
      // Format dates to YYYY-MM-DD
      if (updates.startDate !== undefined) {
        tapdUpdates.begin = formatTapdCalendarDate(updates.startDate) || '';
      }
      if (updates.endDate !== undefined) {
        tapdUpdates.due = formatTapdCalendarDate(updates.endDate) || '';
      }

      // Try MCP Gateway first if configured
      if (config.authMode === 'mcp-gateway' && config.mcpAccessToken) {
        const response = await mcpGatewayFetch<{ status?: number; success?: boolean }>(
          'update_story',
          tapdUpdates,
          config.mcpAccessToken
        );
        return response?.status === 1 || response?.success === true;
      }

      const hasRest = !!(config.apiToken || (config.apiUser && config.apiPassword));
      if (hasRest) {
        // Update via REST API
        const response = await tapdRestFetch<{ status: number; info: string }>(
          '/stories',
          config,
          {},
          'POST',
          tapdUpdates
        );
        return response?.status === 1;
      } else {
        // Update via MCP proxy (assuming MCP proxy has a stories_update endpoint)
        const response = await mcpFetch<{ status: number; info: string }>(
          '/tapd/stories_update',
          tapdUpdates
        );
        return response?.status === 1;
      }
    } catch (error: any) {
      console.error('[TapdService] updateTask failed:', error);
      throw new Error(`更新 TAPD 任务失败: ${error.message}`);
    }
  }

  /**
   * Idempotent upsert sync: fetch TAPD tasks and insert/update into local DB.
   * Uses `tapdId` field to determine insert vs update.
   * Now delegates to syncTasksToLocalEnhanced for full dedup + parent-child + member matching.
   * @param selectedStoryIds - Optional set of TAPD story IDs to sync. If provided, only these stories will be synced.
   */
  async syncTasksToLocal(projectId: number, mergeDecisions?: Map<string, number | 'skip'>, selectedStoryIds?: Set<string>): Promise<SyncResult> {
    return this.syncTasksToLocalEnhanced(projectId, mergeDecisions, selectedStoryIds);
  }

  /** Check if REST API credentials (token or user/password) are available */
  private hasRestCredentials(): boolean {
    return !!(this.config?.apiToken || (this.config?.apiUser && this.config?.apiPassword));
  }

  /** Check if MCP Gateway credentials are available */
  private hasMcpGatewayCredentials(): boolean {
    return !!(this.config?.mcpAccessToken && this.config?.authMode === 'mcp-gateway');
  }

  /** Get the effective auth mode based on config */
  private getAuthMode(): TapdAuthMode {
    if (this.config?.authMode) return this.config.authMode;
    // Auto-detect: if mcpAccessToken is set, use mcp-gateway
    if (this.config?.mcpAccessToken) return 'mcp-gateway';
    return 'rest';
  }

  // ─── Mapping Helpers ─────────────────────────────────────────

  /** Map TAPD status string to local status */
  private mapStatus(tapdStatus: string): Task['status'] {
    return mapTapdStatus(tapdStatus);
  }

  /** Map TAPD priority string to local priority, preserving an empty value. */
  private mapPriority(tapdPriority: string): Task['priority'] {
    return mapTapdPriority(tapdPriority);
  }

  /** Map local status to TAPD status string */
  private mapLocalStatusToTapd(localStatus: 'todo' | 'in_progress' | 'done'): string {
    const statusMap: Record<'todo' | 'in_progress' | 'done', string> = {
      'todo': 'planning',
      'in_progress': 'developing',
      'done': 'resolved',
    };
    return statusMap[localStatus] || 'planning';
  }

  /** Map local priority to TAPD priority string */
  private mapLocalPriorityToTapd(localPriority: 'low' | 'medium' | 'high'): string {
    const priorityMap: Record<'low' | 'medium' | 'high', string> = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
    };
    return priorityMap[localPriority] || 'medium';
  }

  /** Map a single TAPD Story to a partial local Task (extended with parent/owner metadata) */
  private mapTapdStoryToTask(story: TapdStory['Story']): Partial<Task> & { _tapdParentId?: string; _tapdOwner?: string } {
    const tapdStatusLabel = this.resolveStoryStatus(story.status);
    const tapdStepLabel = this.resolveStoryStep(story.step);
    const mappedStatus = this.mapStatus(tapdStatusLabel);
    const completedAt = parseTapdDate(story.completed);
    // TAPD's completed timestamp is authoritative for custom terminal statuses.
    // Rejected requirements remain cancelled even if TAPD records a timestamp.
    const status = applyTapdCompletionStatus(mappedStatus, completedAt);
    const parsedProgress = Number.parseInt(String(story.progress ?? '').replace('%', ''), 10);
    const progress =
      status === 'done' ? 100 :
      status === 'in_progress' ? (Number.isFinite(parsedProgress) ? Math.min(100, Math.max(0, parsedProgress)) : 50) :
      0;

    const effortUnit = this.config?.syncRange?.effortUnit || 'days';
    const hoursPerDay = this.config?.syncRange?.hoursPerDay || 8;
    const estimatedHours = parseTapdEffortHours(story.effort, effortUnit, hoursPerDay);
    const priorityValue = this.resolveStoryPriority(story as unknown as Record<string, unknown>);

    // Build TAPD external URL for direct navigation
    const workspaceId = this.config?.workspaceId || '';
    const externalUrl = workspaceId && story.id
      ? `https://tapd.woa.com/${workspaceId}/prong/stories/view/${story.id}`
      : undefined;

    // “模块分类” may be assigned to any TAPD field; its configured label is the source of truth.
    const module = getTapdModuleCategoryValue(
      story as unknown as Record<string, unknown>,
      this.activeModuleCategoryFields,
      this.activeCategoryNames
    );

    return {
      title: story.name,
      description: story.description || '',
      status,
      priority: this.mapPriority(priorityValue),
      // Leave dates undefined when no schedule info (don't fill with current date)
      startDate: parseTapdDate(story.begin),
      endDate: parseTapdDate(story.due),
      progress,
      completedAt,
      type: 'task',
      dependencies: [],
      assigneeIds: [],
      tapdId: String(story.id),
      tapdParentId: story.parent_id != null ? String(story.parent_id) : undefined,
      tapdWorkitemTypeId: story.workitem_type_id ? String(story.workitem_type_id) : undefined,
      tapdWorkitemTypeName: story.workitem_type_id ? this.activeWorkitemTypeNames.get(String(story.workitem_type_id)) : undefined,
      externalUrl,
      module,
      estimatedHours,
      tapdReleaseId: story.release_id || undefined,
      tapdStatus: tapdStatusLabel || story.status || undefined,
      tapdStep: tapdStepLabel || story.step || undefined,
      tapdPriorityLabel: priorityValue || undefined,
      tapdOwner: story.owner || undefined,
      syncSource: 'tapd',
      updatedAt: Date.now(),
      // Extended metadata (stripped before DB insert)
      _tapdParentId: story.parent_id ? String(story.parent_id) : undefined,
      _tapdOwner: story.owner || undefined,
      _tapdModuleFeature: module,
    } as any;
  }

  // ─── Enhanced Sync: Dedup + Parent-Child + Member Matching + Module Mapping ───

  /**
   * Calculate title similarity between two strings (0-100).
   * Uses a combination of exact match, contains check, and token overlap.
   */
  private calculateTitleSimilarity(a: string, b: string): number {
    const normA = a.trim().toLowerCase().replace(/[\s\-_]+/g, '');
    const normB = b.trim().toLowerCase().replace(/[\s\-_]+/g, '');
    
    // Exact match
    if (normA === normB) return 100;
    
    // One contains the other
    if (normA.includes(normB) || normB.includes(normA)) {
      const ratio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
      return Math.round(70 + ratio * 30);
    }
    
    // Token overlap (split by common delimiters)
    const tokensA = a.toLowerCase().split(/[\s\-_/|,，、()（）【】\[\]]+/).filter(Boolean);
    const tokensB = b.toLowerCase().split(/[\s\-_/|,，、()（）【】\[\]]+/).filter(Boolean);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    
    const setA = new Set(tokensA);
    const intersection = tokensB.filter(t => setA.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    const jaccard = intersection / union;
    
    return Math.round(jaccard * 100);
  }

  /**
   * Match TAPD owner string to local resource IDs.
   * TAPD owner format: "张三;李四" or "张三" (semicolon-separated Chinese names)
   */
  private async matchOwnerToResources(ownerStr: string, cachedResources?: Resource[]): Promise<number[]> {
    if (!ownerStr || !ownerStr.trim()) return [];
    
    const ownerNames = ownerStr.split(/[;；,，]/).map(n => n.trim()).filter(Boolean);
    if (ownerNames.length === 0) return [];
    
    const allResources = cachedResources || await db.resources.toArray();
    const matchedIds: number[] = [];
    
    for (const name of ownerNames) {
      // Try exact match by tapdAccount first (TAPD returns English account IDs like "eugenejin")
      const byAccount = allResources.find(r => 
        r.tapdAccount && r.tapdAccount.toLowerCase() === name.toLowerCase()
      );
      if (byAccount?.id) {
        matchedIds.push(byAccount.id);
        continue;
      }
      // Try exact match by Chinese name
      const exact = allResources.find(r => r.name === name);
      if (exact?.id) {
        matchedIds.push(exact.id);
        continue;
      }
      // Try partial match (name contains or is contained, also check tapdAccount partial)
      const partial = allResources.find(r => 
        r.name.includes(name) || name.includes(r.name) ||
        (r.tapdAccount && (r.tapdAccount.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(r.tapdAccount.toLowerCase())))
      );
      if (partial?.id) {
        matchedIds.push(partial.id);
        continue;
      }
      // Log unmatched owner for debugging
      console.log(`[TapdService] Owner "${name}" could not be matched to any local resource`);
    }
    
    // Deduplicate matched IDs (in case multiple owner names resolve to the same resource)
    const uniqueIds = [...new Set(matchedIds)];
    if (ownerNames.length > 0 && uniqueIds.length > 0 && uniqueIds.length < ownerNames.length) {
      console.log(`[TapdService] Partial owner match: ${uniqueIds.length}/${ownerNames.length} matched from "${ownerStr}"`);
    }
    
    return uniqueIds;
  }

  /** Create CP supplier records for explicit title markers that are not configured yet. */
  private async ensureCpSuppliersFromTasks(
    tasks: Array<Partial<Task> & { _tapdOwner?: string }>,
    resources: Resource[],
    projectId: number,
  ): Promise<void> {
    let nextSortOrder = resources.reduce((max, resource) => Math.max(max, resource.sortOrder || 0), 0) + 1;
    for (const task of tasks) {
      const supplierNames = extractCpSupplierNames(task.title || '');
      if (supplierNames.length === 0) continue;
      const ownerIds = task._tapdOwner
        ? await this.matchOwnerToResources(task._tapdOwner, resources)
        : [];
      const ownerResources = ownerIds
        .map(id => resources.find(resource => resource.id === id))
        .filter((resource): resource is Resource => !!resource);
      const role = inferCpSupplierRole(task.title || '', ownerResources);

      for (const supplierName of supplierNames) {
        const key = normalizeSupplierName(supplierName);
        const existing = resources.find(resource => {
          if (resource.type !== 'cp') return false;
          const existingKey = normalizeSupplierName(resource.name || '');
          return existingKey === key || existingKey === `cp${key}` || `cp${existingKey}` === key;
        });
        if (existing?.id) {
          const projectIds = Array.from(new Set([...(existing.projectIds || []), projectId]));
          if (!existing.projectIds?.includes(projectId)) {
            await db.resources.update(existing.id, { projectIds });
            existing.projectIds = projectIds;
          }
          continue;
        }

        const newResource: Resource = {
          name: supplierName,
          role,
          type: 'cp',
          workforceType: '供应商',
          projectIds: [projectId],
          status: 'active',
          sortOrder: nextSortOrder++,
        };
        const id = await db.resources.add(newResource);
        resources.push({ ...newResource, id });
      }
    }
  }

  /**
   * Convert resource IDs to display names.
   */
  private async getResourceNamesByIds(ids: number[], cachedResources?: Resource[]): Promise<string> {
    if (!ids || ids.length === 0) return '未分配';
    const allResources = cachedResources || await db.resources.toArray();
    const names = ids.map(id => {
      const r = allResources.find(res => res.id === id);
      return r ? r.name : String(id);
    });
    return names.join(', ');
  }

  /**
   * Determine target project ID based on module mappings.
   * Returns the configured projectId if no mapping matches.
   */
  private async resolveTargetProject(title: string, defaultProjectId: number, mappings?: ModuleMapping[]): Promise<number> {
    if (!mappings || mappings.length === 0) return defaultProjectId;
    
    const titleLower = title.toLowerCase();
    
    for (const mapping of mappings) {
      const matched = mapping.keywords.some(kw => titleLower.includes(kw.toLowerCase()));
      if (matched) {
        // If targetProjectId is set, use it
        if (mapping.targetProjectId) {
          // Verify the project exists
          const project = await db.projects.get(mapping.targetProjectId);
          if (project) return mapping.targetProjectId;
        }
        // Otherwise, find or create project by name
        if (mapping.targetProjectName) {
          const existing = await db.projects.filter(p => p.name === mapping.targetProjectName).first();
          if (existing?.id) {
            // Cache the ID back into the mapping for future use
            mapping.targetProjectId = existing.id;
            return existing.id;
          }
          // Auto-create the project
          const newId = await db.projects.add({
            name: mapping.targetProjectName,
            description: `Auto-created from TAPD module mapping`,
          });
          mapping.targetProjectId = newId as number;
          return newId as number;
        }
      }
    }
    
    return defaultProjectId;
  }

  /**
   * Detect duplicate candidates: local tasks that may match TAPD stories
   * but don't have a tapdId set (manually created tasks).
   */
  async detectDuplicates(projectId: number): Promise<DuplicateCandidate[]> {
    const config = this.config || (await this.loadConfig(projectId));
    if (!config) return [];
    
    const remoteTasks = await this.fetchTasks(config.workspaceId);
    const localTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    // Only consider local tasks without tapdId (manually created)
    const manualTasks = localTasks.filter(t => !t.tapdId);
    
    if (manualTasks.length === 0 || remoteTasks.length === 0) return [];
    
    const allResources = await db.resources.toArray();
    const candidates: DuplicateCandidate[] = [];
    
    for (const remote of remoteTasks) {
      if (!remote.tapdId) continue;
      // Skip if already linked to a local task
      const alreadyLinked = localTasks.find(t => t.tapdId === remote.tapdId);
      if (alreadyLinked) continue;
      
      for (const local of manualTasks) {
        const similarity = this.calculateTitleSimilarity(remote.title || '', local.title);
        
        if (similarity >= 80) {
          // Get owner names for display
          const ownerNames = local.assigneeIds?.map(id => {
            const r = allResources.find(res => res.id === id);
            return r?.name || '';
          }).filter(Boolean).join(', ');
          
          candidates.push({
            tapdId: remote.tapdId,
            tapdTitle: remote.title || '',
            tapdOwner: (remote as any)._tapdOwner || '',
            tapdStartDate: remote.startDate ? formatTapdCalendarDate(remote.startDate) : undefined,
            tapdEndDate: remote.endDate ? formatTapdCalendarDate(remote.endDate) : undefined,
            localTaskId: local.id!,
            localTitle: local.title,
            localOwner: ownerNames || undefined,
            similarity,
            matchReason: similarity === 100 ? 'title_exact' : 'title_fuzzy',
          });
        }
      }
    }
    
    // Sort by similarity descending
    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates;
  }

  /**
   * Merge a TAPD story with an existing local task (link tapdId to manual task).
   */
  async mergeWithLocalTask(localTaskId: number, tapdId: string, updateFields?: Partial<Task>): Promise<void> {
    const updates: Partial<Task> = {
      tapdId,
      syncSource: 'tapd',
      syncedAt: Date.now(),
      updatedAt: Date.now(),
      ...updateFields,
    };
    await db.tasks.update(localTaskId, updates);
  }

  /**
   * Enhanced sync: fetch TAPD tasks and insert/update into local DB.
   * Features:
   * - Dedup by tapdId (exact) + title similarity (fuzzy)
   * - Parent-child relationship mapping
   * - Auto member matching (TAPD owner → local resource)
   * - Module-based project assignment
   */
  async syncTasksToLocalEnhanced(projectId: number, mergeDecisions?: Map<string, number | 'skip'>, selectedStoryIds?: Set<string>): Promise<SyncResult> {
    const config = this.config || (await this.loadConfig(projectId));
    if (!config) {
      throw new Error('未找到 TAPD 配置，请先绑定工作区');
    }
    console.log('[TapdService] syncTasksToLocalEnhanced starting for project:', projectId);

    let remoteTasks = await this.fetchTasks(config.workspaceId);

    // Filter by selected story IDs if provided (user checked specific stories in preview panel)
    if (selectedStoryIds && selectedStoryIds.size > 0) {
      const beforeCount = remoteTasks.length;
      const taskByTapdId = new Map(remoteTasks.filter(t => t.tapdId).map(t => [t.tapdId!, t]));
      const idsToKeep = new Set(selectedStoryIds);
      for (const selectedId of selectedStoryIds) {
        let current = taskByTapdId.get(selectedId);
        const visited = new Set<string>();
        while (current?.tapdParentId && current.tapdParentId !== '0' && !visited.has(current.tapdParentId)) {
          visited.add(current.tapdParentId);
          idsToKeep.add(current.tapdParentId);
          current = taskByTapdId.get(current.tapdParentId);
        }
      }
      remoteTasks = remoteTasks.filter(t => t.tapdId && idsToKeep.has(t.tapdId));
      console.log(`[TapdService] Filtered by selectedStoryIds: ${beforeCount} → ${remoteTasks.length} tasks`);
    }
    const moduleMappings = config.syncRange?.moduleMappings;
    const releaseNameById = new Map<string, string>();
    try {
      const plans = await this.getReleasePlans(projectId);
      plans.forEach(plan => releaseNameById.set(plan.id, plan.name));
    } catch (error) {
      console.warn('[TapdService] Failed to resolve release plan names:', error);
    }
    remoteTasks.forEach(task => {
      if (task.tapdReleaseId) task.tapdReleaseName = releaseNameById.get(task.tapdReleaseId);
    });
    let inserted = 0;
    let updated = 0;
    let merged = 0;
    const details: SyncDetailItem[] = [];
    const addDetail = (detail: SyncDetailItem) => {
      if (details.length < 300) details.push(detail);
    };

    // Phase 1: Build tapdId → localId mapping for parent-child resolution
    const tapdIdToLocalId = new Map<string, number>();
    
    // Pre-load existing tapdId mappings
    const existingTasks = await db.tasks.filter(t => !!t.tapdId).toArray();
    const existingTaskByTapdId = new Map<string, Task>();
    for (const t of existingTasks) {
      if (t.tapdId && t.id) {
        tapdIdToLocalId.set(t.tapdId, t.id);
        existingTaskByTapdId.set(t.tapdId, t);
      }
    }

    // Pre-load all local tasks for title matching
    const allLocalTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    const syncResources = await db.resources.toArray();
    await this.ensureCpSuppliersFromTasks(remoteTasks, syncResources, projectId);
    const manualTasksByTitle = new Map<string, number>();
    for (const t of allLocalTasks) {
      if (!t.tapdId && t.title) {
        manualTasksByTitle.set(t.title.trim().toLowerCase(), t.id!);
      }
    }

    // Phase 2: Insert/Update tasks (first pass - without parent relationships)
    const tasksWithParent: { localId: number; tapdParentId: string }[] = [];
    let resolvedParentCount = 0;

    await db.transaction('rw', [db.tasks, db.projects], async () => {
    for (const remoteTask of remoteTasks) {
      const tapdId = remoteTask.tapdId;
      if (!tapdId) continue;

      const tapdParentId = remoteTask.tapdParentId || (remoteTask as any)._tapdParentId as string | undefined;
      const tapdOwner = (remoteTask as any)._tapdOwner as string | undefined;

      // Clean extended metadata before DB operations
      const cleanTask = { ...remoteTask };
      delete (cleanTask as any)._tapdParentId;
      delete (cleanTask as any)._tapdOwner;
      delete (cleanTask as any)._tapdModuleFeature;

      // Keep the TAPD owner as the internal coordinator and append any configured
      // CP supplier explicitly named in the story title.
      const ownerIds = tapdOwner
        ? await this.matchOwnerToResources(tapdOwner, syncResources)
        : [];
      const supplierIds = matchCpResourcesFromTitle(cleanTask.title || '', syncResources);
      const matchedIds = Array.from(new Set([...ownerIds, ...supplierIds]));
      if (matchedIds.length > 0) cleanTask.assigneeIds = matchedIds;
      if (hasFollowupAssignment(matchedIds, syncResources)) cleanTask.workCategory = 'cp_follow';

      // Resolve target project based on module mappings
      const targetProjectId = await this.resolveTargetProject(
        cleanTask.title || '',
        projectId,
        moduleMappings
      );

      // Reuse the preloaded index instead of issuing one IndexedDB query per story.
      const existing = existingTaskByTapdId.get(tapdId);

      if (existing?.id) {
        // Update existing task (preserve local-only fields like sortOrder, notes, workCategory)
        await db.tasks.update(existing.id, {
          title: cleanTask.title,
          description: cleanTask.description,
          status: cleanTask.status,
          priority: cleanTask.priority,
          startDate: cleanTask.startDate,
          endDate: cleanTask.endDate,
          progress: cleanTask.progress,
          completedAt: cleanTask.completedAt,
          workCategory: cleanTask.workCategory || existing.workCategory,
          estimatedHours: cleanTask.estimatedHours,
          tapdReleaseId: cleanTask.tapdReleaseId,
          tapdReleaseName: cleanTask.tapdReleaseName,
          tapdStatus: cleanTask.tapdStatus,
          tapdStep: cleanTask.tapdStep,
          tapdPriorityLabel: cleanTask.tapdPriorityLabel,
          tapdOwner: cleanTask.tapdOwner,
          tapdWorkitemTypeId: cleanTask.tapdWorkitemTypeId,
          tapdWorkitemTypeName: cleanTask.tapdWorkitemTypeName,
          tapdParentId,
          assigneeIds: cleanTask.assigneeIds && cleanTask.assigneeIds.length > 0
            ? cleanTask.assigneeIds
            : existing.assigneeIds, // Preserve existing assignments if no match
          externalUrl: cleanTask.externalUrl || existing.externalUrl,
          projectId: targetProjectId,
          updatedAt: Date.now(),
          syncedAt: Date.now(),
          syncSource: 'tapd',
        });
        tapdIdToLocalId.set(tapdId, existing.id);
        if (tapdParentId !== undefined) tasksWithParent.push({ localId: existing.id, tapdParentId });
        addDetail({ title: cleanTask.title || '', tapdId, action: 'updated', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
        updated++;
      } else {
        // Check merge decisions (user-confirmed dedup)
        if (mergeDecisions?.has(tapdId)) {
          const decision = mergeDecisions.get(tapdId)!;
          if (decision === 'skip') {
            addDetail({ title: cleanTask.title || '', tapdId, action: 'skipped', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
            continue;
          }
          // Merge: link tapdId to existing local task
          await this.mergeWithLocalTask(decision, tapdId, {
            description: cleanTask.description,
            status: cleanTask.status,
            priority: cleanTask.priority,
            startDate: cleanTask.startDate,
            endDate: cleanTask.endDate,
            progress: cleanTask.progress,
            completedAt: cleanTask.completedAt,
            workCategory: cleanTask.workCategory,
            estimatedHours: cleanTask.estimatedHours,
            tapdReleaseId: cleanTask.tapdReleaseId,
            tapdReleaseName: cleanTask.tapdReleaseName,
            tapdStatus: cleanTask.tapdStatus,
            tapdStep: cleanTask.tapdStep,
            tapdPriorityLabel: cleanTask.tapdPriorityLabel,
            tapdOwner: cleanTask.tapdOwner,
            tapdWorkitemTypeId: cleanTask.tapdWorkitemTypeId,
            tapdWorkitemTypeName: cleanTask.tapdWorkitemTypeName,
            tapdParentId,
            assigneeIds: cleanTask.assigneeIds && cleanTask.assigneeIds.length > 0
              ? cleanTask.assigneeIds
              : undefined,
            projectId: targetProjectId,
          });
          tapdIdToLocalId.set(tapdId, decision);
          if (tapdParentId !== undefined) tasksWithParent.push({ localId: decision, tapdParentId });
          addDetail({ title: cleanTask.title || '', tapdId, action: 'merged', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
          merged++;
          continue;
        }

        // Auto-dedup: check title similarity with manual tasks
        const titleKey = (cleanTask.title || '').trim().toLowerCase();
        const matchedLocalId = manualTasksByTitle.get(titleKey);
        if (matchedLocalId) {
          // Exact title match → auto-merge
          await this.mergeWithLocalTask(matchedLocalId, tapdId, {
            description: cleanTask.description,
            status: cleanTask.status,
            priority: cleanTask.priority,
            startDate: cleanTask.startDate,
            endDate: cleanTask.endDate,
            progress: cleanTask.progress,
            completedAt: cleanTask.completedAt,
            workCategory: cleanTask.workCategory,
            estimatedHours: cleanTask.estimatedHours,
            tapdReleaseId: cleanTask.tapdReleaseId,
            tapdReleaseName: cleanTask.tapdReleaseName,
            tapdStatus: cleanTask.tapdStatus,
            tapdStep: cleanTask.tapdStep,
            tapdPriorityLabel: cleanTask.tapdPriorityLabel,
            tapdOwner: cleanTask.tapdOwner,
            tapdWorkitemTypeId: cleanTask.tapdWorkitemTypeId,
            tapdWorkitemTypeName: cleanTask.tapdWorkitemTypeName,
            tapdParentId,
            assigneeIds: cleanTask.assigneeIds && cleanTask.assigneeIds.length > 0
              ? cleanTask.assigneeIds
              : undefined,
            projectId: targetProjectId,
          });
          tapdIdToLocalId.set(tapdId, matchedLocalId);
          if (tapdParentId !== undefined) tasksWithParent.push({ localId: matchedLocalId, tapdParentId });
          addDetail({ title: cleanTask.title || '', tapdId, action: 'merged', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
          merged++;
          continue;
        }

        // Insert new task
        const newId = await db.tasks.add({
          ...cleanTask,
          projectId: targetProjectId,
          dependencies: cleanTask.dependencies || [],
          type: cleanTask.type || 'task',
          progress: cleanTask.progress || 0,
          updatedAt: Date.now(),
          syncedAt: Date.now(),
          syncSource: 'tapd',
        } as Task);
        tapdIdToLocalId.set(tapdId, newId as number);
        if (tapdParentId !== undefined) tasksWithParent.push({ localId: newId as number, tapdParentId });
        addDetail({ title: cleanTask.title || '', tapdId, action: 'inserted', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
        inserted++;
      }
    }

    // Phase 3: Resolve and repair parent-child relationships after all TAPD IDs are known.
    for (const { localId, tapdParentId } of tasksWithParent) {
      const parentLocalId = tapdParentId && tapdParentId !== '0'
        ? tapdIdToLocalId.get(tapdParentId)
        : undefined;
      await db.tasks.update(localId, { tapdParentId, parentId: parentLocalId });
      if (parentLocalId) resolvedParentCount++;
    }
    });

    console.log(`[TapdService] Sync complete: ${inserted} inserted, ${updated} updated, ${merged} merged, ${resolvedParentCount} parent relationships resolved`);

    return {
      inserted,
      updated,
      merged,
      total: inserted + updated + merged,
      details,
    };
  }

  // ─── Refresh Existing Tasks (Status & Schedule Update Only) ───────────────

  /**
   * Refresh only existing tasks that have a tapdId.
   * Does NOT insert new tasks — only updates status, dates, priority, progress, assignee.
   * Returns detailed change report.
   */
  refreshExistingTasks(projectId: number): Promise<RefreshResult> {
    const inFlight = this.refreshRequestsByProject.get(projectId);
    if (inFlight) return inFlight;
    const request = this.performRefreshExistingTasks(projectId)
      .finally(() => this.refreshRequestsByProject.delete(projectId));
    this.refreshRequestsByProject.set(projectId, request);
    return request;
  }

  private async performRefreshExistingTasks(projectId: number): Promise<RefreshResult> {
    const config = this.config || (await this.loadConfig(projectId));
    if (!config) {
      throw new Error('未找到 TAPD 配置，请先配置 TAPD 连接');
    }

    // Get all local tasks for this project
    const allLocalTasks = await db.tasks
      .filter(t => t.projectId === projectId)
      .toArray();

    // Only refresh tasks that are already linked to TAPD (have tapdId)
    // Manual tasks without tapdId should NOT be auto-bound during refresh
    // Paused tasks are skipped to preserve their paused state (project-level pause)
    const linkedTasks = allLocalTasks.filter(t => !!t.tapdId && t.status !== 'paused');

    if (linkedTasks.length === 0) {
      return { totalChecked: 0, updatedCount: 0, unchangedCount: 0, failedCount: 0, newlyBoundCount: 0, details: [] };
    }

    console.log(`[TapdService] Refreshing: ${linkedTasks.length} linked tasks for project ${projectId} (manual tasks are skipped)`);

    // --- Direct ID-based fetch: Skip fetchTasks entirely for maximum freshness ---
    // Instead of calling fetchTasks (which applies filter conditions and may return stale data),
    // we directly query TAPD by the exact IDs of all linked tasks. This ensures:
    // 1. No filter conditions can exclude any linked task
    // 2. Data is fetched fresh from TAPD without any caching layer
    // 3. Faster execution (single batch query vs full list + filter)
    const remoteMap = new Map<string, Partial<Task> & { _tapdOwner?: string }>();
    const allTapdIds = linkedTasks.map(t => t.tapdId!).filter(Boolean);

    let updatedCount = 0;
    let unchangedCount = 0;
    let failedCount = 0;
    const newlyBoundCount = 0;
    const details: RefreshDetailItem[] = [];

    // Support multiple workspace IDs
    const workspaceIds = config.workspaceId.split(/[,;，；]/).map(id => id.trim()).filter(Boolean);
    if (this.hasRestCredentials()) {
      await Promise.all(workspaceIds.flatMap(workspaceId => [
        this.discoverCustomPriorityFields(config, workspaceId),
        this.discoverModuleCategoryFields(config, workspaceId),
        this.discoverStoryCategories(config, workspaceId),
        this.discoverStatusLabels(config, workspaceId),
        this.discoverWorkitemTypes(config, workspaceId),
      ]));
    }
    const refreshReleaseNameById = new Map<string, string>();
    try {
      const plans = await this.getReleasePlans(projectId);
      plans.forEach(plan => refreshReleaseNameById.set(plan.id, plan.name));
    } catch (error) {
      console.warn('[TapdService] Failed to resolve release names during refresh:', error);
    }

    // Batch fetch all linked tasks by ID. TAPD may return a partial batch under load,
    // so unresolved IDs are retried in smaller batches before they are reported missing.
    const fetchRemoteBatch = async (batchIds: string[]): Promise<number> => {
      const before = remoteMap.size;
      const stories: any[] = [];

      for (const wsId of workspaceIds) {
        if (this.hasMcpGatewayCredentials()) {
          const data = await mcpGatewayFetch<{ status?: number; data?: any; count?: number }>(
            'stories_get',
            { workspace_id: wsId, id: batchIds.join(','), fields: this.getStoryFields() },
            config.mcpAccessToken!
          );
          if (Array.isArray(data)) stories.push(...data);
          else if (Array.isArray(data?.data)) stories.push(...data.data);
          else if (data?.data) stories.push(data.data);
        } else if (this.hasRestCredentials()) {
          const data = await tapdRestFetch<{ status: number; data: any; info: string }>(
            '/stories',
            config,
            { workspace_id: wsId, id: batchIds.join(','), limit: String(Math.max(20, batchIds.length)), fields: this.getStoryFields() }
          );
          if (data?.status === 1 && data?.data) {
            stories.push(...(Array.isArray(data.data) ? data.data : [data.data]));
          }
        } else {
          const data = await mcpFetch<{ data: any[] }>(
            '/tapd/stories_get',
            { workspace_id: wsId, id: batchIds.join(','), limit: String(Math.max(20, batchIds.length)), fields: this.getStoryFields() }
          );
          if (data?.data) stories.push(...data.data);
        }
      }

      for (const item of stories) {
        const story = item?.Story || item;
        const storyId = String(story?.id || '');
        if (!storyId) continue;
        const mapped = this.mapTapdStoryToTask(story);
        if (mapped.tapdReleaseId) mapped.tapdReleaseName = refreshReleaseNameById.get(mapped.tapdReleaseId);
        (mapped as any)._tapdOwner = story.owner || undefined;
        remoteMap.set(storyId, mapped as any);
      }
      return remoteMap.size - before;
    };

    const uniqueTapdIds = Array.from(new Set(allTapdIds.map(String)));
    const batchSize = 50;
    for (let i = 0; i < uniqueTapdIds.length; i += batchSize) {
      const batchIds = uniqueTapdIds.slice(i, i + batchSize);
      try {
        await fetchRemoteBatch(batchIds);
        const unresolved = batchIds.filter(id => !remoteMap.has(id));
        if (unresolved.length > 0) {
          console.warn(`[TapdService] Batch returned ${batchIds.length - unresolved.length}/${batchIds.length}; retrying ${unresolved.length} IDs in smaller requests`);
          const retryBatchSize = 10;
          for (let j = 0; j < unresolved.length; j += retryBatchSize) {
            const retryIds = unresolved.slice(j, j + retryBatchSize);
            try {
              await fetchRemoteBatch(retryIds);
            } catch (retryError) {
              console.warn('[TapdService] Small-batch retry failed:', retryError);
            }
          }
        }
        console.log(`[TapdService] Refreshed ID batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueTapdIds.length / batchSize)}`);
      } catch (err) {
        console.warn('[TapdService] Failed to fetch stories by ID batch; retrying individually:', err);
        for (const tapdId of batchIds) {
          try {
            await fetchRemoteBatch([tapdId]);
          } catch (singleError) {
            console.warn(`[TapdService] Failed to refresh TAPD story ${tapdId}:`, singleError);
          }
        }
      }
    }

    console.log(`[TapdService] Direct ID fetch complete: ${remoteMap.size}/${allTapdIds.length} tasks retrieved from TAPD`);

    // --- Phase 2: Refresh all linked tasks ---
    // Resolve owners from one resource snapshot instead of re-reading the whole
    // resource table for every task in a large refresh.
    const cachedResources = await db.resources.toArray();
    await this.ensureCpSuppliersFromTasks(Array.from(remoteMap.values()), cachedResources, projectId);

    // Keep every write in one transaction so live queries invalidate once after
    // the batch instead of re-rendering all views once per TAPD story.
    await db.transaction('rw', db.tasks, async () => {
    for (const localTask of linkedTasks) {

      const tapdId = localTask.tapdId!;
      const remote = remoteMap.get(tapdId);

      if (!remote) {
        // Task truly not found in TAPD (may have been deleted)
        failedCount++;
        continue;
      }

      const changes: RefreshDetailItem['changes'] = [];

      // Compare title
      if (remote.title && remote.title !== localTask.title) {
        changes.push({
          field: 'title',
          oldValue: localTask.title || '未命名',
          newValue: remote.title,
        });
      }

      // Compare status
      if (remote.status && remote.status !== localTask.status) {
        changes.push({
          field: 'status',
          oldValue: localTask.status || 'todo',
          newValue: remote.status,
        });
      }

      // TAPD dates are authoritative for both parent and child requirements.
      const localStart = localTask.startDate ? formatTapdCalendarDate(localTask.startDate) : '';
      const remoteStart = remote.startDate ? formatTapdCalendarDate(remote.startDate) : '';
      if (localStart !== remoteStart) {
        changes.push({
          field: 'startDate',
          oldValue: localStart || '未设置',
          newValue: remoteStart || '未设置',
        });
      }

      const localEnd = localTask.endDate ? formatTapdCalendarDate(localTask.endDate) : '';
      const remoteEnd = remote.endDate ? formatTapdCalendarDate(remote.endDate) : '';
      if (localEnd !== remoteEnd) {
        changes.push({
          field: 'endDate',
          oldValue: localEnd || '未设置',
          newValue: remoteEnd || '未设置',
        });
      }

      // Compare priority
      if (remote.priority !== localTask.priority) {
        changes.push({
          field: 'priority',
          oldValue: localTask.priority || '未设置',
          newValue: remote.priority || '未设置',
        });
      }

      // Compare progress
      const localProgress = localTask.progress ?? 0;
      const remoteProgress = remote.progress ?? 0;
      if (localProgress !== remoteProgress) {
        changes.push({
          field: 'progress',
          oldValue: String(localProgress) + '%',
          newValue: String(remoteProgress) + '%',
        });
      }

      // Combine the TAPD owner with any configured CP supplier named in the title.
      const tapdOwner = (remote as any)._tapdOwner as string | undefined;
      const validLocalIds = (localTask.assigneeIds || []).filter(id => !isNaN(id));
      const supplierIds = matchCpResourcesFromTitle(remote.title || localTask.title, cachedResources);
      const ownerIds = tapdOwner
        ? await this.matchOwnerToResources(tapdOwner, cachedResources)
        : [];
      const existingCoordinatorIds = validLocalIds.filter(id => {
        const resource = cachedResources.find(item => item.id === id);
        return resource?.type !== 'cp';
      });
      const coordinatorIds = ownerIds.length > 0 ? ownerIds : existingCoordinatorIds;
      const matchedIds = Array.from(new Set([...coordinatorIds, ...supplierIds]));
      const followupAssignment = hasFollowupAssignment(matchedIds, cachedResources);
      let resolvedAssigneeIds: number[] | null = null;
      if ((tapdOwner || supplierIds.length > 0) && matchedIds.length > 0) {
        const localAssignees = [...validLocalIds].sort((a, b) => a - b).join(',');
        const remoteAssignees = [...matchedIds].sort((a, b) => a - b).join(',');
        if (localAssignees !== remoteAssignees) {
          const oldNames = await this.getResourceNamesByIds(validLocalIds, cachedResources);
          const newNames = await this.getResourceNamesByIds(matchedIds, cachedResources);
          changes.push({
            field: 'assignee',
            oldValue: oldNames,
            newValue: newNames,
          });
          resolvedAssigneeIds = matchedIds;
        }
      }

      if (changes.length > 0) {
        // Apply updates to local DB
        const updateData: Partial<Task> = {
          updatedAt: Date.now(),
          syncedAt: Date.now(),
        };
        // Keep the local value identical to TAPD, including clearing stale title-derived values.
        updateData.module = remote.module;
        updateData.estimatedHours = remote.estimatedHours;
        updateData.tapdReleaseId = remote.tapdReleaseId;
        updateData.tapdReleaseName = remote.tapdReleaseName;
        updateData.tapdStatus = remote.tapdStatus;
        updateData.tapdStep = remote.tapdStep;
        updateData.tapdPriorityLabel = remote.tapdPriorityLabel;
        updateData.tapdOwner = remote.tapdOwner;
        updateData.tapdWorkitemTypeId = remote.tapdWorkitemTypeId;
        updateData.tapdWorkitemTypeName = remote.tapdWorkitemTypeName;
        updateData.completedAt = remote.completedAt;
        if (followupAssignment) updateData.workCategory = 'cp_follow';
        updateData.syncSource = 'tapd';
        for (const change of changes) {
          switch (change.field) {
            case 'status':
              updateData.status = change.newValue as Task['status'];
              break;
            case 'startDate':
              updateData.startDate = change.newValue === '未设置' ? null as any : parseTapdDate(change.newValue) as Date;
              break;
            case 'endDate':
              updateData.endDate = change.newValue === '未设置' ? null as any : parseTapdDate(change.newValue) as Date;
              break;
            case 'priority':
              updateData.priority = change.newValue === '未设置' ? undefined : change.newValue as Task['priority'];
              break;
            case 'progress':
              updateData.progress = parseInt(change.newValue, 10);
              break;
            case 'assignee':
              // Use pre-resolved IDs instead of parsing names as numbers
              if (resolvedAssigneeIds) {
                updateData.assigneeIds = resolvedAssigneeIds;
              }
              break;
            case 'title':
              updateData.title = change.newValue;
              break;
          }
        }
        await db.tasks.update(localTask.id!, updateData);
        updatedCount++;
        if (details.length < 200) {
          details.push({
            title: localTask.title || '',
            tapdId,
            externalUrl: remote.externalUrl || localTask.externalUrl,
            changes,
          });
        }
      } else {
        // Silently fix corrupted data and update module even when no other changes detected
        const silentUpdates: Partial<Task> = {};
        if (remote.module !== localTask.module) silentUpdates.module = remote.module;
        if (remote.estimatedHours !== localTask.estimatedHours) silentUpdates.estimatedHours = remote.estimatedHours;
        if (remote.tapdReleaseId !== localTask.tapdReleaseId) silentUpdates.tapdReleaseId = remote.tapdReleaseId;
        if (remote.tapdReleaseName !== localTask.tapdReleaseName) silentUpdates.tapdReleaseName = remote.tapdReleaseName;
        if (remote.tapdStatus !== localTask.tapdStatus) silentUpdates.tapdStatus = remote.tapdStatus;
        if (remote.tapdStep !== localTask.tapdStep) silentUpdates.tapdStep = remote.tapdStep;
        if (remote.tapdPriorityLabel !== localTask.tapdPriorityLabel) silentUpdates.tapdPriorityLabel = remote.tapdPriorityLabel;
        if (remote.tapdOwner !== localTask.tapdOwner) silentUpdates.tapdOwner = remote.tapdOwner;
        if (remote.tapdWorkitemTypeId !== localTask.tapdWorkitemTypeId) silentUpdates.tapdWorkitemTypeId = remote.tapdWorkitemTypeId;
        if (remote.tapdWorkitemTypeName !== localTask.tapdWorkitemTypeName) silentUpdates.tapdWorkitemTypeName = remote.tapdWorkitemTypeName;
        if (remote.completedAt?.getTime() !== localTask.completedAt?.getTime()) silentUpdates.completedAt = remote.completedAt;
        if (followupAssignment && localTask.workCategory !== 'cp_follow') silentUpdates.workCategory = 'cp_follow';
        silentUpdates.syncedAt = Date.now();
        silentUpdates.syncSource = 'tapd';
        // Fix corrupted assigneeIds containing NaN values
        if (localTask.assigneeIds && localTask.assigneeIds.some(id => isNaN(id))) {
          const validIds = localTask.assigneeIds.filter(id => !isNaN(id));
          silentUpdates.assigneeIds = validIds.length > 0 ? validIds : [];
        }
        if (Object.keys(silentUpdates).length > 0) {
          await db.tasks.update(localTask.id!, silentUpdates);
        }
        unchangedCount++;
      }
    }

    // Rebuild hierarchy for already imported tasks during quick refresh.
    const refreshedTapdIdToLocalId = new Map<string, number>();
    allLocalTasks.forEach(task => {
      if (task.tapdId && task.id) refreshedTapdIdToLocalId.set(task.tapdId, task.id);
    });
    for (const localTask of linkedTasks) {
      const remote = localTask.tapdId ? remoteMap.get(localTask.tapdId) : undefined;
      if (!remote || remote.tapdParentId === undefined || !localTask.id) continue;
      const parentId = remote.tapdParentId && remote.tapdParentId !== '0'
        ? refreshedTapdIdToLocalId.get(remote.tapdParentId)
        : undefined;
      if (localTask.tapdParentId !== remote.tapdParentId || localTask.parentId !== parentId) {
        await db.tasks.update(localTask.id, {
          tapdParentId: remote.tapdParentId,
          parentId,
        });
      }
    }
    });

    const totalChecked = linkedTasks.length + newlyBoundCount;
    console.log(`[TapdService] Refresh complete: ${newlyBoundCount} newly bound, ${updatedCount} updated, ${unchangedCount} unchanged, ${failedCount} not found in remote`);

    return {
      totalChecked,
      updatedCount,
      unchangedCount,
      failedCount,
      newlyBoundCount,
      details,
    };
  }
}

export const tapdService = new TapdService();

/**
 * Reclassify modules for all tasks in a project.
 * Extracts module name from task titles (bracket tags like 【xxx】) and updates the module field.
 * Also propagates module from child tasks to parent tasks if parent has no module.
 * This is useful for existing tasks that were synced before the module feature was added.
 */
export async function reclassifyModules(projectId?: number): Promise<{ updated: number; total: number }> {
  const allTasks = projectId
    ? await db.tasks.where('projectId').equals(projectId).toArray()
    : await db.tasks.toArray();

  let updated = 0;

  // Phase 1: Extract module from title for all tasks
  for (const task of allTasks) {
    if (!task.module) {
      const newModule = extractModuleFromTitle(task.title);
      if (newModule) {
        await db.tasks.update(task.id!, { module: newModule });
        task.module = newModule; // Update in-memory for Phase 2
        updated++;
      }
    }
  }

  // Phase 2: Propagate module from children to parent (if parent has no module)
  for (const task of allTasks) {
    if (!task.module && !task.parentId) {
      // This is a root task without module - check if any child has a module
      const children = allTasks.filter(t => t.parentId === task.id);
      const childModule = children.find(c => c.module)?.module;
      if (childModule) {
        await db.tasks.update(task.id!, { module: childModule });
        task.module = childModule;
        updated++;
      }
    }
  }

  console.log(`[TapdService] Reclassified modules: ${updated}/${allTasks.length} tasks updated`);
  return { updated, total: allTasks.length };
}

/**
 * Extract module name from a task title.
 * Looks for bracket tags like 【UGC小游戏】, 【轻舟编辑器】, 【2D Avatar】 etc.
 * Returns the first meaningful tag (skips short uppercase project codes like QZ, MX).
 */
export function extractModuleFromTitle(title: string): string | undefined {
  if (!title) return undefined;

  // Known module keywords ordered by specificity (more specific first)
  const knownModules = [
    '2D Avatar', '2DAvatar', 'UGC小游戏', '轻舟编辑器', '元梦之星',
    '外围系统', '核心玩法', '社交系统', '任务系统', '新手引导',
    'UGC', 'AI',
    '商城', '活动', '主界面', '编辑器', '地图', '角色', '装扮',
    '聊天', '好友', '公会', '匹配', '排行', '成就', '设置',
  ];

  // Normalize title for matching (strip brackets for content scanning)
  const titleLower = title.toLowerCase();

  // 1. First, scan the entire title (including text outside brackets) for specific module keywords
  // This handles cases like "【UGC】2D Avatar - xxx" where "2D Avatar" is more specific than "UGC"
  for (const mod of knownModules) {
    if (titleLower.includes(mod.toLowerCase())) {
      // Normalize: treat "2DAvatar" as "2D Avatar"
      if (mod === '2DAvatar') return '2D Avatar';
      return mod;
    }
  }

  // 2. Fallback: Extract bracket tags from title
  const bracketMatches = title.match(/[【\[](.*?)[】\]]/g);
  if (!bracketMatches || bracketMatches.length === 0) return undefined;

  // Skip patterns: short uppercase codes (QZ, MX, etc.), single chars, common non-module tags
  const skipPatterns = [
    /^[A-Z]{1,4}$/, // Short uppercase codes like QZ, MX
    /^[a-z]{1,2}$/i, // Very short tags
    /^(P[0-9]|S[0-9]|v[0-9])/, // Priority/Sprint/Version tags
    /^美术$/, // Non-module category tags
    /^端外热更$/, // Non-module process tags
    /^模型生成$/, // Non-module process tags
  ];

  for (const tag of bracketMatches) {
    const content = tag.replace(/[【】\[\]]/g, '').trim();
    if (!content) continue;

    // Skip if matches skip patterns
    const shouldSkip = skipPatterns.some(p => p.test(content));
    if (shouldSkip) continue;

    // Accept if length > 2 (meaningful tag)
    if (content.length > 2) {
      return content;
    }
  }

  return undefined;
}

// ─── TAPD File Import Service (Semi-automatic) ──────────────────

/** A single parsed row for preview before import */
export interface PreviewRow {
  rowIndex: number;
  tapdId: string;
  title: string;
  status: Task['status'];
  statusRaw: string;
  priority?: 'low' | 'medium' | 'high';
  priorityRaw: string;
  owner: string;
  startDate: string;
  endDate: string;
  progress: number;
  description: string;
  module?: string;
  estimatedHours?: number;
  /** Whether this row already exists in local DB (by tapdId or title) */
  existsLocally: boolean;
  /** The local task id if it exists */
  localTaskId?: number;
  /** Parent task TAPD ID (for hierarchy display) */
  parentTapdId?: string;
  /** Nesting depth level (0 = root) */
  depth?: number;
  /** Duplicate detection info */
  duplicateInfo?: {
    similarity: number;
    matchReason: 'tapdId_exact' | 'title_exact' | 'title_fuzzy' | 'owner_date';
    localTitle: string;
  };
}

/** Result of parsing a file for preview */
export interface PreviewResult {
  rows: PreviewRow[];
  headers: string[];
  errors: string[];
  /** Unique status values found */
  statuses: string[];
  /** Unique owner values found */
  owners: string[];
  /** Unique module/category values found */
  modules: string[];
}

export class TapdImportService {
  /**
   * Import tasks from a TAPD-exported CSV or Excel file.
   * Supports standard TAPD export columns (Chinese headers).
   */
  static async importFromFile(file: File, projectId: number): Promise<ImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const text = await file.text();
      return TapdImportService.parseAndImportCSV(text, projectId);
    } else if (ext === 'xlsx' || ext === 'xls') {
      // For Excel files, try to read as CSV (basic support)
      // Full xlsx parsing would require a library like SheetJS
      try {
        const text = await file.text();
        return TapdImportService.parseAndImportCSV(text, projectId);
      } catch {
        throw new Error('Excel 文件解析失败。建议从 TAPD 导出时选择 CSV 格式，兼容性更好。');
      }
    } else {
      throw new Error('不支持的文件格式，请选择 CSV 或 Excel 文件');
    }
  }

  /**
   * Parse a file for preview (without importing).
   * Returns structured rows with local-existence check.
   */
  static async previewFile(file: File, projectId: number): Promise<PreviewResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let text: string;

    if (ext === 'csv') {
      text = await file.text();
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        text = await file.text();
      } catch {
        throw new Error('Excel 文件解析失败。建议从 TAPD 导出时选择 CSV 格式，兼容性更好。');
      }
    } else {
      throw new Error('不支持的文件格式，请选择 CSV 或 Excel 文件');
    }

    return TapdImportService.parseForPreview(text, projectId);
  }

  /** Parse CSV text into preview rows with local-existence detection, dedup, and hierarchy */
  private static async parseForPreview(csvText: string, projectId: number): Promise<PreviewResult> {
    const errors: string[] = [];
    const rows: PreviewRow[] = [];

    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      errors.push('文件为空或只有表头');
      return { rows, headers: [], errors, statuses: [], owners: [], modules: [] };
    }

    const headers = TapdImportService.parseCSVLine(lines[0]);
    const headerMap = TapdImportService.buildHeaderMap(headers);

    if (!headerMap.title) {
      errors.push('未找到标题/需求名称列，请确认文件来自 TAPD 导出');
      return { rows, headers, errors, statuses: [], owners: [], modules: [] };
    }

    // Pre-load all local tasks for this project for efficient matching
    const localTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    const tapdIdSet = new Map<string, number>();
    const titleSet = new Map<string, { id: number; title: string }>();
    for (const t of localTasks) {
      if (t.tapdId) tapdIdSet.set(t.tapdId, t.id!);
      if (t.title) titleSet.set(t.title.trim().toLowerCase(), { id: t.id!, title: t.title });
    }

    const statusSet = new Set<string>();
    const ownerSet = new Set<string>();
    const moduleSet = new Set<string>();

    // First pass: parse all rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = TapdImportService.parseCSVLine(lines[i]);
        const get = (key: string): string => {
          const idx = headerMap[key];
          return idx !== null && idx !== undefined && idx < cols.length ? cols[idx].trim() : '';
        };

        const title = get('title');
        if (!title) continue;

        const statusRaw = get('status');
        const priorityRaw = get('priority');
        const owner = get('owner');
        const tapdId = get('id');
        const parentTapdId = get('parentId');
        const module = get('module');
        const effortRaw = get('estimatedHours');
        const estimatedHours = effortRaw ? Number.parseFloat(effortRaw.replace(/[^\d.]/g, '')) : undefined;
        const status = TapdImportService.mapImportStatus(statusRaw);
        const priority = TapdImportService.mapImportPriority(priorityRaw);
        const progressStr = get('progress');
        const progress = progressStr
          ? parseInt(progressStr.replace('%', ''), 10)
          : (status === 'done' ? 100 : status === 'in_progress' ? 50 : 0);

        if (statusRaw) statusSet.add(statusRaw);
        if (owner) ownerSet.add(owner);
        if (module) moduleSet.add(module);

        // Enhanced duplicate detection: tapdId exact → title exact → title fuzzy
        let existsLocally = false;
        let localTaskId: number | undefined;
        let duplicateInfo: PreviewRow['duplicateInfo'] | undefined;

        if (tapdId && tapdIdSet.has(tapdId)) {
          existsLocally = true;
          localTaskId = tapdIdSet.get(tapdId);
          duplicateInfo = {
            similarity: 100,
            matchReason: 'tapdId_exact',
            localTitle: localTasks.find(t => t.tapdId === tapdId)?.title || '',
          };
        } else if (titleSet.has(title.trim().toLowerCase())) {
          existsLocally = true;
          const match = titleSet.get(title.trim().toLowerCase())!;
          localTaskId = match.id;
          duplicateInfo = {
            similarity: 100,
            matchReason: 'title_exact',
            localTitle: match.title,
          };
        } else {
          // Fuzzy title matching against all local tasks
          const titleLower = title.trim().toLowerCase();
          for (const t of localTasks) {
            if (!t.title) continue;
            const similarity = TapdImportService.calculateSimilarity(titleLower, t.title.trim().toLowerCase());
            if (similarity >= 75) {
              existsLocally = true;
              localTaskId = t.id;
              duplicateInfo = {
                similarity,
                matchReason: 'title_fuzzy',
                localTitle: t.title,
              };
              break;
            }
          }
        }

        rows.push({
          rowIndex: i,
          tapdId,
          title,
          status,
          statusRaw,
          priority,
          priorityRaw,
          owner,
          startDate: get('startDate'),
          endDate: get('endDate'),
          progress: isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress)),
          description: get('description'),
          module: module || undefined,
          estimatedHours: estimatedHours !== undefined && Number.isFinite(estimatedHours) ? estimatedHours : undefined,
          existsLocally,
          localTaskId,
          parentTapdId: parentTapdId || undefined,
          duplicateInfo,
        });
      } catch (err: any) {
        errors.push(`第 ${i + 1} 行: ${err.message || '解析失败'}`);
      }
    }

    // Second pass: resolve parent-child hierarchy depth
    const tapdIdToRow = new Map<string, PreviewRow>();
    for (const row of rows) {
      if (row.tapdId) tapdIdToRow.set(row.tapdId, row);
    }
    for (const row of rows) {
      let depth = 0;
      let currentParent = row.parentTapdId;
      const visited = new Set<string>();
      while (currentParent && tapdIdToRow.has(currentParent) && !visited.has(currentParent)) {
        visited.add(currentParent);
        depth++;
        currentParent = tapdIdToRow.get(currentParent)?.parentTapdId;
      }
      row.depth = depth;
    }

    // Sort rows: parent first, then children (tree order)
    const sortedRows = TapdImportService.sortRowsAsTree(rows);

    return {
      rows: sortedRows,
      headers,
      errors,
      statuses: Array.from(statusSet),
      owners: Array.from(ownerSet),
      modules: Array.from(moduleSet),
    };
  }

  /** Sort rows into tree order (parents before children, preserving sibling order) */
  private static sortRowsAsTree(rows: PreviewRow[]): PreviewRow[] {
    const tapdIdToRow = new Map<string, PreviewRow>();
    const childrenMap = new Map<string, PreviewRow[]>(); // parentId → children
    const roots: PreviewRow[] = [];

    for (const row of rows) {
      if (row.tapdId) tapdIdToRow.set(row.tapdId, row);
    }

    for (const row of rows) {
      if (row.parentTapdId && tapdIdToRow.has(row.parentTapdId)) {
        const children = childrenMap.get(row.parentTapdId) || [];
        children.push(row);
        childrenMap.set(row.parentTapdId, children);
      } else {
        roots.push(row);
      }
    }

    // DFS to flatten tree
    const result: PreviewRow[] = [];
    const addWithChildren = (row: PreviewRow) => {
      result.push(row);
      const children = childrenMap.get(row.tapdId) || [];
      for (const child of children) {
        addWithChildren(child);
      }
    };
    for (const root of roots) {
      addWithChildren(root);
    }

    // Add any orphan rows not reached by DFS
    const resultSet = new Set(result.map(r => r.rowIndex));
    for (const row of rows) {
      if (!resultSet.has(row.rowIndex)) {
        result.push(row);
      }
    }

    return result;
  }

  /** Calculate title similarity (0-100) for dedup detection */
  private static calculateSimilarity(a: string, b: string): number {
    if (a === b) return 100;
    // One contains the other
    if (a.includes(b) || b.includes(a)) {
      const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      return Math.round(70 + ratio * 30);
    }
    // Token overlap
    const tokensA = a.split(/[\s\-_/|,，、()（）【】\[\]]+/).filter(Boolean);
    const tokensB = b.split(/[\s\-_/|,，、()（）【】\[\]]+/).filter(Boolean);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    const setA = new Set(tokensA);
    const intersection = tokensB.filter(t => setA.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    return Math.round((intersection / union) * 100);
  }

  /**
   * Import selected preview rows into local DB.
   * Enhanced with: fuzzy dedup, parent-child relationship, and auto member matching.
   */
  static async importSelectedRows(
    selectedRows: PreviewRow[],
    projectId: number
  ): Promise<ImportResult> {
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, total: 0, errors: [] };

    // Build tapdId → localId mapping for parent-child resolution
    const tapdIdToLocalId = new Map<string, number>();

    // Pre-load existing tapdId mappings
    const existingTasks = await db.tasks.filter(t => !!t.tapdId).toArray();
    const existingTaskByTapdId = new Map<string, Task>();
    for (const t of existingTasks) {
      if (t.tapdId && t.id) {
        tapdIdToLocalId.set(t.tapdId, t.id);
        existingTaskByTapdId.set(t.tapdId, t);
      }
    }

    // Pre-load all local tasks for fuzzy matching
    const allProjectTasks = await db.tasks.where('projectId').equals(projectId).toArray();

    // Pre-load resources for owner matching
    const allResources = await db.resources.toArray();

    // Load TAPD config to get workspaceId for building external URLs
    const tapdConfig = await (db as any).tapdConfigs.toCollection().first();
    const workspaceId = tapdConfig?.workspaceId || '';

    // Track rows with parent relationships for second pass
    const rowsWithParent: { localId: number; parentTapdId: string }[] = [];

    for (const row of selectedRows) {
      result.total++;
      try {
        if (!row.title?.trim()) {
          result.skipped++;
          continue;
        }

        // Skip rows that user confirmed as duplicates (already marked in preview)
        if (row.duplicateInfo && row.duplicateInfo.similarity >= 90 && row.existsLocally && row.localTaskId) {
          // Auto-link tapdId to existing task if not already linked
          if (row.tapdId) {
            await db.tasks.update(row.localTaskId, {
              tapdId: row.tapdId,
              syncSource: 'tapd-import',
              syncedAt: Date.now(),
              updatedAt: Date.now(),
            });
            tapdIdToLocalId.set(row.tapdId, row.localTaskId);
          }
          if (row.parentTapdId) {
            rowsWithParent.push({ localId: row.localTaskId, parentTapdId: row.parentTapdId });
          }
          result.updated++;
          continue;
        }

        // Match owner to local resources
        const matchedAssigneeIds: number[] = [];
        if (row.owner) {
          const ownerNames = row.owner.split(/[;；,，]/).map(n => n.trim()).filter(Boolean);
          for (const name of ownerNames) {
            const exact = allResources.find(r => r.name === name);
            if (exact?.id) {
              matchedAssigneeIds.push(exact.id);
            } else {
              const partial = allResources.find(r => r.name.includes(name) || name.includes(r.name));
              if (partial?.id) matchedAssigneeIds.push(partial.id);
            }
          }
        }

        const taskData: Partial<Task> = {
          title: row.title,
          description: row.description,
          status: row.status,
          priority: row.priority,
          // Leave dates undefined when no schedule info (don't fill with current date)
          startDate: row.startDate ? new Date(row.startDate) : undefined,
          endDate: row.endDate ? new Date(row.endDate) : undefined,
          progress: row.progress,
          assigneeIds: matchedAssigneeIds.length > 0 ? matchedAssigneeIds : [],
          tapdId: row.tapdId || undefined,
          module: row.module,
          estimatedHours: row.estimatedHours,
          // Build TAPD external URL for direct navigation
          externalUrl: workspaceId && row.tapdId
            ? `https://tapd.woa.com/${workspaceId}/prong/stories/view/${row.tapdId}`
            : undefined,
        };

        // Enhanced dedup: first by tapdId, then exact title, then fuzzy title
        let existingId: number | undefined;

        if (taskData.tapdId) {
          const byTapdId = await db.tasks.where('tapdId').equals(taskData.tapdId).first();
          if (byTapdId?.id) existingId = byTapdId.id;
        }

        if (!existingId) {
          // Exact title match
          const byTitle = allProjectTasks.find(
            t => t.title.trim().toLowerCase() === row.title.trim().toLowerCase()
          );
          if (byTitle?.id) existingId = byTitle.id;
        }

        if (!existingId) {
          // Fuzzy title match (≥80% similarity)
          const titleLower = row.title.trim().toLowerCase();
          for (const t of allProjectTasks) {
            if (!t.title) continue;
            const similarity = TapdImportService.calculateSimilarity(titleLower, t.title.trim().toLowerCase());
            if (similarity >= 80) {
              existingId = t.id;
              break;
            }
          }
        }

        if (existingId) {
          await db.tasks.update(existingId, {
            title: taskData.title,
            description: taskData.description,
            status: taskData.status,
            priority: taskData.priority,
            startDate: taskData.startDate,
            endDate: taskData.endDate,
            progress: taskData.progress,
            assigneeIds: matchedAssigneeIds.length > 0 ? matchedAssigneeIds : undefined,
            tapdId: taskData.tapdId || undefined,
            module: taskData.module,
            estimatedHours: taskData.estimatedHours,
            updatedAt: Date.now(),
            syncedAt: Date.now(),
            syncSource: 'tapd-import',
          });
          if (row.tapdId) tapdIdToLocalId.set(row.tapdId, existingId);
          if (row.parentTapdId) rowsWithParent.push({ localId: existingId, parentTapdId: row.parentTapdId });
          result.updated++;
        } else {
          const newId = await db.tasks.add({
            ...taskData,
            projectId,
            dependencies: [],
            type: 'task',
            updatedAt: Date.now(),
            syncedAt: Date.now(),
            syncSource: 'tapd-import',
          } as Task);
          if (row.tapdId) tapdIdToLocalId.set(row.tapdId, newId as number);
          if (row.parentTapdId) rowsWithParent.push({ localId: newId as number, parentTapdId: row.parentTapdId });
          result.inserted++;
        }
      } catch (err: any) {
        result.errors.push(`"${row.title}": ${err.message || '导入失败'}`);
      }
    }

    // Second pass: resolve parent-child relationships
    for (const { localId, parentTapdId } of rowsWithParent) {
      if (parentTapdId && parentTapdId !== '0') {
        const parentLocalId = tapdIdToLocalId.get(parentTapdId);
        if (parentLocalId) {
          await db.tasks.update(localId, { parentId: parentLocalId });
        }
      }
    }

    return result;
  }

  /** Parse CSV text and import into local DB */
  private static async parseAndImportCSV(csvText: string, projectId: number): Promise<ImportResult> {
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, total: 0, errors: [] };

    // Split lines and handle potential BOM
    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      result.errors.push('文件为空或只有表头');
      return result;
    }

    // Parse header row
    const headers = TapdImportService.parseCSVLine(lines[0]);
    const headerMap = TapdImportService.buildHeaderMap(headers);

    if (!headerMap.title) {
      result.errors.push('未找到标题/需求名称列，请确认文件来自 TAPD 导出');
      return result;
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      result.total++;
      try {
        const cols = TapdImportService.parseCSVLine(lines[i]);
        const task = TapdImportService.mapRowToTask(cols, headerMap, projectId);

        if (!task.title?.trim()) {
          result.skipped++;
          continue;
        }

        // Build TAPD external URL if tapdId is available
        const tapdConfig2 = await (db as any).tapdConfigs.toCollection().first();
        const wsId = tapdConfig2?.workspaceId || '';
        const externalUrl = wsId && task.tapdId
          ? `https://tapd.woa.com/${wsId}/prong/stories/view/${task.tapdId}`
          : undefined;

        // Upsert by tapdId if available, then fallback to title matching
        let existingId: number | undefined;
        if (task.tapdId) {
          const byTapdId = await db.tasks.where('tapdId').equals(task.tapdId).first();
          if (byTapdId?.id) existingId = byTapdId.id;
        }
        // Fallback: match by title + projectId when no tapdId match
        if (!existingId && task.title) {
          const allProjectTasks = await db.tasks.where('projectId').equals(projectId).toArray();
          const byTitle = allProjectTasks.find(
            t => t.title.trim().toLowerCase() === task.title!.trim().toLowerCase()
          );
          if (byTitle?.id) existingId = byTitle.id;
        }

        if (existingId) {
            await db.tasks.update(existingId, {
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              startDate: task.startDate,
              endDate: task.endDate,
              progress: task.progress,
              tapdId: task.tapdId || undefined,
              externalUrl,
              updatedAt: Date.now(),
              syncedAt: Date.now(),
              syncSource: 'tapd-import',
            });
            result.updated++;
            continue;
        }

        // Insert new task
        await db.tasks.add({
          ...task,
          projectId,
          dependencies: [],
          type: 'task',
          externalUrl,
          updatedAt: Date.now(),
          syncedAt: Date.now(),
          syncSource: 'tapd-import',
        } as Task);
        result.inserted++;
      } catch (err: any) {
        result.errors.push(`第 ${i + 1} 行: ${err.message || '解析失败'}`);
      }
    }

    return result;
  }

  /** Parse a single CSV line respecting quoted fields */
  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  /** Build a mapping from semantic field names to column indices */
  private static buildHeaderMap(headers: string[]): Record<string, number | null> {
    const map: Record<string, number | null> = {
      id: null,
      title: null,
      description: null,
      status: null,
      priority: null,
      owner: null,
      startDate: null,
      endDate: null,
      progress: null,
      parentId: null,
      module: null,
      estimatedHours: null,
    };

    const patterns: Record<string, RegExp> = {
      id: /^(ID|编号|需求ID|任务ID|id)$/i,
      title: /^(标题|需求名称|任务名称|名称|name|title)$/i,
      description: /^(描述|详细描述|说明|description|content)$/i,
      status: /^(状态|当前状态|status)$/i,
      priority: /^(优先级|priority)$/i,
      owner: /^(处理人|负责人|当前处理人|经办人|owner|assignee)$/i,
      startDate: /^(开始时间|开始日期|预计开始|begin|start)$/i,
      endDate: /^(结束时间|结束日期|预计结束|截止时间|due|end)$/i,
      progress: /^(进度|完成度|progress)$/i,
      parentId: /^(父需求|父任务|父需求ID|parent_id|parent|parentId)$/i,
      module: /^(模块|分类|需求分类|类别|module|category)$/i,
      estimatedHours: /^(预估工时|预计工时|工时|工作量|effort|hours?)$/i,
    };

    headers.forEach((h, idx) => {
      const cleaned = h.replace(/["\s]/g, '');
      for (const [key, regex] of Object.entries(patterns)) {
        if (regex.test(cleaned) && map[key] === null) {
          map[key] = idx;
        }
      }
    });

    return map;
  }

  /** Map a CSV row to a partial Task object */
  private static mapRowToTask(
    cols: string[],
    headerMap: Record<string, number | null>,
    _projectId: number
  ): Partial<Task> {
    const get = (key: string): string => {
      const idx = headerMap[key];
      return idx !== null && idx < cols.length ? cols[idx].trim() : '';
    };

    const statusStr = get('status');
    const status = TapdImportService.mapImportStatus(statusStr);
    const progress = get('progress')
      ? parseInt(get('progress').replace('%', ''), 10)
      : (status === 'done' ? 100 : status === 'in_progress' ? 50 : 0);

    const startStr = get('startDate');
    const endStr = get('endDate');

    return {
      title: get('title'),
      description: get('description'),
      status,
      priority: TapdImportService.mapImportPriority(get('priority')),
      // Leave dates undefined when no schedule info (don't fill with current date)
      startDate: startStr ? new Date(startStr) : undefined,
      endDate: endStr ? new Date(endStr) : undefined,
      progress: isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress)),
      assigneeIds: [],
      tapdId: get('id') || undefined,
      module: get('module') || undefined,
      estimatedHours: get('estimatedHours') ? Number.parseFloat(get('estimatedHours').replace(/[^\d.]/g, '')) : undefined,
    };
  }

  /** Map Chinese status strings from TAPD export */
  private static mapImportStatus(status: string): Task['status'] {
    return mapTapdStatus(status);
  }

  /** Map Chinese priority strings from TAPD export */
  private static mapImportPriority(priority: string): Task['priority'] {
    return mapTapdPriority(priority);
  }
}
