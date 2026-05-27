/**
 * TOC Enhancer v1.1
 * 知识库文档目录导航交互增强脚本
 * 功能：
 *   - 原始 TOC 排版优化：默认折叠 + 多列网格 + 展开/收起动画
 *   - 粘性浮动侧边栏 / ScrollSpy 滚动高亮 / 折叠展开
 *   - 返回顶部 / 阅读进度条 / 移动端适配
 * 用法：在 HTML 文档末尾引入 <script src="toc-enhancer.js"></script>
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════
  // 0. 检测页面是否有 .toc 元素，没有则退出
  // ═══════════════════════════════════════════
  const originalToc = document.querySelector('.toc');
  if (!originalToc) return;

  const tocLinks = originalToc.querySelectorAll('a[href^="#"]');
  if (tocLinks.length < 5) return; // 目录项太少无需增强

  // ═══════════════════════════════════════════
  // 1. 注入样式
  // ═══════════════════════════════════════════
  const style = document.createElement('style');
  style.textContent = `
/* ===== 原始 TOC 排版优化 ===== */
.toc.toc-enhanced {
  padding: 0;
  overflow: hidden;
  transition: all .3s ease;
}
.toc-enhanced .toc-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  cursor: pointer;
  user-select: none;
  transition: background .15s;
}
.toc-enhanced .toc-header-bar:hover {
  background: rgba(108,140,255,.04);
}
.toc-enhanced .toc-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.toc-enhanced .toc-header-left h3 {
  margin: 0;
  font-size: 14px;
}
.toc-enhanced .toc-header-badge {
  font-size: 11px;
  background: rgba(108,140,255,.15);
  color: var(--accent, #6c8cff);
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
}
.toc-enhanced .toc-header-hint {
  font-size: 12px;
  color: var(--dim, #6b7085);
  display: flex;
  align-items: center;
  gap: 4px;
}
.toc-enhanced .toc-chevron {
  display: inline-block;
  transition: transform .25s ease;
  font-size: 14px;
}
.toc-enhanced.toc-collapsed .toc-chevron {
  transform: rotate(-90deg);
}
.toc-enhanced .toc-body {
  max-height: 600px;
  overflow: hidden;
  transition: max-height .35s cubic-bezier(.4,0,.2,1), padding .35s ease;
  padding: 0 20px 16px;
}
.toc-enhanced.toc-collapsed .toc-body {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* 多列网格布局 */
.toc-enhanced .toc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 6px 24px;
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: toc-grid-item;
}
.toc-enhanced .toc-grid > li {
  counter-increment: toc-grid-item;
  margin: 0;
  padding: 0;
}
.toc-enhanced .toc-grid > li > a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--accent, #6c8cff);
  text-decoration: none;
  transition: all .15s ease;
  font-weight: 500;
}
.toc-enhanced .toc-grid > li > a::before {
  content: counter(toc-grid-item);
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: rgba(108,140,255,.1);
  color: var(--accent, #6c8cff);
  flex-shrink: 0;
}
.toc-enhanced .toc-grid > li > a:hover {
  background: rgba(108,140,255,.08);
  color: var(--heading, #e4e6ed);
}
.toc-enhanced .toc-grid > li > a:hover::before {
  background: var(--accent, #6c8cff);
  color: #000;
}
/* 子目录 */
.toc-enhanced .toc-sub {
  list-style: none;
  padding: 0 0 0 28px;
  margin: 0;
}
.toc-enhanced .toc-sub li {
  margin: 0;
}
.toc-enhanced .toc-sub a {
  display: block;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--dim, #6b7085);
  text-decoration: none;
  border-radius: 4px;
  transition: all .12s ease;
  line-height: 1.5;
}
.toc-enhanced .toc-sub a:hover {
  color: var(--text, #c5c9d6);
  background: rgba(108,140,255,.05);
}

@media (max-width: 600px) {
  .toc-enhanced .toc-grid {
    grid-template-columns: 1fr;
  }
}

/* ===== 阅读进度条 ===== */
.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 0%;
  height: 3px;
  background: linear-gradient(90deg, var(--accent, #6c8cff), var(--accent2, #a78bfa));
  z-index: 9999;
  transition: width 0.1s linear;
  border-radius: 0 2px 2px 0;
}

/* ===== 浮动 TOC 侧边栏 ===== */
.toc-float {
  position: fixed;
  top: 72px;
  right: 20px;
  width: 260px;
  max-height: calc(100vh - 100px);
  background: var(--panel, #141620);
  border: 1px solid var(--border, #262a3a);
  border-radius: 12px;
  padding: 0;
  z-index: 1000;
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateX(20px);
  pointer-events: none;
  transition: opacity .3s ease, transform .3s ease;
}
.toc-float.visible {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.toc-float.collapsed .toc-float-body {
  max-height: 0 !important;
  padding: 0 16px !important;
  overflow: hidden;
}
.toc-float.collapsed .toc-toggle-icon {
  transform: rotate(-90deg);
}

.toc-float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #262a3a);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.toc-float-header:hover {
  background: rgba(108,140,255,.05);
}
.toc-float-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--heading, #e4e6ed);
  display: flex;
  align-items: center;
  gap: 6px;
}
.toc-float-title .toc-count {
  font-size: 11px;
  background: var(--accent, #6c8cff);
  color: #000;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 700;
}
.toc-toggle-icon {
  font-size: 12px;
  color: var(--dim, #6b7085);
  transition: transform .2s ease;
}

.toc-float-body {
  overflow-y: auto;
  max-height: calc(100vh - 160px);
  padding: 8px 16px 12px;
  transition: max-height .3s ease, padding .3s ease;
}
.toc-float-body::-webkit-scrollbar {
  width: 4px;
}
.toc-float-body::-webkit-scrollbar-thumb {
  background: #3d4155;
  border-radius: 2px;
}

.toc-float-body ol {
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: toc-item;
}
.toc-float-body li {
  counter-increment: toc-item;
  margin-bottom: 2px;
}
.toc-float-body li a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text, #c5c9d6);
  text-decoration: none;
  transition: all .15s ease;
  position: relative;
  line-height: 1.4;
}
.toc-float-body li a::before {
  content: counter(toc-item);
  font-size: 11px;
  font-weight: 700;
  color: var(--dim, #6b7085);
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--card, #1a1d2b);
  flex-shrink: 0;
  transition: all .15s ease;
}
.toc-float-body li a:hover {
  background: rgba(108,140,255,.08);
  color: var(--heading, #e4e6ed);
}
.toc-float-body li a:hover::before {
  background: rgba(108,140,255,.15);
  color: var(--accent, #6c8cff);
}

/* ScrollSpy 激活态 */
.toc-float-body li a.active {
  background: rgba(108,140,255,.12);
  color: var(--accent, #6c8cff);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--accent, #6c8cff);
}
.toc-float-body li a.active::before {
  background: var(--accent, #6c8cff);
  color: #000;
}

/* ===== 返回顶部按钮 ===== */
.back-to-top {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 42px;
  height: 42px;
  background: var(--panel, #141620);
  border: 1px solid var(--border, #262a3a);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1001;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: all .3s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,.3);
}
.back-to-top.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.back-to-top:hover {
  background: var(--accent, #6c8cff);
  border-color: var(--accent, #6c8cff);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(108,140,255,.3);
}
.back-to-top:hover svg {
  stroke: #000;
}
.back-to-top svg {
  width: 18px;
  height: 18px;
  stroke: var(--text, #c5c9d6);
  stroke-width: 2.5;
  fill: none;
  transition: stroke .2s;
}

/* ===== 移动端适配 ===== */
.toc-mobile-btn {
  display: none;
  position: fixed;
  bottom: 76px;
  right: 24px;
  width: 42px;
  height: 42px;
  background: var(--accent, #6c8cff);
  border: none;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1001;
  box-shadow: 0 4px 16px rgba(108,140,255,.3);
}
.toc-mobile-btn svg {
  width: 20px;
  height: 20px;
  stroke: #000;
  stroke-width: 2.5;
  fill: none;
}

@media (max-width: 1680px) {
  .toc-float {
    width: 240px;
    right: 12px;
  }
}
@media (max-width: 1480px) {
  .toc-float {
    width: 220px;
    right: 8px;
    font-size: 12px;
  }
  .toc-float-body li a {
    font-size: 12px;
    padding: 5px 8px;
  }
}
@media (max-width: 1100px) {
  .toc-float {
    display: none;
  }
  .toc-float.mobile-open {
    display: flex;
    top: auto;
    bottom: 130px;
    right: 16px;
    width: 280px;
    max-height: 60vh;
  }
  .toc-mobile-btn {
    display: flex;
  }
}

/* ===== 平滑滚动 ===== */
html {
  scroll-behavior: smooth;
}

/* ===== 章节锚点偏移（避免被固定头部遮挡） ===== */
.section[id] {
  scroll-margin-top: 20px;
}
`;
  document.head.appendChild(style);

  // ═══════════════════════════════════════════
  // 1.5 改造原始内嵌 TOC — 折叠 + 多列网格
  // ═══════════════════════════════════════════
  (function enhanceOriginalToc() {
    // Skip if already enhanced by inline script
    if (originalToc.classList.contains('toc-folded') || originalToc.querySelector('.toc-toggle-bar') || originalToc.querySelector('.toc-inner')) return;

    // 收集一级条目（直接子 ol > li）
    const topOl = originalToc.querySelector('ol');
    if (!topOl) return;

    const topItems = Array.from(topOl.children).filter(el => el.tagName === 'LI');
    const totalLinks = tocLinks.length;

    // 构建新的 TOC HTML
    let gridHtml = '';
    topItems.forEach(li => {
      const mainLink = li.querySelector(':scope > a');
      if (!mainLink) return;
      // 检查子列表
      const subOl = li.querySelector(':scope > ol');
      let subHtml = '';
      if (subOl) {
        const subItems = Array.from(subOl.querySelectorAll('a'));
        subHtml = '<ul class="toc-sub">' +
          subItems.map(a => `<li><a href="${a.getAttribute('href')}">${a.textContent}</a></li>`).join('') +
          '</ul>';
      }
      gridHtml += `<li><a href="${mainLink.getAttribute('href')}">${mainLink.textContent}</a>${subHtml}</li>`;
    });

    // 替换 originalToc 内部 HTML
    originalToc.classList.add('toc-enhanced', 'toc-collapsed');
    originalToc.innerHTML = `
      <div class="toc-header-bar">
        <div class="toc-header-left">
          <h3>📑 目录导航</h3>
          <span class="toc-header-badge">${topItems.length} 章 · ${totalLinks} 节</span>
        </div>
        <span class="toc-header-hint">
          <span>点击展开</span>
          <span class="toc-chevron">▼</span>
        </span>
      </div>
      <div class="toc-body">
        <ol class="toc-grid">${gridHtml}</ol>
      </div>
    `;

    // 绑定折叠/展开事件
    const headerBar = originalToc.querySelector('.toc-header-bar');
    const hintText = originalToc.querySelector('.toc-header-hint span:first-child');
    headerBar.addEventListener('click', () => {
      const isCollapsed = originalToc.classList.toggle('toc-collapsed');
      hintText.textContent = isCollapsed ? '点击展开' : '点击收起';
    });
  })();

  // ═══════════════════════════════════════════
  // 2. 创建阅读进度条
  // ═══════════════════════════════════════════
  const progressBar = document.createElement('div');
  progressBar.className = 'reading-progress';
  document.body.appendChild(progressBar);

  // ═══════════════════════════════════════════
  // 3. 创建浮动 TOC 侧边栏
  // ═══════════════════════════════════════════
  const tocFloat = document.createElement('div');
  tocFloat.className = 'toc-float';
  tocFloat.innerHTML = `
    <div class="toc-float-header">
      <span class="toc-float-title">📑 目录导航 <span class="toc-count">${tocLinks.length}</span></span>
      <span class="toc-toggle-icon">▼</span>
    </div>
    <div class="toc-float-body">
      <ol>${Array.from(tocLinks).map(a =>
        `<li><a href="${a.getAttribute('href')}" title="${a.textContent}">${a.textContent}</a></li>`
      ).join('')}</ol>
    </div>
  `;
  document.body.appendChild(tocFloat);

  // 折叠/展开
  const tocHeader = tocFloat.querySelector('.toc-float-header');
  tocHeader.addEventListener('click', () => {
    tocFloat.classList.toggle('collapsed');
  });

  // 点击链接后滚动并在移动端关闭面板
  tocFloat.querySelectorAll('.toc-float-body a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 1100) {
        tocFloat.classList.remove('mobile-open');
      }
    });
  });

  // ═══════════════════════════════════════════
  // 4. 创建返回顶部按钮
  // ═══════════════════════════════════════════
  const backToTop = document.createElement('div');
  backToTop.className = 'back-to-top';
  backToTop.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>`;
  backToTop.title = '返回顶部';
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(backToTop);

  // ═══════════════════════════════════════════
  // 5. 创建移动端 TOC 按钮
  // ═══════════════════════════════════════════
  const mobileBtn = document.createElement('button');
  mobileBtn.className = 'toc-mobile-btn';
  mobileBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`;
  mobileBtn.title = '目录';
  mobileBtn.addEventListener('click', () => {
    tocFloat.classList.toggle('mobile-open');
  });
  document.body.appendChild(mobileBtn);

  // ═══════════════════════════════════════════
  // 6. ScrollSpy + 进度条 + 显示/隐藏逻辑
  // ═══════════════════════════════════════════
  const floatLinks = tocFloat.querySelectorAll('.toc-float-body a');
  const sections = [];
  tocLinks.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) sections.push(el);
  });

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
      progressBar.style.width = progress + '%';

      // 显示/隐藏浮动 TOC（滚动超过原始 TOC 位置后显示）
      const tocBottom = originalToc.getBoundingClientRect().bottom;
      if (tocBottom < 0) {
        tocFloat.classList.add('visible');
      } else {
        tocFloat.classList.remove('visible');
      }

      // 显示/隐藏返回顶部按钮
      if (scrollY > 400) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }

      // ScrollSpy - 高亮当前章节
      let activeIdx = 0;
      for (let i = sections.length - 1; i >= 0; i--) {
        const rect = sections[i].getBoundingClientRect();
        if (rect.top <= 80) {
          activeIdx = i;
          break;
        }
      }
      floatLinks.forEach((link, idx) => {
        if (idx === activeIdx) {
          link.classList.add('active');
          // 自动滚动侧边栏使激活项可见
          const body = tocFloat.querySelector('.toc-float-body');
          const linkTop = link.offsetTop - body.offsetTop;
          const bodyScroll = body.scrollTop;
          const bodyHeight = body.clientHeight;
          if (linkTop < bodyScroll || linkTop > bodyScroll + bodyHeight - 40) {
            body.scrollTo({ top: linkTop - bodyHeight / 3, behavior: 'smooth' });
          }
        } else {
          link.classList.remove('active');
        }
      });

      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  // 初始触发一次
  onScroll();

  // ═══════════════════════════════════════════
  // 7. 点击页面其他区域关闭移动端 TOC
  // ═══════════════════════════════════════════
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1100 &&
        !tocFloat.contains(e.target) &&
        !mobileBtn.contains(e.target)) {
      tocFloat.classList.remove('mobile-open');
    }
  });

})();
