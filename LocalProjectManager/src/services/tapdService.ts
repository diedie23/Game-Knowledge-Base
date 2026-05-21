import { db } from '../db/db';
import type { Task, TapdConfig, TapdWorkspaceInfo, TapdStory, TapdIteration, SyncResult, SyncDetailItem, ImportResult, DuplicateCandidate, RefreshResult, RefreshDetailItem } from '../types';
import type { TapdAuthMode, ModuleMapping } from '../types/tapd';

// Re-export for consumers
export type { SyncResult, ImportResult, DuplicateCandidate, RefreshResult, RefreshDetailItem };

// ─── MCP Proxy Configuration ─────────────────────────────────────
const MCP_BASE_URL = import.meta.env.VITE_MCP_BASE_URL || 'http://localhost:3100';
const REQUEST_TIMEOUT_MS = 10_000;
const MCP_GATEWAY_TIMEOUT_MS = 20_000;

// ─── TAPD REST API Configuration ─────────────────────────────────
const TAPD_API_BASE = '/tapd-api'; // Uses Vite proxy

// ─── MCP Gateway Configuration (streamable-http) ─────────────────
const MCP_GATEWAY_PROXY = '/mcp-gateway'; // Uses Vite proxy → https://mcpgw.knot.woa.com/tapd/

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
  ): Promise<{ success: true; workspaceName: string; previewStories?: any[] } | { success: false; error: string }> {
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
          const previewLimit = syncRange?.limit || 200;
          const previewParams: Record<string, unknown> = { workspace_id: workspaceId.trim(), limit: previewLimit, fields: 'id,name,owner,status,created,modified,custom_field_one,custom_field_two,category_id,parent_id,children_id,release_id,iteration_id,priority,description' };
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
            // because all filters now use OR logic on client-side
            const hasClientFilters = (syncRange.categoryKeywords && syncRange.categoryKeywords.length > 0) || 
              (syncRange.moduleFeatureFilter && syncRange.moduleFeatureFilter.length > 0);
            if (syncRange.ownerFilter && syncRange.ownerFilter.length > 0 && syncRange.ownerFilterMode !== 'client' && !hasClientFilters) {
              previewParams.owner = syncRange.ownerFilter.join(';');
            }
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

          // Apply category keyword filter + module feature filter (client-side)
          // Apply combined filter: keyword, module, and owner use OR (union) logic
          // A story passes if it matches ANY of the configured filters
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

              // OR logic: pass if matches ANY of the active filters
              return keywordMatch || moduleMatch || ownerMatch;
            });

            count = previewStories.length;
            const keywordInfo = keywords.length > 0 ? `keywords: ${keywords.join(', ')}` : '';
            const moduleInfo = moduleFilters.length > 0 ? `modules: ${moduleFilters.join(', ')}` : '';
            const ownerInfo = ownerFilters.length > 0 ? `owners: ${ownerFilters.join(', ')}` : '';
            const filterDesc = [keywordInfo, moduleInfo, ownerInfo].filter(Boolean).join(' | ');
            console.log(`[TAPD] Combined filter (OR logic) in preview: ${beforeCount} → ${count} stories (${filterDesc})`);
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
                  { workspace_id: workspaceId.trim(), id: Array.from(missingParentIds).join(','), fields: 'id,name,owner,status,created,modified,custom_field_one,custom_field_two,category_id,parent_id,children_id,release_id,iteration_id,priority,description' },
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
          authHeader: `Basic ${btoa(unescape(encodeURIComponent(`${tempConfig.apiUser || ''}:${tempConfig.apiToken || tempConfig.apiPassword || ''}`)))}`,
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

        // Step 2: Verify workspace access by fetching stories count
        try {
          const data = await tapdRestFetch<{ status: number; data: { count: number }; info: string }>(
            '/stories/count',
            tempConfig,
            { workspace_id: workspaceId.trim() }
          );
          console.log('[TAPD] stories/count response:', data);

          if (data?.status === 1) {
            return {
              success: true,
              workspaceName: `已连接 (ID: ${workspaceId.trim()}, ${data.data?.count ?? 0} 个需求)`,
            };
          } else {
            // Auth succeeded but workspace access failed
            return {
              success: true,
              workspaceName: `已认证 (ID: ${workspaceId.trim()})`,
            };
          }
        } catch (wsError: any) {
          // Auth succeeded but workspace query failed - still consider it a success
          console.warn('[TAPD] workspace query failed but auth ok:', wsError);
          return {
            success: true,
            workspaceName: `已认证 (ID: ${workspaceId.trim()})`,
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
      const limit = syncRange?.limit || 200;
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
        // Owner filter (server-side) — skip when keyword or module filter is active
        // because all filters now use OR logic on client-side
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
          { workspace_id: workspaceId.trim(), limit, fields: 'id,name,owner,status,created,modified,custom_field_one,custom_field_two,category_id,parent_id,children_id,release_id,iteration_id,priority,description,begin,due', ...extraParams },
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
        const restParams: Record<string, string> = {
          workspace_id: workspaceId.trim(),
          limit: String(limit),
        };
        if (extraParams.modified) restParams.modified = String(extraParams.modified);
        if (extraParams.status) restParams.status = String(extraParams.status);
        if (extraParams.owner) restParams.owner = String(extraParams.owner);

        const data = await tapdRestFetch<{ status: number; data: any; info: string }>(
          '/stories',
          this.config!,
          restParams
        );
        console.log('[TapdService] REST API response status:', data?.status, 'data type:', typeof data?.data, 'is array:', Array.isArray(data?.data));
        
        if (data?.status !== 1) {
          throw new Error(data?.info || `TAPD API 返回错误状态: ${data?.status}`);
        }
        stories = data?.data || [];
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

      console.log('[TapdService] Fetched', stories.length, 'stories');
      if (stories.length > 0) {
        console.log('[TapdService] First story structure:', JSON.stringify(stories[0]).substring(0, 300));
      }

      // Apply combined filter: keyword, module, and owner use OR (union) logic
      // A story passes if it matches ANY of the configured filters
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

          // OR logic: pass if matches ANY of the active filters
          return keywordMatch || moduleMatch || ownerMatch;
        });

        const keywordInfo = keywords.length > 0 ? `keywords: ${keywords.join(', ')}` : '';
        const moduleInfo = moduleFilters.length > 0 ? `modules: ${moduleFilters.join(', ')}` : '';
        const ownerInfo = ownerFilters.length > 0 ? `owners: ${ownerFilters.join(', ')}` : '';
        const filterDesc = [keywordInfo, moduleInfo, ownerInfo].filter(Boolean).join(' | ');
        console.log(`[TapdService] Combined filter (OR logic): ${beforeCount} → ${stories.length} stories (${filterDesc})`);
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
              { workspace_id: workspaceId, id: parentIds, fields: 'id,name,owner,status,created,modified,custom_field_one,custom_field_two,category_id,parent_id,children_id,release_id,iteration_id,priority,description,begin,due' },
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
              { workspace_id: workspaceId, id: parentIds }
            );
            if (data?.status === 1 && data?.data) {
              parentStories = Array.isArray(data.data) ? data.data : [data.data];
            }
          } else {
            const data = await mcpFetch<{ data: any[] }>(
              '/tapd/stories_get',
              { workspace_id: workspaceId, id: parentIds }
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
        tapdUpdates.begin = new Date(updates.startDate).toISOString().split('T')[0];
      }
      if (updates.endDate !== undefined) {
        tapdUpdates.due = new Date(updates.endDate).toISOString().split('T')[0];
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
  private mapStatus(tapdStatus: string): 'todo' | 'in_progress' | 'done' {
    const statusMap: Record<string, 'todo' | 'in_progress' | 'done'> = {
      'planning': 'todo',
      'open': 'todo',
      'new': 'todo',
      'developing': 'in_progress',
      'progressing': 'in_progress',
      'testing': 'in_progress',
      'implemented': 'in_progress',
      'resolved': 'done',
      'closed': 'done',
      'done': 'done',
      'rejected': 'done',
      // Art stories: "验收中" should be treated as completed
      'auditing': 'done',
      'in_review': 'done',
      'accepted': 'done',
      'accepting': 'done',
      'verified': 'done',
      'delivered': 'done',
      // "无需合入" means no merge needed, treat as done
      '无需合入': 'done',
      'no_merge': 'done',
      'no_merge_needed': 'done',
      'not_required': 'done',
    };

    const mapped = statusMap[tapdStatus?.toLowerCase()];
    if (mapped) return mapped;

    // Fallback: check if the status string contains Chinese keywords indicating completion
    const lowerStatus = (tapdStatus || '').toLowerCase();
    if (lowerStatus.includes('验收') || lowerStatus.includes('已完成') || lowerStatus.includes('已关闭') || lowerStatus.includes('已解决') || lowerStatus.includes('无需合入') || lowerStatus.includes('无需')) {
      return 'done';
    }
    if (lowerStatus.includes('开发') || lowerStatus.includes('进行') || lowerStatus.includes('处理')) {
      return 'in_progress';
    }

    return 'todo';
  }

  /** Map TAPD priority string to local priority */
  private mapPriority(tapdPriority: string): 'low' | 'medium' | 'high' {
    const priorityMap: Record<string, 'low' | 'medium' | 'high'> = {
      'nice to have': 'low',
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'urgent': 'high',
    };
    return priorityMap[tapdPriority?.toLowerCase()] || 'medium';
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
    const status = this.mapStatus(story.status);
    const progress =
      status === 'done' ? 100 :
      status === 'in_progress' ? (story.progress ? parseInt(story.progress, 10) : 50) :
      0;

    // Build TAPD external URL for direct navigation
    const workspaceId = this.config?.workspaceId || '';
    const externalUrl = workspaceId && story.id
      ? `https://tapd.woa.com/${workspaceId}/prong/stories/view/${story.id}`
      : undefined;

    // Extract module name from custom_field_one or title bracket tags
    const module = this.extractModule(story.name, story.custom_field_one);

    return {
      title: story.name,
      description: story.description || '',
      status,
      priority: this.mapPriority(story.priority),
      // Leave dates undefined when no schedule info (don't fill with current date)
      startDate: story.begin ? new Date(story.begin) : undefined,
      endDate: story.due ? new Date(story.due) : undefined,
      progress,
      type: 'task',
      dependencies: [],
      assigneeIds: [],
      tapdId: story.id,
      externalUrl,
      module,
      syncSource: 'tapd',
      updatedAt: Date.now(),
      // Extended metadata (stripped before DB insert)
      _tapdParentId: story.parent_id || undefined,
      _tapdOwner: story.owner || undefined,
      _tapdModuleFeature: story.custom_field_one || undefined,
    } as any;
  }

  /**
   * Extract module name from TAPD story data.
   * Priority: custom_field_one (模块特性) > title bracket tags (【xxx】)
   * Extracts the top-level module name (before '/') from custom_field_one.
   */
  private extractModule(title: string, customFieldOne?: string): string | undefined {
    // 1. Try custom_field_one (e.g. "轻舟编辑器/主体" → "轻舟编辑器")
    if (customFieldOne) {
      const topLevel = customFieldOne.split('/')[0].trim();
      if (topLevel) return topLevel;
    }

    // 2. Use the shared extractModuleFromTitle function for title-based extraction
    return extractModuleFromTitle(title);
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
  private async matchOwnerToResources(ownerStr: string): Promise<number[]> {
    if (!ownerStr || !ownerStr.trim()) return [];
    
    const ownerNames = ownerStr.split(/[;；,，]/).map(n => n.trim()).filter(Boolean);
    if (ownerNames.length === 0) return [];
    
    const allResources = await db.resources.toArray();
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

  /**
   * Convert resource IDs to display names.
   */
  private async getResourceNamesByIds(ids: number[]): Promise<string> {
    if (!ids || ids.length === 0) return '未分配';
    const allResources = await db.resources.toArray();
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
            tapdStartDate: remote.startDate ? new Date(remote.startDate).toISOString().slice(0, 10) : undefined,
            tapdEndDate: remote.endDate ? new Date(remote.endDate).toISOString().slice(0, 10) : undefined,
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
      remoteTasks = remoteTasks.filter(t => t.tapdId && selectedStoryIds.has(t.tapdId));
      console.log(`[TapdService] Filtered by selectedStoryIds: ${beforeCount} → ${remoteTasks.length} tasks`);
    }
    const moduleMappings = config.syncRange?.moduleMappings;
    let inserted = 0;
    let updated = 0;
    let merged = 0;
    const details: SyncDetailItem[] = [];

    // Phase 1: Build tapdId → localId mapping for parent-child resolution
    const tapdIdToLocalId = new Map<string, number>();
    
    // Pre-load existing tapdId mappings
    const existingTasks = await db.tasks.filter(t => !!t.tapdId).toArray();
    for (const t of existingTasks) {
      if (t.tapdId && t.id) tapdIdToLocalId.set(t.tapdId, t.id);
    }

    // Pre-load all local tasks for title matching
    const allLocalTasks = await db.tasks.where('projectId').equals(projectId).toArray();
    const manualTasksByTitle = new Map<string, number>();
    for (const t of allLocalTasks) {
      if (!t.tapdId && t.title) {
        manualTasksByTitle.set(t.title.trim().toLowerCase(), t.id!);
      }
    }

    // Phase 2: Insert/Update tasks (first pass - without parent relationships)
    const tasksWithParent: { localId: number; tapdParentId: string }[] = [];

    for (const remoteTask of remoteTasks) {
      const tapdId = remoteTask.tapdId;
      if (!tapdId) continue;

      const tapdParentId = (remoteTask as any)._tapdParentId as string | undefined;
      const tapdOwner = (remoteTask as any)._tapdOwner as string | undefined;

      // Clean extended metadata before DB operations
      const cleanTask = { ...remoteTask };
      delete (cleanTask as any)._tapdParentId;
      delete (cleanTask as any)._tapdOwner;
      delete (cleanTask as any)._tapdModuleFeature;

      // Auto-match owner to local resources
      if (tapdOwner) {
        const matchedIds = await this.matchOwnerToResources(tapdOwner);
        if (matchedIds.length > 0) {
          cleanTask.assigneeIds = matchedIds;
        }
      }

      // Resolve target project based on module mappings
      const targetProjectId = await this.resolveTargetProject(
        cleanTask.title || '',
        projectId,
        moduleMappings
      );

      // Look up existing task by tapdId
      const existing = await db.tasks
        .where('tapdId')
        .equals(tapdId)
        .first();

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
        if (tapdParentId) tasksWithParent.push({ localId: existing.id, tapdParentId });
        details.push({ title: cleanTask.title || '', tapdId, action: 'updated', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
        updated++;
      } else {
        // Check merge decisions (user-confirmed dedup)
        if (mergeDecisions?.has(tapdId)) {
          const decision = mergeDecisions.get(tapdId)!;
          if (decision === 'skip') {
            details.push({ title: cleanTask.title || '', tapdId, action: 'skipped', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
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
            assigneeIds: cleanTask.assigneeIds && cleanTask.assigneeIds.length > 0
              ? cleanTask.assigneeIds
              : undefined,
            projectId: targetProjectId,
          });
          tapdIdToLocalId.set(tapdId, decision);
          if (tapdParentId) tasksWithParent.push({ localId: decision, tapdParentId });
          details.push({ title: cleanTask.title || '', tapdId, action: 'merged', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
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
            assigneeIds: cleanTask.assigneeIds && cleanTask.assigneeIds.length > 0
              ? cleanTask.assigneeIds
              : undefined,
            projectId: targetProjectId,
          });
          tapdIdToLocalId.set(tapdId, matchedLocalId);
          if (tapdParentId) tasksWithParent.push({ localId: matchedLocalId, tapdParentId });
          details.push({ title: cleanTask.title || '', tapdId, action: 'merged', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
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
        if (tapdParentId) tasksWithParent.push({ localId: newId as number, tapdParentId });
        details.push({ title: cleanTask.title || '', tapdId, action: 'inserted', owner: tapdOwner, externalUrl: cleanTask.externalUrl });
        inserted++;
      }
    }

    // Phase 3: Resolve parent-child relationships
    for (const { localId, tapdParentId } of tasksWithParent) {
      if (tapdParentId && tapdParentId !== '0') {
        const parentLocalId = tapdIdToLocalId.get(tapdParentId);
        if (parentLocalId) {
          await db.tasks.update(localId, { parentId: parentLocalId });
        }
      }
    }

    console.log(`[TapdService] Sync complete: ${inserted} inserted, ${updated} updated, ${merged} merged, ${tasksWithParent.length} parent relationships resolved`);

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
  async refreshExistingTasks(projectId: number): Promise<RefreshResult> {
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

    // Batch fetch all linked tasks by ID (max ~50 per request for API stability)
    const batchSize = 50;
    for (let i = 0; i < allTapdIds.length; i += batchSize) {
      const batchIds = allTapdIds.slice(i, i + batchSize);
      try {
        let stories: any[] = [];

        // Query each workspace (task may belong to different workspaces)
        for (const wsId of workspaceIds) {
          if (this.hasMcpGatewayCredentials()) {
            const data = await mcpGatewayFetch<{ status?: number; data?: any; count?: number }>(
              'stories_get',
              { workspace_id: wsId, id: batchIds.join(','), fields: 'id,name,owner,status,created,modified,custom_field_one,custom_field_two,category_id,parent_id,children_id,release_id,iteration_id,priority,description,begin,due' },
              config.mcpAccessToken!
            );
            if (Array.isArray(data)) {
              stories.push(...data);
            } else if (data?.data && Array.isArray(data.data)) {
              stories.push(...data.data);
            } else if (data?.data) {
              stories.push(data.data);
            }
          } else if (this.hasRestCredentials()) {
            const data = await tapdRestFetch<{ status: number; data: any; info: string }>(
              '/stories',
              config,
              { workspace_id: wsId, id: batchIds.join(',') }
            );
            if (data?.status === 1 && data?.data) {
              const fetched = Array.isArray(data.data) ? data.data : [data.data];
              stories.push(...fetched);
            }
          } else {
            const data = await mcpFetch<{ data: any[] }>(
              '/tapd/stories_get',
              { workspace_id: wsId, id: batchIds.join(',') }
            );
            if (data?.data) stories.push(...data.data);
          }
        }

        // Map fetched stories into remoteMap
        for (const item of stories) {
          const story = item?.Story || item;
          if (story?.id) {
            const mapped = this.mapTapdStoryToTask(story);
            remoteMap.set(story.id, mapped as any);
            (mapped as any)._tapdOwner = story.owner || undefined;
          }
        }
        console.log(`[TapdService] Fetched ${stories.length} stories by ID (batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allTapdIds.length / batchSize)})`);
      } catch (err) {
        console.warn(`[TapdService] Failed to fetch stories by ID batch:`, err);
      }
    }

    console.log(`[TapdService] Direct ID fetch complete: ${remoteMap.size}/${allTapdIds.length} tasks retrieved from TAPD`);

    // --- Phase 2: Refresh all linked tasks (including newly bound ones) ---
    // Pre-compute parent task IDs (tasks that have children) to skip date comparison for them
    const parentTaskIds = new Set<number>();
    for (const t of allLocalTasks) {
      if (t.parentId) parentTaskIds.add(t.parentId);
    }

    for (const localTask of linkedTasks) {
      // Skip newly bound tasks (already processed in Phase 1)
      if (details.some(d => d.tapdId === localTask.tapdId)) continue;

      const tapdId = localTask.tapdId!;
      const remote = remoteMap.get(tapdId);

      if (!remote) {
        // Task truly not found in TAPD (may have been deleted)
        failedCount++;
        continue;
      }

      // Check if this task is a parent task (has children locally)
      const isParentTask = localTask.id != null && parentTaskIds.has(localTask.id);

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

      // Compare startDate (skip for parent tasks whose dates are auto-calculated from children)
      if (!isParentTask) {
        const localStart = localTask.startDate ? new Date(localTask.startDate).toISOString().slice(0, 10) : '';
        const remoteStart = remote.startDate ? new Date(remote.startDate).toISOString().slice(0, 10) : '';
        if (localStart !== remoteStart) {
          changes.push({
            field: 'startDate',
            oldValue: localStart || '未设置',
            newValue: remoteStart || '未设置',
          });
        }
      }

      // Compare endDate (skip for parent tasks whose dates are auto-calculated from children)
      if (!isParentTask) {
        const localEnd = localTask.endDate ? new Date(localTask.endDate).toISOString().slice(0, 10) : '';
        const remoteEnd = remote.endDate ? new Date(remote.endDate).toISOString().slice(0, 10) : '';
        if (localEnd !== remoteEnd) {
          changes.push({
            field: 'endDate',
            oldValue: localEnd || '未设置',
            newValue: remoteEnd || '未设置',
          });
        }
      }

      // Compare priority
      if (remote.priority && remote.priority !== localTask.priority) {
        changes.push({
          field: 'priority',
          oldValue: localTask.priority || 'medium',
          newValue: remote.priority,
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

      // Compare assignee (via owner matching)
      const tapdOwner = (remote as any)._tapdOwner as string | undefined;
      let resolvedAssigneeIds: number[] | null = null;
      if (tapdOwner) {
        const matchedIds = await this.matchOwnerToResources(tapdOwner);
        if (matchedIds.length > 0) {
          // Filter out NaN values from local assigneeIds before comparison
          const validLocalIds = (localTask.assigneeIds || []).filter(id => !isNaN(id));
          const localAssignees = validLocalIds.sort().join(',');
          const remoteAssignees = matchedIds.sort().join(',');
          if (localAssignees !== remoteAssignees) {
            const oldNames = await this.getResourceNamesByIds(validLocalIds);
            const newNames = await this.getResourceNamesByIds(matchedIds);
            changes.push({
              field: 'assignee',
              oldValue: oldNames,
              newValue: newNames,
            });
            resolvedAssigneeIds = matchedIds;
          }
        }
      }

      if (changes.length > 0) {
        // Apply updates to local DB
        const updateData: Partial<Task> = {
          updatedAt: Date.now(),
          syncedAt: Date.now(),
        };
        // Silently update module field if available (not tracked as a "change")
        if (remote.module) {
          updateData.module = remote.module;
        }
        for (const change of changes) {
          switch (change.field) {
            case 'status':
              updateData.status = change.newValue as Task['status'];
              break;
            case 'startDate':
              updateData.startDate = change.newValue === '未设置' ? null as any : new Date(change.newValue);
              break;
            case 'endDate':
              updateData.endDate = change.newValue === '未设置' ? null as any : new Date(change.newValue);
              break;
            case 'priority':
              updateData.priority = change.newValue as Task['priority'];
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
        details.push({
          title: localTask.title || '',
          tapdId,
          externalUrl: localTask.externalUrl,
          changes,
        });
      } else {
        // Silently fix corrupted data and update module even when no other changes detected
        const silentUpdates: Partial<Task> = {};
        if (remote.module && !localTask.module) {
          silentUpdates.module = remote.module;
        }
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
  status: 'todo' | 'in_progress' | 'done';
  statusRaw: string;
  priority: 'low' | 'medium' | 'high';
  priorityRaw: string;
  owner: string;
  startDate: string;
  endDate: string;
  progress: number;
  description: string;
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
    for (const t of existingTasks) {
      if (t.tapdId && t.id) tapdIdToLocalId.set(t.tapdId, t.id);
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
    };
  }

  /** Map Chinese status strings from TAPD export */
  private static mapImportStatus(status: string): 'todo' | 'in_progress' | 'done' {
    const s = status.toLowerCase();
    if (['已实现', '已关闭', '已完成', '已验证', '已拒绝', 'resolved', 'closed', 'done'].some(k => s.includes(k))) {
      return 'done';
    }
    if (['开发中', '实现中', '测试中', '进行中', '处理中', 'developing', 'testing', 'in_progress', 'progressing'].some(k => s.includes(k))) {
      return 'in_progress';
    }
    return 'todo';
  }

  /** Map Chinese priority strings from TAPD export */
  private static mapImportPriority(priority: string): 'low' | 'medium' | 'high' {
    const p = priority.toLowerCase();
    if (['紧急', '高', 'urgent', 'high'].some(k => p.includes(k))) return 'high';
    if (['中', 'medium', 'middle'].some(k => p.includes(k))) return 'medium';
    if (['低', 'low', 'nice'].some(k => p.includes(k))) return 'low';
    return 'medium';
  }
}