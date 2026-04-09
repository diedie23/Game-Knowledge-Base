# 🤖 Auto Mask Generator v6.0 — 桌面独立版

> 基于 Electron 打包的 Windows 绿色免安装版（Portable .exe）

## 📋 功能特性

- **5种预设模式** — 标准三色角色/头发眼睛/UI精度/特效专用/场景物件
- **智能主色调分析** — Hue-bin 算法自动识别主色域
- **放大镜精准吸色** — 11×11 采样 10x 放大
- **动态多通道** — 支持超过 RGBA 4通道
- **边缘净化** — 膨胀/腐蚀/羽化/净化
- **撤销重做** — Ctrl+Z / Ctrl+Y，最多50步
- **TGA/PNG/ZIP 导出** — 游戏引擎直接可用
- **v5 工程兼容** — 导入 v5 的 config.json 无缝恢复

### 🖥️ 桌面版额外特性

- ✅ **绿色免安装** — 单 .exe 双击即跑
- ✅ **完全离线** — 断网内网环境 100% 可用
- ✅ **原生文件保存** — 自动保存到指定目录，无需每次选择路径
- ✅ **多文件拖拽** — 拖入多张图片自动分配到各通道
- ✅ **可设默认保存目录** — 文件菜单 → 设置默认保存目录

---

## 🔧 开发环境准备

### 1. 安装 Node.js

下载 [Node.js LTS (v20+)](https://nodejs.org/)，安装后验证：

```bash
node -v    # 应显示 v20.x.x
npm -v     # 应显示 10.x.x
```

### 2. 安装依赖

```bash
cd H:\游戏项目知识库\tools\auto-mask-desktop
npm install
```

> 首次安装会下载 Electron (~80MB)，请耐心等待。

### 3. 开发调试

```bash
npm start       # 启动应用
npm run dev      # 启动（自动打开 DevTools）
```

---

## 📦 打包构建

### 方式一：绿色免安装版（推荐）

```bash
npm run build:portable
```

输出：`dist/AutoMaskGenerator-v6.0.0-Portable.exe`

> 单个 .exe 文件，约 80-90MB，双击即跑，不需要安装。

### 方式二：NSIS 安装包

```bash
npm run build:nsis
```

输出：`dist/AutoMaskGenerator-v6.0.0-Setup.exe`

> 带安装向导的标准 Windows 安装程序。

### 方式三：默认（同时输出 Portable）

```bash
npm run build
```

---

## 🎨 自定义品牌配置

### 1. 软件图标（.ico）

将你的图标文件放到 `build/icon.ico`，要求：
- 格式：**ICO**（必须，不能是 PNG）
- 最小尺寸：**256×256**（推荐包含 16/32/48/256 多尺寸）
- 工具推荐：[RealFaviconGenerator](https://realfavicongenerator.net/) 或 PS 导出

如果你只有 PNG，可以用以下方式转换：

```bash
# 安装 png-to-ico（全局工具）
npm install -g png-to-ico

# 将 256x256 PNG 转为 ICO
png-to-ico icon-256.png > build/icon.ico
```

### 2. 修改软件名称和版本

编辑 `package.json`：

```json
{
  "name": "auto-mask-generator",
  "version": "6.0.0",
  "description": "你的描述",
  "build": {
    "productName": "你的软件名",
    "copyright": "Copyright © 2026 你的团队名"
  }
}
```

### 3. 修改 appId

```json
"build": {
  "appId": "com.yourcompany.auto-mask-generator"
}
```

---

## 📁 项目结构

```
auto-mask-desktop/
├── package.json            # 项目配置 + electron-builder 打包配置
├── main.js                 # Electron 主进程
├── preload.js              # 安全桥接（IPC）
├── app/
│   ├── index.html          # v6.0 离线化版本
│   └── jszip.min.js        # JSZip 本地副本
├── build/
│   └── icon.ico            # 软件图标
├── dist/                   # 打包输出目录（自动生成）
└── README.md               # 本文件
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` | 重做 |
| `B` | 画笔模式 |
| `E` | 橡皮模式 |
| `N` | 净化画笔 |
| `[` / `]` | 减小/增大画笔 |
| `1-9` | 快速切换通道 |
| `Ctrl+Shift+S` | 设置保存目录 |

---

## 🔄 更新 Web 版代码

当 Web 版 `auto-mask-v6.html` 有更新时，同步到桌面版：

1. 复制 `auto-mask-v6.html` 到 `app/index.html`
2. 替换 CDN JSZip 为本地 `<script src="jszip.min.js"></script>`
3. 移除末尾的 `<script src="editor-kit.js"></script>`
4. 添加桌面增强层脚本（参考现有 index.html 末尾的 M.Desktop 代码块）

---

*Auto Mask Generator v6.0 Desktop — Built with ❤️ by Art Pipeline Team*
