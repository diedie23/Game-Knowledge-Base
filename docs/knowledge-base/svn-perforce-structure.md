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
|------|------|------|
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
|------|------|------|
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
|------|------|------|
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
|------|-----|---------------|
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
|------|------|---------|
| 🔴 **管理员** | 完全控制（创建/删除仓库、管理用户、修改权限） | TA Lead / APM |
| 🟡 **读写** | 提交 + 检出（限定目录范围） | 美术组员（各自工种目录） |
| 🟢 **只读** | 仅检出，不可提交 | 策划、QA、运营（查阅资产） |

### 5.2 目录级权限分配示例

| 目录 | 角色组 | 程序组 | 策划 | QA |
|------|--------|--------|------|-----|
| `/ArtAssets/Character/` | 读写 | 只读 | 只读 | 只读 |
| `/ArtAssets/Character/*/Export/` | 读写 | 读写 | 只读 | 只读 |
| `/ArtAssets/UI/` | 读写 | 只读 | 只读 | 只读 |
| `/ArtAssets/_Reference/` | 读写 | 只读 | 读写 | 只读 |
| `/ArtAssets/_Archive/` | 管理员 | — | — | — |

---

## 6. 常见踩坑案例

> ⚠️ **避坑指南**：以下是版本控制中美术团队最常见的踩坑场景，务必在新人 onboarding 时重点培训。

### 6.1 🔴 大文件锁定冲突

**场景**：美术 A 锁定了 PSD 文件去吃饭，美术 B 急需修改  
**解法**：
- SVN：管理员执行 `svn unlock --force`
- P4：管理员使用 `p4 unlock -f`
- **预防**：设置锁定超时（P4 可配置自动释放）

### 6.2 🔴 二进制合并失败

**场景**：两人同时修改同一个 FBX，merge 产生损坏文件  
**解法**：二进制文件**永远使用独占锁定**，不允许并发编辑  
**预防**：在 `.svnconfig` / P4 Typemap 中强制标记

### 6.3 🟡 引用路径断裂

**场景**：美术重命名/移动了文件，引擎中引用失效  
**解法**：
- 使用 svn move / p4 move（保留历史记录）
- **严禁**在本地直接 rename 后重新 add
- 移动后通知 TA 更新引擎引用

### 6.4 🟡 Temp 目录膨胀

**场景**：临时文件从不清理，仓库体积持续膨胀  
**解法**：
- 每个 Sprint 末清理 Temp/
- 设置 CI 自动检测 Temp 目录大小
- Temp/ 下文件超过 30 天自动预警

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
|------|------|------|
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
