// ═══ Markdown Parser ═══
function parseMd(md){let h=md;h=h.replace(/```(\w*)\n([\s\S]*?)```/g,(_,l,c)=>'<pre><code>'+esc(c.trim())+'</code></pre>');h=h.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(_,hdr,sep,body)=>{const ths=hdr.split('|').filter(c=>c.trim()).map(c=>'<th>'+il(c.trim())+'</th>').join('');const rows=body.trim().split('\n').map(r=>{const tds=r.split('|').filter(c=>c.trim()).map(c=>'<td>'+il(c.trim())+'</td>').join('');return'<tr>'+tds+'</tr>';}).join('');return'<table><thead><tr>'+ths+'</tr></thead><tbody>'+rows+'</tbody></table>';});h=h.replace(/^#### (.+)$/gm,'<h4>$1</h4>');h=h.replace(/^### (.+)$/gm,function(_,t){return'<h3 id="'+sl(t)+'">'+il(t)+'</h3>';});h=h.replace(/^## (.+)$/gm,function(_,t){return'<h2 id="'+sl(t)+'">'+il(t)+'</h2>';});h=h.replace(/^# (.+)$/gm,function(_,t){return'<h1>'+il(t)+'</h1>';});h=h.replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');h=h.replace(/<\/blockquote>\n<blockquote>/g,'<br>');h=h.replace(/^---$/gm,'<hr>');h=h.replace(/^- \[( |x)\] (.+)$/gm,function(_,c,t){return'<p><input type="checkbox"'+(c==='x'?' checked':'')+' disabled>'+il(t)+'</p>';});h=h.replace(/^- (.+)$/gm,'<li>$1</li>');h=h.replace(/(<li>.*<\/li>\n?)+/g,function(m){return'<ul>'+m+'</ul>';});h=h.replace(/^\d+\. (.+)$/gm,'<li>$1</li>');h=h.replace(/^(?!<[a-z/])((?!<).+)$/gm,function(m){return m.trim()?'<p>'+il(m)+'</p>':m;});h=h.replace(/<p><\/p>/g,'');return h;}
function il(t){t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');t=t.replace(/`([^`]+)`/g,'<code>$1</code>');return t;}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sl(t){return t.replace(/[^\w\u4e00-\u9fff]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');}

// ═══ Data & State ═══
var docs={};
var meta={'d1':{cat:'角色',title:'2D UGC 角色出图规范'},'d2':{cat:'角色',title:'2D 角色换色资源规范'}};
var curPage='home';
var fuse=null;

var iframePages={
  'ui-slice-naming':'knowledge-base/ui-slice-naming.html',
  'ui-9slice-color':'knowledge-base/ui-9slice-color.html',
  'ui-layout':'knowledge-base/ui-layout.html',
  'ui-umg-tips':'knowledge-base/ui-umg-tips.html',
  'cp-management':'knowledge-base/cp-management.html',
  'game-art-pipeline':'knowledge-base/md-viewer.html?file=game-art-pipeline.md'
};

var toolData={
  'auto-mask':{icon:'🤖',iconBg:'var(--green-bg)',name:'自动 Mask 通道生成器',ver:'v2.0',status:'online',subtitle:'LAB 色彩空间 K-Means++ 聚类 · 一键生成换色遮罩图',desc:'上传角色原图后，工具自动在 LAB 色彩空间中通过 K-Means++ 聚类识别颜色区域，3 秒内生成 RGBA 换色遮罩图。内置通道互斥检测、纯黑/纯白自动修复、质量评分。',pain:'角色换色 Mask 遮罩图过去全靠美术手工在 PS 中逐通道绘制，一张图平均耗时 30~60 分钟。外包 CP 经常交付出错，返工率高达 40%。',solution:'上传原图后 3 秒自动完成颜色区域识别与通道分配，内置自动修复，零 PS 基础也能产出合格 Mask。',tags:['在线工具','自动验算','K-Means++','通道互斥','质量评分'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/auto-mask.html'},
  'mask-tool':{icon:'🖌️',iconBg:'var(--orange-bg)',name:'Mask 手动编辑器',ver:'v1.0',status:'online',subtitle:'画笔 / 油漆桶 / 橡皮擦 · 实时四通道预览',desc:'专为 Mask 精修设计的轻量编辑器。导入原图后直接在浏览器中用画笔逐通道绘制或修改，R/G/B/A 四通道独立显示并可实时预览换色效果。',pain:'自动生成的 Mask 有时无法精确覆盖复杂区域，需要人工微调。但 PS 操作门槛高。',solution:'专为 Mask 编辑设计的轻量工具，导入原图后浏览器中画笔逐通道绘制，实时预览换色效果。',tags:['在线工具','画笔绘制','RGBA预览','所见即所得'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/mask-tool.html'},
  'spine-split':{icon:'✂️',iconBg:'var(--purple-bg)',name:'Spine 角色拆分工具',ver:'v1.0',status:'online',subtitle:'矩形 / 套索 / 魔棒选区 · 拓扑延展 · Atlas 导出',desc:'上传角色原画后，使用选区工具圈选各部件，工具自动裁切并执行拓扑延展，最终导出含 Atlas 图集 + Spine JSON 配置的 ZIP 包。',pain:'Spine 动画要求角色原画按部件拆分，传统流程依赖 PS 手动裁切+补边，一张角色拆分 2~4 小时。',solution:'选区工具圈选部件，工具自动裁切+拓扑延展，导出 Atlas + Spine JSON ZIP 包。',tags:['在线工具','选区拆分','拓扑延展','Atlas导出','Spine兼容'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/spine-split.html'}
};

var catMap={'d1':'cat-character','d2':'cat-character','auto-mask':'cat-character','mask-tool':'cat-character','spine-split':'cat-character','ui-slice-naming':'cat-ui','ui-9slice-color':'cat-ui','ui-layout':'cat-ui','ui-umg-tips':'cat-ui','cp-management':'cat-mgmt','game-art-pipeline':'cat-mgmt'};

// ═══ Loading Bar ═══
function showLoading(){var b=document.getElementById('loadingBar');b.style.width='0';b.classList.add('on');setTimeout(function(){b.style.width='60%';},50);}
function hideLoading(){var b=document.getElementById('loadingBar');b.style.width='100%';setTimeout(function(){b.classList.remove('on');b.style.width='0';},300);}

// ═══ Core Navigation ═══
function navigate(pageId,btn){
  curPage=pageId;
  location.hash=pageId==='home'?'':pageId;
  var scroll=document.getElementById('contentScroll');
  var frame=document.getElementById('contentFrame');
  var home=document.getElementById('pageHome');
  var tp=document.getElementById('page-tool');

  // Hide everything
  home.style.display='none';
  document.querySelectorAll('.doc-page').forEach(function(p){p.style.display='none';p.classList.remove('active');});
  tp.style.display='none';tp.classList.remove('active');
  frame.style.display='none';frame.src='about:blank';
  scroll.style.display='none';

  // 收起所有 TOC（非活动大纲自动收起）
  collapseAllToc();

  if(pageId==='home'){
    scroll.style.display='block';home.style.display='block';scroll.scrollTop=0;
  } else if(docs[pageId]){
    showLoading();scroll.style.display='block';
    var pg=document.getElementById('page-'+pageId);
    if(pg){
      pg.style.display='block';pg.classList.add('active');
      var ct=document.getElementById('ct-'+pageId);
      if(!ct.innerHTML.trim()) ct.innerHTML=parseMd(docs[pageId]);
    }
    buildToc(pageId);
    scroll.scrollTop=0;
    setTimeout(hideLoading,400);
  } else if(toolData[pageId]){
    showLoading();scroll.style.display='block';renderToolPage(pageId);
    tp.style.display='block';tp.classList.add('active');scroll.scrollTop=0;setTimeout(hideLoading,400);
  } else if(iframePages[pageId]){
    showLoading();
    frame.style.display='block';
    frame.src=iframePages[pageId];
    frame.onload=function(){
      hideLoading();
      // iframe 加载完成后，动态提取 h2/h3 构建 TOC
      buildIframeToc(pageId);
    };
    setTimeout(hideLoading,3000);
  }
  updateNavActive(pageId,btn);
  document.querySelector('.sidebar').classList.remove('open');
}

// ═══ Render Tool Card Page (Embedded) ═══
function renderToolPage(id){
  var d=toolData[id],c=document.getElementById('page-tool');
  if(!d)return;
  var tags='';d.tags.forEach(function(t){tags+='<span class="tag">'+t+'</span>';});
  c.innerHTML='<div class="doc-bc"><a onclick="navigate(\'home\')">🏠 首页</a><span>›</span><span>角色 · 工具</span><span>›</span><span>'+d.name+'</span></div>'
  +'<div class="tcv">'
  +'  <div class="tcv-h"><div class="tcv-icon" style="background:'+d.iconBg+'">'+d.icon+'</div><div class="tcv-ta"><h2>'+d.name+' <span class="ver">'+d.ver+'</span> <span class="st-on">🟢 在线</span></h2><div class="tcv-sub">'+d.subtitle+'</div></div><button class="tbtn tbtn-o tbtn-sm" onclick="window.open(\''+d.url+'\',\'_blank\')">↗ 新窗口</button></div>'
  +'  <div class="tcv-embed-wrap"><iframe class="tcv-embed" src="'+d.url+'" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy"></iframe></div>'
  +'  <div class="tcv-b">'
  +'    <div class="tcv-desc">'+d.desc+'</div>'
  +'    <div class="tcv-tags">'+tags+'</div>'
  +'    <div class="tcv-meta"><span class="mi">'+d.env+'</span><span class="mi">💻 '+d.platform+'</span><span class="mi">📦 '+d.install+'</span><span class="mi">📅 '+d.date+'</span></div>'
  +'  </div>'
  +'</div>';
}

// ═══ Nav Active State ═══
function updateNavActive(pageId,btn){
  document.querySelectorAll('.leaf').forEach(function(n){n.classList.remove('active');});
  document.querySelector('.nav-home').classList.remove('active');
  if(pageId==='home'){document.querySelector('.nav-home').classList.add('active');return;}
  if(btn&&btn.classList.contains('leaf')){btn.classList.add('active');}
  else{document.querySelectorAll('.leaf[data-page]').forEach(function(n){if(n.dataset.page===pageId)n.classList.add('active');});}
  // Auto-expand parent categories
  if(catMap[pageId]){var cat=document.getElementById(catMap[pageId]);if(cat&&!cat.classList.contains('open'))cat.classList.add('open');}
  var al=document.querySelector('.leaf.active');
  if(al){var l2=al.closest('.t2');if(l2&&!l2.classList.contains('open'))l2.classList.add('open');}
}

// ═══ TOC 三级大纲 (h2 + h3) ═══

// 收起所有 TOC
function collapseAllToc(){
  document.querySelectorAll('.toc-box').forEach(function(t){
    t.classList.remove('open');
    t.innerHTML='';
  });
}

// 为嵌入式 Markdown 文档构建 h2/h3 三级 TOC
function buildToc(docId){
  collapseAllToc();
  var tc=document.getElementById('toc-'+docId);
  if(!tc) return;
  var ct=document.getElementById('ct-'+docId);
  if(!ct) return;
  var hs=ct.querySelectorAll('h2, h3');
  if(!hs.length) return;
  var html='';
  hs.forEach(function(h){
    var id=h.getAttribute('id')||'';
    var isH3=h.tagName==='H3';
    var cls='toc-a'+(isH3?' toc-h3':' toc-h2');
    html+='<button class="'+cls+'" data-anchor="'+id+'" onclick="tocScrollTo(\''+id+'\')">'+h.textContent+'</button>';
  });
  tc.innerHTML=html;
  tc.classList.add('open');
}

// 为 iframe 加载的页面构建 h2/h3 TOC
function buildIframeToc(pageId){
  collapseAllToc();
  var tc=document.getElementById('toc-'+pageId);
  if(!tc) return;
  var frame=document.getElementById('contentFrame');
  try{
    var doc=frame.contentDocument||frame.contentWindow.document;
    var hs=doc.querySelectorAll('h2, h3');
    if(!hs.length) return;
    var html='';var idx=0;
    hs.forEach(function(h){
      if(!h.id) h.id='ifr-h-'+(idx++);
      var isH3=h.tagName==='H3';
      var cls='toc-a'+(isH3?' toc-h3':' toc-h2');
      html+='<button class="'+cls+'" data-iframe-anchor="'+h.id+'" onclick="iframeTocScrollTo(\''+h.id+'\')">'+h.textContent+'</button>';
    });
    tc.innerHTML=html;
    tc.classList.add('open');
  }catch(e){
    console.log('Cannot access iframe for TOC:',e);
  }
}

// 点击 TOC 节点 → 平滑滚动到锚点（嵌入 MD 文档）
function tocScrollTo(anchorId){
  var el=document.getElementById(anchorId);
  if(!el) return;
  el.scrollIntoView({behavior:'smooth',block:'start'});
  highlightTocItem(anchorId, false);
}

// 点击 TOC 节点 → iframe 内锚点滚动
function iframeTocScrollTo(anchorId){
  try{
    var frame=document.getElementById('contentFrame');
    var doc=frame.contentDocument||frame.contentWindow.document;
    var el=doc.getElementById(anchorId);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
    highlightTocItem(anchorId, true);
  }catch(e){console.log('iframe scroll error:',e);}
}

// 高亮指定 TOC 节点
function highlightTocItem(anchorId, isIframe){
  document.querySelectorAll('.toc-a').forEach(function(t){t.classList.remove('active');});
  var attr=isIframe?'data-iframe-anchor':'data-anchor';
  var btn=document.querySelector('.toc-a['+attr+'="'+anchorId+'"]');
  if(btn) btn.classList.add('active');
}

// ═══ Search ═══
function initSearch(){
  try{
    fetch('index.json').then(function(res){
      if(!res.ok) return;
      return res.json();
    }).then(function(data){
      var items=[];
      for(var id in docs){
        if(!docs.hasOwnProperty(id)) continue;
        var m=meta[id]||{};
        items.push({id:id,title:m.title||id,type:'doc',content:docs[id],action:'navigate'});
      }
      if(data&&data.categories){
        data.categories.forEach(function(cat){
          cat.items.forEach(function(item){
            items.push({id:item.id,title:item.title,type:item.type,content:item.desc+' '+item.tags.join(' '),action:'navigate',cat:cat.name});
          });
        });
      }
      fuse=new Fuse(items,{keys:[{name:'title',weight:3},{name:'content',weight:1}],threshold:0.35,includeMatches:true,minMatchCharLength:1});
    });
  }catch(e){console.log('Search init skipped:',e);}
}

function handleSearch(q){
  var dd=document.getElementById('searchDropdown');q=q.trim();
  if(!q){dd.classList.remove('show');dd.innerHTML='';return;}
  if(!fuse){dd.classList.remove('show');return;}
  var results=fuse.search(q).slice(0,10);
  if(!results.length){dd.innerHTML='<div style="padding:14px;text-align:center;color:var(--dim);font-size:13px">未找到相关内容</div>';dd.classList.add('show');return;}
  var html='';
  results.forEach(function(r){
    var item=r.item;
    var typeCls=item.type==='tool'?'background:rgba(74,222,128,.08);color:#4ade80':'background:rgba(108,140,255,.08);color:#6c8cff';
    var typeLabel=item.type==='tool'?'工具':'文档';
    html+='<div class="sr-item" onmousedown="navigate(\''+item.id+'\');document.getElementById(\'searchDropdown\').classList.remove(\'show\');document.getElementById(\'searchInput\').value=\'\'"><span class="sr-type" style="'+typeCls+'">'+typeLabel+'</span><span class="sr-title">'+item.title+'</span></div>';
  });
  dd.innerHTML=html;dd.classList.add('show');
}

// ═══ Utilities ═══
function copyShareLink(){navigator.clipboard.writeText(location.href).then(function(){showToast('链接已复制');}).catch(function(){showToast('复制失败');});}
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2000);}

function showFeedback(){
  var d=document.getElementById('feedbackDialog');
  if(!d){
    d=document.createElement('div');d.id='feedbackDialog';d.className='fb-overlay';
    d.innerHTML='<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:28px 32px;max-width:460px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,.4)">'
      +'<h3 style="color:var(--heading);font-size:18px;margin-bottom:16px">📮 反馈与建议</h3>'
      +'<textarea id="feedbackText" rows="4" style="width:100%;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;outline:none" placeholder="描述问题或建议..."></textarea>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
      +'<button onclick="document.getElementById(\'feedbackDialog\').classList.remove(\'show\')" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:inherit;font-size:13px">取消</button>'
      +'<button onclick="submitFeedback()" style="padding:8px 18px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500">提交</button>'
      +'</div></div>';
    document.body.appendChild(d);
    d.addEventListener('click',function(e){if(e.target===d)d.classList.remove('show');});
  }
  d.classList.add('show');
}
function submitFeedback(){
  var text=document.getElementById('feedbackText').value.trim();
  if(!text){showToast('请输入内容');return;}
  var fb=JSON.parse(localStorage.getItem('kb_feedback')||'[]');
  fb.push({text:text,time:new Date().toISOString(),page:curPage});
  localStorage.setItem('kb_feedback',JSON.stringify(fb));
  document.getElementById('feedbackDialog').classList.remove('show');
  showToast('✅ 感谢反馈！');
}

// ═══ Scroll 滚动高亮 TOC 当前阅读节点 ═══
function setupScrollSpy(){
  var scrollEl=document.getElementById('contentScroll');
  scrollEl.addEventListener('scroll',function(){
    document.getElementById('backToTop').classList.toggle('show',scrollEl.scrollTop>300);
    // 找到当前活动文档页
    var activePage=document.querySelector('.doc-page.active');
    if(!activePage) return;
    var hs=activePage.querySelectorAll('h2, h3');
    var tocBtns=document.querySelectorAll('.toc-a[data-anchor]');
    if(!hs.length||!tocBtns.length) return;
    // 找出当前可见标题
    var activeIdx=0;
    hs.forEach(function(h,i){
      if(h.getBoundingClientRect().top<120) activeIdx=i;
    });
    var activeId=hs[activeIdx].getAttribute('id')||'';
    tocBtns.forEach(function(btn){
      btn.classList.toggle('active',btn.getAttribute('data-anchor')===activeId);
    });
  });
}

// ═══ Keyboard ═══
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){var fb=document.getElementById('feedbackDialog');if(fb)fb.classList.remove('show');}
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();document.getElementById('searchInput').focus();}
});

window.addEventListener('hashchange',function(){
  var hash=location.hash.slice(1)||'home';
  if(hash!==curPage) navigate(hash);
});

// ═══ Init ═══
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('script[type="text/markdown"]').forEach(function(el){
    var id=el.id.replace('md-','');
    docs[id]=el.textContent.trim();
  });
  setupScrollSpy();
  var hash=location.hash.slice(1);
  if(hash) navigate(hash);
  initSearch();
});
