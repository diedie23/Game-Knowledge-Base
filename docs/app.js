// ═══ Markdown Parser (智能表格增强) ═══
function parseMd(md){var h=md;
  h=h.replace(/```(\w*)\n([\s\S]*?)```/g,function(_,l,c){return'<pre><code>'+esc(c.trim())+'</code></pre>';});
  h=h.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,function(_,hdr,sep,body){
    var cols=hdr.split('|').filter(function(c){return c.trim();});
    var ths=cols.map(function(c){return'<th>'+il(c.trim())+'</th>';}).join('');
    var rows=body.trim().split('\n').map(function(r){
      var cells=r.split('|').filter(function(c){return c.trim();});
      var tds=cells.map(function(c,ci){
        var v=c.trim();
        // 智能优先级标签：最后一列含 高/中/低
        if(ci===cells.length-1){
          v=v.replace(/🔴\s*高/g,'<span class="pri pri-h">🔴 高</span>');
          v=v.replace(/🟡\s*中/g,'<span class="pri pri-m">🟡 中</span>');
          v=v.replace(/🟢\s*低/g,'<span class="pri pri-l">🟢 低</span>');
        }
        return'<td>'+il(v)+'</td>';
      }).join('');
      return'<tr>'+tds+'</tr>';
    }).join('');
    return'<table><thead><tr>'+ths+'</tr></thead><tbody>'+rows+'</tbody></table>';
  });
  h=h.replace(/^#### (.+)$/gm,function(_,t){return'<h4 id="'+sl(t)+'">'+il(t)+'</h4>';});
  h=h.replace(/^### (.+)$/gm,function(_,t){return'<h3 id="'+sl(t)+'">'+il(t)+'</h3>';});
  h=h.replace(/^## (.+)$/gm,function(_,t){return'<h2 id="'+sl(t)+'">'+il(t)+'</h2>';});
  h=h.replace(/^# (.+)$/gm,function(_,t){return'<h1>'+il(t)+'</h1>';});
  h=h.replace(/^> ?(.*)$/gm,function(_,c){return'<blockquote>'+(c||'')+'</blockquote>';});
  h=h.replace(/<\/blockquote>\n<blockquote>/g,'<br>');
  h=h.replace(/^---$/gm,'<hr>');
  h=h.replace(/^- \[( |x)\] (.+)$/gm,function(_,c,t){return'<p><input type="checkbox"'+(c==='x'?' checked':'')+' disabled>'+il(t)+'</p>';});
  h=h.replace(/^- (.+)$/gm,'<li>$1</li>');
  h=h.replace(/(<li>.*<\/li>\n?)+/g,function(m){return'<ul>'+m+'</ul>';});
  h=h.replace(/^\d+\. (.+)$/gm,'<li>$1</li>');
  h=h.replace(/^(?!<[a-z/])((?!<).+)$/gm,function(m){return m.trim()?'<p>'+il(m)+'</p>':m;});
  h=h.replace(/<p><\/p>/g,'');
  return h;
}
function il(t){return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sl(t){return t.replace(/[^\w\u4e00-\u9fff]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');}

// ═══ Data & State ═══
var sidebarData=null;  // sidebar.json 数据
var docs={};           // 已加载的 MD 内容缓存
var curPage='home';
var fuse=null;
var pageRegistry={};   // pageId → {type, file, download, ...}

// 工具页数据（保留不变）
var toolData={
  'auto-mask':{icon:'🤖',iconBg:'var(--green-bg)',name:'自动 Mask 通道生成器',ver:'v2.0',status:'online',subtitle:'LAB 色彩空间 K-Means++ 聚类 · 一键生成换色遮罩图',desc:'上传角色原图后，工具自动在 LAB 色彩空间中通过 K-Means++ 聚类识别颜色区域，3 秒内生成 RGBA 换色遮罩图。内置通道互斥检测、纯黑/纯白自动修复、质量评分。',tags:['在线工具','自动验算','K-Means++','通道互斥','质量评分'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/auto-mask.html'},
  'mask-tool':{icon:'🖌️',iconBg:'var(--orange-bg)',name:'Mask 手动编辑器',ver:'v1.0',status:'online',subtitle:'画笔 / 油漆桶 / 橡皮擦 · 实时四通道预览',desc:'专为 Mask 精修设计的轻量编辑器。导入原图后直接在浏览器中用画笔逐通道绘制或修改，R/G/B/A 四通道独立显示并可实时预览换色效果。',tags:['在线工具','画笔绘制','RGBA预览','所见即所得'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/mask-tool.html'},
  'spine-split':{icon:'✂️',iconBg:'var(--purple-bg)',name:'Spine 角色拆分工具',ver:'v1.0',status:'online',subtitle:'矩形 / 套索 / 魔棒选区 · 拓扑延展 · Atlas 导出',desc:'上传角色原画后，使用选区工具圈选各部件，工具自动裁切并执行拓扑延展，最终导出含 Atlas 图集 + Spine JSON 配置的 ZIP 包。',tags:['在线工具','选区拆分','拓扑延展','Atlas导出','Spine兼容'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/spine-split.html'}
};

// ═══ Loading Bar ═══
function showLoading(){var b=document.getElementById('loadingBar');b.style.width='0';b.classList.add('on');setTimeout(function(){b.style.width='60%';},50);}
function hideLoading(){var b=document.getElementById('loadingBar');b.style.width='100%';setTimeout(function(){b.classList.remove('on');b.style.width='0';},300);}

// ═══ Sidebar.json 驱动构建侧边栏 ═══
function buildSidebar(data){
  sidebarData=data;
  var nav=document.getElementById('sidebarNav');
  // 保留首页按钮
  var html='<button class="nav-home active" onclick="navigate(\'home\')" id="navHome">🏠 知识库首页</button>';
  var totalItems=0;

  data.categories.forEach(function(cat){
    var itemCount=0;
    cat.groups.forEach(function(g){itemCount+=g.items?g.items.length:0;});
    totalItems+=itemCount;

    var colorVar=cat.color||'accent';
    html+='<div class="t1'+(cat.groups.length&&itemCount?' open':'')+'" id="'+cat.id+'">';
    html+='<div class="t1-h" onclick="this.parentElement.classList.toggle(\'open\')"><span class="chv">▶</span><span class="ci" style="background:var(--'+colorVar+'-bg);color:var(--'+colorVar+')">'+cat.icon+'</span><span class="cl">'+cat.name+'</span><span class="cc">'+itemCount+'</span></div>';
    html+='<div class="t1-c">';

    if(!cat.groups.length){
      html+='<button class="leaf" style="color:var(--dim);cursor:default;font-style:italic;font-size:11px" disabled>📝 待补充...</button>';
    } else {
      cat.groups.forEach(function(grp){
        html+='<div class="t2"><div class="t2-h" onclick="this.parentElement.classList.toggle(\'open\')"><span class="chv">▶</span><span class="si">'+grp.icon+'</span><span class="sl">'+grp.name+'</span></div><div class="t2-c">';
        if(grp.items) grp.items.forEach(function(item){
          // 注册页面
          pageRegistry[item.id]={type:item.type,file:item.file||'',download:item.download||'',catId:cat.id};
          var badgeCls=item.badge==='工具'?'bt':'bd';
          html+='<button class="leaf" data-page="'+item.id+'" onclick="navigate(\''+item.id+'\',this)"><span class="li">'+item.icon+'</span>'+item.title+'<span class="badge '+badgeCls+'">'+item.badge+'</span></button>';
          html+='<div class="toc-box" id="toc-'+item.id+'"></div>';
        });
        html+='</div></div>';
      });
    }
    html+='</div></div>';
  });

  nav.innerHTML=html;
  // 更新首页统计
  var docCount=0,toolCount=0;
  for(var k in pageRegistry){
    if(pageRegistry[k].type==='md'||pageRegistry[k].type==='iframe') docCount++;
    if(pageRegistry[k].type==='tool') toolCount++;
  }
  var numEls=document.querySelectorAll('.stat .num');
  if(numEls[0]) numEls[0].textContent=String(docCount+toolCount);
  if(numEls[1]) numEls[1].textContent=String(Object.keys(toolData).length + Object.keys(pageRegistry).filter(function(k){return pageRegistry[k].download;}).length);
  if(numEls[2]) numEls[2].textContent=String(data.categories.length);
}

// ═══ Core Navigation ═══
function navigate(pageId,btn){
  curPage=pageId;
  location.hash=pageId==='home'?'':pageId;
  var scroll=document.getElementById('contentScroll');
  var frame=document.getElementById('contentFrame');
  var home=document.getElementById('pageHome');
  var tp=document.getElementById('page-tool');

  home.style.display='none';
  document.querySelectorAll('.doc-page').forEach(function(p){p.style.display='none';p.classList.remove('active');});
  tp.style.display='none';tp.classList.remove('active');
  frame.style.display='none';frame.src='about:blank';
  scroll.style.display='none';
  document.getElementById('iframeToolbar').style.display='none';

  collapseAllToc();
  clearIframeScrollSpy();
  clearIframeBtt();
  document.getElementById('backToTop').classList.remove('show');

  if(pageId==='home'){
    scroll.style.display='block';home.style.display='block';scroll.scrollTop=0;
  } else if(toolData[pageId]){
    showLoading();scroll.style.display='block';renderToolPage(pageId);
    tp.style.display='block';tp.classList.add('active');scroll.scrollTop=0;setTimeout(hideLoading,400);
  } else {
    var reg=pageRegistry[pageId];
    if(!reg) return;

    if(reg.type==='md'){
      // Fetch MD 文件并渲染
      showLoading();scroll.style.display='block';
      var pg=getOrCreateDocPage(pageId);
      pg.style.display='block';pg.classList.add('active');
      var ct=pg.querySelector('.dc');

      if(docs[pageId]){
        // 已缓存
        if(!ct.innerHTML.trim()) ct.innerHTML=parseMd(docs[pageId]);
        buildToc(pageId);scroll.scrollTop=0;setTimeout(hideLoading,400);
      } else {
        ct.innerHTML='<p style="color:var(--dim)">⏳ 加载中...</p>';
        fetch(reg.file).then(function(r){return r.text();}).then(function(md){
          docs[pageId]=md;
          ct.innerHTML=parseMd(md);
          buildToc(pageId);scroll.scrollTop=0;hideLoading();
        }).catch(function(e){ct.innerHTML='<p style="color:var(--red)">加载失败：'+e.message+'</p>';hideLoading();});
      }
    } else if(reg.type==='iframe'){
      showLoading();
      // 下载工具栏
      if(reg.download){
        var toolbar=document.getElementById('iframeToolbar');
        var name=btn?btn.textContent.trim():(pageId);
        toolbar.innerHTML='<div class="ift-title"><span class="ift-icon">📦</span>'+name+'</div><a class="ift-dl" href="'+reg.download+'" download>⬇ 下载 exe</a>';
        toolbar.style.display='flex';
      }
      frame.style.display='block';
      frame.src=reg.file;
      frame.onload=function(){
        hideLoading();
        buildIframeToc(pageId);
        setupIframeScrollSpy(pageId);
        setupIframeBackToTop();
      };
      setTimeout(hideLoading,3000);
    }
  }
  updateNavActive(pageId,btn);
  document.querySelector('.sidebar').classList.remove('open');
}

// 动态创建文档页容器
function getOrCreateDocPage(pageId){
  var pg=document.getElementById('page-'+pageId);
  if(pg) return pg;
  pg=document.createElement('div');
  pg.id='page-'+pageId;
  pg.className='doc-page';
  pg.innerHTML='<div class="dc" id="ct-'+pageId+'"></div>';
  document.getElementById('contentScroll').appendChild(pg);
  return pg;
}

// ═══ Render Tool Page (Embedded Directly) ═══
function renderToolPage(id){
  var d=toolData[id],c=document.getElementById('page-tool');
  if(!d)return;
  var tags='';d.tags.forEach(function(t){tags+='<span class="tag">'+t+'</span>';});
  c.innerHTML=
    '<div class="tool-embed-header">'
    +'<div class="teh-icon" style="background:'+d.iconBg+'">'+d.icon+'</div>'
    +'<div class="teh-info"><h2>'+d.name+' <span class="ver">'+d.ver+'</span> <span class="st-on">🟢 在线</span></h2><div class="teh-sub">'+d.subtitle+'</div></div>'
    +'</div>'
    +'<div class="tool-embed-desc">'
    +'<p>'+d.desc+'</p>'
    +'<div class="tool-embed-tags">'+tags+'</div>'
    +'<div class="tool-embed-meta"><span class="mi">'+d.env+'</span><span class="mi">💻 '+d.platform+'</span><span class="mi">📦 '+d.install+'</span><span class="mi">📅 '+d.date+'</span></div>'
    +'</div>'
    +'<div class="tool-embed-frame-wrap">'
    +'<div class="tool-embed-toolbar"><span class="tet-label">⚡ 工具已嵌入，可直接使用</span><button class="tet-btn" onclick="window.open(\''+d.url+'\',\'_blank\')">↗ 新窗口打开</button></div>'
    +'<iframe class="tool-embed-frame" src="'+d.url+'" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy"></iframe>'
    +'</div>';
}

// ═══ Nav Active State ═══
function updateNavActive(pageId,btn){
  document.querySelectorAll('.leaf').forEach(function(n){n.classList.remove('active');});
  var nh=document.querySelector('.nav-home');
  if(nh) nh.classList.remove('active');
  if(pageId==='home'){if(nh)nh.classList.add('active');return;}
  if(btn&&btn.classList.contains('leaf')){btn.classList.add('active');}
  else{document.querySelectorAll('.leaf[data-page]').forEach(function(n){if(n.dataset.page===pageId)n.classList.add('active');});}
  // Auto-expand parents
  var reg=pageRegistry[pageId];
  if(reg&&reg.catId){var cat=document.getElementById(reg.catId);if(cat&&!cat.classList.contains('open'))cat.classList.add('open');}
  var al=document.querySelector('.leaf.active');
  if(al){
    var l2=al.closest('.t2');if(l2&&!l2.classList.contains('open'))l2.classList.add('open');
    var l3=al.closest('.t3');if(l3&&!l3.classList.contains('open'))l3.classList.add('open');
  }
}

// ═══ TOC 四级大纲 (h2 + h3 + h4) ═══
function collapseAllToc(){
  document.querySelectorAll('.toc-box').forEach(function(t){t.classList.remove('open');t.innerHTML='';});
}

function buildToc(docId){
  collapseAllToc();
  var tc=document.getElementById('toc-'+docId);
  if(!tc) return;
  var ct=document.getElementById('ct-'+docId);
  if(!ct) return;
  var hs=ct.querySelectorAll('h2, h3, h4');
  if(!hs.length) return;
  var html='';
  hs.forEach(function(h){
    var id=h.getAttribute('id')||'';
    var tag=h.tagName;
    var cls='toc-a';
    if(tag==='H3') cls+=' toc-h3';
    else if(tag==='H4') cls+=' toc-h4';
    else cls+=' toc-h2';
    html+='<button class="'+cls+'" data-anchor="'+id+'" onclick="tocScrollTo(\''+id+'\')">'+h.textContent+'</button>';
  });
  tc.innerHTML=html;
  tc.classList.add('open');
}

function buildIframeToc(pageId){
  collapseAllToc();
  var tc=document.getElementById('toc-'+pageId);
  if(!tc) return;
  var frame=document.getElementById('contentFrame');
  try{
    var doc=frame.contentDocument||frame.contentWindow.document;
    var hs=doc.querySelectorAll('h2, h3, h4');
    if(!hs.length) return;
    var html='';var idx=0;
    hs.forEach(function(h){
      if(!h.id) h.id='ifr-h-'+(idx++);
      var tag=h.tagName;
      var cls='toc-a';
      if(tag==='H3') cls+=' toc-h3';
      else if(tag==='H4') cls+=' toc-h4';
      else cls+=' toc-h2';
      html+='<button class="'+cls+'" data-iframe-anchor="'+h.id+'" onclick="iframeTocScrollTo(\''+h.id+'\')">'+h.textContent+'</button>';
    });
    tc.innerHTML=html;
    tc.classList.add('open');
  }catch(e){console.log('Cannot access iframe for TOC:',e);}
}

function tocScrollTo(anchorId){
  var el=document.getElementById(anchorId);
  if(!el) return;
  var scroll=document.getElementById('contentScroll');
  var rect=el.getBoundingClientRect();
  var scrollRect=scroll.getBoundingClientRect();
  scroll.scrollTo({top:scroll.scrollTop+rect.top-scrollRect.top-20,behavior:'smooth'});
  highlightTocItem(anchorId,false);
}

function iframeTocScrollTo(anchorId){
  try{
    var frame=document.getElementById('contentFrame');
    var doc=frame.contentDocument||frame.contentWindow.document;
    var el=doc.getElementById(anchorId);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
    highlightTocItem(anchorId,true);
  }catch(e){}
}

function highlightTocItem(anchorId,isIframe){
  document.querySelectorAll('.toc-a').forEach(function(t){t.classList.remove('active');});
  var attr=isIframe?'data-iframe-anchor':'data-anchor';
  var btn=document.querySelector('.toc-a['+attr+'="'+anchorId+'"]');
  if(btn) btn.classList.add('active');
}

// ═══ Search ═══
function initSearch(){
  try{
    fetch('index.json').then(function(res){if(!res.ok) return;return res.json();}).then(function(data){
      var items=[];
      if(data&&data.categories){
        data.categories.forEach(function(cat){
          cat.items.forEach(function(item){
            items.push({id:item.id,title:item.title,type:item.type,content:item.desc+' '+item.tags.join(' '),action:'navigate',cat:cat.name});
          });
        });
      }
      // 也加 sidebar 数据
      if(sidebarData){
        sidebarData.categories.forEach(function(cat){
          cat.groups.forEach(function(g){
            if(g.items) g.items.forEach(function(item){
              items.push({id:item.id,title:item.title,type:item.type,content:item.title,action:'navigate'});
            });
          });
        });
      }
      fuse=new Fuse(items,{keys:[{name:'title',weight:3},{name:'content',weight:1}],threshold:0.35,includeMatches:true,minMatchCharLength:1});
    });
  }catch(e){}
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

// ═══ ScrollSpy (h2 + h3 + h4) ═══
var iframeScrollHandler=null;

function setupScrollSpy(){
  var scrollEl=document.getElementById('contentScroll');
  scrollEl.addEventListener('scroll',function(){
    document.getElementById('backToTop').classList.toggle('show',scrollEl.scrollTop>300);
    var activePage=document.querySelector('.doc-page.active');
    if(!activePage) return;
    var hs=activePage.querySelectorAll('h2, h3, h4');
    var tocBtns=document.querySelectorAll('.toc-a[data-anchor]');
    if(!hs.length||!tocBtns.length) return;
    var activeIdx=0;
    hs.forEach(function(h,i){if(h.getBoundingClientRect().top<120) activeIdx=i;});
    var activeId=hs[activeIdx].getAttribute('id')||'';
    tocBtns.forEach(function(btn){btn.classList.toggle('active',btn.getAttribute('data-anchor')===activeId);});
  });
}

function setupIframeScrollSpy(pageId){
  clearIframeScrollSpy();
  var frame=document.getElementById('contentFrame');
  try{
    var doc=frame.contentDocument||frame.contentWindow.document;
    var hs=doc.querySelectorAll('h2, h3, h4');
    if(!hs.length) return;
    iframeScrollHandler=function(){
      var activeIdx=0;
      hs.forEach(function(h,i){if(h.getBoundingClientRect().top<120) activeIdx=i;});
      var activeId=hs[activeIdx].id||'';
      document.querySelectorAll('.toc-a[data-iframe-anchor]').forEach(function(btn){
        btn.classList.toggle('active',btn.getAttribute('data-iframe-anchor')===activeId);
      });
    };
    (frame.contentWindow||frame.contentDocument.defaultView).addEventListener('scroll',iframeScrollHandler);
  }catch(e){}
}

function clearIframeScrollSpy(){
  if(iframeScrollHandler){
    try{var frame=document.getElementById('contentFrame');(frame.contentWindow||frame.contentDocument.defaultView).removeEventListener('scroll',iframeScrollHandler);}catch(e){}
    iframeScrollHandler=null;
  }
}

// ═══ iframe 返回顶部 ═══
var iframeBttHandler=null;
function setupIframeBackToTop(){
  clearIframeBtt();
  var frame=document.getElementById('contentFrame');
  var btt=document.getElementById('backToTop');
  try{
    var win=frame.contentWindow||frame.contentDocument.defaultView;
    iframeBttHandler=function(){
      var st=win.pageYOffset||win.document.documentElement.scrollTop||0;
      btt.classList.toggle('show',st>300);
    };
    win.addEventListener('scroll',iframeBttHandler);
    btt.onclick=function(){win.scrollTo({top:0,behavior:'smooth'});};
  }catch(e){}
}
function clearIframeBtt(){
  if(iframeBttHandler){
    try{var frame=document.getElementById('contentFrame');(frame.contentWindow||frame.contentDocument.defaultView).removeEventListener('scroll',iframeBttHandler);}catch(e){}
    iframeBttHandler=null;
  }
  var btt=document.getElementById('backToTop');
  btt.onclick=function(){document.getElementById('contentScroll').scrollTo({top:0,behavior:'smooth'});};
}

// ═══ 创作模式 — Vditor 编辑器 ═══
var vditorInstance=null;

var templates={
  'art-req':'# 美术需求单\n\n> 📅 日期：YYYY-MM-DD · 🏷️ 需求单\n\n---\n\n## 一、需求概述\n\n| 项目 | 内容 |\n|------|------|\n| **需求名称** |  |\n| **优先级** | 🔴 高 / 🟡 中 / 🟢 低 |\n| **期望交付日期** |  |\n| **负责人** |  |\n\n## 二、详细描述\n\n### 2.1 参考图\n\n（粘贴参考图片）\n\n### 2.2 具体要求\n\n- [ ] 要求1\n- [ ] 要求2\n\n## 三、验收标准\n\n| 检查项 | 合格标准 | 优先级 |\n|--------|---------|--------|\n|  |  | 🔴 高 |\n|  |  | 🟡 中 |\n\n## 四、备注\n\n',
  'bug-review':'# Bug 复盘报告\n\n> 📅 日期：YYYY-MM-DD · 🏷️ Bug复盘\n\n---\n\n## 一、Bug 概述\n\n| 项目 | 内容 |\n|------|------|\n| **Bug 标题** |  |\n| **严重等级** | 🔴 高 / 🟡 中 / 🟢 低 |\n| **影响范围** |  |\n| **发现日期** |  |\n| **修复日期** |  |\n\n## 二、问题现象\n\n（描述复现步骤）\n\n## 三、根本原因\n\n\n\n## 四、修复方案\n\n\n\n## 五、预防措施\n\n- [ ] 措施1\n- [ ] 措施2\n\n## 六、经验总结\n\n',
  'flow-spec':'# 流程规范文档\n\n> 📅 更新时间：YYYY-MM-DD · 🏷️ 流程规范\n\n---\n\n## 一、目的与范围\n\n\n\n## 二、角色与职责\n\n| 角色 | 职责 | 优先级 |\n|------|------|--------|\n|  |  | 🔴 高 |\n\n## 三、流程步骤\n\n### 3.1 第一阶段\n\n\n\n### 3.2 第二阶段\n\n\n\n## 四、交付物清单\n\n- [ ] 交付物1\n- [ ] 交付物2\n\n## 五、注意事项\n\n',
  'tool-doc':'# 工具说明文档\n\n> 📅 更新时间：YYYY-MM-DD · 🏷️ 工具\n\n---\n\n## 一、工具概述\n\n| 项目 | 内容 |\n|------|------|\n| **工具名称** |  |\n| **版本** | v1.0 |\n| **环境要求** |  |\n\n## 二、安装 / 使用方式\n\n\n\n## 三、功能说明\n\n### 3.1 功能一\n\n\n\n### 3.2 功能二\n\n\n\n## 四、常见问题\n\n| 问题 | 解决方案 |\n|------|----------|\n|  |  |\n\n## 五、更新日志\n\n| 版本 | 日期 | 内容 |\n|------|------|------|\n| v1.0 |  | 初版 |\n'
};

function openEditor(){
  // 隐藏主内容区
  document.getElementById('contentScroll').style.display='none';
  document.getElementById('contentFrame').style.display='none';
  document.getElementById('iframeToolbar').style.display='none';
  // 显示编辑器
  var ep=document.getElementById('editorPage');
  ep.style.display='flex';

  if(!vditorInstance){
    vditorInstance=new Vditor('vditorContainer',{
      height:'100%',
      mode:'ir',
      theme:'dark',
      icon:'material',
      placeholder:'开始编写文档...\n\n支持 Markdown 语法，可直接粘贴图片。',
      toolbar:['headings','bold','italic','strike','|','list','ordered-list','check','|','quote','code','inline-code','|','table','line','|','link','upload','|','undo','redo','|','fullscreen','preview','outline'],
      preview:{theme:{current:'dark',path:'https://cdn.jsdelivr.net/npm/vditor@3.10.8/dist/css/content-theme'}},
      cache:{enable:false},
      upload:{
        handler:function(files){
          // 粘贴图片转 Base64
          var file=files[0];
          if(!file) return;
          var reader=new FileReader();
          reader.onload=function(e){
            vditorInstance.insertValue('!['+file.name+']('+e.target.result+')');
          };
          reader.readAsDataURL(file);
          return null;
        },
        accept:'image/*'
      },
      after:function(){
        // 加载本地草稿
        var draft=localStorage.getItem('kb_editor_draft');
        if(draft) vditorInstance.setValue(draft);
      },
      input:function(val){
        localStorage.setItem('kb_editor_draft',val);
      }
    });
  }
  // 加载设置
  loadEditorSettings();
}

function closeEditor(){
  document.getElementById('editorPage').style.display='none';
  document.getElementById('contentScroll').style.display='block';
  navigate(curPage||'home');
}

function applyTemplate(key){
  if(!key||!templates[key]) return;
  if(vditorInstance){
    var current=vditorInstance.getValue().trim();
    if(current&&!confirm('当前编辑器有内容，是否覆盖？')) return;
    vditorInstance.setValue(templates[key]);
  }
  document.getElementById('editorTemplate').value='';
}

function getEditorFileName(){
  var name=document.getElementById('editorFileName').value.trim();
  if(!name) name='未命名文档-'+new Date().toISOString().slice(0,10);
  return name;
}

function downloadMd(){
  if(!vditorInstance) return;
  var md=vditorInstance.getValue();
  var name=getEditorFileName()+'.md';
  var blob=new Blob([md],{type:'text/markdown;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已下载 '+name);
}

// ═══ GitHub API 发布（新手引导式） ═══
function getGHSettings(){
  return JSON.parse(localStorage.getItem('kb_gh_settings')||'{}');
}

function loadEditorSettings(){
  var s=getGHSettings();
  var tokenEl=document.getElementById('ghTokenSettings');
  if(tokenEl&&s.token) tokenEl.value=s.token;
  var repoEl=document.getElementById('ghRepo');
  if(repoEl&&s.repo) repoEl.value=s.repo;
}

function saveEditorSettings(){
  var s={
    token:(document.getElementById('ghTokenSettings')||{}).value||'',
    repo:(document.getElementById('ghRepo')||{}).value||'diedie23/Game-Knowledge-Base',
    branch:'main'
  };
  s.token=s.token.trim();s.repo=s.repo.trim();
  localStorage.setItem('kb_gh_settings',JSON.stringify(s));
  document.getElementById('settingsDialog').classList.remove('show');
  showToast('设置已保存');
}

function openEditorSettings(){
  loadEditorSettings();
  document.getElementById('settingsDialog').classList.add('show');
}

function saveTokenAndNext(){
  var token=document.getElementById('ghToken').value.trim();
  if(!token){showToast('请粘贴访问密钥');return;}
  var s=getGHSettings();
  s.token=token;
  if(!s.repo) s.repo='diedie23/Game-Knowledge-Base';
  if(!s.branch) s.branch='main';
  localStorage.setItem('kb_gh_settings',JSON.stringify(s));
  showPublishStep2();
}

function showPublishDialog(){
  if(!vditorInstance||!vditorInstance.getValue().trim()){showToast('请先编写内容');return;}
  if(!getEditorFileName()||document.getElementById('editorFileName').value.trim()===''){
    showToast('请先填写文档名称');document.getElementById('editorFileName').focus();return;
  }
  var s=getGHSettings();
  // 有 token → 直接到步骤2；没有 → 先显示步骤1
  if(s.token){
    document.getElementById('pubStep1').style.display='none';
    document.getElementById('pubStep2').style.display='block';
    fillPublishPreview();
  }else{
    document.getElementById('pubStep1').style.display='block';
    document.getElementById('pubStep2').style.display='none';
  }
  document.getElementById('publishDialog').classList.add('show');
}

function showPublishStep2(){
  document.getElementById('pubStep1').style.display='none';
  document.getElementById('pubStep2').style.display='block';
  fillPublishPreview();
}

function fillPublishPreview(){
  var name=getEditorFileName();
  var catEl=document.getElementById('editorCategory');
  var catName=catEl.options[catEl.selectedIndex].text;
  document.getElementById('pubName').textContent=name;
  document.getElementById('pubLocation').textContent='knowledge-base/art/'+name+'.md';
  document.getElementById('pubCat').textContent=catName;
}

async function publishToGitHub(){
  var s=getGHSettings();
  if(!s.token){showToast('缺少访问密钥');return;}

  var repo=s.repo||'diedie23/Game-Knowledge-Base';
  var branch=s.branch||'main';
  var name=getEditorFileName();
  var filePath='docs/knowledge-base/art/'+name+'.md';
  var content=vditorInstance.getValue();
  var msg='docs: 新增 '+name;
  var updateSidebar=document.getElementById('publishUpdateSidebar').checked;

  var btn=document.getElementById('pubConfirmBtn');
  btn.textContent='⏳ 发布中...';btn.disabled=true;

  try{
    var base='https://api.github.com/repos/'+repo+'/contents/';
    var headers={'Authorization':'token '+s.token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};

    // 1. 上传 MD 文件
    var body={message:msg,content:btoa(unescape(encodeURIComponent(content))),branch:branch};
    try{
      var exist=await fetch(base+filePath+'?ref='+branch,{headers:headers});
      if(exist.ok){var ed=await exist.json();body.sha=ed.sha;}
    }catch(e){}

    var res=await fetch(base+filePath,{method:'PUT',headers:headers,body:JSON.stringify(body)});
    if(!res.ok){
      var err=await res.json();
      if(err.message&&err.message.indexOf('Bad credentials')>=0) throw new Error('密钥无效，请检查后重试');
      throw new Error(err.message||'发布失败');
    }

    // 2. 更新 sidebar.json
    if(updateSidebar){
      try{
        var sbRes=await fetch(base+'docs/sidebar.json?ref='+branch,{headers:headers});
        if(sbRes.ok){
          var sbData=await sbRes.json();
          var sbContent=JSON.parse(decodeURIComponent(escape(atob(sbData.content.replace(/\n/g,'')))));
          var catId=document.getElementById('editorCategory').value;
          var cat=sbContent.categories.find(function(c){return c.id===catId;});
          if(cat){
            var docGroup=cat.groups.find(function(g){return g.name==='文档';});
            if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
            var docId=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
            if(!docGroup.items.find(function(i){return i.id===docId;})){
              docGroup.items.push({id:docId,icon:'📝',title:name,type:'md',file:'knowledge-base/art/'+name+'.md',badge:'文档'});
              var sbBody={message:'docs: 更新菜单 - 添加 '+name,content:btoa(unescape(encodeURIComponent(JSON.stringify(sbContent,null,2)))),sha:sbData.sha,branch:branch};
              await fetch(base+'docs/sidebar.json',{method:'PUT',headers:headers,body:JSON.stringify(sbBody)});
            }
          }
        }
      }catch(e){console.log('sidebar update skipped:',e);}
    }

    document.getElementById('publishDialog').classList.remove('show');
    showToast('🎉 发布成功！刷新页面即可看到新文档');
    localStorage.removeItem('kb_editor_draft');
    if(vditorInstance) vditorInstance.setValue('');
    document.getElementById('editorFileName').value='';
  }catch(e){
    showToast('❌ '+e.message);
  }finally{
    btn.textContent='✅ 确认发布';btn.disabled=false;
  }
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
  // 1. 从 sidebar.json 构建侧边栏
  fetch('sidebar.json').then(function(r){return r.json();}).then(function(data){
    buildSidebar(data);
    // 2. 初始化搜索
    initSearch();
    // 3. 处理 hash 路由
    setupScrollSpy();
    var hash=location.hash.slice(1);
    if(hash) navigate(hash);
  }).catch(function(e){
    console.error('Failed to load sidebar.json:',e);
  });

  // 监听 md-viewer iframe 渲染完成通知
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='md-viewer-ready'&&curPage){
      buildIframeToc(curPage);
      setupIframeScrollSpy(curPage);
    }
  });
});
