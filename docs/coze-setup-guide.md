# Coze 平台配置指南 — 10 分钟搞定 AI 助手

> 按以下步骤操作，即可让网站的 AI 助手拥有智能回答能力。

---

## 第 1 步：注册 & 创建 Bot（3 分钟）

1. 打开 **[coze.cn](https://www.coze.cn)** → 用手机号/微信注册登录
2. 点击左上角 **「+ 创建 Bot」**
3. 填写信息：
   - **Bot 名称**：`APM 智能助理`
   - **Bot 描述**：`游戏美术项目管理知识库问答助手`
4. 点击 **确认** 创建

---

## 第 2 步：上传知识库文档（3 分钟）

1. 在 Bot 编辑页，左侧找到 **「知识」** 面板
2. 点击 **「+ 添加」** → 选择 **「本地文档」**
3. 将你 `docs/` 目录下的 **所有 .html 和 .md 文档** 打包上传
   - 推荐一次上传 10-20 个核心文档
   - 支持格式：`.txt`、`.md`、`.html`、`.pdf`、`.docx`
4. 等待处理完成（通常 1-3 分钟），状态变为 ✅

### 知识库检索策略设置
- 在知识库设置中，将 **检索模式** 设为 **「混合检索」**（语义 + 关键词）
- **Top K** 设为 `3`（返回最相关的 3 条结果）
- **相似度阈值** 设为 `0.5`

---

## 第 3 步：配置 System Prompt（1 分钟）

1. 在 Bot 编辑页，找到左侧 **「编排」→「Persona & Prompt」**
2. 打开 `coze-system-prompt.md` 文件，复制其中 ``` 代码块里的全部内容
3. 粘贴到 Prompt 输入框中
4. 点击保存

---

## 第 4 步：获取 Bot ID & Token（2 分钟）

### 获取 Bot ID
1. 在 Bot 编辑页面的**浏览器地址栏**中找到 URL
2. URL 格式如：`https://www.coze.cn/space/xxx/bot/7356xxxxxxxxxxxx`
3. 最后一段数字就是 **Bot ID**（如 `7356xxxxxxxxxxxx`）

### 获取 Personal Access Token（PAT）
1. 点击 Coze 页面右上角你的**头像** → **「个人设置」**
2. 找到 **「API 访问令牌」** 或 **「Personal Access Token」**
3. 点击 **「添加令牌」**：
   - 名称：`知识库网站`
   - 权限：勾选 **Bot** 相关权限（`bot:read`、`chat`）
   - 有效期：建议选 **180 天**
4. 生成后**立即复制保存**（只显示一次！）

### ⚠️ 重要：发布 Bot
- 在 Bot 编辑页右上角点击 **「发布」**
- 选择 **「API」** 渠道
- 确认发布

---

## 第 5 步：在网站中填入配置（30 秒）

1. 打开你的知识库网站
2. 点击右下角 **AI 助手悬浮球** → 打开对话框
3. 点击底部的 **「配置 Coze Bot」** 链接
4. 粘贴 **Bot ID** 和 **Token**
5. 点击 **「保存配置」**

🎉 **完成！** 现在试着问一个问题看看效果吧！

---

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| API 返回 4100 错误 | Bot 未发布到 API 渠道，去 Coze 点「发布」→「API」 |
| API 返回 4101 错误 | Token 权限不足，重新生成并勾选 Bot 权限 |
| 回答内容不相关 | 知识库文档太少或检索模式设置不对，确保用「混合检索」 |
| 回答含大量元数据 | System Prompt 未正确配置，重新粘贴 coze-system-prompt.md 的内容 |
| 连接超时 | 网络问题，系统会自动降级到本地搜索模式 |

---

## 技术架构图

```
用户提问
    ↓
前端 aiSendMessage()
    ↓
检查 localStorage 中是否有 Bot ID + Token
    ├── 无配置 → aiLocalAnswer()  → Fuse.js 本地搜索
    └── 有配置 → aiCozeAnswer()   → Coze v3 API
                     ↓
              POST /v3/chat (非流式)
                     ↓
              轮询 /v3/chat/retrieve
                     ↓
              GET /v3/chat/message/list
                     ↓
              aiCleanBotResponse() 清洗
                     ↓
              aiAppendMessage() 渲染到页面
```
