// ═══════════════════════════════════════════════════
// APM 专属知识库 v4.2 — 美术项目管理增强版
// 核心架构：30% 美术生产 · 30% 跨部门协同 · 20% 提效工具 · 20% 成本·风险·团队
// v4.2新增：APM管理仪表盘(Dashboard) · 文档详情增强(meta-bar/相关推荐) · 面包屑owner
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
var activeTagFilter='';  // 当前标签过滤关键词

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
  'mod-production': { color: 'accent', highlight: 'var(--accent)',  bg: 'var(--accent-bg)' },
  'mod-collab':     { color: 'orange', highlight: 'var(--orange)',  bg: 'var(--orange-bg)' },
  'mod-toolkit':    { color: 'green',  highlight: 'var(--green)',   bg: 'var(--green-bg)' },
  'mod-governance': { color: 'pink',   highlight: 'var(--pink)',    bg: 'var(--pink-bg)' },
  'mod-retrospect': { color: 'cyan',   highlight: 'var(--cyan)',    bg: 'var(--cyan-bg)' }
};

// 工种 badge 样式映射
var CRAFT_COLORS = {
  '角色': { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  'UI':   { bg: 'var(--purple-bg)', color: 'var(--purple)' },
  '场景': { bg: 'var(--green-bg)',  color: 'var(--green)' },
  '特效': { bg: 'var(--orange-bg)', color: 'var(--orange)' },
  '技术': { bg: 'var(--pink-bg)',   color: 'var(--pink)' },
  '管理': { bg: 'var(--cyan-bg)',   color: 'var(--cyan)' },
  '通用': { bg: 'rgba(139,143,163,.1)', color: 'var(--dim)' },
  '程序': { bg: 'var(--pink-bg)',   color: 'var(--pink)' },
  '策划': { bg: 'var(--orange-bg)', color: 'var(--orange)' },
  '音频': { bg: 'var(--cyan-bg)',   color: 'var(--cyan)' },
  '动画': { bg: 'var(--purple-bg)', color: 'var(--purple)' },
  'QA':   { bg: 'var(--green-bg)',  color: 'var(--green)' },
  'TA':   { bg: 'var(--pink-bg)',   color: 'var(--pink)' },
  '跨部门': { bg: 'var(--orange-bg)', color: 'var(--orange)' }
};

// ═══ SVG 图标常量（极简单色线性风格）═══
var SVG_CHEVRON = '<svg class="chv-svg" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var SVG_DOC = '<svg class="leaf-icon" viewBox="0 0 16 16" fill="none"><path d="M4 1.5h5.5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/><path d="M9.5 1.5V5H13" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// 一级模块文件夹图标（闭合）
var SVG_FOLDER = '<svg class="folder-icon" viewBox="0 0 16 16" fill="none"><path d="M1.5 3.5a1 1 0 011-1h3.586a1 1 0 01.707.293L8.5 4.5H13.5a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// 一级模块文件夹图标（展开）
var SVG_FOLDER_OPEN = '<svg class="folder-icon" viewBox="0 0 16 16" fill="none"><path d="M1.5 3.5a1 1 0 011-1h3.586a1 1 0 01.707.293L8.5 4.5H13.5a1 1 0 011 1V6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 13.5h11.5l1.5-6H3.5l-1.5 6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// 二级分组图标（子文件夹/分组线性图标）
var SVG_GROUP = '<svg class="group-icon" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5 8h6M5 10.5h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';

// ═══ Sidebar.json 驱动构建侧边栏 ═══
// 【优化】恢复标志性 Emoji 图标 — 增强视觉辨识度
function buildSidebar(data){
  sidebarData=data;
  var nav=document.getElementById('sidebarNav');
  var html='<div class="sidebar-nav-actions"><button class="nav-home active" onclick="navigate(\'home\')" id="navHome"><span class="nav-home-emoji">🏠</span><span>知识库首页</span></button>'
    +'<div class="nav-toggle-btns"><button class="nav-toggle-btn" onclick="expandAllSidebar()" title="全部展开">📂 展开</button><button class="nav-toggle-btn" onclick="collapseAllSidebar()" title="全部折叠">📁 折叠</button></div></div>';

  // 统计计数器
  var productionCount=0, collabCount=0, toolkitCount=0, governanceCount=0, retrospectCount=0;

  data.categories.forEach(function(cat){
    var itemCount=0;
    cat.groups.forEach(function(g){ itemCount += g.items ? g.items.length : 0; });

    // 按模块 ID 计数
    if(cat.id === 'mod-production')  productionCount = itemCount;
    if(cat.id === 'mod-collab')      collabCount = itemCount;
    if(cat.id === 'mod-toolkit')     toolkitCount = itemCount;
    if(cat.id === 'mod-governance')  governanceCount = itemCount;
    if(cat.id === 'mod-retrospect')  retrospectCount = itemCount;

    var isCollab = cat.id === 'mod-collab';
    var isGovernance = cat.id === 'mod-governance';
    var isRetrospect = cat.id === 'mod-retrospect';

    // 获取纯文本名称（去掉 Emoji 前缀）
    var catName = cat.name.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/u, '');
    // 一级模块 Emoji 图标（从 JSON icon 字段读取）
    var catEmoji = cat.icon || '📁';

    var extraCls = isCollab ? ' t1-collab' : isGovernance ? ' t1-governance' : isRetrospect ? ' t1-retrospect' : '';
    html += '<div class="t1' + extraCls + '" id="' + cat.id + '">';
    html += '<div class="t1-h" onclick="handleToggle(event,this)">'
      + SVG_CHEVRON
      + '<span class="emoji-icon emoji-icon-l1">' + catEmoji + '</span>'
      + '<span class="cl">' + catName + '</span>'
      + '<span class="cc">' + itemCount + '</span>'
      + '</div>';
    html += '<div class="t1-c">';

    if(!cat.groups.length){
      html += '<div class="leaf leaf--empty">待补充...</div>';
    } else {
      cat.groups.forEach(function(grp){
        // 二级分组 Emoji 图标
        var grpEmoji = grp.icon || '📂';
        html += '<div class="t2"><div class="t2-h" onclick="handleToggle(event,this)">'
          + SVG_CHEVRON
          + '<span class="emoji-icon emoji-icon-l2">' + grpEmoji + '</span>'
          + '<span class="sl">' + grp.name + '</span></div><div class="t2-c">';

        if(grp.items) grp.items.forEach(function(item){
          // 注册页面到全局 pageRegistry
          pageRegistry[item.id] = {
            type: item.type,
            file: item.file || '',
            download: item.download || '',
            badge: item.badge || '',
            craft: item.craft || '',
            catId: cat.id,
            catName: catName,
            grpName: grp.name
          };

          // 三级叶节点 Emoji 图标
          var itemEmoji = item.icon || '📄';
          html += '<button class="leaf" data-page="' + item.id + '" title="' + item.title + '" onclick="event.stopPropagation();navigate(\'' + item.id + '\',this)">'
            + '<span class="emoji-icon emoji-icon-leaf">' + itemEmoji + '</span>'
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
  if(numEls[0]) numEls[0].textContent = productionCount + ' 篇';
  if(numEls[1]) numEls[1].textContent = collabCount + ' 篇';
  if(numEls[2]) numEls[2].textContent = toolkitCount + ' 个';
  if(numEls[3]) numEls[3].textContent = governanceCount + ' 篇';
  if(numEls[4]) numEls[4].textContent = retrospectCount + ' 篇';

  // ═══ 统计卡片 → 锚点快捷导航 ═══
  var statTargets = [
    { sel: '.stat-production', anchor: '#section-production' },
    { sel: '.stat-collab',     anchor: '#section-collab' },
    { sel: '.stat-toolkit',    anchor: '#section-toolkit' },
    { sel: '.stat-governance', anchor: '#section-governance' },
    { sel: '.stat-retrospect', anchor: '#section-retrospect' }
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

  // 面包屑导航更新
  updateBreadcrumb(pageId);
  // v4.2 文档详情元信息条
  updateDetailMetaBar(pageId);
  // v4.2 相关文档推荐
  updateRelatedDocs(pageId);
  // 互动模块占位
  updateInteractionPlaceholder(pageId);

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
          // draft_prompt 注入：如果文档有 draft_prompt 字段，在 placeholder 页面中渲染
          var meta=getItemMeta(pageId);
          if(meta && meta.draft_prompt){
            try{
              var iframeDoc=frame.contentDocument||frame.contentWindow.document;
              var placeholder=iframeDoc.querySelector('.placeholder');
              if(placeholder){
                injectDraftPrompt(iframeDoc, placeholder, meta.draft_prompt, meta.title);
              }
            }catch(e){console.log('Cannot inject draft_prompt:',e);}
          }
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
  // 责任人 & 更新日期
  var meta=getItemMeta(pageId);
  var metaHtml='';
  if(meta){
    metaHtml='<div class="doc-meta-bar">';
    if(meta.tags&&meta.tags.length) metaHtml+='<span class="doc-meta-item">🏷️ '+meta.tags.map(function(t){return'<span class="doc-meta-tag tag-clickable" onclick="filterByTag(\''+t+'\')">'+t+'</span>';}).join(' ')+'</span>';
    metaHtml+='</div>';
  }
  // 互动模块占位
  var interactionHtml='<div class="doc-interaction-placeholder">'
    +'<div class="interaction-section"><div class="interaction-header"><span>📜 文档版本历史</span><button class="interaction-btn" disabled>查看历史 →</button></div>'
    +'<div class="interaction-body"><p class="interaction-hint">此处将展示文档的修改记录与版本对比。</p></div></div>'
    +'<div class="interaction-section"><div class="interaction-header"><span>💬 评论与反馈</span><button class="interaction-btn" disabled>展开评论</button></div>'
    +'<div class="interaction-body"><p class="interaction-hint">此处将支持团队成员对文档发起讨论、提出建议或标记问题。</p></div></div>'
    +'</div>';
  pg.innerHTML=toolbar+metaHtml+'<div class="dc" id="ct-'+pageId+'"></div>'+interactionHtml;
  document.getElementById('contentScroll').appendChild(pg);
  return pg;
}

// ═══ Render Tool Page (Embedded Directly) ═══
function renderToolPage(id){
  var d=toolData[id],c=document.getElementById('page-tool');
  if(!d)return;
  var tags='';d.tags.forEach(function(t){tags+='<span class="tag tag-clickable" onclick="event.stopPropagation();filterByTag(\''+t+'\')">'+t+'</span>';});
  c.innerHTML=
    '<div class="tool-embed-header">'
    +'<div class="teh-icon" style="background:'+d.iconBg+'">'+d.icon+'</div>'
    +'<div class="teh-info"><h2>'+d.name+' <span class="ver">'+d.ver+'</span> <span class="st-on">🟢 在线</span></h2><div class="teh-sub">'+d.subtitle+'</div></div>'
    +'</div>'
    +'<div class="tool-embed-desc">'
    +'<p>'+d.desc+'</p>'
    +'<div class="tool-embed-tags">'+tags+'</div>'
    +'<div class="tool-embed-meta"><span class="mi">'+d.env+'</span><span class="mi">💻 '+d.platform+'</span><span class="mi">📦 '+d.install+'</span></div>'
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

// ═══ Search (融合 index.json APM 新结构 — 支持阶段/优先级) ═══
function initSearch(){
  try{
    fetch('index.json').then(function(res){if(!res.ok) return;return res.json();}).then(function(data){
      indexData = data; // 保存全局引用
      var items=[];

      // 从扁平化 items 数组构建搜索数据（含新字段）
      if(data && data.items){
        data.items.forEach(function(item){
          items.push({
            id: item.id,
            title: item.title,
            type: item.type,
            module: item.module,
            craft: item.craft,
            content: item.desc + ' ' + item.tags.join(' ') + ' ' + (item.applicable_stage||'') + ' ' + (item.priority||''),
            applicable_stage: item.applicable_stage || '',
            priority: item.priority || '',
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
                items.push({id:item.id, title:item.title, type:item.type, content:item.title, action:'navigate', craft: item.craft||'', applicable_stage:'', priority:''});
              }
            });
          });
        });
      }

      fuse=new Fuse(items,{keys:[{name:'title',weight:3},{name:'content',weight:1.5},{name:'craft',weight:0.5},{name:'applicable_stage',weight:1},{name:'priority',weight:0.5}],threshold:0.35,includeMatches:true,minMatchCharLength:1});
      // 加载完毕后渲染动态首页卡片和角标
      setTimeout(function(){
        renderHomeCards();
        renderHotCards();
        renderCardBadges();
        renderDashboard();
      }, 300);
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
    var modLabel='🏭', modCls='background:rgba(108,140,255,.08);color:#6c8cff';
    if(item.module==='collab')  { modLabel='🤝'; modCls='background:rgba(251,146,60,.08);color:#fb923c'; }
    if(item.module==='toolkit') { modLabel='🧰'; modCls='background:rgba(74,222,128,.08);color:#4ade80'; }
    if(item.module==='governance') { modLabel='💰'; modCls='background:rgba(244,114,182,.08);color:#f472b6'; }
    if(item.module==='retrospect') { modLabel='📒'; modCls='background:rgba(34,211,238,.08);color:#22d3ee'; }
    // 工种 Tag
    var craftHtml = item.craft ? '<span class="sr-craft">['+item.craft+']</span>' : '';
    // 阶段 Tag
    var stageHtml = '';
    if(item.applicable_stage){
      var sc = indexData && indexData.stageConfig && indexData.stageConfig[item.applicable_stage];
      var stageBg = sc ? sc.bg : 'rgba(167,139,250,.12)';
      var stageColor = sc ? sc.color : '#a78bfa';
      stageHtml = '<span class="sr-stage" style="background:'+stageBg+';color:'+stageColor+'">'+item.applicable_stage+'</span>';
    }

    html+='<div class="sr-item" onmousedown="navigate(\''+item.id+'\');document.getElementById(\'searchDropdown\').classList.remove(\'show\');document.getElementById(\'searchInput\').value=\'\'">'
      +'<span class="sr-type" style="'+modCls+'">'+modLabel+'</span>'
      +'<span class="sr-title">'+item.title+'</span>'
      +stageHtml
      +craftHtml
      +'</div>';
  });
  dd.innerHTML=html;dd.classList.add('show');
}

// ═══ Utilities ═══
function copyShareLink(){navigator.clipboard.writeText(location.href).then(function(){showToast('链接已复制');}).catch(function(){showToast('复制失败');});}
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2000);}

// ═══ Draft Prompt 注入（AI 辅助补全机制）═══
function injectDraftPrompt(iframeDoc, placeholder, promptText, docTitle){
  // 创建 draft_prompt 容器
  var section=iframeDoc.createElement('div');
  section.className='draft-prompt-section';
  section.innerHTML=
    '<div class="dp-notice">'
    +'<div class="dp-notice-icon">🤖</div>'
    +'<div class="dp-notice-text">'
    +'<strong>本文档尚未编写</strong>'
    +'<p>您可以复制下方提示词，前往 <strong>ChatGPT / Claude / CodeBuddy</strong> 生成初稿后补充到知识库中。</p>'
    +'</div>'
    +'</div>'
    +'<div class="dp-prompt-box">'
    +'<div class="dp-prompt-header">'
    +'<span class="dp-prompt-label">📝 AI 生成提示词 — '+(docTitle||'')+'</span>'
    +'<button class="dp-copy-btn" id="dpCopyBtn">📋 一键复制 Prompt</button>'
    +'</div>'
    +'<pre class="dp-prompt-content" id="dpPromptContent">'+promptText.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre>'
    +'</div>';

  // 注入样式
  var style=iframeDoc.createElement('style');
  style.textContent=
    '.draft-prompt-section{margin-top:32px;max-width:640px;width:100%;text-align:left;}'
    +'.dp-notice{display:flex;align-items:flex-start;gap:14px;padding:18px 22px;background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.18);border-radius:14px;margin-bottom:24px;}'
    +'.dp-notice-icon{font-size:32px;flex-shrink:0;margin-top:2px;}'
    +'.dp-notice-text{flex:1;}'
    +'.dp-notice-text strong{color:#e8eaed;font-size:15px;display:block;margin-bottom:6px;}'
    +'.dp-notice-text p{color:#8b8fa3;font-size:13px;line-height:1.7;margin:0;}'
    +'.dp-notice-text p strong{display:inline;color:#22d3ee;font-size:13px;}'
    +'.dp-prompt-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;}'
    +'.dp-prompt-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.06);}'
    +'.dp-prompt-label{color:#c9cdd4;font-size:13px;font-weight:600;}'
    +'.dp-copy-btn{padding:8px 18px;border:1px solid rgba(34,211,238,.3);background:rgba(34,211,238,.1);color:#22d3ee;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:all .2s;}'
    +'.dp-copy-btn:hover{background:rgba(34,211,238,.2);border-color:rgba(34,211,238,.5);transform:translateY(-1px);}'
    +'.dp-copy-btn.copied{background:rgba(74,222,128,.15);border-color:rgba(74,222,128,.3);color:#4ade80;}'
    +'.dp-prompt-content{padding:20px;margin:0;color:#a8b0c0;font-size:13px;line-height:1.9;white-space:pre-wrap;word-break:break-word;font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-height:400px;overflow-y:auto;}'
    +'.dp-prompt-content::-webkit-scrollbar{width:6px;}'
    +'.dp-prompt-content::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px;}';
  iframeDoc.head.appendChild(style);

  // 插入到 placeholder 中
  placeholder.appendChild(section);

  // 绑定复制按钮事件
  var copyBtn=iframeDoc.getElementById('dpCopyBtn');
  var promptEl=iframeDoc.getElementById('dpPromptContent');
  if(copyBtn&&promptEl){
    copyBtn.addEventListener('click',function(){
      var text=promptText;
      // 尝试使用现代 API
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){
          copyBtn.textContent='✅ 已复制！';
          copyBtn.classList.add('copied');
          setTimeout(function(){copyBtn.textContent='📋 一键复制 Prompt';copyBtn.classList.remove('copied');},2000);
        }).catch(function(){fallbackCopy(text,copyBtn);});
      } else {
        fallbackCopy(text,copyBtn);
      }
    });
  }
}

function fallbackCopy(text,btn){
  var ta=document.createElement('textarea');
  ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');btn.textContent='✅ 已复制！';btn.classList.add('copied');setTimeout(function(){btn.textContent='📋 一键复制 Prompt';btn.classList.remove('copied');},2000);}
  catch(e){showToast('复制失败，请手动选择复制');}
  ta.remove();
}

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

// ═══ 面包屑导航（增强 APM 层级 + 阶段标签）═══
function updateBreadcrumb(pageId){
  var bar=document.getElementById('breadcrumbBar');
  var bc=document.getElementById('breadcrumb');
  if(!bar||!bc) return;

  if(pageId==='home'){
    bar.style.display='none';
    return;
  }

  var reg=pageRegistry[pageId];
  if(!reg){
    bar.style.display='none';
    return;
  }

  var crumbs=['<a class="bc-link" onclick="navigate(\'home\')">🏠 APM 知识库</a>'];
  if(reg.catName) crumbs.push('<span class="bc-sep">›</span><span class="bc-text">'+reg.catName+'</span>');
  if(reg.grpName) crumbs.push('<span class="bc-sep">›</span><span class="bc-text">'+reg.grpName+'</span>');

  // 找到叶节点 title
  var leafTitle=pageId;
  var leafEl=document.querySelector('.leaf[data-page="'+pageId+'"]');
  if(leafEl) leafTitle=leafEl.getAttribute('title')||leafEl.textContent.trim();

  crumbs.push('<span class="bc-sep">›</span><span class="bc-current">'+leafTitle+'</span>');

  // 阶段标签（从 indexData 获取）
  var meta = getItemMeta(pageId);
  if(meta && meta.applicable_stage){
    var sc = STAGE_COLORS[meta.applicable_stage] || STAGE_COLORS['全阶段'];
    crumbs.push('<span class="bc-stage" style="background:'+sc.bg+';color:'+sc.color+';margin-left:8px;padding:2px 10px;border-radius:8px;font-size:11px;font-weight:600">'+meta.applicable_stage+'</span>');
  }


  bc.innerHTML=crumbs.join('');
  bar.style.display='block';
}

// ═══ 标签过滤系统 ═══
function filterByTag(tagName){
  activeTagFilter=tagName;
  var filterBar=document.getElementById('tagFilterBar');
  var filterNameEl=document.getElementById('tagFilterName');
  if(filterBar&&filterNameEl){
    filterNameEl.textContent=tagName;
    filterBar.style.display='flex';
  }

  // 在首页过滤卡片
  var cards=document.querySelectorAll('.home-card');
  var visibleCount=0;
  cards.forEach(function(card){
    var tags=card.querySelectorAll('.tag');
    var hasTag=false;
    tags.forEach(function(t){
      if(t.textContent.trim()===tagName) hasTag=true;
    });
    if(hasTag){
      card.style.display='';
      visibleCount++;
    } else {
      card.style.display='none';
    }
  });

  showToast('🏷️ 过滤「'+tagName+'」— 找到 '+visibleCount+' 个结果');
}

function clearTagFilter(){
  activeTagFilter='';
  var filterBar=document.getElementById('tagFilterBar');
  if(filterBar) filterBar.style.display='none';
  // 恢复所有卡片
  var cards=document.querySelectorAll('.home-card');
  cards.forEach(function(card){ card.style.display=''; });
  showToast('已清除标签过滤');
}

// ═══ 全部展开 / 全部折叠 ═══
function expandAllSidebar(){
  var nodes=document.querySelectorAll('#sidebarNav .t1, #sidebarNav .t2, #sidebarNav .t3');
  nodes.forEach(function(n){ expandTree(n); });
  showToast('📂 已全部展开');
}

function collapseAllSidebar(){
  var nodes=document.querySelectorAll('#sidebarNav .t1.open, #sidebarNav .t2.open, #sidebarNav .t3.open');
  // 从最深层开始折叠
  var arr=Array.prototype.slice.call(nodes);
  arr.reverse().forEach(function(n){ collapseNodeInstant(n); });
  showToast('📁 已全部折叠');
}

// ═══ 互动模块占位 ═══
function updateInteractionPlaceholder(pageId){
  var placeholder=document.getElementById('interactionPlaceholder');
  if(!placeholder) return;
  // 仅在文档详情页（非首页、非工具嵌入）显示互动模块
  var reg=pageRegistry[pageId];
  if(pageId!=='home' && reg && (reg.type==='md'||reg.type==='iframe')){
    placeholder.style.display='block';
  } else {
    placeholder.style.display='none';
  }
}

// ═══ 状态角标系统（动态渲染 New/Updated 角标）═══
function renderCardBadges(){
  if(!indexData||!indexData.items) return;
  var now=new Date();
  var oneWeekAgo=new Date(now.getTime()-7*24*60*60*1000);

  indexData.items.forEach(function(item){
    if(!item.last_updated) return;
    var updated=new Date(item.last_updated);
    if(updated>=oneWeekAgo){
      // 找到对应的卡片并标记
      var cards=document.querySelectorAll('.home-card');
      cards.forEach(function(card){
        var onclickAttr=card.getAttribute('onclick')||'';
        if(onclickAttr.indexOf("'"+item.id+"'")!==-1){
          // 检查是否已有 badge
          if(!card.querySelector('.card-badge')){
            card.classList.add('card-new');
            var badge=document.createElement('span');
            badge.className='card-badge badge-updated';
            badge.textContent='Updated';
            card.style.position='relative';
            card.insertBefore(badge,card.firstChild);
          }
        }
      });
    }
  });
}

// ═══ v4.1 首页动态卡片渲染（从 index.json 数据驱动）═══
var CARD_GRID_MAP = {
  // 板块一：美术生产与排期
  'grid-production-pipeline':  { module:'production', ids:['game-art-pipeline','art-scheduling'] },
  'grid-production-outsource': { module:'production', ids:['cp-outsource','cp-management'] },
  'grid-production-char':      { module:'production', ids:['d1','d2','ugc-character-spec','color-swap-spec','auto-mask-spec','spine-split-spec'] },
  'grid-production-ui':        { module:'production', ids:['ui-slice-naming','ui-9slice-color','ui-layout','ui-umg-tips'] },
  'grid-production-scene':     { module:'production', ids:['scene-lod-spec'] },
  'grid-production-vfx':       { module:'production', ids:['vfx-perf-spec'] },
  'grid-production-anim':      { module:'production', ids:['anim-state-handoff'] },
  'grid-production-version':   { module:'production', ids:['svn-perforce-structure','asset-submit-review'] },
  'grid-production-cost':      { module:'production', ids:['outsource-workload-model'] },
  // 板块二：跨部门协同
  'grid-collab-planner':       { module:'collab', ids:['art-vs-planner-req','art-vs-planner-template'] },
  'grid-collab-ta':            { module:'collab', ids:['art-vs-ta-naming','art-vs-ta-perfbudget','spine-perf-guide','perf-redline-glossary'] },
  'grid-collab-qa':            { module:'collab', ids:['art-vs-qa-buggrade','art-vs-qa-checklist'] },
  'grid-collab-accident':      { module:'collab', ids:['cross-dept-collab','accident-troubleshoot'] },
  // 板块三：提效工具箱
  'grid-toolkit-mgmt':         { module:'toolkit', ids:['jira-tapd-automation','naming-check-tool','progress-visualization'] },
  'grid-toolkit-art':          { module:'toolkit', ids:['auto-mask','mask-tool','spine-split','mask-core-algorithms','channel-packer'] },
  'grid-toolkit-desktop':      { module:'toolkit', ids:['image-skew-corrector','game-resource-toolkit','engine-bridge'] },
  // 板块四：成本·风险·团队
  'grid-governance-budget':    { module:'governance', ids:['budget-apply','cost-standard'] },
  'grid-governance-risk':      { module:'governance', ids:['risk-log','postmortem-template'] },
  'grid-governance-team':      { module:'governance', ids:['onboarding-guide','permission-nav'] },
  // 板块五：项目复盘与经验沉淀
  'grid-retrospect-pitfall':   { module:'retrospect', ids:['project-pitfall-log'] },
  'grid-retrospect-growth':    { module:'retrospect', ids:['cross-dept-communication-tips','personal-growth-roadmap'] }
};

// 阶段→背景色配置
var STAGE_COLORS = {
  '预研期': { color:'#60a5fa', bg:'rgba(96,165,250,.12)' },
  '量产期': { color:'#fb923c', bg:'rgba(251,146,60,.12)' },
  '测试期': { color:'#4ade80', bg:'rgba(74,222,128,.12)' },
  '全阶段': { color:'#a78bfa', bg:'rgba(167,139,250,.12)' }
};

// 优先级→图标
var PRIORITY_ICONS = { 'high':'🔴', 'medium':'🟡', 'low':'🟢' };

function renderHomeCards(){
  if(!indexData||!indexData.items) return;
  var itemMap={};
  indexData.items.forEach(function(item){ itemMap[item.id]=item; });

  Object.keys(CARD_GRID_MAP).forEach(function(gridId){
    var config=CARD_GRID_MAP[gridId];
    var container=document.getElementById(gridId);
    if(!container) return;
    var html='';
    config.ids.forEach(function(id){
      var item=itemMap[id];
      if(!item) return;
      // 阶段标签（实心背景色）
      var stageBadge='';
      if(item.applicable_stage){
        var sc=STAGE_COLORS[item.applicable_stage]||STAGE_COLORS['全阶段'];
        stageBadge='<span class="stage-tag stage-tag-solid" style="background:'+sc.bg+';color:'+sc.color+';border:1px solid '+sc.color.replace(')',',0.3)')+'">'+item.applicable_stage+'</span>';
      }
      // 优先级
      var priIcon=PRIORITY_ICONS[item.priority]||'';
      var priHtml=priIcon?'<span class="pri-badge" title="优先级: '+item.priority+'">'+priIcon+'</span>':'';
      // 复制链接按钮
      var copyHtml='<button class="card-copy-btn" onclick="event.stopPropagation();copyCardLink(\''+item.id+'\')" title="复制链接">🔗</button>';
      // 图标背景色
      var iconBg='var(--accent-bg)';
      if(config.module==='collab') iconBg='var(--orange-bg)';
      if(config.module==='toolkit') iconBg='var(--green-bg)';
      if(config.module==='governance') iconBg='var(--pink-bg)';
      if(config.module==='retrospect') iconBg='var(--cyan-bg)';
      // 工种 badge
      var craftBadge='';
      if(item.craft){
        var cc=CRAFT_COLORS[item.craft]||{bg:'rgba(139,143,163,.1)',color:'var(--dim)'};
        craftBadge='<span class="craft-badge" style="background:'+cc.bg+';color:'+cc.color+'">'+item.craft+'</span>';
      }
      // 普通标签（描边暗色风格，与阶段标签视觉区分）
      var tagsHtml='';
      if(item.tags&&item.tags.length){
        var shown=item.tags.slice(0,3);
        tagsHtml=shown.map(function(t){return'<span class="tag tag-outline tag-clickable" onclick="event.stopPropagation();filterByTag(\''+t+'\')">'+t+'</span>';}).join('');
      }
      // Owner + 更新日期底栏（v4.2: 已移除 owner 和 last_updated 显示）
      var metaFooter='';

      html+='<div class="home-card" data-stage="'+(item.applicable_stage||'')+'" data-priority="'+(item.priority||'')+'" data-id="'+item.id+'" onclick="navigate(\''+item.id+'\')">'
        +priHtml+copyHtml
        +'<div class="hci" style="background:'+iconBg+'">'+(item.icon||'📄')+'</div>'
        +'<h3>'+item.title+'</h3>'
        +'<p>'+item.desc+'</p>'
        +'<div class="tags">'+stageBadge+tagsHtml+craftBadge+'</div>'
        +metaFooter
        +'</div>';
    });
    container.innerHTML=html;
  });
}

// ═══ v4.1 复制卡片链接 ═══
function copyCardLink(pageId){
  var url=location.origin+location.pathname+'#'+pageId;
  navigator.clipboard.writeText(url).then(function(){showToast('🔗 链接已复制');}).catch(function(){
    // fallback
    var ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('🔗 链接已复制');
  });
}

// ═══ v4.1 高频速查 / 最近更新 模块 ═══
var currentHotTab='hot';
function switchHotTab(tab){
  currentHotTab=tab;
  document.querySelectorAll('.hot-tab').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.hot-tab').forEach(function(t){
    if((tab==='hot'&&t.textContent.indexOf('高频')!==-1)||(tab==='recent'&&t.textContent.indexOf('最近')!==-1)){
      t.classList.add('active');
    }
  });
  renderHotCards();
}

function renderHotCards(){
  if(!indexData||!indexData.items) return;
  var container=document.getElementById('hotCards');
  if(!container) return;

  var items=[];
  if(currentHotTab==='hot'){
    // is_hot 标记的文档
    items=indexData.items.filter(function(i){return i.is_hot;});
    // 按优先级排序
    var priOrder={high:0,medium:1,low:2};
    items.sort(function(a,b){return(priOrder[a.priority]||2)-(priOrder[b.priority]||2);});
  } else {
    // 按 last_updated 排序取最近 6 条
    items=indexData.items.slice().sort(function(a,b){
      return(b.last_updated||'').localeCompare(a.last_updated||'');
    }).slice(0,6);
  }

  if(!items.length){
    container.innerHTML='<div class="hot-empty">暂无数据</div>';
    return;
  }

  var html='';
  items.forEach(function(item){
    var sc=STAGE_COLORS[item.applicable_stage]||STAGE_COLORS['全阶段'];
    var priIcon=PRIORITY_ICONS[item.priority]||'';
    // 模块颜色
    var modColor='var(--accent)';var modBg='var(--accent-bg)';
    if(item.module==='collab'){modColor='var(--orange)';modBg='var(--orange-bg)';}
    if(item.module==='toolkit'){modColor='var(--green)';modBg='var(--green-bg)';}
    if(item.module==='governance'){modColor='var(--pink)';modBg='var(--pink-bg)';}
    if(item.module==='retrospect'){modColor='var(--cyan)';modBg='var(--cyan-bg)';}

    html+='<div class="hot-card" onclick="navigate(\''+item.id+'\')">'
      +'<div class="hot-card-top">'
      +'<div class="hot-card-icon" style="background:'+modBg+';color:'+modColor+'">'+(item.icon||'📄')+'</div>'
      +(priIcon?'<span class="hot-pri">'+priIcon+'</span>':'')
      +'</div>'
      +'<div class="hot-card-title">'+item.title+'</div>'
      +'<div class="hot-card-meta">'
      +'<span class="hot-stage" style="background:'+sc.bg+';color:'+sc.color+'">'+(item.applicable_stage||'')+'</span>'
      +'</div>'
      +'</div>';
  });
  container.innerHTML=html;
}

// ═══ v4.0 阶段筛选 ═══
var activeStageFilter = 'all';
function filterByStage(stage){
  activeStageFilter = stage;
  // 更新按钮 active 状态
  document.querySelectorAll('.stage-btn').forEach(function(btn){ btn.classList.remove('active'); });
  if(stage==='all'){
    document.querySelector('.stage-btn-all').classList.add('active');
  } else {
    document.querySelectorAll('.stage-btn').forEach(function(btn){
      if(btn.textContent.trim().indexOf(stage)!==-1) btn.classList.add('active');
    });
  }
  // 过滤卡片
  var cards=document.querySelectorAll('.home-card');
  var visibleCount=0;
  cards.forEach(function(card){
    var cardStage=card.getAttribute('data-stage')||'';
    if(stage==='all' || cardStage===stage || cardStage==='全阶段'){
      card.style.display='';
      visibleCount++;
    } else {
      card.style.display='none';
    }
  });
  if(stage!=='all'){
    showToast('📅 筛选「'+stage+'」— 显示 '+visibleCount+' 个条目');
  }
}

// ═══ 责任人与时效展示增强 ═══
function getItemMeta(pageId){
  if(!indexData||!indexData.items) return null;
  return indexData.items.find(function(i){ return i.id===pageId; });
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

// ═══ v4.2 APM 管理仪表盘 ═══
var dashboardCollapsed=false;
function toggleDashboard(){
  dashboardCollapsed=!dashboardCollapsed;
  var body=document.getElementById('dashboardBody');
  var btn=document.getElementById('dashboardToggle');
  if(dashboardCollapsed){
    body.style.maxHeight=body.scrollHeight+'px';
    body.offsetHeight;
    body.style.maxHeight='0';
    btn.textContent='▼ 展开';
  } else {
    body.style.maxHeight=body.scrollHeight+'px';
    btn.textContent='▲ 收起';
    var onEnd=function(e){
      if(e.target!==body) return;
      body.style.maxHeight='none';
      body.removeEventListener('transitionend',onEnd);
    };
    body.addEventListener('transitionend',onEnd);
  }
}

function renderDashboard(){
  if(!indexData) return;
  renderMilestones();
  renderBudgetRing();
  renderRiskList();
}

function renderMilestones(){
  var container=document.getElementById('milestoneTimeline');
  if(!container||!indexData.milestones) return;
  var today=new Date();today.setHours(0,0,0,0);
  var html='';
  indexData.milestones.forEach(function(ms){
    var msDate=new Date(ms.date);msDate.setHours(0,0,0,0);
    var diff=Math.round((msDate-today)/(1000*60*60*24));
    var diffText='';
    if(diff<0) diffText='<span class="ms-diff ms-diff-past">已过 '+Math.abs(diff)+' 天</span>';
    else if(diff===0) diffText='<span class="ms-diff ms-diff-today">今天</span>';
    else diffText='<span class="ms-diff ms-diff-future">剩余 '+diff+' 天</span>';
    var statusCls='ms-'+ms.status;
    var labelCls=ms.status==='completed'?'ms-label-done':ms.status==='in_progress'?'ms-label-active':'ms-label-upcoming';
    html+='<div class="ms-item '+statusCls+'">'
      +'<div class="ms-dot-wrap"><div class="ms-dot"></div><div class="ms-line"></div></div>'
      +'<div class="ms-content">'
      +'<div class="ms-label '+labelCls+'">'+ms.label+'</div>'
      +'<div class="ms-date-row"><span class="ms-date-text">'+ms.date+'</span>'+diffText+'</div>'
      +'</div>'
      +'</div>';
  });
  container.innerHTML=html;
}

function renderBudgetRing(){
  var container=document.getElementById('budgetRingWrap');
  if(!container||!indexData.budget) return;
  var b=indexData.budget;
  var pct=Math.round((b.used/b.total)*100);
  var remain=b.total-b.used;
  // 颜色分段
  var ringColor='#4ade80';// 绿色
  if(pct>=80) ringColor='#f87171';// 红色
  else if(pct>=60) ringColor='#fb923c';// 橙色
  // SVG 环形参数
  var r=70,cx=80,cy=80,circumference=2*Math.PI*r;
  var offset=circumference-(pct/100)*circumference;
  var fmtNum=function(n){return b.currency+n.toLocaleString();};
  container.innerHTML=
    '<div class="budget-ring-container">'
    +'<svg class="budget-ring-svg" viewBox="0 0 160 160">'
    +'<circle class="budget-ring-bg" cx="'+cx+'" cy="'+cy+'" r="'+r+'" />'
    +'<circle class="budget-ring-fg" cx="'+cx+'" cy="'+cy+'" r="'+r+'" '
    +'stroke="'+ringColor+'" '
    +'stroke-dasharray="'+circumference+'" '
    +'stroke-dashoffset="'+offset+'" '
    +'style="--ring-color:'+ringColor+'" />'
    +'</svg>'
    +'<div class="budget-ring-center">'
    +'<div class="budget-pct" style="color:'+ringColor+'">'+pct+'%</div>'
    +'<div class="budget-detail">'+fmtNum(b.used)+' / '+fmtNum(b.total)+'</div>'
    +'</div>'
    +'</div>'
    +'<div class="budget-remain">剩余可用：<strong style="color:'+ringColor+'">'+fmtNum(remain)+'</strong></div>';
}

function renderRiskList(){
  var container=document.getElementById('riskList');
  if(!container||!indexData.risks) return;
  var severityConfig={
    high:{color:'#f87171',label:'高'},
    medium:{color:'#fb923c',label:'中'},
    low:{color:'#60a5fa',label:'低'}
  };
  var html='';
  indexData.risks.forEach(function(risk){
    var sc=severityConfig[risk.severity]||severityConfig.low;
    html+='<div class="risk-item" style="border-left:3px solid '+sc.color+'">'
      +'<div class="risk-dot" style="background:'+sc.color+'"></div>'
      +'<div class="risk-info">'
      +'<div class="risk-title">'+risk.title+'</div>'
      +'<div class="risk-owner-tag">'+risk.owner+'</div>'
      +'</div>'
      +'</div>';
  });
  container.innerHTML=html;
}

// ═══ v4.2 文档详情元信息条 ═══
function updateDetailMetaBar(pageId){
  var bar=document.getElementById('detailMetaBar');
  if(!bar) return;
  if(pageId==='home'){bar.style.display='none';return;}
  var meta=getItemMeta(pageId);
  if(!meta){bar.style.display='none';return;}
  var html='';
  // 阶段标签
  if(meta.applicable_stage){
    var sc=STAGE_COLORS[meta.applicable_stage]||STAGE_COLORS['全阶段'];
    html+='<span class="dm-item"><span class="dm-icon">🏷️</span> <span class="stage-tag stage-tag-solid" style="background:'+sc.bg+';color:'+sc.color+';border:1px solid '+sc.color.replace(')',',0.3)')+'">'+meta.applicable_stage+'</span></span>';
  }
  // 优先级
  if(meta.priority){
    var priLabels={high:'P0',medium:'P1',low:'P2'};
    var priColors={high:'#f87171',medium:'#fbbf24',low:'#4ade80'};
    var priLabel=priLabels[meta.priority]||'P2';
    var priColor=priColors[meta.priority]||'#4ade80';
    html+='<span class="dm-item"><span class="dm-icon">⭐</span> <span class="dm-pri" style="background:'+priColor+'">'+priLabel+'</span></span>';
  }
  // 快捷操作
  html+='<span class="dm-actions">';
  html+='<button class="dm-btn" onclick="copyCardLink(\''+pageId+'\')" title="复制链接">📋 复制链接</button>';
  html+='<button class="dm-btn" onclick="navigate(\'home\')" title="返回首页">🏠 返回首页</button>';
  html+='</span>';
  bar.innerHTML=html;
  bar.style.display='flex';
}

// ═══ v4.2 相关文档推荐 ═══
function updateRelatedDocs(pageId){
  var bar=document.getElementById('relatedDocsBar');
  var container=document.getElementById('relatedDocsCards');
  if(!bar||!container) return;
  if(pageId==='home'||!indexData||!indexData.items){bar.style.display='none';return;}
  var currentItem=indexData.items.find(function(i){return i.id===pageId;});
  if(!currentItem||!currentItem.tags||!currentItem.tags.length){bar.style.display='none';return;}
  // 查找共享至少一个 tag 的文档
  var currentTags=currentItem.tags;
  var related=[];
  indexData.items.forEach(function(item){
    if(item.id===pageId) return;
    var shared=0;
    if(item.tags){
      item.tags.forEach(function(t){
        if(currentTags.indexOf(t)!==-1) shared++;
      });
    }
    if(shared>0) related.push({item:item,shared:shared});
  });
  // 按共享标签数降序排序，取前4
  related.sort(function(a,b){return b.shared-a.shared;});
  related=related.slice(0,4);
  if(!related.length){bar.style.display='none';return;}
  var html='';
  related.forEach(function(r){
    var item=r.item;
    var sc=STAGE_COLORS[item.applicable_stage]||STAGE_COLORS['全阶段'];
    var stageBadge=item.applicable_stage?'<span class="rd-stage" style="background:'+sc.bg+';color:'+sc.color+'">'+item.applicable_stage+'</span>':'';
    html+='<div class="rd-card" onclick="navigate(\''+item.id+'\')">'
      +'<div class="rd-icon">'+(item.icon||'📄')+'</div>'
      +'<div class="rd-title">'+item.title+'</div>'
      +stageBadge
      +'</div>';
  });
  container.innerHTML=html;
  bar.style.display='block';
}

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
