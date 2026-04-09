/**
 * ═══════════════════════════════════════════════════════
 *   APM 知识库 · 可视化编辑器 Kit  v1.0
 *   零依赖 · 纯原生 JS · 一行引入即用
 * ═══════════════════════════════════════════════════════
 *
 *  使用方式（在任意文档 </body> 前加一行）：
 *    <script src="editor-kit.js"></script>
 *
 *  功能：
 *    1. 右上角悬浮「✏️ 编辑模式」按钮
 *    2. 点击后进入所见即所得编辑（contenteditable）
 *    3. 编辑工具栏：保存覆盖 / 另存为新文档 / 退出编辑
 *    4. 防破坏：锁定排版容器，只允许编辑文本和图片
 *    5. 图片替换：双击图片可上传新图（自动转 base64 内嵌）
 *    6. 表格单元格独立可编辑
 */
(function () {
  'use strict';

  /* ─── 常量 ─── */
  // 这些 class 对应的元素是"排版骨架"，禁止用户删除
  const STRUCTURE_SELECTORS = [
    '.doc', '.doc-header', '.doc-footer', '.toc', '.section',
    '.app', '.header', '.tab-bar', '.main-area', '.tab-panel',
    '.case', '.case-head', '.case-body',
    '.mine', '.mine-head', '.mine-body',
    '.alert', '.faq-item', '.faq-q', '.faq-a',
    '.dd-grid', '.dd-do', '.dd-dont',
    '.flow', '.flow-node', '.flow-arrow',
    '.timeline', '.step',
    '.stats-row', '.stat-chip',
    '.qs', '.qs-item',
    'table', 'thead', 'tbody', 'tr'
  ];

  /* ─── 状态 ─── */
  let isEditing = false;
  let originalHTML = ''; // 进入编辑前的快照（用于取消）

  /* ─── 工具函数 ─── */
  function getFileName () {
    const path = location.pathname;
    const parts = path.split('/');
    let name = parts[parts.length - 1] || 'document.html';
    if (!name.endsWith('.html')) name += '.html';
    return decodeURIComponent(name);
  }

  function toast (msg, dur) {
    dur = dur || 2200;
    let t = document.getElementById('ek-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ek-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
      'background:#6c8cff;color:#fff;padding:10px 28px;border-radius:10px;font-size:14px;' +
      'z-index:999999;pointer-events:none;opacity:0;transition:opacity .3s;font-family:inherit;' +
      'box-shadow:0 4px 24px rgba(108,140,255,.35);';
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      setTimeout(function () { t.style.opacity = '0'; }, dur);
    });
  }

  /* ─── 触发浏览器下载 ─── */
  function downloadHTML (filename) {
    // 先暂时移除编辑器自身的 UI 元素
    const uiEls = document.querySelectorAll('.ek-ui');
    uiEls.forEach(function (el) { el.style.display = 'none'; });

    // 移除所有 contenteditable 属性
    document.querySelectorAll('[contenteditable]').forEach(function (el) {
      el.removeAttribute('contenteditable');
    });
    // 移除编辑态样式类
    document.body.classList.remove('ek-editing');
    // 移除图片上的编辑边框
    document.querySelectorAll('.ek-img-editable').forEach(function (el) {
      el.classList.remove('ek-img-editable');
    });

    // 获取完整 HTML（包含 DOCTYPE）
    let html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    // 清理：移除编辑器相关节点（editor-kit.js 引用 / ek-ui 节点 / ek-toast）
    // 使用正则在字符串层面清理，避免修改 DOM
    html = html.replace(/<script[^>]*editor-kit\.js[^>]*><\/script>\s*/gi, '');
    html = html.replace(/<div[^>]*class="[^"]*ek-ui[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?:<\/div>\s*)*/gi, '');
    html = html.replace(/<div[^>]*id="ek-toast"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
    html = html.replace(/<style[^>]*id="ek-styles"[^>]*>[\s\S]*?<\/style>\s*/gi, '');
    // 清理可能残留的 data-ek 属性
    html = html.replace(/\s*data-ek-[a-z]+="[^"]*"/gi, '');

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    // 恢复 UI
    uiEls.forEach(function (el) { el.style.display = ''; });
  }

  /* ─── 进入 / 退出编辑模式 ─── */
  function enterEdit () {
    if (isEditing) return;
    isEditing = true;
    originalHTML = document.documentElement.outerHTML;
    document.body.classList.add('ek-editing');

    // 把排版骨架标记为不可删除（通过 MutationObserver 守护）
    // 让"叶子"内容节点可编辑
    enableEditing();
    toolbar.style.display = 'flex';
    enterBtn.style.display = 'none';
    toast('✅ 已进入编辑模式 · 直接点击文字即可修改');
  }

  function exitEdit (discard) {
    if (!isEditing) return;
    if (discard) {
      // 还原 DOM — 最简单的方式：刷新页面
      if (confirm('确定要放弃所有修改吗？页面将刷新回原始状态。')) {
        location.reload();
        return;
      } else {
        return; // 用户取消
      }
    }
    isEditing = false;
    disableEditing();
    document.body.classList.remove('ek-editing');
    toolbar.style.display = 'none';
    enterBtn.style.display = '';
    toast('已退出编辑模式');
  }

  /* ─── 可编辑区域控制 ─── */
  function enableEditing () {
    // 策略：将以下元素设置为 contenteditable
    // 1. .doc-header 内部的 h1, .subtitle, .meta, .badge
    // 2. .section 内部（整个 section 可编辑，但 MutationObserver 守护外层）
    // 3. .toc 内部
    // 4. .doc-footer
    // 5. 表格单元格 td / th
    // 6. .alert 内部
    // 7. 各种卡片的 body 区域
    // 8. .case-head .title / .mine-head .title 等

    const editableSelectors = [
      // 文档类
      '.doc-header h1', '.doc-header .subtitle', '.doc-header .meta',
      '.doc-header .badge',
      '.toc',
      '.section',
      '.doc-footer',
      // 提示框
      '.alert',
      // 卡片类
      '.case-body', '.case-head .title',
      '.mine-body', '.mine-head .title',
      '.faq-q', '.faq-a',
      '.dd-do', '.dd-dont',
      // 时间线
      '.step .st', '.step .sd',
      // 统计
      '.stat-chip',
      '.qs-item',
      // 流程节点
      '.flow-node',
      // 工具类页面
      '.header-info h1', '.header-info p',
      '.section-title',
      // 通用 — 表格单元格
      'th', 'td'
    ];

    editableSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        // 跳过内部已有 contenteditable 的（避免嵌套）
        if (el.closest('[contenteditable="true"]') && el.closest('[contenteditable="true"]') !== el) return;
        el.setAttribute('contenteditable', 'true');
      });
    });

    // 图片双击替换
    document.querySelectorAll('img').forEach(function (img) {
      img.classList.add('ek-img-editable');
      img.addEventListener('dblclick', handleImgDblClick);
    });

    // 启动结构守护
    startGuard();
  }

  function disableEditing () {
    document.querySelectorAll('[contenteditable]').forEach(function (el) {
      el.removeAttribute('contenteditable');
    });
    document.querySelectorAll('.ek-img-editable').forEach(function (el) {
      el.classList.remove('ek-img-editable');
      el.removeEventListener('dblclick', handleImgDblClick);
    });
    stopGuard();
  }

  /* ─── 图片替换 ─── */
  function handleImgDblClick (e) {
    e.preventDefault();
    e.stopPropagation();
    const img = e.currentTarget;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = function () {
      const file = inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        img.src = ev.target.result;
        toast('✅ 图片已替换（base64 内嵌）');
      };
      reader.readAsDataURL(file);
    };
    inp.click();
  }

  /* ─── 结构守护（MutationObserver） ─── */
  let observer = null;
  // 缓存受保护的节点集合
  let protectedNodes = new Set();

  function buildProtectedSet () {
    protectedNodes = new Set();
    STRUCTURE_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        protectedNodes.add(el);
      });
    });
  }

  function startGuard () {
    buildProtectedSet();
    observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'childList' && m.removedNodes.length) {
          m.removedNodes.forEach(function (node) {
            if (node.nodeType === 1 && protectedNodes.has(node)) {
              // 被保护的节点被删除了 → 恢复
              if (m.nextSibling) {
                m.target.insertBefore(node, m.nextSibling);
              } else {
                m.target.appendChild(node);
              }
              toast('⚠️ 排版容器受保护，无法删除');
            }
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopGuard () {
    if (observer) { observer.disconnect(); observer = null; }
    protectedNodes.clear();
  }

  /* ─── 另存为弹窗 ─── */
  function showSaveAsDialog () {
    // 创建模态
    const overlay = document.createElement('div');
    overlay.className = 'ek-ui ek-modal-overlay';
    overlay.innerHTML = '<div class="ek-modal">' +
      '<h3>📄 另存为新文档</h3>' +
      '<p style="font-size:13px;color:#8b8fa3;margin:8px 0 16px">输入新文件名（无需输入 .html 后缀）</p>' +
      '<input type="text" class="ek-modal-input" id="ekNewName" placeholder="例如：11月美术复盘" autofocus>' +
      '<div class="ek-modal-btns">' +
        '<button class="ek-btn ek-btn-secondary" id="ekCancelSaveAs">取消</button>' +
        '<button class="ek-btn ek-btn-primary" id="ekConfirmSaveAs">💾 确认另存为</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    // 自动聚焦
    setTimeout(function () { document.getElementById('ekNewName').focus(); }, 100);

    document.getElementById('ekCancelSaveAs').onclick = function () {
      document.body.removeChild(overlay);
    };
    document.getElementById('ekConfirmSaveAs').onclick = function () {
      let name = document.getElementById('ekNewName').value.trim();
      if (!name) { toast('⚠️ 请输入文件名'); return; }
      if (!name.endsWith('.html')) name += '.html';
      document.body.removeChild(overlay);
      downloadHTML(name);
      // 下载后恢复编辑状态
      reEnterEdit();
      toast('✅ 已下载: ' + name);
    };

    // ESC 关闭
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.body.removeChild(overlay);
    });
  }

  /* 下载后需要重新恢复编辑状态（因为 downloadHTML 会临时移除 contenteditable） */
  function reEnterEdit () {
    document.body.classList.add('ek-editing');
    enableEditing();
  }

  /* ─── 注入 CSS ─── */
  function injectStyles () {
    if (document.getElementById('ek-styles')) return;
    const style = document.createElement('style');
    style.id = 'ek-styles';
    style.textContent = [
      /* 入口按钮 */
      '.ek-enter-btn{position:fixed;top:16px;right:16px;z-index:99990;' +
        'background:linear-gradient(135deg,#6c8cff,#a78bfa);color:#fff;' +
        'border:none;padding:10px 20px;border-radius:12px;font-size:14px;font-weight:600;' +
        'cursor:pointer;font-family:inherit;box-shadow:0 4px 20px rgba(108,140,255,.35);' +
        'transition:all .2s;display:flex;align-items:center;gap:6px}',
      '.ek-enter-btn:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(108,140,255,.5)}',

      /* 编辑工具栏 */
      '.ek-toolbar{position:fixed;top:16px;right:16px;z-index:99990;' +
        'background:#1a1d2b;border:1px solid #333657;border-radius:14px;' +
        'padding:8px 12px;display:none;align-items:center;gap:8px;' +
        'box-shadow:0 8px 32px rgba(0,0,0,.5);flex-wrap:wrap}',
      '.ek-btn{padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;' +
        'cursor:pointer;border:none;font-family:inherit;transition:all .15s;' +
        'display:inline-flex;align-items:center;gap:5px;white-space:nowrap}',
      '.ek-btn-primary{background:#6c8cff;color:#fff}',
      '.ek-btn-primary:hover{background:#5a7aee}',
      '.ek-btn-green{background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.2)}',
      '.ek-btn-green:hover{background:rgba(74,222,128,.25)}',
      '.ek-btn-secondary{background:transparent;border:1px solid #333657;color:#8b8fa3}',
      '.ek-btn-secondary:hover{border-color:#6c8cff;color:#6c8cff}',
      '.ek-btn-danger{background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.2)}',
      '.ek-btn-danger:hover{background:rgba(248,113,113,.25)}',
      '.ek-toolbar-divider{width:1px;height:24px;background:#333657;margin:0 4px}',

      /* 编辑态提示 */
      '.ek-editing-badge{position:fixed;top:16px;left:50%;transform:translateX(-50%);' +
        'z-index:99990;background:rgba(108,140,255,.12);border:1px solid rgba(108,140,255,.25);' +
        'color:#8ba3ff;padding:6px 18px;border-radius:20px;font-size:12px;font-weight:500;' +
        'pointer-events:none;animation:ek-pulse 2s infinite;font-family:inherit}',
      '@keyframes ek-pulse{0%,100%{opacity:1}50%{opacity:.6}}',

      /* 编辑态下的视觉反馈 */
      'body.ek-editing [contenteditable="true"]{outline:2px dashed rgba(108,140,255,.25);' +
        'outline-offset:2px;border-radius:4px;transition:outline-color .2s;min-height:1em}',
      'body.ek-editing [contenteditable="true"]:focus{outline-color:rgba(108,140,255,.6);' +
        'background:rgba(108,140,255,.03)}',
      'body.ek-editing [contenteditable="true"]:hover{outline-color:rgba(108,140,255,.4)}',

      /* 图片编辑态 */
      'body.ek-editing .ek-img-editable{cursor:pointer;outline:2px dashed rgba(74,222,128,.3);' +
        'outline-offset:2px;transition:outline-color .2s}',
      'body.ek-editing .ek-img-editable:hover{outline-color:rgba(74,222,128,.7)}',

      /* 模态 */
      '.ek-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:999999;' +
        'display:flex;align-items:center;justify-content:center;font-family:inherit}',
      '.ek-modal{background:#1a1d2b;border:1px solid #333657;border-radius:16px;' +
        'padding:28px 32px;min-width:380px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,.6)}',
      '.ek-modal h3{font-size:18px;color:#e8eaed;margin-bottom:4px}',
      '.ek-modal-input{width:100%;padding:10px 14px;background:#141620;border:1px solid #333657;' +
        'border-radius:10px;color:#e8eaed;font-size:15px;font-family:inherit;outline:none}',
      '.ek-modal-input:focus{border-color:#6c8cff}',
      '.ek-modal-btns{display:flex;gap:10px;margin-top:20px;justify-content:flex-end}',

      /* 确认弹窗 */
      '.ek-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;' +
        'display:flex;align-items:center;justify-content:center;font-family:inherit}',
      '.ek-confirm-box{background:#1a1d2b;border:1px solid #333657;border-radius:16px;' +
        'padding:24px 28px;min-width:340px;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.6)}',
      '.ek-confirm-box p{color:#c5c9d6;font-size:14px;line-height:1.8;margin-bottom:20px}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ─── 构建 UI ─── */
  var enterBtn, toolbar;

  function buildUI () {
    // 入口按钮
    enterBtn = document.createElement('button');
    enterBtn.className = 'ek-ui ek-enter-btn';
    enterBtn.innerHTML = '✏️ 编辑模式';
    enterBtn.onclick = enterEdit;
    document.body.appendChild(enterBtn);

    // 编辑中状态徽章
    var badge = document.createElement('div');
    badge.className = 'ek-ui ek-editing-badge';
    badge.textContent = '📝 编辑模式已开启 · 直接点击内容修改 · 双击图片替换';
    badge.style.display = 'none';
    document.body.appendChild(badge);

    // 编辑工具栏
    toolbar = document.createElement('div');
    toolbar.className = 'ek-ui ek-toolbar';
    toolbar.innerHTML =
      '<button class="ek-btn ek-btn-primary" id="ekSaveOverwrite">💾 保存并覆盖</button>' +
      '<button class="ek-btn ek-btn-green" id="ekSaveAs">📄 另存为新文档</button>' +
      '<div class="ek-toolbar-divider"></div>' +
      '<button class="ek-btn ek-btn-danger" id="ekDiscard">🗑️ 放弃修改</button>' +
      '<button class="ek-btn ek-btn-secondary" id="ekExitEdit">✖ 退出编辑</button>';
    document.body.appendChild(toolbar);

    // 按钮事件
    document.getElementById('ekSaveOverwrite').onclick = function () {
      var fn = getFileName();
      downloadHTML(fn);
      reEnterEdit();
      toast('✅ 已下载: ' + fn + ' · 请用此文件替换原文件');
    };
    document.getElementById('ekSaveAs').onclick = showSaveAsDialog;
    document.getElementById('ekDiscard').onclick = function () { exitEdit(true); };
    document.getElementById('ekExitEdit').onclick = function () { exitEdit(false); };

    // 编辑态控制 badge 显隐
    var obs = new MutationObserver(function () {
      badge.style.display = document.body.classList.contains('ek-editing') ? '' : 'none';
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /* ─── 键盘快捷键 ─── */
  document.addEventListener('keydown', function (e) {
    if (!isEditing) return;
    // Ctrl+S → 保存覆盖
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      var fn = getFileName();
      downloadHTML(fn);
      reEnterEdit();
      toast('✅ 已保存: ' + fn);
    }
    // Ctrl+Shift+S → 另存为
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      showSaveAsDialog();
    }
    // Escape → 退出
    if (e.key === 'Escape' && !document.querySelector('.ek-modal-overlay')) {
      exitEdit(false);
    }
  });

  /* ─── 防止误关页面 ─── */
  window.addEventListener('beforeunload', function (e) {
    if (isEditing) {
      e.preventDefault();
      e.returnValue = '你正在编辑中，确定要离开吗？未保存的修改将丢失。';
    }
  });

  /* ─── 初始化 ─── */
  function init () {
    injectStyles();
    buildUI();

    // 当页面被嵌入在 iframe 中时（父页面已提供编辑按钮），隐藏本页面的悬浮入口按钮
    // 使用 try-catch 防止跨域访问异常；同时也检查 frameElement 作为 fallback
    var isInIframe = false;
    try { isInIframe = window.self !== window.top; } catch (e) { isInIframe = true; }
    if (!isInIframe) { try { isInIframe = !!window.frameElement; } catch (e) {} }

    if (isInIframe) {
      if (enterBtn) { enterBtn.style.display = 'none'; enterBtn.remove(); }
      // 同时隐藏编辑工具栏，防止意外显示
      if (toolbar) { toolbar.style.display = 'none'; }
    }

    // 支持页面自主标记禁用编辑：<body data-no-edit> 或 <html data-no-edit>
    if (document.body.hasAttribute('data-no-edit') || document.documentElement.hasAttribute('data-no-edit')) {
      if (enterBtn) { enterBtn.style.display = 'none'; enterBtn.remove(); }
      if (toolbar) { toolbar.style.display = 'none'; }
    }
  }

  // 将 enterEdit 暴露到 window，供父页面通过 iframe.contentWindow.enterEdit() 调用
  window.enterEdit = enterEdit;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
