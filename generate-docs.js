#!/usr/bin/env node
/**
 * ============================================================
 *  APM 知识库 — 批量文档生成脚本
 *  使用 Claude API 自动补全缺失的 .md / .html 文档
 * ============================================================
 *
 *  用法:
 *    1. npm install
 *    2. 设置环境变量 CLAUDE_API_KEY（详见 README-generate.md）
 *    3. node generate-docs.js [--dry-run] [--concurrency=2] [--model=claude-sonnet-4-20250514]
 *
 *  参数说明:
 *    --dry-run        仅扫描并打印缺失清单，不调用 API
 *    --concurrency=N  并发请求数（默认 2，避免触发速率限制）
 *    --model=MODEL    指定 Claude 模型（默认 claude-sonnet-4-20250514）
 *    --id=ID          仅生成指定 id 的文档
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ─── 常量与配置 ────────────────────────────────────────────
const DOCS_DIR = path.join(__dirname, 'docs');
const INDEX_JSON_PATH = path.join(DOCS_DIR, 'index.json');

// 解析命令行参数
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONCURRENCY = (() => {
  const flag = args.find(a => a.startsWith('--concurrency='));
  return flag ? parseInt(flag.split('=')[1], 10) : 2;
})();
const MODEL = (() => {
  const flag = args.find(a => a.startsWith('--model='));
  return flag ? flag.split('=')[1] : 'claude-sonnet-4-20250514';
})();
const ONLY_ID = (() => {
  const flag = args.find(a => a.startsWith('--id='));
  return flag ? flag.split('=')[1] : null;
})();

// ─── 颜色工具（控制台美化） ─────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function log(icon, msg) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`${C.dim}[${time}]${C.reset} ${icon}  ${msg}`);
}

function logSuccess(msg) { log(`${C.green}✅${C.reset}`, `${C.green}${msg}${C.reset}`); }
function logInfo(msg)    { log(`${C.cyan}ℹ️${C.reset}`, msg); }
function logWarn(msg)    { log(`${C.yellow}⚠️${C.reset}`, `${C.yellow}${msg}${C.reset}`); }
function logError(msg)   { log(`${C.red}❌${C.reset}`, `${C.red}${msg}${C.reset}`); }
function logStep(msg)    { log(`${C.magenta}🔨${C.reset}`, `${C.bright}${msg}${C.reset}`); }

// ─── 分隔线 ────────────────────────────────────────────────
function printBanner() {
  console.log(`
${C.cyan}╔══════════════════════════════════════════════════════════════╗
║       APM 知识库 — 批量文档生成器 (Claude API)              ║
╚══════════════════════════════════════════════════════════════╝${C.reset}
`);
}

function printSeparator(title) {
  console.log(`\n${C.dim}─── ${title} ${'─'.repeat(50 - title.length)}${C.reset}\n`);
}

// ─── 读取 index.json ────────────────────────────────────────
function loadIndex() {
  if (!fs.existsSync(INDEX_JSON_PATH)) {
    logError(`找不到 ${INDEX_JSON_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(INDEX_JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ─── 获取模块标签 ───────────────────────────────────────────
function getModuleLabel(moduleConfig, moduleKey) {
  if (moduleConfig && moduleConfig[moduleKey]) {
    // 移除 emoji 前缀
    return moduleConfig[moduleKey].label.replace(/^[^\u4e00-\u9fa5a-zA-Z]+/, '').trim();
  }
  return moduleKey;
}

// ─── 检测缺失文档 ──────────────────────────────────────────
function findMissingDocs(data) {
  const items = data.items || [];
  const moduleConfig = data.moduleConfig || {};
  const missing = [];

  for (const item of items) {
    // 如果指定了 --id 参数，只处理该 id
    if (ONLY_ID && item.id !== ONLY_ID) continue;

    const filePath = item.path;
    if (!filePath) continue;

    // 跳过 placeholder.html（这些是待写文档，我们生成对应的 .md）
    // 跳过 type 为 "tool" 的在线工具
    if (item.type === 'tool') continue;

    const fullPath = path.join(DOCS_DIR, filePath);

    // 判断缺失逻辑：
    // 1. 路径指向 placeholder.html → 缺失（需生成对应 .md）
    // 2. type 为 "md" → 检查 .md 文件是否存在
    const isPlaceholder = filePath.includes('placeholder.html');
    const isMd = item.type === 'md';

    if (isPlaceholder) {
      // placeholder 文档：需要生成 markdown 内容
      const moduleLabel = getModuleLabel(moduleConfig, item.module);
      missing.push({
        id: item.id,
        title: item.title,
        desc: item.desc,
        module: item.module,
        moduleLabel,
        craft: item.craft,
        tags: item.tags || [],
        draft_prompt: item.draft_prompt || null,
        originalPath: filePath,
        // 生成路径：knowledge-base/<id>.md
        targetPath: path.join(DOCS_DIR, 'knowledge-base', `${item.id}.md`),
        targetRelative: `knowledge-base/${item.id}.md`,
        type: 'placeholder',
      });
    } else if (isMd && !fs.existsSync(fullPath)) {
      // MD 类型但文件不存在
      const moduleLabel = getModuleLabel(moduleConfig, item.module);
      missing.push({
        id: item.id,
        title: item.title,
        desc: item.desc,
        module: item.module,
        moduleLabel,
        craft: item.craft,
        tags: item.tags || [],
        draft_prompt: item.draft_prompt || null,
        originalPath: filePath,
        targetPath: path.join(DOCS_DIR, filePath),
        targetRelative: filePath,
        type: 'md',
      });
    }
  }

  return missing;
}

// ─── 构建提示词 ─────────────────────────────────────────────
function buildPrompt(doc) {
  // 如果节点配置了 draft_prompt，优先使用
  if (doc.draft_prompt) {
    return doc.draft_prompt;
  }

  // 通用提示词模板：根据分类和标题自动拼接
  const tagStr = doc.tags.length > 0 ? doc.tags.join('、') : '';
  const tagHint = tagStr ? `，涉及关键词：${tagStr}` : '';

  return `你是一个资深游戏美术项目经理（APM），拥有 10 年以上的行业经验。

请撰写一份关于【${doc.moduleLabel} - ${doc.title}】的专业文档。

文档背景说明：${doc.desc}${tagHint}

要求：
1. 内容结构清晰，使用多级标题组织
2. 包含具体的规范标准、操作流程和检查清单
3. 包含跨部门协作注意点（美术与策划/程序/QA 的对接）
4. 包含常见问题与避坑指南
5. 包含实用模板或表格（如适用）
6. 语言专业但易懂，适合团队内部培训使用
7. 输出为 Markdown 格式
8. 文档开头添加一级标题: # ${doc.title}
9. 在标题后添加一段简要摘要说明文档用途`;
}

// ─── 调用 Claude API ────────────────────────────────────────
async function callClaudeAPI(prompt, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');

  const client = new Anthropic({
    apiKey: apiKey,
  });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // 提取文本内容
  const textBlocks = message.content.filter(b => b.type === 'text');
  if (textBlocks.length === 0) {
    throw new Error('Claude API 返回内容为空');
  }

  let text = textBlocks.map(b => b.text).join('\n');

  // 清理：如果 Claude 返回了被 ```markdown ``` 包裹的内容，去除包裹
  text = text.replace(/^```markdown\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  return text;
}

// ─── 保存文件 ───────────────────────────────────────────────
function saveMarkdown(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logInfo(`创建目录: ${dir}`);
  }
  fs.writeFileSync(targetPath, content, 'utf-8');
}

// ─── 并发控制器 ─────────────────────────────────────────────
async function asyncPool(poolLimit, items, iteratorFn) {
  const results = [];
  const executing = new Set();

  for (const [index, item] of items.entries()) {
    const p = Promise.resolve().then(() => iteratorFn(item, index));
    results.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean, clean);

    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(results);
}

// ─── 主流程 ─────────────────────────────────────────────────
async function main() {
  printBanner();

  // 1. 检查 API Key
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !DRY_RUN) {
    logError('未设置 CLAUDE_API_KEY 或 ANTHROPIC_API_KEY 环境变量！');
    logInfo('请执行: $env:CLAUDE_API_KEY="sk-ant-xxxxx" (PowerShell)');
    logInfo('或: set CLAUDE_API_KEY=sk-ant-xxxxx (CMD)');
    logInfo('或使用 --dry-run 参数仅扫描缺失清单');
    process.exit(1);
  }

  // 2. 读取 index.json
  logStep('正在读取 index.json ...');
  const data = loadIndex();
  const totalItems = data.items.length;
  logSuccess(`共发现 ${totalItems} 个文档节点`);

  // 3. 扫描缺失文档
  printSeparator('扫描缺失文档');
  const missing = findMissingDocs(data);

  if (missing.length === 0) {
    logSuccess('🎉 所有文档均已存在，无需生成！');
    return;
  }

  // 4. 打印缺失清单
  logWarn(`发现 ${missing.length} 个缺失文档：\n`);
  const tableData = missing.map((doc, i) => ({
    '#': i + 1,
    'ID': doc.id,
    '标题': doc.title.length > 25 ? doc.title.slice(0, 25) + '...' : doc.title,
    '模块': doc.moduleLabel,
    '工种': doc.craft,
    'Prompt': doc.draft_prompt ? '✅ 自定义' : '🔧 自动生成',
    '目标路径': doc.targetRelative,
  }));
  console.table(tableData);

  // 如果是 dry-run 模式，到此为止
  if (DRY_RUN) {
    printSeparator('Dry Run 完成');
    logInfo('使用 --dry-run 模式，不会调用 API。移除该参数以执行生成。');
    return;
  }

  // 5. 开始生成
  printSeparator(`开始生成 (模型: ${MODEL}, 并发: ${CONCURRENCY})`);

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  const results = await asyncPool(CONCURRENCY, missing, async (doc, index) => {
    const num = `[${index + 1}/${missing.length}]`;
    logStep(`${num} 正在生成: ${C.cyan}${doc.title}${C.reset} (${doc.id})`);

    try {
      const prompt = buildPrompt(doc);

      // 打印 prompt 摘要（前 80 字符）
      const promptPreview = prompt.replace(/\n/g, ' ').slice(0, 80);
      logInfo(`${num} Prompt 摘要: ${C.dim}${promptPreview}...${C.reset}`);

      const markdown = await callClaudeAPI(prompt, apiKey);

      // 保存文件
      saveMarkdown(doc.targetPath, markdown);

      const size = Buffer.byteLength(markdown, 'utf-8');
      const sizeKB = (size / 1024).toFixed(1);
      logSuccess(`${num} 生成成功: ${doc.targetRelative} (${sizeKB} KB)`);

      successCount++;
      return { id: doc.id, success: true };
    } catch (err) {
      logError(`${num} 生成失败: ${doc.title} — ${err.message}`);
      failCount++;
      return { id: doc.id, success: false, error: err.message };
    }
  });

  // 6. 汇总报告
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  printSeparator('生成报告');

  console.log(`
${C.bright}📊 生成结果汇总${C.reset}
${'─'.repeat(40)}
  总文档数:  ${missing.length}
  ${C.green}✅ 成功:   ${successCount}${C.reset}
  ${failCount > 0 ? C.red : C.dim}❌ 失败:   ${failCount}${C.reset}
  ⏱️  耗时:   ${elapsed}s
  🤖 模型:   ${MODEL}
${'─'.repeat(40)}
`);

  // 打印失败详情
  const failures = results.filter(r => r.status === 'fulfilled' && r.value && !r.value.success);
  if (failures.length > 0) {
    logWarn('失败详情:');
    failures.forEach(f => {
      const v = f.value;
      logError(`  - ${v.id}: ${v.error}`);
    });
  }

  if (successCount > 0) {
    logInfo(`\n💡 提示: 生成的 .md 文件位于 docs/knowledge-base/ 目录下`);
    logInfo(`   您可能需要更新 index.json 中对应节点的 path 和 type 字段`);
    logInfo(`   将 path 从 "knowledge-base/placeholder.html" 改为 "knowledge-base/<id>.md"`);
    logInfo(`   将 type 从 "iframe" 改为 "md"，action 从 "openTool" 改为 "showDoc"`);
  }
}

// ─── 启动 ───────────────────────────────────────────────────
main().catch(err => {
  logError(`脚本执行出错: ${err.message}`);
  console.error(err);
  process.exit(1);
});
