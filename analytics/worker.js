/**
 * =====================================================
 *  APM 知识库 — 访客统计 Cloudflare Worker
 *  功能：接收前端上报数据 + D1 存储 + 管理员查询 API
 * =====================================================
 *
 *  部署步骤：
 *  1. 安装 wrangler: npm install -g wrangler
 *  2. 登录: wrangler login
 *  3. 创建 D1 数据库: wrangler d1 create apm-analytics
 *  4. 复制数据库ID到 wrangler.toml
 *  5. 初始化表结构: wrangler d1 execute apm-analytics --file=./schema.sql
 *  6. 部署: wrangler deploy
 *
 *  API 端点：
 *  POST /api/track          — 前端上报访问记录
 *  POST /api/leave          — 前端上报离开（停留时间）
 *  POST /api/admin/login    — 管理员登录获取 token
 *  GET  /api/admin/stats    — 管理员获取统计数据
 *  GET  /api/admin/recent   — 管理员获取最近访问记录
 *  GET  /api/admin/top      — 管理员获取热门页面 Top 10
 */

// ═══ 管理员密码（部署时请修改！推荐使用 Wrangler Secrets）═══
const ADMIN_PASSWORD = 'apm-kb-2026';       // 请修改为你的密码
const JWT_SECRET     = 'apm-analytics-secret-key-change-me';  // JWT 签名密钥
const TOKEN_EXPIRE   = 24 * 60 * 60 * 1000; // Token 有效期 24 小时

// ═══ CORS 配置（允许你的 GitHub Pages 域名）═══
const ALLOWED_ORIGINS = [
  'https://diedie23.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null'  // 本地文件协议
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// ═══ 简易 JWT 实现（无外部依赖）═══
async function signJWT(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_EXPIRE }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${sigB64}`;
}

async function verifyJWT(token) {
  try {
    const [header, body, sig] = token.split('.');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBuf = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBuf, encoder.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ═══ IP 地理位置（Cloudflare 自带 cf 对象）═══
function getGeo(request) {
  const cf = request.cf || {};
  return {
    ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown',
    country: cf.country || 'unknown',
    city: cf.city || 'unknown',
    region: cf.region || 'unknown',
  };
}

// ═══ 主路由 ═══
export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── 前端上报：记录访问 ──
      if (path === '/api/track' && request.method === 'POST') {
        return handleTrack(request, env);
      }
      // ── 前端上报：更新停留时间 ──
      if (path === '/api/leave' && request.method === 'POST') {
        return handleLeave(request, env);
      }
      // ── 管理员登录 ──
      if (path === '/api/admin/login' && request.method === 'POST') {
        return handleLogin(request, env);
      }
      // ── 管理员查询接口（需鉴权）──
      if (path.startsWith('/api/admin/')) {
        return handleAdminAPI(request, env, path);
      }

      return jsonResp({ error: 'Not found' }, 404, request);
    } catch (e) {
      return jsonResp({ error: e.message }, 500, request);
    }
  }
};

// ═══ POST /api/track — 记录访问 ═══
async function handleTrack(request, env) {
  const data = await request.json();
  const geo = getGeo(request);
  const ua = request.headers.get('User-Agent') || '';

  // 解析 User-Agent 提取浏览器和设备信息
  const browser = parseBrowser(ua);
  const device = parseDevice(ua);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO visits (id, page_path, page_title, referrer, ip, country, city, region, browser, device, user_agent, visit_time, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind(
    id,
    data.path || '/',
    data.title || '',
    data.referrer || '',
    geo.ip,
    geo.country,
    geo.city,
    geo.region,
    browser,
    device,
    ua.substring(0, 500),
    now
  ).run();

  return jsonResp({ ok: true, id }, 200, request);
}

// ═══ POST /api/leave — 更新停留时间 ═══
async function handleLeave(request, env) {
  const data = await request.json();
  if (!data.id || !data.duration) {
    return jsonResp({ error: 'Missing id or duration' }, 400, request);
  }

  await env.DB.prepare(`
    UPDATE visits SET duration = ? WHERE id = ?
  `).bind(Math.min(data.duration, 7200), data.id).run(); // 最大 2 小时

  return jsonResp({ ok: true }, 200, request);
}

// ═══ POST /api/admin/login — 管理员登录 ═══
async function handleLogin(request, env) {
  const { password } = await request.json();

  // 使用环境变量中的密码（优先）或硬编码默认值
  const adminPwd = env.ADMIN_PASSWORD || ADMIN_PASSWORD;

  if (password !== adminPwd) {
    return jsonResp({ error: '密码错误' }, 401, request);
  }

  const token = await signJWT({ role: 'admin', iat: Date.now() });
  return jsonResp({ ok: true, token }, 200, request);
}

// ═══ 管理员 API 路由（需 JWT 鉴权）═══
async function handleAdminAPI(request, env, path) {
  // 验证 Token
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResp({ error: '未登录' }, 401, request);
  }
  const payload = await verifyJWT(auth.slice(7));
  if (!payload || payload.role !== 'admin') {
    return jsonResp({ error: 'Token 无效或已过期' }, 401, request);
  }

  const url = new URL(request.url);

  // GET /api/admin/stats — 统计概览
  if (path === '/api/admin/stats') {
    const days = parseInt(url.searchParams.get('days') || '30');
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [total, todayResult, uniqueIPs, avgDuration] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM visits WHERE visit_time >= ?').bind(since).first(),
      env.DB.prepare('SELECT COUNT(*) as count FROM visits WHERE visit_time >= ?').bind(new Date(new Date().setHours(0,0,0,0)).toISOString()).first(),
      env.DB.prepare('SELECT COUNT(DISTINCT ip) as count FROM visits WHERE visit_time >= ?').bind(since).first(),
      env.DB.prepare('SELECT AVG(duration) as avg FROM visits WHERE visit_time >= ? AND duration > 0').bind(since).first(),
    ]);

    // 每日访问量趋势（最近 N 天）
    const dailyTrend = await env.DB.prepare(`
      SELECT DATE(visit_time) as date, COUNT(*) as count
      FROM visits WHERE visit_time >= ?
      GROUP BY DATE(visit_time)
      ORDER BY date ASC
    `).bind(since).all();

    return jsonResp({
      total: total?.count || 0,
      today: todayResult?.count || 0,
      uniqueVisitors: uniqueIPs?.count || 0,
      avgDuration: Math.round(avgDuration?.avg || 0),
      dailyTrend: dailyTrend?.results || [],
    }, 200, request);
  }

  // GET /api/admin/top — 热门页面 Top 10
  if (path === '/api/admin/top') {
    const days = parseInt(url.searchParams.get('days') || '30');
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const topPages = await env.DB.prepare(`
      SELECT page_path, page_title, COUNT(*) as visits, ROUND(AVG(duration)) as avg_duration
      FROM visits WHERE visit_time >= ?
      GROUP BY page_path
      ORDER BY visits DESC
      LIMIT 10
    `).bind(since).all();

    return jsonResp({ pages: topPages?.results || [] }, 200, request);
  }

  // GET /api/admin/recent — 最近访问记录
  if (path === '/api/admin/recent') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const records = await env.DB.prepare(`
      SELECT id, page_path, page_title, ip, country, city, browser, device, visit_time, duration
      FROM visits
      ORDER BY visit_time DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const totalCount = await env.DB.prepare('SELECT COUNT(*) as count FROM visits').first();

    return jsonResp({
      records: records?.results || [],
      total: totalCount?.count || 0,
      limit,
      offset,
    }, 200, request);
  }

  return jsonResp({ error: 'Unknown admin endpoint' }, 404, request);
}

// ═══ 工具函数 ═══
function jsonResp(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

function parseBrowser(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/MSIE|Trident/.test(ua)) return 'IE';
  return 'Other';
}

function parseDevice(ua) {
  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) return 'Mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) return 'Tablet';
  return 'Desktop';
}
