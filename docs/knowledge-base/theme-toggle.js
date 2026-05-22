/**
 * ═══════════════════════════════════════════════════════
 *   Theme Toggle Module v1.0
 *   功能：注入主题切换按钮，持久化主题偏好
 * ═══════════════════════════════════════════════════════
 */
(function(){
'use strict';

const STORAGE_KEY = '_kb_theme';
const DARK = 'dark';
const LIGHT = 'light';

// 读取保存的主题
function getSavedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch(e) { return null; }
}

// 应用主题
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch(e) {}
  // 更新按钮图标
  const btn = document.getElementById('_themeToggle');
  if (btn) btn.textContent = theme === DARK ? '☀️' : '🌙';
}

// 获取当前主题
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || DARK;
}

// 切换主题
function toggle() {
  applyTheme(getCurrentTheme() === DARK ? LIGHT : DARK);
}

// 注入按钮
function injectButton() {
  // 查找 header 区域
  const hdr = document.querySelector('.hdr, .top-bar, [class*="hdr"]');
  if (!hdr) return;

  const btn = document.createElement('button');
  btn.id = '_themeToggle';
  btn.title = '切换深色/浅色主题';
  btn.style.cssText = 'width:32px;height:32px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s;margin-left:4px';
  btn.textContent = getCurrentTheme() === DARK ? '☀️' : '🌙';
  btn.addEventListener('click', toggle);
  btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--accent)'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; });

  // 尝试在 spacer 后面插入, 或者在末尾
  const spacer = hdr.querySelector('.sp, .spacer');
  if (spacer && spacer.nextSibling) {
    hdr.insertBefore(btn, spacer.nextSibling);
  } else {
    hdr.appendChild(btn);
  }
}

// 初始化
function init() {
  // 自动注入 design-tokens.css（如未手动引入）
  if (!document.querySelector('link[href*="design-tokens"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'design-tokens.css';
    document.head.appendChild(link);
  }
  
  const saved = getSavedTheme();
  if (saved) applyTheme(saved);
  // 等待 DOM 就绪注入按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
}

init();

// 暴露 API
window.ThemeToggle = { toggle, applyTheme, getCurrentTheme };

})();
