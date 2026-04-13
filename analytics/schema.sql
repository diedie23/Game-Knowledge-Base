-- =====================================================
--  APM 知识库访客统计 — D1 数据库表结构
--  执行: wrangler d1 execute apm-analytics --file=./schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS visits (
  id          TEXT PRIMARY KEY,
  page_path   TEXT NOT NULL,
  page_title  TEXT DEFAULT '',
  referrer    TEXT DEFAULT '',
  ip          TEXT DEFAULT 'unknown',
  country     TEXT DEFAULT 'unknown',
  city        TEXT DEFAULT 'unknown',
  region      TEXT DEFAULT 'unknown',
  browser     TEXT DEFAULT 'unknown',
  device      TEXT DEFAULT 'unknown',
  user_agent  TEXT DEFAULT '',
  visit_time  TEXT NOT NULL,
  duration    INTEGER DEFAULT 0
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_visits_time ON visits(visit_time);
CREATE INDEX IF NOT EXISTS idx_visits_path ON visits(page_path);
CREATE INDEX IF NOT EXISTS idx_visits_ip   ON visits(ip);
