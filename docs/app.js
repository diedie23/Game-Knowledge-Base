// ═══ Markdown Parser ═══
function parseMd(md){let h=md;h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l,c)=>`<pre><code>${esc(c.trim())}</code></pre>`);h=h.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(_,hdr,sep,body)=>{const ths=hdr.split('|').filter(c=>c.trim()).map(c=>`<th>${il(c.trim())}</th>`).join('');const rows=body.trim().split('\n').map(r=>{const tds=r.split('|').filter(c=>c.trim()).map(c=>`<td>${il(c.trim())}</td>`).join('');return`<tr>${tds}</tr>`;}).join('');return`<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;});h=h.replace(/^#### (.+)$/gm,'<h4>$1</h4>');h=h.replace(/^### (.+)$/gm,(_,t)=>`<h3 id="${sl(t)}">${il(t)}</h3>`);h=h.replace(/^## (.+)$/gm,(_,t)=>`<h2 id="${sl(t)}">${il(t)}</h2>`);h=h.replace(/^# (.+)$/gm,(_,t)=>`<h1>${il(t)}</h1>`);h=h.replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');h=h.replace(/<\/blockquote>\n<blockquote>/g,'<br>');h=h.replace(/^---$/gm,'<hr>');h=h.replace(/^- \[( |x)\] (.+)$/gm,(_,c,t)=>`<p><input type="checkbox"${c==='x'?' checked':''} disabled>${il(t)}</p>`);h=h.replace(/^- (.+)$/gm,'<li>$1</li>');h=h.replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m}</ul>`);h=h.replace(/^\d+\. (.+)$/gm,'<li>$1</li>');h=h.replace(/^(?!<[a-z/])((?!<).+)$/gm,m=>m.trim()?`<p>${il(m)}</p>`:m);h=h.replace(/<p><\/p>/g,'');return h;}
function il(t){t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');t=t.replace(/`([^`]+)`/g,'<code>$1</code>');return t;}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sl(t){return t.replace(/[^\w\u4e00-\u9fff]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');}

// ═══ Data & State ═══
const docs={};
const meta={'d1':{cat:'角色',title:'2D UGC 角色出图规范'},'d2':{cat:'角色',title:'2D 角色换色资源规范'}};
let curPage='home';
let fuse=null;

const iframePages={
  'ui-slice-naming':'knowledge-base/ui-slice-naming.html',
  'ui-9slice-color':'knowledge-base/ui-9slice-color.html',
  'ui-layout':'knowledge-base/ui-layout.html',
  'ui-umg-tips':'knowledge-base/ui-umg-tips.html',
  'cp-management':'knowledge-base/cp-management.html',
  'game-art-pipeline':'knowledge-base/md-viewer.html?file=game-art-pipeline.md'
};

const toolData={
  'auto-mask':{icon:'🤖',iconBg:'var(--green-bg)',name:'自动 Mask 通道生成器',ver:'v2.0',status:'online',subtitle:'LAB 色彩空间 K-Means++ 聚类 · 一键生成换色遮罩图',desc:'上传角色原图后，工具自动在 LAB 色彩空间中通过 K-Means++ 聚类识别颜色区域，3 秒内生成 RGBA 换色遮罩图。内置通道互斥检测、纯黑/纯白自动修复、质量评分。',pain:'角色换色 Mask 遮罩图过去全靠美术手工在 PS 中逐通道绘制，一张图平均耗时 30~60 分钟。外包 CP 经常交付出错，返工率高达 40%。',solution:'上传原图后 3 秒自动完成颜色区域识别与通道分配，内置自动修复，零 PS 基础也能产出合格 Mask。',tags:['在线工具','自动验算','K-Means++','通道互斥','质量评分'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/auto-mask.html'},
  'mask-tool':{icon:'🖌️',iconBg:'var(--orange-bg)',name:'Mask 手动编辑器',ver:'v1.0',status:'online',subtitle:'画笔 / 油漆桶 / 橡皮擦 · 实时四通道预览',desc:'专为 Mask 精修设计的轻量编辑器。导入原图后直接在浏览器中用画笔逐通道绘制或修改，R/G/B/A 四通道独立显示并可实时预览换色效果。',pain:'自动生成的 Mask 有时无法精确覆盖复杂区域，需要人工微调。但 PS 操作门槛高。',solution:'专为 Mask 编辑设计的轻量工具，导入原图后浏览器中画笔逐通道绘制，实时预览换色效果。',tags:['在线工具','画笔绘制','RGBA预览','所见即所得'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/mask-tool.html'},
  'spine-split':{icon:'✂️',iconBg:'var(--purple-bg)',name:'Spine 角色拆分工具',ver:'v1.0',status:'online',subtitle:'矩形 / 套索 / 魔棒选区 · 拓扑延展 · Atlas 导出',desc:'上传角色原画后，使用选区工具圈选各部件，工具自动裁切并执行拓扑延展，最终导出含 Atlas 图集 + Spine JSON 配置的 ZIP 包。',pain:'Spine 动画要求角色原画按部件拆分，传统流程依赖 PS 手动裁切+补边，一张角色拆分 2~4 小时。',solution:'选区工具圈选部件，工具自动裁切+拓扑延展，导出 Atlas + Spine JSON ZIP 包。',tags:['在线工具','选区拆分','拓扑延展','Atlas导出','Spine兼容'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/spine-split.html'}
};

const catMap={'d1':'cat-character','d2':'cat-character','auto-mask':'cat-character','mask-tool':'cat-character','spine-split':'cat-character','ui-slice-naming':'cat-ui','ui-9slice-color':'cat-ui','ui-layout':'cat-ui','ui-umg-tips':'cat-ui','cp-management':'cat-mgmt','game-art-pipeline':'cat-mgmt'};

// ═══ Loading Bar ═══
function showLoading(){const b=document.getElementById('loadingBar');b.style.width='0';b.classList.add('on');setTimeout(()=>{b.style.width='60%'},50);}
function hideLoading(){const b=document.getElementById('loadingBar');b.style.width='100%';setTimeout(()=>{b.classList.remove('on');b.style.width='0'},300);}

// ═══ Core Navigation ═══
function navigate(pageId,btn){
  curPage=pageId;
  location.hash=pageId==='home'?'':pageId;
  const scroll=document.getElementById('contentScroll');
  const frame=document.getElementById('contentFrame');
  const home=document.getElementById('pageHome');
  const tp=document.getElementById('page-tool');

  // Hide everything
  home.style.display='none';
  document.querySelectorAll('.doc-page').forEach(p=>{p.style.display='none';p.classList.remove('active');});
  tp.style.display='none';tp.classList.remove('active');
  frame.style.display='none';
  scroll.style.display='none';
  document.querySelectorAll('.toc-box').forEach(t=>{t.classList.remove('open');t.innerHTML='';});

  if(pageId==='home'){
    scroll.style.display='block';home.style.display='block';scroll.scrollTop=0;
  } else if(docs[pageId]){
    showLoading();scroll.style.display='block';
    const pg=document.getElementById(`page-${pageId}`);
    if(pg){pg.style.display='block';pg.classList.add('active');const ct=document.getElementById(`ct-${pageId}`);if(!ct.innerHTML.trim())ct.innerHTML=parseMd(docs[pageId]);}
    buildToc(pageId);scroll.scrollTop=0;setTimeout(hideLoading,400);
  } else if(toolData[pageId]){
    showLoading();scroll.style.display='block';renderToolPage(pageId);
    tp.style.display='block';tp.classList.add('active');scroll.scrollTop=0;setTimeout(hideLoading,400);
  } else if(iframePages[pageId]){
    showLoading();frame.style.display='block';frame.src=iframePages[pageId];
    frame.onload=()=>hideLoading();setTimeout(hideLoading,3000);
  }
  updateNavActive(pageId,btn);
  document.querySelector('.sidebar').classList.remove('open');
}

// ═══ Render Tool Card Page ═══
function renderToolPage(id){
  const d=toolData[id],c=document.getElementById('page-tool');
  if(!d)return;
  let tags='';d.tags.forEach(t=>{tags+=`<span class="tag">${t}</span>`;});
  c.innerHTML=`<div class="doc-bc"><a onclick="navigate('home')">🏠 首页</a><span>›</span><span>角色 · 工具</span><span>›</span><span>${d.name}</span></div>
  <div class="tcv"><div class="tcv-h"><div class="tcv-icon" style="background:${d.iconBg}">${d.icon}</div><div class="tcv-ta"><h2>${d.name} <span class="ver">${d.ver}</span> <span class="st-on">🟢 在线</span></h2><div class="tcv-sub">${d.subtitle}</div></div></div>
  <div class="tcv-b"><div class="tcv-desc">${d.desc}</div>
  <div class="tcv-demo"><span>🎬 功能演示区域 · 可配置 GIF/视频</span></div>
  <div class="tcv-st">🔥 解决的实际问题</div>
  <div class="tcv-pain"><div class="lb">❌ BEFORE</div><p>${d.pain}</p></div>
  <div class="tcv-sol"><div class="lb">✅ AFTER</div><p>${d.solution}</p></div>
  <div class="tcv-st">🏷️ 功能标签</div><div class="tcv-tags">${tags}</div>
  <div class="tcv-meta"><span class="mi">${d.env}</span><span class="mi">💻 ${d.platform}</span><span class="mi">📦 ${d.install}</span><span class="mi">📅 ${d.date}</span></div>
  <div class="tcv-acts"><button class="tbtn tbtn-p" onclick="openToolFrame('${id}')">🚀 在右侧打开工具</button><button class="tbtn tbtn-o" onclick="window.open('${d.url}','_blank')">↗ 新窗口打开</button></div></div></div>`;
}

function openToolFrame(id){
  const d=toolData[id];if(!d)return;showLoading();
  const f=document.getElementById('contentFrame'),s=document.getElementById('contentScroll');
  s.style.display='none';f.style.display='block';f.src=d.url;
  f.onload=()=>hideLoading();setTimeout(hideLoading,3000);
}

// ═══ Nav Active State ═══
function updateNavActive(pageId,btn){
  document.querySelectorAll('.leaf').forEach(n=>n.classList.remove('active'));
  document.querySelector('.nav-home').classList.remove('active');
  if(pageId==='home'){document.querySelector('.nav-home').classList.add('active');return;}
  if(btn&&btn.classList.contains('leaf')){btn.classList.add('active');}
  else{document.querySelectorAll('.leaf[data-page]').forEach(n=>{if(n.dataset.page===pageId)n.classList.add('active');});}
  // Auto-expand parent categories
  if(catMap[pageId]){const cat=document.getElementById(catMap[pageId]);if(cat&&!cat.classList.contains('open'))cat.classList.add('open');}
  const al=document.querySelector('.leaf.active');
  if(al){const l2=al.closest('.t2');if(l2&&!l2.classList.contains('open'))l2.classList.add('open');}
}

// ═══ TOC (Level 4 anchors) ═══
function buildToc(docId){
  document.querySelectorAll('.toc-box').forEach(t=>{t.classList.remove('open');t.innerHTML='';});
  const tc=document.getElementById(`toc-${docId}`);if(!tc)return;
  const ct=document.getElementById(`ct-${docId}`);if(!ct)return;
  const hs=ct.querySelectorAll('h2');if(!hs.length)return;
  let html='';
  hs.forEach(h=>{
    const id=h.getAttribute('id')||'';
    html+=`<button class="toc-a" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('.toc-a').forEach(t=>t.classList.remove('active'));this.classList.add('active')">${h.textContent}</button>`;
  });
  tc.innerHTML=html;tc.classList.add('open');
}

// ═══ Search ═══
async function initSearch(){
  try{
    const res=await fetch('index.json');if(!res.ok)return;
    const data=await res.json();
    const items=[];
    for(const[id,md]of Object.entries(docs)){const m=meta[id]||{};items.push({id,title:m.title||id,type:'doc',content:md,action:'navigate'});}
    if(data&&data.categories){data.categories.forEach(cat=>{cat.items.forEach(item=>{items.push({id:item.id,title:item.title,type:item.type,content:item.desc+' '+item.tags.join(' '),action:'navigate',cat:cat.name});});});}
    fuse=new Fuse(items,{keys:[{name:'title',weight:3},{name:'content',weight:1}],threshold:0.35,includeMatches:true,minMatchCharLength:1});
  }catch(e){console.log('Search init skipped:',e);}
}

function handleSearch(q){
  const dd=document.getElementById('searchDropdown');q=q.trim();
  if(!q){dd.classList.remove('show');dd.innerHTML='';return;}
  if(!fuse){dd.classList.remove('show');return;}
  const results=fuse.search(q).slice(0,10);
  if(!results.length){dd.innerHTML='<div style="padding:14px;text-align:center;color:var(--dim);font-size:13px">未找到相关内容</div>';dd.classList.add('show');return;}
  let html='';
  results.forEach(r=>{
    const item=r.item;
    const typeCls=item.type==='tool'?'background:rgba(74,222,128,.08);color:#4ade80':'background:rgba(108,140,255,.08);color:#6c8cff';
    const typeLabel=item.type==='tool'?'工具':'文档';
    html+=`<div class="sr-item" onmousedown="navigate('${item.id}');document.getElementById('searchDropdown').classList.remove('show');document.getElementById('searchInput').value=''"><span class="sr-type" style="${typeCls}">${typeLabel}</span><span class="sr-title">${item.title}</span></div>`;
  });
  dd.innerHTML=html;dd.classList.add('show');
}

// ═══ Utilities ═══
function copyShareLink(){navigator.clipboard.writeText(location.href).then(()=>showToast('链接已复制')).catch(()=>showToast('复制失败'));}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000);}

function showFeedback(){
  let d=document.getElementById('feedbackDialog');
  if(!d){
    d=document.createElement('div');d.id='feedbackDialog';d.className='fb-overlay';
    d.innerHTML=`<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:28px 32px;max-width:460px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,.4)">
      <h3 style="color:var(--heading);font-size:18px;margin-bottom:16px">📮 反馈与建议</h3>
      <textarea id="feedbackText" rows="4" style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;outline:none" placeholder="描述问题或建议..."></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button onclick="document.getElementById('feedbackDialog').classList.remove('show')" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:inherit;font-size:13px">取消</button>
        <button onclick="submitFeedback()" style="padding:8px 18px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500">提交</button>
      </div></div>`;
    document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d)d.classList.remove('show');});
  }
  d.classList.add('show');
}
function submitFeedback(){
  const text=document.getElementById('feedbackText').value.trim();
  if(!text){showToast('请输入内容');return;}
  const fb=JSON.parse(localStorage.getItem('kb_feedback')||'[]');
  fb.push({text,time:new Date().toISOString(),page:curPage});
  localStorage.setItem('kb_feedback',JSON.stringify(fb));
  document.getElementById('feedbackDialog').classList.remove('show');
  showToast('✅ 感谢反馈！');
}

// ═══ Scroll & Keyboard ═══
const scrollEl=document.getElementById('contentScroll');
scrollEl.addEventListener('scroll',()=>{
  document.getElementById('backToTop').classList.toggle('show',scrollEl.scrollTop>300);
  const hs=document.querySelectorAll('.doc-page.active h2');
  const ts=document.querySelectorAll('.toc-a');
  let ai=0;hs.forEach((h,i)=>{if(h.getBoundingClientRect().top<100)ai=i;});
  ts.forEach((t,i)=>t.classList.toggle('active',i===ai));
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){const fb=document.getElementById('feedbackDialog');if(fb)fb.classList.remove('show');}
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();document.getElementById('searchInput').focus();}
});

window.addEventListener('hashchange',()=>{
  const hash=location.hash.slice(1)||'home';
  if(hash!==curPage)navigate(hash);
});

// ═══ Init ═══
(function(){
  document.querySelectorAll('script[type="text/markdown"]').forEach(el=>{
    const id=el.id.replace('md-','');
    docs[id]=el.textContent.trim();
  });
  const hash=location.hash.slice(1);
  if(hash)navigate(hash);
  initSearch();
})();
