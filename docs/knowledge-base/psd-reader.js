/**
 * ═══════════════════════════════════════════════════════
 *   PSD 直读模块 v1.0 — 轻量 PSD 解析
 *   支持：解析图层结构、合并可见图层、单图层导出
 *   使用 ag-psd 库 (CDN 按需加载)
 * ═══════════════════════════════════════════════════════
 */
(function(){
'use strict';

const AG_PSD_CDN='https://cdn.jsdelivr.net/npm/ag-psd@19.2.0/dist/browser.min.js';
const AG_PSD_CDN_FALLBACK='https://unpkg.com/ag-psd@19.2.0/dist/browser.min.js';
let agPsd=null;
let loading=false;
const loadCallbacks=[];

function _loadScript(url){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=url;
    s.onload=()=>resolve(true);s.onerror=()=>resolve(false);
    document.head.appendChild(s);
  });
}

function loadLib(cb){
  if(agPsd){cb(agPsd);return}
  loadCallbacks.push(cb);
  if(loading)return;
  loading=true;
  // ═══ P3: 双 CDN fallback ═══
  _loadScript(AG_PSD_CDN).then(ok=>{
    if(!ok) return _loadScript(AG_PSD_CDN_FALLBACK);
    return true;
  }).then(ok2=>{
    agPsd=window.agPsd||window['ag-psd'];
    if(!agPsd&&window.readPsd){agPsd={readPsd:window.readPsd}}
    loading=false;
    if(agPsd){loadCallbacks.forEach(fn=>fn(agPsd))}
    else{loadCallbacks.forEach(fn=>fn(null))}
    loadCallbacks.length=0;
  });
}

/**
 * 解析 PSD 文件 → 返回 {width, height, layers[], mergedCanvas}
 * @param {File} file - PSD 文件
 * @returns {Promise<{width,height,layers:{name,visible,canvas}[],mergedCanvas:HTMLCanvasElement}>}
 */
function parsePSD(file){
  return new Promise((resolve,reject)=>{
    if(!file||!file.name.toLowerCase().endsWith('.psd')){
      reject(new Error('不是 PSD 文件'));return;
    }
    const reader=new FileReader();
    reader.onload=e=>{
      loadLib(lib=>{
        if(!lib){reject(new Error('PSD解析库加载失败，请检查网络'));return}
        try{
          const buffer=new Uint8Array(e.target.result);
          const psd=lib.readPsd(buffer,{skipLayerImageData:false,skipThumbnail:true});
          
          // 提取图层
          const layers=[];
          function walkLayers(children,prefix){
            if(!children)return;
            for(const child of children){
              if(child.children){
                walkLayers(child.children,prefix+(child.name||'Group')+'/');
              }else if(child.canvas){
                layers.push({
                  name:prefix+child.name,
                  visible:child.hidden!==true,
                  canvas:child.canvas,
                  left:child.left||0,
                  top:child.top||0,
                  width:child.canvas.width,
                  height:child.canvas.height,
                  opacity:(child.opacity!=null?child.opacity/255:1)
                });
              }
            }
          }
          walkLayers(psd.children,'');
          
          // 合并画布
          const mc=document.createElement('canvas');
          mc.width=psd.width;mc.height=psd.height;
          const mx=mc.getContext('2d');
          // 如果有 psd.canvas (合成结果)
          if(psd.canvas){
            mx.drawImage(psd.canvas,0,0);
          }else{
            // 手动合并可见图层
            for(const l of layers){
              if(!l.visible)continue;
              mx.globalAlpha=l.opacity;
              mx.drawImage(l.canvas,l.left,l.top);
            }
            mx.globalAlpha=1;
          }
          
          resolve({width:psd.width,height:psd.height,layers,mergedCanvas:mc});
        }catch(err){
          reject(new Error('PSD 解析错误: '+err.message));
        }
      });
    };
    reader.onerror=()=>reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 显示 PSD 图层选择弹窗
 * @param {object} psdData - parsePSD 的返回值
 * @param {function} onSelect - 回调(selectedCanvas) 
 */
function showLayerPicker(psdData, onSelect){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999999;display:flex;align-items:center;justify-content:center';
  
  const box=document.createElement('div');
  box.style.cssText='background:#1a1d2b;border:1px solid #333657;border-radius:14px;padding:20px 24px;width:480px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)';
  
  let html=`<div style="font-size:16px;color:#e4e6ed;font-weight:700;margin-bottom:12px">📂 PSD 图层选择</div>`;
  html+=`<div style="font-size:11px;color:#6b7085;margin-bottom:12px">${psdData.width}×${psdData.height} · ${psdData.layers.length} 个图层</div>`;
  html+=`<div style="display:flex;gap:6px;margin-bottom:12px"><button id="_psdMerge" style="padding:6px 14px;border:none;border-radius:6px;background:#6c8cff;color:#fff;font-weight:600;cursor:pointer;font-size:12px">✅ 使用合并结果</button></div>`;
  html+=`<div style="font-size:11px;color:#6b7085;margin-bottom:6px">或选择单个图层：</div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:4px">`;
  
  psdData.layers.forEach((l,i)=>{
    const vis=l.visible?'👁':'🚫';
    html+=`<div class="_psd-layer" data-i="${i}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #262a3a;border-radius:6px;cursor:pointer;transition:all .15s;${l.visible?'':'opacity:.5'}" onmouseover="this.style.borderColor='#6c8cff'" onmouseout="this.style.borderColor='#262a3a'">
      <span style="font-size:11px">${vis}</span>
      <span style="font-size:12px;color:#e4e6ed;flex:1">${l.name}</span>
      <span style="font-size:10px;color:#6b7085">${l.width}×${l.height}</span>
    </div>`;
  });
  html+=`</div>`;
  html+=`<div style="margin-top:12px;text-align:right"><button id="_psdCancel" style="padding:6px 14px;border:1px solid #333657;border-radius:6px;background:transparent;color:#8b8fa3;cursor:pointer;font-size:12px">取消</button></div>`;
  
  box.innerHTML=html;
  ov.appendChild(box);
  document.body.appendChild(ov);
  
  // 使用合并结果
  box.querySelector('#_psdMerge').onclick=()=>{document.body.removeChild(ov);onSelect(psdData.mergedCanvas)};
  // 取消
  box.querySelector('#_psdCancel').onclick=()=>{document.body.removeChild(ov);onSelect(null)};
  ov.onclick=e=>{if(e.target===ov){document.body.removeChild(ov);onSelect(null)}};
  
  // 图层点击
  box.querySelectorAll('._psd-layer').forEach(el=>{
    el.onclick=()=>{
      const idx=parseInt(el.dataset.i);
      const layer=psdData.layers[idx];
      // 创建全尺寸画布
      const c=document.createElement('canvas');
      c.width=psdData.width;c.height=psdData.height;
      const cx=c.getContext('2d');
      cx.drawImage(layer.canvas,layer.left,layer.top);
      document.body.removeChild(ov);
      onSelect(c);
    };
  });
}

/**
 * 一键处理 PSD：解析 + 弹窗选择 + 回调
 * @param {File} file
 * @param {function} onCanvas - (HTMLCanvasElement)=>void
 * @param {function} onError - (string)=>void
 */
function handlePSD(file, onCanvas, onError){
  parsePSD(file).then(psdData=>{
    if(psdData.layers.length===0){
      // 无图层，直接用合并结果
      onCanvas(psdData.mergedCanvas);
    }else{
      showLayerPicker(psdData, canvas=>{
        if(canvas) onCanvas(canvas);
      });
    }
  }).catch(err=>{
    if(onError) onError(err.message);
    else console.error(err);
  });
}

// 暴露 API
window.PSDReader={parsePSD, showLayerPicker, handlePSD};

})();
