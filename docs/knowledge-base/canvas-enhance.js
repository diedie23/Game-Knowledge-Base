/**
 * ═══════════════════════════════════════════════════════
 *   Canvas Enhancement Module v1.0
 *   功能：标尺(Ruler)、像素网格(Grid)、右键上下文菜单
 *   适配：mask-tool / color-swap-tool
 * ═══════════════════════════════════════════════════════
 */
(function(){
'use strict';

// ═══════ 配置 ═══════
const RULER_SIZE = 22; // px
const GRID_MIN_ZOOM = 4; // zoom >= 4 时显示像素网格
const RULER_BG = '#0d0f15';
const RULER_TEXT = '#6b7085';
const RULER_LINE = '#262a3a';
const RULER_ACCENT = 'rgba(108,140,255,.6)';

let _inited = false;
let _rulerH, _rulerV, _cornerEl;
let _gridCanvas;
let _ctxMenu;
let _host; // 宿主 canvas area element

/**
 * 初始化画布增强
 * @param {object} opts
 * @param {string} opts.areaId - 画布容器 ID (如 'cA', 'cArea')
 * @param {function} opts.getState - 返回 {zoom, panX, panY, imgW, imgH}
 * @param {function} opts.fitWin - 适应窗口回调
 * @param {function} opts.renderAll - 重绘回调
 * @param {Array} [opts.menuItems] - 右键菜单项 [{label, icon, action, divider?}]
 */
function init(opts) {
  if (_inited) return;
  _inited = true;
  _host = document.getElementById(opts.areaId);
  if (!_host) return;

  // 注入标尺样式
  _injectStyles();
  
  // 创建标尺元素
  _createRulers(opts);
  
  // 创建网格覆盖层
  _createGrid(opts);
  
  // 创建右键菜单
  _createContextMenu(opts);

  // 监听 renderAll 来更新标尺
  const origRender = opts.renderAll;
  const patchedRender = function() {
    origRender();
    _updateRulers(opts);
    _updateGrid(opts);
  };
  // 暴露 patched render
  window._ceRender = patchedRender;

  // 窗口缩放同步
  window.addEventListener('resize', () => _updateRulers(opts));
}

function _injectStyles() {
  if (document.getElementById('_ce-styles')) return;
  const s = document.createElement('style');
  s.id = '_ce-styles';
  s.textContent = `
    ._ce-ruler{position:absolute;background:${RULER_BG};z-index:15;overflow:hidden;pointer-events:none}
    ._ce-ruler-h{top:0;left:${RULER_SIZE}px;right:0;height:${RULER_SIZE}px;border-bottom:1px solid ${RULER_LINE}}
    ._ce-ruler-v{top:${RULER_SIZE}px;left:0;bottom:0;width:${RULER_SIZE}px;border-right:1px solid ${RULER_LINE}}
    ._ce-corner{position:absolute;top:0;left:0;width:${RULER_SIZE}px;height:${RULER_SIZE}px;background:${RULER_BG};border-right:1px solid ${RULER_LINE};border-bottom:1px solid ${RULER_LINE};z-index:16;display:flex;align-items:center;justify-content:center;cursor:pointer}
    ._ce-corner:hover{background:#1a1d2b}
    ._ce-corner svg{width:10px;height:10px;fill:${RULER_TEXT}}
    ._ce-grid{position:absolute;top:0;left:0;pointer-events:none;z-index:5;opacity:.3}
    ._ce-ctx{position:fixed;z-index:100000;background:#1a1d2b;border:1px solid #333657;border-radius:8px;padding:4px 0;min-width:160px;box-shadow:0 8px 32px rgba(0,0,0,.5);display:none;font-size:12px;font-family:inherit}
    ._ce-ctx-item{padding:6px 14px;color:#c5c9d6;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background .1s}
    ._ce-ctx-item:hover{background:rgba(108,140,255,.12);color:#e4e6ed}
    ._ce-ctx-divider{height:1px;background:#262a3a;margin:3px 8px}
    ._ce-ctx-item .ico{width:16px;text-align:center;font-size:13px}
  `;
  document.head.appendChild(s);
}

function _createRulers(opts) {
  // Horizontal ruler
  _rulerH = document.createElement('canvas');
  _rulerH.className = '_ce-ruler _ce-ruler-h';
  _rulerH.height = RULER_SIZE;
  _host.style.position = 'relative';
  _host.appendChild(_rulerH);

  // Vertical ruler
  _rulerV = document.createElement('canvas');
  _rulerV.className = '_ce-ruler _ce-ruler-v';
  _rulerV.width = RULER_SIZE;
  _host.appendChild(_rulerV);

  // Corner
  _cornerEl = document.createElement('div');
  _cornerEl.className = '_ce-corner';
  _cornerEl.innerHTML = '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1"/></svg>';
  _cornerEl.title = '切换标尺/网格显示';
  _host.appendChild(_cornerEl);

  let showRuler = true;
  _cornerEl.addEventListener('click', () => {
    showRuler = !showRuler;
    _rulerH.style.display = showRuler ? '' : 'none';
    _rulerV.style.display = showRuler ? '' : 'none';
    _cornerEl.style.opacity = showRuler ? '1' : '.4';
  });
}

function _updateRulers(opts) {
  if (!_rulerH || _rulerH.style.display === 'none') return;
  const state = opts.getState();
  const { zoom, panX, panY, imgW, imgH } = state;

  // Horizontal ruler
  const hw = _host.clientWidth - RULER_SIZE;
  _rulerH.width = hw;
  const hCtx = _rulerH.getContext('2d');
  hCtx.clearRect(0, 0, hw, RULER_SIZE);
  hCtx.fillStyle = RULER_TEXT;
  hCtx.font = '9px monospace';
  hCtx.textBaseline = 'top';

  const step = _calcStep(zoom);
  const startX = Math.floor(-panX / zoom / step) * step;
  const endX = Math.ceil((hw - panX) / zoom / step) * step;

  for (let px = startX; px <= endX; px += step) {
    const screenX = px * zoom + panX;
    if (screenX < 0 || screenX > hw) continue;
    if (px >= 0 && px <= imgW) {
      hCtx.fillStyle = RULER_LINE;
      hCtx.fillRect(screenX, RULER_SIZE - 6, 1, 6);
      if (px % (step * 2) === 0 || step >= 100) {
        hCtx.fillStyle = RULER_TEXT;
        hCtx.fillText(px.toString(), screenX + 2, 3);
        hCtx.fillStyle = RULER_LINE;
        hCtx.fillRect(screenX, RULER_SIZE - 10, 1, 10);
      }
    }
  }

  // Vertical ruler
  const vh = _host.clientHeight - RULER_SIZE;
  _rulerV.height = vh;
  const vCtx = _rulerV.getContext('2d');
  vCtx.clearRect(0, 0, RULER_SIZE, vh);
  vCtx.fillStyle = RULER_TEXT;
  vCtx.font = '9px monospace';
  vCtx.textBaseline = 'middle';

  const startY = Math.floor(-panY / zoom / step) * step;
  const endY = Math.ceil((vh - panY) / zoom / step) * step;

  for (let py = startY; py <= endY; py += step) {
    const screenY = py * zoom + panY;
    if (screenY < 0 || screenY > vh) continue;
    if (py >= 0 && py <= imgH) {
      vCtx.fillStyle = RULER_LINE;
      vCtx.fillRect(RULER_SIZE - 6, screenY, 6, 1);
      if (py % (step * 2) === 0 || step >= 100) {
        vCtx.save();
        vCtx.fillStyle = RULER_TEXT;
        vCtx.translate(3, screenY + 2);
        vCtx.rotate(-Math.PI / 2);
        vCtx.fillText(py.toString(), 0, 0);
        vCtx.restore();
        vCtx.fillStyle = RULER_LINE;
        vCtx.fillRect(RULER_SIZE - 10, screenY, 10, 1);
      }
    }
  }
}

function _calcStep(zoom) {
  const pixelsPerUnit = zoom;
  if (pixelsPerUnit >= 16) return 10;
  if (pixelsPerUnit >= 4) return 50;
  if (pixelsPerUnit >= 1) return 100;
  if (pixelsPerUnit >= 0.4) return 200;
  return 500;
}

function _createGrid(opts) {
  _gridCanvas = document.createElement('canvas');
  _gridCanvas.className = '_ce-grid';
  _gridCanvas.style.display = 'none';
  _host.appendChild(_gridCanvas);
}

function _updateGrid(opts) {
  const state = opts.getState();
  if (state.zoom < GRID_MIN_ZOOM) {
    _gridCanvas.style.display = 'none';
    return;
  }
  _gridCanvas.style.display = '';
  const { zoom, panX, panY, imgW, imgH } = state;
  
  // Only show grid in visible area
  const aw = _host.clientWidth;
  const ah = _host.clientHeight;
  _gridCanvas.width = aw;
  _gridCanvas.height = ah;
  _gridCanvas.style.width = aw + 'px';
  _gridCanvas.style.height = ah + 'px';
  
  const ctx = _gridCanvas.getContext('2d');
  ctx.clearRect(0, 0, aw, ah);
  ctx.strokeStyle = 'rgba(108,140,255,.15)';
  ctx.lineWidth = 0.5;

  // Calculate visible pixel range
  const x0 = Math.max(0, Math.floor(-panX / zoom));
  const y0 = Math.max(0, Math.floor(-panY / zoom));
  const x1 = Math.min(imgW, Math.ceil((aw - panX) / zoom));
  const y1 = Math.min(imgH, Math.ceil((ah - panY) / zoom));

  // Limit to max 200 lines each direction
  const step = Math.max(1, Math.ceil((x1 - x0) / 200));
  
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) {
    const sx = x * zoom + panX;
    ctx.moveTo(sx, Math.max(0, y0 * zoom + panY));
    ctx.lineTo(sx, Math.min(ah, y1 * zoom + panY));
  }
  for (let y = y0; y <= y1; y += step) {
    const sy = y * zoom + panY;
    ctx.moveTo(Math.max(0, x0 * zoom + panX), sy);
    ctx.lineTo(Math.min(aw, x1 * zoom + panX), sy);
  }
  ctx.stroke();
}

function _createContextMenu(opts) {
  _ctxMenu = document.createElement('div');
  _ctxMenu.className = '_ce-ctx';
  document.body.appendChild(_ctxMenu);

  const defaultItems = [
    { icon: '🔍', label: '适应窗口', action: () => { opts.fitWin(); opts.renderAll(); } },
    { icon: '➕', label: '放大 (=)', action: () => { const s = opts.getState(); _zoomTo(s.zoom * 1.5, opts); } },
    { icon: '➖', label: '缩小 (-)', action: () => { const s = opts.getState(); _zoomTo(s.zoom / 1.5, opts); } },
    { icon: '💯', label: '100%', action: () => { _zoomTo(1, opts); } },
    { divider: true },
    { icon: '📏', label: '切换标尺', action: () => _cornerEl.click() },
    { icon: '🔲', label: '切换网格', action: () => {
      if (_gridCanvas.style.display === 'none' && opts.getState().zoom >= GRID_MIN_ZOOM) {
        _gridCanvas.style.display = '';
      } else {
        _gridCanvas.style.display = _gridCanvas.style.display === 'none' ? '' : 'none';
      }
    }}
  ];

  const items = (opts.menuItems || []).length > 0 
    ? [...defaultItems, { divider: true }, ...opts.menuItems] 
    : defaultItems;

  _renderMenu(items);

  _host.addEventListener('contextmenu', e => {
    e.preventDefault();
    _ctxMenu.style.left = e.clientX + 'px';
    _ctxMenu.style.top = e.clientY + 'px';
    _ctxMenu.style.display = 'block';
    
    // Adjust if overflows
    requestAnimationFrame(() => {
      const rect = _ctxMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) _ctxMenu.style.left = (e.clientX - rect.width) + 'px';
      if (rect.bottom > window.innerHeight) _ctxMenu.style.top = (e.clientY - rect.height) + 'px';
    });
  });

  document.addEventListener('click', () => { _ctxMenu.style.display = 'none'; });
  document.addEventListener('contextmenu', e => {
    if (!_host.contains(e.target)) _ctxMenu.style.display = 'none';
  });
}

function _renderMenu(items) {
  _ctxMenu.innerHTML = items.map(item => {
    if (item.divider) return '<div class="_ce-ctx-divider"></div>';
    return `<div class="_ce-ctx-item" data-idx="${items.indexOf(item)}"><span class="ico">${item.icon||''}</span>${item.label}</div>`;
  }).join('');

  _ctxMenu.querySelectorAll('._ce-ctx-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      if (items[idx] && items[idx].action) items[idx].action();
      _ctxMenu.style.display = 'none';
    });
  });
}

function _zoomTo(targetZoom, opts) {
  const state = opts.getState();
  const aw = _host.clientWidth;
  const ah = _host.clientHeight;
  const cx = aw / 2, cy = ah / 2;
  const oz = state.zoom;
  const nz = Math.max(0.05, Math.min(targetZoom, 20));
  // Keep center point stable
  if (window.S) {
    S.zoom = nz;
    S.panX = cx - (cx - S.panX) * (nz / oz);
    S.panY = cy - (cy - S.panY) * (nz / oz);
  }
  opts.renderAll();
}

// 暴露 API
window.CanvasEnhance = { init };

})();
