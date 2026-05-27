# 🎵 音频资产管理规范 v1.0

> Game Audio Asset Management Specification  
> 更新日期：2026-05-27 | 维护：音频组 × 美术管理 × TA × 策划  
> 标签：音频 · Wwise · FMOD · 配音 · SFX · BGM · 资产管理

---

## 1. 概述与适用范围

本规范定义了游戏项目中所有**音频资产（Audio Assets）**的分类标准、制作规格、集成流程、版本管理和质量门禁。覆盖 BGM、SFX、环境音、语音（VO）、UI 音效五大类别。

**核心原则：** 声音是游戏世界的"第二画面"——优秀的音频设计让玩家"闭眼也能感知游戏状态"。

---

## 2. 音频资源分类体系

### 2.1 一级分类

| 类别 | 代号 | 说明 | 数量占比 | 内存权重 |
|------|------|------|---------|---------|
| 🎼 BGM | BGM | 场景/战斗/剧情背景音乐 | 5% | 35% |
| 💥 SFX | SFX | 技能/打击/环境交互音效 | 55% | 30% |
| 🌳 AMB | AMB | 场景氛围层/天气/环境循环 | 10% | 15% |
| 🗣️ VO | VO | 角色台词/旁白/系统播报 | 25% | 15% |
| 🔘 UI | UI | 按钮点击/弹窗/抽卡结果音 | 5% | 5% |

### 2.2 二级分类

- **BGM**: Scene / Battle / Story / Event
- **SFX**: Skill / Weapon / Footstep / Physics / Creature / System
- **AMB**: Nature / Urban / Special
- **VO**: Battle / Dialogue / System / Idle
- **UI**: Common / Special / Nav

---

## 3. 中间件集成规范（Wwise / FMOD）

### Event 命名规范

| 操作 | 规则 | 示例 |
|------|------|------|
| 播放 | `Play_{类别}_{描述}` | `Play_SFX_Skill_FireBall_Cast` |
| 停止 | `Stop_{类别}_{描述}` | `Stop_BGM_Battle_Boss01` |
| 状态 | `Set_State_{组}_{值}` | `Set_State_GameMode_Battle` |
| 切换 | `Set_Switch_{组}_{值}` | `Set_Switch_Surface_Stone` |
| 参数 | `Set_RTPC_{参数名}` | `Set_RTPC_PlayerHealth` |

### SoundBank 拆分策略

| Bank | 加载方式 | 目标大小 |
|------|---------|---------|
| Bank_Init | 启动时加载 | ≤ 2 MB |
| Bank_Common | 启动时加载 | ≤ 8 MB |
| Bank_BGM_{场景} | 场景预加载 | ≤ 15 MB |
| Bank_Character_{ID} | 角色登场 | ≤ 5 MB |
| Bank_VO_{语种}_{章节} | 剧情流式 | ≤ 20 MB |

---

## 4. 目录结构与命名规范

### 源文件目录

```
/Audio_Source/
├── BGM/（Composed + WIP）
├── SFX/（Recorded + Designed + Variations）
├── AMB/（Loops + OneShots）
├── VO/（Script + Raw + Edited + Final）
└── UI/（Designed）
```

### 命名规范

| 类型 | 规则 | 示例 |
|------|------|------|
| BGM | `BGM_{场景}_{描述}_v{版本}.wav` | `BGM_Scene_MainCity_Peaceful_v03.wav` |
| SFX | `SFX_{分类}_{描述}_{变体号}.wav` | `SFX_Weapon_Sword_Slash_01.wav` |
| VO | `VO_{语种}_{角色ID}_{场景}_{序号}.wav` | `VO_JP_Char01_Battle_Skill01.wav` |
| UI | `UI_{功能}_{描述}.wav` | `UI_Common_ButtonClick.wav` |

---

## 5. 技术规格标准

### 源文件规格

| 类别 | 采样率 | 位深 | 声道 | 时长限制 |
|------|--------|------|------|---------|
| BGM | 48 kHz | 24 bit | Stereo | ≤ 5 min |
| SFX | 48 kHz | 24 bit | Mono/Stereo | ≤ 10s |
| AMB | 48 kHz | 24 bit | Stereo/Quad | ≤ 2 min |
| VO | 48 kHz | 24 bit | Mono | ≤ 30s |
| UI | 48 kHz | 16/24 bit | Mono | ≤ 3s |

### 关键技术指标

- 底噪 ≤ -60 dBFS（VO: ≤ -65 dBFS）
- Peak ≤ -1 dBTP
- DC Offset ≤ 0.01
- 循环点零交叉 ± 1 sample
- 头部静默 0~5ms / 尾部 ≤ 50ms

---

## 6. 音量标准与响度规范（LUFS）

| 类别 | 目标响度 | 容差 |
|------|---------|------|
| BGM（探索） | -20 LUFS | ±2 |
| BGM（战斗） | -16 LUFS | ±2 |
| SFX（常规） | -18 LUFS | ±3 |
| VO（对话） | -16 LUFS | ±1 |
| AMB | -26 LUFS | ±3 |

### 混音优先级

```
1. VO → 2. UI → 3. SFX(玩家) → 4. SFX(环境) → 5. BGM → 6. AMB
```

---

## 7. 音频状态机与实时混音

### Game State

| 状态组 | 状态值 | 音频行为 |
|--------|--------|---------|
| GameMode | Explore | 场景BGM + AMB + 脚步 |
| GameMode | Battle | 战斗BGM + 技能SFX + 淡出AMB |
| GameMode | Cutscene | 演出音轨独占 |
| CombatPhase | Intense | 叠加高强度 Layer B |
| PlayerState | LowHP | 心跳 + LPF BGM |

### RTPC 参数

- Distance (0~100) → 3D 衰减
- PlayerHealth (0~100) → 心跳层控制
- TimeOfDay (0~24) → 昼夜环境音切换
- Underwater (0~1) → 水下 LPF

---

## 8. 语音本地化工作流

### 支持语种

| 语种 | 代号 | 优先级 | 配音要求 |
|------|------|--------|---------|
| 日语 | JP | P0 | 全量配音 |
| 中文 | CN | P0 | 全量配音 |
| 韩语 | KR | P1 | 主线+角色 |
| 英语 | EN | P1 | 主线+角色 |

### 流程

```
台本编写 → 翻译 → [录音棚录制] → 剪辑降噪 → QA校验 → 命名归档 → [Wwise集成] → 引擎验证
```

---

## 9. 打包策略与内存管理

### 内存预算（移动端）

| 指标 | 红线 |
|------|------|
| 音频总内存 | 40 MB |
| BGM | 15 MB |
| SFX | 12 MB |
| VO | 8 MB |
| AMB+UI | 5 MB |
| 同时发声数 | ≤ 32 |

### 流式加载规则

- BGM (≥30s) → Streaming（Prefetch 256KB）
- SFX (≤5s) → In-Memory（低延迟）
- VO 对话 → Streaming
- VO 战斗短句 → In-Memory

---

## 10. 制作流程与交付 SOP

### SLA

| 阶段 | 标准工期 | 输出物 |
|------|---------|--------|
| 需求分析 | 2 天 | 音频设计文档 |
| SFX 制作 | 0.5~1 天/条 | WAV + 变体 |
| BGM 作曲 | 5~10 天/曲 | WAV + 分段标记 |
| VO 录制 | 2~3 天/角色/语种 | 剪辑完 WAV |
| 中间件集成 | 1~2 天 | Event + Bank |
| QA 验收 | 1 天 | 验收报告 |

---

## 11. RACI 责任矩阵

| 阶段 | 音频总监 | 音效师 | 作曲 | VO制片 | 音频程序 | 策划 | QA |
|------|---------|--------|------|--------|---------|------|-----|
| 需求接收 | A | R | I | I | I | R | I |
| SFX 制作 | C | R | I | I | I | I | I |
| BGM 作曲 | A | C | R | I | I | C | I |
| VO 录制 | C | I | I | R | I | C | I |
| 中间件集成 | C | R | I | I | A | I | I |
| QA 验收 | A | C | I | C | C | I | R |

---

## 12. 质量验收标准

### 评分维度（加权 ≥ 3.5 通过）

| 维度 | 权重 | 不合格阈值 |
|------|------|-----------|
| 设计契合度 | 25% | <3 分 |
| 技术规格 | 20% | <4 分（一票否决） |
| 混音平衡 | 20% | <3 分 |
| 交互反馈 | 20% | <3 分 |
| 性能达标 | 15% | <4 分（一票否决） |

---

## 13. 常见踩坑记录

1. **BGM 切换断裂** — 使用 Interactive Music + Transition Segment，禁止 Stop+Play 硬切
2. **安卓低端机卡顿** — 战斗 SFX 改 In-Memory + 降低 Max Voice 至 24
3. **VO 多语种时长不一致** — 台本阶段设参考时长上限（容差 ±30%）
4. **iOS 后台 BGM 中断** — 配置 AVAudioSession + 监听 Interruption 通知
5. **Wwise Bank 版本冲突** — CI/CD 增加 SDK 版本校验步骤
