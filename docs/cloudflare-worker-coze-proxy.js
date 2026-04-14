/**
 * Cloudflare Worker — Coze API CORS 代理
 * =======================================
 * 用途：解决前端直接调用 Coze API 的 CORS 跨域问题
 * 部署：复制此代码到 Cloudflare Workers 编辑器中
 * 
 * 部署步骤：
 * 1. 注册/登录 https://dash.cloudflare.com
 * 2. 左侧菜单 → Workers 和 Pages → 创建
 * 3. 选择 "创建 Worker" → 起个名字（如 coze-proxy）→ 部署
 * 4. 点击 "编辑代码"，粘贴此文件全部内容
 * 5. 点击 "保存并部署"
 * 6. 记下 Worker 的 URL（如 https://coze-proxy.your-name.workers.dev）
 * 7. 回到网站代码的 COZE_DEFAULT_CONFIG 中设置 proxyUrl 为这个地址
 * 
 * 免费额度：每天 100,000 次请求
 */

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

// CORS 响应头 — 允许所有来源
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function handleRequest(request, env) {
  // 1. 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' }
    });
  }

  // 2. 只允许 GET 和 POST
  if (request.method !== 'POST' && request.method !== 'GET') {
    return jsonResponse({ error: '仅支持 GET/POST 请求' }, 405);
  }

  try {
    // 3. 解析请求路径 → 转发到 api.coze.cn
    const url = new URL(request.url);
    const path = url.pathname;
    const search = url.search;
    const apiUrl = 'https://api.coze.cn' + path + search;

    // 4. 构建转发请求头
    const headers = new Headers();
    // 保留客户端的 Authorization 和 Content-Type
    for (const [key, value] of request.headers.entries()) {
      const k = key.toLowerCase();
      if (['authorization', 'content-type', 'accept'].includes(k)) {
        headers.set(key, value);
      }
    }

    // 5. 转发请求
    const fetchOptions = {
      method: request.method,
      headers: headers,
    };
    if (request.method === 'POST') {
      fetchOptions.body = await request.text();
    }

    const response = await fetch(apiUrl, fetchOptions);

    // 6. 返回响应（附加 CORS 头）
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    return jsonResponse({ error: 'Proxy error', message: error.message }, 500);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
