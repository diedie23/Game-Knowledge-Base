// ═══════════════════════════════════════════════════
// APM 专属知识库 v7.0 — 美术项目管理增强版
// 核心架构：30% 美术生产 · 30% 跨部门协同 · 20% 提效工具 · 20% 成本·风险·团队
// v7.0新增：美术工艺MECE重构 · 通用基础层 · 动画归入3D · UGC/AIGC专项管线 · 统一命名范式
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
var fuseFulltext=null;   // 全文搜索 Fuse 实例（基于 search-index.json）
var searchIndexData=null; // 全文搜索索引原始数据
var pageRegistry={};     // pageId → {type, file, download, badge, craft, catId, module ...}
var activeTagFilter='';  // 当前标签过滤关键词

// 工具页数据（嵌入式工具的详细信息卡片）
var toolData={
  'auto-mask-v6':{icon:'🤖',iconBg:'var(--cyan-bg)',name:'自动 Mask 生成器',ver:'v6.0',status:'online',subtitle:'傻瓜式预设 · 智能分析 · 放大镜 · 边缘净化 · 撤销重做 · TGA',desc:'v6.0 重大升级：① 5种一键预设（标准三色/头发眼睛/UI精度/特效/场景物件）② 智能主色调分析（色相分bin）③ 放大镜精准吸色+浮空反馈 ④ 术语大白话Tooltip ⑤ Ctrl+Z撤销/重做 ⑥ 边缘净化（膨胀/腐蚀/羽化/净化画笔）⑦ TGA导出 ⑧ 100%兼容v5工程 ⑨ i18n预留',tags:['在线工具','预设模式','智能分析','放大镜','边缘净化','TGA','撤销重做'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-09',url:'knowledge-base/auto-mask-v6.html'},
  'auto-mask-v6-desktop':{icon:'🖥️',iconBg:'var(--cyan-bg)',name:'自动 Mask 生成器 (桌面版)',ver:'v6.0',status:'online',subtitle:'Windows 独立 exe · 绿色免安装 · 完全离线 · 原生保存 · 多图拖拽',desc:'v6.0 桌面独立版：基于 Electron 打包的 Windows exe，双击即跑。相比 Web 版新增：① 原生文件保存（静默写入指定目录）② 多图拖拽自动分配通道 ③ 保存目录持久记忆 ④ 100% 离线无网可用 ⑤ 自定义 Icon/品牌。所有核心算法与 Web 版完全一致。',tags:['桌面工具','exe下载','离线','原生保存','Electron'],env:'🖥️ Windows 桌面',platform:'Win 10 / 11',install:'免安装 exe',date:'2026-04-09',url:'knowledge-base/auto-mask-v6-desktop.html'},
  'mask-tool':{icon:'🖌️',iconBg:'var(--orange-bg)',name:'Mask 手动编辑器',ver:'v1.0',status:'online',subtitle:'画笔 / 油漆桶 / 橡皮擦 · 实时四通道预览',desc:'专为 Mask 精修设计的轻量编辑器。导入原图后直接在浏览器中用画笔逐通道绘制或修改，R/G/B/A 四通道独立显示并可实时预览换色效果。',tags:['在线工具','画笔绘制','RGBA预览','所见即所得'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/mask-tool.html'},
  'spine-split':{icon:'✂️',iconBg:'var(--purple-bg)',name:'Spine 角色拆分工具',ver:'v3.0',status:'online',subtitle:'自定义模板 · 三点锚点对齐 · 多选镜像 · Alpha收缩',desc:'上传角色原画，选择/自制模板后通过三点锚点对齐自适应不同头身比。支持多选镜像操作、Alpha边缘收缩、拓扑延展，导出 ZIP 包含 Spine JSON。',tags:['在线工具','自定义模板','三点对齐','镜像操作','Alpha收缩'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/spine-split.html'},
  'mask-core-algorithms':{icon:'🧪',iconBg:'var(--accent-bg)',name:'Mask 核心算法演示',ver:'v2.0',status:'online',subtitle:'智能魔棒 Flood Fill · 边缘保护画笔 Sobel · Web Worker 并行',desc:'工业级 Mask 绘制的两大核心算法实现：基于扫描线的非递归 Flood Fill 魔棒（HSV/RGB 容差+高斯羽化），以及 Sobel 边缘检测驱动的自动"不出界"画笔。全部在 Worker 中并行计算。',tags:['在线工具','魔棒','Flood Fill','Sobel','边缘检测','Web Worker','Float32'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/mask-core-algorithms.html'},
  'color-swap-tool':{icon:'🎨',iconBg:'var(--purple-bg)',name:'2D 角色换色资源生成器',ver:'v1.0',status:'online',subtitle:'遮罩分区 · 调色板替换 · 灰度叠色 · ZIP一键导出',desc:'支持三种主流换色方案：① 遮罩分区换色（Mask+HSV，通道互斥铁律，无限Mask扩展，CIE-LAB/HSL高精度色差，纯黑白QA检测）② 调色板替换（像素风吸色+256×1调色板生成）③ 灰度底图+叠色（去色+亮度偏移）。一键导出 ZIP 资源包（原图+Mask/调色板+palette_config.json）。',tags:['在线工具','换色','Mask','调色板','灰度','HSV','ZIP导出'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-10',url:'knowledge-base/color-swap-tool.html'},
  'editor-guide':{icon:'✏️',iconBg:'var(--green-bg)',name:'可视化编辑器使用指南',ver:'v1.0',status:'online',subtitle:'零代码更新知识库文档 · 所见即所得编辑 · 保存/另存为 · 防破坏保护',desc:'面向非技术同学的知识库文档可视化编辑指南。点击「编辑模式」即可直接修改文字和图片，支持保存覆盖/另存为新文档，排版结构自动保护不会被破坏。',tags:['使用指南','可视化编辑','零代码','模板'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-09',url:'knowledge-base/editor-guide.html',isDoc:true}
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
    // 【优化】移除手风琴互斥，允许同时展开多个目录
    // 直接展开当前节点
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
  'mod-project':   { color: 'accent',  highlight: 'var(--accent)',  bg: 'var(--accent-bg)' },
  'mod-outsource': { color: 'orange',  highlight: 'var(--orange)',  bg: 'var(--orange-bg)' },
  'mod-craft':     { color: 'purple',  highlight: 'var(--purple)',  bg: 'var(--purple-bg)' },
  'mod-collab':    { color: 'green',   highlight: 'var(--green)',   bg: 'var(--green-bg)' },
  'mod-toolchain': { color: 'cyan',    highlight: 'var(--cyan)',    bg: 'var(--cyan-bg)' },
  'mod-quality':   { color: 'pink',    highlight: 'var(--pink)',    bg: 'var(--pink-bg)' },
  'mod-casestudy': { color: 'red',     highlight: 'var(--red)',     bg: 'rgba(248,113,113,.08)' }
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
  var projectCount=0, outsourceCount=0, craftCount=0, collabCount=0, toolchainCount=0, qualityCount=0, casestudyCount=0;

  data.categories.forEach(function(cat){
    var itemCount = cat.items ? cat.items.length : 0;
    cat.groups.forEach(function(g){ itemCount += g.items ? g.items.length : 0; });

    // 按模块 ID 计数
    if(cat.id === 'mod-project')     projectCount = itemCount;
    if(cat.id === 'mod-outsource')   outsourceCount = itemCount;
    if(cat.id === 'mod-craft')       craftCount = itemCount;
    if(cat.id === 'mod-collab')      collabCount = itemCount;
    if(cat.id === 'mod-toolchain')   toolchainCount = itemCount;
    if(cat.id === 'mod-quality')     qualityCount = itemCount;
    if(cat.id === 'mod-casestudy')   casestudyCount = itemCount;

    var isOutsource = cat.id === 'mod-outsource';
    var isCollab = cat.id === 'mod-collab';
    var isQuality = cat.id === 'mod-quality';
    var isCasestudy = cat.id === 'mod-casestudy';
    var isSystem = cat.id === 'mod-system';

    // 获取纯文本名称（去掉 Emoji 前缀）
    var catName = cat.name.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/u, '');
    // 一级模块 Emoji 图标（从 JSON icon 字段读取）
    var catEmoji = cat.icon || '📁';

    var extraCls = isOutsource ? ' t1-outsource' : isCollab ? ' t1-collab' : isQuality ? ' t1-quality' : isCasestudy ? ' t1-casestudy' : isSystem ? ' t1-system' : '';
    html += '<div class="t1' + extraCls + '" id="' + cat.id + '">';
    html += '<div class="t1-h" onclick="handleToggle(event,this)">'
      + SVG_CHEVRON
      + '<span class="emoji-icon emoji-icon-l1">' + catEmoji + '</span>'
      + '<span class="cl">' + catName + '</span>'
      + '<span class="cc">' + itemCount + '</span>'
      + '</div>';
    html += '<div class="t1-c">';

    // 渲染模块直属文档（不嵌套二级分组）
    if(cat.items) cat.items.forEach(function(item){
      pageRegistry[item.id] = {
        type: item.type,
        file: item.file || '',
        download: item.download || '',
        badge: item.badge || '',
        craft: item.craft || '',
        catId: cat.id,
        catName: catName,
        grpName: ''
      };
      var itemEmoji = item.icon || '📄';
      html += '<button class="leaf leaf--pinned" data-page="' + item.id + '" title="' + item.title + '" onclick="event.stopPropagation();navigate(\'' + item.id + '\',this)">'
        + '<span class="emoji-icon emoji-icon-leaf">' + itemEmoji + '</span>'
        + '<span class="leaf-text">' + item.title + '</span>'
        + '</button>';
      html += '<div class="toc-box" id="toc-' + item.id + '"></div>';
    });

    if(!cat.groups || !cat.groups.length){
      if(!cat.items || !cat.items.length) html += '<div class="leaf leaf--empty">待补充...</div>';
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
  if(numEls[0]) numEls[0].textContent = projectCount + ' 篇';
  if(numEls[1]) numEls[1].textContent = outsourceCount + ' 篇';
  if(numEls[2]) numEls[2].textContent = craftCount + ' 篇';
  if(numEls[3]) numEls[3].textContent = collabCount + ' 篇';
  if(numEls[4]) numEls[4].textContent = toolchainCount + ' 个';
  if(numEls[5]) numEls[5].textContent = qualityCount + ' 篇';
  if(numEls[6]) numEls[6].textContent = casestudyCount + ' 篇';

  // ═══ 统计卡片 → 锚点快捷导航 ═══
  var statTargets = [
    { sel: '.stat-project',    anchor: '#section-project' },
    { sel: '.stat-outsource',  anchor: '#section-outsource' },
    { sel: '.stat-craft',      anchor: '#section-craft' },
    { sel: '.stat-collab',     anchor: '#section-collab' },
    { sel: '.stat-toolchain',  anchor: '#section-toolchain' },
    { sel: '.stat-quality',    anchor: '#section-quality' }
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

  // 【Bug 3 修复】动态填充"文档存放目录"下拉列表，确保与侧边栏 100% 同步
  populateCategorySelects(data);
}

// ═══ 【Bug 3 修复】动态填充分类下拉列表 ═══
// 从 sidebar.json 数据遍历所有顶级分类，生成 <option>，确保与侧边栏 100% 同步
function populateCategorySelects(data){
  if(!data||!data.categories) return;
  var optionsHtml='';
  data.categories.forEach(function(cat){
    var catEmoji=cat.icon||'📁';
    var catName=cat.name.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/u,'');
    optionsHtml+='<option value="'+cat.id+'">'+catEmoji+' '+catName+'</option>';
  });
  // 填充创作模式中的分类选择下拉框
  var editorCat=document.getElementById('editorCategory');
  if(editorCat) editorCat.innerHTML=optionsHtml;
  // 缓存选项 HTML 供发布弹窗动态使用
  window._categoryOptionsHtml=optionsHtml;
}

// 获取动态分类选项 HTML（供发布弹窗使用）
function getCategoryOptionsHtml(){
  return window._categoryOptionsHtml||'<option value="mod-project">📋 项目管理与排期</option>';
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

  // 分享按钮：仅在文档页显示
  var shareBtn = document.querySelector('.share-btn');
  if(shareBtn){
    shareBtn.classList.toggle('show', pageId !== 'home');
  }

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

        // 判断是否为可编辑的 HTML 模板（文件在 knowledge-base 目录下的 .html）
        var isEditableTemplate=reg.file && reg.file.indexOf('knowledge-base/')!==-1 && reg.file.endsWith('.html');

        // ═══ 编辑功能已统一至顶部 detailMetaBar，iframeToolbar 不再渲染编辑按钮 ═══
        // 仅保留 iframeToolbar 的 dataset 以供 htmlTmplSave/htmlTmplPublish 读取当前 pageId
        if(isEditableTemplate && !reg.download){
          var iftb=document.getElementById('iframeToolbar');
          iftb.dataset.tmplKey=pageId;
        }

        frame.onload=function(){
          hideLoading();
          buildIframeToc(pageId);
          setupIframeScrollSpy(pageId);
          setupIframeBackToTop();

          // 对可编辑 HTML 模板：隐藏 iframe 内部的 editor-kit 悬浮按钮（由顶部统一工具栏控制）
          if(isEditableTemplate){
            try{
              var iDoc2=frame.contentDocument||frame.contentWindow.document;
              var ekBtn=iDoc2.querySelector('.ek-enter-btn');
              if(ekBtn) ekBtn.style.display='none';
            }catch(e){}
          }

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
  // 责任人 & 更新日期（编辑/删除按钮已统一移至顶部 detailMetaBar，此处不再重复渲染）
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
  pg.innerHTML=metaHtml+'<div class="dc" id="ct-'+pageId+'"></div>'+interactionHtml;
  document.getElementById('contentScroll').appendChild(pg);
  return pg;
}

// ═══ Render Tool Page (Embedded Directly) ═══
// 支持 isDoc 字段：当条目为自带完整排版的文档页面时，隐藏工具详情头部卡片，只保留精简的 iframe 嵌入
function renderToolPage(id){
  var d=toolData[id],c=document.getElementById('page-tool');
  if(!d)return;

  // ★ 文档类页面（isDoc:true）——跳过工具头部卡片，直接全宽展示文档 iframe
  if(d.isDoc){
    c.innerHTML=
      '<div class="tool-embed-frame-wrap tool-embed-frame-wrap--doc">'
      +'<div class="tool-embed-toolbar tool-embed-toolbar--doc"><span class="tet-label">📄 文档已嵌入，直接阅读</span><button class="tet-btn" onclick="window.open(\''+d.url+'\',\'_blank\')">↗ 新窗口打开</button></div>'
      +'<iframe class="tool-embed-frame tool-embed-frame--doc" src="'+d.url+'" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads" loading="lazy"></iframe>'
      +'</div>';
    return;
  }

  // ★ 常规工具页面——完整渲染工具详情卡片 + iframe
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
            keywords: (item.keywords||[]).join(' '),
            applicable_stage: item.applicable_stage || '',
            priority: item.priority || '',
            action: 'navigate'
          });
        });
      }

      // 也加 sidebar 数据（补充搜索索引）
      if(sidebarData){
        sidebarData.categories.forEach(function(cat){
          // 模块直属文档
          if(cat.items) cat.items.forEach(function(item){
            if(!items.find(function(i){ return i.id === item.id; })){
              items.push({id:item.id, title:item.title, type:item.type, content:item.title, action:'navigate', craft: item.craft||'', applicable_stage:'', priority:''});
            }
          });
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

      fuse=new Fuse(items,{keys:[{name:'title',weight:3},{name:'keywords',weight:2.5},{name:'content',weight:1.5},{name:'craft',weight:0.5},{name:'applicable_stage',weight:1},{name:'priority',weight:0.5}],threshold:0.35,includeMatches:true,minMatchCharLength:1});

      // 加载全文搜索索引（search-index.json）
      fetch('search-index.json').then(function(res){if(!res.ok) return null;return res.json();}).then(function(sdata){
        if(sdata && sdata.entries){
          searchIndexData = sdata;
          fuseFulltext = new Fuse(sdata.entries, {
            keys:[
              {name:'title', weight:5},
              {name:'content', weight:2},
              {name:'excerpt', weight:1.5},
              {name:'tags', weight:1}
            ],
            threshold: 0.3,
            includeMatches: true,
            minMatchCharLength: 2,
            ignoreLocation: true,
            findAllMatches: true
          });
          console.log('✅ 全文搜索索引已加载，共 '+sdata.entries.length+' 篇文档');
        }
      }).catch(function(e){ console.warn('全文索引加载失败:', e); });

      // 加载完毕后渲染动态首页卡片和角标
      setTimeout(function(){
        renderHomeCards();
        renderHotCards();
        renderCardBadges();
        renderDashboard();
        // 【Bug 2 修复】indexData 已就绪，补刷当前页面的 detailMetaBar
        // 解决刷新页面时 indexData 尚未加载导致编辑按钮不显示的问题
        if(curPage && curPage!=='home'){
          updateDetailMetaBar(curPage);
        }
      }, 300);
    });
  }catch(e){}
}

function handleSearch(q){
  var dd=document.getElementById('searchDropdown');q=q.trim();
  if(!q){dd.classList.remove('show');dd.innerHTML='';return;}
  if(!fuse){dd.classList.remove('show');return;}

  // ═══ 标题/关键词搜索（原有 Fuse） ═══
  var titleResults=fuse.search(q).slice(0,6);

  // ═══ 全文内容搜索（新增 search-index.json） ═══
  var fulltextResults=[];
  if(fuseFulltext){
    var rawFt=fuseFulltext.search(q).slice(0,8);
    // 合并并去重（排除已在标题结果中出现的）
    var titleIds={};
    titleResults.forEach(function(r){titleIds[r.item.id]=true;});
    rawFt.forEach(function(r){
      if(!titleIds[r.item.id]) fulltextResults.push(r);
    });
    fulltextResults=fulltextResults.slice(0,4);
  }

  if(!titleResults.length && !fulltextResults.length){
    dd.innerHTML='<div style="padding:14px;text-align:center;color:var(--dim);font-size:13px">未找到相关内容</div>';
    dd.classList.add('show');return;
  }

  var html='';

  // ═══ 渲染标题匹配结果 ═══
  titleResults.forEach(function(r){
    var item=r.item;
    var modLabel='🏭', modCls='background:rgba(108,140,255,.08);color:#6c8cff';
    if(item.module==='collab')  { modLabel='🤝'; modCls='background:rgba(251,146,60,.08);color:#fb923c'; }
    if(item.module==='toolkit') { modLabel='🧰'; modCls='background:rgba(74,222,128,.08);color:#4ade80'; }
    if(item.module==='governance') { modLabel='💰'; modCls='background:rgba(244,114,182,.08);color:#f472b6'; }
    if(item.module==='retrospect') { modLabel='📒'; modCls='background:rgba(34,211,238,.08);color:#22d3ee'; }
    if(item.module==='casestudy') { modLabel='🔥'; modCls='background:rgba(248,113,113,.08);color:#f87171'; }
    var craftHtml = item.craft ? '<span class="sr-craft">['+item.craft+']</span>' : '';
    var stageHtml = '';
    if(item.applicable_stage){
      var sc = indexData && indexData.stageConfig && indexData.stageConfig[item.applicable_stage];
      var stageBg = sc ? sc.bg : 'rgba(167,139,250,.12)';
      var stageColor = sc ? sc.color : '#a78bfa';
      stageHtml = '<span class="sr-stage" style="background:'+stageBg+';color:'+stageColor+'">'+item.applicable_stage+'</span>';
    }

    html+='<div class="sr-item" onmousedown="navigate(\''+item.id+'\');document.getElementById(\'searchDropdown\').classList.remove(\'show\');document.getElementById(\'searchInput\').value=\'\'">'
      +'<span class="sr-type" style="'+modCls+'">'+modLabel+'</span>'
      +'<span class="sr-title">'+highlightText(item.title,q)+'</span>'
      +stageHtml
      +craftHtml
      +'</div>';
  });

  // ═══ 渲染全文匹配结果（带上下文片段）═══
  if(fulltextResults.length){
    html+='<div style="padding:6px 16px 4px;font-size:11px;color:var(--dim);border-top:1px solid var(--border);font-weight:600;letter-spacing:.5px">📄 正文匹配</div>';
    fulltextResults.forEach(function(r){
      var entry=r.item;
      var snippet=extractSnippet(entry.content, q, 120);
      var iconHtml=entry.icon? '<span style="font-size:14px;flex-shrink:0">'+entry.icon+'</span>' : '';

      html+='<div class="sr-item sr-item-fulltext" onmousedown="navigate(\''+entry.id+'\');document.getElementById(\'searchDropdown\').classList.remove(\'show\');document.getElementById(\'searchInput\').value=\'\'" style="flex-direction:column;align-items:flex-start;gap:4px;padding:10px 16px">'
        +'<div style="display:flex;align-items:center;gap:8px;width:100%">'
        +iconHtml
        +'<span class="sr-title" style="font-size:13px">'+highlightText(entry.title,q)+'</span>'
        +(entry.stage?'<span class="sr-stage" style="background:rgba(167,139,250,.12);color:#a78bfa;font-size:10px">'+entry.stage+'</span>':'')
        +'</div>'
        +'<div style="font-size:12px;color:var(--dim);line-height:1.6;padding-left:22px">'+snippet+'</div>'
        +'</div>';
    });
  }

  dd.innerHTML=html;dd.classList.add('show');
}

// ═══ 搜索辅助函数：高亮文本中的关键词 ═══
function highlightText(text, query){
  if(!query||!text) return text||'';
  try{
    var escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re=new RegExp('('+escaped+')','gi');
    return text.replace(re,'<mark style="background:rgba(108,140,255,.25);color:var(--accent-light);padding:0 2px;border-radius:3px">$1</mark>');
  }catch(e){return text;}
}

// ═══ 搜索辅助函数：提取包含关键词的上下文片段并高亮 ═══
function extractSnippet(content, query, maxLen){
  if(!content||!query) return '';
  maxLen=maxLen||120;
  var lower=content.toLowerCase();
  var qLower=query.toLowerCase();
  var idx=lower.indexOf(qLower);
  var snippet='';
  if(idx>=0){
    var start=Math.max(0,idx-40);
    var end=Math.min(content.length,idx+qLower.length+maxLen-40);
    snippet=(start>0?'…':'')+content.substring(start,end)+(end<content.length?'…':'');
  }else{
    // 模糊：尝试匹配单个词
    var words=query.split(/\s+/).filter(function(w){return w.length>=2;});
    for(var i=0;i<words.length;i++){
      var wIdx=lower.indexOf(words[i].toLowerCase());
      if(wIdx>=0){
        var s=Math.max(0,wIdx-40);
        var e=Math.min(content.length,wIdx+words[i].length+maxLen-40);
        snippet=(s>0?'…':'')+content.substring(s,e)+(e<content.length?'…':'');
        break;
      }
    }
    if(!snippet) snippet=content.substring(0,maxLen)+(content.length>maxLen?'…':'');
  }
  return highlightText(snippet,query);
}

// ═══ Utilities ═══
function copyShareLink(){navigator.clipboard.writeText(location.href).then(function(){showToast('链接已复制');}).catch(function(){showToast('复制失败','error');});}
function showToast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast';if(type==='warning') t.classList.add('toast-warning');else if(type==='error') t.classList.add('toast-error');else if(type==='info') t.classList.add('toast-info');else t.classList.add('toast-success');t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(function(){t.classList.remove('show');},type==='error'?4000:2000);}

// ═══ 编辑按钮过渡动画辅助 ═══
function showBtn(el){if(!el) return;el.style.display='';el.style.opacity='0';el.style.transform='scale(.85)';requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.opacity='1';el.style.transform='scale(1)';});});}
function hideBtn(el){if(!el) return;el.style.opacity='0';el.style.transform='scale(.85)';setTimeout(function(){el.style.display='none';el.style.opacity='';el.style.transform='';},150);}

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
  catch(e){showToast('复制失败，请手动选择复制','error');}
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
  if(!text){showToast('请输入内容','warning');return;}
  var fb=JSON.parse(localStorage.getItem('kb_feedback')||'[]');
  fb.push({text:text,time:new Date().toISOString(),page:curPage});
  localStorage.setItem('kb_feedback',JSON.stringify(fb));
  document.getElementById('feedbackDialog').classList.remove('show');
  showToast('✅ 感谢反馈！');
}

// ═══ L3: Changelog 弹窗 — 版本更新日志 ═══
function showChangelog(){
  var d=document.getElementById('changelogDialog');
  if(!d){
    d=document.createElement('div');d.id='changelogDialog';d.className='fb-overlay';
    d.innerHTML='<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:28px 32px;max-width:560px;width:92%;box-shadow:0 16px 48px rgba(0,0,0,.5);max-height:80vh;overflow-y:auto">'
      +'<h3 style="color:var(--heading);font-size:18px;margin-bottom:18px;display:flex;align-items:center;gap:8px">📋 更新日志 <span style="font-size:12px;background:var(--accent);color:#fff;padding:3px 10px;border-radius:12px;font-weight:500">v7.1</span></h3>'
      +'<div style="font-size:14px;color:var(--text);line-height:1.9">'
      +'<div style="margin-bottom:16px"><div style="font-size:13px;color:var(--accent);font-weight:600;margin-bottom:6px">🔥 v7.1 (2026-04-13)</div>'
      +'<ul style="padding-left:20px;color:var(--dim);font-size:13px;margin:0">'
      +'<li>搜索 blur 延迟优化 (200→250ms)</li>'
      +'<li>「系统与维护」模块侧边栏灰色降级</li>'
      +'<li>「我的项目笔记」空状态引导</li>'
      +'<li>侧边栏叶节点 active 指示条 + hover 上浮</li>'
      +'<li>搜索无结果空状态友好提示</li>'
      +'<li>box-shadow 统一 CSS 变量管理</li>'
      +'<li>Changelog 弹窗入口</li>'
      +'<li>文档 h2 视觉分隔线</li>'
      +'<li>搜索框清除按钮</li>'
      +'<li>Toast info 蓝色类型</li>'
      +'<li>返回顶部 tooltip</li>'
      +'</ul></div>'
      +'<div style="margin-bottom:16px"><div style="font-size:13px;color:var(--orange);font-weight:600;margin-bottom:6px">🚀 v7.0 (2026-04-09)</div>'
      +'<ul style="padding-left:20px;color:var(--dim);font-size:13px;margin:0">'
      +'<li>AI 智能问答助手 (Coze Web SDK)</li>'
      +'<li>可视化 CMS 管理面板</li>'
      +'<li>HTML 模板内嵌编辑器</li>'
      +'<li>全文内容搜索</li>'
      +'</ul></div>'
      +'<div><div style="font-size:13px;color:var(--green);font-weight:600;margin-bottom:6px">📦 v6.4 (2026-04-07)</div>'
      +'<ul style="padding-left:20px;color:var(--dim);font-size:13px;margin:0">'
      +'<li>角色探索 + 知识库总览 Tab 合并</li>'
      +'<li>管理仪表盘默认折叠</li>'
      +'<li>Mermaid 跨部门协作流程图</li>'
      +'</ul></div>'
      +'</div>'
      +'<div style="display:flex;justify-content:flex-end;margin-top:18px">'
      +'<button onclick="document.getElementById(\'changelogDialog\').classList.remove(\'show\')" style="padding:8px 20px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:inherit;font-size:13px;transition:all .15s">关闭</button>'
      +'</div></div>';
    document.body.appendChild(d);
    d.addEventListener('click',function(e){if(e.target===d)d.classList.remove('show');});
  }
  d.classList.add('show');
}

// ═══ L5: 搜索清除按钮辅助函数 ═══
function toggleSearchClear(){
  var inp=document.getElementById('searchInput');
  var btn=document.getElementById('searchClearBtn');
  if(btn) btn.style.display=inp&&inp.value.trim()?'block':'none';
}
function clearSearchInput(){
  var inp=document.getElementById('searchInput');
  if(inp){inp.value='';inp.focus();}
  var dd=document.getElementById('searchDropdown');
  if(dd){dd.classList.remove('show');dd.innerHTML='';}
  var btn=document.getElementById('searchClearBtn');
  if(btn) btn.style.display='none';
}

// ═══ L8: Hero 副标题折叠/展开 ═══
function toggleHeroTagline(){
  var el=document.getElementById('heroTagline');
  var btn=document.getElementById('heroToggle');
  if(!el||!btn)return;
  var collapsed=el.classList.toggle('collapsed');
  btn.textContent=collapsed?'▼ 展开简介':'▲ 收起简介';
  try{localStorage.setItem('hero_collapsed',collapsed?'1':'0');}catch(e){}
}
(function(){
  try{
    if(localStorage.getItem('hero_collapsed')==='1'){
      var el=document.getElementById('heroTagline');
      var btn=document.getElementById('heroToggle');
      if(el){el.classList.add('collapsed');}
      if(btn){btn.textContent='▼ 展开简介';}
    }
  }catch(e){}
})();

// ═══ ScrollSpy (h2 + h3 + h4) + 返回顶部按钮 ═══
var iframeScrollHandler=null;

function setupScrollSpy(){
  var scrollEl=document.getElementById('contentScroll');
  var btt=document.getElementById('backToTop');
  if(!scrollEl||!btt) return;

  // ★★★ 核心滚动监听 — 绑定到实际滚动容器 #contentScroll ★★★
  scrollEl.addEventListener('scroll',function(){
    // 1. 返回顶部按钮的显示/隐藏
    var st=scrollEl.scrollTop;
    if(st>300){
      btt.classList.add('show');
    } else {
      btt.classList.remove('show');
    }
    // 2. TOC 高亮（仅在文档详情页）
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

  // ★★★ 返回顶部按钮点击事件 — 智能区分 iframe / contentScroll ★★★
  btt.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    if(btt._iframeMode && btt._iframeScrollTo){
      // iframe 模式：滚动 iframe 内容
      try{ btt._iframeScrollTo(); }catch(err){}
    } else {
      // 普通模式：滚动 #contentScroll；fallback 也尝试 window
      try{ scrollEl.scrollTo({top:0,behavior:'smooth'}); }catch(err){}
      // 如果 contentScroll 没有滚动条（意外情况），也尝试 window
      if(scrollEl.scrollTop <= 0){
        try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(err){}
      }
    }
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
      if(st>300){
        btt.classList.add('show');
      } else {
        btt.classList.remove('show');
      }
    };
    win.addEventListener('scroll',iframeBttHandler);
    // ★★★ iframe 模式下：标记按钮为 iframe 模式，并用专属 onclick 覆盖 ★★★
    btt._iframeMode = true;
    btt._iframeScrollTo = function(){win.scrollTo({top:0,behavior:'smooth'});};
  }catch(e){}
}
function clearIframeBtt(){
  if(iframeBttHandler){
    try{var frame=document.getElementById('contentFrame');(frame.contentWindow||frame.contentDocument.defaultView).removeEventListener('scroll',iframeBttHandler);}catch(e){}
    iframeBttHandler=null;
  }
  // ★★★ 不再覆盖 btt.onclick — 因为 setupScrollSpy 已通过 addEventListener 绑定 ★★★
  // 只需要移除 iframe 的特殊 onclick 并让 contentScroll 的 scroll 事件接管即可
  var btt=document.getElementById('backToTop');
  btt._iframeMode = false;
}

// ═══ 创作模式 — Vditor 编辑器 ═══
var vditorInstance=null;

var templates={
  'art-req':'# 美术需求单\n\n> 📅 日期：YYYY-MM-DD · 🏷️ 需求单\n\n---\n\n## 一、需求概述\n\n| 项目 | 内容 |\n|------|------|\n| **需求名称** |  |\n| **优先级** | 🔴 高 / 🟡 中 / 🟢 低 |\n| **期望交付日期** |  |\n| **负责人** |  |\n\n## 二、详细描述\n\n### 2.1 参考图\n\n（粘贴参考图片）\n\n### 2.2 具体要求\n\n- [ ] 要求1\n- [ ] 要求2\n\n## 三、验收标准\n\n| 检查项 | 合格标准 | 优先级 |\n|--------|---------|--------|\n|  |  | 🔴 高 |\n|  |  | 🟡 中 |\n\n## 四、备注\n\n',
  'bug-review':'# Bug 复盘报告\n\n> 📅 日期：YYYY-MM-DD · 🏷️ Bug复盘\n\n---\n\n## 一、Bug 概述\n\n| 项目 | 内容 |\n|------|------|\n| **Bug 标题** |  |\n| **严重等级** | 🔴 高 / 🟡 中 / 🟢 低 |\n| **影响范围** |  |\n| **发现日期** |  |\n| **修复日期** |  |\n\n## 二、问题现象\n\n（描述复现步骤）\n\n## 三、根本原因\n\n\n\n## 四、修复方案\n\n\n\n## 五、预防措施\n\n- [ ] 措施1\n- [ ] 措施2\n\n## 六、经验总结\n\n',
  'flow-spec':'# 流程规范文档\n\n> 📅 更新时间：YYYY-MM-DD · 🏷️ 流程规范\n\n---\n\n## 一、目的与范围\n\n\n\n## 二、角色与职责\n\n| 角色 | 职责 | 优先级 |\n|------|------|--------|\n|  |  | 🔴 高 |\n\n## 三、流程步骤\n\n### 3.1 第一阶段\n\n\n\n### 3.2 第二阶段\n\n\n\n## 四、交付物清单\n\n- [ ] 交付物1\n- [ ] 交付物2\n\n## 五、注意事项\n\n',
  'tool-doc':'# 工具说明文档\n\n> 📅 更新时间：YYYY-MM-DD · 🏷️ 工具\n\n---\n\n## 一、工具概述\n\n| 项目 | 内容 |\n|------|------|\n| **工具名称** |  |\n| **版本** | v1.0 |\n| **环境要求** |  |\n\n## 二、安装 / 使用方式\n\n\n\n## 三、功能说明\n\n### 3.1 功能一\n\n\n\n### 3.2 功能二\n\n\n\n## 四、常见问题\n\n| 问题 | 解决方案 |\n|------|----------|\n|  |  |\n\n## 五、更新日志\n\n| 版本 | 日期 | 内容 |\n|------|------|------|\n| v1.0 |  | 初版 |\n'
};

// HTML 文档模板数据
var htmlTemplates={
  'html-standard':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>标准规范文档</title>\n<style>\n  *{margin:0;padding:0;box-sizing:border-box}\n  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:40px;line-height:1.8}\n  .container{max-width:960px;margin:0 auto;background:#16213e;border-radius:12px;padding:48px;box-shadow:0 4px 24px rgba(0,0,0,.3)}\n  h1{font-size:28px;color:#64ffda;border-bottom:2px solid #64ffda33;padding-bottom:12px;margin-bottom:24px}\n  h2{font-size:20px;color:#82b1ff;margin:32px 0 16px;padding-left:12px;border-left:3px solid #82b1ff}\n  h3{font-size:16px;color:#c3cfe2;margin:20px 0 10px}\n  p{margin:10px 0;color:#b0bec5}\n  table{width:100%;border-collapse:collapse;margin:16px 0}\n  th,td{border:1px solid #2a3a5c;padding:10px 14px;text-align:left}\n  th{background:#1a2744;color:#82b1ff;font-weight:600}\n  td{color:#b0bec5}\n  .meta-bar{display:flex;gap:16px;margin-bottom:24px;font-size:13px;color:#78909c}\n  .tag{display:inline-block;background:#64ffda22;color:#64ffda;padding:2px 10px;border-radius:4px;font-size:12px;margin-right:6px}\n  .note{background:#263238;border-left:3px solid #ffc107;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:14px;color:#ffecb3}\n</style>\n</head>\n<body>\n<div class="container">\n  <h1>📋 文档标题</h1>\n  <div class="meta-bar">\n    <span>📅 更新时间：YYYY-MM-DD</span>\n    <span>👤 作者：XXX</span>\n    <span class="tag">规范</span>\n  </div>\n  <h2>一、概述</h2>\n  <p>在此输入文档概述内容...</p>\n  <h2>二、详细说明</h2>\n  <h3>2.1 章节一</h3>\n  <p>章节内容...</p>\n  <table>\n    <tr><th>项目</th><th>内容</th><th>备注</th></tr>\n    <tr><td>-</td><td>-</td><td>-</td></tr>\n  </table>\n  <h3>2.2 章节二</h3>\n  <p>章节内容...</p>\n  <div class="note">💡 提示：这是一个提示框，用于标注重要信息。</div>\n  <h2>三、总结</h2>\n  <p>总结内容...</p>\n</div>\n</body>\n</html>',
  'html-richtext':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>图文混排文档</title>\n<style>\n  *{margin:0;padding:0;box-sizing:border-box}\n  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f0f23;color:#e0e0e0;padding:40px;line-height:1.8}\n  .container{max-width:1000px;margin:0 auto}\n  .hero{background:linear-gradient(135deg,#1a1a3e,#2d1b69);border-radius:16px;padding:48px;margin-bottom:32px;text-align:center}\n  .hero h1{font-size:32px;color:#fff;margin-bottom:12px}\n  .hero p{color:#b39ddb;font-size:16px}\n  .content-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}\n  .card{background:#1a1a2e;border-radius:12px;padding:24px;border:1px solid #2a2a4a}\n  .card h3{color:#82b1ff;margin-bottom:12px;font-size:18px}\n  .card p{color:#b0bec5;font-size:14px}\n  .card .img-placeholder{width:100%;height:180px;background:#2a2a4a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#546e7a;margin-bottom:12px;font-size:14px}\n  .full-width{grid-column:1/-1}\n  .section{background:#1a1a2e;border-radius:12px;padding:32px;margin-bottom:24px;border:1px solid #2a2a4a}\n  .section h2{color:#64ffda;font-size:22px;margin-bottom:16px}\n  .section p{color:#b0bec5}\n  .steps{display:flex;gap:16px;margin:20px 0}\n  .step{flex:1;background:#16213e;border-radius:8px;padding:16px;text-align:center}\n  .step-num{display:inline-block;width:32px;height:32px;line-height:32px;background:#64ffda;color:#0f0f23;border-radius:50%;font-weight:700;margin-bottom:8px}\n  .step p{font-size:13px;color:#90a4ae}\n</style>\n</head>\n<body>\n<div class="container">\n  <div class="hero">\n    <h1>🎨 图文混排文档标题</h1>\n    <p>在此输入副标题或简介描述</p>\n  </div>\n  <div class="content-grid">\n    <div class="card">\n      <div class="img-placeholder">🖼️ 拖拽或粘贴图片至此</div>\n      <h3>模块一标题</h3>\n      <p>图文说明内容，支持在编辑模式下直接修改文字和替换图片。</p>\n    </div>\n    <div class="card">\n      <div class="img-placeholder">🖼️ 拖拽或粘贴图片至此</div>\n      <h3>模块二标题</h3>\n      <p>图文说明内容，支持在编辑模式下直接修改文字和替换图片。</p>\n    </div>\n    <div class="card full-width">\n      <h3>📊 数据展示区</h3>\n      <div class="steps">\n        <div class="step"><div class="step-num">1</div><p>第一步说明</p></div>\n        <div class="step"><div class="step-num">2</div><p>第二步说明</p></div>\n        <div class="step"><div class="step-num">3</div><p>第三步说明</p></div>\n        <div class="step"><div class="step-num">4</div><p>第四步说明</p></div>\n      </div>\n    </div>\n  </div>\n  <div class="section">\n    <h2>详细说明</h2>\n    <p>在此编写详细的图文内容...</p>\n  </div>\n</div>\n</body>\n</html>',
  'html-kanban':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>项目看板文档</title>\n<style>\n  *{margin:0;padding:0;box-sizing:border-box}\n  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#e0e0e0;padding:40px;line-height:1.7}\n  .container{max-width:1100px;margin:0 auto}\n  h1{font-size:26px;color:#58a6ff;margin-bottom:8px}\n  .subtitle{color:#8b949e;margin-bottom:32px;font-size:14px}\n  .board{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:32px}\n  .column{background:#161b22;border-radius:12px;padding:16px;border:1px solid #30363d}\n  .column-title{font-size:14px;font-weight:700;padding:8px 12px;border-radius:6px;margin-bottom:12px;text-align:center}\n  .col-todo .column-title{background:#f8514922;color:#f85149}\n  .col-doing .column-title{background:#d29a0022;color:#d29a00}\n  .col-done .column-title{background:#3fb95022;color:#3fb950}\n  .task-card{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:10px;font-size:13px}\n  .task-card .task-title{font-weight:600;color:#c9d1d9;margin-bottom:6px}\n  .task-card .task-meta{display:flex;justify-content:space-between;font-size:11px;color:#8b949e}\n  .task-card .task-tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;margin-right:4px}\n  .tag-high{background:#f8514933;color:#f85149}\n  .tag-mid{background:#d29a0033;color:#d29a00}\n  .tag-low{background:#3fb95033;color:#3fb950}\n  .summary{background:#161b22;border-radius:12px;padding:24px;border:1px solid #30363d}\n  .summary h2{color:#58a6ff;font-size:18px;margin-bottom:16px}\n  .summary table{width:100%;border-collapse:collapse}\n  .summary th,.summary td{border:1px solid #30363d;padding:8px 12px;text-align:left;font-size:13px}\n  .summary th{background:#0d1117;color:#58a6ff}\n</style>\n</head>\n<body>\n<div class="container">\n  <h1>📋 项目看板</h1>\n  <p class="subtitle">更新时间：YYYY-MM-DD · 负责人：XXX</p>\n  <div class="board">\n    <div class="column col-todo">\n      <div class="column-title">📌 待办 (To Do)</div>\n      <div class="task-card"><div class="task-title">任务名称</div><div class="task-meta"><span><span class="task-tag tag-high">P0</span></span><span>负责人</span></div></div>\n      <div class="task-card"><div class="task-title">任务名称</div><div class="task-meta"><span><span class="task-tag tag-mid">P1</span></span><span>负责人</span></div></div>\n    </div>\n    <div class="column col-doing">\n      <div class="column-title">🔄 进行中 (Doing)</div>\n      <div class="task-card"><div class="task-title">任务名称</div><div class="task-meta"><span><span class="task-tag tag-high">P0</span></span><span>负责人</span></div></div>\n    </div>\n    <div class="column col-done">\n      <div class="column-title">✅ 已完成 (Done)</div>\n      <div class="task-card"><div class="task-title">任务名称</div><div class="task-meta"><span><span class="task-tag tag-low">P2</span></span><span>负责人</span></div></div>\n    </div>\n  </div>\n  <div class="summary">\n    <h2>📊 进度总览</h2>\n    <table>\n      <tr><th>里程碑</th><th>状态</th><th>截止日期</th><th>备注</th></tr>\n      <tr><td>阶段一</td><td>-</td><td>-</td><td>-</td></tr>\n      <tr><td>阶段二</td><td>-</td><td>-</td><td>-</td></tr>\n    </table>\n  </div>\n</div>\n</body>\n</html>'
,
  'html-postmortem':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>项目复盘报告</title>\n<style>\n:root{--bg:#0d0f15;--panel:#141620;--card:#1a1d2b;--border:#262a3a;--text:#c5c9d6;--dim:#6b7085;--heading:#e4e6ed;--accent:#6c8cff;--accent2:#a78bfa;--red:#f87171;--green:#4ade80;--blue:#60a5fa;--yellow:#fbbf24;--orange:#fb923c;--cyan:#22d3ee;--pink:#f472b6}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:16px}\n::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#3d4155;border-radius:3px}\n.doc{max-width:1400px;margin:0 auto;padding:32px 24px}\n.doc-header{text-align:center;padding:40px 0 28px;border-bottom:1px solid var(--border);margin-bottom:32px}\n.doc-header h1{font-size:30px;color:var(--heading);margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}\n.doc-header h1 .ver{font-size:12px;background:var(--orange);color:#000;padding:2px 12px;border-radius:12px;font-weight:700}\n.doc-header .subtitle{color:var(--dim);font-size:15px;margin-bottom:12px}\n.doc-header .meta{display:flex;justify-content:center;gap:20px;margin-top:12px;font-size:12px;color:var(--dim);flex-wrap:wrap}\n.badge{display:inline-block;background:linear-gradient(135deg,var(--orange),var(--red));color:#fff;padding:4px 16px;border-radius:16px;font-size:11px;font-weight:600;margin-top:12px}\n.toc{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:32px}\n.toc h3{font-size:15px;color:var(--heading);margin-bottom:10px;font-weight:600}\n.toc ol{padding-left:20px;font-size:15px;color:var(--accent)}.toc li{margin-bottom:6px}\n.toc a{color:var(--accent);text-decoration:none}.toc a:hover{text-decoration:underline}\n.section{margin-bottom:40px}\n.section h2{font-size:22px;color:var(--heading);margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--orange);display:flex;align-items:center;gap:8px}\n.section h3{font-size:15px;color:var(--heading);margin:20px 0 8px;font-weight:600}\n.section p,.section li{font-size:15px;margin-bottom:8px;line-height:1.8}\n.section ul,.section ol{padding-left:20px;margin-bottom:12px}\ntable{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:14px}\nth{background:var(--panel);color:var(--heading);text-align:left;padding:10px 12px;border:1px solid var(--border);font-weight:600}\ntd{padding:9px 12px;border:1px solid var(--border);vertical-align:top}\ntr:nth-child(even){background:rgba(108,140,255,.02)}\n.alert{padding:14px 18px;border-radius:10px;margin:14px 0;font-size:14px;line-height:1.8}\n.alert-red{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}\n.alert-green{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)}\n.alert-yellow{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--yellow)}\n.alert-blue{background:rgba(108,140,255,.08);border:1px solid rgba(108,140,255,.2);color:var(--accent)}\n.alert-orange{background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.2);color:var(--orange)}\ncode{font-family:\'Cascadia Code\',\'Fira Code\',monospace;background:var(--card);padding:1px 6px;border-radius:4px;font-size:13px;color:var(--cyan)}\n.rv{color:var(--red);font-weight:700}.gv{color:var(--green);font-weight:600}.yv{color:var(--yellow);font-weight:600}.ov{color:var(--orange);font-weight:600}\n.dd-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}\n@media(max-width:700px){.dd-grid{grid-template-columns:1fr}}\n.dd-card{border-radius:10px;padding:16px;font-size:14px;line-height:1.8}\n.dd-do{background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2)}\n.dd-dont{background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.2)}\n.dd-card h4{margin:0 0 8px;font-size:15px}\n.why-chain{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin:16px 0}\n.why-chain .why-step{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}\n.why-chain .why-num{flex-shrink:0;width:28px;height:28px;line-height:28px;text-align:center;background:var(--orange);color:#000;border-radius:50%;font-size:13px;font-weight:700}\n.why-chain .why-text{flex:1;font-size:14px;padding-top:3px}\n.why-chain .why-arrow{text-align:center;color:var(--dim);font-size:18px;margin:0 0 8px 40px}\n.why-chain .why-root{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.25);border-radius:8px;padding:12px 16px;margin-top:8px;font-size:14px;color:var(--red);font-weight:600}\n.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:16px 0}\n@media(max-width:800px){.stat-grid{grid-template-columns:1fr 1fr}}\n.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}\n.stat-card .stat-num{font-size:28px;font-weight:700;color:var(--heading);margin-bottom:4px}\n.stat-card .stat-label{font-size:12px;color:var(--dim)}\n.flow{display:flex;align-items:center;gap:0;margin:16px 0;flex-wrap:wrap}\n.flow-node{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;text-align:center;min-width:100px}\n.flow-node strong{display:block;color:var(--heading);font-size:14px;margin-bottom:2px}\n.flow-arrow{color:var(--accent2);font-size:18px;padding:0 6px;flex-shrink:0}\n.doc-footer{text-align:center;padding:24px 0;border-top:1px solid var(--border);margin-top:40px;font-size:12px;color:var(--dim)}\n</style>\n</head>\n<body>\n<div class="doc">\n\n<div class="doc-header">\n  <h1>🔄 项目复盘报告 <span class="ver">模板</span></h1>\n  <div class="subtitle">Project Post-mortem Report — 版本研发全周期结构化复盘</div>\n  <div class="meta">\n    <span>🎮 项目名称（填写）</span>\n    <span>👤 复盘主持人（填写）</span>\n    <span>📅 YYYY-MM-DD</span>\n  </div>\n  <div class="badge">🔄 复盘模板 · 可直接编辑使用</div>\n</div>\n\n<div class="alert alert-blue" style="margin-bottom:24px">\n  <strong>📖 使用说明：</strong>点击右上角「✏️ 编辑模式」进入编辑，<strong>直接点击文字即可修改</strong>。完成后点击「💾 保存并覆盖」或「📄 另存为新文档」下载。\n</div>\n\n<div class="toc">\n  <h3>📑 目录</h3>\n  <ol>\n    <li><a href="#s1">复盘基本信息</a></li>\n    <li><a href="#s2">版本目标回顾</a></li>\n    <li><a href="#s3">数据看板</a></li>\n    <li><a href="#s4">做得好的（What Went Well）</a></li>\n    <li><a href="#s5">需要改进的（What Went Wrong）+ 5-Why 分析</a></li>\n    <li><a href="#s6">Action Items 追踪</a></li>\n    <li><a href="#s7">经验沉淀 & 方法论提炼</a></li>\n  </ol>\n</div>\n\n<!-- ═══════ 第一章：基本信息 ═══════ -->\n<div class="section" id="s1">\n  <h2>📋 一、复盘基本信息</h2>\n  <table>\n    <tr><th style="width:180px">字段</th><th>内容</th></tr>\n    <tr><td>🎮 <strong>版本/项目名称</strong></td><td>（填写）</td></tr>\n    <tr><td>📅 <strong>版本周期</strong></td><td>YYYY-MM-DD ~ YYYY-MM-DD</td></tr>\n    <tr><td>📅 <strong>复盘日期</strong></td><td>YYYY-MM-DD</td></tr>\n    <tr><td>🎤 <strong>主持人</strong></td><td>（填写）</td></tr>\n    <tr><td>👥 <strong>参与人</strong></td><td>（列出全部参与者）</td></tr>\n    <tr><td>✍️ <strong>记录人</strong></td><td>（填写）</td></tr>\n    <tr><td>🏷️ <strong>复盘类型</strong></td><td>☐ 版本复盘 ☐ 里程碑复盘 ☐ 专项复盘 ☐ 外包复盘</td></tr>\n  </table>\n  <div class="alert alert-yellow">\n    <strong>⚠️ 复盘原则：</strong>「对事不对人」— 复盘目的是发现系统性问题并改进流程，不是追责个人。营造安全发言环境。\n  </div>\n</div>\n\n<!-- ═══════ 第二章：目标回顾 ═══════ -->\n<div class="section" id="s2">\n  <h2>🎯 二、版本目标回顾</h2>\n\n  <h3>2.1 目标达成率</h3>\n  <table>\n    <tr><th>🎯 目标</th><th>📅 计划</th><th>✅ 实际</th><th>📈 达成率</th><th>📝 说明</th></tr>\n    <tr><td>角色完成数</td><td>10</td><td>8</td><td><span class="yv">80%</span></td><td>2 个延至下版</td></tr>\n    <tr><td>场景完成数</td><td>5</td><td>5</td><td><span class="gv">100%</span></td><td>✅ 按时完成</td></tr>\n    <tr><td>UI 界面数</td><td>20</td><td>18</td><td><span class="yv">90%</span></td><td>2 个低优延后</td></tr>\n    <tr><td>特效完成</td><td>30 组</td><td>25 组</td><td><span class="yv">83%</span></td><td>（填写原因）</td></tr>\n    <tr><td>美术 Bug 清零</td><td>S:0 A:0</td><td>S:0 A:1</td><td><span class="yv">95%</span></td><td>1 个 A 级在修</td></tr>\n  </table>\n\n  <h3>2.2 排期准确率</h3>\n  <table>\n    <tr><th>🎨 工种</th><th>📅 计划人天</th><th>✅ 实际人天</th><th>📊 偏差</th><th>🎯 准确率</th></tr>\n    <tr><td>角色</td><td>120d</td><td>135d</td><td><span class="rv">+15d</span></td><td>87.5%</td></tr>\n    <tr><td>场景</td><td>80d</td><td>78d</td><td><span class="gv">-2d</span></td><td>97.5%</td></tr>\n    <tr><td>UI</td><td>60d</td><td>65d</td><td><span class="ov">+5d</span></td><td>91.7%</td></tr>\n    <tr><td>特效</td><td>50d</td><td>58d</td><td><span class="rv">+8d</span></td><td>84%</td></tr>\n    <tr><td>动画</td><td>45d</td><td>48d</td><td><span class="ov">+3d</span></td><td>93.3%</td></tr>\n  </table>\n</div>\n\n<!-- ═══════ 第三章：数据看板 ═══════ -->\n<div class="section" id="s3">\n  <h2>📊 三、数据看板</h2>\n\n  <div class="stat-grid">\n    <div class="stat-card">\n      <div class="stat-num" style="color:var(--accent)">85%</div>\n      <div class="stat-label">综合目标达成率</div>\n    </div>\n    <div class="stat-card">\n      <div class="stat-num" style="color:var(--orange)">90.8%</div>\n      <div class="stat-label">排期准确率</div>\n    </div>\n    <div class="stat-card">\n      <div class="stat-num" style="color:var(--green)">¥805k</div>\n      <div class="stat-label">实际总成本</div>\n    </div>\n    <div class="stat-card">\n      <div class="stat-num" style="color:var(--red)">+7.3%</div>\n      <div class="stat-label">预算偏差率</div>\n    </div>\n  </div>\n\n  <h3>3.1 资产产出 & 成本统计</h3>\n  <table>\n    <tr><th>项目</th><th>📅 预算</th><th>✅ 实际</th><th>📊 偏差率</th></tr>\n    <tr><td>内部人力</td><td>¥500k</td><td>¥520k</td><td>+4%</td></tr>\n    <tr><td>外包费用</td><td>¥250k</td><td>¥285k</td><td><span class="rv">+14%</span></td></tr>\n    <tr><td><strong>合计</strong></td><td><strong>¥750k</strong></td><td><strong>¥805k</strong></td><td><strong>+7.3%</strong></td></tr>\n  </table>\n</div>\n\n<!-- ═══════ 第四章：做得好的 ═══════ -->\n<div class="section" id="s4">\n  <h2>✨ 四、做得好的（What Went Well）</h2>\n\n  <table>\n    <tr><th>#</th><th>🌟 亮点</th><th>📝 具体表现</th><th>🔄 是否可推广</th></tr>\n    <tr><td>1</td><td>UI 团队效率高</td><td>按时交付，一次通过率 85%</td><td>✅ 需求模板推广到全工种</td></tr>\n    <tr><td>2</td><td>命名检查工具</td><td>自动化检查减少 30% 人工 Review 时间</td><td>✅ 全工种推广</td></tr>\n    <tr><td>3</td><td>每周走查制度</td><td>提前发现 12 个问题，避免后期爆雷</td><td>✅ 固化为 SOP</td></tr>\n    <tr><td>4</td><td>（继续添加）</td><td></td><td></td></tr>\n  </table>\n\n  <div class="alert alert-green">\n    <strong>💡 复盘锦囊：</strong>亮点总结也很重要！把有效的做法沉淀成规范，比修复问题更有长期价值。\n  </div>\n</div>\n\n<!-- ═══════ 第五章：需要改进的 ═══════ -->\n<div class="section" id="s5">\n  <h2>🚨 五、需要改进的（What Went Wrong）</h2>\n\n  <h3>5.1 问题清单</h3>\n  <table>\n    <tr><th>#</th><th>🐛 问题</th><th>💥 影响</th><th>🚦 严重度</th></tr>\n    <tr><td>1</td><td>策划需求冻结延迟 7 天</td><td>角色排期整体后移</td><td><span class="rv">🔴 高</span></td></tr>\n    <tr><td>2</td><td>外包首批交付质量差</td><td>返工 + 排期紧张</td><td><span class="rv">🔴 高</span></td></tr>\n    <tr><td>3</td><td>角色面数超标未早期发现</td><td>后期重做 3 个角色</td><td><span class="ov">🟠 中高</span></td></tr>\n    <tr><td>4</td><td>（继续添加）</td><td></td><td></td></tr>\n  </table>\n\n  <h3>5.2 5-Why 根因分析（Top 1 问题深挖）</h3>\n  <div class="why-chain">\n    <p style="color:var(--heading);font-weight:600;margin-bottom:12px">🚨 问题：策划需求冻结延迟 7 天</p>\n    <div class="why-step"><div class="why-num">1</div><div class="why-text"><strong>Why:</strong> 为什么需求冻结延迟？→ 策划内部对角色设定方案有分歧</div></div>\n    <div class="why-arrow">↓</div>\n    <div class="why-step"><div class="why-num">2</div><div class="why-text"><strong>Why:</strong> 为什么有分歧？→ 制作人中途因竞品上线加入新设计方向</div></div>\n    <div class="why-arrow">↓</div>\n    <div class="why-step"><div class="why-num">3</div><div class="why-text"><strong>Why:</strong> 为什么中途改方向？→ 预研阶段未做竞品分析</div></div>\n    <div class="why-arrow">↓</div>\n    <div class="why-step"><div class="why-num">4</div><div class="why-text"><strong>Why:</strong> 为什么没做竞品分析？→ 预研 Checklist 中没有竞品分析项</div></div>\n    <div class="why-arrow">↓</div>\n    <div class="why-step"><div class="why-num">5</div><div class="why-text"><strong>Why:</strong> 为什么 Checklist 缺失？→ Checklist 从未被系统性审查和迭代</div></div>\n    <div class="why-root">🎯 <strong>根因：</strong>预研流程缺少竞品分析环节 + Checklist 未建立定期审查机制</div>\n  </div>\n\n  <div class="alert alert-orange">\n    <strong>💡 提示：</strong>复制上方「5-Why」区块，为每个 Top 问题做独立的根因分析。通常分析 Top 3 即可。\n  </div>\n</div>\n\n<!-- ═══════ 第六章：Action Items ═══════ -->\n<div class="section" id="s6">\n  <h2>✅ 六、Action Items 追踪</h2>\n\n  <table>\n    <tr><th>#</th><th>📌 改进项</th><th>👤 负责人</th><th>📅 截止日期</th><th>🚦 优先级</th><th>📊 状态</th></tr>\n    <tr><td>1</td><td>预研 Checklist 增加竞品分析</td><td>（填写）</td><td>下版本预研前</td><td><span class="rv">🔴 高</span></td><td>⬜ 待做</td></tr>\n    <tr><td>2</td><td>制作外包风格指南模板</td><td>（填写）</td><td>2 周内</td><td><span class="rv">🔴 高</span></td><td>⬜ 待做</td></tr>\n    <tr><td>3</td><td>建立资产面数自动检查 CI</td><td>（填写）</td><td>1 月内</td><td><span class="yv">🟡 中</span></td><td>⬜ 待做</td></tr>\n    <tr><td>4</td><td>引擎升级前增加影响评估会</td><td>（填写）</td><td>固化流程</td><td><span class="yv">🟡 中</span></td><td>⬜ 待做</td></tr>\n    <tr><td>5</td><td>外包验收增加首件样品机制</td><td>（填写）</td><td>下次外包</td><td><span class="rv">🔴 高</span></td><td>⬜ 待做</td></tr>\n  </table>\n\n  <div class="alert alert-blue">\n    <strong>📌 跟踪规则：</strong>每个 Action Item 必须有<strong>唯一负责人</strong>和<strong>明确截止日期</strong>。下次复盘时首先回顾上次 Action Items 完成情况。\n  </div>\n</div>\n\n<!-- ═══════ 第七章：经验沉淀 ═══════ -->\n<div class="section" id="s7">\n  <h2>💎 七、经验沉淀 & 方法论提炼</h2>\n\n  <h3>7.1 形成的文档/规范</h3>\n  <table>\n    <tr><th>📄 输出物</th><th>📊 状态</th><th>📁 存放位置</th></tr>\n    <tr><td>预研阶段 Checklist（含竞品分析）</td><td>⬜ 待编写</td><td>知识库 → 项目管理</td></tr>\n    <tr><td>外包风格指南模板</td><td>⬜ 待编写</td><td>知识库 → 外包管理</td></tr>\n    <tr><td>资产面数自动检查脚本</td><td>⬜ 待开发</td><td>工具链 → 自动化</td></tr>\n    <tr><td>（继续添加）</td><td></td><td></td></tr>\n  </table>\n\n  <h3>7.2 经验金句（团队共识）</h3>\n  <div class="dd-grid">\n    <div class="dd-card dd-do">\n      <h4>💡 我们学到的</h4>\n      <ul>\n        <li>「口头沟通不是文档，外包永远需要比你想象的更详细的规范。」</li>\n        <li>「自动化检查永远比人工 Review 靠谱。」</li>\n        <li>「预研多花 1 周，量产少踩 1 个月的坑。」</li>\n        <li>（继续添加团队总结的金句）</li>\n      </ul>\n    </div>\n    <div class="dd-card dd-dont">\n      <h4>🚫 我们踩过的坑</h4>\n      <ul>\n        <li>「没有 Alpha 验收标准就开始量产 → 后期全返工」</li>\n        <li>「只看参考图就给外包下单 → 风格偏差大」</li>\n        <li>「引擎升级前没评估影响 → 材质重调 2 周」</li>\n        <li>（继续添加）</li>\n      </ul>\n    </div>\n  </div>\n\n  <h3>7.3 可复用的方法论</h3>\n  <div class="alert alert-green">\n    <strong>✅ 沉淀为方法论：</strong>本次复盘中发现的有效做法，如果适用于其他项目/版本，请总结成<strong>1~3 条可复用规则</strong>写在这里，并链接到对应的知识库文档。<br><br>\n    <strong>规则 1：</strong>（例：外包启动前必须完成「风格指南 + 首件样品」两步验证）<br>\n    <strong>规则 2：</strong>（继续添加）<br>\n    <strong>规则 3：</strong>（继续添加）\n  </div>\n</div>\n\n<div class="doc-footer">\n  🔄 项目复盘报告 · 模板 v1.0 · APM 知识库 · YYYY-MM-DD\n</div>\n\n</div>\n<script src="editor-kit.js"></script>\n</body>\n</html>',
  'html-weekly':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>项目周报</title>\n<style>\n:root{--bg:#0d0f15;--panel:#141620;--card:#1a1d2b;--border:#262a3a;--text:#c5c9d6;--dim:#6b7085;--heading:#e4e6ed;--accent:#6c8cff;--accent2:#a78bfa;--red:#f87171;--green:#4ade80;--blue:#60a5fa;--yellow:#fbbf24;--orange:#fb923c;--cyan:#22d3ee;--pink:#f472b6}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:16px}\n::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#3d4155;border-radius:3px}\n.doc{max-width:1400px;margin:0 auto;padding:32px 24px}\n.doc-header{text-align:center;padding:36px 0 24px;border-bottom:1px solid var(--border);margin-bottom:28px}\n.doc-header h1{font-size:28px;color:var(--heading);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:12px}\n.doc-header h1 .ver{font-size:12px;background:var(--accent);color:#fff;padding:2px 12px;border-radius:12px;font-weight:700}\n.doc-header .subtitle{color:var(--dim);font-size:15px}\n.doc-header .meta{display:flex;justify-content:center;gap:20px;margin-top:12px;font-size:12px;color:var(--dim);flex-wrap:wrap}\n.badge{display:inline-block;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;padding:4px 16px;border-radius:16px;font-size:11px;font-weight:600;margin-top:12px}\n.section{margin-bottom:32px}\n.section h2{font-size:20px;color:var(--heading);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--accent);display:flex;align-items:center;gap:8px}\n.section h3{font-size:15px;color:var(--heading);margin:16px 0 8px;font-weight:600}\ntable{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:14px}\nth{background:var(--panel);color:var(--heading);text-align:left;padding:10px 12px;border:1px solid var(--border);font-weight:600}\ntd{padding:9px 12px;border:1px solid var(--border);vertical-align:top}\ntr:nth-child(even){background:rgba(108,140,255,.02)}\n.alert{padding:14px 18px;border-radius:10px;margin:14px 0;font-size:14px;line-height:1.8}\n.alert-red{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}\n.alert-green{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)}\n.alert-yellow{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--yellow)}\n.alert-blue{background:rgba(108,140,255,.08);border:1px solid rgba(108,140,255,.2);color:var(--accent)}\n.stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}\n@media(max-width:700px){.stat-row{grid-template-columns:1fr 1fr}}\n.stat-chip{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center}\n.stat-chip .num{font-size:24px;font-weight:700;color:var(--heading);margin-bottom:2px}\n.stat-chip .label{font-size:11px;color:var(--dim)}\n.progress-bar{width:100%;height:8px;background:var(--card);border-radius:4px;overflow:hidden;margin-top:6px}\n.progress-fill{height:100%;border-radius:4px;transition:width .3s}\n.risk-card{background:var(--panel);border-left:4px solid var(--yellow);border-radius:0 10px 10px 0;padding:14px 18px;margin:10px 0;font-size:14px}\n.risk-card.risk-high{border-left-color:var(--red)}\n.risk-card.risk-low{border-left-color:var(--green)}\n.risk-card .risk-title{color:var(--heading);font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:8px}\n.doc-footer{text-align:center;padding:24px 0;border-top:1px solid var(--border);margin-top:32px;font-size:12px;color:var(--dim)}\n</style>\n</head>\n<body>\n<div class="doc">\n\n<div class="doc-header">\n  <h1>📊 美术项目周报 <span class="ver">W__</span></h1>\n  <div class="subtitle">Weekly Report — YYYY-MM-DD ~ YYYY-MM-DD</div>\n  <div class="meta">\n    <span>🎮 项目名称（填写）</span>\n    <span>👤 报告人（填写）</span>\n    <span>📅 第 __ 周 / Sprint __</span>\n  </div>\n  <div class="badge">📊 周报 · 可直接编辑</div>\n</div>\n\n<div class="alert alert-blue" style="margin-bottom:24px">\n  <strong>📖 使用说明：</strong>点击右上角「✏️ 编辑模式」进入编辑。每周五下班前更新，保存后发送给相关人员。\n</div>\n\n<!-- ═══ 一句话总结 ═══ -->\n<div class="section">\n  <h2>📌 一句话总结</h2>\n  <div class="alert alert-green">\n    <strong>本周一句话：</strong>（例：角色产线进度正常，场景 LOD 优化提前完成，外包 CP-A 首件通过率 100%。风险项：UI 需求插入导致 Sprint 超载 15%。）\n  </div>\n</div>\n\n<!-- ═══ 数据看板 ═══ -->\n<div class="section">\n  <h2>📈 本周数据看板</h2>\n  <div class="stat-row">\n    <div class="stat-chip">\n      <div class="num" style="color:var(--green)">12/15</div>\n      <div class="label">任务完成/计划</div>\n      <div class="progress-bar"><div class="progress-fill" style="width:80%;background:var(--green)"></div></div>\n    </div>\n    <div class="stat-chip">\n      <div class="num" style="color:var(--accent)">85%</div>\n      <div class="label">Sprint 燃尽率</div>\n      <div class="progress-bar"><div class="progress-fill" style="width:85%;background:var(--accent)"></div></div>\n    </div>\n    <div class="stat-chip">\n      <div class="num" style="color:var(--orange)">3</div>\n      <div class="label">本周新增 Bug</div>\n    </div>\n    <div class="stat-chip">\n      <div class="num" style="color:var(--cyan)">92%</div>\n      <div class="label">外包一次通过率</div>\n      <div class="progress-bar"><div class="progress-fill" style="width:92%;background:var(--cyan)"></div></div>\n    </div>\n    <div class="stat-chip">\n      <div class="num" style="color:var(--pink)">2</div>\n      <div class="label">风险预警项</div>\n    </div>\n  </div>\n</div>\n\n<!-- ═══ 本周完成 ═══ -->\n<div class="section">\n  <h2>✅ 本周完成</h2>\n  <table>\n    <tr><th style="width:60px">#</th><th>任务</th><th style="width:80px">工种</th><th style="width:80px">负责人</th><th style="width:80px">状态</th><th>备注</th></tr>\n    <tr><td>1</td><td>角色 A 高模完成</td><td>角色</td><td>张三</td><td><span style="color:var(--green)">✅ 完成</span></td><td>已提交主美审核</td></tr>\n    <tr><td>2</td><td>场景 B LOD 优化</td><td>场景</td><td>李四</td><td><span style="color:var(--green)">✅ 完成</span></td><td>面数降低 40%</td></tr>\n    <tr><td>3</td><td>UI 主界面切图</td><td>UI</td><td>王五</td><td><span style="color:var(--green)">✅ 完成</span></td><td>已交前端</td></tr>\n    <tr><td>4</td><td>（继续添加）</td><td></td><td></td><td></td><td></td></tr>\n  </table>\n</div>\n\n<!-- ═══ 下周计划 ═══ -->\n<div class="section">\n  <h2>📅 下周计划</h2>\n  <table>\n    <tr><th style="width:60px">#</th><th>任务</th><th style="width:80px">工种</th><th style="width:80px">负责人</th><th style="width:80px">优先级</th><th>预估工期</th></tr>\n    <tr><td>1</td><td>角色 A 低模 + UV 拆分</td><td>角色</td><td>张三</td><td><span style="color:var(--red)">🔴 P0</span></td><td>3d</td></tr>\n    <tr><td>2</td><td>场景 C 白盒搭建</td><td>场景</td><td>李四</td><td><span style="color:var(--orange)">🟠 P1</span></td><td>5d</td></tr>\n    <tr><td>3</td><td>外包 CP-B 首件评审</td><td>外包</td><td>赵六</td><td><span style="color:var(--red)">🔴 P0</span></td><td>1d</td></tr>\n    <tr><td>4</td><td>（继续添加）</td><td></td><td></td><td></td><td></td></tr>\n  </table>\n</div>\n\n<!-- ═══ 风险预警 ═══ -->\n<div class="section">\n  <h2>⚠️ 风险预警</h2>\n\n  <div class="risk-card risk-high">\n    <div class="risk-title">🔴 高风险：UI 需求插入导致 Sprint 超载</div>\n    <p>策划临时插入 3 个 UI 需求（非计划内），当前 Sprint 容量超载 15%。</p>\n    <p><strong>应对方案：</strong>与策划协商将 2 个低优需求移至下个 Sprint。</p>\n  </div>\n\n  <div class="risk-card">\n    <div class="risk-title">🟡 中风险：外包 CP-C 进度滞后</div>\n    <p>CP-C 本周应交付 5 个角色，实际仅交付 3 个，滞后 2 个。</p>\n    <p><strong>应对方案：</strong>周一远程 check-in，评估是否需要调配内部资源补位。</p>\n  </div>\n\n  <div class="risk-card risk-low">\n    <div class="risk-title">🟢 低风险：引擎版本升级通知</div>\n    <p>TA 通知下月将升级引擎版本，需提前评估材质兼容性。</p>\n    <p><strong>应对方案：</strong>安排 TA 下周做影响评估。</p>\n  </div>\n</div>\n\n<!-- ═══ 需要协调的事项 ═══ -->\n<div class="section">\n  <h2>🤝 需要协调的事项</h2>\n  <table>\n    <tr><th>#</th><th>事项</th><th>需要谁配合</th><th>期望完成时间</th><th>当前状态</th></tr>\n    <tr><td>1</td><td>策划确认角色 B 技能动作需求</td><td>策划-孙七</td><td>周二</td><td>⏳ 待确认</td></tr>\n    <tr><td>2</td><td>TA 提供 PBR 材质转换脚本</td><td>TA-孙七</td><td>周三</td><td>⏳ 开发中</td></tr>\n    <tr><td>3</td><td>（继续添加）</td><td></td><td></td><td></td></tr>\n  </table>\n</div>\n\n<div class="doc-footer">\n  📊 美术项目周报 · W__ · APM 知识库 · YYYY-MM-DD\n</div>\n\n</div>\n<script src="editor-kit.js"></script>\n</body>\n</html>',
  'html-decision':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>决策记录</title>\n<style>\n:root{--bg:#0d0f15;--panel:#141620;--card:#1a1d2b;--border:#262a3a;--text:#c5c9d6;--dim:#6b7085;--heading:#e4e6ed;--accent:#6c8cff;--accent2:#a78bfa;--red:#f87171;--green:#4ade80;--blue:#60a5fa;--yellow:#fbbf24;--orange:#fb923c;--cyan:#22d3ee;--pink:#f472b6}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:16px}\n::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#3d4155;border-radius:3px}\n.doc{max-width:1400px;margin:0 auto;padding:32px 24px}\n.doc-header{text-align:center;padding:36px 0 24px;border-bottom:1px solid var(--border);margin-bottom:28px}\n.doc-header h1{font-size:28px;color:var(--heading);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:12px}\n.doc-header h1 .ver{font-size:12px;background:var(--accent2);color:#fff;padding:2px 12px;border-radius:12px;font-weight:700}\n.doc-header .subtitle{color:var(--dim);font-size:15px}\n.doc-header .meta{display:flex;justify-content:center;gap:20px;margin-top:12px;font-size:12px;color:var(--dim);flex-wrap:wrap}\n.badge{display:inline-block;background:linear-gradient(135deg,var(--accent2),var(--pink));color:#fff;padding:4px 16px;border-radius:16px;font-size:11px;font-weight:600;margin-top:12px}\n.section{margin-bottom:32px}\n.section h2{font-size:20px;color:var(--heading);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--accent2);display:flex;align-items:center;gap:8px}\n.section h3{font-size:15px;color:var(--heading);margin:16px 0 8px;font-weight:600}\n.section p{font-size:15px;margin-bottom:8px}\ntable{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:14px}\nth{background:var(--panel);color:var(--heading);text-align:left;padding:10px 12px;border:1px solid var(--border);font-weight:600}\ntd{padding:9px 12px;border:1px solid var(--border);vertical-align:top}\ntr:nth-child(even){background:rgba(108,140,255,.02)}\n.alert{padding:14px 18px;border-radius:10px;margin:14px 0;font-size:14px;line-height:1.8}\n.alert-red{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}\n.alert-green{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)}\n.alert-yellow{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--yellow)}\n.alert-blue{background:rgba(108,140,255,.08);border:1px solid rgba(108,140,255,.2);color:var(--accent)}\n.alert-purple{background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);color:var(--accent2)}\n.option-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}\n@media(max-width:800px){.option-grid{grid-template-columns:1fr}}\n.option-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;position:relative}\n.option-card.selected{border-color:var(--green);box-shadow:0 0 20px rgba(74,222,128,.15)}\n.option-card .opt-badge{position:absolute;top:12px;right:12px;font-size:11px;padding:2px 10px;border-radius:10px;font-weight:600}\n.opt-badge-best{background:rgba(74,222,128,.15);color:var(--green)}\n.opt-badge-alt{background:rgba(251,191,36,.15);color:var(--yellow)}\n.opt-badge-rejected{background:rgba(248,113,113,.15);color:var(--red)}\n.option-card h4{color:var(--heading);font-size:16px;margin-bottom:8px}\n.option-card p{font-size:13px;color:var(--dim);margin-bottom:8px}\n.option-card .pros-cons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:13px}\n.pro-item{color:var(--green)}.con-item{color:var(--red)}\n.score-bar{display:flex;align-items:center;gap:8px;margin:4px 0}\n.score-bar .bar{flex:1;height:6px;background:var(--card);border-radius:3px;overflow:hidden}\n.score-bar .fill{height:100%;border-radius:3px}\n.score-bar .val{font-size:12px;color:var(--dim);width:40px;text-align:right}\n.flow{display:flex;align-items:center;gap:0;margin:16px 0;flex-wrap:wrap}\n.flow-node{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;text-align:center;min-width:100px}\n.flow-node strong{display:block;color:var(--heading);font-size:14px;margin-bottom:2px}\n.flow-arrow{color:var(--accent2);font-size:18px;padding:0 6px;flex-shrink:0}\n.doc-footer{text-align:center;padding:24px 0;border-top:1px solid var(--border);margin-top:32px;font-size:12px;color:var(--dim)}\n</style>\n</head>\n<body>\n<div class="doc">\n\n<div class="doc-header">\n  <h1>⚖️ 决策记录 <span class="ver">DR-___</span></h1>\n  <div class="subtitle">Decision Record — 关键决策的结构化记录与追溯</div>\n  <div class="meta">\n    <span>🎮 项目名称（填写）</span>\n    <span>👤 决策人（填写）</span>\n    <span>📅 YYYY-MM-DD</span>\n  </div>\n  <div class="badge">⚖️ 决策记录 · 可直接编辑</div>\n</div>\n\n<div class="alert alert-purple" style="margin-bottom:24px">\n  <strong>💡 为什么要写决策记录？</strong>3 个月后没人记得"当时为什么选了方案 A"。决策记录是团队知识资产，让后来者理解上下文，避免重复踩坑。\n</div>\n\n<!-- ═══ 决策概要 ═══ -->\n<div class="section">\n  <h2>📋 一、决策概要</h2>\n  <table>\n    <tr><th style="width:180px">字段</th><th>内容</th></tr>\n    <tr><td>🔖 <strong>决策编号</strong></td><td>DR-___（自增编号）</td></tr>\n    <tr><td>📌 <strong>决策标题</strong></td><td>（例：选择外包 CP 供应商 / 换色方案技术选型 / 引擎版本升级时机）</td></tr>\n    <tr><td>📊 <strong>决策状态</strong></td><td>☐ 提议中 ☐ <strong>已决定</strong> ☐ 已执行 ☐ 已废弃</td></tr>\n    <tr><td>👤 <strong>决策人</strong></td><td>（最终拍板人）</td></tr>\n    <tr><td>👥 <strong>参与人</strong></td><td>（参与讨论的人）</td></tr>\n    <tr><td>📅 <strong>决策日期</strong></td><td>YYYY-MM-DD</td></tr>\n    <tr><td>📅 <strong>复查日期</strong></td><td>YYYY-MM-DD（30天后复查决策效果）</td></tr>\n  </table>\n</div>\n\n<!-- ═══ 背景 & 问题 ═══ -->\n<div class="section">\n  <h2>🔍 二、背景 & 问题</h2>\n  <h3>2.1 当前状况</h3>\n  <p>（描述当前面临的情况，用事实和数据说话）</p>\n  <p>例：当前项目需要 20 个角色，内部产能只够做 12 个，缺口 8 个角色需要外包。有 3 家候选 CP。</p>\n\n  <h3>2.2 需要决策的问题</h3>\n  <div class="alert alert-yellow">\n    <strong>❓ 核心问题：</strong>（用一句话描述需要做的决定）<br>\n    例：「在 CP-A / CP-B / CP-C 三家供应商中，选择哪家作为本期角色外包的主力合作方？」\n  </div>\n\n  <h3>2.3 约束条件</h3>\n  <ul style="padding-left:20px;font-size:14px">\n    <li>预算上限：¥___k</li>\n    <li>交付时间：必须在 __月__日 前完成</li>\n    <li>质量要求：一次通过率 ≥ ___%</li>\n    <li>（补充其他约束）</li>\n  </ul>\n</div>\n\n<!-- ═══ 备选方案 ═══ -->\n<div class="section">\n  <h2>💡 三、备选方案对比</h2>\n\n  <div class="option-grid">\n    <div class="option-card selected">\n      <span class="opt-badge opt-badge-best">✅ 最终选择</span>\n      <h4>方案 A</h4>\n      <p>（方案描述）</p>\n      <div class="pros-cons">\n        <div>\n          <div class="pro-item">✅ 优势 1</div>\n          <div class="pro-item">✅ 优势 2</div>\n          <div class="pro-item">✅ 优势 3</div>\n        </div>\n        <div>\n          <div class="con-item">❌ 劣势 1</div>\n          <div class="con-item">❌ 劣势 2</div>\n        </div>\n      </div>\n    </div>\n    <div class="option-card">\n      <span class="opt-badge opt-badge-alt">备选</span>\n      <h4>方案 B</h4>\n      <p>（方案描述）</p>\n      <div class="pros-cons">\n        <div>\n          <div class="pro-item">✅ 优势 1</div>\n          <div class="pro-item">✅ 优势 2</div>\n        </div>\n        <div>\n          <div class="con-item">❌ 劣势 1</div>\n          <div class="con-item">❌ 劣势 2</div>\n          <div class="con-item">❌ 劣势 3</div>\n        </div>\n      </div>\n    </div>\n    <div class="option-card">\n      <span class="opt-badge opt-badge-rejected">已排除</span>\n      <h4>方案 C</h4>\n      <p>（方案描述）</p>\n      <div class="pros-cons">\n        <div>\n          <div class="pro-item">✅ 优势 1</div>\n        </div>\n        <div>\n          <div class="con-item">❌ 劣势 1</div>\n          <div class="con-item">❌ 劣势 2</div>\n          <div class="con-item">❌ 致命缺陷</div>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n\n<!-- ═══ 评估矩阵 ═══ -->\n<div class="section">\n  <h2>📊 四、评估矩阵</h2>\n  <table>\n    <tr><th>评估维度</th><th>权重</th><th>方案 A</th><th>方案 B</th><th>方案 C</th></tr>\n    <tr><td><strong>质量</strong></td><td>30%</td><td><span style="color:var(--green)">⭐⭐⭐⭐</span></td><td>⭐⭐⭐</td><td>⭐⭐</td></tr>\n    <tr><td><strong>成本</strong></td><td>25%</td><td>⭐⭐⭐</td><td><span style="color:var(--green)">⭐⭐⭐⭐</span></td><td>⭐⭐⭐⭐</td></tr>\n    <tr><td><strong>交付速度</strong></td><td>25%</td><td><span style="color:var(--green)">⭐⭐⭐⭐</span></td><td>⭐⭐⭐</td><td>⭐⭐</td></tr>\n    <tr><td><strong>沟通效率</strong></td><td>10%</td><td><span style="color:var(--green)">⭐⭐⭐⭐⭐</span></td><td>⭐⭐⭐</td><td>⭐⭐</td></tr>\n    <tr><td><strong>合作历史</strong></td><td>10%</td><td>⭐⭐⭐</td><td><span style="color:var(--green)">⭐⭐⭐⭐</span></td><td>⭐（首次）</td></tr>\n    <tr style="background:rgba(74,222,128,.05)"><td><strong>加权总分</strong></td><td>100%</td><td><strong style="color:var(--green)">3.7 ✅</strong></td><td><strong>3.3</strong></td><td><strong style="color:var(--red)">2.4</strong></td></tr>\n  </table>\n</div>\n\n<!-- ═══ 最终决定 ═══ -->\n<div class="section">\n  <h2>✅ 五、最终决定</h2>\n  <div class="alert alert-green">\n    <strong>📌 决定：</strong>选择<strong>方案 A</strong>。<br><br>\n    <strong>理由：</strong>综合评估质量、交付速度和沟通效率三个核心维度，方案 A 加权得分最高（3.7/5）。虽然成本略高于方案 B，但一次通过率更高（预估 90% vs 75%），返工成本的节省可以弥补差价。\n  </div>\n\n  <h3>5.1 风险与缓解措施</h3>\n  <table>\n    <tr><th>潜在风险</th><th>影响</th><th>缓解措施</th></tr>\n    <tr><td>方案 A 成本偏高</td><td>预算压力</td><td>首批 3 个角色作为试合作，通过后再签大单</td></tr>\n    <tr><td>方案 A 产能天花板</td><td>可能无法承接全部 8 个</td><td>预留方案 B 作为 backup，分配 2-3 个角色</td></tr>\n    <tr><td>（继续添加）</td><td></td><td></td></tr>\n  </table>\n</div>\n\n<!-- ═══ 执行计划 ═══ -->\n<div class="section">\n  <h2>🚀 六、执行计划</h2>\n  <div class="flow">\n    <div class="flow-node"><strong>签合同</strong>本周内</div>\n    <div class="flow-arrow">→</div>\n    <div class="flow-node"><strong>风格对齐</strong>3 天</div>\n    <div class="flow-arrow">→</div>\n    <div class="flow-node"><strong>首件样品</strong>1 周</div>\n    <div class="flow-arrow">→</div>\n    <div class="flow-node"><strong>评审通过</strong>2 天</div>\n    <div class="flow-arrow">→</div>\n    <div class="flow-node"><strong>批量开工</strong>启动</div>\n  </div>\n\n  <table>\n    <tr><th>步骤</th><th>负责人</th><th>截止日期</th><th>状态</th></tr>\n    <tr><td>与方案 A 签订合作协议</td><td>（填写）</td><td>YYYY-MM-DD</td><td>⬜ 待做</td></tr>\n    <tr><td>提供风格指南 + 技术规范</td><td>（填写）</td><td>YYYY-MM-DD</td><td>⬜ 待做</td></tr>\n    <tr><td>首件样品评审</td><td>（填写）</td><td>YYYY-MM-DD</td><td>⬜ 待做</td></tr>\n    <tr><td>30 天决策效果复查</td><td>（填写）</td><td>YYYY-MM-DD</td><td>⬜ 待做</td></tr>\n  </table>\n</div>\n\n<div class="doc-footer">\n  ⚖️ 决策记录 DR-___ · APM 知识库 · YYYY-MM-DD\n</div>\n\n</div>\n<script src="editor-kit.js"></script>\n</body>\n</html>',
  'html-meeting':'<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>会议纪要</title>\n<style>\n:root{--bg:#0d0f15;--panel:#141620;--card:#1a1d2b;--border:#262a3a;--text:#c5c9d6;--dim:#6b7085;--heading:#e4e6ed;--accent:#6c8cff;--accent2:#a78bfa;--red:#f87171;--green:#4ade80;--blue:#60a5fa;--yellow:#fbbf24;--orange:#fb923c;--cyan:#22d3ee;--pink:#f472b6}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;background:var(--bg);color:var(--text);line-height:1.8;font-size:16px}\n::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#3d4155;border-radius:3px}\n.doc{max-width:1400px;margin:0 auto;padding:32px 24px}\n.doc-header{text-align:center;padding:36px 0 24px;border-bottom:1px solid var(--border);margin-bottom:28px}\n.doc-header h1{font-size:28px;color:var(--heading);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:12px}\n.doc-header h1 .ver{font-size:12px;background:var(--cyan);color:#000;padding:2px 12px;border-radius:12px;font-weight:700}\n.doc-header .subtitle{color:var(--dim);font-size:15px}\n.doc-header .meta{display:flex;justify-content:center;gap:20px;margin-top:12px;font-size:12px;color:var(--dim);flex-wrap:wrap}\n.badge{display:inline-block;background:linear-gradient(135deg,var(--cyan),var(--accent));color:#fff;padding:4px 16px;border-radius:16px;font-size:11px;font-weight:600;margin-top:12px}\n.section{margin-bottom:32px}\n.section h2{font-size:20px;color:var(--heading);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--cyan);display:flex;align-items:center;gap:8px}\n.section h3{font-size:15px;color:var(--heading);margin:16px 0 8px;font-weight:600}\n.section p{font-size:15px;margin-bottom:8px}\n.section ul,.section ol{padding-left:20px;margin-bottom:12px;font-size:14px}\n.section li{margin-bottom:4px}\ntable{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:14px}\nth{background:var(--panel);color:var(--heading);text-align:left;padding:10px 12px;border:1px solid var(--border);font-weight:600}\ntd{padding:9px 12px;border:1px solid var(--border);vertical-align:top}\ntr:nth-child(even){background:rgba(108,140,255,.02)}\n.alert{padding:14px 18px;border-radius:10px;margin:14px 0;font-size:14px;line-height:1.8}\n.alert-red{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}\n.alert-green{background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)}\n.alert-yellow{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--yellow)}\n.alert-blue{background:rgba(108,140,255,.08);border:1px solid rgba(108,140,255,.2);color:var(--accent)}\n.alert-cyan{background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.2);color:var(--cyan)}\n.agenda-item{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin:12px 0}\n.agenda-item .ai-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}\n.agenda-item .ai-title{color:var(--heading);font-weight:600;font-size:15px;display:flex;align-items:center;gap:8px}\n.agenda-item .ai-time{font-size:12px;color:var(--dim);background:var(--card);padding:2px 10px;border-radius:6px}\n.agenda-item .ai-body{font-size:14px;line-height:1.8}\n.decision-box{background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:10px;padding:14px 18px;margin:10px 0}\n.decision-box .db-title{color:var(--green);font-weight:600;font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:6px}\n.action-box{background:rgba(108,140,255,.06);border:1px solid rgba(108,140,255,.2);border-radius:10px;padding:14px 18px;margin:10px 0}\n.action-box .ab-title{color:var(--accent);font-weight:600;font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:6px}\n.quote{background:var(--panel);border-left:4px solid var(--accent2);border-radius:0 8px 8px 0;padding:12px 18px;margin:10px 0;font-size:14px;font-style:italic;color:var(--dim)}\n.quote strong{color:var(--heading);font-style:normal}\n.doc-footer{text-align:center;padding:24px 0;border-top:1px solid var(--border);margin-top:32px;font-size:12px;color:var(--dim)}\n</style>\n</head>\n<body>\n<div class="doc">\n\n<div class="doc-header">\n  <h1>📝 会议纪要 <span class="ver">模板</span></h1>\n  <div class="subtitle">Meeting Notes — 高效记录会议要点与待办</div>\n  <div class="meta">\n    <span>🎮 项目名称（填写）</span>\n    <span>👤 记录人（填写）</span>\n    <span>📅 YYYY-MM-DD</span>\n  </div>\n  <div class="badge">📝 会议纪要 · 可直接编辑</div>\n</div>\n\n<div class="alert alert-cyan" style="margin-bottom:24px">\n  <strong>📖 使用说明：</strong>点击右上角「✏️ 编辑模式」进入编辑。会议结束后<strong> 24 小时内</strong>完成纪要并发送给参会人确认。\n</div>\n\n<!-- ═══ 会议信息 ═══ -->\n<div class="section">\n  <h2>📋 一、会议信息</h2>\n  <table>\n    <tr><th style="width:160px">字段</th><th>内容</th></tr>\n    <tr><td>📌 <strong>会议主题</strong></td><td>（例：Sprint 12 美术走查 / 外包评审会 / 跨部门需求对齐）</td></tr>\n    <tr><td>📅 <strong>日期 & 时间</strong></td><td>YYYY-MM-DD HH:mm ~ HH:mm</td></tr>\n    <tr><td>📍 <strong>地点/平台</strong></td><td>☐ 线下（会议室___） ☐ 线上（腾讯会议/企微/Zoom）</td></tr>\n    <tr><td>🎤 <strong>主持人</strong></td><td>（填写）</td></tr>\n    <tr><td>👥 <strong>参会人</strong></td><td>（列出姓名和角色，如：张三-APM / 李四-主美 / 王五-策划）</td></tr>\n    <tr><td>👤 <strong>缺席人</strong></td><td>（如有）</td></tr>\n    <tr><td>✍️ <strong>记录人</strong></td><td>（填写）</td></tr>\n    <tr><td>🏷️ <strong>会议类型</strong></td><td>☐ 周例会 ☐ 评审会 ☐ 复盘会 ☐ 需求对齐 ☐ 专项讨论 ☐ 其他</td></tr>\n  </table>\n</div>\n\n<!-- ═══ 议程 ═══ -->\n<div class="section">\n  <h2>📑 二、议程</h2>\n\n  <div class="agenda-item">\n    <div class="ai-header">\n      <div class="ai-title">📌 议题 1：Sprint 12 进度回顾</div>\n      <div class="ai-time">⏱ 15 min</div>\n    </div>\n    <div class="ai-body">\n      <p><strong>汇报人：</strong>（填写姓名）</p>\n      <p><strong>内容要点：</strong></p>\n      <ul>\n        <li>本 Sprint 完成 12/15 个任务，完成率 80%</li>\n        <li>角色产线正常，场景有 2 个延期</li>\n        <li>（继续添加讨论要点）</li>\n      </ul>\n      <div class="quote">\n        <strong>李四（主美）：</strong>「场景延期主要是因为策划变更了 2 个场景的需求，建议后续需求变更走正式流程。」\n      </div>\n    </div>\n  </div>\n\n  <div class="agenda-item">\n    <div class="ai-header">\n      <div class="ai-title">📌 议题 2：外包 CP-A 首件评审</div>\n      <div class="ai-time">⏱ 20 min</div>\n    </div>\n    <div class="ai-body">\n      <p><strong>汇报人：</strong>（填写姓名）</p>\n      <p><strong>内容要点：</strong></p>\n      <ul>\n        <li>首件角色整体质量良好，面数达标</li>\n        <li>贴图精度需要提升，部分区域模糊</li>\n        <li>（继续添加讨论要点）</li>\n      </ul>\n      <div class="decision-box">\n        <div class="db-title">✅ 决议</div>\n        <p>首件<strong>有条件通过</strong>：贴图精度问题需在 3 天内修正后复审，通过后启动批量制作。</p>\n      </div>\n      <div class="action-box">\n        <div class="ab-title">📌 待办</div>\n        <p>赵六 负责跟进 CP-A 贴图修正 → 截止 YYYY-MM-DD</p>\n      </div>\n    </div>\n  </div>\n\n  <div class="agenda-item">\n    <div class="ai-header">\n      <div class="ai-title">📌 议题 3：（继续添加议题）</div>\n      <div class="ai-time">⏱ __ min</div>\n    </div>\n    <div class="ai-body">\n      <p><strong>汇报人：</strong>（填写姓名）</p>\n      <p><strong>内容要点：</strong></p>\n      <ul>\n        <li>（添加讨论要点）</li>\n      </ul>\n    </div>\n  </div>\n</div>\n\n<!-- ═══ 决议汇总 ═══ -->\n<div class="section">\n  <h2>✅ 三、决议汇总</h2>\n  <table>\n    <tr><th>#</th><th>决议内容</th><th>相关议题</th><th>决策人</th></tr>\n    <tr><td>1</td><td>场景需求变更走正式流程（邮件 + TAPD 单）</td><td>议题 1</td><td>（填写）</td></tr>\n    <tr><td>2</td><td>CP-A 首件有条件通过，贴图修正后复审</td><td>议题 2</td><td>（填写）</td></tr>\n    <tr><td>3</td><td>（继续添加）</td><td></td><td></td></tr>\n  </table>\n</div>\n\n<!-- ═══ 待办事项 ═══ -->\n<div class="section">\n  <h2>📌 四、待办事项追踪</h2>\n  <table>\n    <tr><th>#</th><th>待办内容</th><th>👤 负责人</th><th>📅 截止日期</th><th>🚦 优先级</th><th>📊 状态</th></tr>\n    <tr><td>1</td><td>跟进 CP-A 贴图修正 + 复审</td><td>赵六</td><td>YYYY-MM-DD</td><td><span style="color:var(--red)">🔴 高</span></td><td>⬜ 待做</td></tr>\n    <tr><td>2</td><td>制定场景需求变更 SOP 并发邮件通知</td><td>（填写）</td><td>YYYY-MM-DD</td><td><span style="color:var(--orange)">🟠 中</span></td><td>⬜ 待做</td></tr>\n    <tr><td>3</td><td>（继续添加）</td><td></td><td></td><td></td><td></td></tr>\n  </table>\n\n  <div class="alert alert-blue">\n    <strong>📌 跟踪规则：</strong>所有待办事项在下次会议开始时首先回顾完成情况。未完成的标注原因并延期。\n  </div>\n</div>\n\n<!-- ═══ 备注 ═══ -->\n<div class="section">\n  <h2>📎 五、备注 & 下次会议</h2>\n  <table>\n    <tr><th style="width:160px">字段</th><th>内容</th></tr>\n    <tr><td>📅 <strong>下次会议时间</strong></td><td>YYYY-MM-DD HH:mm</td></tr>\n    <tr><td>📌 <strong>预定议题</strong></td><td>① CP-A 复审结果 ② Sprint 13 规划 ③ （继续添加）</td></tr>\n    <tr><td>📎 <strong>附件/链接</strong></td><td>（如有会议录屏、PPT 等附件，列出链接）</td></tr>\n  </table>\n</div>\n\n<div class="doc-footer">\n  📝 会议纪要 · APM 知识库 · YYYY-MM-DD\n</div>\n\n</div>\n<script src="editor-kit.js"></script>\n</body>\n</html>'
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
  // 清理内嵌 HTML 编辑器（如果有）
  var embedWrap=document.getElementById('htmlEditorEmbed');
  if(embedWrap) embedWrap.style.display='none';
  var vditorEl=document.getElementById('vditorContainer');
  if(vditorEl) vditorEl.style.display='';
  navigate(curPage||'home');
}

function applyTemplate(key){
  // HTML 模板处理 — 直接在创作模式的内容区内嵌编辑
  if(key && htmlTemplates[key]){
    var htmlContent=htmlTemplates[key];
    openHtmlTemplateInEditor(key, htmlContent);
    document.getElementById('editorTemplate').value='';
    return;
  }
  // Markdown 模板处理
  if(!key||!templates[key]) return;
  if(vditorInstance){
    var current=vditorInstance.getValue().trim();
    if(current&&!confirm('当前编辑器有内容，是否覆盖？')) return;
    vditorInstance.setValue(templates[key]);
  }
  document.getElementById('editorTemplate').value='';
}

// ═══ HTML 模板页内编辑器 ═══
var htmlTemplateNames={
  'html-standard':'标准规范模板','html-richtext':'图文混排模板','html-kanban':'项目看板模板',
  'html-postmortem':'项目复盘报告','html-weekly':'项目周报','html-decision':'决策记录','html-meeting':'会议纪要'
};

// 从创作模式选择 HTML 模板时：在创作模式内嵌 iframe 编辑（不离开创作模式）
function openHtmlTemplateInEditor(key, htmlContent){
  var tmplName=htmlTemplateNames[key]||key;
  var ep=document.getElementById('editorPage');
  var vditorEl=document.getElementById('vditorContainer');

  // 隐藏 Markdown 编辑器
  vditorEl.style.display='none';

  // 创建或复用内嵌的 HTML 编辑容器
  var embedWrap=document.getElementById('htmlEditorEmbed');
  if(!embedWrap){
    embedWrap=document.createElement('div');
    embedWrap.id='htmlEditorEmbed';
    embedWrap.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;border-radius:8px;border:1px solid var(--border);margin:0 0 0;background:var(--bg);position:relative';
    ep.appendChild(embedWrap);
  }
  embedWrap.style.display='flex';

  // 构建内嵌工具栏 + iframe
  embedWrap.innerHTML=
    '<div class="htmpl-embed-toolbar" id="htmlEmbedToolbar">'
      +'<div class="htmpl-embed-title"><span>📝</span> '+tmplName+'</div>'
      +'<div class="htmpl-toolbar-actions">'
        +'<button class="ift-btn htmpl-btn-edit" onclick="htmlEmbedEnterEdit()" title="进入编辑模式">✏️ 开始编辑</button>'
        +'<button class="ift-btn htmpl-btn-save" onclick="htmlEmbedSave()" style="display:none" title="保存下载">💾 保存下载</button>'
        +'<button class="ift-btn htmpl-btn-publish" onclick="htmlEmbedPublish()" style="display:none" title="一键发布到 GitHub 仓库">🚀 一键发布</button>'
        +'<button class="ift-btn htmpl-btn-exit" onclick="htmlEmbedExitEdit()" style="display:none" title="退出编辑">✖ 退出编辑</button>'
        +'<span class="htmpl-divider"></span>'
        +'<button class="ift-btn htmpl-btn-back" onclick="htmlEmbedBackToMd()" title="返回 Markdown 编辑器">↩ 返回编辑器</button>'
      +'</div>'
    +'</div>'
    +'<iframe id="htmlEmbedFrame" style="flex:1;border:none;width:100%;background:#0d1117"></iframe>';

  var frame=document.getElementById('htmlEmbedFrame');
  var blob=new Blob([htmlContent],{type:'text/html;charset=utf-8'});
  var blobUrl=URL.createObjectURL(blob);
  frame.src=blobUrl;
  embedWrap.dataset.tmplKey=key;

  frame.onload=function(){
    URL.revokeObjectURL(blobUrl);
    try{
      var iDoc=frame.contentDocument||frame.contentWindow.document;
      var ekBtn=iDoc.querySelector('.ek-enter-btn');
      if(ekBtn) ekBtn.style.display='none';
    }catch(e){}
    showToast('✅ 模板已加载，点击「✏️ 开始编辑」进行修改');
  };
}

// 内嵌编辑：进入编辑模式
function htmlEmbedEnterEdit(){
  var frame=document.getElementById('htmlEmbedFrame');
  if(!frame) return;
  try{
    var win=frame.contentWindow;
    var iDoc=frame.contentDocument||win.document;
    if(typeof win.enterEdit==='function'){
      // editor-kit.js 已正常加载，走原生 enterEdit
      win.enterEdit();
    } else {
      // 【Bug 1 修复】blob URL 下 editor-kit.js 可能未加载成功
      // 手动为 iframe 内容设置 contenteditable，使其可编辑
      iDoc.body.classList.add('ek-editing');
      // 对常见内容元素设置 contenteditable
      var editableSelectors=[
        '.doc-header h1','.doc-header .subtitle','.doc-header .meta',
        '.doc-header .badge','.toc','.section','.doc-footer',
        '.alert','.case-body','.case-head .title',
        '.mine-body','.mine-head .title','.faq-q','.faq-a',
        '.dd-do','.dd-dont','.step .st','.step .sd',
        '.stat-chip','.qs-item','.flow-node',
        '.header-info h1','.header-info p','.section-title',
        'th','td',
        // 通用：对常规页面中主要的文字容器也生效
        'h1','h2','h3','h4','p','li','blockquote',
        '.container','div.card','div.section','div.summary',
        '.hero h1','.hero p','.card h3','.card p',
        '.column-title','.task-title','.task-meta',
        '.risk-card','.agenda-item','.quote',
        '.decision-box','.action-box'
      ];
      editableSelectors.forEach(function(sel){
        iDoc.querySelectorAll(sel).forEach(function(el){
          if(el.closest('[contenteditable="true"]')&&el.closest('[contenteditable="true"]')!==el) return;
          el.setAttribute('contenteditable','true');
        });
      });
      // 如果上述选择器都未命中（模板结构不同），则对 body 直接设置 contenteditable
      var editableCount=iDoc.querySelectorAll('[contenteditable="true"]').length;
      if(editableCount===0){
        iDoc.body.setAttribute('contenteditable','true');
      }
      // 图片双击替换支持
      iDoc.querySelectorAll('img').forEach(function(img){
        img.style.cursor='pointer';
        img.style.outline='2px dashed rgba(108,140,255,.4)';
        img.addEventListener('dblclick',function(e){
          e.preventDefault();e.stopPropagation();
          var inp=iDoc.createElement('input');inp.type='file';inp.accept='image/*';
          inp.onchange=function(){
            var file=inp.files[0];if(!file) return;
            var reader=new FileReader();
            reader.onload=function(ev){img.src=ev.target.result;};
            reader.readAsDataURL(file);
          };
          inp.click();
        });
      });
    }
    // 隐藏 iframe 内部的 editor-kit UI（如果存在）
    var ekToolbar=iDoc.querySelector('.ek-toolbar');
    if(ekToolbar) ekToolbar.style.display='none';
    var ekBadge=iDoc.querySelector('.ek-editing-badge');
    if(ekBadge) ekBadge.style.display='none';
  }catch(e){
    console.log('Cannot enter edit:',e);
    showToast('⚠️ 无法进入编辑模式','warning');
    return;
  }
  var tb=document.getElementById('htmlEmbedToolbar');
  hideBtn(tb.querySelector('.htmpl-btn-edit'));
  showBtn(tb.querySelector('.htmpl-btn-save'));
  showBtn(tb.querySelector('.htmpl-btn-publish'));
  showBtn(tb.querySelector('.htmpl-btn-exit'));
  showToast('✅ 已进入编辑模式，直接点击内容修改');
}

// 内嵌编辑：退出编辑模式
function htmlEmbedExitEdit(){
  var frame=document.getElementById('htmlEmbedFrame');
  if(!frame) return;
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    iDoc.body.classList.remove('ek-editing');
    // 移除所有 contenteditable 属性（包括 body 上可能设置的）
    iDoc.body.removeAttribute('contenteditable');
    iDoc.querySelectorAll('[contenteditable]').forEach(function(el){el.removeAttribute('contenteditable');});
    iDoc.querySelectorAll('.ek-img-editable').forEach(function(el){el.classList.remove('ek-img-editable');});
    // 还原图片编辑态样式
    iDoc.querySelectorAll('img').forEach(function(img){
      img.style.cursor='';
      img.style.outline='';
    });
  }catch(e){}
  var tb=document.getElementById('htmlEmbedToolbar');
  showBtn(tb.querySelector('.htmpl-btn-edit'));
  hideBtn(tb.querySelector('.htmpl-btn-save'));
  hideBtn(tb.querySelector('.htmpl-btn-publish'));
  hideBtn(tb.querySelector('.htmpl-btn-exit'));
  showToast('已退出编辑模式');
}

// 内嵌编辑：保存下载
function htmlEmbedSave(){
  var frame=document.getElementById('htmlEmbedFrame');
  var wrap=document.getElementById('htmlEditorEmbed');
  var key=wrap?wrap.dataset.tmplKey:'document';
  var tmplName=htmlTemplateNames[key]||key;
  var fileName=tmplName.replace(/\s+/g,'-')+'.html';
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    var html=getCleanHtmlFromIframe(iDoc);
    downloadHtmlStr(html, fileName);
    showToast('✅ 已下载: '+fileName);
  }catch(e){
    showToast('⚠️ 保存失败: '+e.message);
  }
}

// 内嵌编辑：另存为
function htmlEmbedSaveAs(){
  var wrap=document.getElementById('htmlEditorEmbed');
  var key=wrap?wrap.dataset.tmplKey:'document';
  var tmplName=htmlTemplateNames[key]||key;
  var defaultName=tmplName.replace(/\s+/g,'-');
  // 复用已有的 saveAs 弹窗逻辑
  _showSaveAsDialog(defaultName, function(name){
    var frame=document.getElementById('htmlEmbedFrame');
    try{
      var iDoc=frame.contentDocument||frame.contentWindow.document;
      var html=getCleanHtmlFromIframe(iDoc);
      downloadHtmlStr(html, name);
      showToast('✅ 已下载: '+name);
    }catch(e){
      showToast('⚠️ 保存失败: '+e.message);
    }
  });
}

// 内嵌编辑：返回 Markdown 编辑器
function htmlEmbedBackToMd(){
  var embedWrap=document.getElementById('htmlEditorEmbed');
  if(embedWrap) embedWrap.style.display='none';
  var vditorEl=document.getElementById('vditorContainer');
  vditorEl.style.display='';
  showToast('已切换回 Markdown 编辑器');
}

// 内嵌编辑：发布到 GitHub 仓库
function htmlEmbedPublish(){
  var wrap=document.getElementById('htmlEditorEmbed');
  var key=wrap?wrap.dataset.tmplKey:'document';
  var tmplName=htmlTemplateNames[key]||key;
  var defaultName=tmplName.replace(/\s+/g,'-');

  // 创建发布弹窗
  var overlay=document.createElement('div');
  overlay.id='htmplPublishOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';

  var s=getGHSettings();
  var hasToken=!!(s&&s.token);

  overlay.innerHTML=
    '<div style="background:#1a1d2b;border:1px solid #333657;border-radius:16px;padding:28px 32px;min-width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,.6)">'
      +'<h3 style="font-size:18px;color:#e8eaed;margin:0 0 16px">🚀 发布 HTML 文档到仓库</h3>'
      +(hasToken?'':'<div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);border-radius:10px;padding:12px 16px;margin-bottom:16px"><p style="color:#f87171;font-size:13px;margin:0">⚠️ 尚未配置 GitHub 密钥，请先在「⚙️ 设置」中配置后再发布</p></div>')
      +'<div style="display:flex;flex-direction:column;gap:12px">'
        +'<div><label style="color:#8b8fa3;font-size:12px;display:block;margin-bottom:4px">文件名</label>'
        +'<input type="text" id="htmplPubName" value="'+defaultName+'" placeholder="文件名（无需 .html 后缀）" style="width:100%;padding:10px 14px;background:#141620;border:1px solid #333657;border-radius:10px;color:#e8eaed;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box"></div>'
        +'<div><label style="color:#8b8fa3;font-size:12px;display:block;margin-bottom:4px">所属分类</label>'
        +'<select id="htmplPubCat" style="width:100%;padding:10px 14px;background:#141620;border:1px solid #333657;border-radius:10px;color:#e8eaed;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;cursor:pointer">'
          +getCategoryOptionsHtml()
        +'</select></div>'
        +'<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px"><input type="checkbox" id="htmplPubSidebar" checked style="accent-color:#6c8cff"><span style="color:#8b8fa3;font-size:13px">同时在侧边栏注册文档条目</span></label>'
      +'</div>'
      +'<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">'
        +'<button id="htmplPubCancelBtn" style="padding:8px 16px;border-radius:10px;font-size:13px;cursor:pointer;border:1px solid #333657;background:transparent;color:#8b8fa3;font-family:inherit">取消</button>'
        +'<button id="htmplPubConfirmBtn" style="padding:8px 20px;border-radius:10px;font-size:13px;cursor:pointer;border:none;background:linear-gradient(135deg,#6c8cff,#a78bfa);color:#fff;font-family:inherit;font-weight:600"'+(hasToken?'':' disabled style="padding:8px 20px;border-radius:10px;font-size:13px;cursor:not-allowed;border:none;background:#333;color:#666;font-family:inherit;font-weight:600"')+'>🚀 确认发布</button>'
      +'</div>'
    +'</div>';
  document.body.appendChild(overlay);

  setTimeout(function(){var inp=document.getElementById('htmplPubName');if(inp){inp.focus();inp.select();}},100);

  document.getElementById('htmplPubCancelBtn').onclick=function(){ overlay.remove(); };
  document.getElementById('htmplPubConfirmBtn').onclick=function(){ doHtmlEmbedPublish(overlay); };
  overlay.addEventListener('keydown',function(e){
    if(e.key==='Escape') overlay.remove();
    if(e.key==='Enter'&&hasToken) doHtmlEmbedPublish(overlay);
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay) overlay.remove();});
}

async function doHtmlEmbedPublish(overlay){
  var nameEl=document.getElementById('htmplPubName');
  var name=nameEl?nameEl.value.trim():'';
  if(!name){showToast('⚠️ 请输入文件名');return;}
  if(!name.endsWith('.html')) name+='.html';

  var catEl=document.getElementById('htmplPubCat');
  var catId=catEl?catEl.value:'mod-project';
  var catName=catEl?catEl.options[catEl.selectedIndex].text:'项目管理与排期';
  var updateSidebar=document.getElementById('htmplPubSidebar').checked;

  var confirmBtn=document.getElementById('htmplPubConfirmBtn');
  confirmBtn.textContent='⏳ 发布中...';confirmBtn.disabled=true;

  var frame=document.getElementById('htmlEmbedFrame');
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    var html=getCleanHtmlFromIframe(iDoc);

    var s=getGHSettings();
    var repo=s.repo||'diedie23/Game-Knowledge-Base';
    var branch=s.branch||'main';
    var filePath='docs/knowledge-base/'+name;
    var base='https://api.github.com/repos/'+repo+'/contents/';
    var headers={'Authorization':'token '+s.token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};

    var body={message:'docs: 新增 HTML 文档 '+name,content:btoa(unescape(encodeURIComponent(html))),branch:branch};
    try{
      var exist=await fetch(base+filePath+'?ref='+branch,{headers:headers});
      if(exist.ok){var ed=await exist.json();body.sha=ed.sha;body.message='docs: 更新 HTML 文档 '+name;}
    }catch(e){}

    var res=await fetch(base+filePath,{method:'PUT',headers:headers,body:JSON.stringify(body)});
    if(!res.ok){
      var err=await res.json();
      throw new Error(err.message||'发布失败');
    }

    // 更新 sidebar.json
    if(updateSidebar){
      try{
        var sbRes=await fetch(base+'docs/sidebar.json?ref='+branch,{headers:headers});
        if(sbRes.ok){
          var sbData=await sbRes.json();
          var sbContent=JSON.parse(decodeURIComponent(escape(atob(sbData.content.replace(/\n/g,'')))));
          var cat=sbContent.categories.find(function(c){return c.id===catId;});
          if(cat){
            var docGroup=cat.groups.find(function(g){return g.name==='文档';});
            if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
            var docId=name.replace(/\.html$/,'').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
            var titleName=name.replace(/\.html$/,'');
            if(!docGroup.items.find(function(i){return i.id===docId;})){
              docGroup.items.push({id:docId,icon:'📝',title:titleName,type:'iframe',file:'knowledge-base/'+name,badge:'笔记',craft:'管理'});
              var sbBody={message:'docs: 更新菜单 - 添加 '+titleName,content:btoa(unescape(encodeURIComponent(JSON.stringify(sbContent,null,2)))),sha:sbData.sha,branch:branch};
              await fetch(base+'docs/sidebar.json',{method:'PUT',headers:headers,body:JSON.stringify(sbBody)});
            }
          }
        }
      }catch(e){console.log('sidebar update skipped:',e);}
    }

    overlay.remove();
    showToast('🎉 发布成功！文件已上传到 knowledge-base/'+name);

    // 刷新侧边栏
    if(updateSidebar&&sidebarData){
      var cat=sidebarData.categories.find(function(c){return c.id===catId;});
      if(cat){
        var docGroup=cat.groups.find(function(g){return g.name==='文档';});
        if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
        var docId=name.replace(/\.html$/,'').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
        var titleName=name.replace(/\.html$/,'');
        if(!docGroup.items.find(function(i){return i.id===docId;})){
          docGroup.items.push({id:docId,icon:'📝',title:titleName,type:'iframe',file:'knowledge-base/'+name,badge:'笔记',craft:'管理'});
        }
        buildSidebar(sidebarData);
      }
    }
  }catch(e){
    showToast('❌ 发布失败: '+e.message);
  }finally{
    confirmBtn.textContent='🚀 确认发布';confirmBtn.disabled=false;
  }
}

// 通用：另存为弹窗
function _showSaveAsDialog(defaultName, onConfirm){
  var overlay=document.createElement('div');
  overlay.id='htmplSaveAsOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML=
    '<div style="background:#1a1d2b;border:1px solid #333657;border-radius:16px;padding:28px 32px;min-width:420px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,.6)">'
      +'<h3 style="font-size:18px;color:#e8eaed;margin:0 0 4px">📄 另存为新文档</h3>'
      +'<p style="font-size:13px;color:#8b8fa3;margin:8px 0 16px">输入文件名（无需 .html 后缀），保存后文件将下载到本地</p>'
      +'<input type="text" id="htmplNewName" value="'+defaultName+'" placeholder="例如：11月项目复盘" style="width:100%;padding:10px 14px;background:#141620;border:1px solid #333657;border-radius:10px;color:#e8eaed;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box">'
      +'<p style="font-size:12px;color:#6c8cff;margin:12px 0 0;line-height:1.6">💡 建议保存后将文件放入 <code style="background:rgba(108,140,255,.12);padding:2px 6px;border-radius:4px">knowledge-base</code> 目录</p>'
      +'<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">'
        +'<button id="htmplSaveAsCancelBtn" style="padding:8px 16px;border-radius:10px;font-size:13px;cursor:pointer;border:1px solid #333657;background:transparent;color:#8b8fa3;font-family:inherit">取消</button>'
        +'<button id="htmplSaveAsConfirmBtn" style="padding:8px 16px;border-radius:10px;font-size:13px;cursor:pointer;border:none;background:#6c8cff;color:#fff;font-family:inherit;font-weight:500">💾 确认保存</button>'
      +'</div>'
    +'</div>';
  document.body.appendChild(overlay);

  var cancelBtn=document.getElementById('htmplSaveAsCancelBtn');
  var confirmBtn=document.getElementById('htmplSaveAsConfirmBtn');
  cancelBtn.onclick=function(){ overlay.remove(); };
  confirmBtn.onclick=function(){
    var nameEl=document.getElementById('htmplNewName');
    var name=nameEl?nameEl.value.trim():'';
    if(!name){showToast('⚠️ 请输入文件名');return;}
    if(!name.endsWith('.html')) name+='.html';
    overlay.remove();
    onConfirm(name);
  };

  setTimeout(function(){
    var inp=document.getElementById('htmplNewName');
    if(inp){inp.focus();inp.select();}
  },100);
  overlay.addEventListener('keydown',function(e){
    if(e.key==='Escape') overlay.remove();
    if(e.key==='Enter') confirmBtn.click();
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay) overlay.remove();});
}

// 从首页/侧边栏打开 HTML 模板时：用全页 iframe 编辑
function openHtmlTemplateEditor(key, htmlContent){
  // 关闭创作模式（如果在创作模式下）
  closeEditor();

  // 创建 blob URL 用于 iframe 加载
  var blob=new Blob([htmlContent],{type:'text/html;charset=utf-8'});
  var blobUrl=URL.createObjectURL(blob);

  var frame=document.getElementById('contentFrame');
  var scroll=document.getElementById('contentScroll');
  var home=document.getElementById('pageHome');

  // 隐藏其他内容
  home.style.display='none';
  scroll.style.display='none';
  document.querySelectorAll('.doc-page').forEach(function(p){p.style.display='none';});
  document.getElementById('page-tool').style.display='none';

  // 构建模板编辑器工具栏
  var tmplName=htmlTemplateNames[key]||key;
  var toolbar=document.getElementById('iframeToolbar');
  toolbar.innerHTML=
    '<div class="ift-title"><span class="ift-icon">📝</span>编辑模板：'+tmplName+'</div>'
    +'<div class="htmpl-toolbar-actions">'
      +'<button class="ift-btn htmpl-btn-edit" onclick="htmlTmplEnterEdit()" title="进入编辑模式">✏️ 开始编辑</button>'
      +'<button class="ift-btn htmpl-btn-save" onclick="htmlTmplSave()" style="display:none" title="保存下载">💾 保存下载</button>'
      +'<button class="ift-btn htmpl-btn-saveas" onclick="htmlTmplSaveAs()" style="display:none" title="另存为">📄 另存为</button>'
      +'<button class="ift-btn htmpl-btn-publish" onclick="htmlTmplPublish()" style="display:none" title="直接发布到 GitHub 仓库">🚀 发布到仓库</button>'
      +'<button class="ift-btn htmpl-btn-exit" onclick="htmlTmplExitEdit()" style="display:none" title="退出编辑">✖ 退出编辑</button>'
      +'<span class="htmpl-divider" style="display:none"></span>'
      +'<button class="ift-btn htmpl-btn-guide" onclick="htmlTmplShowGuide()" title="保存引导">❓ 如何上线</button>'
    +'</div>';
  toolbar.style.display='flex';
  toolbar.dataset.tmplKey=key;

  // 显示 iframe
  frame.style.display='block';
  frame.src=blobUrl;
  frame.onload=function(){
    URL.revokeObjectURL(blobUrl);
    // 在 iframe 中禁用 editor-kit 的自带按钮（父页面统一管理）
    try{
      var iDoc=frame.contentDocument||frame.contentWindow.document;
      var ekBtn=iDoc.querySelector('.ek-enter-btn');
      if(ekBtn) ekBtn.style.display='none';
    }catch(e){}
  };
}

// 进入编辑模式
function htmlTmplEnterEdit(){
  var frame=document.getElementById('contentFrame');
  try{
    var win=frame.contentWindow;
    if(win.enterEdit) win.enterEdit();
    // 隐藏 iframe 内部的 editor-kit 工具栏（由父页面工具栏统一控制）
    var iDoc=frame.contentDocument||win.document;
    var ekToolbar=iDoc.querySelector('.ek-toolbar');
    if(ekToolbar) ekToolbar.style.display='none';
    var ekBadge=iDoc.querySelector('.ek-editing-badge');
    if(ekBadge) ekBadge.style.display='none';
  }catch(e){
    console.log('Cannot enter edit:',e);
    showToast('⚠️ 无法进入编辑模式','warning');
    return;
  }
  // 切换工具栏按钮
  var tb=document.getElementById('iframeToolbar');
  hideBtn(tb.querySelector('.htmpl-btn-edit'));
  showBtn(tb.querySelector('.htmpl-btn-save'));
  showBtn(tb.querySelector('.htmpl-btn-saveas'));
  var pubBtn=tb.querySelector('.htmpl-btn-publish');
  if(pubBtn) showBtn(pubBtn);
  showBtn(tb.querySelector('.htmpl-btn-exit'));
  showBtn(tb.querySelector('.htmpl-divider'));
  showToast('✅ 已进入编辑模式，直接点击内容修改');
}

// 退出编辑模式
function htmlTmplExitEdit(){
  var frame=document.getElementById('contentFrame');
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    iDoc.body.classList.remove('ek-editing');
    iDoc.body.removeAttribute('contenteditable');
    iDoc.querySelectorAll('[contenteditable]').forEach(function(el){el.removeAttribute('contenteditable');});
    iDoc.querySelectorAll('.ek-img-editable').forEach(function(el){el.classList.remove('ek-img-editable');});
    iDoc.querySelectorAll('img').forEach(function(img){
      img.style.cursor='';
      img.style.outline='';
    });
  }catch(e){}
  // 切换工具栏按钮
  var tb=document.getElementById('iframeToolbar');
  showBtn(tb.querySelector('.htmpl-btn-edit'));
  hideBtn(tb.querySelector('.htmpl-btn-save'));
  hideBtn(tb.querySelector('.htmpl-btn-saveas'));
  var pubBtn=tb.querySelector('.htmpl-btn-publish');
  if(pubBtn) hideBtn(pubBtn);
  hideBtn(tb.querySelector('.htmpl-btn-exit'));
  hideBtn(tb.querySelector('.htmpl-divider'));
  showToast('已退出编辑模式');
}

// 保存（覆盖下载）
function htmlTmplSave(){
  var frame=document.getElementById('contentFrame');
  var key=document.getElementById('iframeToolbar').dataset.tmplKey||'document';
  // 优先使用 sidebar.json 中的元数据获取文件名
  var meta=getItemMeta(key);
  var tmplName=(meta&&meta.title)?meta.title:(htmlTemplateNames[key]||key);
  var fileName=tmplName.replace(/\s+/g,'-')+'.html';
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    // 获取干净的 HTML
    var html=getCleanHtmlFromIframe(iDoc);
    downloadHtmlStr(html, fileName);
    showToast('✅ 已下载: '+fileName);
  }catch(e){
    showToast('⚠️ 保存失败: '+e.message,'error');
  }
}

// 另存为（全页 iframe 版）
function htmlTmplSaveAs(){
  var key=document.getElementById('iframeToolbar').dataset.tmplKey||'document';
  var tmplName=htmlTemplateNames[key]||key;
  var defaultName=tmplName.replace(/\s+/g,'-');
  _showSaveAsDialog(defaultName, function(name){
    var frame=document.getElementById('contentFrame');
    try{
      var iDoc=frame.contentDocument||frame.contentWindow.document;
      var html=getCleanHtmlFromIframe(iDoc);
      downloadHtmlStr(html, name);
      showToast('✅ 已下载: '+name);
    }catch(e){
      showToast('⚠️ 保存失败: '+e.message);
    }
  });
}

// 发布到仓库（全页 iframe 版）— 增强：自动识别当前文档信息
function htmlTmplPublish(){
  var key=document.getElementById('iframeToolbar').dataset.tmplKey||'document';
  var meta=getItemMeta(key);
  var reg=pageRegistry[key]||{};
  var tmplName=(meta&&meta.title)?meta.title:(htmlTemplateNames[key]||key);
  var defaultName=tmplName.replace(/\s+/g,'-');
  // 自动识别当前文档所属分类
  var autoCatId='mod-project';
  if(reg.catId) autoCatId=reg.catId;

  var overlay=document.createElement('div');
  overlay.id='htmplPublishOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';

  var s=getGHSettings();
  var hasToken=!!(s&&s.token);

  overlay.innerHTML=
    '<div style="background:#1a1d2b;border:1px solid #333657;border-radius:16px;padding:28px 32px;min-width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,.6)">'
      +'<h3 style="font-size:18px;color:#e8eaed;margin:0 0 16px">🚀 发布 HTML 文档到仓库</h3>'
      +(hasToken?'':'<div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);border-radius:10px;padding:12px 16px;margin-bottom:16px"><p style="color:#f87171;font-size:13px;margin:0">⚠️ 尚未配置 GitHub 密钥，请先在「⚙️ 设置」中配置后再发布</p></div>')
      +'<div style="display:flex;flex-direction:column;gap:12px">'
        +'<div><label style="color:#8b8fa3;font-size:12px;display:block;margin-bottom:4px">文件名</label>'
        +'<input type="text" id="htmplPubName" value="'+defaultName+'" placeholder="文件名" style="width:100%;padding:10px 14px;background:#141620;border:1px solid #333657;border-radius:10px;color:#e8eaed;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box"></div>'
        +'<div><label style="color:#8b8fa3;font-size:12px;display:block;margin-bottom:4px">所属分类</label>'
        +'<select id="htmplPubCat" style="width:100%;padding:10px 14px;background:#141620;border:1px solid #333657;border-radius:10px;color:#e8eaed;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;cursor:pointer">'
          +getCategoryOptionsHtml()
        +'</select></div>'
        +'<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px"><input type="checkbox" id="htmplPubSidebar" checked style="accent-color:#6c8cff"><span style="color:#8b8fa3;font-size:13px">同时在侧边栏注册文档条目</span></label>'
      +'</div>'
      +'<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">'
        +'<button id="htmplPubCancelBtn" style="padding:8px 16px;border-radius:10px;font-size:13px;cursor:pointer;border:1px solid #333657;background:transparent;color:#8b8fa3;font-family:inherit">取消</button>'
        +'<button id="htmplPubConfirmBtn" style="padding:8px 20px;border-radius:10px;font-size:13px;cursor:pointer;border:none;background:linear-gradient(135deg,#6c8cff,#a78bfa);color:#fff;font-family:inherit;font-weight:600"'+(hasToken?'':' disabled')+'>🚀 确认发布</button>'
      +'</div>'
    +'</div>';
  document.body.appendChild(overlay);
  setTimeout(function(){
    var inp=document.getElementById('htmplPubName');if(inp){inp.focus();inp.select();}
    // 自动选中当前文档所属分类
    var catSel=document.getElementById('htmplPubCat');
    if(catSel&&autoCatId) catSel.value=autoCatId;
  },100);

  document.getElementById('htmplPubCancelBtn').onclick=function(){ overlay.remove(); };
  document.getElementById('htmplPubConfirmBtn').onclick=function(){ doHtmlTmplPublish(overlay); };
  overlay.addEventListener('keydown',function(e){
    if(e.key==='Escape') overlay.remove();
    if(e.key==='Enter'&&hasToken) doHtmlTmplPublish(overlay);
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay) overlay.remove();});
}

async function doHtmlTmplPublish(overlay){
  var nameEl=document.getElementById('htmplPubName');
  var name=nameEl?nameEl.value.trim():'';
  if(!name){showToast('⚠️ 请输入文件名');return;}
  if(!name.endsWith('.html')) name+='.html';

  var catEl=document.getElementById('htmplPubCat');
  var catId=catEl?catEl.value:'mod-project';
  var updateSidebar=document.getElementById('htmplPubSidebar').checked;

  var confirmBtn=document.getElementById('htmplPubConfirmBtn');
  confirmBtn.textContent='⏳ 发布中...';confirmBtn.disabled=true;

  var frame=document.getElementById('contentFrame');
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    var html=getCleanHtmlFromIframe(iDoc);

    var s=getGHSettings();
    var repo=s.repo||'diedie23/Game-Knowledge-Base';
    var branch=s.branch||'main';
    var filePath='docs/knowledge-base/'+name;
    var base='https://api.github.com/repos/'+repo+'/contents/';
    var headers={'Authorization':'token '+s.token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};

    var body={message:'docs: 新增 HTML 文档 '+name,content:btoa(unescape(encodeURIComponent(html))),branch:branch};
    try{
      var exist=await fetch(base+filePath+'?ref='+branch,{headers:headers});
      if(exist.ok){var ed=await exist.json();body.sha=ed.sha;body.message='docs: 更新 HTML 文档 '+name;}
    }catch(e){}

    var res=await fetch(base+filePath,{method:'PUT',headers:headers,body:JSON.stringify(body)});
    if(!res.ok){var err=await res.json();throw new Error(err.message||'发布失败');}

    if(updateSidebar){
      try{
        var sbRes=await fetch(base+'docs/sidebar.json?ref='+branch,{headers:headers});
        if(sbRes.ok){
          var sbData=await sbRes.json();
          var sbContent=JSON.parse(decodeURIComponent(escape(atob(sbData.content.replace(/\n/g,'')))));
          var cat=sbContent.categories.find(function(c){return c.id===catId;});
          if(cat){
            var docGroup=cat.groups.find(function(g){return g.name==='文档';});
            if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
            var docId=name.replace(/\.html$/,'').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
            var titleName=name.replace(/\.html$/,'');
            if(!docGroup.items.find(function(i){return i.id===docId;})){
              docGroup.items.push({id:docId,icon:'📝',title:titleName,type:'iframe',file:'knowledge-base/'+name,badge:'笔记',craft:'管理'});
              var sbBody={message:'docs: 更新菜单 - 添加 '+titleName,content:btoa(unescape(encodeURIComponent(JSON.stringify(sbContent,null,2)))),sha:sbData.sha,branch:branch};
              await fetch(base+'docs/sidebar.json',{method:'PUT',headers:headers,body:JSON.stringify(sbBody)});
            }
          }
        }
      }catch(e){console.log('sidebar update skipped:',e);}
    }

    overlay.remove();
    showToast('🎉 发布成功！');
    if(updateSidebar&&sidebarData){
      var cat=sidebarData.categories.find(function(c){return c.id===catId;});
      if(cat){
        var docGroup=cat.groups.find(function(g){return g.name==='文档';});
        if(!docGroup){docGroup={name:'文档',icon:'📄',items:[]};cat.groups.unshift(docGroup);}
        var docId=name.replace(/\.html$/,'').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
        var titleName=name.replace(/\.html$/,'');
        if(!docGroup.items.find(function(i){return i.id===docId;})){
          docGroup.items.push({id:docId,icon:'📝',title:titleName,type:'iframe',file:'knowledge-base/'+name,badge:'笔记',craft:'管理'});
        }
        buildSidebar(sidebarData);
      }
    }
  }catch(e){
    showToast('❌ 发布失败: '+e.message,'error');
  }finally{
    confirmBtn.textContent='🚀 确认发布';confirmBtn.disabled=false;
  }
}

// 从 iframe 获取干净的 HTML（移除编辑器 UI 元素）
function getCleanHtmlFromIframe(iDoc){
  // 临时移除 contenteditable 属性
  iDoc.querySelectorAll('[contenteditable]').forEach(function(el){el.removeAttribute('contenteditable');});
  iDoc.body.classList.remove('ek-editing');
  iDoc.querySelectorAll('.ek-img-editable').forEach(function(el){el.classList.remove('ek-img-editable');});

  var html='<!DOCTYPE html>\n'+iDoc.documentElement.outerHTML;
  // 清理 editor-kit 相关节点
  html=html.replace(/<script[^>]*editor-kit\.js[^>]*><\/script>\s*/gi,'');
  html=html.replace(/<div[^>]*class="[^"]*ek-ui[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?:<\/div>\s*)*/gi,'');
  html=html.replace(/<div[^>]*id="ek-toast"[^>]*>[\s\S]*?<\/div>\s*/gi,'');
  html=html.replace(/<style[^>]*id="ek-styles"[^>]*>[\s\S]*?<\/style>\s*/gi,'');
  html=html.replace(/\s*data-ek-[a-z]+="[^"]*"/gi,'');

  // 恢复编辑状态
  iDoc.body.classList.add('ek-editing');
  return html;
}

// 下载 HTML 字符串为文件
function downloadHtmlStr(html, fileName){
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(a.href);},100);
}

// 显示上线引导
function htmlTmplShowGuide(){
  var overlay=document.createElement('div');
  overlay.id='htmplGuideOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML=
    '<div style="background:#1a1d2b;border:1px solid #333657;border-radius:16px;padding:28px 32px;min-width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,.6);max-height:80vh;overflow-y:auto">'
      +'<h3 style="font-size:18px;color:#e8eaed;margin:0 0 16px">📖 模板编辑到上线 — 3步完成</h3>'
      +'<div style="display:flex;flex-direction:column;gap:16px">'
        +'<div style="display:flex;gap:12px;align-items:flex-start">'
          +'<span style="background:rgba(108,140,255,.15);color:#6c8cff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">1</span>'
          +'<div><p style="margin:0;color:#e8eaed;font-size:14px;font-weight:600">编辑内容</p><p style="margin:4px 0 0;color:#8b8fa3;font-size:13px;line-height:1.6">点击「✏️ 开始编辑」→ 直接点击文字修改 → 双击图片可替换</p></div>'
        +'</div>'
        +'<div style="display:flex;gap:12px;align-items:flex-start">'
          +'<span style="background:rgba(74,222,128,.15);color:#4ade80;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">2</span>'
          +'<div><p style="margin:0;color:#e8eaed;font-size:14px;font-weight:600">保存文件</p><p style="margin:4px 0 0;color:#8b8fa3;font-size:13px;line-height:1.6">点击「💾 保存下载」或「📄 另存为」→ 将 .html 文件放入仓库的 <code style="background:rgba(108,140,255,.12);padding:2px 6px;border-radius:4px;color:#6c8cff">docs/knowledge-base/</code> 目录</p></div>'
        +'</div>'
        +'<div style="display:flex;gap:12px;align-items:flex-start">'
          +'<span style="background:rgba(251,191,36,.15);color:#fbbf24;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">3</span>'
          +'<div><p style="margin:0;color:#e8eaed;font-size:14px;font-weight:600">注册上线</p><p style="margin:4px 0 0;color:#8b8fa3;font-size:13px;line-height:1.6">在 <code style="background:rgba(108,140,255,.12);padding:2px 6px;border-radius:4px;color:#6c8cff">sidebar.json</code> 中添加条目 → git push 即可上线。示例：</p>'
            +'<pre style="background:#141620;border:1px solid #333657;border-radius:8px;padding:12px 16px;margin:8px 0 0;font-size:12px;color:#a8b0c0;line-height:1.7;overflow-x:auto;font-family:Consolas,monospace">{\n  "id": "my-postmortem-1",\n  "icon": "🔄",\n  "title": "XX项目复盘报告",\n  "type": "iframe",\n  "file": "knowledge-base/my-postmortem-1.html",\n  "badge": "笔记",\n  "craft": "管理"\n}</pre>'
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div style="display:flex;justify-content:flex-end;margin-top:20px">'
        +'<button onclick="document.getElementById(\'htmplGuideOverlay\').remove()" style="padding:8px 20px;border-radius:10px;font-size:13px;cursor:pointer;border:none;background:#6c8cff;color:#fff;font-family:inherit;font-weight:500">知道了</button>'
      +'</div>'
    +'</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('keydown',function(e){if(e.key==='Escape') overlay.remove();});
  overlay.addEventListener('click',function(e){if(e.target===overlay) overlay.remove();});
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

// 从顶部导航栏触发 iframe 内 HTML 文档的编辑模式
function enterIframeEditMode(pageId){
  var frame=document.getElementById('contentFrame');
  if(!frame||!frame.contentWindow) return;
  try{
    var iframeDoc=frame.contentDocument||frame.contentWindow.document;
    // editor-kit.js 已将 enterEdit 暴露到 window 上
    if(typeof frame.contentWindow.enterEdit==='function'){
      frame.contentWindow.enterEdit();
    } else {
      // fallback：点击 iframe 内的编辑按钮
      var editBtn=iframeDoc.querySelector('.ek-enter-btn');
      if(editBtn) editBtn.click();
      else showToast('该文档未启用可视化编辑器');
    }
  }catch(e){
    showToast('无法进入编辑模式（跨域限制）');
  }
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
          if(cat.items) cat.items=cat.items.filter(function(i){return i.id!==pageId;});
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
        if(cat.items) cat.items=cat.items.filter(function(i){return i.id!==pageId;});
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
  if(!token){showToast('请粘贴访问密钥','warning');return;}
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
  if(reg.catName) crumbs.push('<span class="bc-sep">›</span><a class="bc-link" onclick="breadcrumbNavCat(\''+reg.catName.replace(/'/g,"\\'")+'\')">'+reg.catName+'</a>');
  if(reg.grpName) crumbs.push('<span class="bc-sep">›</span><a class="bc-link" onclick="breadcrumbNavGrp(\''+reg.grpName.replace(/'/g,"\\'")+'\')">'+reg.grpName+'</a>');

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

// ═══ 角色专属视图系统 ═══
var ROLE_TAG_MAP = {
  'artist': {
    name: '新人美术',
    icon: '🎨',
    color: 'var(--accent)',
    colorBg: 'rgba(108,140,255,.1)',
    tags: ['入职','Onboarding','Checklist','新人','培训','Pipeline','美术流程','2D','3D','管线',
           '资产提交','审核工作流','命名规范','引擎导入','资产交接','命名','分辨率','部件拆分',
           '目录结构','版本管理','资产库','SVN','Perforce']
  },
  'ta': {
    name: 'TA / 程序',
    icon: '🧙‍♂️',
    color: 'var(--green)',
    colorBg: 'rgba(74,222,128,.1)',
    tags: ['性能红线','面数预算','贴图规范','Drawcall','资产预算','命名规范','引擎导入','资产交接',
           'TA','状态机','导出规范','交接','Overdraw','性能优化','Spine','骨骼动画',
           'LOD','模块化','场景','特效','粒子','UMG','引擎直连','UE','Unity','Bridge']
  },
  'pm': {
    name: '外包 PM',
    icon: '💼',
    color: 'var(--orange)',
    colorBg: 'rgba(251,146,60,.1)',
    tags: ['外包','CP评级','验收','结算','避坑','预算','成本管控','审批流','人月','成本核算',
           'ROI','工种系数','人天模型','工作量评估','报价','成本','排期','里程碑','敏捷','Sprint',
           '燃尽图','风险管理','Risk Log','流程管理']
  },
  'qa': {
    name: 'QA / 主美',
    icon: '🔍',
    color: 'var(--cyan)',
    colorBg: 'rgba(34,211,238,.1)',
    tags: ['Bug定级','QA','视觉缺陷','修复时效','版本走查','验收清单','踩坑记录','复盘',
           '经验教训','外包翻车','Post-mortem','5-Why','根因分析','经验沉淀',
           'Troubleshooting','事故复盘','SOP','排雷','质检','效能度量']
  }
};

var activeRoleView = '';

function enterRoleView(roleKey){
  var roleCfg = ROLE_TAG_MAP[roleKey];
  if(!roleCfg || !indexData || !indexData.items) return;

  activeRoleView = roleKey;

  // 1. 匹配文档：tags 中包含任意一个角色关键词即命中（OR 逻辑）
  var matchedItems = indexData.items.filter(function(item){
    if(!item.tags || !item.tags.length) return false;
    return item.tags.some(function(t){
      return roleCfg.tags.some(function(rt){
        return t.indexOf(rt) !== -1 || rt.indexOf(t) !== -1;
      });
    });
  });

  // 2. 按 module 分组
  var grouped = {};
  var moduleOrder = ['project','outsource','craft','collab','toolchain','quality','casestudy'];
  matchedItems.forEach(function(item){
    var mod = item.module || 'project';
    if(!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(item);
  });

  // 3. 渲染文档列表
  var html = '';
  var totalCount = matchedItems.length;
  var moduleConfig = indexData.moduleConfig || {};

  moduleOrder.forEach(function(mod){
    var items = grouped[mod];
    if(!items || !items.length) return;
    var mc = moduleConfig[mod] || { label: mod, icon: '📄', color: 'accent' };
    var ms = MODULE_STYLES['mod-'+mod] || MODULE_STYLES['mod-project'];

    html += '<div class="rv-module">';
    html += '<div class="rv-module-header" style="border-left:3px solid '+ms.highlight+'">';
    html += '<span class="rv-module-icon">'+mc.icon+'</span>';
    html += '<span class="rv-module-title">'+mc.label+'</span>';
    html += '<span class="rv-module-count" style="background:'+ms.bg+';color:'+ms.highlight+'">'+items.length+' 篇</span>';
    html += '</div>';
    html += '<div class="rv-doc-list">';

    items.forEach(function(item){
      var sc = STAGE_COLORS && STAGE_COLORS[item.applicable_stage] ? STAGE_COLORS[item.applicable_stage] : {bg:'rgba(167,139,250,.12)',color:'#a78bfa'};
      var hotBadge = item.is_hot ? '<span class="rv-hot">🔥 热门</span>' : '';
      var priorityClass = item.priority === 'high' ? 'rv-priority-high' : (item.priority === 'medium' ? 'rv-priority-medium' : 'rv-priority-low');

      html += '<div class="rv-doc-item '+priorityClass+'" onclick="exitRoleView();navigate(\''+item.id+'\')">';
      html += '<div class="rv-doc-icon">'+item.icon+'</div>';
      html += '<div class="rv-doc-body">';
      html += '<div class="rv-doc-title">'+item.title+hotBadge+'</div>';
      html += '<div class="rv-doc-desc">'+item.desc+'</div>';
      html += '<div class="rv-doc-meta">';
      html += '<span class="rv-doc-stage" style="background:'+sc.bg+';color:'+sc.color+'">'+item.applicable_stage+'</span>';
      if(item.craft){
        var cc = CRAFT_COLORS[item.craft] || CRAFT_COLORS['通用'];
        html += '<span class="rv-doc-craft" style="background:'+cc.bg+';color:'+cc.color+'">'+item.craft+'</span>';
      }
      html += '<span class="rv-doc-owner">👤 '+item.owner+'</span>';
      html += '<span class="rv-doc-date">📅 '+item.last_updated+'</span>';
      html += '</div>';
      // 显示匹配到的标签
      html += '<div class="rv-doc-tags">';
      item.tags.forEach(function(tag){
        var isMatch = roleCfg.tags.some(function(rt){ return tag.indexOf(rt)!==-1 || rt.indexOf(tag)!==-1; });
        html += '<span class="rv-tag'+(isMatch?' rv-tag-match':'')+'" onclick="event.stopPropagation();filterByTag(\''+tag+'\')">'+tag+'</span>';
      });
      html += '</div>';
      html += '</div>';
      html += '<div class="rv-doc-arrow">→</div>';
      html += '</div>';
    });

    html += '</div></div>';
  });

  // 4. 更新 DOM
  var viewBar = document.getElementById('roleViewBar');
  var viewContent = document.getElementById('roleViewContent');
  var viewName = document.getElementById('roleViewName');
  var viewIcon = document.getElementById('roleViewIcon');
  var viewCount = document.getElementById('roleViewCount');
  if(!viewBar || !viewContent) return;

  viewName.textContent = roleCfg.name + ' 专属模式';
  if(viewIcon) viewIcon.textContent = roleCfg.icon;
  if(viewCount) viewCount.textContent = totalCount;
  viewBar.style.display = 'flex';
  viewBar.style.setProperty('--rv-accent', roleCfg.color);
  viewContent.innerHTML = html;
  viewContent.style.display = 'block';

  // 4.5 显示面包屑导航
  var bcBar = document.getElementById('breadcrumbBar');
  var bc = document.getElementById('breadcrumb');
  if(bcBar && bc){
    bc.innerHTML = '<a class="bc-link" onclick="exitRoleView()">🏠 首页</a>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-text">🧭 角色探索</span>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-current">' + roleCfg.icon + ' ' + roleCfg.name + ' 专属视图</span>';
    bcBar.style.display = 'block';
  }

  // 5. 隐藏首页其他模块（保留角色探索区域）
  var hideIds = ['readmeOverview','mermaidSection','hotSection','dashboardSection'];
  hideIds.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  // 隐藏 5 大模块板块
  var modSections = document.querySelectorAll('#pageHome .module-section');
  modSections.forEach(function(s){ s.style.display = 'none'; });
  // 隐藏统计栏
  var statsBar = document.querySelector('#pageHome .stats-bar');
  if(statsBar) statsBar.style.display = 'none';

  // 6. 滚动到视图顶部
  var scrollEl = document.getElementById('contentScroll');
  if(scrollEl) scrollEl.scrollTo({top:0,behavior:'smooth'});

  showToast(roleCfg.icon+' 已进入「'+roleCfg.name+'」专属视图 — 共 '+totalCount+' 篇相关文档');
}

function exitRoleView(){
  if(!activeRoleView) return;
  activeRoleView = '';

  // 隐藏面包屑导航
  var bcBar = document.getElementById('breadcrumbBar');
  if(bcBar) bcBar.style.display = 'none';

  // 隐藏角色视图
  var viewBar = document.getElementById('roleViewBar');
  var viewContent = document.getElementById('roleViewContent');
  if(viewBar) viewBar.style.display = 'none';
  if(viewContent){ viewContent.style.display = 'none'; viewContent.innerHTML = ''; }

  // 恢复首页所有模块
  var showIds = ['readmeOverview','mermaidSection','hotSection','dashboardSection'];
  showIds.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.style.display = '';
  });
  var modSections = document.querySelectorAll('#pageHome .module-section');
  modSections.forEach(function(s){ s.style.display = ''; });
  var statsBar = document.querySelector('#pageHome .stats-bar');
  if(statsBar) statsBar.style.display = '';

  // 滚动到角色探索区域
  var roleExplore = document.getElementById('roleExplore');
  if(roleExplore) roleExplore.scrollIntoView({behavior:'smooth',block:'start'});

  showToast('🏠 已返回首页');
}

// ═══ 标签过滤系统 ═══
function filterByTag(tagName){
  _forceRenderAllSections();  // P3-L1: 确保所有卡片已渲染
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
  _forceRenderAllSections();  // P3-L1: 确保所有卡片已渲染
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
  // 板块一：📋 项目管理与排期
  'grid-project-pipeline':   { module:'project', ids:['game-art-pipeline'] },
  'grid-project-schedule':   { module:'project', ids:['art-scheduling','progress-visualization'] },
  'grid-project-req':        { module:'project', ids:['art-vs-planner-req','jira-tapd-automation'] },
  'grid-project-version':    { module:'project', ids:['svn-perforce-structure','asset-submit-review','deprecated-asset-cleanup'] },
  'grid-project-decision':   { module:'project', ids:['outsource-vs-inhouse-decision','delay-response-decision'] },
  // 板块二：📦 外包全链路管理
  'grid-outsource-eval':     { module:'outsource', ids:['cp-outsource','cp-management'] },
  'grid-outsource-workload': { module:'outsource', ids:['outsource-workload-model'] },
  'grid-outsource-budget':   { module:'outsource', ids:['budget-apply','cost-standard'] },
  'grid-outsource-supplier': { module:'outsource', ids:['supplier-ecosystem'] },
  // 板块三：🎨 美术工艺与规范
  'grid-craft-base':         { module:'craft', ids:['char-naming-redline'] },
  'grid-craft-char-2d':      { module:'craft', ids:['char-color-swap-pipeline','spine-animation-pipeline'] },
  'grid-craft-char-3d':      { module:'craft', ids:['char-3d-topo-pbr','anim-state-handoff'] },
  'grid-craft-ui':           { module:'craft', ids:['ui-slice-naming','ui-9slice-color','ui-layout','ui-umg-tips'] },
  'grid-craft-scene':        { module:'craft', ids:['scene-lod-spec'] },
  'grid-craft-vfx':          { module:'craft', ids:['vfx-perf-spec'] },
  'grid-craft-ugc':          { module:'craft', ids:['char-ugc-parts-safety','ugc-2d-export-spec'] },
  'grid-craft-aigc':         { module:'craft', ids:['aigc-production-spec'] },
  // 板块四：🤝 跨部门协同与交付
  'grid-collab-ta':          { module:'collab', ids:['art-vs-ta-naming','art-vs-ta-perfbudget','perf-redline-glossary'] },
  'grid-collab-qa':          { module:'collab', ids:['art-vs-qa-buggrade','art-vs-qa-checklist'] },
  'grid-collab-pain':        { module:'collab', ids:['cross-dept-collab','cross-dept-communication-tips','art-vs-planner-template'] },
  // 板块五：🛠️ 工具链与自动化
  'grid-toolchain-overview': { module:'toolchain', ids:['art-tools-guide'] },
  'grid-toolchain-spec':     { module:'toolchain', ids:['auto-mask-spec','spine-split-spec'] },
  'grid-toolchain-check':    { module:'toolchain', ids:['naming-check-tool'] },
  'grid-toolchain-art':      { module:'toolchain', ids:['auto-mask-v6','mask-tool','spine-split','mask-core-algorithms','color-swap-tool','channel-packer'] },
  'grid-toolchain-desktop':  { module:'toolchain', ids:['auto-mask-v6-desktop','image-skew-corrector','game-resource-toolkit','engine-bridge'] },
  // 板块六：🛡️ 质量、风险与团队
  'grid-quality-risk':       { module:'quality', ids:['risk-log'] },
  'grid-quality-metrics':    { module:'quality', ids:['art-efficiency-system'] },
  'grid-quality-security':   { module:'quality', ids:['asset-security-handover'] },
  'grid-quality-team':       { module:'quality', ids:['onboarding-guide','permission-nav'] },
  // 板块一（补充）：个人成长
  'grid-project-growth':     { module:'quality', ids:['personal-growth-roadmap'] },
  // 板块七：🔥 真实案例库
  'grid-casestudy-cases':    { module:'casestudy', ids:['project-pitfall-log','accident-troubleshoot','postmortem-template'] },
  // 板块八：📌 我的项目笔记
  'grid-mynotes-templates':  { module:'mynotes', ids:['tmpl-project-postmortem','tmpl-weekly-report','tmpl-decision-record','tmpl-meeting-notes'] },
  'grid-mynotes-quick':      { module:'mynotes', ids:['editor-guide'] }
};

// 阶段→背景色配置
var STAGE_COLORS = {
  '预研期': { color:'#60a5fa', bg:'rgba(96,165,250,.12)' },
  '量产期': { color:'#fb923c', bg:'rgba(251,146,60,.12)' },
  '测试期': { color:'#4ade80', bg:'rgba(74,222,128,.12)' },
  '全阶段': { color:'#a78bfa', bg:'rgba(167,139,250,.12)' }
};

// 优先级→带文字微型标签（升级版：直观语义标签替代纯色圆点）
var PRIORITY_ICONS = { 'high':'🔴', 'medium':'🟡', 'low':'🟢' };
var PRIORITY_LABELS = { 'high':'核心必读', 'medium':'推荐阅读', 'low':'参考了解' };
var PRIORITY_LABEL_COLORS = { 'high':'rgba(248,113,113,.15)', 'medium':'rgba(251,191,36,.15)', 'low':'rgba(74,222,128,.15)' };
var PRIORITY_LABEL_TEXT = { 'high':'#f87171', 'medium':'#fbbf24', 'low':'#4ade80' };

// ═══ P3-L1: IntersectionObserver 懒加载 ═══
var _homeCardsObserver=null;
var _homeCardsItemMap=null;

function renderHomeCards(){
  if(!indexData||!indexData.items) return;
  // 构建 itemMap 供懒加载回调使用
  _homeCardsItemMap={};
  indexData.items.forEach(function(item){ _homeCardsItemMap[item.id]=item; });

  var sections=document.querySelectorAll('.module-section');

  // 不支持 IntersectionObserver 时回退到全量渲染
  if(typeof IntersectionObserver==='undefined'){
    sections.forEach(function(sec){ _renderSectionCards(sec); });
    return;
  }

  // 销毁旧 observer（如有）
  if(_homeCardsObserver){ _homeCardsObserver.disconnect(); _homeCardsObserver=null; }

  _homeCardsObserver=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting) return;
      var sec=entry.target;
      if(sec.dataset.lazyRendered) return;  // 已渲染过则跳过
      sec.dataset.lazyRendered='1';
      _renderSectionCards(sec);
      _homeCardsObserver.unobserve(sec);     // 渲染后取消监听
    });
  },{ rootMargin:'200px 0px' });  // 提前 200px 触发，用户无感知等待

  sections.forEach(function(sec){
    // 首屏第一个 section 直接渲染，无需等 observer
    if(sec.id==='section-project'){
      sec.dataset.lazyRendered='1';
      _renderSectionCards(sec);
    }else{
      _homeCardsObserver.observe(sec);
    }
  });
}

/** 渲染指定 section 下所有 home-grid 容器的卡片 */
function _renderSectionCards(section){
  if(!_homeCardsItemMap) return;
  var grids=section.querySelectorAll('.home-grid');
  grids.forEach(function(container){
    var gridId=container.id;
    var config=CARD_GRID_MAP[gridId];
    if(!config) return;
    var html='';
    config.ids.forEach(function(id){
      var item=_homeCardsItemMap[id];
      if(!item) return;
      // 阶段标签（实心背景色）
      var stageBadge='';
      if(item.applicable_stage){
        var sc=STAGE_COLORS[item.applicable_stage]||STAGE_COLORS['全阶段'];
        stageBadge='<span class="stage-tag stage-tag-solid" style="background:'+sc.bg+';color:'+sc.color+';border:1px solid '+sc.color.replace(')',',0.3)')+'">'+item.applicable_stage+'</span>';
      }
      // 优先级（带文字微标签）
      var priIcon=PRIORITY_ICONS[item.priority]||'';
      var priLabel=PRIORITY_LABELS[item.priority]||'';
      var priLabelBg=PRIORITY_LABEL_COLORS[item.priority]||'';
      var priLabelColor=PRIORITY_LABEL_TEXT[item.priority]||'';
      var priHtml=priIcon?'<span class="pri-badge-label" title="优先级: '+item.priority+'" style="background:'+priLabelBg+';color:'+priLabelColor+'">'+priIcon+' '+priLabel+'</span>':'';
      // 复制链接按钮
      var copyHtml='<button class="card-copy-btn" onclick="event.stopPropagation();copyCardLink(\''+item.id+'\')" title="复制链接">🔗</button>';
      // 图标背景色
      var iconBg='var(--accent-bg)';
      if(config.module==='outsource') iconBg='var(--orange-bg)';
      if(config.module==='craft') iconBg='var(--purple-bg)';
      if(config.module==='collab') iconBg='var(--green-bg)';
      if(config.module==='toolchain') iconBg='var(--cyan-bg)';
      if(config.module==='quality') iconBg='var(--pink-bg)';
      if(config.module==='mynotes') iconBg='rgba(251,191,36,.1)';
      // 工种 badge
      var craftBadge='';
      if(item.craft){
        var cc=CRAFT_COLORS[item.craft]||{bg:'rgba(139,143,163,.1)',color:'var(--dim)'};
        craftBadge='<span class="craft-badge" style="background:'+cc.bg+';color:'+cc.color+'">'+item.craft+'</span>';
      }
      // content_type 类型标签
      var ctBadge='';
      if(item.content_type && indexData.contentTypeConfig){
        var ctc=indexData.contentTypeConfig[item.content_type];
        if(ctc) ctBadge='<span class="ct-badge" style="background:'+ctc.bg+';color:'+ctc.color+';border:1px solid '+ctc.color.replace(')',',0.25)')+'">'+ctc.label+'</span>';
      }
      // quality_level 质量分级标签
      var qlBadge='';
      if(item.quality_level && indexData.qualityLevelConfig){
        var qlc=indexData.qualityLevelConfig[item.quality_level];
        if(qlc) qlBadge='<span class="ql-badge" style="background:'+qlc.bg+';color:'+qlc.color+';border:1px solid '+qlc.color.replace(')',',0.2)')+'">'+qlc.label+'</span>';
      }
      // 普通标签（描边暗色风格，与阶段标签视觉区分）
      var tagsHtml='';
      if(item.tags&&item.tags.length){
        var shown=item.tags.slice(0,3);
        tagsHtml=shown.map(function(t){return'<span class="tag tag-outline tag-clickable" onclick="event.stopPropagation();filterByTag(\''+t+'\')">'+t+'</span>';}).join('');
      }
      // Owner + 更新日期底栏（v4.2: 已移除 owner 和 last_updated 显示）
      var metaFooter='';

      // === 统一卡片标签布局：分两行 ===
      // 第一行：核心属性（阶段 + 类型 + 质量分级）
      var row1=stageBadge+ctBadge+qlBadge;
      // 第二行：关键词 tags + 工种
      var row2=tagsHtml+craftBadge;

      var tagsBlock='';
      if(row1) tagsBlock+='<div class="tag-row tag-row-primary">'+row1+'</div>';
      if(row2) tagsBlock+='<div class="tag-row tag-row-secondary">'+row2+'</div>';

      html+='<div class="home-card" data-stage="'+(item.applicable_stage||'')+'" data-priority="'+(item.priority||'')+'" data-id="'+item.id+'" onclick="navigate(\''+item.id+'\')">'
        +copyHtml
        +'<div class="hci" style="background:'+iconBg+'">'+(item.icon||'📄')+'</div>'
        +'<h3>'+item.title+priHtml+'</h3>'
        +'<p>'+item.desc+'</p>'
        +'<div class="tags">'+tagsBlock+'</div>'
        +metaFooter
        +'</div>';
    });
    container.innerHTML=html;
    // 渲染完成后为卡片添加淡入动画
    container.querySelectorAll('.home-card').forEach(function(card,i){
      card.style.opacity='0';
      card.style.transform='translateY(12px)';
      card.style.transition='opacity .3s ease '+i*0.04+'s, transform .3s ease '+i*0.04+'s';
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          card.style.opacity='1';
          card.style.transform='translateY(0)';
        });
      });
    });
  });
  // 懒加载渲染完成后为该 section 的卡片补上 badges
  _applySectionBadges(section);
}

/** 为指定 section 内的卡片添加 Updated badge */
function _applySectionBadges(section){
  if(!indexData||!indexData.items) return;
  var now=new Date();
  var oneWeekAgo=new Date(now.getTime()-7*24*60*60*1000);
  var cards=section.querySelectorAll('.home-card');
  indexData.items.forEach(function(item){
    if(!item.last_updated) return;
    var updated=new Date(item.last_updated);
    if(updated>=oneWeekAgo){
      cards.forEach(function(card){
        if(card.dataset.id===item.id && !card.querySelector('.card-badge')){
          card.classList.add('card-new');
          var badge=document.createElement('span');
          badge.className='card-badge badge-updated';
          badge.textContent='Updated';
          card.style.position='relative';
          card.insertBefore(badge,card.firstChild);
        }
      });
    }
  });
}

/** 强制渲染所有尚未懒加载的 section（供搜索/过滤等场景调用） */
function _forceRenderAllSections(){
  document.querySelectorAll('.module-section').forEach(function(sec){
    if(!sec.dataset.lazyRendered){
      sec.dataset.lazyRendered='1';
      _renderSectionCards(sec);
      if(_homeCardsObserver) _homeCardsObserver.unobserve(sec);
    }
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
    var priLabel=PRIORITY_LABELS[item.priority]||'';
    var priLabelBg=PRIORITY_LABEL_COLORS[item.priority]||'';
    var priLabelColor=PRIORITY_LABEL_TEXT[item.priority]||'';
    // 模块颜色
    var modColor='var(--accent)';var modBg='var(--accent-bg)';
    if(item.module==='collab'){modColor='var(--orange)';modBg='var(--orange-bg)';}
    if(item.module==='toolkit'){modColor='var(--green)';modBg='var(--green-bg)';}
    if(item.module==='governance'){modColor='var(--pink)';modBg='var(--pink-bg)';}
    if(item.module==='retrospect'){modColor='var(--cyan)';modBg='var(--cyan-bg)';}
    if(item.module==='casestudy'){modColor='var(--red)';modBg='rgba(248,113,113,.08)';}

    html+='<div class="hot-card" onclick="navigate(\''+item.id+'\')">'
      +'<div class="hot-card-top">'
      +'<div class="hot-card-icon" style="background:'+modBg+';color:'+modColor+'">'+(item.icon||'📄')+'</div>'
      +(priIcon?'<span class="hot-pri-label" style="background:'+priLabelBg+';color:'+priLabelColor+'">'+priIcon+' '+priLabel+'</span>':'')
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
  _forceRenderAllSections();  // P3-L1: 确保所有卡片已渲染
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
var dashboardCollapsed=true;
function toggleDashboard(){
  dashboardCollapsed=!dashboardCollapsed;
  var body=document.getElementById('dashboardBody');
  var btn=document.getElementById('dashboardToggle');
  var section=document.getElementById('dashboardSection');
  if(dashboardCollapsed){
    body.style.maxHeight=body.scrollHeight+'px';
    body.offsetHeight;
    body.style.maxHeight='0';
    body.style.opacity='0';
    btn.textContent='▼ 展开';
    if(section) section.classList.add('collapsed');
  } else {
    body.style.maxHeight=body.scrollHeight+'px';
    body.style.opacity='1';
    btn.textContent='▲ 收起';
    if(section) section.classList.remove('collapsed');
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

  // 判断是否为工具类页面（工具链各分组 + toolData + type==='tool'）
  var reg=pageRegistry[pageId]||{};
  var isToolPage=false;
  if(reg.grpName){
    var grp=reg.grpName;
    if(grp==='美术在线工具'||grp==='桌面工具 & 引擎直连'||grp==='检查与合规脚本') isToolPage=true;
  }
  // toolData 中的页面也视为工具页
  if(toolData[pageId]) isToolPage=true;
  // type 为 tool 的页面一律视为工具页
  if(reg.type==='tool') isToolPage=true;

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
  // ═══ 统一文档工具栏（合并原 detailMetaBar 操作 + iframeToolbar 编辑功能）═══
  html+='<span class="dm-actions" id="dmActionsBar">';
  if(!isToolPage){
    if(reg.type==='md'){
      html+='<button class="dm-btn dm-btn-edit" onclick="editDocument(\''+pageId+'\')" title="编辑模式">✏️ 编辑模式</button>';
      html+='<button class="dm-btn dm-btn-danger" onclick="confirmDeleteDocument(\''+pageId+'\')" title="删除文档">🗑️ 删除</button>';
    } else if(reg.type==='iframe'&&reg.file){
      // 阅读态按钮
      html+='<button class="dm-btn dm-btn-edit" id="dmBtnEdit" onclick="unifiedEnterEdit(\''+pageId+'\')" title="进入编辑模式">✏️ 编辑模式</button>';
      // 编辑态按钮（默认隐藏）
      html+='<button class="dm-btn htmpl-btn-save" id="dmBtnSave" onclick="htmlTmplSave()" style="display:none" title="保存下载 HTML 文件">💾 保存下载</button>';
      html+='<button class="dm-btn htmpl-btn-publish" id="dmBtnPublish" onclick="htmlTmplPublish()" style="display:none" title="一键发布到 GitHub 仓库">🚀 一键发布</button>';
      html+='<button class="dm-btn htmpl-btn-exit" id="dmBtnExitEdit" onclick="unifiedExitEdit(\''+pageId+'\')" style="display:none" title="退出编辑模式">✖ 退出编辑</button>';
    }
  }
  html+='<button class="dm-btn" onclick="copyCardLink(\''+pageId+'\')" title="复制链接">📋 复制链接</button>';
  html+='<button class="dm-btn" onclick="navigate(\'home\')" title="返回首页">🏠 返回首页</button>';
  html+='</span>';
  bar.innerHTML=html;
  bar.style.display='flex';
}

// ═══ 统一编辑入口：从顶部工具栏直接进入编辑模式（替代原来的双重按钮）═══
function unifiedEnterEdit(pageId){
  var frame=document.getElementById('contentFrame');
  if(!frame||!frame.contentWindow) return;
  try{
    var win=frame.contentWindow;
    if(typeof win.enterEdit==='function'){
      win.enterEdit();
    } else {
      var iDoc=frame.contentDocument||win.document;
      var ekBtn=iDoc.querySelector('.ek-enter-btn');
      if(ekBtn) ekBtn.click();
      else { showToast('⚠️ 该文档未启用可视化编辑器'); return; }
    }
    // 隐藏 iframe 内置编辑器 UI（由父页面统一控制）
    var iDoc2=frame.contentDocument||win.document;
    var ekToolbar=iDoc2.querySelector('.ek-toolbar');
    if(ekToolbar) ekToolbar.style.display='none';
    var ekBadge=iDoc2.querySelector('.ek-editing-badge');
    if(ekBadge) ekBadge.style.display='none';
  }catch(e){
    showToast('⚠️ 无法进入编辑模式（跨域限制）');
    return;
  }
  // 切换顶部工具栏按钮状态：阅读 → 编辑
  var btnEdit=document.getElementById('dmBtnEdit');
  var btnSave=document.getElementById('dmBtnSave');
  var btnPublish=document.getElementById('dmBtnPublish');
  var btnExit=document.getElementById('dmBtnExitEdit');
  if(btnEdit) btnEdit.style.display='none';
  if(btnSave) btnSave.style.display='';
  if(btnPublish) btnPublish.style.display='';
  if(btnExit) btnExit.style.display='';
  // 隐藏 iframeToolbar（避免重复）
  var iftb=document.getElementById('iframeToolbar');
  if(iftb) iftb.style.display='none';
  showToast('✅ 已进入编辑模式 — 直接点击内容修改，双击图片可替换');
}

// ═══ 统一退出编辑模式 ═══
function unifiedExitEdit(pageId){
  var frame=document.getElementById('contentFrame');
  try{
    var iDoc=frame.contentDocument||frame.contentWindow.document;
    iDoc.body.classList.remove('ek-editing');
    // 移除所有 contenteditable 属性（包括 body 上可能设置的）
    iDoc.body.removeAttribute('contenteditable');
    iDoc.querySelectorAll('[contenteditable]').forEach(function(el){el.removeAttribute('contenteditable');});
    iDoc.querySelectorAll('.ek-img-editable').forEach(function(el){el.classList.remove('ek-img-editable');});
    // 还原图片编辑态样式
    iDoc.querySelectorAll('img').forEach(function(img){
      img.style.cursor='';
      img.style.outline='';
    });
  }catch(e){}
  // 切换顶部工具栏按钮状态：编辑 → 阅读
  var btnEdit=document.getElementById('dmBtnEdit');
  var btnSave=document.getElementById('dmBtnSave');
  var btnPublish=document.getElementById('dmBtnPublish');
  var btnExit=document.getElementById('dmBtnExitEdit');
  if(btnEdit) btnEdit.style.display='';
  if(btnSave) btnSave.style.display='none';
  if(btnPublish) btnPublish.style.display='none';
  if(btnExit) btnExit.style.display='none';
  showToast('已退出编辑模式');
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

// ═══ 知识库总览 折叠/展开 ═══
var ktCollapsed = true;
function toggleKnowledgeTabs(){
  var body = document.getElementById('ktBody');
  var toggle = document.getElementById('ktToggle');
  var section = document.getElementById('knowledgeTabsSection');
  if(!body) return;

  ktCollapsed = !ktCollapsed;

  if(ktCollapsed){
    body.style.maxHeight = body.scrollHeight + 'px';
    body.offsetHeight;
    body.style.overflow = 'hidden';
    body.style.maxHeight = '0';
    body.style.opacity = '0';
    if(toggle) toggle.textContent = '▼ 展开';
    if(section) section.classList.add('kt-collapsed');
  } else {
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity = '1';
    body.style.overflow = 'hidden';
    if(toggle) toggle.textContent = '▲ 收起';
    if(section) section.classList.remove('kt-collapsed');
    var onEnd = function(e){
      if(e.target !== body) return;
      body.style.maxHeight = 'none';
      body.style.overflow = '';
      body.removeEventListener('transitionend', onEnd);
    };
    body.addEventListener('transitionend', onEnd);
  }
}

// ═══ 首页板块折叠/展开 ═══
function toggleModuleSection(headerEl){
  var section = headerEl.closest('.module-section');
  if(!section) return;
  var body = section.querySelector('.module-body');
  if(!body) return;

  if(section.classList.contains('collapsed')){
    // 展开：先移除 collapsed 类，设初始 maxHeight 为 0，再过渡到 scrollHeight
    section.classList.remove('collapsed');
    body.style.maxHeight = '0';
    body.style.overflow = 'hidden';
    body.style.opacity = '0';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.opacity = '1';
        var onEnd = function(e){
          if(e.target !== body) return;
          body.style.maxHeight = 'none';
          body.style.overflow = 'visible';
          body.removeEventListener('transitionend', onEnd);
        };
        body.addEventListener('transitionend', onEnd);
      });
    });
  } else {
    // 折叠：先锁定当前 scrollHeight，再过渡到 0
    var h = body.scrollHeight;
    body.style.maxHeight = h + 'px';
    body.style.overflow = 'hidden';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        section.classList.add('collapsed');
        body.style.maxHeight = '0';
        body.style.opacity = '0';
      });
    });
  }
  // 持久化折叠状态到 localStorage
  saveModuleCollapseState();
}

// ═══ 模块折叠状态持久化 ═══
function saveModuleCollapseState(){
  try{
    var state={};
    document.querySelectorAll('.module-section[id]').forEach(function(s){
      state[s.id]=s.classList.contains('collapsed');
    });
    localStorage.setItem('module_collapse_state',JSON.stringify(state));
  }catch(e){}
}
function restoreModuleCollapseState(){
  try{
    var raw=localStorage.getItem('module_collapse_state');
    if(!raw) return;
    var state=JSON.parse(raw);
    Object.keys(state).forEach(function(id){
      var section=document.getElementById(id);
      if(!section) return;
      var body=section.querySelector('.module-body');
      if(!body) return;
      if(state[id]){
        section.classList.add('collapsed');
        body.style.maxHeight='0';
        body.style.opacity='0';
        body.style.overflow='hidden';
      }
    });
  }catch(e){}
}

// ═══ Mermaid 可视化图折叠/展开 ═══
var mermaidCollapsed = true;
function toggleMermaidSection(){
  var body = document.getElementById('mermaidBody');
  var chevron = document.getElementById('mermaidChevron');
  if(!body) return;

  mermaidCollapsed = !mermaidCollapsed;

  if(mermaidCollapsed){
    // 折叠
    body.style.maxHeight = body.scrollHeight + 'px';
    body.offsetHeight; // 强制回流
    body.style.overflow = 'hidden';
    body.style.maxHeight = '0';
    body.style.opacity = '0';
    if(chevron) chevron.style.transform = 'rotate(-90deg)';
  } else {
    // 展开
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity = '1';
    body.style.overflow = 'hidden';
    if(chevron) chevron.style.transform = 'rotate(0deg)';
    var onEnd = function(e){
      if(e.target !== body) return;
      body.style.maxHeight = 'none';
      body.style.overflow = '';
      body.removeEventListener('transitionend', onEnd);
    };
    body.addEventListener('transitionend', onEnd);
  }
}

// ═══ 优化A：图片灯箱效果 (Lightbox) — 点击放大 + 滚轮缩放 + 拖拽平移 ═══
var lightboxScale=1;
var lightboxDrag={active:false,startX:0,startY:0,tx:0,ty:0};
function initLightbox(){
  // 创建灯箱 DOM
  var overlay=document.createElement('div');
  overlay.id='lightboxOverlay';
  overlay.className='lb-overlay';
  overlay.innerHTML='<img id="lightboxImg" class="lb-img" draggable="false"><div class="lb-close" id="lightboxClose">✕</div><div class="lb-hint">滚轮缩放 · 拖拽平移 · 点击空白关闭</div>';
  document.body.appendChild(overlay);

  var img=document.getElementById('lightboxImg');
  var closeBtn=document.getElementById('lightboxClose');

  // 关闭灯箱
  function closeLightbox(){
    overlay.classList.remove('show');
    lightboxScale=1;
    lightboxDrag={active:false,startX:0,startY:0,tx:0,ty:0};
    img.style.transform='scale(1) translate(0,0)';
  }
  overlay.addEventListener('click',function(e){if(e.target===overlay) closeLightbox();});
  closeBtn.addEventListener('click',closeLightbox);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay.classList.contains('show')) closeLightbox();});

  // 滚轮缩放
  overlay.addEventListener('wheel',function(e){
    e.preventDefault();
    var delta=e.deltaY>0?-0.15:0.15;
    lightboxScale=Math.max(0.2,Math.min(8,lightboxScale+delta));
    img.style.transform='scale('+lightboxScale+') translate('+lightboxDrag.tx+'px,'+lightboxDrag.ty+'px)';
  },{passive:false});

  // 拖拽平移
  img.addEventListener('mousedown',function(e){
    e.preventDefault();
    lightboxDrag.active=true;
    lightboxDrag.startX=e.clientX-lightboxDrag.tx;
    lightboxDrag.startY=e.clientY-lightboxDrag.ty;
    img.style.cursor='grabbing';
  });
  overlay.addEventListener('mousemove',function(e){
    if(!lightboxDrag.active) return;
    lightboxDrag.tx=e.clientX-lightboxDrag.startX;
    lightboxDrag.ty=e.clientY-lightboxDrag.startY;
    img.style.transform='scale('+lightboxScale+') translate('+lightboxDrag.tx+'px,'+lightboxDrag.ty+'px)';
  });
  overlay.addEventListener('mouseup',function(){lightboxDrag.active=false;img.style.cursor='grab';});

  // 事件委托：点击文档区域的图片触发灯箱
  document.getElementById('contentScroll').addEventListener('click',function(e){
    if(e.target.tagName==='IMG'&&!e.target.closest('.home-hero')&&!e.target.closest('.role-card')&&e.target.naturalWidth>100){
      img.src=e.target.src;
      lightboxScale=1;
      lightboxDrag={active:false,startX:0,startY:0,tx:0,ty:0};
      img.style.transform='scale(1) translate(0,0)';
      overlay.classList.add('show');
    }
  });

  // iframe 内图片灯箱支持
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='lightbox-open'&&e.data.src){
      img.src=e.data.src;
      lightboxScale=1;
      lightboxDrag={active:false,startX:0,startY:0,tx:0,ty:0};
      img.style.transform='scale(1) translate(0,0)';
      overlay.classList.add('show');
    }
  });
}

// ═══ 优化C：侧边栏折叠 / 沉浸式阅读模式 ═══
var sidebarCollapsed=false;
function toggleSidebarCollapse(){
  var sidebar=document.querySelector('.sidebar');
  var main=document.querySelector('.main');
  var btn=document.getElementById('sidebarCollapseBtn');
  if(!sidebar||!main) return;
  sidebarCollapsed=!sidebarCollapsed;
  if(sidebarCollapsed){
    sidebar.classList.add('sidebar-collapsed');
    main.classList.add('main-expanded');
    if(btn){
      btn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      btn.title='展开侧边栏';
      btn.classList.add('sidebar-toggle-collapsed');
    }
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    main.classList.remove('main-expanded');
    if(btn){
      btn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      btn.title='收起侧边栏';
      btn.classList.remove('sidebar-toggle-collapsed');
    }
  }
}
function injectSidebarToggle(){
  // 创建一个始终固定在侧边栏右边缘、垂直居中的收起/展开按钮
  var sidebar=document.querySelector('.sidebar');
  if(!sidebar) return;

  var btn=document.createElement('button');
  btn.id='sidebarCollapseBtn';
  btn.className='sidebar-toggle-fixed';
  btn.title='收起侧边栏';
  btn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  btn.onclick=toggleSidebarCollapse;
  // 按钮挂在 body 上，用 fixed 定位，不受 sidebar 滚动影响
  document.body.appendChild(btn);
}

// ═══ 优化E：面包屑导航 — 点击分类/分组跳回首页并展开对应目录 ═══
function breadcrumbNavCat(catName){
  navigate('home');
  // 延迟执行，等待首页渲染
  setTimeout(function(){
    var cats=document.querySelectorAll('#sidebarNav .t1');
    cats.forEach(function(el){
      var label=el.querySelector('.t1-h .cl');
      if(label&&label.textContent.trim()===catName){
        if(!el.classList.contains('open')) el.querySelector('.t1-h').click();
        el.scrollIntoView({behavior:'smooth',block:'center'});
      }
    });
  },150);
}
function breadcrumbNavGrp(grpName){
  navigate('home');
  setTimeout(function(){
    // 先展开所有一级，然后找到匹配的二级
    var groups=document.querySelectorAll('#sidebarNav .t2');
    groups.forEach(function(el){
      var label=el.querySelector('.t2-h .sl');
      if(label&&label.textContent.trim()===grpName){
        // 确保父级一级已展开
        var parent=el.closest('.t1');
        if(parent&&!parent.classList.contains('open')){
          parent.querySelector('.t1-h').click();
        }
        setTimeout(function(){
          if(!el.classList.contains('open')) el.querySelector('.t2-h').click();
          el.scrollIntoView({behavior:'smooth',block:'center'});
        },100);
      }
    });
  },150);
}

// ═══ 可视化管理面板 (Visual CMS) ═══
var adminMode = false;
var adminDirty = false; // 是否有未保存的目录变更

// 快捷键：Ctrl+Shift+A 触发管理模式
document.addEventListener('keydown', function(e){
  if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='a'){
    e.preventDefault();
    toggleAdminMode();
  }
});

function toggleAdminMode(){
  adminMode = !adminMode;
  var sidebar = document.querySelector('.sidebar');
  if(adminMode){
    sidebar.classList.add('admin-mode');
    renderAdminToolbar();
    enableDragDrop();
    showToast('🔧 管理模式已开启 — 可拖拽排序、增删文档');
  }else{
    sidebar.classList.remove('admin-mode');
    removeAdminToolbar();
    disableDragDrop();
    showToast('管理模式已关闭');
  }
}

function renderAdminToolbar(){
  // 在侧边栏顶部注入管理工具栏
  var existing=document.getElementById('adminToolbar');
  if(existing) existing.remove();
  var bar=document.createElement('div');
  bar.id='adminToolbar';
  bar.className='admin-toolbar';
  bar.innerHTML=
    '<div class="at-left">'
    +'<span class="at-badge">🔧 管理模式</span>'
    +'<span class="at-hint">Ctrl+Shift+A 退出</span>'
    +'</div>'
    +'<div class="at-actions">'
    +'<button class="at-btn at-btn-add" onclick="adminAddCategory()" title="新增一级模块">＋ 模块</button>'
    +'<button class="at-btn at-btn-save" onclick="adminPublishAll()" title="发布全部变更">🚀 发布</button>'
    +'</div>';
  var sidebarNav=document.querySelector('.sidebar-nav');
  sidebarNav.parentNode.insertBefore(bar, sidebarNav);

  // 为每个目录项注入管理按钮
  injectAdminActions();
}

function removeAdminToolbar(){
  var tb=document.getElementById('adminToolbar');
  if(tb) tb.remove();
  // 移除所有管理按钮
  document.querySelectorAll('.admin-action-btn').forEach(function(b){b.remove();});
}

function injectAdminActions(){
  // 清除旧的
  document.querySelectorAll('.admin-action-btn').forEach(function(b){b.remove();});

  // 一级模块：添加「新增分组」和「删除模块」按钮
  document.querySelectorAll('.t1-h').forEach(function(h){
    var wrap=document.createElement('div');
    wrap.className='admin-action-btn';
    wrap.innerHTML=
      '<button class="aa-btn aa-add" onclick="event.stopPropagation();adminAddGroup(this)" title="新增二级分组">＋</button>'
      +'<button class="aa-btn aa-del" onclick="event.stopPropagation();adminDeleteNode(this,\'t1\')" title="删除此模块">✕</button>';
    h.appendChild(wrap);
  });

  // 二级分组：添加「新增文档」和「删除分组」按钮
  document.querySelectorAll('.t2-h').forEach(function(h){
    var wrap=document.createElement('div');
    wrap.className='admin-action-btn';
    wrap.innerHTML=
      '<button class="aa-btn aa-add" onclick="event.stopPropagation();adminAddDoc(this)" title="新增文档">＋</button>'
      +'<button class="aa-btn aa-del" onclick="event.stopPropagation();adminDeleteNode(this,\'t2\')" title="删除此分组">✕</button>';
    h.appendChild(wrap);
  });

  // 三级分组
  document.querySelectorAll('.t3-h').forEach(function(h){
    var wrap=document.createElement('div');
    wrap.className='admin-action-btn';
    wrap.innerHTML=
      '<button class="aa-btn aa-add" onclick="event.stopPropagation();adminAddDoc(this)" title="新增文档">＋</button>'
      +'<button class="aa-btn aa-del" onclick="event.stopPropagation();adminDeleteNode(this,\'t3\')" title="删除此分组">✕</button>';
    h.appendChild(wrap);
  });

  // 叶节点：添加「编辑」和「删除」按钮
  document.querySelectorAll('.leaf').forEach(function(leaf){
    if(leaf.classList.contains('leaf--empty')) return;
    var wrap=document.createElement('div');
    wrap.className='admin-action-btn';
    wrap.innerHTML=
      '<button class="aa-btn aa-edit" onclick="event.stopPropagation();adminEditDoc(this)" title="编辑此文档">✏️</button>'
      +'<button class="aa-btn aa-del" onclick="event.stopPropagation();adminDeleteLeaf(this)" title="删除此文档">✕</button>';
    leaf.appendChild(wrap);
  });
}

// ═══ 管理模式：拖拽排序 ═══
var dragSrcEl=null;
function enableDragDrop(){
  // 为叶节点和分组启用拖拽
  document.querySelectorAll('.leaf:not(.leaf--empty), .t2-h, .t1-h').forEach(function(el){
    el.setAttribute('draggable','true');
    el.addEventListener('dragstart', adminDragStart);
    el.addEventListener('dragover', adminDragOver);
    el.addEventListener('drop', adminDrop);
    el.addEventListener('dragend', adminDragEnd);
  });
}
function disableDragDrop(){
  document.querySelectorAll('[draggable="true"]').forEach(function(el){
    el.removeAttribute('draggable');
    el.removeEventListener('dragstart', adminDragStart);
    el.removeEventListener('dragover', adminDragOver);
    el.removeEventListener('drop', adminDrop);
    el.removeEventListener('dragend', adminDragEnd);
  });
}
function adminDragStart(e){
  dragSrcEl=this;
  this.style.opacity='0.4';
  e.dataTransfer.effectAllowed='move';
}
function adminDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  this.style.borderTop='2px solid var(--accent)';
}
function adminDrop(e){
  e.preventDefault();
  this.style.borderTop='';
  if(dragSrcEl===this) return;
  // 只允许同级拖拽
  if(dragSrcEl && dragSrcEl.parentNode===this.parentNode){
    var parent=this.parentNode;
    var allChildren=Array.from(parent.children);
    var srcIdx=allChildren.indexOf(dragSrcEl.closest('.leaf')||dragSrcEl.closest('.t2')||dragSrcEl.closest('.t1'));
    var dstIdx=allChildren.indexOf(this.closest('.leaf')||this.closest('.t2')||this.closest('.t1'));
    var srcNode=dragSrcEl.closest('.leaf')||dragSrcEl.closest('.t2')||dragSrcEl.closest('.t1');
    var dstNode=this.closest('.leaf')||this.closest('.t2')||this.closest('.t1');
    if(srcNode&&dstNode&&srcNode!==dstNode){
      if(srcIdx<dstIdx) parent.insertBefore(srcNode, dstNode.nextSibling);
      else parent.insertBefore(srcNode, dstNode);
      adminDirty=true;
      syncSidebarToData();
      showToast('📦 顺序已更新（需发布生效）');
    }
  }
}
function adminDragEnd(e){
  this.style.opacity='';
  document.querySelectorAll('.t1-h,.t2-h,.t3-h,.leaf').forEach(function(el){el.style.borderTop='';});
}

// ═══ 管理模式：增删操作 ═══
function adminAddCategory(){
  var name=prompt('请输入新模块名称（如：📋 新模块）');
  if(!name) return;
  var id='mod-'+name.replace(/[^a-zA-Z0-9]/g,'-').toLowerCase()+'-'+Date.now().toString(36);
  sidebarData.categories.push({
    id: id,
    name: name,
    icon: '📋',
    color: 'accent',
    groups: [{name:'默认分组', icon:'📄', items:[]}]
  });
  adminDirty=true;
  buildSidebar(sidebarData);
  if(adminMode) injectAdminActions();
  showToast('✅ 新模块已添加：'+name);
}

function adminAddGroup(btn){
  var t1=btn.closest('.t1');
  if(!t1) return;
  var catIdx=Array.from(document.querySelectorAll('.t1')).indexOf(t1);
  var name=prompt('请输入新分组名称（如：新规范）');
  if(!name) return;
  if(sidebarData.categories[catIdx]){
    sidebarData.categories[catIdx].groups.push({
      name: name, icon: '📄', items: []
    });
    adminDirty=true;
    buildSidebar(sidebarData);
    if(adminMode) injectAdminActions();
    showToast('✅ 新分组已添加：'+name);
  }
}

function adminAddDoc(btn){
  var name=prompt('请输入文档标题');
  if(!name) return;
  var docId=name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'-').toLowerCase();
  // 找到所属分组
  var t2=btn.closest('.t2')||btn.closest('.t3');
  var t1=btn.closest('.t1');
  if(!t1) return;
  var catIdx=Array.from(document.querySelectorAll('.t1')).indexOf(t1);
  if(t2){
    var grpIdx=Array.from(t1.querySelectorAll('.t2,.t3')).indexOf(t2);
    if(sidebarData.categories[catIdx] && sidebarData.categories[catIdx].groups[grpIdx]){
      sidebarData.categories[catIdx].groups[grpIdx].items.push({
        id: docId, icon: '📝', title: name, type: 'md',
        file: 'knowledge-base/'+docId+'.md', badge: '文档', craft: ''
      });
    }
  }
  adminDirty=true;
  buildSidebar(sidebarData);
  if(adminMode) injectAdminActions();
  showToast('✅ 文档已添加：'+name);
}

function adminDeleteNode(btn, level){
  if(!confirm('确定要删除此'+({'t1':'模块','t2':'分组','t3':'分组'}[level])+'？（子项将一并删除）')) return;
  var node=btn.closest('.'+level);
  var t1=btn.closest('.t1');
  if(!t1) return;
  var catIdx=Array.from(document.querySelectorAll('.t1')).indexOf(t1);
  if(level==='t1'){
    sidebarData.categories.splice(catIdx,1);
  }else{
    var grpNode=btn.closest('.t2')||btn.closest('.t3');
    var grpIdx=Array.from(t1.querySelectorAll('.t2,.t3')).indexOf(grpNode);
    if(sidebarData.categories[catIdx]&&sidebarData.categories[catIdx].groups[grpIdx]){
      sidebarData.categories[catIdx].groups.splice(grpIdx,1);
    }
  }
  adminDirty=true;
  buildSidebar(sidebarData);
  if(adminMode) injectAdminActions();
  showToast('🗑️ 已删除');
}

function adminDeleteLeaf(btn){
  if(!confirm('确定要从目录中移除此文档？')) return;
  var leaf=btn.closest('.leaf');
  if(!leaf) return;
  var pageId=leaf.getAttribute('data-page');
  // 从 sidebarData 中移除
  sidebarData.categories.forEach(function(cat){
    if(cat.items){
      cat.items=cat.items.filter(function(i){return i.id!==pageId;});
    }
    cat.groups.forEach(function(g){
      if(g.items){
        g.items=g.items.filter(function(i){return i.id!==pageId;});
      }
    });
  });
  adminDirty=true;
  buildSidebar(sidebarData);
  if(adminMode) injectAdminActions();
  showToast('🗑️ 文档已从目录移除');
}

function adminEditDoc(btn){
  var leaf=btn.closest('.leaf');
  if(!leaf) return;
  var pageId=leaf.getAttribute('data-page');
  if(pageId) navigate(pageId);
}

// ═══ 管理模式：同步 DOM 顺序到 sidebarData ═══
function syncSidebarToData(){
  try{
    var cats=document.querySelectorAll('.t1');
    var newCategories=[];
    cats.forEach(function(t1,ci){
      var oldCat=sidebarData.categories[ci];
      if(!oldCat) return;
      var newGroups=[];
      var groups=t1.querySelectorAll('.t2,.t3');
      groups.forEach(function(g,gi){
        var oldGrp=oldCat.groups[gi];
        if(!oldGrp) return;
        var newItems=[];
        var leaves=g.querySelectorAll('.leaf[data-page]');
        leaves.forEach(function(leaf){
          var pid=leaf.getAttribute('data-page');
          // 在旧数据中找到此 item
          var found=null;
          oldGrp.items.forEach(function(item){if(item.id===pid) found=item;});
          if(!found){
            oldCat.groups.forEach(function(og){
              og.items.forEach(function(item){if(item.id===pid) found=item;});
            });
          }
          if(found) newItems.push(found);
        });
        newGroups.push(Object.assign({}, oldGrp, {items:newItems}));
      });
      newCategories.push(Object.assign({}, oldCat, {groups:newGroups}));
    });
    if(newCategories.length) sidebarData.categories=newCategories;
  }catch(e){console.warn('syncSidebarToData error:',e);}
}

// ═══ 管理模式：一键发布全部变更（多文件 commit via GitHub API）═══
async function adminPublishAll(){
  if(!adminDirty){showToast('没有需要发布的变更','warning');return;}

  var s=getGHSettings();
  if(!s.token){
    showToast('⚠️ 请先配置 GitHub 访问密钥（点击侧边栏底部「⚙️」设置）','warning');
    return;
  }

  if(!confirm('确定要将目录变更发布到远程仓库？')) return;

  var repo=s.repo||'diedie23/Game-Knowledge-Base';
  var branch=s.branch||'main';
  var base='https://api.github.com/repos/'+repo;
  var headers={'Authorization':'token '+s.token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'};

  showToast('⏳ 正在发布目录变更…');

  try{
    // ═══ Step 1: 获取最新 commit SHA ═══
    var refRes=await fetch(base+'/git/refs/heads/'+branch,{headers:headers});
    if(!refRes.ok) throw new Error('无法获取分支信息: '+(await refRes.text()));
    var refData=await refRes.json();
    var latestCommitSha=refData.object.sha;

    // ═══ Step 2: 获取最新 commit 的 tree SHA ═══
    var commitRes=await fetch(base+'/git/commits/'+latestCommitSha,{headers:headers});
    var commitData=await commitRes.json();
    var baseTreeSha=commitData.tree.sha;

    // ═══ Step 3: 创建新的 blob 和 tree ═══
    var treeItems=[];

    // sidebar.json
    var sidebarContent=JSON.stringify(sidebarData,null,2);
    var sbBlobRes=await fetch(base+'/git/blobs',{method:'POST',headers:headers,body:JSON.stringify({content:sidebarContent,encoding:'utf-8'})});
    var sbBlob=await sbBlobRes.json();
    treeItems.push({path:'docs/sidebar.json',mode:'100644',type:'blob',sha:sbBlob.sha});

    // 如果 index.json 也需要更新（同步模块权重等）
    if(indexData){
      var indexContent=JSON.stringify(indexData,null,2);
      var idxBlobRes=await fetch(base+'/git/blobs',{method:'POST',headers:headers,body:JSON.stringify({content:indexContent,encoding:'utf-8'})});
      var idxBlob=await idxBlobRes.json();
      treeItems.push({path:'docs/index.json',mode:'100644',type:'blob',sha:idxBlob.sha});
    }

    // ═══ Step 4: 创建新 tree ═══
    var treeRes=await fetch(base+'/git/trees',{method:'POST',headers:headers,body:JSON.stringify({base_tree:baseTreeSha,tree:treeItems})});
    var treeData=await treeRes.json();

    // ═══ Step 5: 创建新 commit ═══
    var newCommitRes=await fetch(base+'/git/commits',{method:'POST',headers:headers,body:JSON.stringify({message:'cms: 更新知识库目录结构 (CMS 管理模式)',tree:treeData.sha,parents:[latestCommitSha]})});
    var newCommitData=await newCommitRes.json();

    // ═══ Step 6: 更新 ref 到新 commit ═══
    var updateRefRes=await fetch(base+'/git/refs/heads/'+branch,{method:'PATCH',headers:headers,body:JSON.stringify({sha:newCommitData.sha})});
    if(!updateRefRes.ok) throw new Error('更新分支失败');

    adminDirty=false;
    showToast('🎉 目录变更已发布到远程仓库！');
  }catch(e){
    showToast('❌ 发布失败: '+e.message);
    console.error('CMS publish error:', e);
  }
}

// ═══ AI 智能问答助手 (Coze API) ═══

/* ── 可自定义配置区（修改此处即可换头像/名称/主题色） ── */
var AI_BOT_CONFIG = {
  name: 'APM 智能助理',                                         // Bot 名称
  avatarUrl: 'https://via.placeholder.com/56x56/1c2a44/6c8cff?text=AI', // ← 替换为你的头像 URL
  themeAccent: '#6c8cff'                                         // 主题强调色（与网站 --accent 一致）
};

function toggleAiChat(){
  var dialog=document.getElementById('aiChatDialog');
  var fab=document.getElementById('aiChatFab');
  var avatarEl=document.getElementById('aiFabAvatar');
  var closeEl=document.getElementById('aiFabClose');
  if(dialog.classList.contains('show')){
    dialog.classList.remove('show');
    if(avatarEl) avatarEl.style.display='';
    if(closeEl) closeEl.style.display='none';
  }else{
    dialog.classList.add('show');
    if(avatarEl) avatarEl.style.display='none';
    if(closeEl) closeEl.style.display='flex';
    // 加载已保存的配置
    var savedBotId=localStorage.getItem('coze_bot_id');
    var savedToken=localStorage.getItem('coze_token');
    if(savedBotId) document.getElementById('cozeBotId').value=savedBotId;
    if(savedToken) document.getElementById('cozeToken').value=savedToken;
    // 自动聚焦输入框
    setTimeout(function(){document.getElementById('aiChatInput').focus();},300);
  }
}

function aiSendSuggestion(btn){
  document.getElementById('aiChatInput').value=btn.textContent;
  aiSendMessage();
}

function aiSendMessage(){
  var input=document.getElementById('aiChatInput');
  var msg=input.value.trim();
  if(!msg) return;

  // 添加用户消息
  aiAppendMessage('user',msg);
  input.value='';
  input.style.height='auto';

  // 检查是否配置了 Coze
  var botId=localStorage.getItem('coze_bot_id');
  var token=localStorage.getItem('coze_token');

  if(!botId||!token){
    // 未配置 → 使用本地知识库搜索模式
    aiLocalAnswer(msg);
  }else{
    // 已配置 → 调用 Coze API
    aiCozeAnswer(msg, botId, token);
  }
}

// ═══ 本地知识库搜索回答（免费兜底方案） ═══
function aiLocalAnswer(query){
  aiShowTyping();
  setTimeout(function(){
    aiRemoveTyping();
    var answer='';
    var relatedDocs=[];

    // 使用全文搜索索引查找
    if(fuseFulltext){
      var results=fuseFulltext.search(query).slice(0,5);
      if(results.length){
        answer='根据知识库内容，以下是与你的问题最相关的信息：\n\n';
        results.forEach(function(r,i){
          var entry=r.item;
          var snippet=entry.excerpt||entry.content.substring(0,150)+'…';
          answer+='**'+(i+1)+'. '+entry.title+'**\n'+snippet+'\n\n';
          relatedDocs.push({id:entry.id, title:entry.title, icon:entry.icon||'📄'});
        });
        answer+='💡 *点击下方文档链接查看完整内容*';
      }else{
        answer='抱歉，在知识库中没有找到与「'+query+'」直接相关的内容。\n\n你可以尝试：\n- 换用不同的关键词搜索\n- 在左侧导航栏浏览相关模块\n- 使用顶部搜索框进行模糊搜索';
      }
    }else if(fuse){
      var results2=fuse.search(query).slice(0,5);
      if(results2.length){
        answer='找到以下相关文档：\n\n';
        results2.forEach(function(r,i){
          answer+='**'+(i+1)+'. '+r.item.title+'**\n';
          relatedDocs.push({id:r.item.id, title:r.item.title, icon:'📄'});
        });
        answer+='\n💡 *点击文档链接查看详情*';
      }else{
        answer='暂未在知识库中找到相关内容。建议浏览左侧导航目录。';
      }
    }else{
      answer='搜索索引尚在加载中，请稍后再试。';
    }

    aiAppendMessage('bot', answer, relatedDocs);
  }, 800+Math.random()*600);
}

// ═══ Coze API 调用 ═══
function aiCozeAnswer(query, botId, token){
  aiShowTyping();
  var sendBtn=document.getElementById('aiChatSend');
  sendBtn.disabled=true;

  fetch('https://api.coze.cn/open_api/v2/chat', {
    method:'POST',
    headers:{
      'Authorization': 'Bearer '+token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bot_id: botId,
      user: 'apm_user_' + (localStorage.getItem('coze_user_id') || Date.now()),
      query: query,
      stream: false
    })
  }).then(function(res){return res.json();}).then(function(data){
    aiRemoveTyping();
    sendBtn.disabled=false;
    if(data && data.messages){
      var answerMsg = data.messages.find(function(m){return m.role==='assistant' && m.type==='answer';});
      if(answerMsg){
        aiAppendMessage('bot', answerMsg.content);
      }else{
        aiAppendMessage('bot', '收到回复，但未找到有效答案。请检查 Bot 配置。');
      }
    }else if(data && data.msg){
      aiAppendMessage('bot', '⚠️ API 错误: '+data.msg+'\n\n请检查 Bot ID 和 Token 是否正确。');
    }else{
      aiAppendMessage('bot', '⚠️ 未收到有效响应，请稍后重试。');
    }
  }).catch(function(err){
    aiRemoveTyping();
    sendBtn.disabled=false;
    // 降级到本地搜索
    aiAppendMessage('bot', '⚠️ Coze API 连接失败，已切换到本地知识库搜索模式。\n\n*错误: '+err.message+'*');
    aiLocalAnswer(query);
  });
}

// ═══ 消息渲染 ═══
function aiAppendMessage(role, text, relatedDocs){
  var container=document.getElementById('aiChatMessages');
  var div=document.createElement('div');
  div.className='ai-msg ai-msg-'+role;

  var avatarHtml=role==='user'
    ?'<div class="ai-msg-avatar">👤</div>'
    :'<div class="ai-msg-avatar"><img class="ai-avatar-img" src="'+AI_BOT_CONFIG.avatarUrl+'" alt="Bot" draggable="false"></div>';
  var htmlContent=aiFormatMessage(text);

  // 添加相关文档链接
  var docsHtml='';
  if(relatedDocs && relatedDocs.length){
    docsHtml='<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">';
    relatedDocs.forEach(function(doc){
      docsHtml+='<a class="ai-doc-link" onclick="navigate(\''+doc.id+'\');toggleAiChat()" style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;font-size:13px;color:var(--accent);cursor:pointer;transition:all .15s;text-decoration:none;background:rgba(108,140,255,.04);border:1px solid rgba(108,140,255,.1)">'
        +'<span>'+doc.icon+'</span>'
        +'<span style="flex:1;font-weight:500">'+doc.title+'</span>'
        +'<span style="color:var(--dim);font-size:11px">→</span>'
        +'</a>';
    });
    docsHtml+='</div>';
  }

  div.innerHTML=avatarHtml
    +'<div class="ai-msg-content">'+htmlContent+docsHtml+'</div>';
  container.appendChild(div);

  // 滚动到底部
  var body=document.getElementById('aiChatBody');
  body.scrollTop=body.scrollHeight;
}

function aiFormatMessage(text){
  if(!text) return '';
  // 简单 Markdown 渲染
  var h=text;
  h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/\*(.+?)\*/g,'<em style="color:var(--dim)">$1</em>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/\n\n/g,'</p><p>');
  h=h.replace(/\n/g,'<br>');
  return '<p>'+h+'</p>';
}

function aiShowTyping(){
  var container=document.getElementById('aiChatMessages');
  var div=document.createElement('div');
  div.className='ai-msg ai-msg-bot';
  div.id='aiTypingIndicator';
  div.innerHTML='<div class="ai-msg-avatar"><img class="ai-avatar-img" src="'+AI_BOT_CONFIG.avatarUrl+'" alt="Bot" draggable="false"></div><div class="ai-msg-content"><div class="ai-typing"><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div></div></div>';
  container.appendChild(div);
  var body=document.getElementById('aiChatBody');
  body.scrollTop=body.scrollHeight;
}

function aiRemoveTyping(){
  var el=document.getElementById('aiTypingIndicator');
  if(el) el.remove();
}

function aiOpenConfig(){
  document.getElementById('aiConfigPanel').style.display='block';
}
function aiCloseConfig(){
  document.getElementById('aiConfigPanel').style.display='none';
}
function aiSaveConfig(){
  var botId=document.getElementById('cozeBotId').value.trim();
  var token=document.getElementById('cozeToken').value.trim();
  if(botId) localStorage.setItem('coze_bot_id', botId);
  if(token) localStorage.setItem('coze_token', token);
  if(!localStorage.getItem('coze_user_id')) localStorage.setItem('coze_user_id', 'u_'+Date.now());
  aiCloseConfig();
  aiAppendMessage('bot', '✅ Coze Bot 配置已保存！现在 **'+AI_BOT_CONFIG.name+'** 可以为你智能解答了。\n\n试试问我一个问题吧 😊');
}

// ═══ AI 助手拖拽系统（Drag & Drop）═══
(function(){
  var DRAG_THRESHOLD = 5; // 像素，超过此距离才视为拖拽（区分点击和拖拽）
  var EDGE_MARGIN = 8;    // 距屏幕边缘最小距离
  var STORAGE_KEY = 'ai_fab_position';

  function initAiDrag(){
    var wrapper = document.getElementById('aiChatWrapper');
    var fab = document.getElementById('aiChatFab');
    var header = document.getElementById('aiChatHeader');
    if(!wrapper || !fab) return;

    var isDragging = false;
    var startX, startY, startLeft, startTop;
    var hasMoved = false; // 是否真的发生了拖动

    // ── 恢复保存的位置 ──
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(saved && typeof saved.left === 'number' && typeof saved.top === 'number'){
        // 确保位置在可视区域内
        var vw = window.innerWidth, vh = window.innerHeight;
        var safeLeft = Math.max(EDGE_MARGIN, Math.min(saved.left, vw - 60));
        var safeTop = Math.max(EDGE_MARGIN, Math.min(saved.top, vh - 60));
        wrapper.style.left = safeLeft + 'px';
        wrapper.style.top = safeTop + 'px';
        wrapper.style.right = 'auto';
        wrapper.style.bottom = 'auto';
      }
    } catch(e){}

    // ── 拖拽开始（鼠标）──
    function onPointerDown(e){
      // 忽略关闭按钮/输入框等的点击
      if(e.target.closest('.ai-chat-close') || e.target.closest('.ai-chat-send') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('button:not(.ai-chat-fab)')) return;
      e.preventDefault();
      isDragging = true;
      hasMoved = false;

      var rect = wrapper.getBoundingClientRect();
      startX = e.clientX || (e.touches && e.touches[0].clientX);
      startY = e.clientY || (e.touches && e.touches[0].clientY);
      startLeft = rect.left;
      startTop = rect.top;

      wrapper.classList.add('ai-dragging');
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchmove', onPointerMove, {passive:false});
      document.addEventListener('touchend', onPointerUp);
    }

    // ── 拖拽中 ──
    function onPointerMove(e){
      if(!isDragging) return;
      e.preventDefault();

      var cx = e.clientX || (e.touches && e.touches[0].clientX);
      var cy = e.clientY || (e.touches && e.touches[0].clientY);
      var dx = cx - startX;
      var dy = cy - startY;

      // 超过阈值才视为拖拽
      if(!hasMoved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      hasMoved = true;

      var vw = window.innerWidth, vh = window.innerHeight;
      var wrapW = wrapper.offsetWidth || 56;
      var wrapH = wrapper.offsetHeight || 56;

      // 计算新位置 + 边界限制
      var newLeft = Math.max(EDGE_MARGIN, Math.min(startLeft + dx, vw - wrapW - EDGE_MARGIN));
      var newTop = Math.max(EDGE_MARGIN, Math.min(startTop + dy, vh - wrapH - EDGE_MARGIN));

      wrapper.style.left = newLeft + 'px';
      wrapper.style.top = newTop + 'px';
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
    }

    // ── 拖拽结束 ──
    function onPointerUp(e){
      if(!isDragging) return;
      isDragging = false;
      wrapper.classList.remove('ai-dragging');
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);

      // 保存位置
      if(hasMoved){
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            left: parseInt(wrapper.style.left),
            top: parseInt(wrapper.style.top)
          }));
        } catch(e){}
      }

      // 如果没有真正移动，则视为点击 → 切换聊天窗口
      if(!hasMoved){
        toggleAiChat();
      }
    }

    // ── 绑定事件：悬浮按钮 ──
    fab.addEventListener('mousedown', onPointerDown);
    fab.addEventListener('touchstart', onPointerDown, {passive:false});

    // ── 绑定事件：对话框头部也可拖拽 ──
    if(header){
      header.addEventListener('mousedown', onPointerDown);
      header.addEventListener('touchstart', onPointerDown, {passive:false});
    }

    // ── 窗口 resize 边界修正 ──
    window.addEventListener('resize', function(){
      if(wrapper.style.left === 'auto') return;
      var vw = window.innerWidth, vh = window.innerHeight;
      var curLeft = parseInt(wrapper.style.left) || 0;
      var curTop = parseInt(wrapper.style.top) || 0;
      var wrapW = wrapper.offsetWidth || 56;
      var wrapH = wrapper.offsetHeight || 56;
      var clampedLeft = Math.max(EDGE_MARGIN, Math.min(curLeft, vw - wrapW - EDGE_MARGIN));
      var clampedTop = Math.max(EDGE_MARGIN, Math.min(curTop, vh - wrapH - EDGE_MARGIN));
      if(clampedLeft !== curLeft || clampedTop !== curTop){
        wrapper.style.left = clampedLeft + 'px';
        wrapper.style.top = clampedTop + 'px';
      }
    });
  }

  // DOM Ready 后初始化
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAiDrag);
  } else {
    initAiDrag();
  }
})();

// ═══ Init ═══
document.addEventListener('DOMContentLoaded', function(){
  // 0. 初始化交互增强模块
  initLightbox();
  injectSidebarToggle();
  restoreModuleCollapseState();

  // 0.1 Mermaid 区域默认折叠
  var mermaidBody = document.getElementById('mermaidBody');
  var mermaidChevron = document.getElementById('mermaidChevron');
  if(mermaidBody){
    mermaidBody.style.overflow = 'hidden';
    mermaidBody.style.maxHeight = '0';
    mermaidBody.style.opacity = '0';
  }
  if(mermaidChevron) mermaidChevron.style.transform = 'rotate(90deg)';

  // 1. 从 sidebar.json 构建侧边栏
  fetch('sidebar.json').then(function(r){return r.json();}).then(function(data){
    buildSidebar(data);
    // 2. 初始化搜索（会同时加载 index.json）
    initSearch();
    // 3. 处理 hash 路由
    setupScrollSpy();
    // 【Bug 2 修复】先尝试导航到 hash 页面（侧边栏按钮/文档内容依赖 pageRegistry 已就绪）
    // 但由于 indexData 尚在异步加载，detailMetaBar 可能缺失，需在 indexData 就绪后补刷
    var hash=location.hash.slice(1);
    if(hash) navigate(hash);
    // 保存 hash 供 initSearch 回调后补刷 detailMetaBar
    window._pendingHash=hash||'';
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
