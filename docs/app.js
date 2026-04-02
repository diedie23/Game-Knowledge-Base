// ═══════════════════════════════════════════════════
// 游戏项目知识库 v3.0 — 矩阵式重构版
// 核心架构：30% 规范 · 30% 工具 · 40% 武器库
// ═══════════════════════════════════════════════════

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
var sidebarData=null;   // sidebar.json 数据
var indexData=null;      // index.json 数据（含 module 字段）
var docs={};             // 已加载的 MD 内容缓存
var curPage='home';
var fuse=null;
var pageRegistry={};     // pageId → {type, file, download, badge, craft, catId, module ...}

// 工具页数据（嵌入式工具的详细信息卡片）
var toolData={
  'auto-mask':{icon:'🤖',iconBg:'var(--green-bg)',name:'自动 Mask 通道生成器',ver:'v4.0',status:'online',subtitle:'RGBA 四通道 · HSV 色相识别 · 手动修正笔 · Float32 精度',desc:'在原图上吸色→HSV色相匹配→RGBA四通道分配→手动画笔微调→32位PNG导出。支持A通道三种模式（吸色/原Alpha/描边）、反选、色彩锁定。',tags:['在线工具','RGBA四通道','HSV色相','手动修正笔','Float32精度'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/auto-mask.html'},
  'mask-tool':{icon:'🖌️',iconBg:'var(--orange-bg)',name:'Mask 手动编辑器',ver:'v1.0',status:'online',subtitle:'画笔 / 油漆桶 / 橡皮擦 · 实时四通道预览',desc:'专为 Mask 精修设计的轻量编辑器。导入原图后直接在浏览器中用画笔逐通道绘制或修改，R/G/B/A 四通道独立显示并可实时预览换色效果。',tags:['在线工具','画笔绘制','RGBA预览','所见即所得'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/mask-tool.html'},
  'spine-split':{icon:'✂️',iconBg:'var(--purple-bg)',name:'Spine 角色拆分工具',ver:'v3.0',status:'online',subtitle:'自定义模板 · 三点锚点对齐 · 多选镜像 · Alpha收缩',desc:'上传角色原画，选择/自制模板后通过三点锚点对齐自适应不同头身比。支持多选镜像操作、Alpha边缘收缩、拓扑延展，导出 ZIP 包含 Spine JSON。',tags:['在线工具','自定义模板','三点对齐','镜像操作','Alpha收缩'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/spine-split.html'},
  'mask-core-algorithms':{icon:'🧪',iconBg:'var(--accent-bg)',name:'Mask 核心算法演示',ver:'v2.0',status:'online',subtitle:'智能魔棒 Flood Fill · 边缘保护画笔 Sobel · Web Worker 并行',desc:'工业级 Mask 绘制的两大核心算法实现：基于扫描线的非递归 Flood Fill 魔棒（HSV/RGB 容差+高斯羽化），以及 Sobel 边缘检测驱动的自动"不出界"画笔。全部在 Worker 中并行计算。',tags:['在线工具','魔棒','Flood Fill','Sobel','边缘检测','Web Worker','Float32'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/mask-core-algorithms.html'}
};

// ═══ Loading Bar ═══
function showLoading(){var b=document.getElementById('loadingBar');b.style.width='0';b.classList.add('on');setTimeout(function(){b.style.width='60%';},50);}
function hideLoading(){var b=document.getElementById('loadingBar');b.style.width='100%';setTimeout(function(){b.classList.remove('on');b.style.width='0';},300);}

// ═══ 通用折叠/展开工具函数（精确 height 动画 + 手风琴互斥）═══
// 【修复核心】所有点击入口统一走 handleToggle，内部用 stopPropagation 隔离事件

/**
 * 获取当前节点的直接子容器
 */
function getChildContainer(el){
  // 只查直接子节点，避免匹配到更深层的容器
  var children = el.children;
  for(var i=0;i<children.length;i++){
    var cls = children[i].className || '';
    if(cls.indexOf('t1-c')!==-1 || cls.indexOf('t2-c')!==-1 || cls.indexOf('t3-c')!==-1){
      return children[i];
    }
  }
  return null;
}

/**
 * 折叠某个节点（带动画）
 * 【修复】先递归折叠子节点，使用 requestAnimationFrame 确保回流时序正确
 */
function collapseNode(el){
  if(!el || !el.classList.contains('open')) return;
  var container = getChildContainer(el);
  if(!container) return;
  // 清除可能残留的 transitionend 监听（防止回调堆积）
  if(container._onTransEnd) {
    container.removeEventListener('transitionend', container._onTransEnd);
    container._onTransEnd = null;
  }
  // 先递归瞬间折叠所有子节点，防止高度计算错误
  var childNodes = container.querySelectorAll('.t1.open, .t2.open, .t3.open');
  for(var i=0;i<childNodes.length;i++) collapseNodeInstant(childNodes[i]);
  // 标记为关闭
  el.classList.remove('open');
  // 先锁定当前高度，再在下一帧设置为 0 触发 transition
  container.style.height = container.scrollHeight + 'px';
  container.offsetHeight; // 强制回流
  container.style.height = '0';
}

/**
 * 瞬间折叠（无动画）
 */
function collapseNodeInstant(el){
  if(!el || !el.classList.contains('open')) return;
  var container = getChildContainer(el);
  if(!container) return;
  // 清除残留回调
  if(container._onTransEnd) {
    container.removeEventListener('transitionend', container._onTransEnd);
    container._onTransEnd = null;
  }
  el.classList.remove('open');
  container.style.height = '0';
}

/**
 * 展开某个节点（带动画）
 * 【修复】1. 仅响应 height 属性的 transitionend 2. 清除旧回调防止堆积
 */
function expandNode(el){
  if(!el || el.classList.contains('open')) return;
  var container = getChildContainer(el);
  if(!container) return;
  // 清除可能残留的旧 transitionend 回调
  if(container._onTransEnd) {
    container.removeEventListener('transitionend', container._onTransEnd);
    container._onTransEnd = null;
  }
  el.classList.add('open');
  var targetHeight = container.scrollHeight;
  container.style.height = targetHeight + 'px';
  var onEnd = function(e){
    // ★★★ 仅响应 height 属性 + 仅响应自身容器（非子元素冒泡）★★★
    if(e.target !== container) return;
    if(e.propertyName !== 'height') return;
    container.style.height = 'auto';
    container.removeEventListener('transitionend', onEnd);
    container._onTransEnd = null;
  };
  container._onTransEnd = onEnd;
  container.addEventListener('transitionend', onEnd);
}

/**
 * 手风琴互斥：折叠同层级的其他同类节点
 * @param {Element} el  当前要展开的节点
 */
function collapseSiblings(el){
  if(!el || !el.parentElement) return;
  var siblings = el.parentElement.children;
  var elTag = el.classList.contains('t1') ? 't1' : el.classList.contains('t2') ? 't2' : 't3';
  for(var i=0;i<siblings.length;i++){
    if(siblings[i] !== el && siblings[i].classList.contains(elTag) && siblings[i].classList.contains('open')){
      collapseNode(siblings[i]);
    }
  }
}

/**
 * 统一的 Toggle 入口 —— 由 onclick 调用
 * 【核心修复】e.stopPropagation() + e.preventDefault() 防止父子事件互相干扰
 */
function handleToggle(e, headerEl){
  // ★★★ 阻止事件冒泡和默认行为 ★★★
  e.stopPropagation();
  e.preventDefault();

  var treeNode = headerEl.parentElement; // .t1 / .t2 / .t3
  var isOpen = treeNode.classList.contains('open');

  if(isOpen){
    // 当前已展开 → 折叠
    collapseNode(treeNode);
  } else {
    // 先折叠同级的其他节点（手风琴效果）
    collapseSiblings(treeNode);
    // 再展开当前节点
    expandNode(treeNode);
  }
}

/**
 * toggleTree 保留兼容（内部页面 TOC 等可能调用）
 */
function toggleTree(el){
  var container = getChildContainer(el);
  if(!container) return;
  if(el.classList.contains('open')){
    collapseNode(el);
  } else {
    collapseSiblings(el);
    expandNode(el);
  }
}

// 程序化展开（不带动画，用于导航时自动展开父级）
function expandTree(el){
  if(!el||el.classList.contains('open')) return;
  var container = getChildContainer(el);
  if(!container) return;
  // 清除可能残留的动画回调（防止与 expandNode 冲突）
  if(container._onTransEnd) {
    container.removeEventListener('transitionend', container._onTransEnd);
    container._onTransEnd = null;
  }
  el.classList.add('open');
  container.style.height='auto';
}

// ═══ 模块颜色与样式映射 ═══
var MODULE_STYLES = {
  'mod-norm':    { color: 'accent', highlight: 'var(--accent)',  bg: 'var(--accent-bg)' },
  'mod-tool':    { color: 'green',  highlight: 'var(--green)',   bg: 'var(--green-bg)' },
  'mod-arsenal': { color: 'red',    highlight: 'var(--red)',     bg: 'rgba(248,113,113,.08)' }
};

// 工种 badge 样式映射
var CRAFT_COLORS = {
  '角色': { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  'UI':   { bg: 'var(--purple-bg)', color: 'var(--purple)' },
  '场景': { bg: 'var(--green-bg)',  color: 'var(--green)' },
  '特效': { bg: 'var(--orange-bg)', color: 'var(--orange)' },
  '技术': { bg: 'var(--pink-bg)',   color: 'var(--pink)' },
  '管理': { bg: 'var(--cyan-bg)',   color: 'var(--cyan)' },
  '通用': { bg: 'rgba(139,143,163,.1)', color: 'var(--dim)' }
};

// ═══ SVG 图标常量（极简单色风格）═══
var SVG_CHEVRON = '<svg class="chv-svg" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var SVG_DOC = '<svg class="leaf-icon" viewBox="0 0 16 16" fill="none"><path d="M4 1.5h5.5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/><path d="M9.5 1.5V5H13" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

// ═══ Sidebar.json 驱动构建侧边栏 ═══
// 【重构】极简 Notion/Linear 风格 — 无 Emoji，SVG chevron + 文档图标
function buildSidebar(data){
  sidebarData=data;
  var nav=document.getElementById('sidebarNav');
  var html='<button class="nav-home active" onclick="navigate(\'home\')" id="navHome"><svg class="nav-home-icon" viewBox="0 0 16 16" fill="none"><path d="M2 8.5l6-6 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 7v6.5a1 1 0 001 1h7a1 1 0 001-1V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>知识库首页</span></button>';

  // 统计计数器
  var normCount=0, toolCount=0, arsenalCount=0;

  data.categories.forEach(function(cat){
    var itemCount=0;
    cat.groups.forEach(function(g){ itemCount += g.items ? g.items.length : 0; });

    // 按模块 ID 计数
    if(cat.id === 'mod-norm')    normCount = itemCount;
    if(cat.id === 'mod-tool')    toolCount = itemCount;
    if(cat.id === 'mod-arsenal') arsenalCount = itemCount;

    var isArsenal = cat.id === 'mod-arsenal';

    // 获取纯文本名称（去掉 Emoji 前缀）
    var catName = cat.name.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/u, '');

    var extraCls = isArsenal ? ' t1-arsenal' : '';
    html += '<div class="t1' + extraCls + '" id="' + cat.id + '">';
    html += '<div class="t1-h" onclick="handleToggle(event,this)">'
      + SVG_CHEVRON
      + '<span class="cl">' + catName + '</span>'
      + '<span class="cc">' + itemCount + '</span>'
      + '</div>';
    html += '<div class="t1-c">';

    if(!cat.groups.length){
      html += '<div class="leaf leaf--empty">待补充...</div>';
    } else {
      cat.groups.forEach(function(grp){
        html += '<div class="t2"><div class="t2-h" onclick="handleToggle(event,this)">'
          + SVG_CHEVRON
          + '<span class="sl">' + grp.name + '</span></div><div class="t2-c">';

        if(grp.items) grp.items.forEach(function(item){
          // 注册页面到全局 pageRegistry
          pageRegistry[item.id] = {
            type: item.type,
            file: item.file || '',
            download: item.download || '',
            badge: item.badge || '',
            craft: item.craft || '',
            catId: cat.id
          };

          html += '<button class="leaf" data-page="' + item.id + '" title="' + item.title + '" onclick="event.stopPropagation();navigate(\'' + item.id + '\',this)">'
            + SVG_DOC
            + '<span class="leaf-text">' + item.title + '</span>'
            + '</button>';
          html += '<div class="toc-box" id="toc-' + item.id + '"></div>';
        });
        html += '</div></div>';
      });
    }
    html += '</div></div>';
  });

  nav.innerHTML = html;

  // 更新首页统计数字
  var numEls = document.querySelectorAll('.stat .num');
  if(numEls[0]) numEls[0].textContent = normCount + ' 篇';
  if(numEls[1]) numEls[1].textContent = toolCount + ' 个';
  if(numEls[2]) numEls[2].textContent = arsenalCount + ' 项';

  // ═══ 统计卡片 → 锚点快捷导航 ═══
  var statTargets = [
    { sel: '.stat-norm',    anchor: '#section-norms' },
    { sel: '.stat-tool',    anchor: '#section-tools' },
    { sel: '.stat-arsenal', anchor: '#section-arsenal' }
  ];
  var scrollContainer = document.getElementById('contentScroll');
  statTargets.forEach(function(item){
    var card = document.querySelector(item.sel);
    if(!card) return;
    card.addEventListener('click', function(){
      // 确保首页可见
      if(curPage !== 'home') navigate('home');
      var target = document.querySelector(item.anchor);
      if(!target || !scrollContainer) return;
      var containerRect = scrollContainer.getBoundingClientRect();
      var targetRect = target.getBoundingClientRect();
      var scrollOffset = scrollContainer.scrollTop + targetRect.top - containerRect.top - 24;
      scrollContainer.scrollTo({ top: scrollOffset, behavior: 'smooth' });
    });
  });

  // 默认展开第一个分类（规范与常识）
  var firstCat = nav.querySelector('.t1');
  if(firstCat) expandTree(firstCat);
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
      showLoading();scroll.style.display='block';
      var pg=getOrCreateDocPage(pageId);
      pg.style.display='block';pg.classList.add('active');
      var ct=pg.querySelector('.dc');

      if(docs[pageId]){
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
    } else if(reg.type==='iframe' || reg.type==='tool'){
      showLoading();
      // 下载工具栏
      if(reg.download){
        var toolbar=document.getElementById('iframeToolbar');
        var name=btn?btn.textContent.trim():(pageId);
        toolbar.innerHTML='<div class="ift-title"><span class="ift-icon">📦</span>'+name+'</div><a class="ift-dl" href="'+reg.download+'" download>⬇ 下载 exe</a>';
        toolbar.style.display='flex';
      }
      // 如果是内嵌工具（有 toolData），走 renderToolPage
      if(toolData[pageId]){
        scroll.style.display='block';renderToolPage(pageId);
        tp.style.display='block';tp.classList.add('active');scroll.scrollTop=0;setTimeout(hideLoading,400);
      } else {
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
  var reg=pageRegistry[pageId]||{};
  var isEditable=reg.type==='md';
  var toolbar='';
  if(isEditable){
    toolbar='<div class="doc-toolbar"><span class="doc-toolbar-title">📄 '+((reg.file||'').split('/').pop()||'')+'</span><div class="doc-toolbar-actions">'
      +'<button class="dt-btn" onclick="editDocument(\''+pageId+'\')">✏️ 编辑</button>'
      +'<button class="dt-btn dt-btn-danger" onclick="confirmDeleteDocument(\''+pageId+'\')">🗑️ 删除</button>'
      +'</div></div>';
  }
  pg.innerHTML=toolbar+'<div class="dc" id="ct-'+pageId+'"></div>';
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
    +'<iframe class="tool-embed-frame" src="'+d.url+'" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads" loading="lazy"></iframe>'
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
  if(reg&&reg.catId){var cat=document.getElementById(reg.catId);expandTree(cat);}
  var al=document.querySelector('.leaf.active');
  if(al){
    var l2=al.closest('.t2');if(l2) expandTree(l2);
    var l3=al.closest('.t3');if(l3) expandTree(l3);
  }
}

// ═══ TOC 四级大纲 (h2 + h3 + h4) ═══
function collapseAllToc(){
  document.querySelectorAll('.toc-box').forEach(function(t){
    // 清除残留的 transitionend 回调（防堆积）
    if(t._tocTransEnd) {
      t.removeEventListener('transitionend', t._tocTransEnd);
      t._tocTransEnd = null;
    }
    t.style.height='0';
    t.innerHTML='';
  });
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
    html+='<button class="'+cls+'" data-anchor="'+id+'" onclick="event.stopPropagation();tocScrollTo(\''+id+'\')">'+h.textContent+'</button>';
  });
  tc.innerHTML=html;
  // 丝滑展开动画：使用 max-height + transition
  tc.style.height=tc.scrollHeight+'px';
  var onEnd=function(e){
    if(e.target !== tc) return;
    if(e.propertyName !== 'height') return;
    tc.style.height='auto';
    tc.removeEventListener('transitionend',onEnd);
    tc._tocTransEnd = null;
  };
  tc._tocTransEnd = onEnd;
  tc.addEventListener('transitionend',onEnd);
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
      html+='<button class="'+cls+'" data-iframe-anchor="'+h.id+'" onclick="event.stopPropagation();iframeTocScrollTo(\''+h.id+'\')">'+h.textContent+'</button>';
    });
    tc.innerHTML=html;
    tc.style.height=tc.scrollHeight+'px';
    var onEnd=function(e){
      if(e.target !== tc) return;
      if(e.propertyName !== 'height') return;
      tc.style.height='auto';
      tc.removeEventListener('transitionend',onEnd);
      tc._tocTransEnd = null;
    };
    tc._tocTransEnd = onEnd;
    tc.addEventListener('transitionend',onEnd);
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

// ═══ Search (融合 index.json 新结构) ═══
function initSearch(){
  try{
    fetch('index.json').then(function(res){if(!res.ok) return;return res.json();}).then(function(data){
      indexData = data; // 保存全局引用
      var items=[];

      // 从扁平化 items 数组构建搜索数据
      if(data && data.items){
        data.items.forEach(function(item){
          items.push({
            id: item.id,
            title: item.title,
            type: item.type,
            module: item.module,
            craft: item.craft,
            content: item.desc + ' ' + item.tags.join(' '),
            action: 'navigate'
          });
        });
      }

      // 也加 sidebar 数据（补充搜索索引）
      if(sidebarData){
        sidebarData.categories.forEach(function(cat){
          cat.groups.forEach(function(g){
            if(g.items) g.items.forEach(function(item){
              // 避免重复添加（index.json 已有的）
              if(!items.find(function(i){ return i.id === item.id; })){
                items.push({id:item.id, title:item.title, type:item.type, content:item.title, action:'navigate', craft: item.craft||''});
              }
            });
          });
        });
      }

      fuse=new Fuse(items,{keys:[{name:'title',weight:3},{name:'content',weight:1},{name:'craft',weight:0.5}],threshold:0.35,includeMatches:true,minMatchCharLength:1});
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
    // 模块标签颜色
    var modLabel='📋', modCls='background:rgba(108,140,255,.08);color:#6c8cff';
    if(item.module==='tool')    { modLabel='🔧'; modCls='background:rgba(74,222,128,.08);color:#4ade80'; }
    if(item.module==='arsenal') { modLabel='⚔️'; modCls='background:rgba(248,113,113,.08);color:#f87171'; }
    // 工种 Tag
    var craftHtml = item.craft ? '<span class="sr-craft">['+item.craft+']</span>' : '';

    html+='<div class="sr-item" onmousedown="navigate(\''+item.id+'\');document.getElementById(\'searchDropdown\').classList.remove(\'show\');document.getElementById(\'searchInput\').value=\'\'">'
      +'<span class="sr-type" style="'+modCls+'">'+modLabel+'</span>'
      +'<span class="sr-title">'+item.title+'</span>'
      +craftHtml
      +'</div>';
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

var editingPageId=null;

function openEditor(existingPageId){
  editingPageId=existingPageId||null;
  document.getElementById('contentScroll').style.display='none';
  document.getElementById('contentFrame').style.display='none';
  document.getElementById('iframeToolbar').style.display='none';
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
        loadEditorContent();
      },
      input:function(val){
        localStorage.setItem('kb_editor_draft',val);
      }
    });
  } else {
    loadEditorContent();
  }
  loadEditorSettings();
  var titleEl=document.querySelector('.eh-title');
  var pubBtn=document.querySelector('.eh-btn-primary');
  if(editingPageId){
    if(titleEl) titleEl.textContent='✏️ 编辑模式';
    if(pubBtn) pubBtn.textContent='💾 保存更新';
  }else{
    if(titleEl) titleEl.textContent='✍️ 创作模式';
    if(pubBtn) pubBtn.textContent='🚀 发布到仓库';
  }
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

// ═══ 编辑器内容加载 ═══
function loadEditorContent(){
  if(!vditorInstance) return;
  if(editingPageId&&docs[editingPageId]){
    vditorInstance.setValue(docs[editingPageId]);
    var reg=pageRegistry[editingPageId]||{};
    var fileName=(reg.file||'').split('/').pop().replace(/\.md$/,'');
    document.getElementById('editorFileName').value=fileName;
    if(reg.catId){
      var catSel=document.getElementById('editorCategory');
      for(var i=0;i<catSel.options.length;i++){if(catSel.options[i].value===reg.catId){catSel.selectedIndex=i;break;}}
    }
  } else if(editingPageId&&pageRegistry[editingPageId]){
    var reg=pageRegistry[editingPageId];
    vditorInstance.setValue('⏳ 加载中...');
    fetch(reg.file).then(function(r){return r.text();}).then(function(md){
      docs[editingPageId]=md;
      vditorInstance.setValue(md);
      var fileName=(reg.file||'').split('/').pop().replace(/\.md$/,'');
      document.getElementById('editorFileName').value=fileName;
      if(reg.catId){
        var catSel=document.getElementById('editorCategory');
        for(var i=0;i<catSel.options.length;i++){if(catSel.options[i].value===reg.catId){catSel.selectedIndex=i;break;}}
      }
    });
  } else {
    var draft=localStorage.getItem('kb_editor_draft');
    if(draft) vditorInstance.setValue(draft);
  }
}

function editDocument(pageId){
  openEditor(pageId);
}

function confirmDeleteDocument(pageId){
  var reg=pageRegistry[pageId];
  if(!reg) return;
  var name=(reg.file||'').split('/').pop();
  var dlg=document.getElementById('deleteDialog');
  if(!dlg){
    dlg=document.createElement('div');dlg.id='deleteDialog';dlg.className='fb-overlay';
    dlg.innerHTML='<div class="dialog-card" style="max-width:420px">'
      +'<h3>🗑️ 确认删除</h3>'
      +'<p class="dlg-desc" id="deleteDesc"></p>'
      +'<p class="dlg-hint" style="color:#f87171">⚠️ 删除后无法恢复（除非通过 GitHub 历史记录）。</p>'
      +'<div class="dlg-actions">'
      +'<button class="eh-btn" onclick="document.getElementById(\'deleteDialog\').classList.remove(\'show\')">取消</button>'
      +'<button class="eh-btn" id="deleteConfirmBtn" style="background:#f87171;color:#fff;border:none">确认删除</button>'
      +'</div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.classList.remove('show');});
  }
  document.getElementById('deleteDesc').textContent='确定要删除「'+name+'」吗？文档将从知识库和侧边栏中移除。';
  document.getElementById('deleteConfirmBtn').onclick=function(){deleteDocument(pageId);};
  dlg.classList.add('show');
}

async function deleteDocument(pageId){
  var s=getGHSettings();
  if(!s.token){showToast('请先在设置中绑定访问密钥');return;}
  var reg=pageRegistry[pageId];
  if(!reg) return;

  var repo=s.repo||'diedie23/Game-Knowledge-Base';
  var branch=s.branch||'main';
  var filePath='docs/'+reg.file.replace(/\?.*$/,'');
  var name=(reg.file||'').split('/').pop().replace(/\.md$/,'');

  var btn=document.getElementById('deleteConfirmBtn');
  btn.textContent='删除中...';btn.disabled=true;

  try{
    var base='https://api.github.com/repos/'+repo+'/contents/';
    var headers={'Authorization':'token '+s.token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};

    var fileRes=await fetch(base+filePath+'?ref='+branch,{headers:headers});
    if(!fileRes.ok) throw new Error('找不到文件');
    var fileData=await fileRes.json();

    var res=await fetch(base+filePath,{method:'DELETE',headers:headers,body:JSON.stringify({message:'docs: 删除 '+name,sha:fileData.sha,branch:branch})});
    if(!res.ok) throw new Error('删除失败');

    try{
      var sbRes=await fetch(base+'docs/sidebar.json?ref='+branch,{headers:headers});
      if(sbRes.ok){
        var sbData=await sbRes.json();
        var sbContent=JSON.parse(decodeURIComponent(escape(atob(sbData.content.replace(/\n/g,'')))));
        sbContent.categories.forEach(function(cat){
          cat.groups.forEach(function(g){
            if(g.items) g.items=g.items.filter(function(i){return i.id!==pageId;});
          });
        });
        var sbBody={message:'docs: 更新菜单 - 删除 '+name,content:btoa(unescape(encodeURIComponent(JSON.stringify(sbContent,null,2)))),sha:sbData.sha,branch:branch};
        await fetch(base+'docs/sidebar.json',{method:'PUT',headers:headers,body:JSON.stringify(sbBody)});
      }
    }catch(e){}

    document.getElementById('deleteDialog').classList.remove('show');
    showToast('已删除「'+name+'」');
    delete docs[pageId];
    delete pageRegistry[pageId];
    var oldPg=document.getElementById('page-'+pageId);
    if(oldPg) oldPg.remove();

    if(sidebarData){
      sidebarData.categories.forEach(function(cat){
        cat.groups.forEach(function(g){
          if(g.items) g.items=g.items.filter(function(i){return i.id!==pageId;});
        });
      });
      buildSidebar(sidebarData);
    }
    navigate('home');
  }catch(e){
    showToast('❌ '+e.message);
  }finally{
    btn.textContent='确认删除';btn.disabled=false;
  }
}

// ═══ GitHub API 发布 ═══
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
  var fnInput=document.getElementById('editorFileName');
  if(!fnInput.value.trim()){
    fnInput.style.borderColor='#f87171';
    fnInput.placeholder='⚠️ 请先输入文档名称！';
    fnInput.focus();
    setTimeout(function(){fnInput.style.borderColor='';fnInput.placeholder='文件名（如：角色动画规范）';},3000);
    return;
  }
  var s=getGHSettings();
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
  var filePath;
  if(editingPageId&&pageRegistry[editingPageId]){
    filePath='docs/'+pageRegistry[editingPageId].file.replace(/\?.*$/,'');
  } else {
    filePath='docs/knowledge-base/art/'+name+'.md';
  }
  var content=vditorInstance.getValue();
  var msg=editingPageId?'docs: 更新 '+name:'docs: 新增 '+name;
  var updateSidebar=editingPageId?false:document.getElementById('publishUpdateSidebar').checked;

  var btn=document.getElementById('pubConfirmBtn');
  btn.textContent='⏳ 发布中...';btn.disabled=true;

  try{
    var base='https://api.github.com/repos/'+repo+'/contents/';
    var headers={'Authorization':'token '+s.token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};

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

    if(updateSidebar){
      try{
        var sbRes=await fetch(base+'docs/sidebar.json?ref='+branch,{headers:headers});
        if(sbRes.ok){
          var sbData=await sbRes.json();
          var sbContent=JSON.parse(decodeURIComponent(escape(atob(sbData.content.replace(/\n/g,'')))));
          var catId=document.getElementById('editorCategory').value;
          var cat=sbContent.categories.find(function(c){return c.id===catId;});
          if(cat){
            var docGroup=cat.groups.find(function(g){return g.name==='文档'||g.name==='角色规范'||g.name==='UI 规范';});
            if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
            var docId=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
            if(!docGroup.items.find(function(i){return i.id===docId;})){
              docGroup.items.push({id:docId,icon:'📝',title:name,type:'md',file:'knowledge-base/art/'+name+'.md',badge:'文档',craft:'角色'});
              var sbBody={message:'docs: 更新菜单 - 添加 '+name,content:btoa(unescape(encodeURIComponent(JSON.stringify(sbContent,null,2)))),sha:sbData.sha,branch:branch};
              await fetch(base+'docs/sidebar.json',{method:'PUT',headers:headers,body:JSON.stringify(sbBody)});
            }
          }
        }
      }catch(e){console.log('sidebar update skipped:',e);}
    }

    document.getElementById('publishDialog').classList.remove('show');
    showToast(editingPageId?'🎉 更新成功！':'🎉 发布成功！');
    localStorage.removeItem('kb_editor_draft');
    var targetPageId=editingPageId||name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
    docs[targetPageId]=content;
    if(editingPageId){var oldPg=document.getElementById('page-'+editingPageId);if(oldPg)oldPg.remove();}
    editingPageId=null;
    if(vditorInstance) vditorInstance.setValue('');
    document.getElementById('editorFileName').value='';
    if(updateSidebar&&sidebarData){
      var catId=document.getElementById('editorCategory');
      var catIdVal=catId.value;
      var cat=sidebarData.categories.find(function(c){return c.id===catIdVal;});
      if(cat){
        var docGroup=cat.groups.find(function(g){return g.name==='文档'||g.name==='角色规范';});
        if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
        var docId=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
        if(!docGroup.items.find(function(i){return i.id===docId;})){
          docGroup.items.push({id:docId,icon:'📝',title:name,type:'md',file:'knowledge-base/art/'+name+'.md',badge:'文档',craft:'角色'});
        }
      }
      buildSidebar(sidebarData);
    }
    closeEditor();
    setTimeout(function(){if(targetPageId&&pageRegistry[targetPageId]) navigate(targetPageId);},300);
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
    // 2. 初始化搜索（会同时加载 index.json）
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
