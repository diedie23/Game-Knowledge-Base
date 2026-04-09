#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════
 *  Spine 角色拆分工具 v4.0 → v5.0 升级脚本
 *  自动修改 spine-split.html，注入以下功能：
 *
 *  【交互升级】
 *   1. 空格+拖拽平移画布 / 中键平移
 *   2. 以鼠标位置为中心的滚轮缩放
 *   3. 快捷键系统 (V/M/L/W/F + 提示栏)
 *
 *  【面板升级】
 *   4. 手风琴折叠面板
 *   5. 左右面板拖拽调宽
 *
 *  【部件列表升级】
 *   6. 拖拽排序 (Drag & Drop)
 *   7. 双击重命名
 *   8. 悬停高亮
 *
 *  【核心功能升级】
 *   9.  Spine JSON 数据直出 (skeleton.json)
 *   10. 智能镜像命名 (_L↔_R, 左↔右)
 *   11. 边缘羽化 (Feathering)
 *   12. 专业 Alpha Bleeding 算法
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'docs', 'knowledge-base', 'spine-split.html');
let html = fs.readFileSync(SRC, 'utf-8');
const origSize = Buffer.byteLength(html, 'utf-8');

console.log(`📖 读取源文件: ${SRC}`);
console.log(`   原始大小: ${(origSize/1024).toFixed(1)} KB`);

// ═══ 辅助函数 ═══
function replaceOnce(src, find, replace, label) {
  if (!src.includes(find)) {
    console.warn(`   ⚠️ 未找到替换目标: ${label}`);
    return src;
  }
  const idx = src.indexOf(find);
  console.log(`   ✅ ${label} (位置 ${idx})`);
  return src.slice(0, idx) + replace + src.slice(idx + find.length);
}

function insertBefore(src, anchor, content, label) {
  const idx = src.indexOf(anchor);
  if (idx < 0) { console.warn(`   ⚠️ 未找到锚点: ${label}`); return src; }
  console.log(`   ✅ ${label} (位置 ${idx})`);
  return src.slice(0, idx) + content + src.slice(idx);
}

function insertAfter(src, anchor, content, label) {
  const idx = src.indexOf(anchor);
  if (idx < 0) { console.warn(`   ⚠️ 未找到锚点: ${label}`); return src; }
  const endIdx = idx + anchor.length;
  console.log(`   ✅ ${label} (位置 ${endIdx})`);
  return src.slice(0, endIdx) + content + src.slice(endIdx);
}

// ═══════════════════════════════════════════════════════════
//  PATCH 1: 版本号升级 v4.0 → v5.0
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 1: 版本号升级');
html = replaceOnce(html, '<span class="ver">v4.0</span>', '<span class="ver">v5.0</span>', '标题版本号');
html = replaceOnce(html, '📖 v4.0：', '📖 v5.0：', '引导栏版本号');
html = replaceOnce(html,
  '① 导入原画 → ② 选择/自制模板 → ③ 📍三点锚点对齐（Alpha密度自适应）→ ④ 智能选区（泛洪+轮廓追踪）/ 套索 → ⑤ 🧲 Shrink-Wrap 吸附 → ⑥ 自动拆分导出',
  '① 导入原画 → ② 选择/自制模板 → ③ 📍三点对齐 → ④ 智能选区/套索(羽化) → ⑤ 🧲 Shrink-Wrap → ⑥ 导出(含 Spine JSON + Alpha Bleeding)',
  '引导栏流程文字');
html = replaceOnce(html,
  "// ═══ Spine 角色拆分工具 v3.1 — 真实套索 + Alpha Shrink v2 ═══",
  "// ═══ Spine 角色拆分工具 v5.0 — 工业级交互升级版 ═══",
  'JS 注释版本号');

// ═══════════════════════════════════════════════════════════
//  PATCH 2: CSS 注入 — 新增样式
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 2: 注入新 CSS 样式');

const newCSS = `
/* ═══ v5.0 新增样式 ═══ */

/* 快捷键提示栏 */
.shortcut-bar{padding:6px 16px;background:rgba(167,139,250,.04);border-bottom:1px solid rgba(167,139,250,.12);font-size:11px;color:var(--dim);flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.shortcut-bar .sc-item{display:inline-flex;align-items:center;gap:3px}
.kbd{display:inline-block;font-size:9px;padding:1px 4px;border-radius:3px;background:var(--bg);border:1px solid var(--border);color:var(--dim);font-family:monospace;margin-left:3px;vertical-align:middle;line-height:1.4}

/* 面板拖拽调宽 */
.panel-resize-handle{position:absolute;right:0;top:0;width:5px;height:100%;cursor:col-resize;z-index:50;background:transparent;transition:background .15s}
.panel-resize-handle:hover,.panel-resize-handle.active{background:var(--accent)}
.preview-panel .panel-resize-handle{left:0;right:auto}

/* 手风琴折叠 */
.panel-section-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;user-select:none;transition:background .15s}
.panel-section-header:hover{background:rgba(108,140,255,.04)}
.panel-section-toggle{font-size:10px;color:var(--dim);transition:transform .2s;display:inline-flex}
.panel-section.collapsed .panel-section-toggle{transform:rotate(-90deg)}
.panel-section.collapsed .panel-section-body{max-height:0!important;opacity:0;padding-top:0;padding-bottom:0;overflow:hidden}
.panel-section-body{padding:6px 16px 14px;transition:max-height .25s ease,opacity .2s,padding .2s}

/* 部件拖拽排序 */
.part-item.drag-over{border-color:var(--yellow);border-style:dashed}
.part-item.dragging{opacity:.4;transform:scale(.95)}
.part-item.hovered-highlight{box-shadow:0 0 0 2px var(--cyan),0 0 12px rgba(34,211,238,.3);transform:scale(1.01)}
.part-drag-handle{cursor:grab;color:var(--dim);font-size:10px;padding:0 4px;opacity:.4;transition:opacity .15s}
.part-drag-handle:hover{opacity:1}
.part-label-edit{flex:1;background:var(--bg);border:1px solid var(--accent);border-radius:3px;padding:1px 4px;color:var(--heading);font-size:12px;font-family:inherit;outline:none}

/* 画布平移状态 */
.canvas-viewport.panning{cursor:grab!important}
.canvas-viewport.panning-active{cursor:grabbing!important}

/* 左右面板可调宽度 */
.tool-panel{position:relative;min-width:200px;max-width:500px}
.preview-panel{position:relative;min-width:180px;max-width:450px}
`;

// 在 </style> 之前插入
html = insertBefore(html, '</style>', newCSS, '注入 v5.0 CSS');

// ═══════════════════════════════════════════════════════════
//  PATCH 3: HTML — 快捷键提示栏
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 3: 注入快捷键提示栏 HTML');

const shortcutBarHTML = `
<!-- ═══ v5.0 快捷键提示栏 ═══ -->
<div class="shortcut-bar" id="shortcutBar">
  <span class="sc-item"><kbd class="kbd">V</kbd> 选择</span>
  <span class="sc-item"><kbd class="kbd">M</kbd> 框选</span>
  <span class="sc-item"><kbd class="kbd">L</kbd> 套索</span>
  <span class="sc-item"><kbd class="kbd">W</kbd> 智能</span>
  <span class="sc-item"><kbd class="kbd">Space+拖拽</kbd> 平移</span>
  <span class="sc-item"><kbd class="kbd">滚轮</kbd> 缩放</span>
  <span class="sc-item"><kbd class="kbd">Ctrl+Z</kbd> 撤销</span>
  <span class="sc-item"><kbd class="kbd">F</kbd> 适应</span>
  <span class="sc-item"><kbd class="kbd">1-9</kbd> 部件</span>
  <span class="sc-item" style="margin-left:auto;cursor:pointer" onclick="document.getElementById('shortcutBar').style.display='none'">✕</span>
</div>
`;

html = insertBefore(html, '<!-- 锚点对齐步骤条 -->', shortcutBarHTML, '快捷键提示栏');

// ═══════════════════════════════════════════════════════════
//  PATCH 4: HTML — 面板手风琴 + resize handle + 羽化滑块 + 工具按键提示
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 4: 面板手风琴改造');

// 4a. 左面板添加 resize handle
html = insertAfter(html,
  '<div class="tool-panel">',
  '\n    <!-- v5.0 面板拖拽调宽手柄 -->\n    <div class="panel-resize-handle" id="leftResizeHandle"></div>',
  '左面板 resize handle');

// 4b. 给左面板加 id
html = replaceOnce(html,
  '<div class="tool-panel">',
  '<div class="tool-panel" id="toolPanel">',
  '左面板 id');

// 4c. 右面板添加 resize handle 和 id
html = replaceOnce(html,
  '<div class="preview-panel">',
  '<div class="preview-panel" id="previewPanel">\n    <div class="panel-resize-handle" id="rightResizeHandle"></div>',
  '右面板 resize handle + id');

// 4d. 将"绘制工具"面板改为手风琴 + 添加选择工具按钮 + 羽化滑块
html = replaceOnce(html,
  `    <div class="panel-section">
      <div class="panel-title">🔧 绘制工具</div>
      <div style="display:flex;gap:4px;margin-bottom:10px;">
        <button class="btn btn-sm" id="toolRect" onclick="setTool('rect')" style="flex:1;justify-content:center;border-color:var(--accent)">矩形框选</button>
        <button class="btn btn-sm" id="toolLasso" onclick="setTool('lasso')" style="flex:1;justify-content:center;">自由套索</button>
        <button class="btn btn-sm" id="toolAuto" onclick="setTool('auto')" style="flex:1;justify-content:center;">智能选区</button>
      </div>
      <div class="setting-row">
        <span class="setting-label">选区容差（智能）</span>
        <span class="setting-value" id="toleranceVal">32</span>
      </div>
      <input type="range" id="tolerance" min="1" max="128" value="32" oninput="document.getElementById('toleranceVal').textContent=this.value">
    </div>`,
  `    <div class="panel-section" id="sec-tools">
      <div class="panel-section-header" onclick="toggleSection('sec-tools')">
        <div class="panel-title">🔧 绘制工具</div><span class="panel-section-toggle">▼</span>
      </div>
      <div class="panel-section-body">
        <div style="display:flex;gap:4px;margin-bottom:10px;">
          <button class="btn btn-sm" id="toolSelect" onclick="setTool('select')" style="flex:1;justify-content:center;">选择<kbd class="kbd">V</kbd></button>
          <button class="btn btn-sm" id="toolRect" onclick="setTool('rect')" style="flex:1;justify-content:center;border-color:var(--accent)">框选<kbd class="kbd">M</kbd></button>
          <button class="btn btn-sm" id="toolLasso" onclick="setTool('lasso')" style="flex:1;justify-content:center;">套索<kbd class="kbd">L</kbd></button>
          <button class="btn btn-sm" id="toolAuto" onclick="setTool('auto')" style="flex:1;justify-content:center;">智能<kbd class="kbd">W</kbd></button>
        </div>
        <div class="setting-row">
          <span class="setting-label">选区容差（智能）</span>
          <span class="setting-value" id="toleranceVal">32</span>
        </div>
        <input type="range" id="tolerance" min="1" max="128" value="32" oninput="document.getElementById('toleranceVal').textContent=this.value">
        <div class="setting-row">
          <span class="setting-label">🌫️ 羽化半径</span>
          <span class="setting-value" id="featherVal">0px</span>
        </div>
        <input type="range" id="featherRadius" min="0" max="20" value="0" oninput="document.getElementById('featherVal').textContent=this.value+'px'">
      </div>
    </div>`,
  '绘制工具面板 → 手风琴 + 选择按钮 + 羽化');

// 4e. 部件列表面板改为手风琴
html = replaceOnce(html,
  `    <div class="panel-section">
      <div class="panel-title">🦴 部件列表</div>`,
  `    <div class="panel-section" id="sec-parts">
      <div class="panel-section-header" onclick="toggleSection('sec-parts')">
        <div class="panel-title">🦴 部件列表</div><span class="panel-section-toggle">▼</span>
      </div>
      <div class="panel-section-body">`,
  '部件列表面板 → 手风琴 header');

// 在部件面板的 shrink-wrap Alpha 滑块后面关闭 panel-section-body div
html = replaceOnce(html,
  `      <input type="range" id="swAlpha" min="1" max="128" value="10" oninput="document.getElementById('swAlphaVal').textContent=this.value">
    </div>

    <div class="panel-section">
      <div class="panel-title">⚙️ 拓补设置</div>`,
  `      <input type="range" id="swAlpha" min="1" max="128" value="10" oninput="document.getElementById('swAlphaVal').textContent=this.value">
      </div>
    </div>

    <div class="panel-section" id="sec-topology">
      <div class="panel-section-header" onclick="toggleSection('sec-topology')">
        <div class="panel-title">⚙️ 拓扑设置</div><span class="panel-section-toggle">▼</span>
      </div>
      <div class="panel-section-body">`,
  '部件面板关闭 + 拓扑面板手风琴');

// 拓扑面板内容包裹 + 添加 Alpha Bleeding 选项
html = replaceOnce(html,
  `        <option value="aware" selected>内容感知（推荐）</option>`,
  `        <option value="bleeding" selected>Alpha Bleeding（Spine 推荐）</option>
        <option value="aware">内容感知</option>`,
  '添加 Alpha Bleeding 填充选项');

// 关闭拓扑 section-body
html = replaceOnce(html,
  `      </select>
    </div>

    <div class="panel-section">
      <div class="panel-title">🏷️ 导出命名</div>`,
  `      </select>
      </div>
    </div>

    <div class="panel-section" id="sec-naming">
      <div class="panel-section-header" onclick="toggleSection('sec-naming')">
        <div class="panel-title">🏷️ 导出命名</div><span class="panel-section-toggle">▼</span>
      </div>
      <div class="panel-section-body">`,
  '拓扑关闭 + 导出命名手风琴');

// 关闭导出命名 section-body
html = replaceOnce(html,
  `      <div style="font-size:10px;color:var(--green);margin-top:2px" id="spNamingPreview">预览：MyGame_Hero01_头部.png</div>
    </div>

    <div class="panel-section" id="qaPanel" style="display:none">
      <div class="panel-title">🔍 质检报告</div>`,
  `      <div style="font-size:10px;color:var(--green);margin-top:2px" id="spNamingPreview">预览：MyGame_Hero01_头部.png</div>
      </div>
    </div>

    <div class="panel-section collapsed" id="sec-qa">
      <div class="panel-section-header" onclick="toggleSection('sec-qa')">
        <div class="panel-title">🔍 质检报告</div><span class="panel-section-toggle">▼</span>
      </div>
      <div class="panel-section-body">`,
  '导出命名关闭 + 质检面板手风琴');

// 质检面板关闭
html = replaceOnce(html,
  `      <div id="qaReport" style="font-size:11px;line-height:1.8;max-height:200px;overflow-y:auto"></div>
    </div>

    <div class="panel-section">
      <div class="panel-title">📊 统计</div>`,
  `      <div id="qaReport" style="font-size:11px;line-height:1.8;max-height:200px;overflow-y:auto"></div>
      </div>
    </div>

    <div class="panel-section" id="sec-stats">
      <div class="panel-section-header" onclick="toggleSection('sec-stats')">
        <div class="panel-title">📊 统计</div><span class="panel-section-toggle">▼</span>
      </div>
      <div class="panel-section-body">`,
  '质检关闭 + 统计面板手风琴');

// 统计面板关闭
html = replaceOnce(html,
  `      <div id="statsInfo" style="font-size:12px;color:var(--dim);line-height:2">
        请导入图片开始
      </div>
    </div>
  </div>`,
  `      <div id="statsInfo" style="font-size:12px;color:var(--dim);line-height:2">
        请导入图片开始
      </div>
      </div>
    </div>
  </div>`,
  '统计面板关闭');

// ═══════════════════════════════════════════════════════════
//  PATCH 5: canvas-viewport 改为支持绝对定位
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 5: 画布视口定位改造');

html = replaceOnce(html,
  `.canvas-viewport{flex:1;overflow:hidden;position:relative;background:linear-gradient(45deg,#1a1c28 25%,transparent 25%),linear-gradient(-45deg,#1a1c28 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1c28 75%),linear-gradient(-45deg,transparent 75%,#1a1c28 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0;display:flex;align-items:center;justify-content:center}
.canvas-container{position:relative;transform-origin:center}`,
  `.canvas-viewport{flex:1;overflow:hidden;position:relative;background:linear-gradient(45deg,#1a1c28 25%,transparent 25%),linear-gradient(-45deg,#1a1c28 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1c28 75%),linear-gradient(-45deg,transparent 75%,#1a1c28 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
.canvas-container{position:absolute;transform-origin:0 0}`,
  '画布容器定位 → 绝对定位 + origin 0 0');

// ═══════════════════════════════════════════════════════════
//  PATCH 6: 导出按钮文字
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 6: 导出按钮增加 Spine JSON 提示');
html = replaceOnce(html,
  `<button class="btn btn-green" onclick="doExport()" style="flex:1;justify-content:center">下载 ZIP</button>`,
  `<button class="btn btn-green" onclick="doExport()" style="flex:1;justify-content:center">下载 ZIP（含 Spine JSON）</button>`,
  '导出按钮文字');

// ═══════════════════════════════════════════════════════════
//  PATCH 7: JS — 注入 v5.0 全部新增 JS 模块
//  在 init() 之前插入所有新代码
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 7: 注入 v5.0 JavaScript 模块');

const v5JS = `

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 A：全局状态扩展
// ═══════════════════════════════════════════════════════════
S.isPanning = false;
S.spaceDown = false;
S.panX = 0;
S.panY = 0;
S.panStartX = 0;
S.panStartY = 0;
S.panStartPanX = 0;
S.panStartPanY = 0;
S.hoveredPartIdx = -1;
S.dragPartIdx = -1;
S.dragOverIdx = -1;

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 B：手风琴折叠
// ═══════════════════════════════════════════════════════════
function toggleSection(id) {
  const sec = document.getElementById(id);
  if (sec) sec.classList.toggle('collapsed');
}

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 C：面板宽度拖拽
// ═══════════════════════════════════════════════════════════
function setupPanelResize() {
  _setupResize('leftResizeHandle', 'toolPanel', 'left');
  _setupResize('rightResizeHandle', 'previewPanel', 'right');
}
function _setupResize(handleId, panelId, side) {
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  if (!handle || !panel) return;
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    e.preventDefault(); startX = e.clientX; startW = panel.offsetWidth;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(e2) {
      const dx = e2.clientX - startX;
      const newW = side === 'left' ? startW + dx : startW - dx;
      panel.style.width = Math.max(200, Math.min(500, newW)) + 'px';
    }
    function onUp() {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 D：智能镜像命名引擎
// ═══════════════════════════════════════════════════════════
function getMirrorName(name) {
  const rules = [
    [/_L$/i, s => s.replace(/_L$/i, m => m === '_L' ? '_R' : '_r')],
    [/_R$/i, s => s.replace(/_R$/i, m => m === '_R' ? '_L' : '_l')],
    [/_Left$/i, s => s.replace(/_Left$/i, '_Right')],
    [/_Right$/i, s => s.replace(/_Right$/i, '_Left')],
    [/Left$/i, s => s.replace(/Left$/i, 'Right')],
    [/Right$/i, s => s.replace(/Right$/i, 'Left')],
    [/左/, s => s.replace(/左/g, '右')],
    [/右/, s => s.replace(/右/g, '左')],
    [/^L_/i, s => s.replace(/^L_/i, 'R_')],
    [/^R_/i, s => s.replace(/^R_/i, 'L_')],
  ];
  for (const [pattern, replacer] of rules) {
    if (pattern.test(name)) return replacer(name);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 E：边缘羽化 (Feathering)
// ═══════════════════════════════════════════════════════════
function applyFeathering(canvas, radius) {
  if (radius <= 0) return canvas;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 构建 Alpha 距离场：对于 Alpha > 0 的像素，计算到最近透明像素的距离
  // 如果距离 < radius，进行 Alpha 渐变
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];

  // 找到边缘像素（有 Alpha 但相邻有透明的）
  const edgeDist = new Float32Array(w * h).fill(Infinity);
  const queue = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (alpha[idx] <= 0) { edgeDist[idx] = 0; continue; }
      // 检查 4-邻域
      let isEdge = false;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) isEdge = true;
      else {
        if (alpha[idx - 1] <= 0 || alpha[idx + 1] <= 0 || alpha[idx - w] <= 0 || alpha[idx + w] <= 0) isEdge = true;
      }
      if (isEdge) { edgeDist[idx] = 0.5; queue.push(idx); }
    }
  }

  // BFS 传播距离
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % w, y = (idx / w) | 0;
    const cd = edgeDist[idx];
    if (cd >= radius) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        const nd = cd + (dx && dy ? 1.414 : 1);
        if (nd < edgeDist[ni] && alpha[ni] > 0) {
          edgeDist[ni] = nd;
          queue.push(ni);
        }
      }
    }
  }

  // 应用羽化：按距离衰减 Alpha
  for (let i = 0; i < w * h; i++) {
    if (alpha[i] <= 0) continue;
    const d = edgeDist[i];
    if (d < radius) {
      const fade = d / radius; // 0 = 边缘 → 1 = 内部
      data[i * 4 + 3] = Math.round(alpha[i] * fade);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 F：专业 Alpha Bleeding（Spine 防黑边规范）
// ═══════════════════════════════════════════════════════════
/**
 * Alpha Bleeding：将边缘像素的 RGB 值向外扩展到透明区域，
 * 但保持 Alpha=0。这可以防止 Spine 双线性采样时产生黑边。
 *
 * 算法：迭代式扩散 —— 每轮将有 Alpha 像素的 RGB 复制到相邻的 Alpha=0 像素，
 * 新像素的 Alpha 设为 0（保持透明），重复 N 轮（N = expandPx）。
 */
function applyAlphaBleeding(data, w, h, iterations) {
  if (iterations <= 0) return;
  // 标记有效像素（Alpha > 0）
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > 0) filled[i] = 1;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newFills = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (filled[idx]) continue; // 已有颜色
        // 检查 4-邻域是否有 filled 像素
        let sumR = 0, sumG = 0, sumB = 0, cnt = 0;
        const neighbors = [
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1
        ];
        for (const ni of neighbors) {
          if (ni >= 0 && filled[ni]) {
            sumR += data[ni * 4];
            sumG += data[ni * 4 + 1];
            sumB += data[ni * 4 + 2];
            cnt++;
          }
        }
        if (cnt > 0) {
          newFills.push({ idx, r: Math.round(sumR / cnt), g: Math.round(sumG / cnt), b: Math.round(sumB / cnt) });
        }
      }
    }
    // 应用新填充（RGB 扩展，Alpha 保持 0）
    for (const f of newFills) {
      data[f.idx * 4] = f.r;
      data[f.idx * 4 + 1] = f.g;
      data[f.idx * 4 + 2] = f.b;
      // Alpha 保持为 0 —— 这是 Alpha Bleeding 的核心：
      // RGB 有值但 Alpha=0，双线性采样不会拾取黑色
      data[f.idx * 4 + 3] = 0;
      filled[f.idx] = 1;
    }
    if (newFills.length === 0) break; // 已无可扩展
  }
}

// ═══════════════════════════════════════════════════════════
//  §v5.0 模块 G：Spine JSON 数据直出
// ═══════════════════════════════════════════════════════════
/**
 * 生成符合 Spine 4.x 标准的 skeleton.json
 *
 * 坐标映射原理：
 * - Spine 坐标系原点在画布左下角，Y 轴朝上
 * - 每个 attachment 的 (x, y) 是其中心相对于 root bone 的偏移
 * - root bone 默认在原图底部中心 (imgW/2, 0)
 * - 因此：spineX = partCenterX - imgW/2
 *         spineY = imgH - partCenterY（Y轴翻转）
 */
function generateSpineJSON(exportParts, trimmedParts) {
  const imgCX = S.imgW / 2;

  // 构建 skeleton 基础结构
  const skeleton = {
    skeleton: {
      hash: '',
      spine: '4.1',
      x: 0, y: 0,
      width: S.imgW,
      height: S.imgH,
      images: './',
      audio: ''
    },
    bones: [
      { name: 'root' }
    ],
    slots: [],
    skins: [
      {
        name: 'default',
        attachments: {}
      }
    ],
    animations: {
      idle: {}
    }
  };

  const skin = skeleton.skins[0].attachments;

  exportParts.forEach((p, i) => {
    const t = trimmedParts[i];
    const slotName = p.name;
    const attachmentName = p.name;

    // 添加 slot（渲染顺序 = 部件列表顺序）
    skeleton.slots.push({
      name: slotName,
      bone: 'root',
      attachment: attachmentName
    });

    // 计算裁剪后部件在原图上的实际中心坐标
    const partCX = p.split.x + t.trimOffX + t.trimW / 2;
    const partCY = p.split.y + t.trimOffY + t.trimH / 2;

    // Spine 坐标系转换
    const spineX = Math.round((partCX - imgCX) * 100) / 100;
    const spineY = Math.round((S.imgH - partCY) * 100) / 100;

    // 构建 skin attachment
    skin[slotName] = {};
    skin[slotName][attachmentName] = {
      type: 'region',
      x: spineX,
      y: spineY,
      width: t.trimW,
      height: t.trimH,
      // 额外元数据（Spine 编辑器会忽略但方便调试）
      _source: {
        originalX: p.split.originX,
        originalY: p.split.originY,
        originalW: p.split.originW,
        originalH: p.split.originH,
        trimX: t.trimOffX,
        trimY: t.trimOffY
      }
    };
  });

  return skeleton;
}

`;

// 在 init() 函数定义之前插入
html = insertBefore(html, 'function init(){', v5JS, '注入 v5.0 JS 模块');

// ═══════════════════════════════════════════════════════════
//  PATCH 8: 重写 init() 以初始化新模块
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 8: 扩展 init() 函数');

html = replaceOnce(html,
  `function init(){
  baseCanvas=document.getElementById('baseCanvas');regionCanvas=document.getElementById('regionCanvas');cursorCanvas=document.getElementById('cursorCanvas');
  baseCtx=baseCanvas.getContext('2d');regionCtx=regionCanvas.getContext('2d');cursorCtx=cursorCanvas.getContext('2d');
  buildPartGrid();setTool('rect');selectPart(0);setupEvents();setupTplMaker();
  // 蚂蚁线动画循环（套索+矩形均需动画刷新）
  (function animateAnts(){requestAnimationFrame(animateAnts);
    const hasRegion=parts.some(p=>p.region);
    if(hasRegion&&S.loaded&&!S.drawing)render();
  })();
}`,
  `function init(){
  baseCanvas=document.getElementById('baseCanvas');regionCanvas=document.getElementById('regionCanvas');cursorCanvas=document.getElementById('cursorCanvas');
  baseCtx=baseCanvas.getContext('2d');regionCtx=regionCanvas.getContext('2d');cursorCtx=cursorCanvas.getContext('2d');
  buildPartGrid();setTool('rect');selectPart(0);setupEvents();setupTplMaker();
  // v5.0 初始化
  setupPanelResize();
  setupKeyboardV5();
  // 蚂蚁线动画循环
  (function animateAnts(){requestAnimationFrame(animateAnts);
    const hasRegion=parts.some(p=>p.region);
    if(hasRegion&&S.loaded&&!S.drawing)render();
  })();
}`,
  '扩展 init()');

// ═══════════════════════════════════════════════════════════
//  PATCH 9: 画布交互重写 — 平移 + 以鼠标为中心缩放
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 9: 画布交互重写');

// 9a. 重写 getCanvasPos（从基于 canvas rect 改为基于 pan+zoom 的数学变换）
html = replaceOnce(html,
  `function getCanvasPos(e){const r=regionCanvas.getBoundingClientRect();return{x:Math.round((e.clientX-r.left)/S.zoom),y:Math.round((e.clientY-r.top)/S.zoom)};}`,
  `function getCanvasPos(e){
  const vp=document.getElementById('viewport'),vpR=vp.getBoundingClientRect();
  const mx=e.clientX-vpR.left,my=e.clientY-vpR.top;
  return{x:Math.round((mx-S.panX)/S.zoom),y:Math.round((my-S.panY)/S.zoom),mx,my};
}`,
  '重写 getCanvasPos');

// 9b. 重写 applyTransform（使用 translate + scale）
html = replaceOnce(html,
  `function applyTransform(){document.getElementById('canvasContainer').style.transform=\`scale(\${S.zoom})\`;}`,
  `function applyTransform(){document.getElementById('canvasContainer').style.transform=\`translate(\${S.panX}px,\${S.panY}px) scale(\${S.zoom})\`;}`,
  '重写 applyTransform');

// 9c. 重写 zoomIn/zoomOut/resetZoom 以支持居中缩放
html = replaceOnce(html,
  `function zoomIn(){S.zoom=Math.min(10,S.zoom*1.25);applyTransform();updateCanvasInfo();}
function zoomOut(){S.zoom=Math.max(0.1,S.zoom/1.25);applyTransform();updateCanvasInfo();}
function resetZoom(){if(!S.loaded)return;const v=document.getElementById('viewport');S.zoom=Math.min((v.clientWidth-40)/S.imgW,(v.clientHeight-40)/S.imgH,4);applyTransform();updateCanvasInfo();}`,
  `function zoomAtPoint(mx,my,factor){
  const oldZ=S.zoom,newZ=Math.max(0.05,Math.min(20,oldZ*factor));
  S.panX=mx-(mx-S.panX)*(newZ/oldZ);
  S.panY=my-(my-S.panY)*(newZ/oldZ);
  S.zoom=newZ;applyTransform();updateCanvasInfo();
}
function zoomIn(){const vp=document.getElementById('viewport'),r=vp.getBoundingClientRect();zoomAtPoint(r.width/2,r.height/2,1.25);}
function zoomOut(){const vp=document.getElementById('viewport'),r=vp.getBoundingClientRect();zoomAtPoint(r.width/2,r.height/2,1/1.25);}
function resetZoom(){if(!S.loaded)return;const vp=document.getElementById('viewport');
  S.zoom=Math.min((vp.clientWidth-40)/S.imgW,(vp.clientHeight-40)/S.imgH,4);
  S.panX=(vp.clientWidth-S.imgW*S.zoom)/2;S.panY=(vp.clientHeight-S.imgH*S.zoom)/2;
  applyTransform();updateCanvasInfo();}`,
  '重写 zoom 函数系');

// 9d. 在 setupEvents 中注入空格平移 + 鼠标滚轮中心缩放
// 替换 mousedown 中的入口
html = replaceOnce(html,
  `  vp.addEventListener('mousedown',e=>{if(!S.loaded||e.button!==0)return;const pos=getCanvasPos(e);`,
  `  vp.addEventListener('mousedown',e=>{if(!S.loaded)return;
    // v5.0 空格+左键/中键 = 平移画布
    if((S.spaceDown&&e.button===0)||e.button===1){
      S.isPanning=true;S.panStartX=e.clientX;S.panStartY=e.clientY;
      S.panStartPanX=S.panX;S.panStartPanY=S.panY;
      vp.classList.add('panning-active');e.preventDefault();return;
    }
    if(e.button!==0)return;
    if(S.tool==='select')return;
    const pos=getCanvasPos(e);`,
  '注入平移启动逻辑');

// 在 mousemove 中注入平移逻辑
html = replaceOnce(html,
  `  vp.addEventListener('mousemove',e=>{if(!S.loaded)return;const pos=getCanvasPos(e);drawCursor(pos.x,pos.y);`,
  `  vp.addEventListener('mousemove',e=>{if(!S.loaded)return;
    // v5.0 平移中
    if(S.isPanning){S.panX=S.panStartPanX+(e.clientX-S.panStartX);S.panY=S.panStartPanY+(e.clientY-S.panStartY);applyTransform();return;}
    const pos=getCanvasPos(e);drawCursor(pos.x,pos.y);`,
  '注入平移更新逻辑');

// 在 mouseup 中注入平移结束
html = replaceOnce(html,
  `  vp.addEventListener('mouseup',e=>{if(!S.drawing)return;const pos=getCanvasPos(e);S.drawing=false;`,
  `  vp.addEventListener('mouseup',e=>{
    if(S.isPanning){S.isPanning=false;vp.classList.remove('panning-active');return;}
    if(!S.drawing)return;const pos=getCanvasPos(e);S.drawing=false;`,
  '注入平移结束逻辑');

// 替换滚轮事件为以鼠标为中心缩放
html = replaceOnce(html,
  `  vp.addEventListener('wheel',e=>{e.preventDefault();if(e.deltaY<0)zoomIn();else zoomOut();},{passive:false});`,
  `  vp.addEventListener('wheel',e=>{if(!S.loaded)return;e.preventDefault();
    const vpR=vp.getBoundingClientRect();const mx=e.clientX-vpR.left,my=e.clientY-vpR.top;
    zoomAtPoint(mx,my,e.deltaY<0?1.15:1/1.15);},{passive:false});`,
  '重写滚轮缩放');

// ═══════════════════════════════════════════════════════════
//  PATCH 10: 快捷键系统（V/M/L/W/F）
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 10: 快捷键系统');

html = replaceOnce(html,
  `  document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
    switch(e.key){case'1':case'2':case'3':case'4':case'5':case'6':case'7':const idx=parseInt(e.key)-1;if(idx<parts.length)selectPart(idx);break;
    case'r':case'R':setTool('rect');break;case'l':case'L':setTool('lasso');break;case'a':case'A':if(!e.ctrlKey)setTool('auto');break;
    case'z':case'Z':if(e.ctrlKey||e.metaKey){e.preventDefault();undoRegion();}break;case'=':case'+':e.preventDefault();zoomIn();break;case'-':e.preventDefault();zoomOut();break;case'Escape':if(S.anchorMode)cancelAnchorAlign();break;}});`,
  `  // v5.0 键盘事件已移至 setupKeyboardV5() — 保留此处兼容性空壳
  document.addEventListener('keydown',function(){});`,
  '移除旧快捷键（新的在 setupKeyboardV5 中）');

// 注入新的快捷键系统函数
const keyboardV5 = `
// ═══ v5.0 全局快捷键系统 ═══
function setupKeyboardV5(){
  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
    // 空格键 → 平移模式
    if(e.code==='Space'&&!S.spaceDown){
      S.spaceDown=true;
      document.getElementById('viewport').classList.add('panning');
      e.preventDefault();return;
    }
    const k=e.key.toLowerCase();
    switch(k){
      case'v':setTool('select');break;
      case'm':setTool('rect');break;
      case'l':if(!e.ctrlKey)setTool('lasso');break;
      case'w':if(!e.ctrlKey)setTool('auto');break;
      case'f':resetZoom();break;
      case'z':if(e.ctrlKey||e.metaKey){e.preventDefault();undoRegion();}break;
      case'=':case'+':e.preventDefault();zoomIn();break;
      case'-':e.preventDefault();zoomOut();break;
      case'escape':if(S.anchorMode)cancelAnchorAlign();break;
      case'delete':case'backspace':if(S.multiSelect.size>0)removeSelectedParts();break;
      default:
        if(k>='1'&&k<='9'){const idx=parseInt(k)-1;if(idx<parts.length)selectPart(idx);}
    }
  });
  document.addEventListener('keyup',e=>{
    if(e.code==='Space'){
      S.spaceDown=false;S.isPanning=false;
      const vp=document.getElementById('viewport');
      vp.classList.remove('panning');vp.classList.remove('panning-active');
    }
  });
}
`;

html = insertBefore(html, 'function init(){', keyboardV5, '注入快捷键系统');

// ═══════════════════════════════════════════════════════════
//  PATCH 11: 重写 setTool 支持 'select'
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 11: 重写 setTool');

html = replaceOnce(html,
  `function setTool(t){S.tool=t;document.querySelectorAll('[id^=tool]').forEach(b=>{b.style.borderColor=b.id==='tool'+t.charAt(0).toUpperCase()+t.slice(1)?'var(--accent)':'';});}`,
  `function setTool(t){S.tool=t;
  const map={select:'toolSelect',rect:'toolRect',lasso:'toolLasso',auto:'toolAuto'};
  Object.values(map).forEach(id=>{const el=document.getElementById(id);if(el)el.style.borderColor='';});
  const act=document.getElementById(map[t]);if(act)act.style.borderColor='var(--accent)';
}`,
  '重写 setTool');

// ═══════════════════════════════════════════════════════════
//  PATCH 12: 重写 buildPartGrid 支持拖拽排序 + 悬停 + 双击
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 12: 重写 buildPartGrid');

html = replaceOnce(html,
  `function buildPartGrid(){
  const g=document.getElementById('partGrid');
  g.innerHTML=parts.map((p,i)=>{
    const cls=['part-item'];if(i===S.currentPart)cls.push('active');if(p.region)cls.push('completed');if(S.multiSelect.has(i))cls.push('selected');
    const mt=p.mirror?\`<span class="mirror-tag">↔\${p.mirror}</span>\`:'';
    return \`<div class="\${cls.join(' ')}" onclick="handlePartClick(event,\${i})"><input type="checkbox" class="part-check" \${S.multiSelect.has(i)?'checked':''} onclick="event.stopPropagation();toggleMS(\${i})"><span class="part-dot" style="background:\${p.color}"></span><span class="part-label">\${p.name}\${mt}</span><span class="part-status \${p.region?'done':''}">\${p.region?'✓':'—'}</span></div>\`;
  }).join('');
}`,
  `function buildPartGrid(){
  const g=document.getElementById('partGrid');
  g.innerHTML=parts.map((p,i)=>{
    const cls=['part-item'];
    if(i===S.currentPart)cls.push('active');
    if(p.region)cls.push('completed');
    if(S.multiSelect.has(i))cls.push('selected');
    if(i===S.hoveredPartIdx)cls.push('hovered-highlight');
    if(i===S.dragOverIdx)cls.push('drag-over');
    if(i===S.dragPartIdx)cls.push('dragging');
    const mt=p.mirror?\`<span class="mirror-tag">↔\${p.mirror}</span>\`:'';
    return \`<div class="\${cls.join(' ')}" data-idx="\${i}" draggable="true"
      onclick="handlePartClick(event,\${i})"
      ondragstart="onPartDragStart(event,\${i})"
      ondragover="onPartDragOver(event,\${i})"
      ondragleave="onPartDragLeave(event,\${i})"
      ondrop="onPartDrop(event,\${i})"
      ondragend="onPartDragEnd()"
      onmouseenter="onPartHover(\${i})"
      onmouseleave="onPartLeave()"
      ondblclick="onPartDblClick(event,\${i})">
      <span class="part-drag-handle" title="拖拽排序">⠿</span>
      <input type="checkbox" class="part-check" \${S.multiSelect.has(i)?'checked':''} onclick="event.stopPropagation();toggleMS(\${i})">
      <span class="part-dot" style="background:\${p.color}"></span>
      <span class="part-label" id="partLabel_\${i}">\${p.name}\${mt}</span>
      <span class="part-status \${p.region?'done':''}">\${p.region?'✓':'—'}</span>
    </div>\`;
  }).join('');
}
// ── v5.0 拖拽排序 ──
function onPartDragStart(e,idx){S.dragPartIdx=idx;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',idx);setTimeout(()=>buildPartGrid(),0);}
function onPartDragOver(e,idx){e.preventDefault();e.dataTransfer.dropEffect='move';if(S.dragOverIdx!==idx){S.dragOverIdx=idx;buildPartGrid();}}
function onPartDragLeave(e,idx){if(S.dragOverIdx===idx){S.dragOverIdx=-1;buildPartGrid();}}
function onPartDrop(e,targetIdx){e.preventDefault();const srcIdx=S.dragPartIdx;if(srcIdx<0||srcIdx===targetIdx)return;
  const[moved]=parts.splice(srcIdx,1);parts.splice(targetIdx,0,moved);
  if(S.currentPart===srcIdx)S.currentPart=targetIdx;
  else if(srcIdx<S.currentPart&&targetIdx>=S.currentPart)S.currentPart--;
  else if(srcIdx>S.currentPart&&targetIdx<=S.currentPart)S.currentPart++;
  S.dragPartIdx=-1;S.dragOverIdx=-1;buildPartGrid();render();showToast('已移动「'+moved.name+'」');}
function onPartDragEnd(){S.dragPartIdx=-1;S.dragOverIdx=-1;buildPartGrid();}
// ── v5.0 双击重命名 ──
function onPartDblClick(e,idx){e.stopPropagation();
  const el=document.getElementById('partLabel_'+idx);if(!el)return;
  const oldName=parts[idx].name;
  const input=document.createElement('input');input.type='text';input.className='part-label-edit';input.value=oldName;
  el.replaceWith(input);input.focus();input.select();
  function commit(){const nn=input.value.trim()||oldName;
    if(nn!==oldName)parts.forEach(p=>{if(p.mirror===oldName)p.mirror=nn;});
    parts[idx].name=nn;buildPartGrid();render();}
  input.addEventListener('blur',commit);
  input.addEventListener('keydown',e2=>{if(e2.key==='Enter'){e2.preventDefault();input.blur();}if(e2.key==='Escape'){input.value=oldName;input.blur();}});
}
// ── v5.0 悬停高亮 ──
function onPartHover(idx){S.hoveredPartIdx=idx;buildPartGrid();render();}
function onPartLeave(){S.hoveredPartIdx=-1;buildPartGrid();render();}`,
  '重写 buildPartGrid + 拖拽/重命名/悬停');

// ═══════════════════════════════════════════════════════════
//  PATCH 13: 增强 mirrorSelected 支持智能命名
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 13: 智能镜像命名');

html = replaceOnce(html,
  `function mirrorSelected(){
  if(!S.loaded){showToastImport('请先导入图片');return;}
  const idxs=S.multiSelect.size>0?[...S.multiSelect]:[S.currentPart];let cnt=0;
  idxs.forEach(idx=>{const p=parts[idx];if(!p.region||!p.mirror)return;
    const mi=parts.findIndex(q=>q.name===p.mirror);if(mi<0)return;
    const r=p.region,cx=S.imgW/2,newX=Math.round(2*cx-r.x-r.w);
    parts[mi].region={x:Math.max(0,newX),y:r.y,w:r.w,h:r.h};parts[mi].split=null;
    if(document.getElementById('edgeSnap').checked)parts[mi].region=shrinkToAlpha(parts[mi].region);cnt++;});
  if(cnt>0){buildPartGrid();render();updatePartPreview();updateStats();showToast(\`已镜像 \${cnt} 个部件\`);}
  else showToast('选中部件没有对称关系');
}`,
  `function mirrorSelected(){
  if(!S.loaded){showToastImport('请先导入图片');return;}
  const idxs=S.multiSelect.size>0?[...S.multiSelect]:[S.currentPart];let cnt=0;
  idxs.forEach(idx=>{const p=parts[idx];if(!p.region)return;
    // v5.0 智能镜像：优先使用声明的 mirror，否则自动推断
    let mirrorName=p.mirror;
    if(!mirrorName){mirrorName=getMirrorName(p.name);if(!mirrorName)return;}
    let mi=parts.findIndex(q=>q.name===mirrorName);
    // 自动创建不存在的镜像部件
    if(mi<0){parts.push({name:mirrorName,color:mColors[parts.length%mColors.length],region:null,split:null,mirror:p.name});mi=parts.length-1;p.mirror=mirrorName;}
    const r=p.region,cx=S.imgW/2;
    if(r.lasso&&r.lasso.length>2){
      // 镜像不规则选区
      const ml=r.lasso.map(pt=>({x:Math.round(2*cx-pt.x),y:pt.y})).reverse();
      const xs=ml.map(p2=>p2.x),ys=ml.map(p2=>p2.y);
      parts[mi].region={x:Math.max(0,Math.min(...xs)),y:Math.max(0,Math.min(...ys)),w:Math.max(...xs)-Math.max(0,Math.min(...xs)),h:Math.max(...ys)-Math.max(0,Math.min(...ys)),lasso:ml};
    }else{
      const newX=Math.round(2*cx-r.x-r.w);
      parts[mi].region={x:Math.max(0,newX),y:r.y,w:r.w,h:r.h};
      if(document.getElementById('edgeSnap').checked)parts[mi].region=shrinkToAlpha(parts[mi].region);
    }
    parts[mi].split=null;parts[mi].mirror=p.name;cnt++;});
  if(cnt>0){buildPartGrid();render();updatePartPreview();updateStats();showToast(\`已镜像 \${cnt} 个部件\`);}
  else showToast('选中部件无对称关系（尝试命名含 左/右、_L/_R）');
}`,
  '智能镜像重写');

// ═══════════════════════════════════════════════════════════
//  PATCH 14: 在 autoSplitAll 中集成 Alpha Bleeding + 羽化
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 14: Alpha Bleeding + 羽化集成');

// 替换拓扑填充函数，增加 bleeding 模式
html = replaceOnce(html,
  `function applyTopologyFill(data,w,h,ox,oy,ow,oh,expand,mode){for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>=ox&&x<ox+ow&&y>=oy&&y<oy+oh)continue;const idx=(y*w+x)*4;`,
  `function applyTopologyFill(data,w,h,ox,oy,ow,oh,expand,mode){
  // v5.0 Alpha Bleeding 模式
  if(mode==='bleeding'){applyAlphaBleeding(data,w,h,expand);return;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>=ox&&x<ox+ow&&y>=oy&&y<oy+oh)continue;const idx=(y*w+x)*4;`,
  'Alpha Bleeding 模式注入');

// 在 autoSplitAll 的裁剪后、split 赋值前注入羽化
html = replaceOnce(html,
  `      // 6. Alpha Shrink v2：剔除四周全透明像素
      const trimResult=trimTransparentPixels(pc);
      const finalCanvas=trimResult.canvas;`,
  `      // 6. 边缘羽化（v5.0）
      const featherR=parseInt(document.getElementById('featherRadius').value)||0;
      if(featherR>0)applyFeathering(pc,featherR);
      // 7. Alpha Bleeding（v5.0）
      if(expand>0&&document.getElementById('fillMode').value==='bleeding'){
        const fbData=pc.getContext('2d').getImageData(0,0,ew,eh);
        applyAlphaBleeding(fbData.data,ew,eh,expand);
        pc.getContext('2d').putImageData(fbData,0,0);
      }
      // 8. Alpha Shrink v2：剔除四周全透明像素
      const trimResult=trimTransparentPixels(pc);
      const finalCanvas=trimResult.canvas;`,
  '多边形裁剪路径集成羽化+bleeding');

// 矩形裁剪路径也加羽化
html = replaceOnce(html,
  `      if(expand>0){const d=pCtx.getImageData(0,0,ew,eh);applyTopologyFill(d.data,ew,eh,r.x-ex,r.y-ey,r.w,r.h,expand,fm);pCtx.putImageData(d,0,0);}
      // Alpha Shrink v2：矩形裁剪也剔除全透明像素`,
  `      // v5.0 边缘羽化
      const featherR2=parseInt(document.getElementById('featherRadius').value)||0;
      if(expand>0){const d=pCtx.getImageData(0,0,ew,eh);applyTopologyFill(d.data,ew,eh,r.x-ex,r.y-ey,r.w,r.h,expand,fm);pCtx.putImageData(d,0,0);}
      if(featherR2>0)applyFeathering(pc,featherR2);
      // Alpha Shrink v2：矩形裁剪也剔除全透明像素`,
  '矩形裁剪路径集成羽化');

// ═══════════════════════════════════════════════════════════
//  PATCH 15: 导出增强 — Spine JSON 直出 (skeleton.json)
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 15: Spine JSON 导出');

// 替换导出逻辑中的简易 spine_data.json 为专业版
html = replaceOnce(html,
  `  // ═══ v4.0 增强版 spine_data.json：含 Pivot 偏移 ═══
  const imgCX=S.imgW/2, imgCY=S.imgH/2;
  const spineJson={
    skeleton:{spine:"v4",width:S.imgW,height:S.imgH},
    bones:[{name:"root"}],
    slots:sp.map(p=>({name:p.name,bone:"root",attachment:p.name})),
    skins:[{name:"default",attachments:Object.fromEntries(sp.map((p,i)=>{
      const t=trimmedParts[i];
      // 裁剪后部件在原图坐标系中的真实中心
      const partCX=p.split.originX+t.trimOffX+t.trimW/2;
      const partCY=p.split.originY+t.trimOffY+t.trimH/2;
      // Spine 坐标：x=相对原图中心的水平偏移，y=相对原图中心的垂直偏移（Y轴翻转）
      const pivotX=Math.round((partCX-imgCX)*100)/100;
      const pivotY=Math.round((imgCY-partCY)*100)/100;
      return[p.name,{[p.name]:{
        x:pivotX,
        y:pivotY,
        width:t.trimW,
        height:t.trimH,
        // 原始（未裁剪）尺寸，用于 Spine 内对齐参考
        orig_width:p.split.originW,
        orig_height:p.split.originH,
        // 裁剪偏移量（左上角裁去了多少像素）
        trim_x:t.trimOffX,
        trim_y:t.trimOffY
      }}];
    }))}]
  };
  folder.file('spine_data.json',JSON.stringify(spineJson,null,2));`,
  `  // ═══ v5.0 Spine JSON 数据直出（符合 Spine 4.x skeleton.json 标准）═══
  const spineJson=generateSpineJSON(sp,trimmedParts);
  folder.file('skeleton.json',JSON.stringify(spineJson,null,2));

  // 同时保留向下兼容的 spine_data.json
  const imgCX=S.imgW/2, imgCY=S.imgH/2;
  const legacySpine={skeleton:{spine:"v4",width:S.imgW,height:S.imgH},
    bones:[{name:"root"}],
    slots:sp.map(p=>({name:p.name,bone:"root",attachment:p.name})),
    skins:[{name:"default",attachments:Object.fromEntries(sp.map((p,i)=>{
      const t=trimmedParts[i];
      const partCX=p.split.originX+t.trimOffX+t.trimW/2;
      const partCY=p.split.originY+t.trimOffY+t.trimH/2;
      return[p.name,{[p.name]:{x:Math.round((partCX-imgCX)*100)/100,y:Math.round((imgCY-partCY)*100)/100,width:t.trimW,height:t.trimH}}];
    }))}]};
  folder.file('spine_data.json',JSON.stringify(legacySpine,null,2));`,
  'Spine JSON 导出增强');

// 更新导出提示文字
html = replaceOnce(html,
  `├── parts_config.json\n└── spine_data.json`,
  `├── parts_config.json\n├── skeleton.json (Spine 4.x 标准格式)\n└── spine_data.json (兼容格式)`,
  '导出预览文件列表');

// 更新 config format 标识
html = replaceOnce(html,
  `format:'spine_split_v4',version:'4.0',`,
  `format:'spine_split_v5',version:'5.0',`,
  'config 格式版本');

// ═══════════════════════════════════════════════════════════
//  PATCH 16: 渲染增强 — 悬停高亮 glow 效果
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 16: 渲染悬停高亮');

// 在部件渲染中注入 isHovered 变量
html = replaceOnce(html,
  `    parts.forEach((p,i)=>{if(!p.region)return;const r=p.region;
    const isCurrent=i===S.currentPart;
    const hasLasso=r.lasso&&r.lasso.length>2;`,
  `    parts.forEach((p,i)=>{if(!p.region)return;const r=p.region;
    const isCurrent=i===S.currentPart;
    const isHovered=i===S.hoveredPartIdx; // v5.0 悬停高亮
    const hasLasso=r.lasso&&r.lasso.length>2;`,
  '注入 isHovered 变量');

// 增强悬停时的填充透明度
html = replaceOnce(html,
  `      buildLP();regionCtx.fillStyle=hexToRgba(p.color,isCurrent?0.12:0.06);regionCtx.fill();`,
  `      buildLP();regionCtx.fillStyle=hexToRgba(p.color,isCurrent?0.12:isHovered?0.20:0.06);regionCtx.fill();`,
  '套索区域悬停高亮填充');

html = replaceOnce(html,
  `      regionCtx.fillStyle=hexToRgba(p.color,isCurrent?0.12:0.06);regionCtx.fillRect(r.x,r.y,r.w,r.h);`,
  `      regionCtx.fillStyle=hexToRgba(p.color,isCurrent?0.12:isHovered?0.20:0.06);regionCtx.fillRect(r.x,r.y,r.w,r.h);`,
  '矩形区域悬停高亮填充');

// ═══════════════════════════════════════════════════════════
//  PATCH 17: 质检面板改用新 ID
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 17: 质检面板适配');

html = replaceOnce(html,
  `const panel=document.getElementById('qaPanel');panel.style.display='block';`,
  `const panel=document.getElementById('sec-qa');if(panel.classList.contains('collapsed'))panel.classList.remove('collapsed');`,
  '质检面板展开逻辑');

// ═══════════════════════════════════════════════════════════
//  PATCH 18: 工程恢复兼容 v5.0 format
// ═══════════════════════════════════════════════════════════
console.log('\n🔧 PATCH 18: 工程恢复兼容');

html = replaceOnce(html,
  `if(!config.format||config.format!=='spine_split_v3')`,
  `if(!config.format||!config.format.startsWith('spine_split_v'))`,
  '工程恢复格式兼容');

// ═══════════════════════════════════════════════════════════
//  完成
// ═══════════════════════════════════════════════════════════
fs.writeFileSync(SRC, html, 'utf-8');
const newSize = Buffer.byteLength(html, 'utf-8');

console.log('\n═══════════════════════════════════════════════');
console.log(`✅ 升级完成! v4.0 → v5.0`);
console.log(`   原始大小: ${(origSize/1024).toFixed(1)} KB`);
console.log(`   升级后:   ${(newSize/1024).toFixed(1)} KB (+${((newSize-origSize)/1024).toFixed(1)} KB)`);
console.log('═══════════════════════════════════════════════');
console.log('\n新增功能清单:');
console.log('  ✅ 空格+拖拽/中键 平移画布');
console.log('  ✅ 鼠标位置中心缩放');
console.log('  ✅ 快捷键 V/M/L/W/F + 提示栏');
console.log('  ✅ 手风琴折叠面板');
console.log('  ✅ 左右面板拖拽调宽');
console.log('  ✅ 部件拖拽排序');
console.log('  ✅ 双击重命名');
console.log('  ✅ 悬停高亮');
console.log('  ✅ Spine JSON (skeleton.json) 直出');
console.log('  ✅ 智能镜像命名 (_L↔_R, 左↔右)');
console.log('  ✅ 边缘羽化 (Feathering)');
console.log('  ✅ Alpha Bleeding 算法');
