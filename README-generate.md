# APM 知识库 — 批量文档生成器

使用 Claude API 自动生成知识库中缺失的文档内容。

## 📋 前置条件

- **Node.js** >= 18.x
- **Claude API Key**（从 Anthropic Console 获取）

## 🔧 安装依赖

```bash
npm install @anthropic-ai/sdk
```

## 🔑 配置 Claude API Key

### 方法一：环境变量（推荐）

**PowerShell (Windows):**
```powershell
$env:CLAUDE_API_KEY = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxx"
node generate-docs.js
```

**CMD (Windows):**
```cmd
set CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxx
node generate-docs.js
```

**Linux / macOS (Bash):**
```bash
export CLAUDE_API_KEY="sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxx"
node generate-docs.js
```

### 方法二：写入 `.env` 文件（可选）

在项目根目录创建 `.env` 文件：
```
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ 注意：请勿将 `.env` 文件提交到 Git 仓库！已在 `.gitignore` 中配置忽略。

### 获取 API Key

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 注册 / 登录账户
3. 进入 **API Keys** 页面
4. 点击 **Create Key**，复制生成的 Key

## 🚀 使用方法

### 1. 扫描缺失清单（不调用 API）

```bash
node generate-docs.js --dry-run
```

这会列出所有缺失的文档，但不会实际生成内容。推荐首次使用时先 dry-run 确认。

### 2. 批量生成所有缺失文档

```bash
node generate-docs.js
```

### 3. 生成指定文档

```bash
node generate-docs.js --id=art-scheduling
```

### 4. 调整并发数和模型

```bash
# 单线程顺序生成（最安全，避免 API 限流）
node generate-docs.js --concurrency=1

# 使用不同模型
node generate-docs.js --model=claude-sonnet-4-20250514
```

### 5. 组合使用

```bash
node generate-docs.js --concurrency=1 --model=claude-sonnet-4-20250514
```

## 📦 脚本工作流程

```
读取 docs/index.json
       ↓
遍历所有 items 节点
       ↓
检查文件是否存在:
  - path 指向 placeholder.html → 缺失
  - type 为 "md" 但文件不存在 → 缺失
       ↓
构建提示词:
  - 优先使用节点的 draft_prompt
  - 没有则自动根据标题和分类生成通用 Prompt
       ↓
调用 Claude API 生成 Markdown
       ↓
保存到 docs/knowledge-base/<id>.md
       ↓
输出生成报告
```

## 📁 生成后的后续操作

文档生成后，您需要手动更新 `docs/index.json` 中对应节点的字段：

```json
// 更新前（placeholder）
{
  "id": "art-scheduling",
  "type": "iframe",
  "action": "openTool",
  "path": "knowledge-base/placeholder.html"
}

// 更新后（实际文档）
{
  "id": "art-scheduling",
  "type": "md",
  "action": "showDoc",
  "path": "knowledge-base/art-scheduling.md"
}
```

## 💰 费用估算

- 每篇文档大约消耗 **2000-5000 tokens**（输入 + 输出）
- 使用 `claude-sonnet-4-20250514` 模型，每篇约 **$0.02-0.05**
- 当前知识库约有 **20+** 篇待生成文档，总费用约 **$0.5-1.0**

## ❓ 常见问题

### Q: 报错 "429 Too Many Requests"
A: API 请求频率超限。降低并发：`--concurrency=1`，脚本会自动排队。

### Q: 报错 "401 Unauthorized"
A: API Key 无效或过期，请检查环境变量是否正确设置。

### Q: 生成的内容质量不理想
A: 可以在 `index.json` 中为对应节点添加更详细的 `draft_prompt` 字段，然后重新生成。

### Q: 如何只重新生成某一篇？
A: 删除已生成的 `.md` 文件，然后执行 `node generate-docs.js --id=<文档id>`。
