<div style="display: flex; align-items: flex-start; gap: 24px;">
<div style="flex: 0 0 260px; position: sticky; top: 24px; padding: 16px; background-color: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-size: 14px;">
<div style="font-weight: bold; margin-bottom: 12px; font-size: 16px;">📑 目录导航</div>

**📁 [根目录结构设计](#1-美术资产根目录结构设计)**
&emsp;一级目录 · 二级目录

**📂 [工种子目录规范](#2-每个工种子目录规范)**
&emsp;四目录模型 · 场景/UI/VFX/动画

**📏 [文件命名规约](#3-文件命名规约)**
&emsp;前缀 · 贴图后缀 · 版本号

**🔀 [分支策略](#4-svn-vs-perforce-分支策略)**
&emsp;SVN · Perforce Stream

**🔑 [权限模型](#5-权限模型)**
&emsp;三级权限 · 目录级分配

**🚨 [踩坑案例](#6-常见踩坑案例)**
&emsp;锁定冲突 · 合并失败 · 路径断裂 · Temp膨胀

**📝 [Commit Message 规范](#7-commit-message-规范)**
&emsp;模板 · 类型前缀 · Do/Don't

**✅ [Do / Don't 示例](#8-do--dont-示例)**

**📎 [附录：提交前自检清单](#附录自检清单)**

</div>
<div style="flex: 1; min-width: 0;">

# SVN/Perforce 目录结构标准

> **适用阶段**：全阶段 | **优先级**：高 | **负责人**：孙七
>
> 本文档定义美术资产在 SVN/Perforce 版本控制系统中的标准目录结构、分支策略、权限模型与命名规约，确保团队协作有序。

> 💡 **核心原则**：美术资产目录结构遵循 **按工种划分一级目录 + 按资产划分二级目录 + 四目录模型（Source/Export/Temp/Archive）** 的三层标准。

---

## 1. 美术资产根目录结构设计

### 1.1 一级目录（按工种划分）

```
/ArtAssets/
├── Character/          # 角色资产
├── Scene/              # 场景资产
├── UI/                 # UI 资产
├── VFX/                # 特效资产
├── Animation/          # 动画资产
├── Audio/              # 音效资产（美术侧配合）
├── _Common/            # 公共资源（通用材质、Shader、共享贴图）
├── _Reference/         # 参考资料（风格板、Moodboard、策划文档）
├── _Template/          # 模板文件（PSD模板、Max模板、Maya模板）
└── _Archive/           # 归档区（已下线/已废弃资产）
```

### 1.2 二级目录（以角色为例）

```
/ArtAssets/Character/
├── Hero/               # 可操作角色
│   ├── CH_Luna/
│   │   ├── Source/     # 源文件（PSD/Max/Maya/Blender）
│   │   ├── Export/     # 导出文件（FBX/PNG/TGA）
│   │   ├── Temp/       # 临时/WIP 文件（不进引擎）
│   │   └── Archive/    # 历史版本归档
│   ├── CH_Kaito/
│   └── ...
├── NPC/                # NPC 角色
├── Monster/            # 怪物
└── _Skeleton/          # 共享骨骼库
```

---

## 2. 每个工种子目录规范

### 2.1 标准四目录模型

| 目录 | 用途 | 说明 |
|:---:|:---:|:---:|
| **Source/** | 源文件 | PSD、MAX、Maya、Blender 工程文件，仅美术修改 |
| **Export/** | 导出文件 | FBX、PNG、TGA、EXR 等引擎可用格式，程序/TA 消费 |
| **Temp/** | 临时文件 | WIP 中间产物、测试文件，定期清理 |
| **Archive/** | 归档文件 | 被替换的旧版本、已废弃资产，打上日期标签 |

### 2.2 各工种完整结构

<details>
<summary>📂 场景 (Scene) 目录结构</summary>

```
/ArtAssets/Scene/
├── MainCity/
│   ├── Source/
│   │   ├── MainCity_BlockOut.max
│   │   └── MainCity_Final.max
│   ├── Export/
│   │   ├── Mesh/
│   │   ├── Texture/
│   │   └── Lightmap/
│   ├── Temp/
│   └── Archive/
├── Battle_Stage01/
└── ...
```
</details>

<details>
<summary>📂 UI 目录结构</summary>

```
/ArtAssets/UI/
├── Atlas/              # 图集
│   ├── Common/
│   ├── Battle/
│   └── Shop/
├── Icon/               # 图标
│   ├── Item/
│   ├── Skill/
│   └── Avatar/
├── Font/               # 字体
├── Source/              # PSD 源文件
└── Export/              # 切图导出
```
</details>

<details>
<summary>📂 特效 (VFX) 目录结构</summary>

```
/ArtAssets/VFX/
├── Character/          # 角色特效
│   ├── Skill/
│   ├── Hit/
│   └── Buff/
├── Scene/              # 场景特效
├── UI/                 # UI 特效
├── Texture/            # 特效专用贴图
│   ├── Noise/
│   ├── Dissolve/
│   └── Distortion/
└── _Prefab/            # 通用特效预制体
```
</details>

<details>
<summary>📂 动画 (Animation) 目录结构</summary>

```
/ArtAssets/Animation/
├── Character/
│   ├── CH_Luna/
│   │   ├── Idle/
│   │   ├── Run/
│   │   ├── Attack/
│   │   ├── Skill/
│   │   └── Death/
│   └── ...
├── Cutscene/           # 过场动画
├── Camera/             # 相机动画
└── _Rig/               # 绑定文件
```
</details>

---

## 3. 文件命名规约

### 3.1 命名公式

```
[前缀]_[模块]_[描述]_[变体]_[版本号].[扩展名]
```

### 3.2 前缀规范

| 前缀 | 含义 | 示例 |
|:---:|:---:|:---:|
| `CH_` | Character 角色 | `CH_Luna_Body_v02.fbx` |
| `SC_` | Scene 场景 | `SC_MainCity_Tower_A.fbx` |
| `UI_` | UI 资产 | `UI_Battle_HpBar.png` |
| `VFX_` | 特效 | `VFX_Skill_FireBall_01.prefab` |
| `AN_` | Animation 动画 | `AN_Luna_Attack01_v03.fbx` |
| `MAT_` | Material 材质 | `MAT_Skin_Common.mat` |
| `TEX_` | Texture 贴图 | `TEX_Luna_Body_D.tga` |
| `SK_` | Skeleton 骨骼 | `SK_Humanoid_Male.fbx` |

### 3.3 贴图后缀规范

| 后缀 | 含义 | 示例 |
|:---:|:---:|:---:|
| `_D` | Diffuse / Albedo | `TEX_Luna_Body_D.tga` |
| `_N` | Normal Map | `TEX_Luna_Body_N.tga` |
| `_M` | Metallic | `TEX_Luna_Body_M.tga` |
| `_R` | Roughness | `TEX_Luna_Body_R.tga` |
| `_AO` | Ambient Occlusion | `TEX_Luna_Body_AO.tga` |
| `_E` | Emissive | `TEX_Luna_Body_E.tga` |
| `_MRA` | Metallic+Roughness+AO 合并 | `TEX_Luna_Body_MRA.tga` |
| `_Mask` | 遮罩图 | `TEX_Luna_Body_Mask.tga` |

### 3.4 版本号规则

> 🔴 **核心红线**：**只在 Source/ 目录使用版本号**，Export/ 目录始终使用最新版（无版本后缀）。

- 使用 `_v01`, `_v02`, `_v03` ... 后缀
- **只在 Source/ 目录使用版本号**，Export/ 目录始终使用最新版（无版本后缀）
- 归档旧版本到 Archive/ 并加日期：`CH_Luna_Body_v01_20260315.fbx`

---

## 4. SVN vs Perforce 分支策略

### 4.1 核心差异对比

| 维度 | SVN | Perforce (P4) |
|:---:|:---:|:---:|
| **架构** | 中心化，单一仓库 | 中心化，Workspace 映射 |
| **大文件处理** | 差（全量存储） | 优秀（增量存储 + 专用二进制处理） |
| **文件锁定** | svn:needs-lock 属性 | 原生 exclusive checkout |
| **分支成本** | 低（目录复制） | 极低（虚拟分支/Stream） |
| **并发性能** | 中等 | 优秀（大团队优势明显） |
| **学习曲线** | 低 | 中等 |

### 4.2 SVN 分支策略（推荐）

```
/svn/
├── trunk/              # 主干（稳定版本）
│   └── ArtAssets/
├── branches/           # 功能分支
│   ├── feat_new-hero/
│   └── feat_scene-v2/
└── tags/               # 版本标签
    ├── alpha_20260315/
    └── beta_20260531/
```

**最佳实践**：
- 主干始终保持可用状态
- 新功能在 branches 开发，完成后 merge 回 trunk
- 每个里程碑打 tag
- 二进制文件（PSD/MAX/FBX）设置 `svn:needs-lock`

### 4.3 Perforce Stream 策略（推荐）

```
//depot/ArtProject/
├── main/               # 主流（mainline）
├── dev/                # 开发流
│   ├── dev_character/
│   └── dev_scene/
└── release/            # 发布流
    ├── release_alpha/
    └── release_beta/
```

**最佳实践**：
- 使用 Stream Depot 自动管理 merge 方向
- 美术源文件设置 exclusive checkout（防止并发编辑冲突）
- 利用 P4 Typemap 自动识别二进制文件类型

---

## 5. 权限模型

### 5.1 三级权限体系

| 角色 | 权限 | 适用人员 |
|:---:|:---:|:---:|
| 🔴 **管理员** | 完全控制（创建/删除仓库、管理用户、修改权限） | TA Lead / APM |
| 🟡 **读写** | 提交 + 检出（限定目录范围） | 美术组员（各自工种目录） |
| 🟢 **只读** | 仅检出，不可提交 | 策划、QA、运营（查阅资产） |

### 5.2 目录级权限分配示例

| 目录 | 角色组 | 程序组 | 策划 | QA |
|:---:|:---:|:---:|:---:|:---:|
| `/ArtAssets/Character/` | 读写 | 只读 | 只读 | 只读 |
| `/ArtAssets/Character/*/Export/` | 读写 | 读写 | 只读 | 只读 |
| `/ArtAssets/UI/` | 读写 | 只读 | 只读 | 只读 |
| `/ArtAssets/_Reference/` | 读写 | 只读 | 读写 | 只读 |
| `/ArtAssets/_Archive/` | 管理员 | — | — | — |

---

## 6. 常见踩坑案例

> ⚠️ **避坑指南**：以下是版本控制中美术团队最常见的踩坑场景，务必在新人 onboarding 时重点培训。

### 6.1 大文件锁定冲突

> 🚨 **问题现象**
> 美术 A 锁定了 PSD 文件去吃饭，美术 B 急需修改同一文件，工作被阻塞。

> 🔍 **产生原因**
> 美术人员锁定文件后长时间离开工位，未主动释放锁定；团队缺乏锁定超时机制。

> 🛠️ **解决方案**
> - SVN：管理员执行 `svn unlock --force`
> - P4：管理员使用 `p4 unlock -f`
> - 紧急情况下联系 TA Lead 快速处理

> 🛡️ **预防措施**
> - P4 配置自动锁定超时释放（如 4 小时无操作自动解锁）
> - 团队规约：离开工位前检查是否有未释放的锁定
> - 在企微群/钉钉群设置「锁定提醒」Bot

### 6.2 二进制合并失败

> 🚨 **问题现象**
> 两人同时修改同一个 FBX 文件，merge 后产生损坏文件，资产无法在引擎中打开。

> 🔍 **产生原因**
> 二进制文件（FBX/PSD/MAX）无法像文本文件一样做 diff/merge，并发编辑必然导致冲突。

> 🛠️ **解决方案**
> - 二进制文件**永远使用独占锁定**，不允许并发编辑
> - 若已损坏，从版本历史回滚到最后一个正确版本

> 🛡️ **预防措施**
> - 在 `.svnconfig` / P4 Typemap 中强制标记所有美术文件为 exclusive checkout
> - 新人 Onboarding 必讲「为什么美术文件要锁定」

### 6.3 引用路径断裂

> 🚨 **问题现象**
> 美术在本地直接 rename 文件后重新 add 到 SVN，引擎中所有引用该文件的 Material 全部失效。

> 🔍 **产生原因**
> 直接 rename + re-add 会丢失文件历史，且在 SVN/P4 看来是「删除旧文件 + 新增新文件」，引擎引用的是旧路径。

> 🛠️ **解决方案**
> - 使用 `svn move` / `p4 move`（保留历史记录和路径关联）
> - **严禁**在本地直接 rename 后重新 add
> - 移动后通知 TA 更新引擎引用

> 🛡️ **预防措施**
> - 在团队 Wiki 中醒目标注「重命名/移动文件的正确操作步骤」
> - CI/CD 中加入路径变更检测，自动通知相关方

### 6.4 Temp 目录持续膨胀

> 🚨 **问题现象**
> 项目运行半年后，仓库体积从 20GB 膨胀到 120GB，Checkout 耗时超过 2 小时。

> 🔍 **产生原因**
> 临时文件（WIP 半成品、测试导出、截图等）持续提交到 Temp/ 目录，从不清理。

> 🛠️ **解决方案**
> - 每个 Sprint 末清理 Temp/ 下超过 30 天的文件
> - 设置 CI 自动检测 Temp 目录大小，超阈值发送预警
> - 大量历史 Temp 文件移入 Archive/ 或从仓库中移除

> 🛡️ **预防措施**
> - Sprint 回顾会固定增加「仓库健康检查」环节
> - 在提交前 Checklist 中加入「未误提交 Temp 文件」检查项
> - 设置 pre-commit hook 拦截 Temp/ 下超大文件

---

## 7. Commit Message 规范

### 7.1 标准模板

```
[类型][工种] 简要描述

详细说明（可选）

关联: TASK-xxx / REQ-xxx
```

### 7.2 类型前缀

| 前缀 | 含义 | 示例 |
|:---:|:---:|:---:|
| `[ADD]` | 新增资产 | `[ADD][角色] 新增Luna角色原画定稿` |
| `[MOD]` | 修改资产 | `[MOD][场景] 修改主城灯光参数` |
| `[FIX]` | 修复问题 | `[FIX][UI] 修复商城图标尺寸不一致` |
| `[DEL]` | 删除/归档 | `[DEL][角色] 归档废弃的旧版Luna模型` |
| `[OPT]` | 优化 | `[OPT][特效] 优化火焰特效Overdraw` |
| `[WIP]` | 进行中（临时提交） | `[WIP][动画] Luna攻击动画半成品` |

### 7.3 ❌ 错误示范 vs ✅ 正确示范

```
❌ "更新了文件"
❌ "修改"
❌ "aaa"
❌ "。。。"

✅ "[ADD][角色] 新增CH_Luna角色高模Source文件"
✅ "[MOD][UI] 更新主界面底栏图标，适配新设计稿 REQ-208"
✅ "[FIX][特效] 修复Luna大招特效穿模问题 BUG-1024"
```

---

## 8. Do / Don't 示例

### 📌 场景说明

> APM 负责为新项目搭建美术资产版本控制目录结构。

### ✅ 正确示范 Do

> - 按本文档标准创建三层目录结构（工种 → 资产 → 四目录模型）
> - 所有美术源文件（PSD/MAX/FBX）设置 exclusive checkout / `svn:needs-lock`
> - 为每个工种组分配对应目录的读写权限，其他人设置只读
> - 制定 Commit Message 规范并在团队内培训
> - 每个 Sprint 末安排 Temp/ 目录清理
> - 新人 Onboarding 时重点讲解「锁定 → 编辑 → 解锁」流程

### ❌ 错误示范 Don't

> - 所有资产堆在一个大目录下，不区分工种和 Source/Export
> - 不设置文件锁定，美术同时编辑同一个 PSD 导致覆盖
> - 给所有人全仓库读写权限，外包也能删除 Archive
> - Commit Message 不做要求，提交记录全是「更新了文件」
> - Temp/ 从不清理，仓库体积失控
> - 重命名文件用「删除 + 新增」代替 `svn move`

---

## 附录：自检清单

### ✅ 提交前检查

- [ ] 文件命名是否符合规范？
- [ ] 文件放在正确的目录下？
- [ ] Source 文件有版本号？
- [ ] Export 文件已更新为最新？
- [ ] Temp 目录下的临时文件未误提交？
- [ ] Commit Message 格式正确？
- [ ] 二进制大文件已设置锁定？
- [ ] 没有提交 `.DS_Store` / `Thumbs.db` 等系统文件？

</div>
</div>
