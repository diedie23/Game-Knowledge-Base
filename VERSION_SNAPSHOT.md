# 📸 版本快照 — APM 知识库 v8.0 Baseline

> **快照时间**：2026-04-20  
> **Git Commit**：`73b0e1e06e55386d51d797e5de353fe259afae9d`  
> **Git Tag**：`v8.0-baseline`  
> **分支**：`main`  
> **⚠️ 重要：此版本点的所有功能内容为基线，后续任何优化都必须保证此版本点的内容不变。**

---

## 📊 总体数据

| 指标 | 数值 |
|------|------|
| 知识库版本 | 8.0 |
| 总条目数 | **72** |
| 模块数 | **9**（项目管理/外包/美术工艺/跨部门协同/工具链/质量风险/真实案例/项目笔记/系统维护） |
| HTML 页面 | 90+ |
| 桌面工具 exe | **5** 个 |
| 在线工具 | **6** 个 |
| 内容类型 | 规范 / 方法论 / 实战经验 / 工具 / 模板 / 指南 |
| 质量等级 | 草稿 / 初版 / 成熟 / 精华 |

---

## 📋 模块一：项目管理与排期 (project)

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `game-art-pipeline` | 美术生产管线总览 — 2D/3D/二次元全流程 | iframe/html | ⭐ 精华 | 2026-03-25 |
| 2 | `art-scheduling` | 美术排期与里程碑管理 | md | 📄 初版 | 2026-04-07 |
| 3 | `svn-perforce-structure` | SVN/Perforce 目录结构标准 | md | 📄 初版 | 2026-04-07 |
| 4 | `asset-submit-review` | 资产提交与审核工作流 | md | 📄 初版 | 2026-04-07 |
| 5 | `progress-visualization` | 进度可视化工具 | md | 📄 初版 | 2026-04-07 |
| 6 | `jira-tapd-automation` | 项目管理工具模板 | md | 📄 初版 | 2026-04-07 |
| 7 | `outsource-vs-inhouse-decision` | 外包 vs 内发决策矩阵 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 8 | `delay-response-decision` | 项目延期应对决策 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 9 | `deprecated-asset-cleanup` | 废弃资产归档与清理规范 | iframe/html | ✅ 成熟 | 2026-04-09 |

---

## 📦 模块二：外包全链路管理 (outsource)

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `cp-outsource` | 外包管理与验收规范 | iframe/html | ⭐ 精华 | 2026-03-25 |
| 2 | `cp-management` | 外包资产验收 Checklist（附录） | iframe/html | ✅ 成熟 | 2026-03-30 |
| 3 | `outsource-workload-model` | 美术外包工作量评估标准 (人天模型) | md | 📄 初版 | 2026-04-07 |
| 4 | `budget-apply` | 外包预算申请与结算流转 | md | ✅ 成熟 | 2026-04-07 |
| 5 | `cost-standard` | 美术人月成本核算标准 | md | ✅ 成熟 | 2026-04-07 |
| 6 | `supplier-ecosystem` | 供应商生态管理规范 | iframe/html | ✅ 成熟 | 2026-04-09 |

---

## 🎨 模块三：美术工艺与规范 (craft)

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

## 🤝 模块四：跨部门协同与交付 (collab)

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

## 🛠️ 模块五：工具链与自动化 (toolchain)

### 工具规范文档
| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `auto-mask-spec` | [工具规范] 自动 Mask 通道生成器 | iframe/html | ✅ 成熟 | 2026-04-10 |
| 2 | `spine-split-spec` | [工具规范] Spine 角色拆分工具 | iframe/html | ✅ 成熟 | 2026-04-10 |
| 3 | `naming-check-tool` | 资产合规性检查工具 | md | 📄 初版 | 2026-04-07 |

### 美术在线工具（共 6 个）
| # | ID | 标题 | 质量 | 最后更新 |
|---|-----|------|------|----------|
| 1 | `auto-mask-v6` | 自动 Mask 生成器 v6.0 | ⭐ 精华 | 2026-04-09 |
| 2 | `mask-tool` | Mask 手动编辑器 | ✅ 成熟 | 2026-03-31 |
| 3 | `spine-split` | Spine 拆分工具 | ✅ 成熟 | 2026-04-07 |
| 4 | `mask-core-algorithms` | Mask 核心算法演示 | ✅ 成熟 | 2026-04-02 |
| 5 | `color-swap-tool` | 2D 角色换色资源生成器 | ⭐ 精华 | 2026-04-10 |
| 6 | `channel-packer` | 贴图通道打包工具 | ✅ 成熟 | 2026-03-28 |

### 桌面工具 & 引擎直连（共 7 个）
| # | ID | 标题 | exe 文件 | 版本/大小 | 最后更新 |
|---|-----|------|----------|-----------|----------|
| 1 | `auto-mask-v6-desktop` | 自动 Mask v6.0 (桌面版) | AutoMaskGenerator-v6.0.0-Portable.exe | — | 2026-04-09 |
| 2 | `image-skew-corrector` | 图片倾斜矫正 (桌面版) | ImageSkewCorrector.exe | 62,898,477 bytes | 2026-04-01 |
| 3 | `game-resource-toolkit` | 游戏资源工具集 (桌面版) | GameResourceToolkit.exe | 31,745,875 bytes | 2026-04-15 |
| 4 | `canvas-resizer` | 图片尺寸统一调整 (桌面版) | CanvasResizer.exe | 65,824,394 bytes / **v1.0.14** | 2026-04-17 |
| 5 | `ugc-batch-uploader` | UGC 批量上传助手 (桌面版) | UGCBatchUploader.exe | 71,276,566 bytes | 2026-04-16 |
| 6 | `resource-sorter` | 资源分拣与增量同步 (桌面版) | ResourceSorter.exe | 65,776,791 bytes | 2026-04-16 |
| 7 | `engine-bridge` | Engine Bridge 引擎直连 | — | — | 2026-03-30 |

### 使用指南
| # | ID | 标题 | 质量 | 最后更新 |
|---|-----|------|------|----------|
| 1 | `art-tools-guide` | 🛠️ 美术在线工具使用指南 | ⭐ 精华 | 2026-04-10 |

---

## 🛡️ 模块六：质量、风险与团队 (quality)

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `risk-log` | 项目风险登记册 (Risk Log) 规范 | md | ✅ 成熟 | 2026-04-07 |
| 2 | `art-efficiency-system` | 美术效能度量与标准化汇报体系 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 3 | `asset-security-handover` | 美术资产防泄密与离职交接 SOP | iframe/html | ⭐ 精华 | 2026-04-09 |
| 4 | `onboarding-guide` | 美术新人入职管线必读 (Onboarding) | md | ✅ 成熟 | 2026-04-07 |
| 5 | `permission-nav` | 常用系统权限申请导航 | md | 📄 初版 | 2026-04-07 |
| 6 | `personal-growth-roadmap` | APM 个人成长路线图 | md | 📄 初版 | 2026-04-07 |
| 7 | `personal-growth-interactive` | 🌱 APM 个人成长中心（互动版） | iframe/html | ✅ 成熟 | 2026-04-14 |

---

## 🔥 模块七：真实案例库 (casestudy)

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `accident-troubleshoot` | 事故案例 — 典型事故排雷手册 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 2 | `postmortem-template` | 复盘模板 — 版本研发 Post-mortem | iframe/html | ✅ 成熟 | 2026-04-13 |
| 3 | `project-pitfall-log` | 项目管理踩坑复盘 — 7 大真实案例全收录 | iframe/html | ⭐ 精华 | 2026-04-13 |
| 4 | `case-template-observer` | 案例模板A — 观察者视角 | iframe/html | ✅ 成熟 | 2026-04-14 |
| 5 | `case-template-support` | 案例模板B — 支援角色视角 | iframe/html | ✅ 成熟 | 2026-04-14 |

---

## 📌 模块八：我的项目笔记 (mynotes)

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `tmpl-project-postmortem` | 📝 项目复盘报告模板 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 2 | `tmpl-weekly-report` | 📊 项目周报模板 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 3 | `tmpl-decision-record` | ⚖️ 决策记录模板 | iframe/html | ✅ 成熟 | 2026-04-13 |
| 4 | `tmpl-meeting-notes` | 📝 会议纪要模板 | iframe/html | ✅ 成熟 | 2026-04-13 |

---

## ⚙️ 模块九：系统与维护 (system)

| # | ID | 标题 | 类型 | 质量 | 最后更新 |
|---|-----|------|------|------|----------|
| 1 | `editor-guide` | 可视化编辑器使用指南 | doc | ✅ 成熟 | 2026-04-09 |

---

## 🏠 首页卡片映射 (CARD_GRID_MAP)

```javascript
// 板块一：📋 项目管理与排期
'grid-project-pipeline':   { module:'project', ids:['game-art-pipeline'] }
'grid-project-schedule':   { module:'project', ids:['art-scheduling','progress-visualization'] }
'grid-project-demand':     { module:'project', ids:['art-vs-planner-req','jira-tapd-automation'] }
'grid-project-repo':       { module:'project', ids:['svn-perforce-structure','asset-submit-review','deprecated-asset-cleanup'] }
'grid-project-decision':   { module:'project', ids:['outsource-vs-inhouse-decision','delay-response-decision'] }
'grid-project-growth':     { module:'quality', ids:['personal-growth-roadmap','personal-growth-interactive'] }

// 板块二：📦 外包全链路管理
'grid-outsource-standard': { module:'outsource', ids:['cp-outsource','cp-management'] }
'grid-outsource-workload': { module:'outsource', ids:['outsource-workload-model'] }
'grid-outsource-budget':   { module:'outsource', ids:['budget-apply','cost-standard'] }
'grid-outsource-supplier': { module:'outsource', ids:['supplier-ecosystem'] }

// 板块三：🎨 美术工艺与规范
'grid-craft-common':       { module:'craft', ids:['char-naming-redline'] }
'grid-craft-char2d':       { module:'craft', ids:['char-color-swap-pipeline','spine-animation-pipeline'] }
'grid-craft-char3d':       { module:'craft', ids:['char-3d-topo-pbr','anim-state-handoff'] }
'grid-craft-ui':           { module:'craft', ids:['ui-slice-naming','ui-9slice-color','ui-layout','ui-umg-tips'] }
'grid-craft-scene':        { module:'craft', ids:['scene-lod-spec'] }
'grid-craft-vfx':          { module:'craft', ids:['vfx-perf-spec'] }
'grid-craft-ugc':          { module:'craft', ids:['char-ugc-parts-safety','ugc-2d-export-spec'] }
'grid-craft-aigc':         { module:'craft', ids:['aigc-production-spec'] }

// 板块四：🤝 跨部门协同与交付
'grid-collab-ta':          { module:'collab', ids:['art-vs-ta-naming','art-vs-ta-perfbudget','perf-redline-glossary'] }
'grid-collab-qa':          { module:'collab', ids:['art-vs-qa-buggrade','art-vs-qa-checklist'] }
'grid-collab-pain':        { module:'collab', ids:['cross-dept-collab','cross-dept-communication-tips','art-vs-planner-template'] }

// 板块五：🛠️ 工具链与自动化
'grid-toolchain-overview': { module:'toolchain', ids:['art-tools-guide'] }
'grid-toolchain-spec':     { module:'toolchain', ids:['auto-mask-spec','spine-split-spec'] }
'grid-toolchain-check':    { module:'toolchain', ids:['naming-check-tool'] }
'grid-toolchain-art':      { module:'toolchain', ids:['auto-mask-v6','mask-tool','spine-split','mask-core-algorithms','color-swap-tool','channel-packer'] }
'grid-toolchain-desktop':  { module:'toolchain', ids:['auto-mask-v6-desktop','image-skew-corrector','game-resource-toolkit','canvas-resizer','ugc-batch-uploader','resource-sorter','engine-bridge'] }

// 板块六：🛡️ 质量、风险与团队
'grid-quality-risk':       { module:'quality', ids:['risk-log'] }
'grid-quality-metrics':    { module:'quality', ids:['art-efficiency-system'] }
'grid-quality-security':   { module:'quality', ids:['asset-security-handover'] }
'grid-quality-team':       { module:'quality', ids:['onboarding-guide','permission-nav'] }

// 板块七：🔥 真实案例库
'grid-casestudy-cases':    { module:'casestudy', ids:['project-pitfall-log','accident-troubleshoot','postmortem-template'] }
'grid-casestudy-templates':{ module:'casestudy', ids:['case-template-observer','case-template-support'] }

// 板块八：📌 我的项目笔记
'grid-mynotes-templates':  { module:'mynotes', ids:['tmpl-project-postmortem','tmpl-weekly-report','tmpl-decision-record','tmpl-meeting-notes'] }
'grid-mynotes-quick':      { module:'mynotes', ids:['editor-guide'] }
```

---

## 📂 sidebar.json 导航结构

### 一级分类（8 个）
1. **📋 项目管理与排期** — 6 组：管线总览 / 排期与里程碑 / 需求流转 / 资产库与版本管理 / 决策指南 / 个人成长
2. **📦 外包全链路管理** — 4 组：外包评级与验收 / 人天模型与报价 / 预算与结算 / 供应商生态
3. **🎨 美术工艺与规范** — 8 组：通用基础 / 2D 角色 / 3D 角色 / UI / 场景 / 特效 / UGC 专项 / AIGC 专项
4. **🤝 跨部门协同与交付** — 4 组：美术 vs 程序/TA / 美术 vs QA / 需求模板 / 协作痛点与事故
5. **🛠️ 工具链与自动化** — 5 组：工具规范文档 / 检查与合规脚本 / 美术在线工具(6) / 桌面工具 & 引擎直连(7)
6. **🛡️ 质量、风险与团队** — 4 组：风险管控 / 效能度量 / 资产安全与交接 / 新人入职与成长
7. **🔥 真实案例库** — 4 组：踩坑记录 / 事故排雷 / 复盘模板 / 案例写作模板
8. **📌 我的项目笔记** — 2 组：文档 / 实战模板(4)

### 系统分类
9. **⚙️ 系统与维护** — 1 组：使用指南

---

## 📁 桌面工具 exe 文件清单

| 文件名 | 大小 (bytes) | 最后修改时间 |
|--------|-------------|-------------|
| AutoMaskGenerator-v6.0.0-Portable.exe | — (Git LFS) | 2026-04-09 |
| CanvasResizer.exe | 65,824,394 | 2026-04-17 19:46:27 |
| GameResourceToolkit.exe | 31,745,875 | 2026-04-15 16:30:04 |
| ImageSkewCorrector.exe | 62,898,477 | 2026-04-01 13:14:11 |
| ResourceSorter.exe | 65,776,791 | 2026-04-16 22:31:55 |
| UGCBatchUploader.exe | 71,276,566 | 2026-04-16 17:52:30 |

---

## 🔑 关键配置文件

| 文件 | 用途 | 条目数 |
|------|------|--------|
| `docs/index.json` | 全量元数据索引 | 72 items |
| `docs/sidebar.json` | 左侧导航结构 | 8+1 分类 |
| `docs/app.js` | 前端逻辑（含 CARD_GRID_MAP） | ~6360 行 |
| `coze-system-prompt.md` | Coze 智能体系统提示词 | 210 行 |

---

## 📌 Coze 智能体文档索引（基线）

以下文档 ID 已纳入 Coze 系统提示词：

- 项目管理（11）：game-art-pipeline, art-scheduling, progress-visualization, art-vs-planner-req, jira-tapd-automation, svn-perforce-structure, asset-submit-review, deprecated-asset-cleanup, outsource-vs-inhouse-decision, delay-response-decision, personal-growth-roadmap
- 外包管理（6）：cp-outsource, cp-management, outsource-workload-model, budget-apply, cost-standard, supplier-ecosystem
- 美术工艺（14）：char-naming-redline, char-color-swap-pipeline, spine-animation-pipeline, char-3d-topo-pbr, anim-state-handoff, ui-slice-naming, ui-9slice-color, ui-layout, ui-umg-tips, scene-lod-spec, vfx-perf-spec, char-ugc-parts-safety, ugc-2d-export-spec, aigc-production-spec
- 跨部门协同（8）：art-vs-ta-naming, art-vs-ta-perfbudget, perf-redline-glossary, art-vs-qa-buggrade, art-vs-qa-checklist, art-vs-planner-template, cross-dept-collab, cross-dept-communication-tips
- 工具链（11）：art-tools-guide, auto-mask-spec, spine-split-spec, naming-check-tool, auto-mask-v6, mask-tool, spine-split, color-swap-tool, channel-packer, auto-mask-v6-desktop, engine-bridge
- 质量风险（5）：risk-log, art-efficiency-system, asset-security-handover, onboarding-guide, permission-nav
- 真实案例（3）：project-pitfall-log, accident-troubleshoot, postmortem-template
- 项目模板（4）：tmpl-project-postmortem, tmpl-weekly-report, tmpl-decision-record, tmpl-meeting-notes

> ⚠️ 注意：Coze 提示词中**缺少以下已有条目**（未纳入索引）：
> - `personal-growth-interactive` — APM 个人成长中心（互动版）
> - `case-template-observer` — 案例模板A（观察者视角）
> - `case-template-support` — 案例模板B（支援角色视角）
> - `image-skew-corrector` — 图片倾斜矫正（桌面版）
> - `game-resource-toolkit` — 游戏资源工具集（桌面版）
> - `canvas-resizer` — 图片尺寸统一调整（桌面版）
> - `ugc-batch-uploader` — UGC 批量上传助手（桌面版）
> - `resource-sorter` — 资源分拣与增量同步（桌面版）

---

## ⚠️ 基线保护规则

**后续所有优化必须遵守：**

1. **不得删除** 以上任何条目（ID、标题、描述、路径）
2. **不得修改** 已有条目的 `id` 字段
3. **不得修改** 已有 HTML 页面的核心功能描述（版本号、功能列表可在原有基础上追加，不可删减）
4. **不得移除** sidebar.json 中已有的导航项
5. **不得移除** CARD_GRID_MAP 中已有的映射关系
6. **不得移除** index.json 中已有条目的 tags/keywords
7. **新增条目** ✅ 允许
8. **追加功能** ✅ 允许（在保留原有内容的前提下追加新功能描述）
9. **UI/样式优化** ✅ 允许（不影响功能内容）
10. **Bug 修复** ✅ 允许

---

*此快照由 AI 助手自动生成于 2026-04-20，基于 Git commit `73b0e1e`。*
