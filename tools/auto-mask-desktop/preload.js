/**
 * Auto Mask Generator v6.0 — Preload 桥接脚本
 * 
 * 安全地将 Electron 原生能力暴露给渲染进程（index.html）
 * 渲染进程通过 window.desktop.xxx() 调用
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  /**
   * 获取当前默认保存目录
   * @returns {Promise<string>}
   */
  getSaveDir: () => ipcRenderer.invoke('get-save-dir'),

  /**
   * 保存单个文件
   * @param {string} fileName - 文件名（如 "Hero01_Mask_RGBA.png"）
   * @param {ArrayBuffer} buffer - 文件内容
   * @param {boolean} [askPath=false] - 是否弹出路径选择对话框
   * @returns {Promise<{success: boolean, path?: string, reason?: string}>}
   */
  saveFile: (fileName, buffer, askPath = false) =>
    ipcRenderer.invoke('save-file', { fileName, buffer: Array.from(new Uint8Array(buffer)), askPath }),

  /**
   * 批量保存多个文件到默认目录
   * @param {Array<{fileName: string, buffer: ArrayBuffer}>} files
   * @returns {Promise<Array<{fileName: string, success: boolean, path?: string}>>}
   */
  saveFilesBatch: (files) =>
    ipcRenderer.invoke('save-files-batch',
      files.map(f => ({ fileName: f.fileName, buffer: Array.from(new Uint8Array(f.buffer)) }))
    ),

  /**
   * 选择保存目录
   * @returns {Promise<string|null>}
   */
  chooseDir: () => ipcRenderer.invoke('choose-dir'),

  /**
   * 在系统文件管理器中显示文件
   * @param {string} filePath
   */
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

  /**
   * 读取拖入的文件（通过文件路径，桌面端特权）
   * @param {string} filePath
   * @returns {Promise<{success: boolean, name: string, ext: string, buffer: ArrayBuffer}>}
   */
  readDroppedFile: (filePath) => ipcRenderer.invoke('read-dropped-file', filePath),

  /**
   * 监听保存目录变更
   * @param {function} callback
   */
  onSaveDirChanged: (callback) => {
    ipcRenderer.on('save-dir-changed', (event, dir) => callback(dir));
  },

  /**
   * 检测是否在桌面端运行
   */
  isDesktop: true,

  /**
   * 获取平台信息
   */
  platform: process.platform
});
