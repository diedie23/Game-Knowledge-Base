/**
 * ═══════════════════════════════════════════════════════
 *   Toast Notification Module v1.0
 *   美术在线工具公共通知系统
 * ═══════════════════════════════════════════════════════
 *
 * 依赖：tool-base.css（提供 .tb-toast-container / .tb-toast 样式）
 *
 * 用法：
 *   <script src="toast.js"></script>
 *   Toast.show('操作成功', 'success');
 *   Toast.show('出错了', 'error', 5000);
 *   Toast.success('保存完成');
 *   Toast.error('文件格式不支持');
 *   Toast.warning('文件较大，处理可能较慢');
 *   Toast.info('提示：可使用 Ctrl+Z 撤销');
 */
;(function(global) {
  'use strict';

  let container = null;
  const DEFAULTS = {
    duration: 2500,
    maxVisible: 5
  };

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.className = 'tb-toast-container';
    document.body.appendChild(container);
    return container;
  }

  /**
   * 显示 Toast 通知
   * @param {string} message - 提示文本
   * @param {string} [type=''] - 类型: 'success'|'error'|'warning'|'info'|''
   * @param {number} [duration=2500] - 持续时间(ms)，0 表示不自动关闭
   * @returns {HTMLElement} toast DOM 元素
   */
  function show(message, type, duration) {
    if (typeof type === 'number') { duration = type; type = ''; }
    type = type || '';
    duration = (duration !== undefined && duration !== null) ? duration : DEFAULTS.duration;

    const c = ensureContainer();

    // 超出最大数量时移除最早的
    while (c.children.length >= DEFAULTS.maxVisible) {
      const oldest = c.children[0];
      oldest.remove();
    }

    const el = document.createElement('div');
    el.className = 'tb-toast' + (type ? ' ' + type : '');
    el.textContent = message;
    c.appendChild(el);

    if (duration > 0) {
      setTimeout(() => dismiss(el), duration);
    }

    return el;
  }

  function dismiss(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // fallback: 移除 DOM
    setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
  }

  // 便捷方法
  function success(msg, dur) { return show(msg, 'success', dur); }
  function error(msg, dur)   { return show(msg, 'error', dur || 4000); }
  function warning(msg, dur) { return show(msg, 'warning', dur || 3500); }
  function info(msg, dur)    { return show(msg, 'info', dur); }

  /**
   * 确认弹窗（Modal Confirm）
   * @param {string} title - 标题
   * @param {string} message - 内容
   * @param {object} [opts] - { confirmText, cancelText, onConfirm, onCancel }
   * @returns {Promise<boolean>}
   */
  function confirm(title, message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'tb-modal-overlay';
      overlay.innerHTML = `
        <div class="tb-modal">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="tb-modal-actions">
            <button class="btn tb-cancel">${opts.cancelText || '取消'}</button>
            <button class="btn btn-p tb-confirm">${opts.confirmText || '确认'}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const close = (result) => {
        overlay.remove();
        resolve(result);
        if (result && opts.onConfirm) opts.onConfirm();
        if (!result && opts.onCancel) opts.onCancel();
      };

      overlay.querySelector('.tb-confirm').onclick = () => close(true);
      overlay.querySelector('.tb-cancel').onclick = () => close(false);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
      // ESC
      const esc = (e) => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); } };
      document.addEventListener('keydown', esc);
    });
  }

  // 暴露全局 API
  const Toast = { show, dismiss, success, error, warning, info, confirm, DEFAULTS };
  global.Toast = Toast;

  // 兼容旧代码：如果页面有 toast(msg, type) 或 showToast(msg) 尚未定义，自动挂载兼容别名
  if (typeof global.toast === 'undefined') {
    global.toast = function(msg, type) { return show(msg, type); };
  }
  if (typeof global.showToast === 'undefined') {
    global.showToast = function(msg, type) { return show(msg, type); };
  }

})(typeof window !== 'undefined' ? window : this);
