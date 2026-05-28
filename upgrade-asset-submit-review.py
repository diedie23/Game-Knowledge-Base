#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成升级版 资产提交与审核工作流 v2.0 HTML - 分段拼接"""
import pathlib, textwrap

out = pathlib.Path(r"docs/knowledge-base/asset-submit-review.html")
parts = []

# ============ PART 1: HEAD + CSS ============
parts.append(textwrap.dedent('''\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>资产提交与审核工作流</title>
<style>
:root{--bg:#0d0f15;--panel:#141620;--card:#1a1d2b;--border:#262a3a;--text:#c5c9d6;--dim:#6b7085;--heading:#e4e6ed;--accent:#6c8cff;--accent2:#a78bfa;--red:#f87171;--green:#4ade80;--blue:#60a5fa;--yellow:#fbbf24;--orange:#fb923c;--cyan:#22d3ee}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:16px}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#3d4155;border-radius:3px}
.doc{max-width:1200px;margin:0 auto;padding:32px 48px}
.doc-header{text-align:center;padding:32px 0 24px;border-bottom:1px solid var(--border);margin-bottom:32px}
.doc-header h1{font-size:28px;color:var(--heading);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:10px}
.doc-header h1 .ver{font-size:12px;background:var(--cyan);color:#000;padding:2px 10px;border-radius:12px}
.doc-header .subtitle{color:var(--dim);font-size:15px}
.doc-header .meta{display:flex;justify-content:center;gap:20px;margin-top:12px;font-size:12px;color:var(--dim)}
.doc-header .meta span{display:flex;align-items:center;gap:4px}
.toc{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:32px}
.toc h3{font-size:15px;color:var(--heading);margin-bottom:10px;font-weight:600}
.toc ol{padding-left:20px;font-size:15px;color:var(--accent)}.toc li{margin-bottom:6px}
.toc a{color:var(--accent);text-decoration:none}.toc a:hover{text-decoration:underline}
.section{margin-bottom:40px}
.section h2{font-size:22px;color:var(--heading);margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--cyan);display:flex;align-items:center;gap:8px}
.sub-title{font-size:17px;color:var(--heading);margin:16px 0 8px;font-weight:600}
.section p{font-size:15px;margin-bottom:12px;line-height:1.8}
table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:14px}
th{background:var(--panel);color:var(--heading);text-align:left;padding:10px 12px;border:1px solid var(--border);font-weight:600;white-space:nowrap}
td{padding:9px 12px;border:1px solid var(--border);vertical-align:top}
tr:nth-child(even){background:rgba(108,140,255,.02)}
.alert{padding:12px 16px;border-radius:8px;margin:12px 0;font-size:14px;line-height:1.8}
.alert-red{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}
.alert-blue{background:rgba(108,140,255,.08);border:1px solid rgba(108,140,255,.2);color:var(--accent)}
.alert-yellow{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--yellow)}
.alert-green{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)}
code{font-family:'Cascadia Code','Fira Code',monospace;background:var(--card);padding:1px 6px;border-radius:4px;font-size:13px;color:var(--cyan)}
pre{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;margin:12px 0;font-size:13px;overflow-x:auto;line-height:1.6;color:var(--text);font-family:'Cascadia Code','Fira Code',monospace}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
.badge-red{background:rgba(248,113,113,.15);color:var(--red)}
.badge-green{background:rgba(74,222,128,.15);color:var(--green)}
.badge-yellow{background:rgba(251,191,36,.15);color:var(--yellow)}
.badge-blue{background:rgba(96,165,250,.15);color:var(--blue)}
.badge-orange{background:rgba(251,146,60,.15);color:var(--orange)}
.doc-footer{text-align:center;padding:24px 0;border-top:1px solid var(--border);margin-top:40px;font-size:12px;color:var(--dim)}
.flow{display:flex;align-items:center;gap:0;margin:16px 0;flex-wrap:wrap}
.flow-node{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;text-align:center;min-width:90px}
.flow-node strong{display:block;color:var(--heading);font-size:14px;margin-bottom:2px}
.flow-node .sub{color:var(--dim);font-size:12px}
.flow-arrow{color:var(--cyan);font-size:18px;padding:0 6px;flex-shrink:0}
.flow-node.start{border-color:var(--green);background:rgba(74,222,128,.05)}
.flow-node.end{border-color:var(--accent);background:rgba(108,140,255,.05)}
.flow-node.gate{border-color:var(--red);background:rgba(248,113,113,.05)}
.flow-node.warn{border-color:var(--yellow);background:rgba(251,191,36,.05)}
.faq-item{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px}
.faq-q{font-size:16px;color:var(--heading);font-weight:600;margin-bottom:8px;display:flex;align-items:flex-start;gap:8px}
.faq-a{font-size:14px;line-height:1.8;padding-left:28px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0}
@media(max-width:768px){.grid-2{grid-template-columns:1fr}}
.card-box{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px}
.card-box h4{color:var(--heading);font-size:15px;margin-bottom:8px}
.card-box ul{padding-left:18px;font-size:13px;line-height:2}
.metric-row{display:flex;gap:12px;margin:12px 0;flex-wrap:wrap}
.metric{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;text-align:center;flex:1;min-width:120px}
.metric .val{font-size:22px;font-weight:700;color:var(--cyan)}
.metric .label{font-size:12px;color:var(--dim);margin-top:4px}
.toc{position:relative;overflow:hidden;transition:all .3s ease}
.toc.toc-folded .toc-inner{max-height:0;padding-top:0;padding-bottom:0;overflow:hidden}
.toc .toc-inner{max-height:2000px;transition:max-height .35s cubic-bezier(.4,0,.2,1),padding .35s ease;overflow:hidden}
.toc .toc-toggle-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 0 8px;cursor:pointer;user-select:none}
.toc .toc-toggle-bar:hover{opacity:.85}
.toc .toc-toggle-bar .toc-badge{font-size:11px;background:rgba(108,140,255,.15);color:var(--accent);padding:2px 8px;border-radius:8px;font-weight:600;margin-left:10px}
.toc .toc-toggle-bar .toc-hint{font-size:12px;color:var(--dim);display:flex;align-items:center;gap:4px}
.toc .toc-toggle-bar .toc-chevron{display:inline-block;transition:transform .25s ease}
.toc.toc-folded .toc-toggle-bar .toc-chevron{transform:rotate(-90deg)}
.toc .toc-inner>ol{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 20px;list-style:none;padding:0;margin:0;counter-reset:toc-top}
.toc .toc-inner>ol>li{counter-increment:toc-top;margin:0;padding:0}
.toc .toc-inner>ol>li>a{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;font-size:13px;text-decoration:none;font-weight:500;transition:all .15s ease}
.toc .toc-inner>ol>li>a::before{content:counter(toc-top);font-size:11px;font-weight:700;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:rgba(108,140,255,.1);color:var(--accent);flex-shrink:0}
.toc .toc-inner>ol>li>a:hover{background:rgba(108,140,255,.08)}
@media(max-width:600px){.toc .toc-inner>ol{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="doc">
'''))

# ============ PART 2: HEADER + TOC ============
parts.append(textwrap.dedent('''\
<div class="doc-header">
  <h1>📦 资产提交与审核工作流 <span class="ver">v2.0</span></h1>
  <div class="subtitle">Asset Submission & Review Workflow — 从提交到合入的全链路质量管控</div>
  <div class="meta">
    <span>📋 适用：量产期 / 后期维护</span>
    <span>👤 维护：孙七</span>
    <span>📅 2026-05-28</span>
    <span>🔄 v2.0 升级</span>
  </div>
</div>

<div class="toc">
  <h3>📑 目录</h3>
  <ol>
    <li><a href="#sec1">资产提交前自检 Checklist（全工种版）</a></li>
    <li><a href="#sec2">提交流程标准化（全角色视角）</a></li>
    <li><a href="#sec3">自动化审核流水线设计</a></li>
    <li><a href="#sec4">Art Review 机制与多级审核</a></li>
    <li><a href="#sec5">Commit Message 规范与模板</a></li>
    <li><a href="#sec6">分级审核策略（S/A/B/C/D）</a></li>
    <li><a href="#sec7">外包资产专项审核流程</a></li>
    <li><a href="#sec8">审核工具链与平台集成</a></li>
    <li><a href="#sec9">资产版本管理与回退机制</a></li>
    <li><a href="#sec10">跨引擎导入衔接规范</a></li>
    <li><a href="#sec11">资产依赖图谱与完整性校验</a></li>
    <li><a href="#sec12">常见提交事故案例库（10+案例）</a></li>
    <li><a href="#sec13">审核数据度量与看板</a></li>
    <li><a href="#sec14">附录：审核流程时效 SLA 与升级机制</a></li>
  </ol>
</div>
'''))

# ============ PART 3: SEC 1 - Checklist ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec1">
  <h2>📋 1. 资产提交前自检 Checklist（全工种版）</h2>
  <div class="sub-title">1.1 通用自检项（CI 自动验证）</div>
  <div class="alert alert-blue"><strong>量产必读</strong>：每次提交前必须完成以下自检，CI 自动验证前 8 项。未通过 Hard Block 项的提交将被 Hook 直接拒绝。</div>
  <table>
    <tr><th>#</th><th>检查项</th><th>标准</th><th>自检方式</th><th>阻断</th></tr>
    <tr><td>1</td><td><strong>文件命名</strong></td><td><code>[前缀]_[模块]_[描述]_v[版本].[ext]</code></td><td>正则</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>2</td><td><strong>目录位置</strong></td><td>Source/Export 正确分区</td><td>路径规则</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>3</td><td><strong>无冗余文件</strong></td><td>无 .bak/.tmp/Thumbs.db/.DS_Store</td><td>过滤脚本</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>4</td><td><strong>文件格式</strong></td><td>FBX/TGA/PNG/PSD/EXR/WAV</td><td>Magic Number</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>5</td><td><strong>Commit Message</strong></td><td><code>[类型][工种] 描述 #TaskID</code></td><td>Hook 正则</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>6</td><td><strong>文件大小</strong></td><td>单文件 ≤ 200MB</td><td>Size Hook</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>7</td><td><strong>依赖完整</strong></td><td>贴图/材质同步提交或已存在</td><td>DAG 检查</td><td><span class="badge badge-yellow">Warn</span></td></tr>
    <tr><td>8</td><td><strong>Lock 状态</strong></td><td>二进制文件持有锁/无冲突</td><td>Lock API</td><td><span class="badge badge-red">Block</span></td></tr>
    <tr><td>9</td><td><strong>引擎导入测试</strong></td><td>本地引擎无报错</td><td>人工</td><td><span class="badge badge-yellow">建议</span></td></tr>
    <tr><td>10</td><td><strong>截图留证</strong></td><td>附引擎内/DCC渲染截图</td><td>人工</td><td><span class="badge badge-blue">可选</span></td></tr>
  </table>

  <div class="sub-title">1.2 角色/载具资产专项</div>
  <table>
    <tr><th>#</th><th>项目</th><th>移动端</th><th>PC/主机</th><th>验证</th></tr>
    <tr><td>1</td><td>面数 Tris</td><td>≤ 15,000</td><td>≤ 80,000</td><td>FBX SDK</td></tr>
    <tr><td>2</td><td>贴图 Body</td><td>1024²</td><td>2048²</td><td>Pillow</td></tr>
    <tr><td>3</td><td>贴图 Face</td><td>512²</td><td>1024²</td><td>Pillow</td></tr>
    <tr><td>4</td><td>骨骼数</td><td>≤ 60</td><td>≤ 150</td><td>FBX SDK</td></tr>
    <tr><td>5</td><td>材质球</td><td>≤ 3</td><td>≤ 6</td><td>FBX SDK</td></tr>
    <tr><td>6</td><td>UV 利用率</td><td colspan="2">≥ 75%，无重叠</td><td>UV Checker</td></tr>
    <tr><td>7</td><td>LOD 层级</td><td>≥ 2 (LOD0/1)</td><td>≥ 3 (LOD0/1/2)</td><td>FBX SDK</td></tr>
    <tr><td>8</td><td>Mesh 清洁</td><td colspan="2">无浮动面/翻转法线/退化三角形</td><td>MeshLint</td></tr>
  </table>

  <div class="sub-title">1.3 场景资产专项</div>
  <table>
    <tr><th>#</th><th>项目</th><th>标准</th></tr>
    <tr><td>1</td><td>Lightmap UV</td><td>第2套UV无重叠, Padding ≥ 4px</td></tr>
    <tr><td>2</td><td>碰撞体</td><td>含简化碰撞网格 (UCX_前缀)</td></tr>
    <tr><td>3</td><td>Pivot</td><td>底部中心/指定锚点</td></tr>
    <tr><td>4</td><td>模块化</td><td>尺寸为网格整数倍 (如 100cm)</td></tr>
    <tr><td>5</td><td>Texel Density</td><td>同组一致 (±15%)</td></tr>
    <tr><td>6</td><td>DrawCall</td><td>单资产 ≤ 3 Material Slot</td></tr>
  </table>

  <div class="sub-title">1.4 UI 资产专项</div>
  <table>
    <tr><th>#</th><th>项目</th><th>标准</th></tr>
    <tr><td>1</td><td>切图尺寸</td><td>2的幂 / 符合 Atlas Pack</td></tr>
    <tr><td>2</td><td>9-Slice</td><td>可拉伸元素已标注验证</td></tr>
    <tr><td>3</td><td>Alpha</td><td>无杂边, Premultiplied/Straight 一致</td></tr>
    <tr><td>4</td><td>命名</td><td><code>UI_[功能]_[状态]_[尺寸].png</code></td></tr>
    <tr><td>5</td><td>Atlas 分组</td><td>按模块, 单张 ≤ 2048²</td></tr>
    <tr><td>6</td><td>多分辨率</td><td>@1x/@2x/@3x 或 HD 版本</td></tr>
  </table>

  <div class="sub-title">1.5 特效资产专项</div>
  <table>
    <tr><th>#</th><th>项目</th><th>移动端</th><th>PC</th></tr>
    <tr><td>1</td><td>Drawcall</td><td>≤ 8</td><td>≤ 20</td></tr>
    <tr><td>2</td><td>粒子数</td><td>≤ 200</td><td>≤ 1000</td></tr>
    <tr><td>3</td><td>贴图</td><td>≤ 256²</td><td>≤ 512²</td></tr>
    <tr><td>4</td><td>Overdraw</td><td>≤ 4x</td><td>≤ 8x</td></tr>
    <tr><td>5</td><td>GPU 时间</td><td>≤ 2ms</td><td>≤ 4ms</td></tr>
  </table>

  <div class="sub-title">1.6 动画资产专项</div>
  <table>
    <tr><th>#</th><th>项目</th><th>标准</th></tr>
    <tr><td>1</td><td>帧率</td><td>30fps (移动) / 30-60fps (主机)</td></tr>
    <tr><td>2</td><td>Root Motion</td><td>位移动画必须带 Root Motion</td></tr>
    <tr><td>3</td><td>循环首尾</td><td>差值 < 0.01</td></tr>
    <tr><td>4</td><td>Bind Pose</td><td>与骨骼标准一致 (T/A-Pose)</td></tr>
    <tr><td>5</td><td>clip 长度</td><td>单 clip ≤ 300 帧</td></tr>
  </table>

  <div class="sub-title">1.7 音频资产专项</div>
  <table>
    <tr><th>#</th><th>项目</th><th>标准</th></tr>
    <tr><td>1</td><td>格式</td><td>Source: WAV 16bit/48kHz; 引擎: OGG/ADPCM</td></tr>
    <tr><td>2</td><td>响度</td><td>BGM: LUFS -14±2; SFX: -12±2</td></tr>
    <tr><td>3</td><td>时长</td><td>SFX ≤ 5s; Ambient ≤ 30s(循环)</td></tr>
    <tr><td>4</td><td>命名</td><td><code>SFX_[模块]_[描述]</code> / <code>MUS_[场景]_[情绪]</code></td></tr>
    <tr><td>5</td><td>静音检查</td><td>首尾无超 0.5s 静音段</td></tr>
  </table>
</div>
'''))

# ============ PART 4: SEC 2 - 提交流程 ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec2">
  <h2>🔄 2. 提交流程标准化（全角色视角）</h2>
  <div class="sub-title">2.1 流程全景图</div>
  <div class="flow">
    <div class="flow-node start"><strong>📋 本地自检</strong><div class="sub">制作人员</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>🔒 获取锁</strong><div class="sub">二进制文件</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>📤 提交暂存</strong><div class="sub">dev 分支</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node gate"><strong>🤖 CI 检查</strong><div class="sub">自动化</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node gate"><strong>👁️ Art Review</strong><div class="sub">主美/TA</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node warn"><strong>🧪 集成测试</strong><div class="sub">QA验证</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node end"><strong>✅ 合入主干</strong><div class="sub">APM确认</div></div>
  </div>

  <div class="sub-title">2.2 详细步骤矩阵</div>
  <table>
    <tr><th>步骤</th><th>执行人</th><th>操作</th><th>产出</th><th>超时处理</th></tr>
    <tr><td>① 本地自检</td><td>制作人员</td><td>运行 <code>art_check.py</code></td><td>自检报告JSON</td><td>—</td></tr>
    <tr><td>② 获取锁</td><td>制作人员</td><td><code>p4 lock</code> / SVN Lock</td><td>锁定确认</td><td>48h自动释放</td></tr>
    <tr><td>③ 提交暂存</td><td>制作人员</td><td>commit 到 dev 分支</td><td>变更集 CL</td><td>—</td></tr>
    <tr><td>④ CI 检查</td><td>CI系统</td><td>并行执行12项检查模块</td><td>质量报告</td><td>5min超时重跑</td></tr>
    <tr><td>⑤ Art Review</td><td>主美/TA</td><td>视觉+技术标准审核</td><td>审核结论</td><td>按SLA升级</td></tr>
    <tr><td>⑥ 集成测试</td><td>QA/TA</td><td>引擎加载+性能Profile</td><td>测试报告</td><td>24h内完成</td></tr>
    <tr><td>⑦ 合入主干</td><td>APM</td><td>merge 到 main/release</td><td>合并记录</td><td>—</td></tr>
  </table>

  <div class="sub-title">2.3 快速通道（Fast Track）</div>
  <div class="alert alert-green"><strong>适用条件</strong>：修改量 ≤ 3 文件 且 仅涉及已有资产的小幅调整。</div>
  <table>
    <tr><th>条件</th><th>审核流程</th></tr>
    <tr><td>≤ 3 文件 + 纯参数调整</td><td>CI 通过 → 直接合入</td></tr>
    <tr><td>≤ 3 文件 + 视觉变化</td><td>CI 通过 → 异步Review (合入后24h补审)</td></tr>
    <tr><td>新增资产 / > 3 文件</td><td>完整流程</td></tr>
    <tr><td>P0 紧急修复</td><td>主美口头同意 → 合入 → 补Review</td></tr>
  </table>

  <div class="sub-title">2.4 各工种提交频率建议</div>
  <table>
    <tr><th>工种</th><th>频率</th><th>批量上限</th><th>说明</th></tr>
    <tr><td>角色</td><td>每阶段完成时</td><td>≤ 50 文件</td><td>白模→高模→低模→贴图→绑定分阶段</td></tr>
    <tr><td>场景</td><td>每日/每模块</td><td>≤ 100 文件</td><td>按区域/功能划分</td></tr>
    <tr><td>UI</td><td>每功能模块</td><td>≤ 30 文件</td><td>按页面/弹窗为单位</td></tr>
    <tr><td>特效</td><td>每效果完成</td><td>≤ 20 文件</td><td>含预览视频/GIF</td></tr>
    <tr><td>动画</td><td>每动作集完成</td><td>≤ 30 文件</td><td>含 AnimGraph 配置</td></tr>
    <tr><td>音频</td><td>每版本/场景</td><td>≤ 50 文件</td><td>含 SoundBank 配置</td></tr>
  </table>
</div>
'''))

# ============ PART 5: SEC 3 - 自动化审核 ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec3">
  <h2>🤖 3. 自动化审核流水线设计</h2>
  <div class="sub-title">3.1 架构概览</div>
  <div class="flow">
    <div class="flow-node start"><strong>SVN/P4</strong><div class="sub">trigger</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>🔧 Jenkins</strong><div class="sub">调度</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>🔍 检查模块</strong><div class="sub">并行×12</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>📋 报告聚合</strong><div class="sub">JSON/HTML</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node warn"><strong>🚦 质量门</strong><div class="sub">3级判定</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node end"><strong>📧 通知</strong><div class="sub">企微/飞书</div></div>
  </div>

  <div class="sub-title">3.2 检查模块清单</div>
  <table>
    <tr><th>模块</th><th>内容</th><th>工具</th><th>耗时</th><th>级别</th></tr>
    <tr><td>命名检查</td><td>文件名正则</td><td>Python re</td><td>&lt;1s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>路径检查</td><td>目录合规</td><td>pathlib</td><td>&lt;1s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>大小检查</td><td>≤200MB</td><td>OS stat</td><td>&lt;1s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>格式验证</td><td>Magic Number</td><td>python-magic</td><td>&lt;2s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>面数统计</td><td>Tris/Verts</td><td>FBX SDK</td><td>5-30s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>贴图规格</td><td>尺寸/通道/色空间</td><td>Pillow/oiiotool</td><td>2-10s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>骨骼检查</td><td>数量/命名/层级</td><td>FBX SDK</td><td>3-10s</td><td><span class="badge badge-yellow">Warn</span></td></tr>
    <tr><td>UV 利用率</td><td>面积占比</td><td>自研脚本</td><td>10-60s</td><td><span class="badge badge-yellow">Warn</span></td></tr>
    <tr><td>依赖图谱</td><td>引用存在性</td><td>自研 DAG</td><td>5-15s</td><td><span class="badge badge-yellow">Warn</span></td></tr>
    <tr><td>Commit Msg</td><td>格式合规</td><td>正则</td><td>&lt;1s</td><td><span class="badge badge-red">Error</span></td></tr>
    <tr><td>冗余检测</td><td>重复Hash</td><td>hashlib</td><td>5-30s</td><td><span class="badge badge-blue">Info</span></td></tr>
    <tr><td>LOD验证</td><td>层级+减面比</td><td>FBX SDK</td><td>5-20s</td><td><span class="badge badge-yellow">Warn</span></td></tr>
  </table>

  <div class="sub-title">3.3 质量门（Quality Gate）</div>
  <table>
    <tr><th>门级别</th><th>触发条件</th><th>处理</th></tr>
    <tr><td><span class="badge badge-red">GATE-1 Hard Block</span></td><td>命名/路径/格式/大小 任一Error</td><td>提交拒绝，需本地修复</td></tr>
    <tr><td><span class="badge badge-yellow">GATE-2 Soft Block</span></td><td>Warning ≥ 3 项</td><td>进入Review队列, 48h内修复</td></tr>
    <tr><td><span class="badge badge-blue">GATE-3 Info</span></td><td>冗余/优化建议</td><td>记录日志不阻断</td></tr>
  </table>

  <div class="sub-title">3.4 命名检查脚本示例</div>
  <pre>import re, os, sys, json

NAMING_RULES = {
    'Character': r'^CH_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+(_v\\d{2})?\\.(?:fbx|tga|png|psd|exr)$',
    'Scene':     r'^SC_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+(_v\\d{2})?\\.(?:fbx|tga|png)$',
    'UI':        r'^UI_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+(_[a-z]+)?\\.(?:png|psd)$',
    'VFX':       r'^VFX_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+\\.(?:prefab|mat|tga|png)$',
    'Animation': r'^AN_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+(_v\\d{2})?\\.(?:fbx|anim)$',
    'Texture':   r'^TEX_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+_[DNMRAEO]\\.(?:tga|png|exr)$',
    'Audio':     r'^(SFX|MUS|AMB|VO)_[A-Z][a-zA-Z0-9]+_[A-Za-z0-9]+\\.(?:wav|ogg)$',
}

def check(filepath):
    name = os.path.basename(filepath)
    for cat, pat in NAMING_RULES.items():
        prefix = cat[:2].upper() + '_'
        if cat == 'Audio':
            if any(name.startswith(p) for p in ['SFX_','MUS_','AMB_','VO_']):
                return bool(re.match(pat, name)), cat
            continue
        if name.startswith(prefix):
            return bool(re.match(pat, name)), cat
    return False, 'Unknown'

# 批量检查: python naming_check.py file1 file2 ...
results = [{"file": f, "pass": check(f)[0], "cat": check(f)[1]} for f in sys.argv[1:]]
print(json.dumps(results, indent=2, ensure_ascii=False))
sys.exit(0 if all(r["pass"] for r in results) else 1)</pre>

  <div class="sub-title">3.5 Jenkins Pipeline 示例</div>
  <pre>pipeline {
    agent { label 'art-checker' }
    triggers { pollSCM('H/5 * * * *') }
    stages {
        stage('Fetch') { steps { script { p4sync credential:'p4-ci' } } }
        stage('Checks') {
            parallel {
                stage('Naming')  { steps { sh "python3 checks/naming.py $FILES" } }
                stage('Mesh')    { steps { sh "python3 checks/mesh.py $FILES" } }
                stage('Texture') { steps { sh "python3 checks/texture.py $FILES" } }
                stage('Deps')    { steps { sh "python3 checks/deps.py $FILES" } }
            }
        }
        stage('Gate') { steps { script {
            def r = readJSON file:'report.json'
            if (r.gate1_errors > 0) error "GATE-1 FAIL: ${r.gate1_errors} errors"
        }}}
        stage('Notify') { steps { wechatNotify webhook:env.WX, msg:"CI: ${BUILD_STATUS}" } }
    }
}</pre>
</div>
'''))

# ============ PART 6: SEC 4 - Art Review ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec4">
  <h2>👁️ 4. Art Review 机制与多级审核</h2>
  <div class="sub-title">4.1 审核角色与权限</div>
  <table>
    <tr><th>角色</th><th>审核维度</th><th>权限</th><th>日均带宽</th></tr>
    <tr><td><strong>主美</strong></td><td>风格一致性、表现力、还原度</td><td>Approve / Reject</td><td>10-15件</td></tr>
    <tr><td><strong>TA</strong></td><td>面数、贴图、性能、引擎兼容</td><td>Approve / Request Changes</td><td>15-20件</td></tr>
    <tr><td><strong>APM</strong></td><td>命名、目录、流程合规</td><td>Approve / Block</td><td>30-50件</td></tr>
    <tr><td><strong>组长</strong></td><td>本组首轮审核</td><td>Approve w/ Comments</td><td>20-30件</td></tr>
    <tr><td><strong>QA</strong></td><td>引擎表现、性能回归</td><td>Flag Issues</td><td>按排期</td></tr>
  </table>

  <div class="sub-title">4.2 审核等级与处理</div>
  <table>
    <tr><th>等级</th><th>说明</th><th>处理</th><th>跟踪</th></tr>
    <tr><td>✅ Approved</td><td>完全符合</td><td>直接合入</td><td>—</td></tr>
    <tr><td>🟡 Approved w/ Comments</td><td>小问题</td><td>合入+Follow-up Task</td><td>下Sprint关闭</td></tr>
    <tr><td>❌ Request Changes</td><td>不符合标准</td><td>打回修改</td><td>重新审核</td></tr>
    <tr><td>🔴 Rejected</td><td>方向错误</td><td>打回重做+面审</td><td>重新排期</td></tr>
    <tr><td>💬 Needs Discussion</td><td>边界情况</td><td>拉专项会议</td><td>会后决策</td></tr>
  </table>

  <div class="sub-title">4.3 审核 Checklist</div>
  <div class="grid-2">
    <div class="card-box"><h4>🎨 视觉审核 (主美)</h4><ul>
      <li>整体风格与项目基调一致</li><li>设计稿还原度 ≥ 90%</li>
      <li>比例/透视正确</li><li>配色符合色板</li>
      <li>细节层次合理(远中近)</li><li>与同组资产协调</li>
    </ul></div>
    <div class="card-box"><h4>⚙️ 技术审核 (TA)</h4><ul>
      <li>面数在预算内</li><li>贴图尺寸/格式合规</li>
      <li>UV布局合理无浪费</li><li>材质参数规范</li>
      <li>LOD完整过渡自然</li><li>Profile无异常峰值</li>
    </ul></div>
  </div>

  <div class="sub-title">4.4 审核反馈模板</div>
  <pre>## Art Review 反馈
- 提交者: {{author}} | 变更集: {{CL}} | 资产: {{asset}}
- 审核人: {{reviewer}} ({{role}}) | 时间: {{time}}

### 结论: {{verdict}}
### 技术指标:
| 指标 | 当前 | 标准 | 结果 |
|------|------|------|------|
| 面数 | 18,200 | ≤15,000 | ❌ |
| 贴图 | 1024² | ≤1024² | ✅ |
| 骨骼 | 58 | ≤60 | ✅ |

### 问题清单:
1. 🔴 [面数] 超出红线 3,200 tris
2. 🟡 [贴图] 建议 MRA 通道合并

### 修改建议:
- 减面: 裙摆背面+鞋底不可见区域
- 参考: CH_Kaito 通道合并方案</pre>

  <div class="sub-title">4.5 冲突升级路径</div>
  <table>
    <tr><th>冲突场景</th><th>升级路径</th><th>决策人</th></tr>
    <tr><td>TA说超标 vs 主美说需要</td><td>TA→性能测试→制作人</td><td>制作人</td></tr>
    <tr><td>美术认为审核不合理</td><td>美术→组长→主美→总监</td><td>总监</td></tr>
    <tr><td>工期 vs 质量</td><td>APM评估→项目例会</td><td>PM</td></tr>
    <tr><td>外包不达标</td><td>TA修改清单→外包主管</td><td>外包管理</td></tr>
  </table>
</div>
'''))

# ============ PART 7: SEC 5-6 ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec5">
  <h2>📝 5. Commit Message 规范与模板</h2>
  <div class="sub-title">5.1 格式规范</div>
  <pre>[类型][工种] 描述内容 #TaskID

类型: [ADD]新增 [MOD]修改 [FIX]修复 [DEL]删除 [OPT]优化 [WIP]进行中 [MERGE]合并 [CFG]配置
工种: [角色] [场景] [UI] [特效] [动画] [音频] [TA] [通用]

示例:
  [ADD][角色] Luna战斗形态高模及贴图 #TASK-1234
  [OPT][角色] Kaito减面 15k→12k tris #TASK-9012
  [FIX][UI] 主界面图标切图修复杂边 #TASK-3456
  [MOD][场景][B] 城镇广场路灯调整 #TASK-5678</pre>

  <div class="sub-title">5.2 Hook 验证正则</div>
  <pre>PATTERN = r'^\\[(ADD|MOD|FIX|DEL|OPT|WIP|MERGE|CFG)\\]\\[(角色|场景|UI|特效|动画|音频|TA|通用)\\](\\[[SABCD]\\])?\\s+.{5,80}\\s+#(TASK|BUG|STORY)-\\d{3,6}$'</pre>

  <div class="sub-title">5.3 扩展 Body（可选，大批量时建议附加）</div>
  <pre>[ADD][角色][S] Luna战斗形态终版 #TASK-1234

## 变更说明
- 阶段: 高模完成
- 面数: LOD0 14,200 / LOD1 7,800 tris
- 贴图: Body 1024, Face 512
- 参考: 概念图v3 (Shotgun: SHOT-888)

## 文件清单
- CH_Luna_Body_v03.fbx (新增)
- CH_Luna_Body_v03_D.tga (新增)
- CH_Luna_Body_v03_N.tga (新增)</pre>
</div>

<div class="section" id="sec6">
  <h2>🎯 6. 分级审核策略（S/A/B/C/D）</h2>
  <div class="sub-title">6.1 资产分级定义</div>
  <table>
    <tr><th>级别</th><th>定义</th><th>示例</th><th>审核强度</th></tr>
    <tr><td><span class="badge badge-red">S</span></td><td>核心品牌/玩法资产</td><td>主角、LOGO、主界面、宣传素材</td><td>全链路+总监</td></tr>
    <tr><td><span class="badge badge-orange">A</span></td><td>高曝光/付费相关</td><td>商城皮肤、主线NPC、核心UI</td><td>主美+TA双审</td></tr>
    <tr><td><span class="badge badge-yellow">B</span></td><td>常规量产</td><td>普通NPC、场景道具、系统UI</td><td>组长+TA</td></tr>
    <tr><td><span class="badge badge-blue">C</span></td><td>低曝光/辅助</td><td>远景建筑、环境植被、音效</td><td>组长(TA可选)</td></tr>
    <tr><td><span class="badge badge-green">D</span></td><td>临时/测试</td><td>灰盒、Placeholder</td><td>CI自动通过</td></tr>
  </table>

  <div class="sub-title">6.2 各级审核对比</div>
  <table>
    <tr><th>环节</th><th>S</th><th>A</th><th>B</th><th>C</th><th>D</th></tr>
    <tr><td>CI 检查</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr>
    <tr><td>组长首审</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td><td>—</td></tr>
    <tr><td>TA 技术审</td><td>✅</td><td>✅</td><td>✅</td><td>可选</td><td>—</td></tr>
    <tr><td>主美视觉审</td><td>✅</td><td>✅</td><td>—</td><td>—</td><td>—</td></tr>
    <tr><td>总监终审</td><td>✅</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
    <tr><td>引擎验证</td><td>✅</td><td>✅</td><td>抽检</td><td>—</td><td>—</td></tr>
    <tr><td>性能Profile</td><td>✅</td><td>✅</td><td>—</td><td>—</td><td>—</td></tr>
    <tr><td>时效</td><td>24h</td><td>24h</td><td>48h</td><td>72h</td><td>即时</td></tr>
  </table>

  <div class="sub-title">6.3 级别标注</div>
  <div class="alert alert-blue">Commit Message 追加 <code>[S]</code>/<code>[A]</code>/<code>[B]</code>/<code>[C]</code>/<code>[D]</code>，CI 据此路由审核流程。未标注默认为 B 级。</div>
</div>
'''))

# ============ PART 8: SEC 7-8 ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec7">
  <h2>🏢 7. 外包资产专项审核流程</h2>
  <div class="sub-title">7.1 外包交付流程</div>
  <div class="flow">
    <div class="flow-node start"><strong>📋 需求下发</strong><div class="sub">内部主美</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>🎨 外包制作</strong><div class="sub">外包团队</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node"><strong>📤 提交专用分支</strong><div class="sub">Outsource/</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node gate"><strong>🤖 全量CI</strong><div class="sub">更严标准</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node gate"><strong>👁️ 内部审核</strong><div class="sub">TA+主美</div></div>
    <span class="flow-arrow">→</span>
    <div class="flow-node end"><strong>✅ 验收合入</strong><div class="sub">整合</div></div>
  </div>

  <div class="sub-title">7.2 外包 vs 内部标准对比</div>
  <table>
    <tr><th>维度</th><th>内部标准</th><th>外包标准</th><th>原因</th></tr>
    <tr><td>面数容差</td><td>±10%</td><td>±5%</td><td>减少返修</td></tr>
    <tr><td>贴图格式</td><td>TGA/PNG</td><td>仅TGA无损</td><td>保留最高质量</td></tr>
    <tr><td>源文件</td><td>可选</td><td><strong>必须</strong>(.max/.ma/.psd)</td><td>内部可调整</td></tr>
    <tr><td>LOD</td><td>建议</td><td><strong>必须全部LOD</strong></td><td>减少返工</td></tr>
    <tr><td>交付文档</td><td>Commit Msg</td><td>Commit Msg + 交付清单表</td><td>完整性确认</td></tr>
  </table>

  <div class="sub-title">7.3 修改轮次管控</div>
  <table>
    <tr><th>轮次</th><th>范围</th><th>时效</th><th>升级</th></tr>
    <tr><td>第1轮</td><td>所有问题</td><td>3 工作日</td><td>—</td></tr>
    <tr><td>第2轮</td><td>残留+新发现</td><td>2 工作日</td><td>—</td></tr>
    <tr><td>第3轮</td><td>仅残留</td><td>1 工作日</td><td>超3轮→主管介入</td></tr>
    <tr><td>超限</td><td colspan="3">扣减验收款5% / 纳入供应商评级</td></tr>
  </table>

  <div class="sub-title">7.4 权限隔离</div>
  <div class="alert alert-red"><strong>安全</strong>：外包仅访问 <code>//depot/Art/Outsource/</code>，禁止访问主干和其他团队。</div>
  <pre># P4 Protect
write group vendor_A * //depot/Art/Outsource/VendorA/...
read  group vendor_A * -//depot/Art/Character/...
read  group vendor_A * -//depot/Code/...</pre>
</div>

<div class="section" id="sec8">
  <h2>🔧 8. 审核工具链与平台集成</h2>
  <div class="sub-title">8.1 推荐工具链</div>
  <table>
    <tr><th>环节</th><th>工具</th><th>说明</th><th>集成</th></tr>
    <tr><td>项目管理</td><td>Shotgun/Flow / Jira</td><td>任务+审核状态</td><td>API双向同步</td></tr>
    <tr><td>Review可视化</td><td>Syncsketch / Frame.io</td><td>在线标注+对比</td><td>Webhook</td></tr>
    <tr><td>CI/CD</td><td>Jenkins / TeamCity</td><td>自动化调度</td><td>P4 Trigger</td></tr>
    <tr><td>通知</td><td>企微 / 飞书 / Slack</td><td>状态推送</td><td>Bot</td></tr>
    <tr><td>资产浏览</td><td>P4 Swarm / Upsource</td><td>变更集Diff</td><td>内置</td></tr>
    <tr><td>性能Profile</td><td>RenderDoc / PIX / UE Insights</td><td>GPU验证</td><td>脚本触发</td></tr>
    <tr><td>3D预览</td><td>Marmoset / Sketchfab</td><td>快速预览</td><td>自动渲染</td></tr>
  </table>

  <div class="sub-title">8.2 通知模板（企微/飞书）</div>
  <pre>{
  "msgtype": "markdown",
  "markdown": {
    "content": "## 📦 资产审核通知\\n**提交者**: {{author}}\\n**变更集**: CL-{{cl}}\\n**CI结果**: {{ci_status}}\\n- 命名: {{name_check}} | 面数: {{mesh_check}}\\n**审核状态**: {{review_status}}\\n[查看详情]({{url}})"
  }
}</pre>

  <div class="sub-title">8.3 审核看板指标</div>
  <div class="metric-row">
    <div class="metric"><div class="val">23</div><div class="label">待审核</div></div>
    <div class="metric"><div class="val">8</div><div class="label">审核中</div></div>
    <div class="metric"><div class="val">156</div><div class="label">本周通过</div></div>
    <div class="metric"><div class="val">12</div><div class="label">本周打回</div></div>
    <div class="metric"><div class="val">92.8%</div><div class="label">首次通过率</div></div>
  </div>
</div>
'''))

# ============ PART 9: SEC 9-10 ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec9">
  <h2>🔄 9. 资产版本管理与回退机制</h2>
  <div class="sub-title">9.1 版本命名</div>
  <table>
    <tr><th>类型</th><th>格式</th><th>示例</th><th>说明</th></tr>
    <tr><td>工作版本</td><td><code>_v01~_v99</code></td><td>CH_Luna_Body_v03.fbx</td><td>大改版+1</td></tr>
    <tr><td>迭代版本</td><td><code>_v03a/_v03b</code></td><td>CH_Luna_Body_v03b.fbx</td><td>小调整字母后缀</td></tr>
    <tr><td>里程碑快照</td><td>Label / Tag</td><td><code>milestone_alpha</code></td><td>整体打标</td></tr>
    <tr><td>发布版本</td><td><code>_release</code></td><td>CH_Luna_Body_release.fbx</td><td>最终交付</td></tr>
  </table>

  <div class="sub-title">9.2 回退策略</div>
  <table>
    <tr><th>场景</th><th>方式</th><th>命令</th><th>注意</th></tr>
    <tr><td>单文件回退</td><td>版本还原</td><td><code>p4 sync file#rev</code></td><td>通知相关人</td></tr>
    <tr><td>批量回退</td><td>Label还原</td><td><code>p4 sync @label</code></td><td>可能影响他人</td></tr>
    <tr><td>紧急回退</td><td>CL Revert</td><td><code>p4 undo @=CL</code></td><td>需admin权限</td></tr>
    <tr><td>灾难恢复</td><td>备份还原</td><td>从备份服务器</td><td>全组暂停提交</td></tr>
  </table>

  <div class="sub-title">9.3 版本保留策略</div>
  <table>
    <tr><th>资产级别</th><th>保留策略</th><th>归档时机</th></tr>
    <tr><td>S/A级</td><td>全部版本永久保留</td><td>—</td></tr>
    <tr><td>B级</td><td>最近10版+里程碑</td><td>上线后6月</td></tr>
    <tr><td>C/D级</td><td>最近5版+发布版</td><td>上线后3月</td></tr>
    <tr><td>临时资产</td><td>最近2版</td><td>Sprint结束</td></tr>
  </table>
</div>

<div class="section" id="sec10">
  <h2>🎮 10. 跨引擎导入衔接规范</h2>
  <div class="sub-title">10.1 Unreal Engine 5</div>
  <table>
    <tr><th>项目</th><th>标准</th><th>常见错误</th></tr>
    <tr><td>FBX版本</td><td>2020+</td><td>2014导致丢BlendShape</td></tr>
    <tr><td>坐标系</td><td>Z-Up, cm</td><td>Y-Up导入侧倒</td></tr>
    <tr><td>Scale</td><td>1.0</td><td>Maya默认cm时设1.0</td></tr>
    <tr><td>骨骼命名</td><td>英文+下划线</td><td>中文乱码</td></tr>
    <tr><td>Root Motion</td><td>Root骨在原点</td><td>滑步/原地不动</td></tr>
    <tr><td>导入路径</td><td><code>/Game/Art/[工种]/[模块]/</code></td><td>放Content根目录</td></tr>
    <tr><td>Nanite</td><td>高模直接导入</td><td>手动LOD与Nanite冲突</td></tr>
    <tr><td>Lumen材质</td><td>Metallic/Roughness [0,1]</td><td>GI错误</td></tr>
  </table>

  <div class="sub-title">10.2 Unity 2022+</div>
  <table>
    <tr><th>项目</th><th>标准</th><th>常见错误</th></tr>
    <tr><td>FBX版本</td><td>2019+</td><td>丢自定义属性</td></tr>
    <tr><td>Scale</td><td>0.01</td><td>模型巨大/微小</td></tr>
    <tr><td>动画类型</td><td>Humanoid/Generic</td><td>骨骼未映射</td></tr>
    <tr><td>贴图MaxSize</td><td>按平台Override</td><td>包体过大</td></tr>
    <tr><td>Sprite Atlas</td><td>按模块分Atlas</td><td>全部打一张爆内存</td></tr>
    <tr><td>导入路径</td><td><code>Assets/Art/[工种]/[模块]/</code></td><td>目录混乱</td></tr>
    <tr><td>Addressables</td><td>Group+Label规范</td><td>热更路径断裂</td></tr>
  </table>

  <div class="sub-title">10.3 多引擎统一源规范</div>
  <table>
    <tr><th>维度</th><th>统一标准</th><th>引擎适配层</th></tr>
    <tr><td>坐标系</td><td>Source: Y-Up (DCC默认)</td><td>导入时转换</td></tr>
    <tr><td>单位</td><td>Source: cm</td><td>Scale由引擎配置</td></tr>
    <tr><td>贴图</td><td>Source: TGA无损</td><td>引擎各自压缩</td></tr>
    <tr><td>Shader</td><td>标准PBR参数</td><td>引擎Shader适配</td></tr>
    <tr><td>骨骼</td><td>统一命名规范</td><td>Retarget映射</td></tr>
  </table>
</div>
'''))

# ============ PART 10: SEC 11-12 ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec11">
  <h2>🕸️ 11. 资产依赖图谱与完整性校验</h2>
  <div class="sub-title">11.1 依赖关系类型</div>
  <table>
    <tr><th>类型</th><th>说明</th><th>示例</th><th>风险</th></tr>
    <tr><td>直接引用</td><td>文件内路径</td><td>FBX→Texture(材质球内)</td><td><span class="badge badge-red">高</span></td></tr>
    <tr><td>目录约定</td><td>同名关联</td><td>CH_Luna.fbx↔CH_Luna_D.tga</td><td><span class="badge badge-yellow">中</span></td></tr>
    <tr><td>引擎引用</td><td>GUID/Path</td><td>UE SoftObjectPath / Unity GUID</td><td><span class="badge badge-red">高</span></td></tr>
    <tr><td>逻辑关联</td><td>配置表引用</td><td>角色表→模型/动画/音效</td><td><span class="badge badge-yellow">中</span></td></tr>
    <tr><td>构建依赖</td><td>Bundle/Pak</td><td>同Bundle必须同步</td><td><span class="badge badge-red">高</span></td></tr>
  </table>

  <div class="sub-title">11.2 完整性校验脚本</div>
  <pre>from pathlib import Path
from typing import Dict, Set, List

class AssetDepGraph:
    def __init__(self, root: str):
        self.root = Path(root)
        self.graph: Dict[str, Set[str]] = {}

    def build(self):
        for fbx in self.root.rglob("*.fbx"):
            self.graph[str(fbx)] = self._find_deps(fbx)

    def _find_deps(self, fbx: Path) -> Set[str]:
        deps = set()
        base = fbx.stem.rsplit('_v', 1)[0] if '_v' in fbx.stem else fbx.stem
        for suffix in ['_D', '_N', '_MRA', '_E', '_AO']:
            for ext in ['.tga', '.png']:
                tex = fbx.parent / f"{base}{suffix}{ext}"
                if tex.exists(): deps.add(str(tex))
        return deps

    def check(self, changed: List[str]) -> dict:
        changed_set = set(changed)
        missing = []
        for f in changed:
            for dep in self.graph.get(f, set()):
                if dep not in changed_set and not Path(dep).exists():
                    missing.append({"file": f, "missing": dep})
        return {"total": len(changed), "missing": len(missing), "details": missing}</pre>

  <div class="sub-title">11.3 引擎内引用检查 (UE5)</div>
  <pre># UE5 Python: 查找断裂引用
import unreal

def find_broken_refs(path='/Game/Art/'):
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    assets = registry.get_assets_by_path(path, recursive=True)
    broken = []
    for a in assets:
        deps = registry.get_dependencies(a.package_name)
        for d in deps:
            if not registry.get_asset_by_object_path(d):
                broken.append({"asset": str(a.package_name), "broken_ref": str(d)})
    return broken</pre>
</div>

<div class="section" id="sec12">
  <h2>🚨 12. 常见提交事故案例库</h2>

  <div class="faq-item">
    <div class="faq-q">🚨 案例1：覆盖他人文件 <span class="badge badge-red">高频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：美术A周一checkout贴图，美术B周二修改提交，A周三未update直接提交覆盖B的修改。</p><p><strong>解法</strong>：二进制文件强制 exclusive lock；提交前必须 <code>svn update</code> / <code>p4 sync</code>。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例2：遗漏关联资产 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：提交FBX遗漏贴图，引擎导入白模。</p><p><strong>解法</strong>：CI依赖图谱检查；建立关联资产自动发现。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例3：引用路径断裂 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：手动重命名/移动文件导致引擎引用丢失。</p><p><strong>解法</strong>：强制使用 <code>p4 move</code> / <code>svn move</code>；CI检查路径完整性。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例4：误提交大文件 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：提交2GB视频参考，仓库暴涨。</p><p><strong>解法</strong>：Pre-commit Hook 限制 ≤200MB；配置 ignore 排除参考目录。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例5：Workspace映射错误 <span class="badge badge-red">高频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：P4 Client映射不正确，同步了不属于自己的目录，修改后影响他人。</p><p><strong>解法</strong>：标准化Client Spec模板；新人入职必须由TA验证Workspace。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例6：贴图通道错误 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：MRA通道顺序搞错(Metallic/Roughness/AO)，材质表现异常。</p><p><strong>解法</strong>：CI自动检查通道分布统计；标准化Photoshop Action导出。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例7：版本覆盖未更新版本号 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：修改了v03但没改文件名为v04，后续无法区分版本。</p><p><strong>解法</strong>：Hook检查：同名文件内容变化时必须更新版本号后缀。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例8：跨平台换行符/编码问题 <span class="badge badge-blue">低频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：Windows美术提交的配置文件含BOM/CRLF，Linux构建机解析失败。</p><p><strong>解法</strong>：.editorconfig统一换行符；CI检查文本文件编码。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例9：提交到错误分支 <span class="badge badge-red">高频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：开发中资产误提交到release分支，触发构建。</p><p><strong>解法</strong>：release分支设置写权限白名单；CI检测非预期分支提交。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例10：动画Bind Pose不一致 <span class="badge badge-orange">中频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：新动画的Bind Pose与已有骨骼不一致，Retarget后变形。</p><p><strong>解法</strong>：标准Skeleton资产统一管理；CI比对Bind Pose数据。</p></div>
  </div>
  <div class="faq-item">
    <div class="faq-q">🚨 案例11：Shader/材质引用丢失 <span class="badge badge-red">高频</span></div>
    <div class="faq-a"><p><strong>场景</strong>：美术自定义Shader未提交，其他人同步后材质粉红色。</p><p><strong>解法</strong>：CI检查材质引用的Shader是否已存在主干；Shader修改需TA审批。</p></div>
  </div>
</div>
'''))

# ============ PART 11: SEC 13-14 + Footer ============
parts.append(textwrap.dedent('''\
<div class="section" id="sec13">
  <h2>📊 13. 审核数据度量与看板</h2>
  <div class="sub-title">13.1 核心指标定义</div>
  <table>
    <tr><th>指标</th><th>定义</th><th>目标值</th><th>数据源</th></tr>
    <tr><td><strong>首次通过率 (FPY)</strong></td><td>首次审核即通过的比例</td><td>≥ 85%</td><td>Review系统</td></tr>
    <tr><td><strong>平均审核时长</strong></td><td>从提交到审核完成的时间</td><td>≤ 24h (A级)</td><td>CI时间戳</td></tr>
    <tr><td><strong>返修轮次</strong></td><td>平均每个资产的修改轮次</td><td>≤ 1.5 轮</td><td>Review记录</td></tr>
    <tr><td><strong>CI通过率</strong></td><td>自动化检查一次通过</td><td>≥ 95%</td><td>Jenkins</td></tr>
    <tr><td><strong>SLA达标率</strong></td><td>在时效内完成审核</td><td>≥ 90%</td><td>工单系统</td></tr>
    <tr><td><strong>阻断事故数</strong></td><td>因提交问题导致的构建失败</td><td>≤ 2次/月</td><td>事故记录</td></tr>
  </table>

  <div class="sub-title">13.2 周报/月报模板</div>
  <pre>## 资产审核周报 (W21 2026)

### 概览
| 指标 | 本周 | 上周 | 趋势 |
|------|------|------|------|
| 提交总量 | 234 件 | 198 件 | ↑18% |
| CI通过率 | 96.2% | 94.8% | ↑1.4% |
| 首次通过率 | 88.5% | 85.2% | ↑3.3% |
| 平均审核时长 | 18.6h | 22.4h | ↓17% |
| SLA达标率 | 93.1% | 89.7% | ↑3.4% |

### Top 3 拒绝原因
1. 面数超标 (8次) — 主要集中在角色组
2. 命名不规范 (5次) — 外包提交
3. 贴图尺寸错误 (4次) — 新人入职

### 改进措施
- 角色组: 加强减面阶段中间审核
- 外包: 更新命名规范文档并培训
- 新人: 首周必须参加资产规范培训</pre>

  <div class="sub-title">13.3 质量趋势分析</div>
  <div class="alert alert-green"><strong>健康标准</strong>：当 FPY ≥ 85% 且连续4周无P0事故时，可考虑放宽C级资产为自动合入。</div>
  <table>
    <tr><th>趋势</th><th>含义</th><th>行动</th></tr>
    <tr><td>FPY 连续下降</td><td>质量恶化</td><td>加强培训 / 增加中间检查点</td></tr>
    <tr><td>审核时长上升</td><td>审核瓶颈</td><td>增加审核人员 / 优化分级路由</td></tr>
    <tr><td>CI通过率下降</td><td>规范执行弱化</td><td>发送周通报 / 约谈低通过率组</td></tr>
    <tr><td>事故频繁</td><td>流程有漏洞</td><td>根因分析 → 完善Hook/Gate</td></tr>
  </table>
</div>

<div class="section" id="sec14">
  <h2>📎 14. 附录：审核流程时效 SLA 与升级机制</h2>
  <div class="sub-title">14.1 SLA 时效表</div>
  <table>
    <tr><th>优先级</th><th>资产级别</th><th>审核时效</th><th>说明</th></tr>
    <tr><td>🔴 P0 紧急</td><td>S/A 级</td><td><strong>4小时内</strong></td><td>阻塞里程碑/构建</td></tr>
    <tr><td>🟠 P1 高</td><td>S/A 级</td><td><strong>12小时内</strong></td><td>当前Sprint关键路径</td></tr>
    <tr><td>🟡 P2 中</td><td>B 级</td><td><strong>24小时内</strong></td><td>常规量产任务</td></tr>
    <tr><td>🟢 P3 低</td><td>C 级</td><td><strong>48小时内</strong></td><td>非紧急/辅助资产</td></tr>
    <tr><td>⚪ P4 最低</td><td>D 级</td><td><strong>即时(CI自动)</strong></td><td>临时/测试资产</td></tr>
  </table>

  <div class="sub-title">14.2 超时升级机制</div>
  <table>
    <tr><th>超时阈值</th><th>升级动作</th><th>通知对象</th></tr>
    <tr><td>超时 50%</td><td>⚠️ 黄色预警</td><td>审核人+组长</td></tr>
    <tr><td>超时 100%</td><td>🟠 橙色升级</td><td>主美/TA Lead + APM</td></tr>
    <tr><td>超时 200%</td><td>🔴 红色升级</td><td>美术总监 + 项目PM</td></tr>
    <tr><td>超时 300%</td><td>🚨 P0事件</td><td>制作人 + 项目群通报</td></tr>
  </table>

  <div class="sub-title">14.3 审核人缺席处理</div>
  <table>
    <tr><th>场景</th><th>处理方式</th></tr>
    <tr><td>主审核人请假 1-2天</td><td>自动转发给备选审核人</td></tr>
    <tr><td>主审核人请假 3天+</td><td>APM重新指派审核人</td></tr>
    <tr><td>全组无人可审</td><td>升级到上级主美/跨组支援</td></tr>
    <tr><td>节假日</td><td>P0/P1设值班审核人; P2+顺延</td></tr>
  </table>

  <div class="sub-title">14.4 审核节奏最佳实践</div>
  <div class="alert alert-blue"><strong>⚡ APM 金句</strong>：资产提交不是「扔过墙」，而是一次有质量承诺的交付。审核不是「找茬」，而是团队共同守护品质的过程。</div>
  <table>
    <tr><th>时间</th><th>建议动作</th></tr>
    <tr><td>每日 10:00</td><td>审核人集中处理待审队列（批量审核效率高）</td></tr>
    <tr><td>每日 15:00</td><td>跟进超时预警项，推动修改中资产</td></tr>
    <tr><td>每周五 16:00</td><td>清理本周所有待审项，不留积压过周末</td></tr>
    <tr><td>每Sprint结束</td><td>输出审核数据周报，识别瓶颈</td></tr>
  </table>
</div>

<div class="doc-footer">📦 资产提交与审核工作流 · v2.0 · 美术中心 · 项目内部资料</div>
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
  bar.innerHTML='<div style="display:flex;align-items:center">'+
    (h3?h3.outerHTML:'')+
    '<span class="toc-badge">'+topCount+' \\u7AE0 \\u00B7 '+totalCount+' \\u8282</span></div>'+
    '<span class="toc-hint"><span class="toc-hint-text">\\u70B9\\u51FB\\u5C55\\u5F00</span> <span class="toc-chevron">\\u25BC</span></span>';
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
</html>
'''))

# ============ 写入文件 ============
html = ''.join(parts)
out.write_text(html, encoding='utf-8')
print(f"Done! Size: {len(html):,} chars / {out.stat().st_size:,} bytes")
print(f"Output: {out}")
