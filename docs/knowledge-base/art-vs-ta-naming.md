# 引擎导入与命名规范

> **适用阶段**：量产期 | **优先级**：高 | **负责人**：孙七
>
> 本文档定义美术与程序/TA 的资产交接标准，包含文件命名规则、目录结构、引擎导入 Checklist。

---

## 1. 文件命名规则

### 1.1 统一命名公式

```
[资产类型前缀]_[归属模块]_[描述名]_[后缀标识].[扩展名]
```

### 1.2 资产类型前缀一览

| 前缀 | 资产类型 | 示例 |
|------|---------|------|
| `SM_` | Static Mesh 静态网格 | `SM_Scene_Rock_A.fbx` |
| `SK_` | Skeletal Mesh 骨骼网格 | `SK_Hero_Luna.fbx` |
| `AN_` | Animation 动画 | `AN_Luna_Idle_01.fbx` |
| `T_` | Texture 贴图 | `T_Luna_Body_D.tga` |
| `M_` | Material 材质 | `M_Skin_Common` |
| `MI_` | Material Instance 材质实例 | `MI_Luna_Skin` |
| `BP_` | Blueprint 蓝图 | `BP_Hero_Luna` |
| `WBP_` | Widget Blueprint UI 蓝图 | `WBP_HUD_HpBar` |
| `VFX_` | Visual Effect 特效 | `VFX_Skill_FireBall` |
| `SND_` | Sound 音效 | `SND_Hit_Sword_01` |
| `ABP_` | AnimBlueprint 动画蓝图 | `ABP_Luna` |
| `BS_` | BlendSpace 混合空间 | `BS_Luna_Locomotion` |
| `PHY_` | Physics Asset 物理资产 | `PHY_Luna` |
| `RIG_` | Control Rig | `RIG_Humanoid_Male` |

### 1.3 贴图通道后缀

| 后缀 | PBR 通道 | 说明 |
|------|---------|------|
| `_D` | Diffuse/Albedo/BaseColor | 基础颜色 |
| `_N` | Normal | 法线贴图 |
| `_MRA` | Metallic+Roughness+AO | 三合一 (R=M, G=R, B=AO) |
| `_M` | Metallic | 金属度（单独） |
| `_R` | Roughness | 粗糙度（单独） |
| `_AO` | Ambient Occlusion | 环境光遮蔽 |
| `_E` | Emissive | 自发光 |
| `_Mask` | Custom Mask | 自定义遮罩 |
| `_Op` | Opacity | 透明度 |
| `_H` | Height/Displacement | 高度图 |

> 💡 **黄金法则**：命名统一使用 **英文 + 下划线**，严禁出现中文、空格、括号、连字符。

### 1.4 命名禁止事项

| ❌ 禁止 | ✅ 正确 | 原因 |
|---------|---------|------|
| `新角色_最终版.fbx` | `SK_Hero_Luna.fbx` | 禁用中文 |
| `model (1).fbx` | `SM_Prop_Barrel_A.fbx` | 禁止括号/空格 |
| `test.fbx` | `SM_Scene_Rock_Test.fbx` | 禁止无意义名 |
| `FINAL_FINAL_V3.fbx` | `SK_Hero_Luna.fbx` | Export 不带版本号 |
| `my-model.fbx` | `SM_Scene_Bridge.fbx` | 用下划线不用连字符 |

---

## 2. 引擎目录结构

### 2.1 UE 标准目录

```
/Game/
├── Art/
│   ├── Characters/
│   │   ├── Hero/
│   │   │   ├── Luna/
│   │   │   │   ├── Mesh/          # SK_Luna.uasset
│   │   │   │   ├── Textures/      # T_Luna_Body_D.uasset ...
│   │   │   │   ├── Materials/     # M_Luna_Skin.uasset
│   │   │   │   ├── Animations/    # AN_Luna_*.uasset
│   │   │   │   └── VFX/           # VFX_Luna_*.uasset
│   │   │   └── Kaito/
│   │   ├── NPC/
│   │   └── Monster/
│   ├── Environments/
│   │   ├── MainCity/
│   │   └── BattleStage/
│   ├── UI/
│   │   ├── Atlas/
│   │   ├── Icons/
│   │   └── Widgets/
│   ├── VFX/
│   │   ├── Common/
│   │   └── Character/
│   └── _Shared/               # 共享资源
│       ├── Materials/
│       ├── Textures/
│       └── Skeletons/
├── Blueprints/
└── Maps/
```

### 2.2 Unity 标准目录

```
Assets/
├── Art/
│   ├── Characters/
│   │   ├── Hero/
│   │   │   └── Luna/
│   │   │       ├── Models/
│   │   │       ├── Textures/
│   │   │       ├── Materials/
│   │   │       ├── Animations/
│   │   │       └── Prefabs/
│   ├── Environments/
│   ├── UI/
│   │   ├── Atlas/
│   │   ├── Sprites/
│   │   └── Prefabs/
│   └── VFX/
├── Resources/
└── Scenes/
```

---

## 3. 引擎导入 Checklist

### 3.1 模型导入 (FBX)

| # | 检查项 | UE 设置 | Unity 设置 |
|---|--------|---------|-----------|
| 1 | FBX 版本 | **2020+** | **2019+** |
| 2 | Scale | **1.0 (cm)** | **0.01 (m→cm)** |
| 3 | 坐标轴 | Z-Up 自动 | Y-Up 自动 |
| 4 | Normals | **Import Normals** | **Import** |
| 5 | Tangents | Import | Calculate |
| 6 | LOD | 勾选 Import LODs | 手动设置 |
| 7 | Material | **不导入**（手动指定） | **不导入** |
| 8 | Collision | **不导入**（手动设置） | **不导入** |

### 3.2 贴图导入

| # | 检查项 | 设置 |
|---|--------|------|
| 1 | sRGB | Albedo/Diffuse: ✅; Normal/Mask/AO: ❌ |
| 2 | 压缩格式 | Android: ASTC; iOS: ASTC; PC: BC7/DXT |
| 3 | Max Size | 根据目标平台设置（移动端通常 1024） |
| 4 | Mipmap | 3D 资产: ✅; UI: ❌ |
| 5 | Filter | Bilinear (默认); 像素风: Point |

### 3.3 动画导入

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | Skeleton 映射 | 选择已有的共享 Skeleton |
| 2 | Root Motion | 移动动画: ✅; 其他: ❌ |
| 3 | 帧率 | 确认 30FPS |
| 4 | Animation Compression | 移动端开启压缩 |
| 5 | Additive Animation | 标注是否为叠加动画 |

---

## 4. 资产交接 SOP

### 4.1 交接流程

```mermaid
graph TD
    A[美术完成] --> B[自检通过]
    A --> C[填写交接单]
    B --> D[提交版本库]
    D --> E[通知 TA/程序]
    E --> F[导入引擎验证]
    F -->|✅ 通过| G[验收完成]
    F -->|❌ 打回| H[反馈修改清单]
    H --> A
```

> ⚠️ **核心红线**：交接前必须完成自检 + 填写交接单，未通过自检的资产**严禁直接提交版本库**。

### 4.2 交接单模板

| 字段 | 内容 |
|------|------|
| **资产名称** | SK_Hero_Luna |
| **版本库路径** | /ArtAssets/Character/Hero/CH_Luna/Export/ |
| **变更类型** | 新增 / 更新 / 删除 |
| **文件清单** | SK_Luna.fbx, T_Luna_Body_D.tga, T_Luna_Body_N.tga, T_Luna_Body_MRA.tga |
| **规格参数** | Tris: 12,500; Bones: 55; Materials: 2; LOD: 3级 |
| **特殊说明** | Root Motion 在 Run/Walk 动画上; Face 使用 BlendShape |
| **验证方式** | 导入 UE 后挂载 ABP_Luna 查看待机动画是否正常 |

### 4.3 常见交接问题速查

| 问题 | 原因 | 解法 |
|------|------|------|
| 导入后模型破面 | 法线翻转/三角面退化 | DCC 中检查法线方向 |
| 贴图颜色偏差 | sRGB 设置错误 | Normal/Mask 关闭 sRGB |
| 模型穿地/悬空 | 原点位置不对 | 确认脚底在原点 |
| 动画滑步 | Root Motion 未开启 | 引擎端启用 Root Motion |
| 骨骼权重丢失 | FBX 导出设置错误 | 勾选 Deformations |

---

## 5. 跨部门交接边界

### 5.1 职责矩阵 (RACI)

| 工作项 | 美术 | TA | 程序 | APM |
|--------|------|-----|------|-----|
| DCC 制作 | **R** | C | — | I |
| FBX 导出 | **R** | C | — | — |
| 引擎导入 | I | **R** | C | — |
| 材质配置 | C | **R** | — | — |
| 性能优化 | C | **R** | C | I |
| Bug 修复 | **R** | C | C | I |
| 命名检查 | **R** | A | — | I |

> R=负责执行, A=审批, C=咨询, I=知会

---

## 附录：快速参考卡

### 常用前缀速查

| 你在做... | 文件前缀 | 示例 |
|---------|---------|------|
| 角色模型 | `SK_` | `SK_Hero_Luna.fbx` |
| 场景模型 | `SM_` | `SM_Scene_Rock_A.fbx` |
| UI 图标 | `T_UI_` | `T_UI_Icon_Attack.png` |
| 特效贴图 | `T_VFX_` | `T_VFX_Noise_01.tga` |
| 角色贴图 | `T_[角色]_` | `T_Luna_Body_D.tga` |
| 角色动画 | `AN_` | `AN_Luna_Attack01.fbx` |
| 技能特效 | `VFX_Skill_` | `VFX_Skill_FireBall.prefab` |
