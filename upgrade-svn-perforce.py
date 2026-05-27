#!/usr/bin/env python3
"""生成 SVN/Perforce 目录结构标准 v2.0 完整 HTML — 分段拼接"""
import os, pathlib

out = pathlib.Path(r"h:\游戏项目知识库\docs\knowledge-base\svn-perforce-structure.html")

# ============ CSS ============
css = """:root{--bg:#0d0f15;--panel:#141620;--card:#1a1d2b;--border:#262a3a;--text:#c5c9d6;--dim:#6b7085;--heading:#e4e6ed;--accent:#6c8cff;--accent2:#a78bfa;--red:#f87171;--green:#4ade80;--blue:#60a5fa;--yellow:#fbbf24;--orange:#fb923c;--cyan:#22d3ee}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:16px}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#3d4155;border-radius:3px}
.doc{max-width:1200px;margin:0 auto;padding:32px 48px}
.doc-header{text-align:center;padding:32px 0 24px;border-bottom:1px solid var(--border);margin-bottom:32px}
.doc-header h1{font-size:28px;color:var(--heading);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:10px}
.doc-header h1 .ver{font-size:12px;background:var(--cyan);color:#000;padding:2px 10px;border-radius:12px}
.doc-header .subtitle{color:var(--dim);font-size:15px}
.doc-header .meta{display:flex;justify-content:center;gap:20px;margin-top:12px;font-size:12px;color:var(--dim);flex-wrap:wrap}
.doc-header .meta span{display:flex;align-items:center;gap:4px}
.toc{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:32px}
.toc h3{font-size:15px;color:var(--heading);margin-bottom:10px;font-weight:600}
.toc ol{padding-left:20px;font-size:14px;color:var(--accent);columns:2}.toc li{margin-bottom:5px;break-inside:avoid}
.toc a{color:var(--accent);text-decoration:none}.toc a:hover{text-decoration:underline}
.section{margin-bottom:40px}
.section h2{font-size:22px;color:var(--heading);margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--cyan);display:flex;align-items:center;gap:8px}
.sub-title{font-size:17px;color:var(--heading);margin:16px 0 8px;font-weight:600}
.section p{font-size:15px;margin-bottom:12px;line-height:1.8}
table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:13px}
th{background:var(--panel);color:var(--heading);text-align:left;padding:10px 12px;border:1px solid var(--border);font-weight:600;white-space:nowrap}
td{padding:9px 12px;border:1px solid var(--border);vertical-align:top}
tr:nth-child(even){background:rgba(108,140,255,.02)}
.alert{padding:12px 16px;border-radius:8px;margin:12px 0;font-size:14px;line-height:1.8}
.alert-red{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}
.alert-blue{background:rgba(108,140,255,.08);border:1px solid rgba(108,140,255,.2);color:var(--accent)}
.alert-yellow{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--yellow)}
.alert-green{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)}
code{font-family:'Cascadia Code','Fira Code',monospace;background:var(--card);padding:1px 6px;border-radius:4px;font-size:13px;color:var(--cyan)}
pre{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;margin:12px 0;font-size:12px;overflow-x:auto;line-height:1.6;color:var(--text);font-family:'Cascadia Code','Fira Code',monospace}
.dd-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
@media(max-width:700px){.dd-grid{grid-template-columns:1fr}.toc ol{columns:1}}
.dd-card{border-radius:10px;padding:16px;font-size:14px;line-height:1.8}
.dd-dont{background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.2)}
.dd-do{background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2)}
.dd-card h4{margin:0 0 8px;font-size:15px}
.faq-item{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px}
.faq-q{font-size:15px;color:var(--heading);font-weight:600;margin-bottom:8px;display:flex;align-items:flex-start;gap:8px}
.faq-a{font-size:13px;line-height:1.8;padding-left:28px}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
.badge-red{background:rgba(248,113,113,.15);color:var(--red)}
.badge-green{background:rgba(74,222,128,.15);color:var(--green)}
.badge-yellow{background:rgba(251,191,36,.15);color:var(--yellow)}
.doc-footer{text-align:center;padding:24px 0;border-top:1px solid var(--border);margin-top:40px;font-size:12px;color:var(--dim)}
.redline{border-left:3px solid var(--red);padding-left:12px;margin:12px 0}
.detail-block{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0}
.detail-block summary{cursor:pointer;font-size:13px;color:var(--heading);font-weight:600}
.checklist{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin:12px 0}
.checklist h4{color:var(--heading);margin-bottom:8px}
.check-item{display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:14px}
.check-item .box{width:16px;height:16px;border:1px solid var(--border);border-radius:3px;flex-shrink:0;margin-top:2px}
.flow{display:flex;align-items:center;gap:0;margin:16px 0;flex-wrap:wrap}
.flow-node{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;text-align:center;min-width:80px}
.flow-node strong{display:block;color:var(--heading);font-size:13px;margin-bottom:2px}
.flow-arrow{color:var(--cyan);font-size:16px;padding:0 4px;flex-shrink:0}"""

# ============ Build HTML ============
html_parts = []

def H(s):
    html_parts.append(s)

H(f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SVN/Perforce 目录结构标准</title>
<style>
{css}
</style>
</head>
<body>
<div class="doc">

<div class="doc-header">
  <h1>📂 SVN/Perforce 目录结构标准 <span class="ver">v2.0</span></h1>
  <div class="subtitle">SVN / Perforce Directory Structure Standard &amp; Operations Guide</div>
  <div class="meta">
    <span>📋 适用：全阶段</span>
    <span>👤 维护：孙七 / TA组</span>
    <span>📅 2026-05-27</span>
    <span>📦 升级：v1.0 → v2.0（+9章节，内容量×3）</span>
  </div>
</div>

<div class="toc">
  <h3>📑 目录（18章）</h3>
  <ol>
    <li><a href="#s1">美术资产根目录结构设计</a></li>
    <li><a href="#s2">每个工种子目录规范</a></li>
    <li><a href="#s3">文件命名规约</a></li>
    <li><a href="#s4">SVN vs Perforce 分支策略</a></li>
    <li><a href="#s5">权限模型</a></li>
    <li><a href="#s6">Perforce Typemap 完整配置</a></li>
    <li><a href="#s7">Workspace / Client Spec 模板</a></li>
    <li><a href="#s8">SVN 属性管理最佳实践</a></li>
    <li><a href="#s9">大文件存储策略与容量规划</a></li>
    <li><a href="#s10">Hook 脚本库</a></li>
    <li><a href="#s11">CI/CD 集成与资产校验管线</a></li>
    <li><a href="#s12">迁移指南（SVN→P4 / P4→Git LFS）</a></li>
    <li><a href="#s13">性能调优与运维</a></li>
    <li><a href="#s14">跨部门协作流程</a></li>
    <li><a href="#s15">常见踩坑案例（10+）</a></li>
    <li><a href="#s16">Commit Message 规范</a></li>
    <li><a href="#s17">Do / Don't 示例</a></li>
    <li><a href="#s18">提交前自检清单</a></li>
  </ol>
</div>""")

# === S1: 根目录 ===
H("""
<div class="section" id="s1">
<h2>📁 1. 美术资产根目录结构设计</h2>
<div class="alert alert-blue"><strong>核心原则</strong>：按工种划分一级 + 按资产划分二级 + 四目录模型（Source/Export/Temp/Archive）三层标准。</div>

<div class="sub-title">1.1 一级目录（按工种划分）</div>
<pre>/ArtAssets/
├── Character/          # 角色资产
├── Scene/              # 场景资产
├── UI/                 # UI 资产
├── VFX/                # 特效资产
├── Animation/          # 动画资产
├── Audio/              # 音效资产
├── Cinematics/         # 过场动画 / CG素材 [NEW]
├── _Common/            # 公共资源（通用材质、Shader、共享贴图）
├── _Reference/         # 参考资料（风格板、Moodboard）
├── _Template/          # 模板文件（PSD/Max/Maya模板）
├── _Prototype/         # 原型 / Blockout 共享区 [NEW]
└── _Archive/           # 归档区（已下线/已废弃资产）</pre>

<div class="sub-title">1.2 二级目录（角色为例）</div>
<pre>/ArtAssets/Character/
├── Hero/               # 可操作角色
│   ├── CH_Luna/
│   │   ├── Source/     # 源文件
│   │   ├── Export/     # 导出文件
│   │   ├── Temp/       # 临时文件
│   │   └── Archive/    # 归档
│   └── CH_Kaito/
├── NPC/                # NPC
├── Monster/            # 怪物
├── Mount/              # 坐骑 [NEW]
├── Pet/                # 宠物 [NEW]
└── _Skeleton/          # 共享骨骼库</pre>

<div class="sub-title">1.3 设计原则矩阵</div>
<table>
<tr><th>原则</th><th>说明</th><th>反例</th></tr>
<tr><td><strong>工种隔离</strong></td><td>一级按工种分，绝不混合</td><td>✗ 角色PSD放Scene/下</td></tr>
<tr><td><strong>资产自包含</strong></td><td>单资产所有文件集中同一子目录</td><td>✗ 同角色贴图和模型分开放</td></tr>
<tr><td><strong>源导分离</strong></td><td>Source/和Export/物理分开</td><td>✗ PSD和PNG混放</td></tr>
<tr><td><strong>可发现性</strong></td><td>仅通过目录就能知道资产类型</td><td>✗ 大量无意义编号文件夹</td></tr>
<tr><td><strong>扩展性</strong></td><td>新工种/新子类能平滑加入</td><td>✗ 目录层级超过5层</td></tr>
<tr><td><strong>可清理性</strong></td><td>Temp/Archive有明确生命周期</td><td>✗ 无清理机制导致仓库膨胀</td></tr>
</table>
</div>""")

# === S2: 工种子目录 ===
H("""
<div class="section" id="s2">
<h2>📂 2. 每个工种子目录规范</h2>
<div class="sub-title">2.1 标准四目录模型</div>
<table>
<tr><th>目录</th><th>用途</th><th>权限</th><th>清理策略</th></tr>
<tr><td><strong>Source/</strong></td><td>PSD/MAX/Maya/Blender源文件</td><td>美术读写</td><td>永久保留</td></tr>
<tr><td><strong>Export/</strong></td><td>FBX/PNG/TGA引擎格式</td><td>美术+程序读写</td><td>永久保留</td></tr>
<tr><td><strong>Temp/</strong></td><td>WIP中间产物</td><td>美术读写</td><td>每Sprint清理&gt;30天</td></tr>
<tr><td><strong>Archive/</strong></td><td>旧版本/废弃资产</td><td>管理员可写</td><td>每版本发布后清理&gt;90天</td></tr>
</table>

<div class="sub-title">2.2 各工种完整结构</div>
<details class="detail-block"><summary>📂 场景 (Scene)</summary>
<pre>/ArtAssets/Scene/
├── MainCity/
│   ├── Source/ → *.max, *.blend
│   ├── Export/ → Mesh/, Texture/, Lightmap/
│   ├── Temp/
│   └── Archive/
├── Dungeon/            # 副本
├── OpenWorld/           # 开放世界区块
│   ├── Chunk_A01/
│   └── Chunk_A02/
└── _Shared/            # 场景公用模块化资产 [NEW]</pre></details>

<details class="detail-block"><summary>📂 UI</summary>
<pre>/ArtAssets/UI/
├── Atlas/   → Common/, Battle/, Shop/
├── Icon/    → Item/, Skill/, Avatar/, Achievement/ [NEW]
├── Font/
├── Spine/              # Spine动效 [NEW]
├── Source/
└── Export/</pre></details>

<details class="detail-block"><summary>📂 特效 (VFX)</summary>
<pre>/ArtAssets/VFX/
├── Character/ → Skill/, Hit/, Buff/, Ultimate/ [NEW]
├── Scene/
├── UI/
├── Weather/            # 天气系统 [NEW]
├── Texture/ → Noise/, Dissolve/, Distortion/, Gradient/ [NEW]
└── _Prefab/</pre></details>

<details class="detail-block"><summary>📂 动画 (Animation)</summary>
<pre>/ArtAssets/Animation/
├── Character/
│   └── CH_Luna/ → Idle/, Locomotion/ [NEW], Attack/, Skill/, Death/, Additive/ [NEW]
├── Cutscene/
├── Camera/
├── Facial/             # 面部动画/表情捕捉 [NEW]
└── _Rig/</pre></details>

<details class="detail-block"><summary>📂 过场动画 (Cinematics) [NEW]</summary>
<pre>/ArtAssets/Cinematics/
├── Cutscene/
│   └── CS_Opening/ → Source/, Export/, Audio/, Storyboard/
├── Trailer/
└── _Shared/</pre></details>
</div>""")

# === S3: 命名 ===
H("""
<div class="section" id="s3">
<h2>🏷️ 3. 文件命名规约</h2>
<div class="sub-title">3.1 命名公式</div>
<pre>[前缀]_[模块]_[描述]_[变体]_[版本号].[扩展名]</pre>

<div class="sub-title">3.2 前缀规范（完整表）</div>
<table>
<tr><th>前缀</th><th>含义</th><th>示例</th></tr>
<tr><td><code>CH_</code></td><td>Character</td><td><code>CH_Luna_Body_v02.fbx</code></td></tr>
<tr><td><code>SC_</code></td><td>Scene</td><td><code>SC_MainCity_Tower_A.fbx</code></td></tr>
<tr><td><code>UI_</code></td><td>UI</td><td><code>UI_Battle_HpBar.png</code></td></tr>
<tr><td><code>VFX_</code></td><td>特效</td><td><code>VFX_Skill_FireBall_01.prefab</code></td></tr>
<tr><td><code>AN_</code></td><td>Animation</td><td><code>AN_Luna_Attack01.fbx</code></td></tr>
<tr><td><code>MAT_</code></td><td>Material</td><td><code>MAT_Skin_Common.mat</code></td></tr>
<tr><td><code>TEX_</code></td><td>Texture</td><td><code>TEX_Luna_Body_D.tga</code></td></tr>
<tr><td><code>SK_</code></td><td>Skeleton</td><td><code>SK_Humanoid_Male.fbx</code></td></tr>
<tr><td><code>SM_</code></td><td>Static Mesh [NEW]</td><td><code>SM_Rock_Large_01.fbx</code></td></tr>
<tr><td><code>BP_</code></td><td>Blueprint [NEW]</td><td><code>BP_Door_Interactive.uasset</code></td></tr>
<tr><td><code>SFX_</code></td><td>Sound Effect [NEW]</td><td><code>SFX_Sword_Hit_01.wav</code></td></tr>
<tr><td><code>MUS_</code></td><td>Music [NEW]</td><td><code>MUS_Battle_Theme.ogg</code></td></tr>
<tr><td><code>PT_</code></td><td>Particle [NEW]</td><td><code>PT_Dust_Impact_01.asset</code></td></tr>
<tr><td><code>LM_</code></td><td>Lightmap [NEW]</td><td><code>LM_MainCity_01.exr</code></td></tr>
</table>

<div class="sub-title">3.3 贴图后缀规范</div>
<table>
<tr><th>后缀</th><th>含义</th><th>后缀</th><th>含义</th></tr>
<tr><td><code>_D</code></td><td>Diffuse/Albedo</td><td><code>_N</code></td><td>Normal Map</td></tr>
<tr><td><code>_M</code></td><td>Metallic</td><td><code>_R</code></td><td>Roughness</td></tr>
<tr><td><code>_AO</code></td><td>Ambient Occlusion</td><td><code>_E</code></td><td>Emissive</td></tr>
<tr><td><code>_MRA</code></td><td>M+R+AO合并</td><td><code>_Mask</code></td><td>遮罩图</td></tr>
<tr><td><code>_H</code></td><td>Height [NEW]</td><td><code>_SSS</code></td><td>次表面散射 [NEW]</td></tr>
<tr><td><code>_Flow</code></td><td>Flow Map [NEW]</td><td><code>_Curvature</code></td><td>曲率图 [NEW]</td></tr>
</table>

<div class="sub-title">3.4 LOD 命名规范 [NEW]</div>
<table>
<tr><th>LOD</th><th>命名</th><th>用途</th><th>面数比例</th></tr>
<tr><td>LOD0</td><td><code>CH_Luna_LOD0.fbx</code></td><td>近景/特写</td><td>100%</td></tr>
<tr><td>LOD1</td><td><code>CH_Luna_LOD1.fbx</code></td><td>中景</td><td>50%</td></tr>
<tr><td>LOD2</td><td><code>CH_Luna_LOD2.fbx</code></td><td>远景</td><td>25%</td></tr>
<tr><td>LOD3</td><td><code>CH_Luna_LOD3.fbx</code></td><td>超远/小地图</td><td>10%</td></tr>
</table>

<div class="sub-title">3.5 多语言资产命名 [NEW]</div>
<table>
<tr><th>语言</th><th>后缀</th><th>示例</th></tr>
<tr><td>中文(简)</td><td><code>_zh-CN</code></td><td><code>UI_Title_Logo_zh-CN.png</code></td></tr>
<tr><td>英文</td><td><code>_en</code></td><td><code>UI_Title_Logo_en.png</code></td></tr>
<tr><td>日语</td><td><code>_ja</code></td><td><code>UI_Title_Logo_ja.png</code></td></tr>
<tr><td>韩语</td><td><code>_ko</code></td><td><code>UI_Title_Logo_ko.png</code></td></tr>
</table>

<div class="sub-title">3.6 版本号规则</div>
<div class="redline"><p><strong>🔴 核心红线</strong>：<strong>只在 Source/ 目录使用版本号</strong>，Export/ 始终使用最新版（无版本后缀）。</p></div>
<p>格式：<code>_v01</code>, <code>_v02</code>... 归档旧版加日期：<code>CH_Luna_Body_v01_20260315.fbx</code></p>
</div>""")

# === S4: 分支策略 ===
H("""
<div class="section" id="s4">
<h2>🔀 4. SVN vs Perforce 分支策略</h2>
<div class="sub-title">4.1 核心差异对比</div>
<table>
<tr><th>维度</th><th>SVN</th><th>Perforce (P4)</th></tr>
<tr><td>架构</td><td>中心化，单一仓库</td><td>中心化，Workspace映射</td></tr>
<tr><td>大文件处理</td><td>差（全量存储）</td><td>优秀（增量+二进制专用）</td></tr>
<tr><td>文件锁定</td><td>svn:needs-lock</td><td>原生exclusive checkout</td></tr>
<tr><td>分支成本</td><td>低（目录复制）</td><td>极低（虚拟分支/Stream）</td></tr>
<tr><td>并发性能</td><td>中等（<50人）</td><td>优秀（500+人）</td></tr>
<tr><td>最大文件数</td><td>百万级吃力</td><td>千万级无压力</td></tr>
<tr><td>原子提交</td><td>✓</td><td>✓（Changelist）</td></tr>
<tr><td>推荐规模</td><td>&lt;50人</td><td>50~500+人</td></tr>
</table>

<div class="sub-title">4.2 SVN 分支策略</div>
<pre>/svn/
├── trunk/              # 主干（稳定版本）
│   └── ArtAssets/
├── branches/
│   ├── feat_new-hero/
│   ├── feat_scene-v2/
│   └── hotfix_ui-bug/ # 紧急修复 [NEW]
├── tags/
│   ├── alpha_20260315/
│   ├── beta_20260531/
│   └── rc_20260701/   # Release Candidate [NEW]
└── vendor/             # 第三方/外包交付 [NEW]</pre>

<div class="sub-title">4.3 Perforce Stream 策略</div>
<pre>//depot/ArtProject/
├── main/               # 主流
├── dev/
│   ├── dev_character/
│   ├── dev_scene/
│   └── dev_vfx/       [NEW]
├── release/
│   ├── release_alpha/
│   └── release_beta/
└── virtual/            # 虚拟流/Task Stream [NEW]
    ├── task_luna-rework/
    └── task_ui-overhaul/</pre>

<div class="sub-title">4.4 Stream 类型选择指南 [NEW]</div>
<table>
<tr><th>类型</th><th>用途</th><th>合并方向</th></tr>
<tr><td><code>mainline</code></td><td>主干，唯一真实来源</td><td>接受合并，不主动发起</td></tr>
<tr><td><code>development</code></td><td>日常开发</td><td>copy up to main, merge down</td></tr>
<tr><td><code>release</code></td><td>版本发布</td><td>仅接受cherry-pick</td></tr>
<tr><td><code>virtual</code></td><td>临时任务，用完即删</td><td>轻量级，不占服务端存储</td></tr>
<tr><td><code>task</code></td><td>个人/小组任务</td><td>完成后merge回dev</td></tr>
</table>

<div class="sub-title">4.5 分支命名规范 [NEW]</div>
<table>
<tr><th>场景</th><th>SVN</th><th>P4 Stream</th></tr>
<tr><td>新功能</td><td><code>branches/feat_[desc]</code></td><td><code>dev/dev_[desc]</code></td></tr>
<tr><td>Bug修复</td><td><code>branches/hotfix_[id]</code></td><td><code>virtual/fix_[id]</code></td></tr>
<tr><td>发布</td><td><code>tags/[milestone]_[date]</code></td><td><code>release/release_[ver]</code></td></tr>
<tr><td>个人任务</td><td><code>branches/user_[name]</code></td><td><code>virtual/task_[name]</code></td></tr>
</table>
</div>""")

# === S5: 权限 ===
H("""
<div class="section" id="s5">
<h2>🔐 5. 权限模型</h2>
<div class="sub-title">5.1 三级权限体系</div>
<table>
<tr><th>角色</th><th>权限</th><th>适用人员</th></tr>
<tr><td>🔴 管理员</td><td>完全控制</td><td>TA Lead / APM</td></tr>
<tr><td>🟡 读写</td><td>提交+检出（限定目录）</td><td>美术组员</td></tr>
<tr><td>🟢 只读</td><td>仅检出</td><td>策划、QA、运营</td></tr>
</table>

<div class="sub-title">5.2 目录级权限矩阵</div>
<table>
<tr><th>目录</th><th>美术组</th><th>程序</th><th>策划</th><th>QA</th><th>外包</th></tr>
<tr><td><code>/Character/</code></td><td>读写</td><td>只读</td><td>只读</td><td>只读</td><td>—</td></tr>
<tr><td><code>/Character/*/Export/</code></td><td>读写</td><td>读写</td><td>只读</td><td>只读</td><td>—</td></tr>
<tr><td><code>/UI/</code></td><td>读写</td><td>只读</td><td>只读</td><td>只读</td><td>—</td></tr>
<tr><td><code>/_Reference/</code></td><td>读写</td><td>只读</td><td>读写</td><td>只读</td><td>只读</td></tr>
<tr><td><code>/_Archive/</code></td><td>管理员</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
<tr><td><code>/vendor/</code></td><td>只读</td><td>只读</td><td>—</td><td>—</td><td>读写</td></tr>
</table>

<div class="sub-title">5.3 P4 Protect Table 示例 [NEW]</div>
<pre>write  group  art_char    *  //depot/.../Character/...
write  group  art_ui      *  //depot/.../UI/...
read   group  programmer  *  //depot/.../ArtAssets/...
write  group  programmer  *  //depot/.../*/Export/...
super  user   ta_lead     *  //depot/...
=write group  outsource   *  //depot/.../vendor/...</pre>

<div class="sub-title">5.4 SVN authz 示例 [NEW]</div>
<pre>[groups]
art_char = zhangsan, lisi
programmers = dev1, dev2

[/ArtAssets/Character]
@art_char = rw
@programmers = r
* = r

[/ArtAssets/_Archive]
ta_lead = rw
* = r</pre>
</div>""")

# === S6: Typemap ===
H("""
<div class="section" id="s6">
<h2>🗂️ 6. Perforce Typemap 完整配置 [NEW]</h2>
<div class="alert alert-blue"><strong>为什么重要</strong>：Typemap 告诉 P4 如何存储和处理文件——错误配置会导致二进制被当文本、换行符损坏、或反复全量传输。</div>

<div class="sub-title">6.1 游戏项目完整 Typemap</div>
<pre># p4 typemap
TypeMap:
    # 图片/贴图 (独占锁定)
    binary+l  //depot/....psd
    binary+l  //depot/....tga
    binary+l  //depot/....png
    binary+l  //depot/....jpg
    binary+l  //depot/....exr
    binary+l  //depot/....hdr
    binary+l  //depot/....dds
    binary+l  //depot/....tif

    # 3D 模型 (独占锁定)
    binary+l  //depot/....fbx
    binary+l  //depot/....obj
    binary+l  //depot/....max
    binary+l  //depot/....mb
    binary+l  //depot/....ma
    binary+l  //depot/....blend
    binary+l  //depot/....ztl
    binary+l  //depot/....abc

    # 引擎资产 (独占锁定)
    binary+l  //depot/....uasset
    binary+l  //depot/....umap
    binary+l  //depot/....prefab
    binary+l  //depot/....unity
    binary+l  //depot/....asset
    binary+l  //depot/....mat
    binary+l  //depot/....anim
    binary+l  //depot/....controller

    # 音频/视频
    binary+l  //depot/....wav
    binary+l  //depot/....ogg
    binary+l  //depot/....mp3
    binary+l  //depot/....mp4
    binary+l  //depot/....mov
    binary+l  //depot/....wem
    binary+l  //depot/....bnk

    # 压缩包/库 (不锁定)
    binary    //depot/....zip
    binary    //depot/....dll
    binary    //depot/....exe
    binary    //depot/....so

    # 文本 (可merge)
    text      //depot/....cs
    text      //depot/....cpp
    text      //depot/....h
    text      //depot/....py
    text      //depot/....json
    text      //depot/....xml
    text      //depot/....yaml
    text      //depot/....shader
    text      //depot/....hlsl</pre>

<div class="sub-title">6.2 标记说明</div>
<table>
<tr><th>标记</th><th>含义</th><th>使用场景</th></tr>
<tr><td><code>binary+l</code></td><td>二进制+独占锁</td><td>所有美术源文件和导出文件</td></tr>
<tr><td><code>binary+S</code></td><td>二进制+仅存最新版</td><td>Temp/下的大文件（节省存储）</td></tr>
<tr><td><code>binary</code></td><td>普通二进制</td><td>压缩包、可执行文件</td></tr>
<tr><td><code>text</code></td><td>文本，可diff/merge</td><td>代码、配置文件</td></tr>
<tr><td><code>text+w</code></td><td>文本+始终可写</td><td>本地配置文件</td></tr>
</table>
</div>""")

# === S7: Workspace ===
H("""
<div class="section" id="s7">
<h2>💻 7. Workspace / Client Spec 模板 [NEW]</h2>
<div class="alert alert-blue">正确的Client Spec确保美术只同步自己工种文件，避免拉取整库导致磁盘爆满。</div>

<div class="sub-title">7.1 角色组美术 Workspace</div>
<pre>Client: art_zhangsan_character
Owner:  zhangsan
Root:   D:\\P4\\ArtProject
Options: allwrite noclobber nocompress unlocked nomodtime
SubmitOptions: submitunchanged
LineEnd: local
Stream: //depot/ArtProject/dev/dev_character

View:
  //depot/.../Character/... //art_zhangsan_character/Character/...
  //depot/.../_Common/...   //art_zhangsan_character/_Common/...
  //depot/.../_Template/... //art_zhangsan_character/_Template/...</pre>

<div class="sub-title">7.2 程序组 Workspace（仅 Export）</div>
<pre>Client: dev_wang_engine
View:
  //depot/.../*/Export/...  //dev_wang_engine/Export/...
  //depot/.../_Common/...   //dev_wang_engine/_Common/...</pre>

<div class="sub-title">7.3 关键参数说明</div>
<table>
<tr><th>参数</th><th>推荐值</th><th>说明</th></tr>
<tr><td>Options</td><td>allwrite noclobber</td><td>允许本地可写，不覆盖未提交修改</td></tr>
<tr><td>SubmitOptions</td><td>submitunchanged</td><td>允许提交未修改文件（避免元数据报错）</td></tr>
<tr><td>LineEnd</td><td>local</td><td>使用本地OS换行符</td></tr>
</table>
</div>""")

# === S8: SVN Properties ===
H("""
<div class="section" id="s8">
<h2>🔧 8. SVN 属性管理最佳实践 [NEW]</h2>
<div class="sub-title">8.1 必设属性</div>
<table>
<tr><th>属性</th><th>作用</th><th>命令示例</th></tr>
<tr><td><code>svn:needs-lock</code></td><td>强制独占编辑</td><td><code>svn propset svn:needs-lock "*" *.psd</code></td></tr>
<tr><td><code>svn:mime-type</code></td><td>标记MIME类型</td><td><code>svn propset svn:mime-type "image/png" *.png</code></td></tr>
<tr><td><code>svn:ignore</code></td><td>忽略本地文件</td><td><code>svn propset svn:ignore "*.tmp" .</code></td></tr>
<tr><td><code>svn:global-ignores</code></td><td>全局忽略</td><td>见下方配置</td></tr>
</table>

<div class="sub-title">8.2 auto-props 服务端配置</div>
<pre>[auto-props]
*.psd = svn:needs-lock=*;svn:mime-type=application/photoshop
*.tga = svn:needs-lock=*;svn:mime-type=image/x-tga
*.fbx = svn:needs-lock=*;svn:mime-type=application/octet-stream
*.max = svn:needs-lock=*;svn:mime-type=application/octet-stream
*.mb  = svn:needs-lock=*;svn:mime-type=application/octet-stream
*.blend = svn:needs-lock=*;svn:mime-type=application/octet-stream
*.uasset = svn:needs-lock=*;svn:mime-type=application/octet-stream
*.wav = svn:needs-lock=*;svn:mime-type=audio/wav</pre>

<div class="sub-title">8.3 推荐全局忽略</div>
<pre>svn:global-ignores = *.tmp *.bak *.swp .DS_Store Thumbs.db
    desktop.ini *.log *.cache __pycache__ .vs .idea *.suo</pre>
</div>""")

# === S9: 大文件 ===
H("""
<div class="section" id="s9">
<h2>📦 9. 大文件存储策略与容量规划 [NEW]</h2>
<div class="sub-title">9.1 文件分级策略</div>
<table>
<tr><th>分级</th><th>大小</th><th>存储策略</th><th>示例</th></tr>
<tr><td>🟢 小文件</td><td>&lt;10MB</td><td>正常提交，全版本历史</td><td>贴图PNG、配置文件</td></tr>
<tr><td>🟡 中文件</td><td>10~200MB</td><td>正常提交+独占锁</td><td>PSD、FBX、MAX</td></tr>
<tr><td>🔴 大文件</td><td>200MB~2GB</td><td>独占锁+仅存最新3版</td><td>高精ZBrush、场景合集</td></tr>
<tr><td>⚫ 超大文件</td><td>&gt;2GB</td><td>外部存储（NAS/OSS），仅存引用</td><td>4K视频、完整CG源文件</td></tr>
</table>

<div class="sub-title">9.2 容量规划参考</div>
<table>
<tr><th>项目规模</th><th>团队</th><th>预计仓库</th><th>年增长</th><th>建议磁盘</th></tr>
<tr><td>小型手游</td><td>10~20人</td><td>50~200GB</td><td>~100GB/年</td><td>1TB SSD</td></tr>
<tr><td>中型端游</td><td>30~80人</td><td>500GB~2TB</td><td>~500GB/年</td><td>4TB SSD RAID</td></tr>
<tr><td>AAA大作</td><td>100+人</td><td>5~20TB</td><td>~3TB/年</td><td>分库 + NAS</td></tr>
</table>

<div class="sub-title">9.3 P4 分库架构（大项目） [NEW]</div>
<pre>// 按工种分Depot，独立管理存储和备份
//depot_character/...   → 角色资产仓库
//depot_scene/...       → 场景资产仓库
//depot_code/...        → 代码仓库（小且频繁）
//depot_cinematic/...   → 过场/视频（超大文件独立）</pre>

<div class="sub-title">9.4 存储优化技巧</div>
<table>
<tr><th>技巧</th><th>节省幅度</th><th>方法</th></tr>
<tr><td>Temp/定期清理</td><td>20~40%</td><td>CI定时删除>30天Temp文件</td></tr>
<tr><td>binary+S标记</td><td>30~50%</td><td>仅存最新版的WIP文件</td></tr>
<tr><td>obliterate废弃资产</td><td>10~20%</td><td>永久删除无用历史（慎用）</td></tr>
<tr><td>压缩Depot</td><td>15~25%</td><td>P4服务端启用压缩</td></tr>
</table>
</div>""")

# === S10: Hook ===
H("""
<div class="section" id="s10">
<h2>🪝 10. Hook 脚本库 [NEW]</h2>
<div class="alert alert-green"><strong>作用</strong>：Hook 在提交前/后自动执行校验，将规范从"人为记忆"变为"系统强制"。</div>

<div class="sub-title">10.1 Pre-commit Hook 集合</div>
<table>
<tr><th>Hook</th><th>功能</th><th>触发条件</th></tr>
<tr><td>文件大小检查</td><td>拦截超过阈值(500MB)的单文件</td><td>任何提交</td></tr>
<tr><td>命名规范校验</td><td>检查前缀/后缀是否符合规范</td><td>新增文件</td></tr>
<tr><td>目录合规性</td><td>确保文件在正确目录下</td><td>新增文件</td></tr>
<tr><td>禁止系统文件</td><td>拦截.DS_Store/Thumbs.db等</td><td>任何提交</td></tr>
<tr><td>锁定检查</td><td>确认二进制文件已锁定</td><td>修改二进制</td></tr>
<tr><td>Commit Message格式</td><td>校验[TYPE][工种]格式</td><td>任何提交</td></tr>
<tr><td>空目录检查</td><td>禁止提交空目录</td><td>任何提交</td></tr>
</table>

<div class="sub-title">10.2 P4 Trigger 示例</div>
<pre># p4 triggers
Triggers:
  # 文件大小限制 (500MB)
  size-check   change-submit  //depot/...  "python3 /hooks/check_filesize.py %changelist% 524288000"
  # 命名规范
  name-check   change-submit  //depot/.../ArtAssets/...  "python3 /hooks/check_naming.py %changelist%"
  # 禁止系统文件
  no-junk      change-submit  //depot/...  "python3 /hooks/block_junk.py %changelist%"
  # Commit Message 格式
  msg-format   change-submit  //depot/...  "python3 /hooks/check_message.py %changelist%"</pre>

<div class="sub-title">10.3 SVN pre-commit Hook 示例</div>
<pre>#!/bin/bash
# SVN pre-commit hook: 拦截超大文件 + 系统垃圾文件
REPOS="$1"; TXN="$2"
MAX_SIZE=524288000  # 500MB

# 检查文件大小
svnlook changed -t "$TXN" "$REPOS" | while read STATUS FILE; do
  if [ "$STATUS" != "D" ]; then
    SIZE=$(svnlook filesize -t "$TXN" "$REPOS" "$FILE" 2>/dev/null)
    if [ "$SIZE" -gt "$MAX_SIZE" ]; then
      echo "ERROR: $FILE exceeds 500MB limit ($SIZE bytes)" >&2
      exit 1
    fi
  fi
done

# 检查禁止的文件
JUNK=$(svnlook changed -t "$TXN" "$REPOS" | grep -iE "(Thumbs\.db|\.DS_Store|desktop\.ini)")
if [ -n "$JUNK" ]; then
  echo "ERROR: System files not allowed: $JUNK" >&2
  exit 1
fi</pre>
</div>""")

# === S11: CI/CD ===
H("""
<div class="section" id="s11">
<h2>🔄 11. CI/CD 集成与资产校验管线 [NEW]</h2>
<div class="sub-title">11.1 自动化校验管线流程</div>
<div class="flow">
<div class="flow-node start"><strong>提交触发</strong></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>命名校验</strong></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>大小检查</strong></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>贴图规格</strong></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>引用完整性</strong></div>
<span class="flow-arrow">→</span>
<div class="flow-node gate"><strong>质量门禁</strong></div>
<span class="flow-arrow">→</span>
<div class="flow-node end"><strong>✓ 入库</strong></div>
</div>

<div class="sub-title">11.2 校验规则详情</div>
<table>
<tr><th>校验项</th><th>规则</th><th>失败处理</th></tr>
<tr><td>贴图尺寸</td><td>必须为2的幂次方（256/512/1024/2048/4096）</td><td>拒绝提交</td></tr>
<tr><td>贴图格式</td><td>Export/下仅允许TGA/PNG/EXR</td><td>拒绝提交</td></tr>
<tr><td>模型面数</td><td>角色LOD0 &lt; 10万面，场景单模块 &lt; 50万面</td><td>告警+通知TA</td></tr>
<tr><td>骨骼数量</td><td>移动端 &lt; 75骨骼</td><td>告警</td></tr>
<tr><td>引用路径</td><td>无断裂引用（Material→Texture）</td><td>拒绝提交</td></tr>
<tr><td>FBX版本</td><td>统一使用FBX 2020格式</td><td>告警</td></tr>
<tr><td>重复资产</td><td>检测相似度>95%的重复贴图</td><td>告警+建议复用</td></tr>
</table>

<div class="sub-title">11.3 Jenkins Pipeline 示例</div>
<pre>pipeline {
  agent any
  triggers { p4branchSCM('//depot/ArtProject/main/...') }
  stages {
    stage('Asset Validation') {
      steps {
        sh 'python3 tools/validate_textures.py --path Export/'
        sh 'python3 tools/validate_naming.py --path ArtAssets/'
        sh 'python3 tools/check_references.py'
      }
    }
    stage('Build Asset Bundle') {
      when { branch 'main' }
      steps {
        sh 'unity -batchmode -executeMethod BuildPipeline.Build'
      }
    }
    stage('Notify') {
      steps {
        sh 'python3 tools/notify_team.py --channel art-ci'
      }
    }
  }
}</pre>
</div>""")

# === S12: 迁移指南 ===
H("""
<div class="section" id="s12">
<h2>🚚 12. 迁移指南（SVN→P4 / P4→Git LFS）[NEW]</h2>
<div class="sub-title">12.1 SVN → Perforce 迁移步骤</div>
<table>
<tr><th>步骤</th><th>操作</th><th>注意事项</th></tr>
<tr><td>1. 导出</td><td><code>svnrdump dump</code> 导出完整历史</td><td>确保包含所有分支和tags</td></tr>
<tr><td>2. 转换</td><td>使用 <code>p4convert</code> 工具</td><td>映射SVN目录到P4 Stream</td></tr>
<tr><td>3. 导入</td><td><code>p4 submit</code> 批量提交</td><td>保留原始提交时间和作者</td></tr>
<tr><td>4. Typemap</td><td>配置完整Typemap</td><td>参考§6配置</td></tr>
<tr><td>5. 权限</td><td>迁移authz到Protect Table</td><td>参考§5配置</td></tr>
<tr><td>6. 验证</td><td>对比文件数和MD5</td><td>确保无丢失</td></tr>
</table>

<div class="sub-title">12.2 Perforce → Git LFS 迁移步骤</div>
<table>
<tr><th>步骤</th><th>操作</th><th>注意事项</th></tr>
<tr><td>1. 导出</td><td><code>git p4 clone</code></td><td>指定需要的depot路径</td></tr>
<tr><td>2. LFS追踪</td><td><code>git lfs track "*.psd" "*.fbx"</code></td><td>覆盖所有二进制格式</td></tr>
<tr><td>3. 历史重写</td><td><code>git lfs migrate</code></td><td>将已有大文件迁入LFS</td></tr>
<tr><td>4. 推送</td><td><code>git push --all</code></td><td>确保LFS服务器存储充足</td></tr>
</table>

<div class="alert alert-yellow"><strong>⚠️ 迁移风险提示</strong>：大型仓库(>500GB)迁移建议分批进行；迁移期间冻结提交；保留旧系统只读访问至少30天。</div>
</div>""")

# === S13: 性能调优 ===
H("""
<div class="section" id="s13">
<h2>⚡ 13. 性能调优与运维 [NEW]</h2>
<div class="sub-title">13.1 P4 服务端参数优化</div>
<table>
<tr><th>参数</th><th>默认值</th><th>推荐值</th><th>作用</th></tr>
<tr><td><code>filesys.bufsize</code></td><td>64K</td><td>512K</td><td>IO缓冲区大小</td></tr>
<tr><td><code>db.peeking</code></td><td>0</td><td>2</td><td>减少表锁等待</td></tr>
<tr><td><code>net.parallel.max</code></td><td>0</td><td>10</td><td>并行传输数</td></tr>
<tr><td><code>net.parallel.threads</code></td><td>4</td><td>8</td><td>并行线程数</td></tr>
<tr><td><code>lbr.autocompress</code></td><td>0</td><td>1</td><td>自动压缩存储</td></tr>
<tr><td><code>server.maxcommands</code></td><td>无限</td><td>500</td><td>并发命令上限</td></tr>
</table>

<div class="sub-title">13.2 备份策略</div>
<table>
<tr><th>类型</th><th>频率</th><th>保留</th><th>方法</th></tr>
<tr><td>数据库(db.*)</td><td>每日</td><td>30天</td><td><code>p4 admin checkpoint</code></td></tr>
<tr><td>文件存储(lbr)</td><td>每周增量</td><td>90天</td><td>rsync/robocopy增量</td></tr>
<tr><td>全量备份</td><td>每月</td><td>12个月</td><td>完整镜像</td></tr>
<tr><td>异地容灾</td><td>实时</td><td>—</td><td>P4 Replica/Edge Server</td></tr>
</table>

<div class="sub-title">13.3 SVN 运维要点</div>
<table>
<tr><th>操作</th><th>频率</th><th>命令</th></tr>
<tr><td>Pack仓库</td><td>每月</td><td><code>svnadmin pack /path/to/repo</code></td></tr>
<tr><td>验证完整性</td><td>每周</td><td><code>svnadmin verify /path/to/repo</code></td></tr>
<tr><td>热备份</td><td>每日</td><td><code>svnadmin hotcopy</code></td></tr>
<tr><td>清理日志</td><td>每月</td><td>归档>30天的access/error日志</td></tr>
</table>
</div>""")

# === S14: 跨部门协作 ===
H("""
<div class="section" id="s14">
<h2>🤝 14. 跨部门协作流程 [NEW]</h2>
<div class="sub-title">14.1 美术→程序 交付流程</div>
<div class="flow">
<div class="flow-node start"><strong>美术完成</strong><div class="sub">Export/就绪</div></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>TA审核</strong><div class="sub">规格+性能</div></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>提交main</strong><div class="sub">merge到主干</div></div>
<span class="flow-arrow">→</span>
<div class="flow-node"><strong>CI校验</strong><div class="sub">自动检测</div></div>
<span class="flow-arrow">→</span>
<div class="flow-node end"><strong>程序集成</strong><div class="sub">引擎导入</div></div>
</div>

<div class="sub-title">14.2 外包协作模型</div>
<table>
<tr><th>阶段</th><th>操作</th><th>权限</th></tr>
<tr><td>任务分配</td><td>内部创建/vendor/[project]/任务目录</td><td>管理员</td></tr>
<tr><td>外包提交</td><td>外包仅能写入指定vendor子目录</td><td>限定读写</td></tr>
<tr><td>内部审核</td><td>TA检查规格→移入正式目录</td><td>TA读写</td></tr>
<tr><td>验收归档</td><td>合格资产入库，原始交付归档</td><td>管理员</td></tr>
</table>

<div class="sub-title">14.3 策划←→美术 资料同步</div>
<table>
<tr><th>方向</th><th>内容</th><th>存放位置</th></tr>
<tr><td>策划→美术</td><td>需求文档、风格参考、尺寸规格</td><td><code>/_Reference/[版本号]/</code></td></tr>
<tr><td>美术→策划</td><td>效果预览图、阶段产出截图</td><td><code>/_Reference/Preview/</code></td></tr>
</table>
</div>""")

# === S15: 踩坑案例 ===
H("""
<div class="section" id="s15">
<h2>⚠️ 15. 常见踩坑案例（10+）</h2>
<div class="alert alert-yellow"><strong>避坑指南</strong>：新人Onboarding时重点培训以下场景。</div>

<div class="faq-item">
<div class="faq-q">🚨 案例1：锁定冲突——美术吃饭忘解锁 <span class="badge badge-red">高频</span></div>
<div class="faq-a"><strong>根因</strong>：锁定后长时间离开。<strong>对策</strong>：P4配置4小时自动解锁；SVN管理员<code>svn unlock --force</code>；团队规约离开工位前检查锁定。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例2：二进制合并失败——FBX并发损坏 <span class="badge badge-red">高频</span></div>
<div class="faq-a"><strong>根因</strong>：二进制无法diff/merge。<strong>对策</strong>：所有二进制文件永远使用独占锁定（binary+l / svn:needs-lock）。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例3：引用路径断裂——本地rename导致材质失效 <span class="badge badge-red">高频</span></div>
<div class="faq-a"><strong>根因</strong>：直接rename+re-add丢失历史。<strong>对策</strong>：使用<code>svn move</code>/<code>p4 move</code>保留历史和路径关联。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例4：Temp目录膨胀——仓库从20GB→120GB <span class="badge badge-yellow">中频</span></div>
<div class="faq-a"><strong>根因</strong>：临时文件从不清理。<strong>对策</strong>：每Sprint清理>30天Temp文件；CI监控Temp大小；pre-commit拦截超大文件。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例5：Workspace映射错误——拉取整库卡死 [NEW] <span class="badge badge-yellow">中频</span></div>
<div class="faq-a"><strong>根因</strong>：新人用默认View映射了整个Depot。<strong>对策</strong>：提供工种专用Workspace模板（参考§7）；禁止使用<code>//depot/...</code>全映射。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例6：Typemap缺失——贴图被当文本处理 [NEW]</div>
<div class="faq-a"><strong>根因</strong>：新增文件类型未加入Typemap。<strong>对策</strong>：每次引入新格式时同步更新Typemap；定期审计文件类型。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例7：Stream方向错误——dev直接merge到release [NEW]</div>
<div class="faq-a"><strong>根因</strong>：不理解Stream合并方向。<strong>对策</strong>：配置Stream Spec限制合并方向；培训"copy up, merge down"原则。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例8：外包覆盖内部资产——权限配置不当 [NEW]</div>
<div class="faq-a"><strong>根因</strong>：外包账号有正式目录写权限。<strong>对策</strong>：外包仅限/vendor/目录写入；使用=write限制避免继承。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例9：LOD文件混乱——引擎加载错误LOD [NEW]</div>
<div class="faq-a"><strong>根因</strong>：LOD命名不统一，引擎无法自动识别。<strong>对策</strong>：严格执行_LOD0/_LOD1命名规范（参考§3.4）。</div>
</div>

<div class="faq-item">
<div class="faq-q">🚨 案例10：备份恢复失败——checkpoint过旧 [NEW]</div>
<div class="faq-a"><strong>根因</strong>：3个月未做checkpoint，journal文件巨大。<strong>对策</strong>：每日checkpoint + 每周增量备份 + 每月验证恢复。</div>
</div>
</div>""")

# === S16: Commit Message ===
H("""
<div class="section" id="s16">
<h2>📝 16. Commit Message 规范</h2>
<div class="sub-title">16.1 标准模板</div>
<pre>[类型][工种] 简要描述

详细说明（可选）

关联: TASK-xxx / REQ-xxx</pre>

<div class="sub-title">16.2 类型前缀</div>
<table>
<tr><th>前缀</th><th>含义</th><th>示例</th></tr>
<tr><td><code>[ADD]</code></td><td>新增资产</td><td><code>[ADD][角色] 新增Luna原画定稿</code></td></tr>
<tr><td><code>[MOD]</code></td><td>修改资产</td><td><code>[MOD][场景] 修改主城灯光参数</code></td></tr>
<tr><td><code>[FIX]</code></td><td>修复问题</td><td><code>[FIX][UI] 修复商城图标尺寸不一致</code></td></tr>
<tr><td><code>[DEL]</code></td><td>删除/归档</td><td><code>[DEL][角色] 归档废弃旧版Luna</code></td></tr>
<tr><td><code>[OPT]</code></td><td>优化</td><td><code>[OPT][特效] 优化火焰Overdraw</code></td></tr>
<tr><td><code>[WIP]</code></td><td>进行中</td><td><code>[WIP][动画] Luna攻击动画半成品</code></td></tr>
<tr><td><code>[MERGE]</code></td><td>合并操作 [NEW]</td><td><code>[MERGE] dev_character → main</code></td></tr>
<tr><td><code>[CFG]</code></td><td>配置变更 [NEW]</td><td><code>[CFG] 更新Typemap新增.spp格式</code></td></tr>
</table>

<div class="sub-title">16.3 错误 vs 正确</div>
<div class="dd-grid">
<div class="dd-card dd-dont"><h4>❌ Don't</h4><pre>"更新了文件"
"修改"
"aaa"
"test"
"."</pre></div>
<div class="dd-card dd-do"><h4>✅ Do</h4><pre>[ADD][角色] 新增CH_Luna高模Source
[MOD][UI] 更新主界面底栏图标 REQ-208
[FIX][特效] 修复Luna大招穿模 BUG-1024
[OPT][场景] 优化MainCity Draw Call数量</pre></div>
</div>
</div>""")

# === S17: Do/Don't ===
H("""
<div class="section" id="s17">
<h2>📌 17. Do / Don't 示例</h2>
<div class="dd-grid">
<div class="dd-card dd-do">
<h4>✅ Do — 正确做法</h4>
<p>✓ 按三层标准创建目录（工种→资产→四目录）</p>
<p>✓ 所有美术源文件设置独占锁定</p>
<p>✓ 为每个工种组分配对应目录权限</p>
<p>✓ 制定并执行Commit Message规范</p>
<p>✓ 每Sprint末清理Temp/目录</p>
<p>✓ 新人Onboarding讲解锁定→编辑→解锁流程</p>
<p>✓ 配置完整Typemap覆盖所有文件格式 [NEW]</p>
<p>✓ 使用工种专用Workspace模板 [NEW]</p>
<p>✓ 设置pre-commit Hook自动校验 [NEW]</p>
<p>✓ 定期checkpoint+备份验证 [NEW]</p>
</div>
<div class="dd-card dd-dont">
<h4>❌ Don't — 错误做法</h4>
<p>✗ 所有资产堆一个目录不区分工种</p>
<p>✗ 不设锁定导致二进制并发损坏</p>
<p>✗ 给所有人全仓库读写权限</p>
<p>✗ Commit Message全是"更新了文件"</p>
<p>✗ Temp/从不清理，仓库膨胀失控</p>
<p>✗ rename用删除+新增代替svn move</p>
<p>✗ 不配Typemap导致贴图被文本处理 [NEW]</p>
<p>✗ Workspace映射整个Depot [NEW]</p>
<p>✗ 不做备份直到硬盘故障 [NEW]</p>
<p>✗ 外包账号有正式目录写权限 [NEW]</p>
</div>
</div>
</div>""")

# === S18: 自检清单 ===
H("""
<div class="section" id="s18">
<h2>✅ 18. 提交前自检清单</h2>
<div class="checklist">
<h4>📋 基础检查</h4>
<div class="check-item"><span class="box">☐</span>文件命名是否符合[前缀]_[模块]_[描述]规范？</div>
<div class="check-item"><span class="box">☐</span>文件放在正确的目录（Source/ vs Export/）下？</div>
<div class="check-item"><span class="box">☐</span>Source文件有版本号？Export文件无版本号？</div>
<div class="check-item"><span class="box">☐</span>Commit Message格式[TYPE][工种]正确？</div>
<div class="check-item"><span class="box">☐</span>没有提交.DS_Store / Thumbs.db等系统文件？</div>
</div>

<div class="checklist">
<h4>🔒 锁定与权限</h4>
<div class="check-item"><span class="box">☐</span>二进制大文件已设置独占锁定？</div>
<div class="check-item"><span class="box">☐</span>编辑完成后是否释放了锁定？</div>
<div class="check-item"><span class="box">☐</span>是否在正确的分支/Stream上提交？</div>
</div>

<div class="checklist">
<h4>📐 质量检查 [NEW]</h4>
<div class="check-item"><span class="box">☐</span>贴图尺寸为2的幂次方？</div>
<div class="check-item"><span class="box">☐</span>模型面数在规格范围内？</div>
<div class="check-item"><span class="box">☐</span>引用路径完整无断裂？</div>
<div class="check-item"><span class="box">☐</span>LOD命名正确（_LOD0/_LOD1...）？</div>
<div class="check-item"><span class="box">☐</span>单文件大小未超过500MB限制？</div>
</div>

<div class="checklist">
<h4>🧹 清理检查 [NEW]</h4>
<div class="check-item"><span class="box">☐</span>Temp/下的临时文件未误提交？</div>
<div class="check-item"><span class="box">☐</span>旧版本已归档到Archive/并加日期标签？</div>
<div class="check-item"><span class="box">☐</span>确认无重复/冗余资产？</div>
</div>
</div>""")

# === Footer ===
H("""
<div class="doc-footer">📂 SVN/Perforce 目录结构标准 · v2.0 · 美术中心 / TA组 · 项目内部资料</div>
</div>
<script src="editor-kit.js"></script>
<script src="toc-enhancer.js?v=1.1"></script>
<script>
(function(){
  var toc=document.querySelector('.toc');
  if(!toc)return;
  var links=toc.querySelectorAll('a[href^="#"]');
  if(links.length<5)return;
  var h3=toc.querySelector('h3');
  var ol=toc.querySelector('ol');
  if(!ol)return;
  var topCount=ol.querySelectorAll(':scope>li').length;
  var totalCount=links.length;
  var bar=document.createElement('div');
  bar.className='toc-toggle-bar';
  bar.innerHTML='<div style="display:flex;align-items:center">'+(h3?h3.outerHTML:'')+'<span class="toc-badge">'+topCount+' \\u7AE0</span></div><span class="toc-hint"><span class="toc-hint-text">\\u70B9\\u51FB\\u5C55\\u5F00</span> <span class="toc-chevron">\\u25BC</span></span>';
  var inner=document.createElement('div');
  inner.className='toc-inner';
  inner.appendChild(ol);
  toc.innerHTML='';
  toc.appendChild(bar);
  toc.appendChild(inner);
  toc.classList.add('toc-folded');
  var hintText=bar.querySelector('.toc-hint-text');
  bar.addEventListener('click',function(){
    var folded=toc.classList.toggle('toc-folded');
    hintText.textContent=folded?'\\u70B9\\u51FB\\u5C55\\u5F00':'\\u70B9\\u51FB\\u6536\\u8D77';
  });
  if(h3&&h3.parentNode===toc)h3.remove();
})();
</script>
</body>
</html>""")

# ============ Write File ============
content = "\n".join(html_parts)
out.write_text(content, encoding="utf-8")
print(f"✅ 生成完成: {out}")
print(f"   文件大小: {len(content):,} 字符")
print(f"   章节数: 18")
