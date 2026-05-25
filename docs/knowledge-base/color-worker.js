/**
 * ═══════════════════════════════════════════════════════
 *   色彩计算 Web Worker v1.0
 *   用于 Mask 手动编辑器 & 换色资源生成器
 *   支持：genMask（色差Mask生成）、batchMask（批量重算）
 * ═══════════════════════════════════════════════════════
 */
'use strict';

/* ─── 色彩转换算法 ─── */
function rgbToLab(r,g,b){
  let rl=r/255,gl=g/255,bl=b/255;
  rl=rl>.04045?((rl+.055)/1.055)**2.4:rl/12.92;
  gl=gl>.04045?((gl+.055)/1.055)**2.4:gl/12.92;
  bl=bl>.04045?((bl+.055)/1.055)**2.4:bl/12.92;
  let x=(rl*.4124564+gl*.3575761+bl*.1804375)/.95047;
  let y=rl*.2126729+gl*.7151522+bl*.072175;
  let z=(rl*.0193339+gl*.119192+bl*.9503041)/1.08883;
  const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;
  x=f(x);y=f(y);z=f(z);
  return[116*y-16,500*(x-y),200*(y-z)];
}

function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  let h=0,s=0,l=(mx+mn)/2;
  if(mx!==mn){
    const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
    switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break}
    h*=60;
  }
  return[h,s,l];
}

function labDist(L1,a1,b1,L2,a2,b2){
  return Math.sqrt((L1-L2)**2+(a1-a2)**2+(b1-b2)**2);
}

function hslDist(h1,s1,l1,h2,s2,l2){
  let dh=Math.abs(h1-h2);if(dh>180)dh=360-dh;
  return Math.sqrt(dh*dh*.5+(Math.abs(s1-s2)*100)**2+(Math.abs(l1-l2)*100)**2);
}

function cDist(r1,g1,b1,r2,g2,b2,sp){
  if(sp==='lab'){
    const[L1,a1,B1]=rgbToLab(r1,g1,b1);
    const[L2,a2,B2]=rgbToLab(r2,g2,b2);
    return labDist(L1,a1,B1,L2,a2,B2);
  }
  const[h1,s1,l1]=rgbToHsl(r1,g1,b1);
  const[h2,s2,l2]=rgbToHsl(r2,g2,b2);
  return hslDist(h1,s1,l1,h2,s2,l2);
}

/* ─── 消息处理 ─── */
self.onmessage = function(e){
  const msg = e.data;
  
  switch(msg.type){
    case 'genMask': {
      // 单通道 Mask 生成（色差容差）
      const {imgData, targetColor, tolerance, feather, colorSpace, width, height, id} = msg;
      const [tr,tg,tb] = targetColor;
      const mask = new Uint8Array(width * height);
      const d = imgData; // Uint8ClampedArray
      const total = d.length / 4;
      let lastProgress = 0;
      
      for(let i=0; i<total; i++){
        const id4 = i*4;
        if(d[id4+3]<10) continue; // 跳过透明
        const dist = cDist(d[id4],d[id4+1],d[id4+2], tr,tg,tb, colorSpace);
        if(dist <= tolerance) mask[i] = 255;
        else if(feather>0 && dist <= tolerance+feather)
          mask[i] = Math.round((1-(dist-tolerance)/feather)*255);
        
        // 每 10% 报告进度
        const progress = Math.floor(i/total*10)*10;
        if(progress > lastProgress){ lastProgress=progress; self.postMessage({type:'progress',id,progress}); }
      }
      
      self.postMessage({type:'maskResult', id, mask: mask.buffer}, [mask.buffer]);
      break;
    }
    
    case 'batchMask': {
      // 批量重算所有通道（方案切换/容差调整后）
      const {imgData, channels, tolerance, feather, colorSpace, width, height, id} = msg;
      const d = imgData;
      const total = d.length / 4;
      const results = [];
      
      for(let ci=0; ci<channels.length; ci++){
        const ch = channels[ci];
        if(!ch.color) { results.push(null); continue; }
        const [tr,tg,tb] = ch.color;
        const mask = new Uint8Array(width*height);
        
        for(let i=0; i<total; i++){
          const id4=i*4;
          if(d[id4+3]<10) continue;
          const dist=cDist(d[id4],d[id4+1],d[id4+2],tr,tg,tb,colorSpace);
          if(dist<=tolerance) mask[i]=255;
          else if(feather>0&&dist<=tolerance+feather)
            mask[i]=Math.round((1-(dist-tolerance)/feather)*255);
        }
        results.push(mask);
      }
      
      // 通道互斥处理（同 maskIndex 内）
      for(let ci=0; ci<channels.length; ci++){
        if(!results[ci]) continue;
        const mi = channels[ci].mi;
        for(let oi=0; oi<channels.length; oi++){
          if(oi===ci || !results[oi] || channels[oi].mi!==mi) continue;
          // 后生成的通道优先级更高，清除之前通道的重叠
          if(oi<ci){
            for(let px=0;px<width*height;px++){
              if(results[ci][px]>0 && results[oi][px]>0) results[oi][px]=0;
            }
          }
        }
      }
      
      const transfers = results.filter(r=>r).map(r=>r.buffer);
      self.postMessage({type:'batchResult', id, results: results.map(r=>r?r.buffer:null)}, transfers);
      break;
    }
    
    case 'qaCheck': {
      // QA 纯黑/纯白像素检测
      const {imgData, mask, width, height, id} = msg;
      const d = imgData;
      let hasBlack=false, hasWhite=false;
      
      for(let i=0; i<width*height; i++){
        if(!mask[i]) continue;
        const id4=i*4;
        const lum = d[id4]*.299 + d[id4+1]*.587 + d[id4+2]*.114;
        if(lum<3) hasBlack=true;
        if(lum>252) hasWhite=true;
        if(hasBlack&&hasWhite) break;
      }
      
      self.postMessage({type:'qaResult', id, hasBlack, hasWhite});
      break;
    }

    case 'overlayB': {
      // ═══ P2: 方案B调色板替换 Worker 加速 ═══
      const {imgData, palette, tolerance, width, height, id} = msg;
      const d = imgData;
      const total = width * height;
      const tolSq = tolerance * tolerance;
      const palLen = palette.length;
      // 预解析调色板
      const palOr = new Array(palLen), palRp = new Array(palLen);
      for(let k=0; k<palLen; k++){
        palOr[k] = palette[k].original;
        palRp[k] = palette[k].replace;
      }
      // 生成 overlay RGBA buffer
      const overlay = new Uint8Array(total * 4);
      for(let i=0; i<total; i++){
        const idx = i*4;
        if(d[idx+3] < 10) continue;
        const pr=d[idx], pg=d[idx+1], pb=d[idx+2];
        for(let k=0; k<palLen; k++){
          const [or,og,ob] = palOr[k];
          const dr=pr-or, dg=pg-og, db=pb-ob;
          if(dr*dr+dg*dg+db*db <= tolSq){
            const [rr,rg,rb] = palRp[k];
            overlay[idx]=rr; overlay[idx+1]=rg; overlay[idx+2]=rb; overlay[idx+3]=140;
            break;
          }
        }
      }
      self.postMessage({type:'overlayBResult', id, overlay: overlay.buffer}, [overlay.buffer]);
      break;
    }
  }
};
