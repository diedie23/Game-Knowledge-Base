# 📐 APM 知识库架构重构优化方案

> 📅 **日期**: 2026-04-10 | 👤 **编制**: 技术美术总监 (Art TD) + 知识库架构师 | 📌 **版本**: v6.0
>
> 本方案基于对现有 61+ 篇文档、71 个 HTML 文件、`index.json` (52 个条目) 和 `sidebar.json` 的全面审计，以 **MECE 原则** 为核心，输出可直接落地的重构方案。

---

## 一、全局目录架构重构方案

### 1.1 现状问题诊断

| 问题类别 | 具体表现 | 影响 |
|:---:|:---|:---|
| **命名不统一** | 有的用【2D】前缀、有的无前缀、有的用中文全称、有的用英文缩写 | 检索效率低，用户无法凭标题判断内容定位 |
| **内容碎片化** | "角色换色"相关 3 份文档（`char-color-swap-mask` / `d2` / `color-swap-spec`），内容高度重叠 | 用户反复翻阅，不知道以哪份为准 |
| **分类维度混淆** | 工具使用说明（如 `auto-mask-spec` / `spine-split-spec`）混在"美术工艺与规范"模块 | "怎么做"与"用什么做"混杂，违反单一职责 |
| **craft 字段滥用** | `spine-perf-guide` 在 `index.json` 中 `module="collab"` 但 `craft="角色"`；同时在 sidebar 的"美术工艺"和"跨部门协同"都出现 | 同一文档归属不清，前端检索出双重结果 |
| **id 不规范** | 部分用 `d1`/`d2` 等无语义 id，部分用全英文短横线 | 不利于代码维护和 deep-link 引用 |

### 1.2 重构后的顶层导航树（6 大模块 + 26 个子分组）

```
📋 项目管理与排期 (project)
├── 🔄 管线总览
│   └── 美术生产管线总览 — 2D/3D/二次元全流程
├── 📅 排期与里程碑
│   ├── 美术排期与里程碑管理
│   └── 进度可视化工具
├── 📝 需求流转
│   ├── 需求对接流转规范
│   ├── UI/原画需求模板
│   └── 项目管理工具模板（Jira/TAPD 自动化）
└── 📂 资产库与版本管理
    ├── SVN/Perforce 目录结构标准
    ├── 资产提交与审核工作流
    └── 废弃资产归档与清理规范

📦 外包全链路管理 (outsource)
├── 📋 外包评级与验收
│   ├── 外包管理与验收规范
│   └── 外包资产验收 Checklist
├── 📊 人天模型与报价
│   └── 美术外包工作量评估标准 (人天模型)
├── 💰 预算与结算
│   ├── 外包预算申请与结算流转
│   └── 美术人月成本核算标准
└── 🏢 供应商生态
    └── 供应商生态管理规范

🎨 美术工艺与规范 (craft) ← 核心重构模块
├── 📏 通用规范
│   └── [通用] 资产命名与性能红线总纲
├── 👤 2D 角色
│   ├── [2D·角色] 出图与部件拆分规范 ★ 合并自 3 份文档
│   ├── [2D·角色] 换色工艺与资产交付规范 ★ 合并自 3 份文档
│   └── [2D·角色] Spine 骨骼动画导出与性能规范
├── 🧊 3D 角色
│   └── [3D·角色] 拓扑与 PBR 贴图规范
├── 🖥️ UI
│   ├── [UI] 切图与命名规范
│   ├── [UI] 9宫格与颜色空间
│   ├── [UI] Layout 拼接规范
│   └── [UI] UMG 生成技巧
├── 🏗️ 场景
│   └── [场景] 模块化与 LOD 规范
├── ✨ 特效
│   └── [特效] 性能红线与层级规范
├── 🎬 动画
│   └── [动画] 状态机交接与导出规范
└── 🤖 AIGC
    └── [AIGC] 辅助生产规范

🤝 跨部门协同与交付 (collab)
├── ⚙️ 美术 vs 程序/TA
│   ├── 引擎导入与命名规范
│   ├── 性能红线与资产预算
│   ├── Spine 性能红线与排查
│   └── 跨工种黑话速查表
├── 🐛 美术 vs QA
│   ├── 美术表现类 Bug 定级标准
│   └── 版本走查验收清单
└── 🚨 协作痛点与事故
    ├── 跨部门协作痛点解法
    ├── 典型事故排雷手册
    └── 跨部门沟通话术总结

🛠️ 工具链与自动化 (toolchain) ← 工具与规范严格分离
├── 📖 工具总览
│   └── 美术在线工具使用指南
├── 🎨 美术在线工具
│   ├── 自动 Mask 生成器 v6.0 (在线版)
│   ├── Mask 手动编辑器
│   ├── Spine 拆分工具
│   ├── Mask 核心算法演示
│   ├── 换色资源生成器
│   └── 贴图通道打包工具
├── 🖥️ 桌面工具 & 引擎直连
│   ├── 自动 Mask v6.0 (桌面版)
│   ├── 图片倾斜矫正 (桌面版)
│   ├── 游戏资源工具集 (桌面版)
│   └── Engine Bridge 引擎直连
├── 🔍 检查与合规脚本
│   └── 资产合规性检查工具
└── 📄 工具规范文档 ← ★ 新增分组：工具的「工业化标准」
    ├── [工具规范] 自动 Mask 通道生成器规范
    └── [工具规范] Spine 角色拆分工具规范

🛡️ 质量、风险与团队 (quality)
├── ⚠️ 风险管控
│   └── 项目风险登记册 (Risk Log) 规范
├── 📒 复盘与经验沉淀
│   ├── 版本研发复盘 (Post-mortem) 模板
│   └── XX项目踩坑记录
├── 📊 效能度量
│   ├── 美术效能度量与数据指标体系
│   └── 美术效能度量与标准化汇报模板
├── 🔐 资产安全与交接
│   └── 美术资产防泄密与离职交接 SOP
└── 🎓 新人入职与成长
    ├── 美术新人入职管线必读 (Onboarding)
    ├── 常用系统权限申请导航
    └── APM 个人成长路线图
```

### 1.3 架构设计原则

| 原则 | 说明 | 在本方案中的体现 |
|:---:|:---|:---|
| **MECE** | 相互独立、完全穷尽 | 6 大模块不交叉，每篇文档有且仅有一个归属 |
| **工序与工具分离** | "怎么做"放 craft，"用什么做"放 toolchain | `auto-mask-spec` 从 craft→角色 迁移到 toolchain→工具规范 |
| **统一命名范式** | `[领域·工种] 核心主题 — 补充说明` | 全部角色类文档统一为 `[2D·角色]`/`[3D·角色]` 前缀 |
| **同类项聚合** | 3 份换色文档→1 份；2 份 UGC 文档→1 份 | 从 10 份角色文档精简为 5 份高密度文档 |
| **id 语义化** | 所有 id 使用 `领域-主题` 格式 | `d1`→`craft-2d-char-ugc-split`、`d2`→(合并入主文档) |

---

## 二、核心模块（角色资产规范）的合并与重命名清单

### 2.1 优化动作总览

| # | 原文档名称 | 新文档名称 | 处理动作 | 新 id | 新 module |
|:---:|:---|:---|:---:|:---|:---:|
| 1 | 【通用】角色资产命名与性能红线 | **[通用] 资产命名与性能红线总纲** | ✅ 保留（标题微调） | `craft-common-naming-redline` | `craft` |
| 2 | 【2D】角色换色与材质遮罩规范 | **[2D·角色] 换色工艺与资产交付规范** | 🔀 合并（作为主文档） | `craft-2d-char-color-swap` | `craft` |
| 3 | 【2D】Spine 骨骼动画导出与性能规范 | **[2D·角色] Spine 骨骼动画导出与性能规范** | ✅ 保留（标题微调） | `craft-2d-spine-anim` | `craft` |
| 4 | 【3D】角色拓扑与 PBR 贴图规范 | **[3D·角色] 拓扑与 PBR 贴图规范** | ✅ 保留（标题微调） | `craft-3d-char-topo-pbr` | `craft` |
| 5 | 【UGC专项】角色部件拆分与安全区规范 | **[2D·角色] 出图与部件拆分规范** | 🔀 合并（作为主文档） | `craft-2d-char-ugc-split` | `craft` |
| 6 | 2D UGC 角色出图规范 | *(合并入 #5)* | 🔀 合并 → #5 | *(废弃 `d1`)* | — |
| 7 | 2D 角色换色 — 美术出图资源提供规范 | *(合并入 #2)* | 🔀 合并 → #2 | *(废弃 `d2`)* | — |
| 8 | 2D 角色换色资源规范 | *(合并入 #2)* | 🔀 合并 → #2 | *(废弃 `color-swap-spec`)* | — |
| 9 | 自动 Mask 通道生成器规范 | **[工具规范] 自动 Mask 通道生成器标准** | 📦 迁移至 toolchain | `tool-auto-mask-spec` | `toolchain` |
| 10 | Spine 角色拆分工具规范 | **[工具规范] Spine 角色拆分工具标准** | 📦 迁移至 toolchain | `tool-spine-split-spec` | `toolchain` |

### 2.2 合并结果：从 10 份 → 5 份精华文档 + 2 份工具规范

```
优化前（10 份，角色资产规范）:
  ├── 【通用】角色资产命名与性能红线
  ├── 【2D】角色换色与材质遮罩规范        ┐
  ├── 2D 角色换色 — 美术出图资源提供规范   ├→ 合并为 1 份
  ├── 2D 角色换色资源规范                  ┘
  ├── 【2D】Spine 骨骼动画导出与性能规范
  ├── 【3D】角色拓扑与 PBR 贴图规范
  ├── 【UGC专项】角色部件拆分与安全区规范  ┐
  ├── 2D UGC 角色出图规范                  ┘→ 合并为 1 份
  ├── 自动 Mask 通道生成器规范             → 迁移至 toolchain
  └── Spine 角色拆分工具规范               → 迁移至 toolchain

优化后（5 + 2 = 7 份）:
  🎨 美术工艺与规范
  ├── [通用] 资产命名与性能红线总纲
  ├── [2D·角色] 出图与部件拆分规范 ★
  ├── [2D·角色] 换色工艺与资产交付规范 ★
  ├── [2D·角色] Spine 骨骼动画导出与性能规范
  └── [3D·角色] 拓扑与 PBR 贴图规范

  🛠️ 工具链与自动化
  ├── [工具规范] 自动 Mask 通道生成器标准
  └── [工具规范] Spine 角色拆分工具标准
```

### 2.3 合并文档 A：《[2D·角色] 换色工艺与资产交付规范》内容大纲

> 合并自：#2 `char-color-swap-mask` + #7 `art/2D角色换色-美术资源提供规范` + #8 `color-swap-spec`

```markdown
# [2D·角色] 换色工艺与资产交付规范
> 统一收录 2D 角色换色的全部技术方案、资产制作标准和交付流程。

## 一、换色技术方案选型（Decision Matrix）
### 1.1 五种主流方案对比
  - ① 调色板替换（Palette Swap）
  - ② 遮罩分区 + HSV/Tint（★ 推荐方案）
  - ③ 灰度底图 + 叠色
  - ④ 通道混合染色
  - ⑤ 多套贴图直出
### 1.2 方案选型决策树（按游戏风格/性能预算/可扩展性三维度打分）
  ← 原 color-swap-spec 中的"方案对比表"

## 二、遮罩分区换色（核心方案，重点展开）
### 2.1 RGBA 通道定义规范
  ← 原 char-color-swap-mask 的通道互斥铁律
### 2.2 Mask 图制作标准
  - 尺寸必须与原图一致
  - UV 像素级对齐
  - 无损格式（PNG/TGA）
  - 边缘 1~2px 渐变过渡
  ← 原 2D角色换色-美术资源提供规范 的 §2.3
### 2.3 超过 3 个换色区域的扩展方案
  - 方案 A：灰度分段
  - 方案 B：多张 Mask
  - 方案 C：UV 多象限
  ← 原 2D角色换色-美术资源提供规范 的 §五

## 三、美术出图资源 SOP（面向制作岗）
### 3.1 资源包目录结构
  ← 原 2D角色换色-美术资源提供规范 的 §2.1
### 3.2 Base Texture 制作规范
### 3.3 Mask Texture 制作规范（绘制示意图）
### 3.4 配色方案表 JSON 模板

## 四、工业化质量标准（面向 QA/TA 岗）
### 4.1 自动化检测脚本接口
  ← 原 color-swap-spec 的 QA 检测规则
### 4.2 通道值范围校验
### 4.3 纯黑/纯白区域 QA 检测

## 五、美术 ↔ 程序对接 Checklist
### 5.1 出图前确认清单
### 5.2 出图时检查清单
### 5.3 交付物清单
  ← 原 2D角色换色-美术资源提供规范 的 §六

## 六、常见踩坑与 FAQ
  ← 原 2D角色换色-美术资源提供规范 的 §七

## 七、变更记录
  | 版本 | 日期 | 变更内容 | 作者 |
```

### 2.4 合并文档 B：《[2D·角色] 出图与部件拆分规范》内容大纲

> 合并自：#5 `char-ugc-parts-safety` + #6 `art/2D-UGC角色出图规范`

```markdown
# [2D·角色] 出图与部件拆分规范
> 统一收录 2D UGC 角色的出图标准、部件拆分规则和安全区要求。

## 一、基础技术规范
### 1.1 画布与分辨率
  ← 原 2D UGC 角色出图规范 的 §一
### 1.2 文件格式（PNG/TGA/PSD）
### 1.3 透明通道（Alpha）要求

## 二、角色部件模块化拆分
### 2.1 五大部件标准划分（头发/面部/身体/下装/配饰）
  ← 原 2D UGC 角色出图规范 的 §二 + char-ugc-parts-safety 的部件拆分标准
### 2.2 素体安全区与关节 Padding
  ← 原 char-ugc-parts-safety 的安全区规范
### 2.3 Z-Order 层级铁律
  ← 原 char-ugc-parts-safety 的 Z-Order 规则
### 2.4 拆分对接核心要求（衔接线/统一锚点/裸模补齐）
### 2.5 面数/复杂度控制

## 三、美术风格与色彩规范
### 3.1 头身比与体型
### 3.2 色彩规范（主色数/饱和度/色板）
### 3.3 光影处理

## 四、动画与精灵图规范
### 4.1 精灵图（Sprite Sheet）标准
### 4.2 动画兼容性要求

## 五、命名与资源管理规范
### 5.1 文件命名约定
### 5.2 材质球命名
### 5.3 目录结构建议

## 六、UGC 审核与合规
### 6.1 内容安全红线
### 6.2 技术审核标准

## 七、跨平台与性能优化
### 7.1 多端适配（手机/PC/Web）
### 7.2 性能优化建议

## 八、换装兼容性测试 Checklist
  ← 原 char-ugc-parts-safety 的 Checklist
  + 原 2D UGC 角色出图规范 的 §八

## 九、各平台关键差异速查表
  ← 原 2D UGC 角色出图规范 的 §九

## 十、变更记录
```

---

## 三、知识库内容时效性与维护建议

### 3.1 文档版本号与元数据管理

| 机制 | 具体做法 |
|:---:|:---|
| **文档版本号** | 每篇文档 header 区域强制标注 `v{主版本}.{次版本}`，对应 `index.json` 的 `doc_version` 新增字段。主版本 = 结构性重写，次版本 = 内容补充/勘误 |
| **最后更新时间戳** | `index.json` 的 `last_updated` 字段必须在每次修改时同步更新，前端侧边栏自动显示"X 天前更新"标签 |
| **文档 Owner 制度** | 每篇文档有且仅有一个 Owner（维护人），Owner 离职时必须做交接（与资产安全 SOP 联动） |

### 3.2 定期 Review 机制

| 频率 | Review 内容 | 参与者 | 产出物 |
|:---:|:---|:---:|:---|
| **每月** | 工具类文档的版本号与实际工具版本是否一致 | TA 组 | 差异报告 + 即时修复 |
| **每季度** | 全量文档的时效性扫描（标记 >90 天未更新的文档为"待审核"） | APM 组全员 | Review 看板 + 过期文档标黄 |
| **每个里程碑** | 核心规范类文档（性能红线、命名规范等）与引擎版本/项目需求的一致性检查 | TA + APM lead | 规范变更 Changelog |

### 3.3 工具更新与文档同步的自动化联动

```
触发机制：
  工具代码提交（如 auto-mask-v6.html 被修改）
    → Git Hook / CI 检测文件变更
    → 自动在 TAPD/Jira 创建一个"文档同步"任务
    → 指派给工具对应的 Owner
    → Owner 在 3 个工作日内更新对应的工具规范文档

可选增强：
  - 在工具 HTML 内嵌入 `data-doc-version="6.3"` 属性
  - CI 脚本对比工具版本号与 index.json 中 doc_version 是否匹配
  - 不匹配时阻止 deploy 或发出 Slack/飞书通知
```

### 3.4 "已过期"标记与归档机制

- 超过 **180 天** 未更新的文档，前端自动显示 ⚠️ 黄色 Badge："内容可能过时，请确认"
- 超过 **365 天** 未更新的文档，Owner 必须做出 "确认有效" 或 "标记废弃" 的二选一决策
- 废弃文档移入 `deprecated/` 子目录，sidebar 不再展示，但保留 deep-link 可访问性

### 3.5 知识库变更 Changelog 集中管理

在 `index.json` 顶层新增 `changelog` 数组：

```json
{
  "changelog": [
    { "date": "2026-04-10", "type": "restructure", "desc": "v6.0 架构重构：角色模块从10→5份文档，工具规范迁移至 toolchain" },
    { "date": "2026-04-09", "type": "tool_update", "desc": "自动 Mask 生成器升级至 v6.3，新增边缘去噪算法" }
  ]
}
```

---

## 四、index.json 数据结构更新示例

以下展示优化后的 `index.json` 关键变更片段：

### 4.1 新增字段说明

```json
{
  "version": "6.0",
  "lastUpdate": "2026-04-10",
  "subtitle": "APM 专属知识库 — 美术项目管理核心知识体系",
  "changelog": [
    { "date": "2026-04-10", "type": "restructure", "desc": "v6.0 MECE 架构重构" }
  ],
  "moduleConfig": {
    "project":   { "label": "📋 项目管理与排期",   "icon": "📋", "color": "accent",  "weight": 20 },
    "outsource": { "label": "📦 外包全链路管理",   "icon": "📦", "color": "orange",  "weight": 15 },
    "craft":     { "label": "🎨 美术工艺与规范",   "icon": "🎨", "color": "purple",  "weight": 25 },
    "collab":    { "label": "🤝 跨部门协同与交付",  "icon": "🤝", "color": "green",   "weight": 15 },
    "toolchain": { "label": "🛠️ 工具链与自动化",  "icon": "🛠️", "color": "cyan",    "weight": 15 },
    "quality":   { "label": "🛡️ 质量、风险与团队", "icon": "🛡️", "color": "pink",    "weight": 10 }
  },
  "craftConfig": {
    "通用":   { "label": "通用", "icon": "📏" },
    "2D角色": { "label": "2D 角色", "icon": "👤" },
    "3D角色": { "label": "3D 角色", "icon": "🧊" },
    "UI":     { "label": "UI", "icon": "🖥️" },
    "场景":   { "label": "场景", "icon": "🏗️" },
    "特效":   { "label": "特效", "icon": "✨" },
    "动画":   { "label": "动画", "icon": "🎬" },
    "AIGC":   { "label": "AIGC", "icon": "🤖" },
    "管理":   { "label": "管理", "icon": "📋" },
    "跨部门": { "label": "跨部门", "icon": "🤝" },
    "技术":   { "label": "技术", "icon": "🔌" }
  }
}
```

### 4.2 合并后的"换色"文档配置示例

```json
{
  "id": "craft-2d-char-color-swap",
  "module": "craft",
  "craft": "2D角色",
  "type": "iframe",
  "title": "[2D·角色] 换色工艺与资产交付规范",
  "desc": "五种换色技术方案选型 · RGBA通道互斥铁律 · Mask制作SOP · 多区域扩展方案 · 美术↔程序对接Checklist · 常见踩坑FAQ",
  "tags": ["换色", "Mask", "HSV", "通道互斥", "调色板", "灰度叠色", "2D", "SOP", "Checklist"],
  "icon": "🎨",
  "action": "openTool",
  "path": "knowledge-base/craft-2d-char-color-swap.html",
  "owner": "李四",
  "last_updated": "2026-04-10",
  "doc_version": "1.0",
  "applicable_stage": "量产期",
  "priority": "high",
  "is_hot": true,
  "merged_from": ["char-color-swap-mask", "d2", "color-swap-spec"],
  "supersedes": ["char-color-swap-mask", "d2", "color-swap-spec"]
}
```

### 4.3 合并后的"出图与部件拆分"文档配置示例

```json
{
  "id": "craft-2d-char-ugc-split",
  "module": "craft",
  "craft": "2D角色",
  "type": "iframe",
  "title": "[2D·角色] 出图与部件拆分规范",
  "desc": "2D UGC角色出图全流程 · 五大部件拆分标准 · 素体安全区 · Z-Order铁律 · 换装兼容性测试 · 跨平台差异速查",
  "tags": ["2D", "UGC", "出图规范", "部件拆分", "安全区", "Z-Order", "换装", "Checklist"],
  "icon": "📐",
  "action": "openTool",
  "path": "knowledge-base/craft-2d-char-ugc-split.html",
  "owner": "张三",
  "last_updated": "2026-04-10",
  "doc_version": "1.0",
  "applicable_stage": "量产期",
  "priority": "high",
  "is_hot": true,
  "merged_from": ["char-ugc-parts-safety", "d1"],
  "supersedes": ["char-ugc-parts-safety", "d1"]
}
```

### 4.4 迁移至 toolchain 的工具规范示例

```json
{
  "id": "tool-auto-mask-spec",
  "module": "toolchain",
  "craft": "2D角色",
  "type": "iframe",
  "title": "[工具规范] 自动 Mask 通道生成器标准",
  "desc": "Auto Mask 工具的工业化标准：算法原理、参数配置基线、QA检测规则、批量处理流程",
  "tags": ["工具规范", "Mask", "自动生成", "QA检测", "工业化标准"],
  "icon": "🤖",
  "action": "openTool",
  "path": "knowledge-base/auto-mask-spec.html",
  "owner": "TA团队",
  "last_updated": "2026-04-10",
  "doc_version": "1.0",
  "applicable_stage": "量产期",
  "priority": "medium",
  "is_hot": false,
  "migrated_from_module": "craft"
}
```

```json
{
  "id": "tool-spine-split-spec",
  "module": "toolchain",
  "craft": "2D角色",
  "type": "iframe",
  "title": "[工具规范] Spine 角色拆分工具标准",
  "desc": "Spine Split 工具的工业化标准：拆分规则、拓扑延展算法、Atlas导出要求、兼容性矩阵",
  "tags": ["工具规范", "Spine", "拆分", "拓扑", "Atlas", "工业化标准"],
  "icon": "✂️",
  "action": "openTool",
  "path": "knowledge-base/spine-split-spec.html",
  "owner": "王五",
  "last_updated": "2026-04-10",
  "doc_version": "1.0",
  "applicable_stage": "量产期",
  "priority": "medium",
  "is_hot": false,
  "migrated_from_module": "craft"
}
```

### 4.5 sidebar.json 角色模块更新示例

```json
{
  "name": "2D 角色规范",
  "icon": "👤",
  "items": [
    {
      "id": "craft-2d-char-ugc-split",
      "icon": "📐",
      "title": "[2D·角色] 出图与部件拆分规范",
      "type": "iframe",
      "file": "knowledge-base/craft-2d-char-ugc-split.html",
      "badge": "2D角色",
      "craft": "2D角色",
      "isNew": true,
      "note": "合并自原「2D UGC 角色出图规范」+「UGC专项角色部件拆分与安全区规范」"
    },
    {
      "id": "craft-2d-char-color-swap",
      "icon": "🎨",
      "title": "[2D·角色] 换色工艺与资产交付规范",
      "type": "iframe",
      "file": "knowledge-base/craft-2d-char-color-swap.html",
      "badge": "2D角色",
      "craft": "2D角色",
      "isNew": true,
      "note": "合并自原「角色换色与材质遮罩」+「换色出图规范」+「换色资源规范」"
    },
    {
      "id": "craft-2d-spine-anim",
      "icon": "🦴",
      "title": "[2D·角色] Spine 骨骼动画导出与性能规范",
      "type": "iframe",
      "file": "knowledge-base/spine-perf-guide.html",
      "badge": "2D角色",
      "craft": "2D角色"
    }
  ]
}
```

---

## 五、标题命名规范速查

### 5.1 命名范式

```
[领域·工种] 核心主题 — 补充说明（可选）
```

| 组件 | 规则 | 示例 |
|:---:|:---|:---|
| **领域** | `通用` / `2D` / `3D` / `UI` / `特效` / `动画` / `AIGC` / `工具规范` | `[2D·角色]` |
| **核心主题** | 4~12 字，精准描述文档核心内容 | `换色工艺与资产交付规范` |
| **补充说明** | 可选，用 `—` 分隔，进一步明确范围 | `— Mask/HSV/Palette 三方案全解` |

### 5.2 全部角色文档的新旧标题对照

| 原标题 | 新标题 | 命名改进点 |
|:---|:---|:---|
| 【通用】角色资产命名与性能红线 | [通用] 资产命名与性能红线总纲 | 方括号替代黑括号，加"总纲"强调定位 |
| 【2D】角色换色与材质遮罩规范 | [2D·角色] 换色工艺与资产交付规范 | 统一前缀格式，标题覆盖全流程 |
| 【2D】Spine 骨骼动画导出与性能规范 | [2D·角色] Spine 骨骼动画导出与性能规范 | 统一前缀格式 |
| 【3D】角色拓扑与 PBR 贴图规范 | [3D·角色] 拓扑与 PBR 贴图规范 | 统一前缀格式 |
| 【UGC专项】角色部件拆分与安全区规范 | [2D·角色] 出图与部件拆分规范 | 消除"UGC专项"冗余前缀，合并内容后更准确 |
| 2D UGC 角色出图规范 | *(合并入上一行)* | 消除碎片文档 |
| 2D 角色换色 — 美术出图资源提供规范 | *(合并入换色文档)* | 消除碎片文档 |
| 2D 角色换色资源规范 | *(合并入换色文档)* | 消除碎片文档 |
| 自动 Mask 通道生成器规范 | [工具规范] 自动 Mask 通道生成器标准 | 前缀明确为"工具规范"，迁移至 toolchain |
| Spine 角色拆分工具规范 | [工具规范] Spine 角色拆分工具标准 | 同上 |

---

## 六、实施路线图

| 阶段 | 时间 | 内容 | 负责人 |
|:---:|:---:|:---|:---:|
| **Phase 1** | 第 1 周 | 创建合并后的 2 份新文档（换色 + 出图拆分），内容聚合不丢失 | 李四 + 张三 |
| **Phase 2** | 第 1~2 周 | 更新 `index.json` 和 `sidebar.json`，新增 `doc_version` / `merged_from` / `supersedes` 字段 | TA 组 |
| **Phase 3** | 第 2 周 | 旧文档设置 301 重定向（保留 deep-link 兼容），前端 app.js 适配新 id | 前端 |
| **Phase 4** | 第 3 周 | 全量文档标题统一为新命名范式，README.md 同步更新 | APM 组全员 |
| **Phase 5** | 持续 | 建立季度 Review 机制和 CI 文档同步脚本 | TA + APM lead |

---

## 七、FAQ

**Q: 旧的 deep-link（如 `#char-color-swap-mask`）会失效吗？**
A: 不会。在 `index.json` 的新文档条目中增加 `supersedes` 字段，前端路由层做 id 映射，旧链接自动跳转到新文档。

**Q: 合并文档会导致单篇过长吗？**
A: 参考当前最长文档 `spine-split.html` (162KB)，合并后的换色文档预计约 50~70KB，在可接受范围内。大纲中的分章节设计 + 前端 TOC 导航可确保可读性。

**Q: 工具规范迁移后，在"美术工艺"模块找不到了怎么办？**
A: 在"2D 角色规范"分组中保留一条"关联阅读"链接指向 toolchain，如"🔗 相关工具规范：Auto Mask 标准 | Spine Split 标准"。

**Q: `craft` 字段的值需要从 `角色` 细化为 `2D角色` / `3D角色` 吗？**
A: 是的。这是本次重构的关键改进之一，可以让前端按"2D/3D"维度精准筛选，而不是把所有角色文档混在一起。需同步在 `craftConfig` 中注册新值。

---

> 📝 **本方案由 AI 技术美术总监 + 知识库架构师视角编制，需经 APM 团队评审后方可执行。**
