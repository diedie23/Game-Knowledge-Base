/**
 * Auto Mask Generator v6.0 — Electron 主进程
 * 
 * 职责：
 * 1. 创建无边框暗色主题窗口
 * 2. 通过 IPC 暴露原生文件系统 API（保存到指定目录、多文件拖拽）
 * 3. 应用菜单（关于/设置默认保存路径）
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ── 默认保存目录（持久化到 userData） ──
const SAVE_DIR_FILE = path.join(app.getPath('userData'), 'save-dir.txt');
let defaultSaveDir = '';

function loadSaveDir() {
  try {
    if (fs.existsSync(SAVE_DIR_FILE)) {
      defaultSaveDir = fs.readFileSync(SAVE_DIR_FILE, 'utf-8').trim();
    }
  } catch (e) { /* ignore */ }
  if (!defaultSaveDir) {
    defaultSaveDir = path.join(app.getPath('pictures'), 'AutoMask-Output');
  }
}

function persistSaveDir(dir) {
  defaultSaveDir = dir;
  try { fs.writeFileSync(SAVE_DIR_FILE, dir, 'utf-8'); } catch (e) { /* ignore */ }
}

// ── 窗口 ──
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: 'Auto Mask Generator v6.0',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#0d0f15',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  // 开发模式自动打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// ── 应用菜单 ──
function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '设置默认保存目录...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: '选择默认保存目录',
              defaultPath: defaultSaveDir,
              properties: ['openDirectory', 'createDirectory']
            });
            if (!result.canceled && result.filePaths[0]) {
              persistSaveDir(result.filePaths[0]);
              mainWindow.webContents.send('save-dir-changed', defaultSaveDir);
            }
          }
        },
        {
          label: '打开保存目录',
          click: () => {
            if (!fs.existsSync(defaultSaveDir)) {
              fs.mkdirSync(defaultSaveDir, { recursive: true });
            }
            shell.openPath(defaultSaveDir);
          }
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'resetZoom', label: '重置缩放' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 Auto Mask Generator',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: 'Auto Mask Generator v6.0',
              detail: [
                '自动 Mask 通道生成器 — 桌面独立版',
                '',
                '功能：5种预设 · 智能主色调分析 · 动态多通道',
                '放大镜精准吸色 · 边缘净化 · 撤销重做',
                'TGA/PNG/ZIP导出 · v5工程兼容',
                '',
                '© 2026 Art Pipeline Team'
              ].join('\n'),
              icon: path.join(__dirname, 'build', 'icon.ico')
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC 处理 ──

// 1. 获取默认保存目录
ipcMain.handle('get-save-dir', () => defaultSaveDir);

// 2. 保存文件到指定目录（直接写盘，无弹窗）
ipcMain.handle('save-file', async (event, { fileName, buffer, askPath }) => {
  try {
    let savePath;

    if (askPath) {
      // 弹出保存对话框（首次或用户主动选择时）
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '保存文件',
        defaultPath: path.join(defaultSaveDir, fileName),
        filters: getFilters(fileName)
      });
      if (result.canceled) return { success: false, reason: 'canceled' };
      savePath = result.filePath;
      // 记住该目录
      persistSaveDir(path.dirname(savePath));
    } else {
      // 静默保存到默认目录
      if (!fs.existsSync(defaultSaveDir)) {
        fs.mkdirSync(defaultSaveDir, { recursive: true });
      }
      savePath = path.join(defaultSaveDir, fileName);
      // 同名文件自动加序号
      if (fs.existsSync(savePath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let n = 1;
        while (fs.existsSync(savePath)) {
          savePath = path.join(defaultSaveDir, `${base}_${n}${ext}`);
          n++;
        }
      }
    }

    fs.writeFileSync(savePath, Buffer.from(buffer));
    return { success: true, path: savePath };
  } catch (err) {
    return { success: false, reason: err.message };
  }
});

// 3. 批量保存多个文件
ipcMain.handle('save-files-batch', async (event, files) => {
  if (!fs.existsSync(defaultSaveDir)) {
    fs.mkdirSync(defaultSaveDir, { recursive: true });
  }
  const results = [];
  for (const { fileName, buffer } of files) {
    try {
      const savePath = path.join(defaultSaveDir, fileName);
      fs.writeFileSync(savePath, Buffer.from(buffer));
      results.push({ fileName, success: true, path: savePath });
    } catch (err) {
      results.push({ fileName, success: false, reason: err.message });
    }
  }
  return results;
});

// 4. 选择目录
ipcMain.handle('choose-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择保存目录',
    defaultPath: defaultSaveDir,
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths[0]) {
    persistSaveDir(result.filePaths[0]);
    return result.filePaths[0];
  }
  return null;
});

// 5. 在文件管理器中显示文件
ipcMain.handle('show-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// 6. 读取拖入的文件（获取完整路径，桌面端特权）
ipcMain.handle('read-dropped-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      success: true,
      name: path.basename(filePath),
      path: filePath,
      ext,
      buffer: buffer.buffer
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
});

// ── 辅助 ──
function getFilters(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png': return [{ name: 'PNG 图片', extensions: ['png'] }];
    case '.tga': return [{ name: 'TGA 图片', extensions: ['tga'] }];
    case '.zip': return [{ name: 'ZIP 压缩包', extensions: ['zip'] }];
    case '.json': return [{ name: 'JSON 文件', extensions: ['json'] }];
    default: return [{ name: '所有文件', extensions: ['*'] }];
  }
}

// ── 启动 ──
app.whenReady().then(() => {
  loadSaveDir();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
