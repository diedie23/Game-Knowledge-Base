/**
 * ═══════════════════════════════════════════════════════
 *   快捷键帮助面板 v1.0
 *   按 ? 或 F1 弹出 · 所有美术在线工具共用
 * ═══════════════════════════════════════════════════════
 */
(function(){
'use strict';

const SHORTCUTS = [
  { cat:'通用操作', items:[
    ['Ctrl+Z','撤销'],['Ctrl+Y / Ctrl+Shift+Z','重做'],
    ['Ctrl+S','保存工程文件'],['Ctrl+E','导出'],
    ['Escape','取消当前操作 / 关闭弹窗'],
    ['?  /  F1','显示本帮助面板']
  ]},
  { cat:'画布操作', items:[
    ['Space + 拖拽','平移画布'],['Ctrl + 滚轮','缩放画布'],
    ['鼠标滚轮','缩放画布'],['双击画布','适应窗口'],
    ['0 / Home','重置缩放100%']
  ]},
  { cat:'绘制工具', items:[
    ['V','选择/移动'],['B','画笔'],['E','橡皮'],
    ['I','吸色'],['M','框选'],['P','钢笔'],
    ['[ / ]','画笔缩小/放大']
  ]},
  { cat:'文件操作', items:[
    ['Ctrl+O','打开/导入文件'],['Ctrl+Shift+S','另存为'],
    ['拖放文件到窗口','快速导入']
  ]}
];

let panel=null, overlay=null, visible=false;

function buildPanel(){
  if(panel)return;
  
  // Overlay
  overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999998;display:none;animation:skFadeIn .2s';
  overlay.onclick=hidePanel;
  document.body.appendChild(overlay);

  // Panel
  panel=document.createElement('div');
  panel.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:#1a1d2b;border:1px solid #333657;border-radius:16px;padding:24px 32px 20px;width:520px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);display:none;animation:skSlideIn .25s ease';
  panel.innerHTML=`
    <style>
      @keyframes skFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes skSlideIn{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
      .sk-title{font-size:18px;color:#e4e6ed;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
      .sk-close{position:absolute;top:16px;right:20px;background:none;border:none;color:#6b7085;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:all .15s}
      .sk-close:hover{color:#e4e6ed;background:rgba(108,140,255,.1)}
      .sk-cat{font-size:12px;font-weight:700;color:#6c8cff;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid #262a3a}
      .sk-row{display:flex;align-items:center;padding:4px 0;gap:12px}
      .sk-key{min-width:170px;display:flex;gap:4px;flex-wrap:wrap}
      .sk-kbd{background:#0d0f15;border:1px solid #3d4155;border-radius:5px;padding:2px 8px;font-size:11px;font-family:'JetBrains Mono','Fira Code',monospace;color:#a78bfa;white-space:nowrap}
      .sk-desc{font-size:12px;color:#c5c9d6}
      .sk-foot{margin-top:16px;padding-top:10px;border-top:1px solid #262a3a;font-size:11px;color:#6b7085;text-align:center}
    </style>
    <div class="sk-title">⌨️ 快捷键速查</div>
    <button class="sk-close" id="skClose">✕</button>
    ${SHORTCUTS.map(s=>`
      <div class="sk-cat">${s.cat}</div>
      ${s.items.map(([key,desc])=>`
        <div class="sk-row">
          <div class="sk-key">${key.split(/\s*\/\s*/).map(k=>'<span class="sk-kbd">'+k.trim()+'</span>').join('')}</div>
          <div class="sk-desc">${desc}</div>
        </div>
      `).join('')}
    `).join('')}
    <div class="sk-foot">按 <span class="sk-kbd">Esc</span> 或点击空白处关闭 · 不同工具可能有额外专属快捷键</div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#skClose').onclick=hidePanel;
}

function showPanel(){
  buildPanel();
  overlay.style.display='block';
  panel.style.display='block';
  visible=true;
}

function hidePanel(){
  if(!panel)return;
  overlay.style.display='none';
  panel.style.display='none';
  visible=false;
}

function togglePanel(){
  if(visible)hidePanel();else showPanel();
}

document.addEventListener('keydown',function(e){
  // 不在输入框中才响应 ?
  const tag=document.activeElement?.tagName;
  const isInput=tag==='INPUT'||tag==='TEXTAREA'||document.activeElement?.isContentEditable;
  
  if(e.key==='F1'){e.preventDefault();togglePanel();return}
  if(e.key==='?'&&!isInput){e.preventDefault();togglePanel();return}
  if(e.key==='Escape'&&visible){e.preventDefault();hidePanel();return}
});

// 暴露 API
window.showShortcutHelp=showPanel;
window.hideShortcutHelp=hidePanel;

})();
