# 📸 版本快照 — APM 知识库 v8.2

> **快照时间**：2026-04-22  
> **Git Commit**：`1651d2c2009c87c1e03794831610375e089a510a`  
> **基线版本**：v8.0-baseline（Commit: `73b0e1e`，2026-04-20）  
> **当前版本**：v8.2（在 v8.0 基线上经 22 次提交迭代）  
> **分支**：`main`  
> **⚠️ 重要：v8.0 基线保护规则仍然有效。后续新增/调整均基于本版本（v8.2）之上。**

---

## 📊 总体数据

| 指标 | v8.0 基线值 | v8.2 当前值 | 变化 |
|------|------------|------------|------|
| 总条目数（index.json items） | 72 | **73** | +1 |
| 模块数 | 9 | **9** | — |
| sidebar.json 一级分类 | 8+1 | **8+1** | — |
| HTML 知识页面 | 90+ | **91+**（含 ui-production-workflow.html） | +1 |
| 桌面工具 exe | 6 | **6** | — |
| 在线工具 | 6 | **6** | — |
| 首页板块 | 8 | **8** | — |
| CARD_GRID_MAP 映射组 | 25 | **25** | — |
| 内容类型 | 6 类 | **6 类** | — |
| 质量等级 | 4 级 | **4 级** | — |

---

## 🆕 v8.0→v8.2 变更记录

### 新增条目
| # | ID | 标题 | 模块 | 类型 | 质量 |
|---|-----|------|------|------|------|
| 73 | `ui-production-workflow` | UI 界面制作全流程 | project | iframe/html | ⭐ 精华 |

### 功能变更（22 次提交）
| 提交 | 类型 | 说明 |
|------|------|------|
| `a75085d` | feat | 新增 UI 界面制作全流程文档（ui-production-workflow） |
| `49ef419` | refactor | 重命名「美术生产管线总览」为「角色美术资产管线」 |
| `077e069` | chore | 更新桌面版工具 exe 至最新版本 |
| `759524a` | feat | Auto Mask v7.0 — 二值化Mask模式 + 画布调整功能 |
| `7c4f3ad` | feat | AI 助手改为纯本地知识库搜索引擎（移除 Coze SDK 外部依赖） |
| `810c59b` | feat | AI 搜索引擎增强 — 多策略搜索 + 中文分词 + 暴力兜底 |
| `ebad64f` | fix | AI 搜索结果跳转空白问题修复 |
| `cc52ece` | feat | 编辑模式权限控制 — 仅管理模式下可见编辑按钮 |
| `fb9ecc5`→`c5ec738` | style | UI 流程文档 SVG 流程图重构（8次视觉优化提交） |
| `6ad1f5a` | enhance | UI管线新增「设计稿偏离白模」异常处理机制 |
| `e88ce11` | optimize | ②需求评审补充触发场景/主导人/决策人；⑫动效评审精简流程 |
| `1651d2c` | optimize | ⑭界面走查负责人改为策划/UI/Layout主导，QA专注功能测试 |

---

## 📋 模块一：项目管理与排期 (project) — 11 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `game-art-pipeline` | 角色美术资产管线 — 2D/Spine/二次元制作全流程 | iframe/html | ⭐ 精华 | 2026-03-25 |
| 2 | `ui-production-workflow` | UI 界面制作全流程 | iframe/html | ⭐ 精华 | 2026-04-21 |
| 3 | `art-scheduling` | 美术排期与里程碑管理 | md | 📄 初版 | 2026-04-07 |
| 4 | `svn-perforce-structure` | SVN/Perforce 目录结构标准 | md | 📄 初版 | 2026-04-07 |
| 5 | `asset-submit-review` | 资产提交与审核工作流 | md | 📄 初版 | 2026-04-07 |
| 6 | `progress-visualization` | 进度可视化工具 | md | 📄 初版 | 2026-04-07 |
| 7 | `jira-tapd-automation` | 项目管理工具模板 | md | 📄 初版 | 2026-04-07 |
| 8 | `outsource-vs-inhouse-decision` | 外包 vs 内发决策矩阵 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 9 | `delay-response-decision` | 项目延期应对决策 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 10 | `deprecated-asset-cleanup` | 废弃资产归档与清理规范 | iframe/html | ✅ 成熟 | 2026-04-09 |
| 11 | `personal-growth-roadmap` | APM 个人成长路线图 | md | 📄 初版 | 2026-04-07 |
| 12 | `personal-growth-interactive` | APM 成长中心（互动版） | iframe/html | ✅ 成熟 | 2026-04-14 |

---

## 📦 模块二：外包全链路管理 (outsource) — 6 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `cp-outsource` | 外包管理与验收规范 | iframe/html | ⭐ 精华 | 2026-03-25 |
| 2 | `cp-management` | 外包资产验收 Checklist（附录） | iframe/html | ✅ 成熟 | 2026-03-30 |
| 3 | `outsource-workload-model` | 美术外包工作量评估标准 (人天模型) | md | 📄 初版 | 2026-04-07 |
| 4 | `budget-apply` | 外包预算申请与结算流转 | md | ✅ 成熟 | 2026-04-07 |
| 5 | `cost-standard` | 美术人月成本核算标准 | md | ✅ 成熟 | 2026-04-07 |
| 6 | `supplier-ecosystem` | 供应商生态管理规范 | iframe/html | ✅ 成熟 | 2026-04-09 |

---

## 🎨 模块三：美术工艺与规范 (craft) — 14 条

| # | ID | 标题 | 工艺 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|------|----------|
| 1 | `char-naming-redline` | 资产命名与性能红线 | 通用 | iframe/html | ⭐ 精华 | 2026-04-10 |
| 2 | `char-color-swap-pipeline` | 2D 角色换色工业化全管线 | 角色 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 3 | `spine-animation-pipeline` | Spine 动画导出与性能排雷全指南 | 角色 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 4 | `char-3d-topo-pbr` | 拓扑与 PBR 贴图规范 | 角色 | iframe/html | ✅ 成熟 | 2026-04-10 |
| 5 | `char-ugc-parts-safety` | [UGC] 部件拆分与安全区规范 | UGC | iframe/html | ⭐ 精华 | 2026-04-10 |
| 6 | `ugc-2d-export-spec` | 2D 出图与图层规范 | UGC | iframe/html | 📄 初版 | 2026-04-10 |
| 7 | `ui-slice-naming` | 切图与命名规范 | UI | iframe/html | ✅ 成熟 | 2026-03-28 |
| 8 | `ui-9slice-color` | [UI] 9宫格与颜色空间 | UI | iframe/html | 📄 初版 | 2026-03-28 |
| 9 | `ui-layout` | [UI] Layout 拼接规范 | UI | iframe/html | 📄 初版 | 2026-03-28 |
| 10 | `ui-umg-tips` | UMG 生成技巧 | UI | iframe/html | ✅ 成熟 | 2026-04-01 |
| 11 | `scene-lod-spec` | 模块化与 LOD 规范 | 场景 | iframe/html | 📄 初版 | 2026-03-30 |
| 12 | `vfx-perf-spec` | [特效] 性能红线与层级规范 | 特效 | md | 📄 初版 | 2026-04-07 |
| 13 | `anim-state-handoff` | 动画状态机交接与导出规范 | 角色 | md | 📄 初版 | 2026-04-07 |
| 14 | `aigc-production-spec` | [AIGC] 辅助生产规范 | AIGC | iframe/html | ✅ 成熟 | 2026-04-10 |

---

## 🤝 模块四：跨部门协同与交付 (collab) — 9 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `art-vs-planner-req` | 需求对接流转规范 | md | ✅ 成熟 | 2026-04-07 |
| 2 | `art-vs-planner-template` | UI/原画需求模板 | md | 📄 初版 | 2026-04-07 |
| 3 | `art-vs-ta-naming` | 引擎导入与命名规范 | md | 📄 初版 | 2026-04-07 |
| 4 | `art-vs-ta-perfbudget` | 性能红线与资产预算 | md | ✅ 成熟 | 2026-04-07 |
| 5 | `perf-redline-glossary` | 跨工种黑话速查表 | iframe/html | ✅ 成熟 | 2026-03-30 |
| 6 | `art-vs-qa-buggrade` | 美术表现类 Bug 定级标准 | md | 📄 初版 | 2026-04-07 |
| 7 | `art-vs-qa-checklist` | 版本走查验收清单 | md | 📄 初版 | 2026-04-07 |
| 8 | `cross-dept-collab` | 跨部门协作三大经典痛点 — 策略破局指南 | iframe/html | ⭐ 精华 | 2026-03-28 |
| 9 | `cross-dept-communication-tips` | 跨部门沟通话术模板 — 7 大场景 | md | 📄 初版 | 2026-04-07 |

---

## 🛠️ 模块五：工具链与自动化 (toolchain) — 17 条

### 工具规范文档（3 条）
| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `auto-mask-spec` | [工具规范] 自动 Mask 通道生成器 | iframe/html | ✅ 成熟 | 2026-04-10 |
| 2 | `spine-split-spec` | [工具规范] Spine 角色拆分工具 | iframe/html | ✅ 成熟 | 2026-04-10 |
| 3 | `naming-check-tool` | 资产合规性检查工具 | md | 📄 初版 | 2026-04-07 |

### 美术在线工具（6 个）
| # | ID | 标题 | 质量 | 最后更新 |
|---|-----|------|------|----------|
| 1 | `auto-mask-v6` | 自动 Mask 生成器 v6.0 | ⭐ 精华 | 2026-04-09 |
| 2 | `mask-tool` | Mask 手动编辑器 | ✅ 成熟 | 2026-03-31 |
| 3 | `spine-split` | Spine 拆分工具 | ✅ 成熟 | 2026-04-07 |
| 4 | `mask-core-algorithms` | Mask 核心算法演示 | ✅ 成熟 | 2026-04-02 |
| 5 | `color-swap-tool` | 2D 角色换色资源生成器 | ⭐ 精华 | 2026-04-10 |
| 6 | `channel-packer` | 贴图通道打包工具 | ✅ 成熟 | 2026-03-28 |

### 桌面工具 & 引擎直连（7 个）
| # | ID | 标题 | exe 文件 | 最后更新 |
|---|-----|------|----------|----------|
| 1 | `auto-mask-v6-desktop` | 自动 Mask v7.0 (桌面版) | AutoMaskGenerator-v7.0.0-Portable.exe | 2026-04-29 |
| 2 | `image-skew-corrector` | 图片倾斜矫正 (桌面版) | ImageSkewCorrector.exe | 2026-04-01 |
| 3 | `game-resource-toolkit` | 游戏资源工具集 (桌面版) | GameResourceToolkit.exe | 2026-04-15 |
| 4 | `canvas-resizer` | 图片尺寸统一调整 (桌面版) | CanvasResizer.exe | 2026-04-17 |
| 5 | `ugc-batch-uploader` | UGC 批量上传助手 (桌面版) | UGCBatchUploader.exe | 2026-04-16 |
| 6 | `resource-sorter` | 资源分拣与增量同步 (桌面版) | ResourceSorter.exe | 2026-04-16 |
| 7 | `engine-bridge` | Engine Bridge 引擎直连 | — | 2026-03-30 |

### 使用指南（1 条）
| # | ID | 标题 | 质量 | 最后更新 |
|---|-----|------|------|----------|
| 1 | `art-tools-guide` | 🛠️ 美术在线工具使用指南 | ⭐ 精华 | 2026-04-10 |

---

## 🛡️ 模块六：质量、风险与团队 (quality) — 5 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `risk-log` | 项目风险登记册 (Risk Log) 规范 | md | ✅ 成熟 | 2026-04-07 |
| 2 | `art-efficiency-system` | 美术效能度量与标准化汇报体系 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 3 | `asset-security-handover` | 美术资产防泄密与离职交接 SOP | iframe/html | ⭐ 精华 | 2026-04-09 |
| 4 | `onboarding-guide` | 美术新人入职管线必读 (Onboarding) | md | ✅ 成熟 | 2026-04-07 |
| 5 | `permission-nav` | 常用系统权限申请导航 | md | 📄 初版 | 2026-04-07 |

---

## 🔥 模块七：真实案例库 (casestudy) — 5 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `accident-troubleshoot` | 事故案例 — 典型事故排雷手册 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 2 | `postmortem-template` | 复盘模板 — 版本研发 Post-mortem | iframe/html | ✅ 成熟 | 2026-04-13 |
| 3 | `project-pitfall-log` | 项目管理踩坑复盘 — 7 大真实案例全收录 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 4 | `case-template-observer` | 案例模板A — 观察者视角 | iframe/html | ✅ 成熟 | 2026-04-14 |
| 5 | `case-template-support` | 案例模板B — 支援角色视角 | iframe/html | ✅ 成熟 | 2026-04-14 |

---

## 📌 模块八：我的项目笔记 (mynotes) — 4 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `tmpl-project-postmortem` | 📝 项目复盘报告模板 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 2 | `tmpl-weekly-report` | 📊 项目周报模板 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 3 | `tmpl-decision-record` | ⚖️ 决策记录模板 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 4 | `tmpl-meeting-notes` | 📝 会议纪要模板 | iframe/html | ✅ 成熟 | 2026-04-13 |

---

## ⚙️ 模块九：系统与维护 (system) — 1 条

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `editor-guide` | 可视化编辑器使用指南 | doc | ✅ 成熟 | 2026-04-09 |

---

## 🏠 首页功能清单

### 首页组件架构（从上到下）
| # | 组件名称 | 功能说明 | 状态 |
|---|---------|---------|------|
| 1 | **Hero 区域** | 标题 + 标语 + 内容分布比例条 + 阶段快速筛选（4个阶段按钮） | ✅ |
| 2 | **🧭 角色探索** | 4 张角色卡片（新人美术/TA程序/外包PM/QA主美），每张含推荐文档链接 | ✅ |
| 3 | **角色专属视图** | 点击"查看该角色全部文档"进入专属筛选模式（artist/qa 两个角色） | ✅ |
| 4 | **🔥 高频速查·最近更新** | 横向滚动卡片，双Tab切换（高频/最近更新），带优先级标签 | ✅ |
| 5 | **🆘 高频痛点急救包** | 3 列布局：需求频繁变更/资源冲突与抢人/进度延期与排期爆炸 | ✅ |
| 6 | **📑 知识库总览** | 折叠区域，3 个 Tab（核心知识地图/问题速查表/阶段阅读路线） | ✅ |
| 7 | **🔀 跨部门协作流程可视化** | 折叠区域，3 个 Mermaid 时序图 Tab（需求→制作→打回/外包全生命周期/Bug修复闭环） | ✅ |
| 8 | **📊 APM 管理仪表盘** | 折叠区域，含统计概览(7列) + 里程碑进度 + 预算消耗环形图 + 活跃风险项 | ✅ |
| 9 | **8 大模块板块** | 可折叠手风琴布局，每个板块含子分组和文档卡片网格 | ✅ |
| 10 | **互动模块占位** | 文档版本历史 + 评论反馈（占位，未启用） | 🔲 占位 |

### 首页卡片映射 (CARD_GRID_MAP) — 25 组
```javascript
// 板块一：📋 项目管理与排期（6组）
'grid-project-pipeline':   { module:'project', ids:['game-art-pipeline','ui-production-workflow'] }
'grid-project-schedule':   { module:'project', ids:['art-scheduling','progress-visualization'] }
'grid-project-req':        { module:'project', ids:['art-vs-planner-req','jira-tapd-automation'] }
'grid-project-version':    { module:'project', ids:['svn-perforce-structure','asset-submit-review','deprecated-asset-cleanup'] }
'grid-project-decision':   { module:'project', ids:['outsource-vs-inhouse-decision','delay-response-decision'] }
'grid-project-growth':     { module:'quality', ids:['personal-growth-roadmap','personal-growth-interactive'] }

// 板块二：📦 外包全链路管理（4组）
'grid-outsource-eval':     { module:'outsource', ids:['cp-outsource','cp-management'] }
'grid-outsource-workload': { module:'outsource', ids:['outsource-workload-model'] }
'grid-outsource-budget':   { module:'outsource', ids:['budget-apply','cost-standard'] }
'grid-outsource-supplier': { module:'outsource', ids:['supplier-ecosystem'] }

// 板块三：🎨 美术工艺与规范（8组）
'grid-craft-base':         { module:'craft', ids:['char-naming-redline'] }
'grid-craft-char-2d':      { module:'craft', ids:['char-color-swap-pipeline','spine-animation-pipeline'] }
'grid-craft-char-3d':      { module:'craft', ids:['char-3d-topo-pbr','anim-state-handoff'] }
'grid-craft-ui':           { module:'craft', ids:['ui-slice-naming','ui-9slice-color','ui-layout','ui-umg-tips'] }
'grid-craft-scene':        { module:'craft', ids:['scene-lod-spec'] }
'grid-craft-vfx':          { module:'craft', ids:['vfx-perf-spec'] }
'grid-craft-ugc':          { module:'craft', ids:['char-ugc-parts-safety','ugc-2d-export-spec'] }
'grid-craft-aigc':         { module:'craft', ids:['aigc-production-spec'] }

// 板块四：🤝 跨部门协同与交付（3组）
'grid-collab-ta':          { module:'collab', ids:['art-vs-ta-naming','art-vs-ta-perfbudget','perf-redline-glossary'] }
'grid-collab-qa':          { module:'collab', ids:['art-vs-qa-buggrade','art-vs-qa-checklist'] }
'grid-collab-pain':        { module:'collab', ids:['cross-dept-collab','cross-dept-communication-tips','art-vs-planner-template'] }

// 板块五：🛠️ 工具链与自动化（5组）
'grid-toolchain-overview': { module:'toolchain', ids:['art-tools-guide'] }
'grid-toolchain-spec':     { module:'toolchain', ids:['auto-mask-spec','spine-split-spec'] }
'grid-toolchain-check':    { module:'toolchain', ids:['naming-check-tool'] }
'grid-toolchain-art':      { module:'toolchain', ids:['auto-mask-v6','mask-tool','spine-split','mask-core-algorithms','color-swap-tool','channel-packer'] }
'grid-toolchain-desktop':  { module:'toolchain', ids:['auto-mask-v6-desktop','image-skew-corrector','game-resource-toolkit','canvas-resizer','ugc-batch-uploader','resource-sorter','engine-bridge'] }

// 板块六：🛡️ 质量、风险与团队（4组）
'grid-quality-risk':       { module:'quality', ids:['risk-log'] }
'grid-quality-metrics':    { module:'quality', ids:['art-efficiency-system'] }
'grid-quality-security':   { module:'quality', ids:['asset-security-handover'] }
'grid-quality-team':       { module:'quality', ids:['onboarding-guide','permission-nav'] }

// 板块七：🔥 真实案例库（2组）
'grid-casestudy-cases':    { module:'casestudy', ids:['project-pitfall-log','accident-troubleshoot','postmortem-template'] }
'grid-casestudy-templates':{ module:'casestudy', ids:['case-template-observer','case-template-support'] }

// 板块八：📌 我的项目笔记（2组）
'grid-mynotes-templates':  { module:'mynotes', ids:['tmpl-project-postmortem','tmpl-weekly-report','tmpl-decision-record','tmpl-meeting-notes'] }
'grid-mynotes-quick':      { module:'mynotes', ids:['editor-guide'] }
```

---

## 🧩 网站功能清单

### 核心功能
| # | 功能 | 说明 | 技术实现 |
|---|------|------|---------|
| 1 | **侧边栏导航** | 8+1 分类、可展开/折叠、右键上下文菜单 | sidebar.json 驱动 |
| 2 | **全局搜索** | Ctrl+K 命令面板 + 搜索框实时匹配 | Fuse.js 模糊搜索 |
| 3 | **文档渲染** | Markdown 文档 + iframe HTML 文档 | marked.js / iframe sandbox |
| 4 | **阶段筛选** | 预研期/量产期/测试期/全阶段 快速过滤 | stageConfig 驱动 |
| 5 | **标签过滤** | 点击标签筛选同类文档 | tags 字段过滤 |
| 6 | **面包屑导航** | 文档详情页显示路径层级 | 动态生成 |
| 7 | **相关文档推荐** | 文档详情页底部推荐 | tags/keywords 匹配 |
| 8 | **工具页面** | 在线工具独立渲染页 | tool type 特殊处理 |

### 编辑与创作
| # | 功能 | 说明 |
|---|------|------|
| 1 | **Markdown 编辑器** | Vditor 所见即所得编辑器 |
| 2 | **HTML 模板** | 9 种模板（标准规范/图文混排/项目看板/复盘报告/周报/决策记录/会议纪要/案例A/案例B） |
| 3 | **发布到仓库** | GitHub API 直接提交到 main 分支 |
| 4 | **管理模式** | 隐藏管理按钮，仅管理员可见 |
| 5 | **文档管理中心** | 全量文档浏览、搜索、分类筛选 |

### AI 智能助手
| # | 功能 | 说明 |
|---|------|------|
| 1 | **纯本地搜索** | 移除 Coze SDK，全部本地运算 |
| 2 | **三级搜索策略** | 全文索引 → Fuse.js 模糊 → 暴力关键词扫描 |
| 3 | **中文分词** | 停用词过滤 + 滑动窗口2/3字分词 |
| 4 | **对话管理** | 导出/清屏/隐私重置/搜索历史 |
| 5 | **建议芯片** | 3 个快速提问建议 |

### 快速记录
| # | 功能 | 说明 |
|---|------|------|
| 1 | **浮动按钮** | 可拖拽📌按钮 |
| 2 | **快速笔记** | 标题+内容+8种标签 |
| 3 | **查看全部** | 搜索/标签筛选/导出/清空 |
| 4 | **右键菜单** | 新建/查看/上传/导出/重置位置 |

### 其他
| # | 功能 | 说明 |
|---|------|------|
| 1 | **分享链接** | 🔗 复制当前文档直链 |
| 2 | **反馈按钮** | 💬 右上角反馈入口 |
| 3 | **返回顶部** | ↑ 快捷键 Home |
| 4 | **访客统计** | analytics.js 静默采集 |
| 5 | **Mermaid 时序图** | 3 组跨部门协作流程可视化 |
| 6 | **仪表盘** | 里程碑/预算/风险概览 |

---

## 📂 sidebar.json 导航结构

### 一级分类（9 个）
1. **📋 项目管理与排期** — 6 组：管线总览(2) / 排期与里程碑(2) / 需求流转(2) / 资产库与版本管理(3) / 决策指南(2) / 个人成长(2)
2. **📦 外包全链路管理** — 4 组：外包评级与验收(2) / 人天模型与报价(1) / 预算与结算(2) / 供应商生态(1)
3. **🎨 美术工艺与规范** — 8 组：通用基础(1) / 2D 角色(2) / 3D 角色(2) / UI(4) / 场景(1) / 特效(1) / UGC 专项(2) / AIGC 专项(1)
4. **🤝 跨部门协同与交付** — 4 组：美术 vs 程序/TA(3) / 美术 vs QA(2) / 需求模板(1) / 协作痛点与事故(2)
5. **🛠️ 工具链与自动化** — 5 组：工具规范文档(2) / 检查与合规脚本(1) / 美术在线工具(6) / 桌面工具 & 引擎直连(7) + 顶层使用指南(1)
6. **🛡️ 质量、风险与团队** — 4 组：风险管控(1) / 效能度量(1) / 资产安全与交接(1) / 新人入职与成长(2)
7. **🔥 真实案例库** — 4 组：踩坑记录(1) / 事故排雷(1) / 复盘模板(1) / 案例写作模板(2)
8. **📌 我的项目笔记** — 2 组：文档(0) / 实战模板(4)
9. **⚙️ 系统与维护** — 1 组：使用指南(1)

---

## 🔑 关键配置文件

| 文件 | 用途 | 条目/行数 |
|------|------|--------|
| `docs/index.json` | 全量元数据索引 | 73 items |
| `docs/sidebar.json` | 左侧导航结构 | 9 分类 |
| `docs/app.js` | 前端逻辑（含 CARD_GRID_MAP） | ~6400 行 |
| `docs/style.css` | 全局样式 | 深色主题 |
| `docs/analytics.js` | 访客统计采集 | 静默运行 |
| `docs/index.html` | 首页入口（含全部 HTML 结构） | ~1392 行 |
| `docs/search-index.json` | 全文搜索索引 | build-search-index.js 生成 |
| `coze-system-prompt.md` | Coze 智能体系统提示词（历史遗留） | 已移除 SDK 依赖 |

---

## 📁 桌面工具 exe 文件清单

| 文件名 | 大小 (bytes) | 最后修改时间 |
|--------|-------------|-------------|
| AutoMaskGenerator-v7.0.0-Portable.exe | 74,216,960 | 2026-04-29 |
| CanvasResizer.exe | 65,824,394 | 2026-04-17 |
| GameResourceToolkit.exe | 31,745,875 | 2026-04-15 |
| ImageSkewCorrector.exe | 62,898,477 | 2026-04-01 |
| ResourceSorter.exe | 65,776,791 | 2026-04-16 |
| UGCBatchUploader.exe | 71,276,566 | 2026-04-16 |

---

## ⚠️ 版本保护规则（v8.0 基线规则 + v8.2 扩展）

### v8.0 基线保护（不可违反）
1. **不得删除** v8.0 快照中的任何条目（ID、标题、描述、路径）
2. **不得修改** 已有条目的 `id` 字段
3. **不得修改** 已有 HTML 页面的核心功能描述（可追加不可删减）
4. **不得移除** sidebar.json 中已有的导航项
5. **不得移除** CARD_GRID_MAP 中已有的映射关系
6. **不得移除** index.json 中已有条目的 tags/keywords

### v8.2 扩展保护（本版本新增）
7. **不得删除** `ui-production-workflow` 条目及其 HTML 页面
8. **不得移除** CARD_GRID_MAP 中 `grid-project-pipeline` 的 `ui-production-workflow` 映射
9. **不得移除** AI 助手纯本地搜索功能（三级搜索策略）
10. **不得移除** 编辑模式权限控制机制
11. **不得回退** UI 流程文档中已优化的②需求评审/⑫动效评审/⑭界面走查的角色定位

### 允许的操作
- ✅ 新增条目
- ✅ 追加功能（在保留原有内容的前提下）
- ✅ UI/样式优化（不影响功能内容）
- ✅ Bug 修复
- ✅ 文档内容追加（不删减已有内容）

---

*此快照由 AI 助手生成于 2026-04-22，基于 Git commit `1651d2c`。后续所有新增/调整均应基于本版本之上。*
