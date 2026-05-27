"""
需求对接流转规范 v2.0 -> v3.0 升级脚本
多维度专业内容优化
"""
import os

html_path = r"h:\游戏项目知识库\docs\knowledge-base\art-vs-planner-req.html"

# 读取原文件
with open(html_path, "r", encoding="utf-8") as f:
    original = f.read()

# 定位 style 结束标签位置和 body 结束位置
# 我们在原文基础上进行针对性替换和追加

# 1. 升级版本号 v2.0 -> v3.0
content = original.replace(
    '<h1>📋 需求对接流转规范 <span class="ver">v2.0</span></h1>',
    '<h1>📋 需求对接流转规范 <span class="ver">v3.0</span></h1>'
)
content = content.replace(
    '<div class="subtitle">Art-Planner Requirement Handoff Specification</div>',
    '<div class="subtitle">Art-Planner Requirement Handoff Specification — Full Lifecycle Management</div>'
)

# 2. 更新 meta 信息
content = content.replace(
    '<span>📋 适用：全阶段</span>',
    '<span>📋 适用：全阶段 · 全工种</span>'
)

# 3. 在 TOC 中添加新章节
old_toc_end = '''    <li><a href="#s10">附录：跨部门协作日历</a></li>
  </ol>
</div>'''

new_toc = '''    <li><a href="#s10">工具链集成与自动化</a></li>
    <li><a href="#s11">需求池管理与容量规划</a>
      <ol>
        <li><a href="#s11-1">需求池分层治理</a></li>
        <li><a href="#s11-2">产能容量模型</a></li>
        <li><a href="#s11-3">需求优先级动态调整</a></li>
      </ol>
    </li>
    <li><a href="#s12">WIP 过程管控与检查点</a>
      <ol>
        <li><a href="#s12-1">分阶段检查点设置</a></li>
        <li><a href="#s12-2">WIP Review 执行标准</a></li>
        <li><a href="#s12-3">提前风险识别机制</a></li>
      </ol>
    </li>
    <li><a href="#s13">培训与赋能体系</a></li>
    <li><a href="#s14">应急预案与异常处理</a></li>
    <li><a href="#s15">附录：跨部门协作日历</a></li>
  </ol>
</div>'''
content = content.replace(old_toc_end, new_toc)

# 4. 在 s1 流程全景图中新增"WIP检查点"说明
content = content.replace(
    '<div class="alert alert-blue">💡 <strong>v2.0 新增「质量预检」环节</strong>：需求单提交后系统自动校验评分卡得分 ≥ 70 分方可进入评审，低于 70 分退回补充。</div>',
    '<div class="alert alert-blue">💡 <strong>v3.0 升级要点</strong>：① 新增「WIP 检查点」— 在制作中设置 30%/60%/90% 三个必检节点，将返工问题前置发现；② 新增「归档复盘」— 每个需求完成后自动生成效率数据卡，沉淀团队知识。</div>'
)

# 5. 在状态机表格后追加"挂起"状态
old_state_table_end = '''    <tr><td><strong>已归档</strong></td><td>策划验收通过</td><td>系统</td><td>归档资产、更新统计</td></tr>
  </table>
</div>'''

new_state_table_end = '''    <tr><td><strong>已归档</strong></td><td>策划验收通过</td><td>系统</td><td>归档资产、更新统计、生成效率卡</td></tr>
    <tr><td><strong>挂起</strong></td><td>外部依赖阻塞 / 策划主动暂停</td><td>APM</td><td>SLA 暂停计时、通知相关方、记录阻塞原因</td></tr>
  </table>

  <div class="sub-title" id="s1-4">🔗 1.4 并行流转与依赖管理（v3.0 新增）</div>
  <p>复杂需求涉及多工种串联或并行时，需明确依赖关系和触发机制：</p>
  <table>
    <tr><th>依赖类型</th><th>定义</th><th>处理策略</th><th>系统支持</th></tr>
    <tr><td><strong>强依赖（FS）</strong></td><td>上游完成后才能开始下游</td><td>上游验收通过自动触发下游启动</td><td>需求链自动编排</td></tr>
    <tr><td><strong>弱依赖（SS）</strong></td><td>可同时开始但需阶段对齐</td><td>设置同步检查点，定期对齐</td><td>关联需求状态联动通知</td></tr>
    <tr><td><strong>外部依赖</strong></td><td>依赖其他部门/外部资源</td><td>标记阻塞，挂起 SLA 计时</td><td>每日自动催促依赖方</td></tr>
    <tr><td><strong>资源依赖</strong></td><td>需等待特定人员/工具就位</td><td>APM 提前协调资源窗口</td><td>资源日历冲突检测</td></tr>
  </table>
  <div class="alert alert-yellow">⚠️ <strong>依赖管理红线</strong>：任何需求的强依赖链长度不得超过 4 级。超过 4 级必须拆分为独立可交付子项目。</div>
</div>'''
content = content.replace(old_state_table_end, new_state_table_end)

# 6. 在需求单字段中补充"风险标注"字段
content = content.replace(
    '<tr><td><strong>备注</strong></td><td>❌</td><td>补充说明</td><td>—</td></tr>',
    '<tr><td><strong>风险标注</strong></td><td>⚠️</td><td>预判可能的阻塞点</td><td>依赖角色设定未定稿</td></tr>\n    <tr><td><strong>备注</strong></td><td>❌</td><td>补充说明</td><td>—</td></tr>'
)

# 7. 在需求分类表格后增加"评审级别"说明
content = content.replace(
    '<div class="alert alert-yellow">⚠️ <strong>分类规则</strong>：策划提交时必须选择到二级分类；复杂度由 APM 在评审时最终确认；跨工种需求（如"角色原画+建模"）需拆分为多张独立需求单。</div>',
    '<div class="alert alert-yellow">⚠️ <strong>分类规则</strong>：策划提交时必须选择到二级分类；复杂度由 APM 在评审时最终确认；跨工种需求（如"角色原画+建模"）需拆分为多张独立需求单并建立需求链关联。低复杂度需求（≤2d）可走「快速通道」免评审。</div>'
)

# 8. 在 SLA 章节后追加"SLA 豁免条件"
old_sla_end = '''    <div class="dd-card dd-dont"><h4>❌ Don\'t — 错误应对</h4><p>无视提醒消息；私下口头说"我忙不过来"但不在系统中更新状态；等到 L3 才解释原因。</p></div>
  </div>
</div>'''

new_sla_end = '''    <div class="dd-card dd-dont"><h4>❌ Don\'t — 错误应对</h4><p>无视提醒消息；私下口头说"我忙不过来"但不在系统中更新状态；等到 L3 才解释原因。</p></div>
  </div>

  <div class="sub-title" id="s4-3">🛡️ 4.3 SLA 豁免条件（v3.0 新增）</div>
  <p>以下情况 SLA 自动暂停计时，不计入超时统计：</p>
  <table>
    <tr><th>豁免场景</th><th>豁免方式</th><th>恢复条件</th><th>审批人</th></tr>
    <tr><td>外部依赖阻塞（等待其他部门交付）</td><td>标记"挂起"，SLA 暂停</td><td>依赖解除后自动恢复</td><td>APM</td></tr>
    <tr><td>策划主动暂停需求</td><td>需求状态改为"挂起"</td><td>策划重新激活</td><td>策划</td></tr>
    <tr><td>全组紧急任务（如版本救火）</td><td>APM 批量标记受影响需求</td><td>紧急任务结束后统一恢复</td><td>主美/制作人</td></tr>
    <tr><td>节假日/全组 Team Building</td><td>系统自动识别非工作日</td><td>工作日自动恢复</td><td>系统</td></tr>
    <tr><td>需求方案重大变更（经评审确认）</td><td>重新计时</td><td>变更确认后重启 SLA</td><td>APM + 主美</td></tr>
  </table>
</div>'''
content = content.replace(old_sla_end, new_sla_end)

# 9. 在评审机制中添加"快速通道"
old_review_end = '''  </table>
</div>

<!-- ===== Section 6: 变更管控 ===== -->'''

new_review_end = '''  </table>

  <div class="sub-title" id="s5-5">⚡ 5.5 快速通道 Fast Track（v3.0 新增）</div>
  <p>满足以下<strong>全部条件</strong>的需求可跳过评审会，由 APM 直接审批排期：</p>
  <table>
    <tr><th>条件</th><th>标准</th><th>判定人</th></tr>
    <tr><td>复杂度</td><td>低复杂度（工期 ≤ 2d）</td><td>APM</td></tr>
    <tr><td>质量评分</td><td>≥ 85 分</td><td>系统自动</td></tr>
    <tr><td>历史同类</td><td>有成功先例可参考</td><td>APM</td></tr>
    <tr><td>无技术风险</td><td>不涉及新技术/新管线</td><td>TA 确认（异步）</td></tr>
    <tr><td>优先级</td><td>P2 或 P3</td><td>系统自动</td></tr>
  </table>
  <div class="alert alert-green">💡 <strong>Fast Track 效果</strong>：预计可将 30% 的低复杂度需求跳过评审会，从提交到排期缩短至 0.5d（原 2~3d）。APM 每日快速审批 1 次即可。</div>
</div>

<!-- ===== Section 6: 变更管控 ===== -->'''
content = content.replace(old_review_end, new_review_end)

# 10. 在工具链章节后，section 10 改为 s10（已有），然后在 section 10 后追加新章节
old_s10 = '<!-- ===== Section 10: 协作日历 ===== -->'
content = content.replace(old_s10, '''<!-- ===== Section 11: 需求池管理 ===== -->
<div class="section" id="s11">
  <h2>📦 11. 需求池管理与容量规划（v3.0 新增）</h2>

  <div class="sub-title" id="s11-1">🏗️ 11.1 需求池分层治理</div>
  <p>所有需求按生命周期阶段分层管理，确保资源聚焦在正确的事情上：</p>
  <table>
    <tr><th>层级</th><th>定义</th><th>容量上限</th><th>管理策略</th><th>清理规则</th></tr>
    <tr><td><strong>🔴 执行池</strong></td><td>当前 Sprint 在制的需求</td><td>团队产能 × 80%</td><td>每日跟踪进度</td><td>—</td></tr>
    <tr><td><strong>🟡 待排期池</strong></td><td>已评审通过待分配资源</td><td>≤ 执行池的 150%</td><td>每周排期</td><td>超 2 周未排期 → 重新确认优先级</td></tr>
    <tr><td><strong>🟢 评审池</strong></td><td>已通过预检待评审</td><td>不限</td><td>每周评审消化</td><td>超 2 周未评审 → APM 主动约评</td></tr>
    <tr><td><strong>⚪ 储备池</strong></td><td>远期规划/灵感储备</td><td>不限</td><td>每月清理</td><td>超 3 月无动静 → 归档关闭</td></tr>
  </table>

  <div class="sub-title" id="s11-2">📊 11.2 产能容量模型</div>
  <p>APM 按以下公式估算团队可承接需求量，避免过载：</p>
  <div class="alert alert-blue">💡 <strong>产能公式</strong>：Sprint 可用产能 = 人数 × 工作日数 × 0.75（排除会议/杂务） × 效率系数（新手 0.6 / 熟手 0.85 / 骨干 1.0）</div>
  <table>
    <tr><th>负载区间</th><th>产能利用率</th><th>建议动作</th><th>系统标记</th></tr>
    <tr><td>🟢 健康</td><td>60% ~ 80%</td><td>正常排期，可接新需求</td><td>绿色</td></tr>
    <tr><td>🟡 饱和</td><td>80% ~ 100%</td><td>谨慎排期，仅接 P0/P1</td><td>黄色预警</td></tr>
    <tr><td>🔴 过载</td><td>> 100%</td><td>暂停接新需求，升级制作人决策</td><td>红色告警</td></tr>
    <tr><td>⚪ 闲置</td><td>< 60%</td><td>主动拉取储备池需求/支援其他组</td><td>灰色提示</td></tr>
  </table>

  <div class="sub-title" id="s11-3">🔄 11.3 需求优先级动态调整</div>
  <p>优先级不是一成不变的，以下场景需触发优先级复审：</p>
  <table>
    <tr><th>触发场景</th><th>复审机制</th><th>决策人</th></tr>
    <tr><td>版本计划变更（里程碑调整）</td><td>受影响需求全量重新排序</td><td>制作人</td></tr>
    <tr><td>新 P0 需求插入</td><td>评估是否需要降级现有 P0/P1</td><td>制作人</td></tr>
    <tr><td>资源突发变动（离职/生病）</td><td>重新评估排期可行性</td><td>APM + 主美</td></tr>
    <tr><td>外部依赖长期未解除</td><td>降级或关闭相关需求</td><td>APM</td></tr>
    <tr><td>需求超过预估工期 50%</td><td>重新评估是否继续投入</td><td>主美 + 制作人</td></tr>
  </table>
</div>

<!-- ===== Section 12: WIP 过程管控 ===== -->
<div class="section" id="s12">
  <h2>🎯 12. WIP 过程管控与检查点（v3.0 新增）</h2>

  <div class="sub-title" id="s12-1">📍 12.1 分阶段检查点设置</div>
  <p>三级检查点机制将质量问题前置发现，大幅减少后期返工：</p>
  <table>
    <tr><th>检查点</th><th>进度</th><th>检查内容</th><th>参与人</th><th>输出物</th><th>未通过处理</th></tr>
    <tr><td><strong>🟢 CP1</strong></td><td>30%</td><td>整体方向/构图/大色块/基础造型</td><td>美术 + APM + 策划（可选）</td><td>方向确认书</td><td>暂停制作，APM 协调沟通</td></tr>
    <tr><td><strong>🟡 CP2</strong></td><td>60%</td><td>细节刻画/材质/配色/技术指标初检</td><td>美术 + 主美 + TA（按需）</td><td>WIP Review 记录</td><td>记录修改意见，评估延期影响</td></tr>
    <tr><td><strong>🔴 CP3</strong></td><td>90%</td><td>成品质量/完整度/技术合规/对照需求单</td><td>美术 + 主美 + 策划</td><td>验收前预检报告</td><td>小修直接改，大修走变更流程</td></tr>
  </table>
  <div class="alert alert-green">💡 <strong>检查点效果预期</strong>：将验收阶段返工率从 35% 降至 10% 以下；将"策划验收时才发现方向不对"的案例降至 0。</div>

  <div class="sub-title" id="s12-2">📋 12.2 WIP Review 执行标准</div>
  <table>
    <tr><th>维度</th><th>CP1 标准</th><th>CP2 标准</th><th>CP3 标准</th></tr>
    <tr><td><strong>形式</strong></td><td>异步截图 Review</td><td>15min 同步 Review</td><td>正式 Review 会议</td></tr>
    <tr><td><strong>时效</strong></td><td>发图后 4h 内反馈</td><td>Review 后当天出结论</td><td>会议当场出结论</td></tr>
    <tr><td><strong>反馈格式</strong></td><td>通过/修改 + 文字</td><td>结构化反馈表 + 标注截图</td><td>逐条 Checklist 打分</td></tr>
    <tr><td><strong>决策权</strong></td><td>APM 决定</td><td>主美决定</td><td>策划 + 主美共同决定</td></tr>
  </table>

  <div class="sub-title" id="s12-3">⚠️ 12.3 提前风险识别机制</div>
  <table>
    <tr><th>风险信号</th><th>触发条件</th><th>系统动作</th><th>APM 应对</th></tr>
    <tr><td>🔴 进度滞后</td><td>实际进度 < 计划进度 20%</td><td>自动标黄 + 通知 APM</td><td>约谈了解阻塞原因，必要时调配支援</td></tr>
    <tr><td>🟡 检查点延期</td><td>CP 检查点超期 1d 未完成</td><td>通知组长 + APM</td><td>评估是否需要调整排期或资源</td></tr>
    <tr><td>🔴 CP 未通过</td><td>CP1/CP2 检查未通过</td><td>暂停后续制作</td><td>组织三方沟通，明确修改方向</td></tr>
    <tr><td>🟡 多次修改</td><td>同一 CP 反复修改 ≥ 3 次</td><td>升级至主美介入</td><td>主美评估是否需求本身有问题</td></tr>
    <tr><td>🔴 技术阻塞</td><td>TA 反馈技术方案不可行</td><td>通知全链路相关人</td><td>紧急协调替代方案</td></tr>
  </table>
</div>

<!-- ===== Section 13: 培训赋能 ===== -->
<div class="section" id="s13">
  <h2>📚 13. 培训与赋能体系（v3.0 新增）</h2>
  <p>流程规范的落地效果取决于团队对规范的理解和执行力。建立系统化培训机制：</p>

  <div class="sub-title">🎓 各角色培训要求</div>
  <table>
    <tr><th>角色</th><th>培训内容</th><th>培训频率</th><th>考核方式</th><th>未达标处理</th></tr>
    <tr><td><strong>新入职策划</strong></td><td>需求单填写规范 + 参考图标准 + 评分卡机制</td><td>入职首周必修</td><td>提交 1 份模拟需求单（≥80分）</td><td>不合格需重新学习后才能提需求</td></tr>
    <tr><td><strong>新入职美术</strong></td><td>流转流程 + WIP 检查点 + 验收标准 + SLA 机制</td><td>入职首周必修</td><td>了解流程后签字确认</td><td>—</td></tr>
    <tr><td><strong>APM</strong></td><td>排期工具 + 产能模型 + 升级机制 + 数据看板使用</td><td>季度更新培训</td><td>实操演练</td><td>—</td></tr>
    <tr><td><strong>全员</strong></td><td>流程变更说明（如 v3.0 升级）</td><td>每次规范迭代</td><td>阅读确认</td><td>—</td></tr>
  </table>

  <div class="sub-title">📖 赋能资源清单</div>
  <table>
    <tr><th>资源类型</th><th>内容</th><th>维护人</th><th>更新频率</th></tr>
    <tr><td><strong>优秀需求单示例库</strong></td><td>各工种各复杂度的高分需求单范例</td><td>APM</td><td>每月补充</td></tr>
    <tr><td><strong>常见退回原因 Top10</strong></td><td>最高频的退回问题 + 正确写法示例</td><td>APM</td><td>每季度更新</td></tr>
    <tr><td><strong>参考图标注指南</strong></td><td>如何有效标注参考图（含视频教程）</td><td>主美</td><td>年度更新</td></tr>
    <tr><td><strong>流程操作手册</strong></td><td>TAPD 系统操作步骤图文教程</td><td>APM</td><td>工具变更时更新</td></tr>
    <tr><td><strong>FAQ 问答库</strong></td><td>流程执行中的常见问题答疑</td><td>APM</td><td>持续积累</td></tr>
  </table>
</div>

<!-- ===== Section 14: 应急预案 ===== -->
<div class="section" id="s14">
  <h2>🚨 14. 应急预案与异常处理（v3.0 新增）</h2>
  <p>当常规流程无法覆盖的异常情况出现时，按以下预案快速响应：</p>
  <table>
    <tr><th>异常场景</th><th>判定标准</th><th>应急响应</th><th>决策人</th><th>事后复盘</th></tr>
    <tr><td><strong>核心美术离职</strong></td><td>在手需求 ≥ 3 个 且 工期 ≥ 30d</td><td>① 紧急交接会 ② APM 48h 内重新分配 ③ 受影响需求重评排期</td><td>主美 + APM</td><td>1 周内出交接复盘</td></tr>
    <tr><td><strong>外包批量返工</strong></td><td>同批外包返工率 > 50%</td><td>① 暂停该外包后续接单 ② 内部兜底方案 ③ 重评排期</td><td>APM + 制作人</td><td>外包质量复盘会</td></tr>
    <tr><td><strong>里程碑紧急变更</strong></td><td>发版日期提前 > 2 周</td><td>① 全量需求重新排序 ② 砍需求/加人决策 ③ 风险通报</td><td>制作人</td><td>版本复盘</td></tr>
    <tr><td><strong>系统工具故障</strong></td><td>TAPD/SVN 不可用 > 4h</td><td>① 切换到线下表格跟踪 ② 恢复后批量同步</td><td>APM</td><td>—</td></tr>
    <tr><td><strong>需求方向性推翻</strong></td><td>已制作 > 60% 但需全部重做</td><td>① 走紧急变更流程 ② 评估沉没成本 ③ 制作人决策是否继续</td><td>制作人 + 总监</td><td>必须复盘根因</td></tr>
    <tr><td><strong>P0 需求持续超标</strong></td><td>连续 2 周 P0 > 3 个</td><td>① 需求治理专项会 ② 强制复审所有 P0 ③ 建立临时审批机制</td><td>制作人</td><td>优先级治理报告</td></tr>
  </table>
  <div class="alert alert-red">🚨 <strong>应急原则</strong>：先止血再复盘。异常发生 2h 内必须有人牵头响应，24h 内出初步解决方案，1 周内完成根因分析和流程改进。</div>
</div>

<!-- ===== Section 15: 协作日历 ===== -->
<div class="section" id="s15">''')

# 11. 更新原 section 10 的 id
content = content.replace(
    '<div class="section" id="s10">\n  <h2>📅 10. 附录：跨部门协作日历</h2>',
    '<h2>📅 15. 附录：跨部门协作日历</h2>'
)

# 12. 更新工具链章节的编号
content = content.replace(
    '<h2>🔧 9. 工具链集成与自动化</h2>',
    '<h2>🔧 10. 工具链集成与自动化</h2>'
)

# 13. 更新数据度量章节编号
content = content.replace(
    '<h2>📊 8. 数据度量与持续改进</h2>',
    '<h2>📊 9. 数据度量与持续改进</h2>'
)

# 14. 更新常见冲突章节编号
content = content.replace(
    '<h2>🤯 7. 常见冲突场景与解法</h2>',
    '<h2>🤯 8. 常见冲突场景与解法</h2>'
)

# 15. 更新变更管控章节编号
content = content.replace(
    '<h2>🔒 6. 变更管控</h2>',
    '<h2>🔒 7. 变更管控</h2>'
)

# 16. 更新评审机制章节编号
content = content.replace(
    '<h2>🔍 5. 评审机制</h2>',
    '<h2>🔍 6. 评审机制</h2>'
)

# 17. 更新 SLA 章节编号
content = content.replace(
    '<h2>⏱️ 4. SLA 服务等级协议</h2>',
    '<h2>⏱️ 5. SLA 服务等级协议</h2>'
)

# 18. 更新 RACI 章节编号
content = content.replace(
    '<h2>👥 3. RACI 责任矩阵</h2>',
    '<h2>👥 4. RACI 责任矩阵</h2>'
)

# 19. 更新需求单章节编号
content = content.replace(
    '<h2>📝 2. 标准需求单模板</h2>',
    '<h2>📝 3. 标准需求单模板</h2>'
)

# 20. 新增需求描述结构化模板（在 2.5 评分卡后面追加）
old_score_end = '<div class="alert alert-green">💡 <strong>评分示例</strong>：一份需求单所有字段填满(25) + 三要素齐全(20) + 3张参考图有标注(22) + 4条验收标准(15) + 明确技术约束(15) = <strong>97分</strong> ✅ 通过</div>\n</div>'

new_score_end = '''<div class="alert alert-green">💡 <strong>评分示例</strong>：一份需求单所有字段填满(25) + 三要素齐全(20) + 3张参考图有标注(22) + 4条验收标准(15) + 明确技术约束(15) = <strong>97分</strong> ✅ 通过。系统同时输出改进建议帮助策划持续提升。</div>

  <div class="sub-title" id="s2-6">📋 3.6 需求描述结构化模板（v3.0 新增）</div>
  <p>所有需求描述必须按以下结构填写，确保信息完整、减少沟通歧义：</p>
  <pre>
【背景】为什么要做这个需求？它解决什么问题或服务什么玩法？
  - 所属系统/玩法模块：
  - 上下文说明：

【目标】最终要交付什么？达成什么效果？
  - 交付物清晰定义：
  - 期望视觉效果描述：
  - 目标用户/场景：

【约束】有哪些限制条件？
  - 技术约束（面数/贴图/帧数/格式）：
  - 风格约束（参考方向/必须/禁止）：
  - 时间约束（硬性 Deadline 及原因）：

【验收标准】怎样算完成？可量化检查条件：
  □ 条件 1：
  □ 条件 2：
  □ 条件 3：

【风险与依赖】
  - 已知风险：
  - 前置依赖：
  - 不确定项（标注 TBD-待评审确认）：
  </pre>
  <div class="alert alert-blue">💡 <strong>填写技巧</strong>：不确定的内容可标注"TBD-待评审确认"，但不能空着。评审时会针对 TBD 项逐一讨论确认。</div>
</div>'''
content = content.replace(old_score_end, new_score_end)

# 21. 更新 footer
content = content.replace(
    '📋 需求对接流转规范 v2.0 · 游戏美术项目管理知识库',
    '📋 需求对接流转规范 v3.0 · 游戏美术项目管理知识库'
)

# 22. 在常见冲突章节增加一个新案例
old_case5_end = '''      <p>1. 跨工种需求必须建立 <strong>需求链</strong>（Parent-Child 关联）<br>2. APM 指定一个 <strong>需求链 Owner</strong> 负责全链路协调<br>3. 上游工种完成后 <strong>自动触发下游启动通知</strong><br>4. 任何一环变更 <strong>自动通知全链路相关人</strong></p>
    </div>
  </div>
</div>'''

new_case5_end = '''      <p>1. 跨工种需求必须建立 <strong>需求链</strong>（Parent-Child 关联）<br>2. APM 指定一个 <strong>需求链 Owner</strong> 负责全链路协调<br>3. 上游工种完成后 <strong>自动触发下游启动通知</strong><br>4. 任何一环变更 <strong>自动通知全链路相关人</strong></p>
    </div>
  </div>

  <div class="faq-item">
    <div class="faq-q">🟡 案例 6：需求积压导致排期崩溃 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a">
      <p><strong>🎬 场景还原：</strong>Sprint 中间突然涌入大量 P0/P1 需求，现有排期被打乱，美术不知道先做哪个。</p>
      <p><strong>🔍 根因分析：</strong>缺乏产能容量模型；没有需求准入上限；优先级仲裁机制执行不力。</p>
      <p><strong>💡 系统性解决方案：</strong></p>
      <p>1. 建立 <strong>产能容量模型</strong>，过载自动预警并暂停接收新需求<br>2. 设置 <strong>Sprint 中期锁定线</strong>：Sprint 过半后仅接 P0<br>3. 制作人每周一 <strong>统一优先级排序</strong>，公示给全员<br>4. <strong>需求缓冲区</strong>：预留 20% 产能应对突发需求<br>5. 定期复盘 <strong>需求到达率</strong>和<strong>团队消化率</strong>的匹配度</p>
      <p><strong>📊 预期效果：</strong>排期稳定性从 60% 提升至 85%；Sprint 完成率从 70% 提升至 90%。</p>
    </div>
  </div>

  <div class="faq-item">
    <div class="faq-q">🟡 案例 7：美术做完策划不验收 <span class="badge badge-yellow">中频</span></div>
    <div class="faq-a">
      <p><strong>🎬 场景还原：</strong>美术按期交付了成果，但策划迟迟不验收，需求卡在"验收中"状态长达一周甚至更久。</p>
      <p><strong>🔍 根因分析：</strong>策划忙于其他工作忽略验收；验收 SLA 执行不严；缺少激励/惩罚机制。</p>
      <p><strong>💡 系统性解决方案：</strong></p>
      <p>1. <strong>验收 SLA 硬约束</strong>：超 3d 未反馈自动视为通过（已实施）<br>2. 验收任务纳入策划 <strong>每日待办 Top3</strong> 推送<br>3. 每周汇报 <strong>策划验收及时率</strong>排行榜<br>4. WIP CP3 检查时策划已参与，正式验收时无新信息 → 应快速决策</p>
      <p><strong>📊 预期效果：</strong>验收阶段平均耗时从 4d 降至 1.5d。</p>
    </div>
  </div>
</div>'''
content = content.replace(old_case5_end, new_case5_end)

# 23. 在数据度量章节追加"数据驱动决策案例"
old_pdca_end = '''    <tr><td><strong>每季度</strong></td><td>流程大复盘 + 规则迭代</td><td>制作人 + 全团队</td><td>规范版本更新</td></tr>
  </table>
</div>'''

new_pdca_end = '''    <tr><td><strong>每季度</strong></td><td>流程大复盘 + 规则迭代</td><td>制作人 + 全团队</td><td>规范版本更新</td></tr>
  </table>

  <div class="sub-title" id="s9-4">💡 9.4 数据驱动决策案例（v3.0 新增）</div>
  <p>以下是利用度量数据驱动流程改进的真实案例：</p>
  <div class="faq-item">
    <div class="faq-q">📊 案例 A：数据发现"某策划退回率 60%"</div>
    <div class="faq-a">
      <p><strong>数据信号：</strong>连续 3 周，张策划提交的需求单退回率高达 60%，远超团队平均 15%。</p>
      <p><strong>根因定位：</strong>参考图标注不足 + 验收标准模糊（两项合计扣分 > 30）。</p>
      <p><strong>改进动作：</strong>APM 安排 30min 一对一辅导 + 提供 3 份优秀需求单示例 + 前 3 份需求单由 APM 预审。</p>
      <p><strong>改进结果：</strong>2 周后退回率降至 10%，首次通过率提升至 80%。</p>
    </div>
  </div>
  <div class="faq-item">
    <div class="faq-q">📊 案例 B：数据发现"角色建模工期持续偏高"</div>
    <div class="faq-a">
      <p><strong>数据信号：</strong>角色建模实际工期 = 预估工期的 1.6 倍（团队平均 1.15 倍），连续 5 个需求均超期。</p>
      <p><strong>根因定位：</strong>预估模型中未包含"高模→低模拓扑"的工时；TA 审核环节平均等待 1.5d。</p>
      <p><strong>改进动作：</strong>① 更新工期估算基准（+30% 拓扑工时）② TA 审核从串行改为并行（建模 80% 时提前介入）。</p>
      <p><strong>改进结果：</strong>实际/预估比降至 1.1 倍；交付准时率从 40% 提升至 85%。</p>
    </div>
  </div>
</div>'''
content = content.replace(old_pdca_end, new_pdca_end)

# 写入文件
with open(html_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done: art-vs-planner-req.html upgraded to v3.0")
print("Changes:")
print("  - Version: v2.0 -> v3.0")
print("  - New sections: 11(需求池管理), 12(WIP检查点), 13(培训赋能), 14(应急预案)")
print("  - Enhanced: 依赖管理, SLA豁免, 快速通道, 结构化模板, 数据案例")
print("  - New cases: 案例6(排期崩溃), 案例7(不验收)")
print("  - New fields: 风险标注")
print("  - Total sections: 10 -> 15")
