/**
 * ═══════════════════════════════════════════════════════
 *   File Drop Module v1.0
 *   美术在线工具公共文件拖拽上传
 * ═══════════════════════════════════════════════════════
 *
 * 依赖：tool-base.css（提供 .drop-zone / .dg 样式）
 *
 * 用法：
 *   <script src="file-drop.js"></script>
 *
 *   // 基础用法 — 单文件
 *   FileDrop.init('#my-drop-zone', {
 *     accept: 'image/*,.psd',
 *     onFile: (file) => { ... }
 *   });
 *
 *   // 多文件批量
 *   FileDrop.init('#batch-drop', {
 *     multiple: true,
 *     accept: 'image/png,image/jpeg',
 *     onFiles: (files) => { ... },
 *     onProgress: (loaded, total) => { ... }
 *   });
 *
 *   // 读取为指定格式
 *   FileDrop.init('#canvas-drop', {
 *     readAs: 'dataURL',  // 'dataURL'|'arrayBuffer'|'text'|'none'
 *     onLoad: (result, file) => { ... }
 *   });
 */
;(function(global) {
  'use strict';

  const instances = new Map();

  /**
   * 初始化拖拽区域
   * @param {string|HTMLElement} el - 选择器或DOM元素
   * @param {object} opts
   * @param {string} [opts.accept] - 接受的MIME类型，逗号分隔
   * @param {boolean} [opts.multiple=false] - 是否支持多文件
   * @param {string} [opts.readAs='none'] - 读取方式: 'dataURL'|'arrayBuffer'|'text'|'none'
   * @param {Function} [opts.onFile] - 单文件回调 (file: File)
   * @param {Function} [opts.onFiles] - 多文件回调 (files: File[])
   * @param {Function} [opts.onLoad] - 文件读取完成 (result, file)
   * @param {Function} [opts.onError] - 错误回调 (error, file)
   * @param {Function} [opts.onDragEnter] - 拖入回调
   * @param {Function} [opts.onDragLeave] - 拖出回调
   * @param {string} [opts.activeClass='dg'] - 拖入时的高亮类名
   * @returns {object} 实例 { destroy(), openPicker() }
   */
  function init(el, opts) {
    const zone = typeof el === 'string' ? document.querySelector(el) : el;
    if (!zone) { console.warn('[FileDrop] Element not found:', el); return null; }

    opts = Object.assign({
      accept: '',
      multiple: false,
      readAs: 'none',
      activeClass: 'dg',
      onFile: null,
      onFiles: null,
      onLoad: null,
      onError: null,
      onDragEnter: null,
      onDragLeave: null
    }, opts);

    let dragCount = 0;

    // Drag events
    function onDragEnter(e) {
      e.preventDefault();
      dragCount++;
      if (dragCount === 1) {
        zone.classList.add(opts.activeClass);
        if (opts.onDragEnter) opts.onDragEnter(e);
      }
    }

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }

    function onDragLeave(e) {
      e.preventDefault();
      dragCount--;
      if (dragCount <= 0) {
        dragCount = 0;
        zone.classList.remove(opts.activeClass);
        if (opts.onDragLeave) opts.onDragLeave(e);
      }
    }

    function onDrop(e) {
      e.preventDefault();
      dragCount = 0;
      zone.classList.remove(opts.activeClass);

      const dt = e.dataTransfer;
      let files = Array.from(dt.files);
      if (!files.length) return;

      // 过滤类型
      if (opts.accept) {
        files = filterByAccept(files, opts.accept);
      }
      if (!files.length) {
        if (opts.onError) opts.onError(new Error('不支持的文件类型'), null);
        if (global.Toast) Toast.warning('不支持的文件类型');
        return;
      }

      if (!opts.multiple) files = [files[0]];
      processFiles(files, opts);
    }

    // Click to open file picker
    function onClick(e) {
      // 避免事件冲突 — 如果点击的是按钮/链接则跳过
      if (e.target.closest('button, a, input, select')) return;
      openPicker();
    }

    function openPicker() {
      const input = document.createElement('input');
      input.type = 'file';
      if (opts.accept) input.accept = opts.accept;
      if (opts.multiple) input.multiple = true;
      input.onchange = () => {
        let files = Array.from(input.files);
        if (!files.length) return;
        if (opts.accept) files = filterByAccept(files, opts.accept);
        if (!opts.multiple) files = [files[0]];
        processFiles(files, opts);
      };
      input.click();
    }

    // Attach events
    zone.addEventListener('dragenter', onDragEnter);
    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
    zone.addEventListener('click', onClick);

    const instance = {
      destroy() {
        zone.removeEventListener('dragenter', onDragEnter);
        zone.removeEventListener('dragover', onDragOver);
        zone.removeEventListener('dragleave', onDragLeave);
        zone.removeEventListener('drop', onDrop);
        zone.removeEventListener('click', onClick);
        instances.delete(zone);
      },
      openPicker,
      zone
    };

    instances.set(zone, instance);
    return instance;
  }

  function processFiles(files, opts) {
    // 多文件回调
    if (opts.onFiles) opts.onFiles(files);

    // 单文件回调
    files.forEach(file => {
      if (opts.onFile) opts.onFile(file);

      // 读取文件内容
      if (opts.readAs && opts.readAs !== 'none' && opts.onLoad) {
        readFile(file, opts.readAs)
          .then(result => opts.onLoad(result, file))
          .catch(err => { if (opts.onError) opts.onError(err, file); });
      }
    });
  }

  /**
   * 读取文件
   * @param {File} file
   * @param {string} readAs - 'dataURL'|'arrayBuffer'|'text'
   * @returns {Promise<string|ArrayBuffer>}
   */
  function readFile(file, readAs) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      switch (readAs) {
        case 'dataURL': reader.readAsDataURL(file); break;
        case 'arrayBuffer': reader.readAsArrayBuffer(file); break;
        case 'text': reader.readAsText(file); break;
        default: resolve(file);
      }
    });
  }

  /**
   * 根据 accept 字符串过滤文件
   */
  function filterByAccept(files, accept) {
    const rules = accept.split(',').map(s => s.trim().toLowerCase());
    return files.filter(file => {
      const type = file.type.toLowerCase();
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      return rules.some(rule => {
        if (rule.startsWith('.')) return ext === rule;
        if (rule.endsWith('/*')) return type.startsWith(rule.replace('/*', '/'));
        return type === rule;
      });
    });
  }

  /**
   * 获取已注册的实例
   */
  function get(el) {
    const zone = typeof el === 'string' ? document.querySelector(el) : el;
    return instances.get(zone) || null;
  }

  // 暴露全局 API
  global.FileDrop = { init, get, readFile, filterByAccept };

})(typeof window !== 'undefined' ? window : this);
