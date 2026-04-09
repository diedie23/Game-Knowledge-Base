/**
 * sync-online-to-desktop.js
 * 将在线版 Auto Mask Generator 自动同步到桌面版 Electron 项目
 * 
 * 用法: node tools/sync-online-to-desktop.js
 * 
 * 工作原理:
 * 1. 读取 docs/knowledge-base/auto-mask-v6.html (在线版)
 * 2. 适配为桌面版 (修改 title、移除在线专属内容)
 * 3. 追加桌面端增强层 (M.Desktop 模块)
 * 4. 写入 tools/auto-mask-desktop/app/index.html
 * 5. 更新 main.js 和 package.json 版本号
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ONLINE = path.join(REPO, 'docs', 'knowledge-base', 'auto-mask-v6.html');
const DESKTOP_HTML = path.join(REPO, 'tools', 'auto-mask-desktop', 'app', 'index.html');
const DESKTOP_ENHANCEMENT = path.join(REPO, 'tools', 'auto-mask-desktop', 'desktop-enhancement.html');
const MAIN_JS = path.join(REPO, 'tools', 'auto-mask-desktop', 'main.js');
const PACKAGE_JSON = path.join(REPO, 'tools', 'auto-mask-desktop', 'package.json');

console.log('=== Auto Mask: Online -> Desktop Sync ===');

// 1. 读取在线版
if (!fs.existsSync(ONLINE)) {
  console.error('在线版文件不存在:', ONLINE);
  process.exit(1);
}
let content = fs.readFileSync(ONLINE, 'utf-8');
const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
console.log(`[1/6] 已读取在线版 (${sizeKB} KB)`);

// 2. 提取版本号
const verMatch = content.match(/<title>[^<]*v(\d+\.\d+)[^<]*<\/title>/);
const version = verMatch ? verMatch[1] : '6.3';
console.log(`[2/6] 检测到版本: v${version}`);

// 3. 适配为桌面版

// 3a. 替换 title
content = content.replace(/<title>[^<]*<\/title>/, `<title>Auto Mask Generator v${version} — Desktop</title>`);

// 3b. 移除 editor-kit.js 引用（在线版知识库专用）
content = content.replace(/<script src="editor-kit\.js"><\/script>\s*/g, '');

// 3c. 移除在线版的桌面版推广横幅
content = content.replace(/<div style="background:linear-gradient[^>]*>[\s\S]*?桌面版已上线[\s\S]*?<\/a><\/div>\s*/g, '');

// 3d. 确保 JSZip 引用为本地文件
if (!content.includes('src="jszip.min.js"')) {
  content = content.replace('</body>', '<script src="jszip.min.js"></script>\n</body>');
}

console.log('[3/6] 已适配在线版代码');

// 4. 读取并追加桌面端增强层
if (!fs.existsSync(DESKTOP_ENHANCEMENT)) {
  console.error('桌面端增强层文件不存在:', DESKTOP_ENHANCEMENT);
  console.error('请确保 desktop-enhancement.html 存在');
  process.exit(1);
}
const enhancement = fs.readFileSync(DESKTOP_ENHANCEMENT, 'utf-8');

// 在 </body></html> 之前插入增强层
content = content.replace(/<\/body>\s*<\/html>/, enhancement + '\n</body>\n</html>');

console.log('[4/6] 已追加桌面端增强层');

// 5. 写入桌面版 index.html
const desktopDir = path.dirname(DESKTOP_HTML);
if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
fs.writeFileSync(DESKTOP_HTML, content, 'utf-8');
const newSizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
console.log(`[5/6] 已写入桌面版 (${newSizeKB} KB)`);

// 6. 更新版本号
// main.js
if (fs.existsSync(MAIN_JS)) {
  let mainContent = fs.readFileSync(MAIN_JS, 'utf-8');
  mainContent = mainContent.replace(/Auto Mask Generator v[\d.]+/g, `Auto Mask Generator v${version}`);
  fs.writeFileSync(MAIN_JS, mainContent, 'utf-8');
  console.log(`  -> main.js 版本已更新到 v${version}`);
}

// package.json
if (fs.existsSync(PACKAGE_JSON)) {
  let pkgContent = fs.readFileSync(PACKAGE_JSON, 'utf-8');
  pkgContent = pkgContent.replace(/"version":\s*"[\d.]+"/, `"version": "${version}.0"`);
  pkgContent = pkgContent.replace(/自动 Mask 通道生成器 v[\d.]+/, `自动 Mask 通道生成器 v${version}`);
  fs.writeFileSync(PACKAGE_JSON, pkgContent, 'utf-8');
  console.log(`  -> package.json 版本已更新到 ${version}.0`);
}

console.log(`[6/6] 同步完成! v${version}`);
console.log('');
console.log('文件变更:');
console.log('  [M] tools/auto-mask-desktop/app/index.html');
console.log('  [M] tools/auto-mask-desktop/main.js');
console.log('  [M] tools/auto-mask-desktop/package.json');
