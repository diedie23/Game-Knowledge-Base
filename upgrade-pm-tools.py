# -*- coding: utf-8 -*-
"""升级【项目管理工具模板】v1.0 → v2.0 - 分段写入"""
import os

output = r"h:\游戏项目知识库\docs\knowledge-base\jira-tapd-automation.html"

# Read current file to get the CSS (reuse existing styles)
with open(output, 'r', encoding='utf-8') as f:
    old = f.read()

# Extract style block from old file
style_start = old.find('<style>')
style_end = old.find('</style>') + len('</style>')
old_style = old[style_start:style_end]

# Build new HTML
parts = []

# Head
parts.append('''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>项目管理工具模板</title>
''')
parts.append(old_style)
parts.append('''
</head>
<body>
<div class="doc">

<div class="doc-header">
  <h1>⚙️ 项目管理工具模板 <span class="ver">v2.0</span></h1>
  <div class="subtitle">Jira / TAPD Art Project Automation Templates — 完整配置指南</div>
  <div class="meta">
    <span>📋 适用：全阶段</span>
    <span>👤 维护：周八</span>
    <span>📅 2026-05-27</span>
  </div>
</div>

<div class="toc">
  <h3>📑 目录导航</h3>
  <ol>
    <li><a href="#s1">美术任务状态机</a></li>
    <li><a href="#s2">需求分类与自定义字段体系</a></li>
    <li><a href="#s3">Sprint 规划与迭代管理</a></li>
    <li><a href="#s4">自动指派与路由规则</a></li>
    <li><a href="#s5">多级审核流程</a></li>
    <li><a href="#s6">自动化规则库（20条）</a></li>
    <li><a href="#s7">通知策略与消息治理</a></li>
    <li><a href="#s8">看板配置与 WIP 管控</a></li>
    <li><a href="#s9">版本管理与里程碑追踪</a></li>
    <li><a href="#s10">数据报表与效能度量</a></li>
    <li><a href="#s11">工具集成与生态</a></li>
    <li><a href="#s12">团队效能成熟度模型</a></li>
    <li><a href="#s13">模板导入/导出实操指南</a></li>
    <li><a href="#s14">附录：快速配置清单</a></li>
  </ol>
</div>
''')

# Section 1
parts.append('''
<div class="section" id="s1">
  <h2>⚙️ 1. 美术任务状态机</h2>
  <div class="sub-title">1.1 标准状态流</div>
  <div class="flow">
    <div class="flow-node start"><strong>待排期</strong><div class="sub">Backlog</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>已排期</strong><div class="sub">Planned</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>进行中</strong><div class="sub">In Progress</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node gate"><strong>待审核</strong><div class="sub">In Review</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node end"><strong>审核通过</strong><div class="sub">Approved</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node end"><strong>已完成</strong><div class="sub">Done</div></div>
  </div>
  <p style="font-size:12px;color:var(--dim)">* 审核不通过 → 修改中 → 再次提审；可从进行中挂起或取消</p>
  <div class="alert alert-blue">💡 <strong>核心原则</strong>：状态流转必须<strong>单向推进</strong>，禁止跳过审核直接完成。回退只允许进入「修改中」。</div>

  <div class="sub-title">1.2 完整状态定义</div>
  <table>
    <tr><th>状态</th><th>Key</th><th>说明</th><th>进入条件</th><th>操作人</th><th>停留上限</th></tr>
    <tr><td><strong>待排期</strong></td><td>Backlog</td><td>需求已确认，等待排入Sprint</td><td>评审通过</td><td>APM</td><td>10d</td></tr>
    <tr><td><strong>已排期</strong></td><td>Planned</td><td>已分配到Sprint</td><td>APM排期</td><td>APM</td><td>3d</td></tr>
    <tr><td><strong>进行中</strong></td><td>In Progress</td><td>美术正在制作</td><td>领取/被指派</td><td>执行人</td><td>预估×1.5</td></tr>
    <tr><td><strong>待审核</strong></td><td>In Review</td><td>等待审核</td><td>完成后提审</td><td>执行人</td><td>2d</td></tr>
    <tr><td><strong>审核通过</strong></td><td>Approved</td><td>审核合格</td><td>审核人操作</td><td>审核人</td><td>1d</td></tr>
    <tr><td><strong>审核不通过</strong></td><td>Rejected</td><td>需要修改</td><td>审核人打回</td><td>审核人</td><td>—</td></tr>
    <tr><td><strong>修改中</strong></td><td>Revising</td><td>根据意见修改</td><td>自动流转</td><td>执行人</td><td>原工期×0.3</td></tr>
    <tr><td><strong>已完成</strong></td><td>Done</td><td>任务关闭入库</td><td>所有审核通过</td><td>系统</td><td>—</td></tr>
    <tr><td><strong>搁置</strong></td><td>On Hold</td><td>等待外部依赖</td><td>APM操作</td><td>APM</td><td>需标注恢复日</td></tr>
    <tr><td><strong>已取消</strong></td><td>Cancelled</td><td>需求取消</td><td>APM/策划</td><td>APM</td><td>—</td></tr>
  </table>

  <div class="sub-title">1.3 状态流转矩阵</div>
  <table>
    <tr><th>From＼To</th><th>排期</th><th>进行中</th><th>待审核</th><th>通过</th><th>打回</th><th>修改中</th><th>完成</th><th>挂起</th><th>取消</th></tr>
    <tr><td><strong>待排期</strong></td><td>✓</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>✓</td></tr>
    <tr><td><strong>已排期</strong></td><td></td><td>✓</td><td></td><td></td><td></td><td></td><td></td><td>✓</td><td>✓</td></tr>
    <tr><td><strong>进行中</strong></td><td></td><td></td><td>✓</td><td></td><td></td><td></td><td></td><td>✓</td><td>✓</td></tr>
    <tr><td><strong>待审核</strong></td><td></td><td></td><td></td><td>✓</td><td>✓</td><td></td><td></td><td></td><td></td></tr>
    <tr><td><strong>打回</strong></td><td></td><td></td><td></td><td></td><td></td><td>✓</td><td></td><td></td><td>✓</td></tr>
    <tr><td><strong>修改中</strong></td><td></td><td></td><td>✓</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td><strong>通过</strong></td><td></td><td></td><td></td><td></td><td></td><td></td><td>✓</td><td></td><td></td></tr>
    <tr><td><strong>挂起</strong></td><td>✓</td><td>✓</td><td></td><td></td><td></td><td></td><td></td><td></td><td>✓</td></tr>
  </table>

  <div class="sub-title">1.4 配置方法</div>
  <pre>## TAPD
项目设置 → 工作流 → 自定义状态 → 添加10个状态 → 按矩阵配置转换权限
必填字段：进入"待审核"需填[资产链接]；进入"打回"需填[原因]；进入"挂起"需填[恢复日期]

## Jira
Project Settings → Workflows → 添加Status → 配置Transitions
Conditions: "In Review→Approved" 需 reviewer 角色
Post Functions: "Done" 触发 Webhook 通知资产管理平台</pre>
</div>
''')

# Section 2
parts.append('''
<div class="section" id="s2">
  <h2>📂 2. 需求分类与自定义字段体系</h2>
  <div class="sub-title">2.1 任务类型</div>
  <table>
    <tr><th>类型</th><th>Key</th><th>适用场景</th><th>工作流</th></tr>
    <tr><td>🎨 原画</td><td>ART_CONCEPT</td><td>角色/场景/道具原画</td><td>标准美术流</td></tr>
    <tr><td>🧊 建模</td><td>ART_MODEL</td><td>3D建模、UV、贴图</td><td>标准美术流</td></tr>
    <tr><td>🖼️ UI</td><td>ART_UI</td><td>界面设计、图标</td><td>标准美术流</td></tr>
    <tr><td>✨ 特效</td><td>ART_VFX</td><td>粒子特效、Shader</td><td>含技术审核</td></tr>
    <tr><td>🏃 动画</td><td>ART_ANIM</td><td>角色/场景动画</td><td>标准美术流</td></tr>
    <tr><td>🔧 TA</td><td>ART_TA</td><td>材质/工具/优化</td><td>含技术审核</td></tr>
    <tr><td>🐛 Bug</td><td>ART_BUG</td><td>资产缺陷修复</td><td>简化修复流</td></tr>
  </table>

  <div class="sub-title">2.2 自定义字段清单</div>
  <table>
    <tr><th>字段</th><th>类型</th><th>必填时机</th><th>说明</th></tr>
    <tr><td><strong>美术模块</strong></td><td>单选</td><td>创建时</td><td>角色/场景/UI/特效/动画/TA</td></tr>
    <tr><td><strong>复杂度</strong></td><td>单选</td><td>创建时</td><td>S(≤0.5d)/M(0.5~2d)/L(2~5d)/XL(5~10d)/XXL(>10d)</td></tr>
    <tr><td><strong>优先级</strong></td><td>单选</td><td>创建时</td><td>P0紧急/P1高/P2中/P3低</td></tr>
    <tr><td><strong>预估工时</strong></td><td>数字(h)</td><td>排期时</td><td>以0.5h为单位</td></tr>
    <tr><td><strong>实际工时</strong></td><td>数字(h)</td><td>完成时</td><td>自动/手填</td></tr>
    <tr><td><strong>关联里程碑</strong></td><td>关联</td><td>排期时</td><td>选择版本</td></tr>
    <tr><td><strong>资产链接</strong></td><td>URL</td><td>提审时</td><td>SVN/P4/网盘</td></tr>
    <tr><td><strong>参考图</strong></td><td>附件</td><td>创建时</td><td>jpg/png/psd</td></tr>
    <tr><td><strong>技术约束</strong></td><td>文本</td><td>创建时</td><td>面数/骨骼/DrawCall</td></tr>
    <tr><td><strong>审核评分</strong></td><td>数字1~5</td><td>审核时</td><td>5优秀→1返工</td></tr>
    <tr><td><strong>返工次数</strong></td><td>数字</td><td>系统自动</td><td>打回+1</td></tr>
    <tr><td><strong>风险标注</strong></td><td>多选</td><td>可选</td><td>技术风险/资源冲突/依赖阻塞</td></tr>
  </table>

  <div class="sub-title">2.3 需求描述模板</div>
  <pre># [模块]-[简述]

## 1. 背景与目标
- 业务背景：
- 期望效果：

## 2. 详细描述
- 参考风格：[附图或链接]
- 数量/尺寸/面数/规格：

## 3. 技术约束
- 面数上限：   贴图规格：   骨骼/DrawCall：

## 4. 验收标准
- [ ] 符合美术规范  - [ ] 性能达标  - [ ] 引擎内效果确认

## 5. 依赖与风险
- 前置依赖：   潜在风险：</pre>
</div>
''')

# Section 3
parts.append('''
<div class="section" id="s3">
  <h2>🔄 3. Sprint 规划与迭代管理</h2>
  <div class="sub-title">3.1 迭代节奏</div>
  <table>
    <tr><th>参数</th><th>推荐值</th><th>说明</th></tr>
    <tr><td>Sprint 周期</td><td>2 周</td><td>与程序/策划对齐</td></tr>
    <tr><td>规划会</td><td>D1 上午</td><td>确认需求池</td></tr>
    <tr><td>站会</td><td>每天10:00 ≤15min</td><td>同步+识别阻塞</td></tr>
    <tr><td>Review</td><td>D10 下午</td><td>演示验收资产</td></tr>
    <tr><td>回顾会</td><td>D10 16:00</td><td>复盘改进</td></tr>
    <tr><td>缓冲</td><td>15%</td><td>预留1.5d应对突发</td></tr>
  </table>

  <div class="sub-title">3.2 产能计算</div>
  <div class="alert alert-blue">📐 <strong>可用产能</strong> = 人数 × 工作日 × 利用率(0.75) × 日有效工时(6h)<br>例：5人 × 10天 × 0.75 × 6h = <strong>225人时</strong></div>

  <div class="sub-title">3.3 健康度指标</div>
  <table>
    <tr><th>指标</th><th>计算</th><th>健康</th><th>预警</th></tr>
    <tr><td>填充率</td><td>已排工时/可用产能</td><td>75%~90%</td><td>>95%或<60%</td></tr>
    <tr><td>变更率</td><td>(新增+取消)/原计划</td><td>≤15%</td><td>>25%</td></tr>
    <tr><td>完成率</td><td>已完成/计划总数</td><td>≥80%</td><td><60%</td></tr>
    <tr><td>溢出率</td><td>延期数/计划总数</td><td>≤10%</td><td>>20%</td></tr>
  </table>

  <div class="sub-title">3.4 Sprint 规划流程</div>
  <div class="flow">
    <div class="flow-node start"><strong>需求池梳理</strong><div class="sub">D-2</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>优先级排序</strong><div class="sub">D-1</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>容量匹配</strong><div class="sub">D1 AM</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>任务拆分</strong><div class="sub">D1 AM</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>认领/指派</strong><div class="sub">D1 PM</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node end"><strong>Sprint开始</strong><div class="sub">D2</div></div>
  </div>
</div>
''')

# Section 4
parts.append('''
<div class="section" id="s4">
  <h2>👤 4. 自动指派与路由规则</h2>
  <div class="sub-title">4.1 工种路由</div>
  <table>
    <tr><th>模块</th><th>一级路由</th><th>二级分配</th><th>规则</th></tr>
    <tr><td>角色-原画</td><td>原画组长</td><td>按负载</td><td><code>module=Character AND type=CONCEPT</code></td></tr>
    <tr><td>角色-建模</td><td>建模组长</td><td>按资产类型</td><td><code>module=Character AND type=MODEL</code></td></tr>
    <tr><td>场景</td><td>场景组长</td><td>按区域</td><td><code>module=Scene</code></td></tr>
    <tr><td>UI</td><td>UI组长</td><td>按系统</td><td><code>module=UI</code></td></tr>
    <tr><td>特效</td><td>特效组长</td><td>按类型</td><td><code>module=VFX</code></td></tr>
    <tr><td>动画</td><td>动画组长</td><td>按角色</td><td><code>module=Animation</code></td></tr>
    <tr><td>TA</td><td>TA Lead</td><td>按技能栈</td><td><code>module=TA OR label="性能"</code></td></tr>
  </table>

  <div class="sub-title">4.2 审核人指派矩阵</div>
  <table>
    <tr><th>阶段</th><th>审核人</th><th>触发条件</th><th>SLA</th><th>超时升级</th></tr>
    <tr><td>视觉审核</td><td>主美</td><td>状态→待审核</td><td>24h</td><td>→Art Director</td></tr>
    <tr><td>技术审核</td><td>TA Lead</td><td>标签含"性能"或面数>5k</td><td>24h</td><td>→APM</td></tr>
    <tr><td>动效审核</td><td>动画主管</td><td>type=ANIM</td><td>24h</td><td>→组长</td></tr>
    <tr><td>最终确认</td><td>APM</td><td>前置全通过</td><td>4h</td><td>自动通过</td></tr>
  </table>

  <div class="sub-title">4.3 负载均衡策略</div>
  <div class="alert alert-green">🔄 <strong>优先级</strong>：① 进行中最少 → ② 本Sprint完成最多 → ③ 技能匹配度最高</div>
</div>
''')

# Section 5
parts.append('''
<div class="section" id="s5">
  <h2>✅ 5. 多级审核流程</h2>
  <div class="sub-title">5.1 审核链</div>
  <div class="flow">
    <div class="flow-node start"><strong>自检</strong><div class="sub">执行人</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>同行互审</strong><div class="sub">Peer</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node gate"><strong>主美/Lead</strong><div class="sub">视觉</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node warn"><strong>TA技术审</strong><div class="sub">性能</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node end"><strong>APM确认</strong><div class="sub">放行</div></div>
  </div>

  <div class="sub-title">5.2 审核级别</div>
  <table>
    <tr><th>复杂度</th><th>级别</th><th>审核人</th><th>SLA</th></tr>
    <tr><td>S</td><td>1级</td><td>组长</td><td>4h</td></tr>
    <tr><td>M</td><td>2级</td><td>主美+组长</td><td>24h</td></tr>
    <tr><td>L</td><td>3级</td><td>主美+TA+组长</td><td>48h</td></tr>
    <tr><td>XL/XXL</td><td>4级</td><td>主美+TA+Director+APM</td><td>72h</td></tr>
  </table>

  <div class="sub-title">5.3 评分标准</div>
  <table>
    <tr><th>维度</th><th>5分</th><th>4分</th><th>3分</th><th>2分</th><th>1分</th></tr>
    <tr><td>美术品质</td><td>超预期</td><td>完全达标</td><td>基本达标</td><td>部分未达</td><td>严重不符</td></tr>
    <tr><td>技术规范</td><td>优化出色</td><td>全部合规</td><td>基本合规</td><td>存在违规</td><td>严重违规</td></tr>
    <tr><td>交付规范</td><td>完美</td><td>规范</td><td>基本规范</td><td>有问题</td><td>需重整</td></tr>
    <tr><td>创意性</td><td>突破创新</td><td>有亮点</td><td>符合预期</td><td>平庸</td><td>偏离</td></tr>
  </table>
  <div class="alert alert-yellow">⚠️ 任一维度≤2分即打回。综合&lt;3分强制打回。连续两次打回→组长介入辅导。</div>

  <div class="sub-title">5.4 超时升级</div>
  <table>
    <tr><th>超时</th><th>动作</th></tr>
    <tr><td>超SLA 50%</td><td>通知审核人+APM</td></tr>
    <tr><td>超SLA 100%</td><td>升级到上级审核人</td></tr>
    <tr><td>超SLA 200%</td><td>自动通过+标记"未审核放行"</td></tr>
  </table>
</div>
''')

# Section 6
parts.append('''
<div class="section" id="s6">
  <h2>🤖 6. 自动化规则库（20条）</h2>
  <div class="sub-title">6.1 生命周期规则</div>
  <table>
    <tr><th>#</th><th>规则</th><th>触发</th><th>动作</th></tr>
    <tr><td>R01</td><td>新任务路由</td><td>任务创建</td><td>按module分配给组长</td></tr>
    <tr><td>R02</td><td>排期提醒</td><td>Backlog超5天</td><td>通知APM</td></tr>
    <tr><td>R03</td><td>领取自动开始</td><td>指派人变更+Planned</td><td>→In Progress+计时</td></tr>
    <tr><td>R04</td><td>超时预警</td><td>超过预估工期</td><td>通知负责人+APM</td></tr>
    <tr><td>R05</td><td>提审通知</td><td>→In Review</td><td>通知审核人+开始SLA</td></tr>
    <tr><td>R06</td><td>打回创建子任务</td><td>→Rejected</td><td>创建修改子任务+返工+1</td></tr>
    <tr><td>R07</td><td>审核通过关闭</td><td>所有审核通过</td><td>→Done+通知创建者</td></tr>
    <tr><td>R08</td><td>完成记录工时</td><td>→Done</td><td>计算实际工时写入</td></tr>
  </table>

  <div class="sub-title">6.2 质量规则</div>
  <table>
    <tr><th>#</th><th>规则</th><th>触发</th><th>动作</th></tr>
    <tr><td>R09</td><td>三次打回升级</td><td>返工≥3</td><td>标记重点+通知组长</td></tr>
    <tr><td>R10</td><td>通过率追踪</td><td>Sprint结束</td><td>生成报表→邮件</td></tr>
    <tr><td>R11</td><td>审核积压预警</td><td>待审核>10</td><td>通知审核人加速</td></tr>
    <tr><td>R12</td><td>高复杂度加审</td><td>XL/XXL</td><td>自动加Art Director</td></tr>
  </table>

  <div class="sub-title">6.3 协作规则</div>
  <table>
    <tr><th>#</th><th>规则</th><th>触发</th><th>动作</th></tr>
    <tr><td>R13</td><td>依赖联动</td><td>关联任务Done</td><td>解除等待依赖标记</td></tr>
    <tr><td>R14</td><td>子任务全完成</td><td>所有子任务Done</td><td>父任务→In Review</td></tr>
    <tr><td>R15</td><td>跨组同步</td><td>添加关联</td><td>通知被关联负责人</td></tr>
    <tr><td>R16</td><td>里程碑风险扫描</td><td>每天09:00</td><td>汇总延期→通知APM</td></tr>
  </table>

  <div class="sub-title">6.4 效率规则</div>
  <table>
    <tr><th>#</th><th>规则</th><th>触发</th><th>动作</th></tr>
    <tr><td>R17</td><td>日报自动生成</td><td>每天18:00</td><td>汇总→企微群</td></tr>
    <tr><td>R18</td><td>周报自动生成</td><td>每周五17:00</td><td>Sprint报表→邮件</td></tr>
    <tr><td>R19</td><td>闲置回收</td><td>In Progress 7天无更新</td><td>通知→3天后自动挂起</td></tr>
    <tr><td>R20</td><td>重复检测</td><td>标题相似>80%</td><td>弹窗提醒</td></tr>
  </table>

  <div class="sub-title">6.5 配置示例</div>
  <pre># R01: 新任务自动路由
触发: 新建需求  条件: module="Character"
动作: 指派→角色组长 | 添加关注→APM+主美

# R04: 超时预警
触发: 每天10:00  条件: 进行中 AND 超预估工期
动作: 企微通知负责人+APM | 添加标签"超期预警"

# R06: 打回创建修改子任务
触发: →审核不通过
动作: 创建子任务"修改-{标题}" | 返工次数+1 | 通知负责人</pre>
</div>
''')

# Section 7
parts.append('''
<div class="section" id="s7">
  <h2>📢 7. 通知策略与消息治理</h2>
  <div class="sub-title">7.1 分级机制</div>
  <table>
    <tr><th>级别</th><th>场景</th><th>渠道</th><th>频率</th><th>可关</th></tr>
    <tr><td><span class="badge badge-red">P0</span></td><td>线上Bug/里程碑告警</td><td>电话+企微+邮件</td><td>即时</td><td>否</td></tr>
    <tr><td><span class="badge badge-yellow">P1</span></td><td>打回/超期/新分配</td><td>企微+邮件</td><td>即时</td><td>否</td></tr>
    <tr><td><span class="badge badge-blue">P2</span></td><td>状态更新/评论</td><td>企微</td><td>聚合2h</td><td>是</td></tr>
    <tr><td><span class="badge badge-green">P3</span></td><td>日报/周报</td><td>邮件</td><td>定时</td><td>是</td></tr>
  </table>

  <div class="sub-title">7.2 免打扰策略</div>
  <table>
    <tr><th>规则</th><th>说明</th></tr>
    <tr><td>工作时间窗口</td><td>P2/P3仅09:00~20:00推送</td></tr>
    <tr><td>消息聚合</td><td>同类2h内合并</td></tr>
    <tr><td>周末免打扰</td><td>P2/P3延至周一，P0/P1不限</td></tr>
    <tr><td>已读即消</td><td>已操作过的通知自动标已读</td></tr>
  </table>

  <div class="sub-title">7.3 企微 Webhook 配置</div>
  <pre>webhook_url = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"

# 日报模板 (Markdown)
{
  "msgtype": "markdown",
  "markdown": {
    "content": "## 📊 美术日报 ({{date}})\n> Sprint: {{sprint}} | 第{{day}}/10天\n| 指标 | 数值 |\n|---|---|\n| ✅完成 | {{done}} |\n| 🔄进行中 | {{wip}} |\n| 🔴超期 | {{overdue}} |\n| 📈进度 | {{progress}}% |"
  }
}</pre>
</div>
''')

# Section 8
parts.append('''
<div class="section" id="s8">
  <h2>📋 8. 看板配置与 WIP 管控</h2>
  <div class="sub-title">8.1 看板列</div>
  <div class="flow">
    <div class="flow-node start"><strong>待排期</strong><div class="sub">Backlog</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>已排期</strong><div class="sub">Planned</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>进行中</strong><div class="sub">WIP≤3/人</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node gate"><strong>待审核</strong><div class="sub">WIP≤10/组</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node warn"><strong>修改中</strong><div class="sub">WIP≤2/人</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node end"><strong>已完成</strong><div class="sub">Done</div></div>
  </div>

  <div class="sub-title">8.2 WIP 限制</div>
  <table>
    <tr><th>列</th><th>上限</th><th>维度</th><th>超限动作</th></tr>
    <tr><td>进行中</td><td>≤3</td><td>每人</td><td>禁止新领取+通知组长</td></tr>
    <tr><td>待审核</td><td>≤10</td><td>组级别</td><td>通知审核人加速</td></tr>
    <tr><td>修改中</td><td>≤2</td><td>每人</td><td>优先修改再接新任务</td></tr>
    <tr><td>挂起</td><td>≤5</td><td>组级别</td><td>强制评估是否取消</td></tr>
  </table>
  <div class="alert alert-yellow">⚠️ 超WIP时看板标红，系统阻止流转。APM可强制覆盖（需备注原因）。</div>

  <div class="sub-title">8.3 看板视图</div>
  <table>
    <tr><th>视图</th><th>分组</th><th>过滤</th><th>受众</th></tr>
    <tr><td>全局看板</td><td>状态列</td><td>当前Sprint</td><td>APM</td></tr>
    <tr><td>我的任务</td><td>状态列</td><td>当前用户</td><td>美术</td></tr>
    <tr><td>模块看板</td><td>module</td><td>当前Sprint</td><td>组长</td></tr>
    <tr><td>优先级看板</td><td>优先级</td><td>≠Done</td><td>APM</td></tr>
    <tr><td>审核队列</td><td>审核人</td><td>待审核</td><td>主美/TA</td></tr>
  </table>

  <div class="sub-title">8.4 卡片信息</div>
  <table>
    <tr><th>信息</th><th>展示</th><th>必要性</th></tr>
    <tr><td>标题</td><td>主标题(≤20字)</td><td>必须</td></tr>
    <tr><td>负责人</td><td>头像+名</td><td>必须</td></tr>
    <tr><td>优先级</td><td>色标P0红/P1橙/P2蓝/P3灰</td><td>必须</td></tr>
    <tr><td>截止日期</td><td>超期红色</td><td>必须</td></tr>
    <tr><td>复杂度</td><td>T-shirt标签</td><td>推荐</td></tr>
    <tr><td>返工次数</td><td>角标(≥2显示)</td><td>推荐</td></tr>
  </table>
</div>
''')

# Section 9
parts.append('''
<div class="section" id="s9">
  <h2>🏁 9. 版本管理与里程碑追踪</h2>
  <div class="sub-title">9.1 版本层级</div>
  <table>
    <tr><th>层级</th><th>命名</th><th>跨度</th><th>负责人</th><th>示例</th></tr>
    <tr><td>大版本</td><td>v{X}.0</td><td>3~6月</td><td>制作人</td><td>v2.0 角色大更新</td></tr>
    <tr><td>功能版本</td><td>v{X}.{Y}</td><td>1~2月</td><td>APM</td><td>v2.1 新增3角色</td></tr>
    <tr><td>补丁</td><td>v{X}.{Y}.{Z}</td><td>1~2周</td><td>组长</td><td>v2.1.1 修复贴图</td></tr>
  </table>

  <div class="sub-title">9.2 里程碑定义</div>
  <table>
    <tr><th>里程碑</th><th>缩写</th><th>定义</th><th>完成标准</th></tr>
    <tr><td>概念确认</td><td>CC</td><td>美术方向确认</td><td>原画3选1通过</td></tr>
    <tr><td>白模完成</td><td>WM</td><td>白模+布线完成</td><td>面数合规+比例确认</td></tr>
    <tr><td>贴图完成</td><td>TX</td><td>所有贴图完毕</td><td>PBR参数达标</td></tr>
    <tr><td>引擎集成</td><td>EI</td><td>导入引擎可运行</td><td>无报错+性能达标</td></tr>
    <tr><td>最终交付</td><td>FD</td><td>全部审核入库</td><td>所有通过+QA验证</td></tr>
  </table>

  <div class="sub-title">9.3 风险预警规则</div>
  <table>
    <tr><th>级别</th><th>条件</th><th>动作</th></tr>
    <tr><td><span class="badge badge-green">绿色</span></td><td>进度≥时间消耗比</td><td>正常推进</td></tr>
    <tr><td><span class="badge badge-yellow">黄色</span></td><td>落后10%~20%</td><td>通知APM+组长评估</td></tr>
    <tr><td><span class="badge badge-red">红色</span></td><td>落后>20%</td><td>升级制作人+应急方案</td></tr>
  </table>
</div>
''')

# Section 10
parts.append('''
<div class="section" id="s10">
  <h2>📊 10. 数据报表与效能度量</h2>
  <div class="sub-title">10.1 核心KPI</div>
  <div class="kpi-grid">
    <div class="kpi-card"><div class="label">Sprint完成率</div><div class="value">≥80%</div><div class="target">目标</div></div>
    <div class="kpi-card"><div class="label">准时交付率</div><div class="value">≥70%</div><div class="target">目标</div></div>
    <div class="kpi-card"><div class="label">一次通过率</div><div class="value">≥60%</div><div class="target">目标</div></div>
    <div class="kpi-card"><div class="label">排期准确率</div><div class="value">≥80%</div><div class="target">目标</div></div>
    <div class="kpi-card"><div class="label">平均审核时长</div><div class="value">≤24h</div><div class="target">目标</div></div>
    <div class="kpi-card"><div class="label">返工率</div><div class="value">≤20%</div><div class="target">目标</div></div>
  </div>

  <div class="sub-title">10.2 报表体系</div>
  <table>
    <tr><th>报表</th><th>频率</th><th>核心指标</th><th>受众</th></tr>
    <tr><td>Sprint报表</td><td>每Sprint</td><td>完成率/准时率/通过率/变更率</td><td>APM+组长</td></tr>
    <tr><td>月度趋势</td><td>每月</td><td>产能利用率/效率趋势/质量趋势</td><td>制作人</td></tr>
    <tr><td>个人效能</td><td>每Sprint</td><td>完成量/通过率/工时偏差</td><td>个人+组长</td></tr>
    <tr><td>审核报表</td><td>每周</td><td>审核时效/积压/打回率</td><td>审核人+APM</td></tr>
    <tr><td>里程碑报表</td><td>每周</td><td>版本进度/风险/阻塞</td><td>制作人+APM</td></tr>
    <tr><td>燃尽图</td><td>每日</td><td>剩余工作量vs理想线</td><td>全员</td></tr>
  </table>

  <div class="sub-title">10.3 效能报表模板</div>
  <table>
    <tr><th>指标</th><th>公式</th><th>本期</th><th>上期</th><th>趋势</th><th>目标</th></tr>
    <tr><td>完成率</td><td>已完成/计划×100%</td><td>85%</td><td>82%</td><td>📈+3%</td><td>≥80%</td></tr>
    <tr><td>准时率</td><td>按时完成/已完成×100%</td><td>72%</td><td>68%</td><td>📈+4%</td><td>≥70%</td></tr>
    <tr><td>一次通过率</td><td>首审通过/提审×100%</td><td>65%</td><td>58%</td><td>📈+7%</td><td>≥60%</td></tr>
    <tr><td>排期准确率</td><td>1-|实际-预估|/预估</td><td>78%</td><td>75%</td><td>📈+3%</td><td>≥80%</td></tr>
    <tr><td>平均工期偏差</td><td>Avg(实际-预估)</td><td>+0.5d</td><td>+0.8d</td><td>📈改善</td><td>≤0.5d</td></tr>
  </table>

  <div class="sub-title">10.4 流效率分析</div>
  <div class="alert alert-blue">📐 <strong>流效率</strong> = 有效工作时间 / (有效+等待) × 100%<br>目标≥40%（业界优秀），&lt;25%需改进瓶颈</div>
  <table>
    <tr><th>阶段</th><th>平均耗时</th><th>有效工作</th><th>等待</th><th>瓶颈</th></tr>
    <tr><td>待排期→已排期</td><td>2.5d</td><td>0.5d</td><td>2.0d</td><td><span class="badge badge-yellow">⚠️高</span></td></tr>
    <tr><td>已排期→进行中</td><td>1.2d</td><td>0.2d</td><td>1.0d</td><td><span class="badge badge-green">正常</span></td></tr>
    <tr><td>进行中→待审核</td><td>3.5d</td><td>3.5d</td><td>0d</td><td><span class="badge badge-green">高效</span></td></tr>
    <tr><td>待审核→通过/打回</td><td>1.8d</td><td>0.5d</td><td>1.3d</td><td><span class="badge badge-yellow">⚠️高</span></td></tr>
  </table>
</div>
''')

# Section 11
parts.append('''
<div class="section" id="s11">
  <h2>🔗 11. 工具集成与生态</h2>
  <div class="sub-title">11.1 集成架构</div>
  <div class="flow">
    <div class="flow-node start"><strong>TAPD/Jira</strong><div class="sub">任务管理</div></div>
    <div class="flow-arrow">↔</div>
    <div class="flow-node"><strong>企微/飞书</strong><div class="sub">通知协作</div></div>
    <div class="flow-arrow">↔</div>
    <div class="flow-node"><strong>Perforce</strong><div class="sub">版本控制</div></div>
    <div class="flow-arrow">↔</div>
    <div class="flow-node gate"><strong>Jenkins/CI</strong><div class="sub">自动构建</div></div>
    <div class="flow-arrow">↔</div>
    <div class="flow-node end"><strong>资产平台</strong><div class="sub">入库/检索</div></div>
  </div>

  <div class="sub-title">11.2 集成清单</div>
  <table>
    <tr><th>对象</th><th>方式</th><th>数据流</th><th>用途</th></tr>
    <tr><td>企微机器人</td><td>Webhook</td><td>TAPD→企微</td><td>通知/日报/周报</td></tr>
    <tr><td>Perforce</td><td>API+Hook</td><td>双向</td><td>提交关联任务</td></tr>
    <tr><td>Jenkins</td><td>REST API</td><td>Jenkins→TAPD</td><td>构建结果回写</td></tr>
    <tr><td>资产管理</td><td>REST API</td><td>双向</td><td>完成后自动入库</td></tr>
    <tr><td>日历</td><td>iCal订阅</td><td>TAPD→日历</td><td>截止日期同步</td></tr>
    <tr><td>Excel</td><td>CSV/XLSX</td><td>→TAPD</td><td>批量创建任务</td></tr>
  </table>

  <div class="sub-title">11.3 Perforce 联动</div>
  <pre># P4 Trigger 配置
ArtTaskLink change-commit //depot/Art/... "%//trigger/tapd-sync.py% %changelist%"

# 逻辑：
# 1. 解析 description 中 [TAPD-12345] → 调用API关联提交
# 2. 含 [Done] → 自动更新状态为"待审核"
# 3. 记录 changelist 到"资产链接"字段</pre>

  <div class="sub-title">11.4 CI 资产校验</div>
  <table>
    <tr><th>步骤</th><th>检查</th><th>失败处理</th></tr>
    <tr><td>文件命名</td><td>符合规范</td><td>驳回提交</td></tr>
    <tr><td>面数检查</td><td>≤预算</td><td>警告+通知TA</td></tr>
    <tr><td>贴图尺寸</td><td>2的幂次</td><td>驳回</td></tr>
    <tr><td>引擎导入</td><td>正常导入</td><td>驳回+错误日志</td></tr>
    <tr><td>性能测试</td><td>DrawCall/帧率</td><td>生成报告</td></tr>
  </table>
</div>
''')

# Section 12
parts.append('''
<div class="section" id="s12">
  <h2>📈 12. 团队效能成熟度模型</h2>
  <div class="sub-title">12.1 五级定义</div>
  <table>
    <tr><th>等级</th><th>名称</th><th>特征</th><th>关键实践</th></tr>
    <tr><td><span class="badge badge-red">L1</span></td><td>初始级</td><td>无标准流程，靠个人</td><td>建立工作流+状态机</td></tr>
    <tr><td><span class="badge badge-yellow">L2</span></td><td>可管理级</td><td>有流程，基本可追踪</td><td>WIP+基础报表+通知</td></tr>
    <tr><td><span class="badge badge-blue">L3</span></td><td>已定义级</td><td>标准化，数据驱动</td><td>自动化+效能度量+回顾</td></tr>
    <tr><td><span class="badge badge-green">L4</span></td><td>量化管理级</td><td>可预测，持续优化</td><td>CFD+流效率+预测模型</td></tr>
    <tr><td><span class="badge badge-cyan">L5</span></td><td>优化级</td><td>自适应，行业标杆</td><td>AI辅助+自动治理+知识沉淀</td></tr>
  </table>

  <div class="sub-title">12.2 L2→L3 升级检查表</div>
  <div class="checklist">
    <h4>升级检查（推荐当前目标）</h4>
    <div class="check-item"><div class="box">☐</div><span>所有任务类型有标准化模板</span></div>
    <div class="check-item"><div class="box">☐</div><span>自动化规则≥10条且稳定运行</span></div>
    <div class="check-item"><div class="box">☐</div><span>每Sprint产出效能报表并复盘</span></div>
    <div class="check-item"><div class="box">☐</div><span>一次通过率稳定≥60%</span></div>
    <div class="check-item"><div class="box">☐</div><span>WIP限制严格执行</span></div>
    <div class="check-item"><div class="box">☐</div><span>审核SLA≥90%达标率</span></div>
    <div class="check-item"><div class="box">☐</div><span>所有集成联动已配置稳定</span></div>
    <div class="check-item"><div class="box">☐</div><span>团队成员使用仪表盘</span></div>
  </div>

  <div class="sub-title">12.3 持续改进循环</div>
  <div class="flow">
    <div class="flow-node start"><strong>度量</strong><div class="sub">收集数据</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>分析</strong><div class="sub">识别瓶颈</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>改进</strong><div class="sub">调整规则</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node"><strong>验证</strong><div class="sub">观察效果</div></div>
    <div class="flow-arrow">→</div>
    <div class="flow-node end"><strong>固化</strong><div class="sub">更新标准</div></div>
  </div>
</div>
''')

# Section 13
parts.append('''
<div class="section" id="s13">
  <h2>📦 13. 模板导入/导出实操指南</h2>
  <div class="sub-title">13.1 CSV 导入模板</div>
  <pre># art_tasks_import.csv
标题,任务类型,优先级,模块,复杂度,预估工时(h),截止日期,描述
CH_Luna_原画,ART_CONCEPT,P1,角色,L,24,2026-06-15,Luna角色原画3方案
CH_Luna_建模,ART_MODEL,P1,角色,XL,60,2026-06-30,高模+低模+UV
SC_Main_美化,ART_MODEL,P2,场景,L,32,2026-07-10,主城第二轮细化
UI_Shop_redesign,ART_UI,P2,UI,M,8,2026-06-20,商城界面改版
VFX_Skill_01,ART_VFX,P1,特效,L,20,2026-06-25,主角大招特效</pre>

  <div class="sub-title">13.2 TAPD 导入步骤</div>
  <div class="checklist">
    <div class="check-item"><div class="box">1</div><span>准备CSV文件（按上述格式）</span></div>
    <div class="check-item"><div class="box">2</div><span>项目设置→数据导入→选择"需求/任务"</span></div>
    <div class="check-item"><div class="box">3</div><span>字段映射：CSV列→TAPD字段（含自定义）</span></div>
    <div class="check-item"><div class="box">4</div><span>预览前10条确认映射正确</span></div>
    <div class="check-item"><div class="box">5</div><span>执行导入→验证自动化规则触发</span></div>
  </div>

  <div class="sub-title">13.3 Jira 批量导入 (JSON)</div>
  <pre>{
  "issueUpdates": [{
    "fields": {
      "project": {"key": "ART"},
      "issuetype": {"name": "Art Task"},
      "summary": "CH_Luna 原画设计",
      "priority": {"name": "High"},
      "customfield_10001": "角色",
      "customfield_10002": "L",
      "timetracking": {"originalEstimate": "24h"}
    }
  }]
}</pre>

  <div class="sub-title">13.4 导出备份策略</div>
  <table>
    <tr><th>备份内容</th><th>频率</th><th>格式</th><th>保留期</th></tr>
    <tr><td>全量任务数据</td><td>每周日</td><td>CSV + JSON</td><td>90天</td></tr>
    <tr><td>工作流配置</td><td>每次修改后</td><td>XML/JSON</td><td>永久</td></tr>
    <tr><td>自动化规则</td><td>每次修改后</td><td>文档截图+文本</td><td>永久</td></tr>
    <tr><td>仪表盘配置</td><td>每月</td><td>截图+配置文本</td><td>12个月</td></tr>
  </table>
</div>
''')

# Section 14
parts.append('''
<div class="section" id="s14">
  <h2>📎 14. 附录：快速配置清单</h2>
  <div class="sub-title">TAPD 完整配置</div>
  <div class="checklist">
    <div class="check-item"><div class="box">☐</div><span>创建美术项目空间</span></div>
    <div class="check-item"><div class="box">☐</div><span>自定义需求类型（7种美术任务类型）</span></div>
    <div class="check-item"><div class="box">☐</div><span>配置工作流（10个状态+流转矩阵）</span></div>
    <div class="check-item"><div class="box">☐</div><span>添加12个自定义字段</span></div>
    <div class="check-item"><div class="box">☐</div><span>设置自动化规则（20条）</span></div>
    <div class="check-item"><div class="box">☐</div><span>配置企微通知机器人</span></div>
    <div class="check-item"><div class="box">☐</div><span>创建看板视图（5个视图）</span></div>
    <div class="check-item"><div class="box">☐</div><span>设置WIP限制</span></div>
    <div class="check-item"><div class="box">☐</div><span>配置仪表盘报表（6类报表）</span></div>
    <div class="check-item"><div class="box">☐</div><span>版本/里程碑配置</span></div>
    <div class="check-item"><div class="box">☐</div><span>Perforce集成联动</span></div>
    <div class="check-item"><div class="box">☐</div><span>CI/CD资产校验流水线</span></div>
  </div>

  <div class="sub-title">Jira 完整配置</div>
  <div class="checklist">
    <div class="check-item"><div class="box">☐</div><span>创建Art项目</span></div>
    <div class="check-item"><div class="box">☐</div><span>配置Issue Types（7种）</span></div>
    <div class="check-item"><div class="box">☐</div><span>设计Workflow（含Conditions/Validators/Post Functions）</span></div>
    <div class="check-item"><div class="box">☐</div><span>Custom Fields（12个）</span></div>
    <div class="check-item"><div class="box">☐</div><span>Automation Rules（20条）</span></div>
    <div class="check-item"><div class="box">☐</div><span>Slack/企微Webhook通知</span></div>
    <div class="check-item"><div class="box">☐</div><span>Board + Filters + WIP Limits</span></div>
    <div class="check-item"><div class="box">☐</div><span>Dashboard（含Burndown/CFD/Velocity）</span></div>
    <div class="check-item"><div class="box">☐</div><span>Version管理</span></div>
    <div class="check-item"><div class="box">☐</div><span>Perforce/Bitbucket集成</span></div>
  </div>
</div>
''')

# Footer
parts.append('''
<div class="doc-footer">
  游戏美术项目管理知识库 · 项目管理工具模板 v2.0
</div>

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
</html>''')

# Write output
content = ''.join(parts)
with open(output, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Done! File size: {len(content)} chars")
print(f"Sections: {content.count('<h2>')}")
print(f"Has </html>: {'</html>' in content}")
