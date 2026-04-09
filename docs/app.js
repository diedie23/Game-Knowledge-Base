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
  'auto-mask-v6':{icon:'🤖',iconBg:'var(--cyan-bg)',name:'自动 Mask 生成器',ver:'v6.0',status:'online',subtitle:'傻瓜式预设 · 智能分析 · 放大镜 · 边缘净化 · 撤销重做 · TGA',desc:'v6.0 重大升级：① 5种一键预设（标准三色/头发眼睛/UI精度/特效/场景物件）② 智能主色调分析（色相分bin）③ 放大镜精准吸色+浮空反馈 ④ 术语大白话Tooltip ⑤ Ctrl+Z撤销/重做 ⑥ 边缘净化（膨胀/腐蚀/羽化/净化画笔）⑦ TGA导出 ⑧ 100%兼容v5工程 ⑨ i18n预留',tags:['在线工具','预设模式','智能分析','放大镜','边缘净化','TGA','撤销重做'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-09',url:'knowledge-base/auto-mask-v6.html'},
  'auto-mask-v6-desktop':{icon:'🖥️',iconBg:'var(--cyan-bg)',name:'自动 Mask 生成器 (桌面版)',ver:'v6.0',status:'online',subtitle:'Windows 独立 exe · 绿色免安装 · 完全离线 · 原生保存 · 多图拖拽',desc:'v6.0 桌面独立版：基于 Electron 打包的 Windows exe，双击即跑。相比 Web 版新增：① 原生文件保存（静默写入指定目录）② 多图拖拽自动分配通道 ③ 保存目录持久记忆 ④ 100% 离线无网可用 ⑤ 自定义 Icon/品牌。所有核心算法与 Web 版完全一致。',tags:['桌面工具','exe下载','离线','原生保存','Electron'],env:'🖥️ Windows 桌面',platform:'Win 10 / 11',install:'免安装 exe',date:'2026-04-09',url:'knowledge-base/auto-mask-v6-desktop.html'},
  'mask-tool':{icon:'🖌️',iconBg:'var(--orange-bg)',name:'Mask 手动编辑器',ver:'v1.0',status:'online',subtitle:'画笔 / 油漆桶 / 橡皮擦 · 实时四通道预览',desc:'专为 Mask 精修设计的轻量编辑器。导入原图后直接在浏览器中用画笔逐通道绘制或修改，R/G/B/A 四通道独立显示并可实时预览换色效果。',tags:['在线工具','画笔绘制','RGBA预览','所见即所得'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-03-31',url:'knowledge-base/mask-tool.html'},
  'spine-split':{icon:'✂️',iconBg:'var(--purple-bg)',name:'Spine 角色拆分工具',ver:'v3.0',status:'online',subtitle:'自定义模板 · 三点锚点对齐 · 多选镜像 · Alpha收缩',desc:'上传角色原画，选择/自制模板后通过三点锚点对齐自适应不同头身比。支持多选镜像操作、Alpha边缘收缩、拓扑延展，导出 ZIP 包含 Spine JSON。',tags:['在线工具','自定义模板','三点对齐','镜像操作','Alpha收缩'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/spine-split.html'},
  'mask-core-algorithms':{icon:'🧪',iconBg:'var(--accent-bg)',name:'Mask 核心算法演示',ver:'v2.0',status:'online',subtitle:'智能魔棒 Flood Fill · 边缘保护画笔 Sobel · Web Worker 并行',desc:'工业级 Mask 绘制的两大核心算法实现：基于扫描线的非递归 Flood Fill 魔棒（HSV/RGB 容差+高斯羽化），以及 Sobel 边缘检测驱动的自动"不出界"画笔。全部在 Worker 中并行计算。',tags:['在线工具','魔棒','Flood Fill','Sobel','边缘检测','Web Worker','Float32'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-02',url:'knowledge-base/mask-core-algorithms.html'},
  'editor-guide':{icon:'✏️',iconBg:'var(--green-bg)',name:'可视化编辑器使用指南',ver:'v1.0',status:'online',subtitle:'零代码更新知识库文档 · 所见即所得编辑 · 保存/另存为 · 防破坏保护',desc:'面向非技术同学的知识库文档可视化编辑指南。点击「编辑模式」即可直接修改文字和图片，支持保存覆盖/另存为新文档，排版结构自动保护不会被破坏。',tags:['使用指南','可视化编辑','零代码','模板'],env:'🌐 浏览器在线',platform:'Win / Mac / Linux',install:'无需安装',date:'2026-04-09',url:'knowledge-base/editor-guide.html'}
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
  'mod-quality':   { color: 'pink',    highlight: 'var(--pink)',    bg: 'var(--pink-bg)' }
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
  var projectCount=0, outsourceCount=0, craftCount=0, collabCount=0, toolchainCount=0, qualityCount=0;

  data.categories.forEach(function(cat){
    var itemCount=0;
    cat.groups.forEach(function(g){ itemCount += g.items ? g.items.length : 0; });

    // 按模块 ID 计数
    if(cat.id === 'mod-project')     projectCount = itemCount;
    if(cat.id === 'mod-outsource')   outsourceCount = itemCount;
    if(cat.id === 'mod-craft')       craftCount = itemCount;
    if(cat.id === 'mod-collab')      collabCount = itemCount;
    if(cat.id === 'mod-toolchain')   toolchainCount = itemCount;
    if(cat.id === 'mod-quality')     qualityCount = itemCount;

    var isOutsource = cat.id === 'mod-outsource';
    var isCollab = cat.id === 'mod-collab';
    var isQuality = cat.id === 'mod-quality';

    // 获取纯文本名称（去掉 Emoji 前缀）
    var catName = cat.name.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/u, '');
    // 一级模块 Emoji 图标（从 JSON icon 字段读取）
    var catEmoji = cat.icon || '📁';

    var extraCls = isOutsource ? ' t1-outsource' : isCollab ? ' t1-collab' : isQuality ? ' t1-quality' : '';
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
  if(numEls[0]) numEls[0].textContent = projectCount + ' 篇';
  if(numEls[1]) numEls[1].textContent = outsourceCount + ' 篇';
  if(numEls[2]) numEls[2].textContent = craftCount + ' 篇';
  if(numEls[3]) numEls[3].textContent = collabCount + ' 篇';
  if(numEls[4]) numEls[4].textContent = toolchainCount + ' 个';
  if(numEls[5]) numEls[5].textContent = qualityCount + ' 篇';

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
      // 普通模式：滚动 #contentScroll
      scrollEl.scrollTo({top:0,behavior:'smooth'});
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
  // HTML 模板处理
  if(key && htmlTemplates[key]){
    var htmlContent=htmlTemplates[key];
    var fileName=getEditorFileName();
    if(!fileName.endsWith('.html')) fileName+='.html';
    var blob=new Blob([htmlContent],{type:'text/html;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=fileName;
    a.click();
    URL.revokeObjectURL(a.href);
    alert('HTML 模板已下载为「'+fileName+'」，你可以将该文件放入 knowledge-base 目录后在 sidebar.json 中注册。');
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
    // 尝试触发 editor-kit.js 中的 enterEdit 函数
    if(frame.contentWindow.enterEdit){
      frame.contentWindow.enterEdit();
    } else {
      // 如果没有 editor-kit，尝试点击 iframe 内的编辑按钮
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
  var moduleOrder = ['project','outsource','craft','collab','toolchain','quality'];
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
  // 板块一：📋 项目管理与排期
  'grid-project-pipeline':   { module:'project', ids:['game-art-pipeline'] },
  'grid-project-schedule':   { module:'project', ids:['art-scheduling','progress-visualization'] },
  'grid-project-req':        { module:'project', ids:['art-vs-planner-req','art-vs-planner-template','jira-tapd-automation'] },
  'grid-project-version':    { module:'project', ids:['svn-perforce-structure','asset-submit-review','deprecated-asset-cleanup'] },
  // 板块二：📦 外包全链路管理
  'grid-outsource-eval':     { module:'outsource', ids:['cp-outsource','cp-management'] },
  'grid-outsource-workload': { module:'outsource', ids:['outsource-workload-model'] },
  'grid-outsource-budget':   { module:'outsource', ids:['budget-apply','cost-standard'] },
  // 板块三：🎨 美术工艺与规范
  'grid-craft-char':         { module:'craft', ids:['d1','d2','ugc-character-spec','color-swap-spec','auto-mask-spec','spine-split-spec'] },
  'grid-craft-ui':           { module:'craft', ids:['ui-slice-naming','ui-9slice-color','ui-layout','ui-umg-tips'] },
  'grid-craft-scene':        { module:'craft', ids:['scene-lod-spec'] },
  'grid-craft-vfx':          { module:'craft', ids:['vfx-perf-spec'] },
  'grid-craft-anim':         { module:'craft', ids:['anim-state-handoff'] },
  // 板块四：🤝 跨部门协同与交付
  'grid-collab-ta':          { module:'collab', ids:['art-vs-ta-naming','art-vs-ta-perfbudget','spine-perf-guide','perf-redline-glossary'] },
  'grid-collab-qa':          { module:'collab', ids:['art-vs-qa-buggrade','art-vs-qa-checklist'] },
  'grid-collab-pain':        { module:'collab', ids:['cross-dept-collab','accident-troubleshoot','cross-dept-communication-tips'] },
  // 板块五：🛠️ 工具链与自动化
  'grid-toolchain-check':    { module:'toolchain', ids:['naming-check-tool'] },
  'grid-toolchain-art':      { module:'toolchain', ids:['auto-mask-v6','mask-tool','spine-split','mask-core-algorithms','channel-packer','editor-guide'] },
  'grid-toolchain-desktop':  { module:'toolchain', ids:['auto-mask-v6-desktop','image-skew-corrector','game-resource-toolkit','engine-bridge'] },
  // 板块六：🛡️ 质量、风险与团队
  'grid-quality-risk':       { module:'quality', ids:['risk-log'] },
  'grid-quality-retro':      { module:'quality', ids:['postmortem-template','project-pitfall-log'] },
  'grid-quality-metrics':    { module:'quality', ids:['art-efficiency-metrics','art-report-template'] },
  'grid-quality-security':   { module:'quality', ids:['asset-security-handover'] },
  'grid-quality-team':       { module:'quality', ids:['onboarding-guide','permission-nav','personal-growth-roadmap'] }
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
      if(config.module==='outsource') iconBg='var(--orange-bg)';
      if(config.module==='craft') iconBg='var(--purple-bg)';
      if(config.module==='collab') iconBg='var(--green-bg)';
      if(config.module==='toolchain') iconBg='var(--cyan-bg)';
      if(config.module==='quality') iconBg='var(--pink-bg)';
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

  // 判断是否为工具类页面（美术在线工具 / 桌面工具 & 引擎直连）
  var reg=pageRegistry[pageId]||{};
  var isToolPage=false;
  if(reg.grpName){
    var grp=reg.grpName;
    if(grp==='美术在线工具'||grp==='桌面工具 & 引擎直连') isToolPage=true;
  }
  // toolData 中的页面也视为工具页
  if(toolData[pageId]) isToolPage=true;

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
  // 仅普通文档页面显示编辑模式按钮（MD 或 HTML iframe 文档）
  if(!isToolPage){
    if(reg.type==='md'){
      html+='<button class="dm-btn dm-btn-edit" onclick="editDocument(\''+pageId+'\')" title="编辑模式">✏️ 编辑模式</button>';
      html+='<button class="dm-btn dm-btn-danger" onclick="confirmDeleteDocument(\''+pageId+'\')" title="删除文档">🗑️ 删除</button>';
    } else if(reg.type==='iframe'&&reg.file){
      html+='<button class="dm-btn dm-btn-edit" onclick="enterIframeEditMode(\''+pageId+'\')" title="编辑模式">✏️ 编辑模式</button>';
    }
  }
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

// ═══ 首页板块折叠/展开 ═══
function toggleModuleSection(headerEl){
  var section = headerEl.closest('.module-section');
  if(!section) return;
  var body = section.querySelector('.module-body');
  if(!body) return;

  if(section.classList.contains('collapsed')){
    // 展开
    section.classList.remove('collapsed');
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity = '1';
    body.style.overflow = 'hidden';
    var onEnd = function(e){
      if(e.target !== body) return;
      body.style.maxHeight = 'none';
      body.style.overflow = '';
      body.removeEventListener('transitionend', onEnd);
    };
    body.addEventListener('transitionend', onEnd);
  } else {
    // 折叠
    body.style.maxHeight = body.scrollHeight + 'px';
    body.offsetHeight; // 强制回流
    body.style.overflow = 'hidden';
    section.classList.add('collapsed');
    body.style.maxHeight = '0';
    body.style.opacity = '0';
  }
}

// ═══ Mermaid 可视化图折叠/展开 ═══
var mermaidCollapsed = false;
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
    if(btn) btn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if(btn) btn.title='展开侧边栏';
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    main.classList.remove('main-expanded');
    if(btn) btn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if(btn) btn.title='收起侧边栏';
  }
}
function injectSidebarToggle(){
  var header=document.querySelector('.sidebar-header');
  if(!header) return;
  var btn=document.createElement('button');
  btn.id='sidebarCollapseBtn';
  btn.className='sidebar-collapse-btn';
  btn.title='收起侧边栏';
  btn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  btn.onclick=toggleSidebarCollapse;
  header.style.position='relative';
  header.appendChild(btn);
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

// ═══ Init ═══
document.addEventListener('DOMContentLoaded', function(){
  // 0. 初始化交互增强模块
  initLightbox();
  injectSidebarToggle();
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
