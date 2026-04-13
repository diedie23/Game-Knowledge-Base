#!/usr/bin/env node
/**
 * ============================================================
 *  APM 知识库 — 全文搜索索引生成脚本
 *  遍历 docs/knowledge-base/ 下的 HTML 文件，
 *  剥离标签提取纯文本，生成 docs/search-index.json
 * ============================================================
 *
 *  用法:
 *    node build-search-index.js
 *
 *  输出:
 *    docs/search-index.json — 轻量级全文搜索索引
 *
 *  适用场景:
 *    - 本地手动执行
 *    - CI/CD 阶段自动生成
 *    - 发布前 npm script 调用
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ═══ 配置 ═══
const DOCS_DIR = path.join(__dirname, 'docs', 'knowledge-base');
const SIDEBAR_FILE = path.join(__dirname, 'docs', 'sidebar.json');
const INDEX_FILE = path.join(__dirname, 'docs', 'index.json');
const OUTPUT_FILE = path.join(__dirname, 'docs', 'search-index.json');

// 排除的文件（工具页面、模板页面等不需要全文索引）
const EXCLUDE_FILES = new Set([
  'index.html',
  'placeholder.html',
  'Blank_Template.html',
  'md-viewer.html',
  'editor-guide.html',
  'edge-worker.js',
  'editor-kit.js',
  'wand-worker.js'
]);

// ═══ HTML 标签剥离 ═══
function stripHtml(html) {
  // 移除 <script> 和 <style> 块
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // 移除 HTML 注释
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  // 移除所有 HTML 标签
  text = text.replace(/<[^>]+>/g, ' ');
  // 解码常见 HTML 实体
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&hellip;/g, '...');
  text = text.replace(/&#\d+;/g, ' ');
  text = text.replace(/&\w+;/g, ' ');
  // 合并多余空白
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// ═══ 提取 HTML <title> ═══
function extractTitle(html) {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match ? stripHtml(match[1]).trim() : '';
}

// ═══ 提取 <body> 中的正文 ═══
function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  return stripHtml(bodyHtml);
}

// ═══ 提取 H2/H3 标题列表（用于搜索结果定位）═══
function extractHeadings(html) {
  const headings = [];
  const regex = /<(h[23])[^>]*(?:id="([^"]*)")?[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const level = match[1].toLowerCase();
    const id = match[2] || '';
    const text = stripHtml(match[3]).trim();
    if (text) {
      headings.push({ level, id, text });
    }
  }
  return headings;
}

// ═══ 文本截取（生成摘要）═══
function generateExcerpt(text, maxLen = 200) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// ═══ 从 sidebar.json 构建 ID → 元数据 映射 ═══
function buildMetaMap() {
  const metaMap = {};

  // 从 sidebar.json 获取基础信息
  if (fs.existsSync(SIDEBAR_FILE)) {
    try {
      const sidebar = JSON.parse(fs.readFileSync(SIDEBAR_FILE, 'utf8'));
      if (sidebar.categories) {
        sidebar.categories.forEach(cat => {
          const catName = cat.name || '';
          const catId = cat.id || '';

          // 模块直属文档
          if (cat.items) {
            cat.items.forEach(item => {
              metaMap[item.id] = {
                title: item.title,
                file: item.file,
                category: catName,
                categoryId: catId,
                craft: item.craft || '',
                icon: item.icon || ''
              };
            });
          }

          // 分组下的文档
          if (cat.groups) {
            cat.groups.forEach(group => {
              if (group.items) {
                group.items.forEach(item => {
                  metaMap[item.id] = {
                    title: item.title,
                    file: item.file,
                    category: catName,
                    categoryId: catId,
                    group: group.name || '',
                    craft: item.craft || '',
                    icon: item.icon || ''
                  };
                });
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn('⚠️ 读取 sidebar.json 失败:', e.message);
    }
  }

  // 从 index.json 补充更多元数据
  if (fs.existsSync(INDEX_FILE)) {
    try {
      const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (indexData.items) {
        indexData.items.forEach(item => {
          if (metaMap[item.id]) {
            // 补充字段
            metaMap[item.id].module = item.module || '';
            metaMap[item.id].stage = item.applicable_stage || '';
            metaMap[item.id].priority = item.priority || '';
            metaMap[item.id].tags = item.tags || [];
            metaMap[item.id].desc = item.desc || '';
            metaMap[item.id].owner = item.owner || '';
          } else {
            metaMap[item.id] = {
              title: item.title,
              file: item.file || '',
              module: item.module || '',
              stage: item.applicable_stage || '',
              priority: item.priority || '',
              tags: item.tags || [],
              desc: item.desc || '',
              owner: item.owner || '',
              craft: item.craft || ''
            };
          }
        });
      }
    } catch (e) {
      console.warn('⚠️ 读取 index.json 失败:', e.message);
    }
  }

  return metaMap;
}

// ═══ 根据文件名反查文档 ID ═══
function fileToId(filePath, metaMap) {
  const relPath = 'knowledge-base/' + path.basename(filePath);
  for (const [id, meta] of Object.entries(metaMap)) {
    if (meta.file === relPath) return id;
  }
  // 降级：用文件名（去掉扩展名）作为 ID
  return path.basename(filePath, path.extname(filePath));
}

// ═══ 主流程 ═══
function main() {
  console.log('🔍 APM 知识库全文索引生成器');
  console.log('═'.repeat(50));

  if (!fs.existsSync(DOCS_DIR)) {
    console.error('❌ 文档目录不存在:', DOCS_DIR);
    process.exit(1);
  }

  // 构建元数据映射
  const metaMap = buildMetaMap();
  console.log(`📚 元数据已加载，共 ${Object.keys(metaMap).length} 篇文档`);

  // 扫描所有 HTML 文件
  const files = fs.readdirSync(DOCS_DIR).filter(f => {
    if (!f.endsWith('.html')) return false;
    if (EXCLUDE_FILES.has(f)) return false;
    return true;
  });

  // 同时扫描 art/ 子目录
  const artDir = path.join(DOCS_DIR, 'art');
  if (fs.existsSync(artDir)) {
    fs.readdirSync(artDir).filter(f => f.endsWith('.html')).forEach(f => {
      files.push('art/' + f);
    });
  }

  console.log(`📄 发现 ${files.length} 个 HTML 文档`);

  const indexEntries = [];
  let totalChars = 0;

  files.forEach(file => {
    const filePath = path.join(DOCS_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const docId = fileToId(filePath, metaMap);
    const meta = metaMap[docId] || {};

    // 提取正文纯文本
    const bodyText = extractBody(html);
    const title = meta.title || extractTitle(html) || path.basename(file, '.html');
    const headings = extractHeadings(html);
    const excerpt = meta.desc || generateExcerpt(bodyText);

    // 正文截断到 5000 字符（压缩索引体积）
    const content = bodyText.length > 5000
      ? bodyText.substring(0, 5000)
      : bodyText;

    totalChars += content.length;

    indexEntries.push({
      id: docId,
      title: title,
      content: content,
      excerpt: excerpt,
      headings: headings.slice(0, 20), // 最多保留 20 个标题
      module: meta.module || '',
      category: meta.category || '',
      stage: meta.stage || '',
      priority: meta.priority || '',
      craft: meta.craft || '',
      tags: meta.tags || [],
      icon: meta.icon || '',
      owner: meta.owner || ''
    });

    console.log(`  ✅ ${file} → ${docId} (${content.length} 字符, ${headings.length} 标题)`);
  });

  // 写入索引文件
  const output = {
    version: '1.0',
    buildTime: new Date().toISOString(),
    totalDocs: indexEntries.length,
    totalChars: totalChars,
    entries: indexEntries
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output), 'utf8');
  const fileSizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1);

  console.log('═'.repeat(50));
  console.log(`✅ 索引生成完成！`);
  console.log(`   📦 文件: ${OUTPUT_FILE}`);
  console.log(`   📊 共 ${indexEntries.length} 篇文档`);
  console.log(`   📏 总计 ${totalChars.toLocaleString()} 字符`);
  console.log(`   💾 索引体积: ${fileSizeKB} KB`);
}

main();
