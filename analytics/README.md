# 📊 APM 知识库 — 访客统计系统

## 架构概览

```
┌─────────────────┐    POST /api/track     ┌──────────────────────┐
│  前端 (GitHub    │ ──────────────────────→ │  Cloudflare Worker   │
│  Pages)          │    POST /api/leave     │  (边缘计算节点)       │
│                  │ ──────────────────────→ │                      │
│  analytics.js    │                        │  worker.js           │
│  admin-stats.html│ ←────────────────────  │  ↕ D1 (SQLite)       │
└─────────────────┘    GET /api/admin/*     └──────────────────────┘
```

## 快速部署（5分钟）

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 D1 数据库

```bash
cd analytics
wrangler d1 create apm-analytics
```

输出中会包含 `database_id`，复制它。

### 3. 配置 wrangler.toml

打开 `analytics/wrangler.toml`，将 `YOUR_DATABASE_ID_HERE` 替换为实际的 database_id。

### 4. 初始化数据库表

```bash
wrangler d1 execute apm-analytics --file=./schema.sql
```

### 5. 设置管理员密码（推荐）

```bash
wrangler secret put ADMIN_PASSWORD
# 输入你的密码，回车确认
```

或者直接修改 `worker.js` 中的 `ADMIN_PASSWORD` 常量。

### 6. 部署 Worker

```bash
wrangler deploy
```

部署成功后会输出 Worker URL，类似：
```
https://apm-analytics.your-name.workers.dev
```

### 7. 配置前端 API 地址

打开以下两个文件，将 `YOUR_SUBDOMAIN` 替换为你的 Worker 地址：

- `docs/analytics.js` — 第 20 行 `API_BASE`
- `docs/admin-stats.html` — 约第 290 行 `API_BASE`

### 8. 推送更新

```bash
git add -A && git commit -m "feat: add analytics" && git push
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `analytics/worker.js` | Cloudflare Worker 后端代码 |
| `analytics/schema.sql` | D1 数据库表结构 |
| `analytics/wrangler.toml` | Worker 部署配置 |
| `docs/analytics.js` | 前端埋点采集脚本 |
| `docs/admin-stats.html` | 管理员统计看板 |

## 管理员入口

访问 `https://你的网站域名/admin-stats.html` → 输入密码 → 查看统计数据。

## API 端点

| 端点 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/track` | POST | 记录访问 | 无 |
| `/api/leave` | POST | 更新停留时间 | 无 |
| `/api/admin/login` | POST | 管理员登录 | 密码 |
| `/api/admin/stats` | GET | 统计概览 | JWT |
| `/api/admin/recent` | GET | 最近记录 | JWT |
| `/api/admin/top` | GET | 热门页面 Top 10 | JWT |

## 免费额度

Cloudflare Workers Free Plan:
- **请求**：每日 10 万次（足够中小站点）
- **D1 存储**：5GB / 500 万行/月读取
- **计算**：10ms CPU / 请求
- **无需信用卡**

## 隐私说明

- 不采集任何个人身份信息（PII）
- IP 地址由 Cloudflare 自动地理编码，不存储原始 IP 可选
- User-Agent 仅用于设备/浏览器分类
- 数据完全存储在你的 D1 数据库中，不发送给第三方
