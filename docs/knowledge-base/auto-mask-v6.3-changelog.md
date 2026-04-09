# 🤖 自动 Mask 通道生成器 v6.3 — 版本更新说明

> **核心升级**：修复裁剪面板黑屏 Bug，引入新手/专家双模式，场景化傻瓜预设，全面大白话 Tooltip。

---

## 🐛 Bug 修复

### 裁剪面板黑屏 + NaN 坐标（严重 Bug）

| 项目 | 详情 |
|------|------|
| **现象** | 点击裁剪后面板黑屏，状态栏显示 `裁剪: NaNx1001 偏移: NaN, 125 缩放: 0.00x` |
| **根因** | `M.Crop.open()` 在弹窗 `display:none` 时获取 `wrap.clientWidth`，返回 0；后续 `0/img.width = 0` 导致缩放为 0，坐标计算全部变成 NaN |
| **修复方案** | 1. **先设 `display:flex`** 让弹窗可见<br>2. 用 **双层 `requestAnimationFrame`** 确保浏览器完成 layout<br>3. 然后获取容器尺寸并初始化<br>4. 所有计算加 `isFinite()` 防御性检查 |

**修复前后代码对比**：

```javascript
// ❌ v6.2（Bug）：弹窗不可见时获取尺寸
open: function(img, title) {
  var wrap = $('cropV2Wrap');
  st.containerW = wrap.clientWidth;      // ← display:none 时 = 0！
  var fitS = Math.min(st.containerW / img.width, ...); // → 0/w = 0
  st.vPanX = (st.containerW - img.width * fitS) / 2;   // → NaN
  // ... 后面才设 display:flex
  $('cropOv').style.display = 'flex';
}

// ✅ v6.3（修复）：先显示，等布局，再计算
open: function(img, title) {
  $('cropOv').style.display = 'flex';    // ★ 先显示
  requestAnimationFrame(function() {     // ★ 等一帧
    requestAnimationFrame(function() {
      st.containerW = wrap.clientWidth || 700;  // 有默认值
      var fitS = Math.min(...);
      if (!isFinite(fitS) || fitS <= 0) fitS = 1; // 防御
      // ...
    })
  })
}
```

---

## 🆕 核心优化 1：新手/专家双模式

### 设计理念

| 模式 | 目标用户 | 显示内容 |
|------|----------|----------|
| 🌱 **新手模式** (默认) | 刚入行的小白 | 只显示一个「颜色抓取范围」滑块 + 可视化进度条 |
| 🔧 **专家模式** | 资深 TA | 全部参数可见：HSV/LAB 切换、明度权重、色相容差、饱和度下限等 |

### 交互逻辑

1. 右侧面板顶部有一个 **模式切换开关**（toggle）
2. 新手模式下，所有高级参数被 CSS `max-height:0` 折叠隐藏
3. 新手模式下也可以点「⚙️ 展开高级设置」临时查看
4. 切到专家模式：开关滑到右边变蓝，所有参数自动展开

### DOM 结构

```html
<div class="mode-switch-bar">
  <span class="mode-name">🌱 新手模式</span>
  <div class="mode-toggle" onclick="M.Mode.toggle()"></div>
  <span class="mode-desc">只显示核心参数，一拖就懂</span>
</div>

<!-- 简化容差（始终显示） -->
<div id="ezTolWrap">
  <input type="range" id="pDE" ...>  <!-- 颜色抓取范围 -->
  <div class="ez-tol-visual">...</div>  <!-- 可视化进度条 -->
  <div id="ezTolDesc">当前：标准匹配...</div>  <!-- 大白话描述 -->
</div>

<button class="adv-toggle-btn" onclick="M.Mode.toggleAdv()">
  ⚙️ 展开高级设置
</button>

<div class="adv-params collapsed" id="advParams">
  <!-- 所有高级参数在这里 -->
</div>
```

---

## 🆕 核心优化 2：大白话 Tooltip

### 替换 Tooltip 对照表

| 参数 | 旧提示（v6.2） | 新提示（v6.3 大白话） |
|------|----------------|----------------------|
| 颜色抓取范围 | `CIELAB ΔE 色差...` | `颜色抓取范围。拖到左边只抓完全一样的颜色，能区分浅灰和深灰。拖到右边把相近颜色都抓进来。` |
| CIELAB ΔE | *无详细解释* | `一种模拟「人眼看颜色」的算法。普通算法分不清浅灰和深灰，但 CIELAB 可以。就像你能看出银色和灰色不同一样。` |
| HSV 色相距离 | *无* | `只看颜色的「色调」，不管亮暗。⚠️ 无法区分浅灰和深灰。只有特殊需求时才用。` |
| 明度权重 | `L* weight 1.0x/2.0x/3.0x` | `对亮度差的敏感度。如果图上有很多灰色要区分，拖到 2.0x 以上。` |
| 色相容差 | `色相范围` | `色调的抓取范围。±20° 只抓正红色，±40° 连橙红粉红都抓。` |
| 饱和度下限 | `过滤灰色` | `过滤灰色。值越高越只抓鲜艳色。需要抓灰色记得调到 0。` |
| 边缘平滑 | `边界柔和度` | `让边界更柔和（像 PS 羽化）。做角色建议 2px，UI 图标建议 0。` |
| 提取色数 | *无* | `提取多少种颜色？一般选 4 够了，灰色系贴图试 8。` |
| 强制区分明度 | *无* | `开启后浅灰和深灰被强制拆成两个独立颜色。` |

### 新 Tooltip 组件 `.ez-tip`

```css
.ez-tip {
  width: 15px; height: 15px;
  border-radius: 50%;
  background: rgba(74,222,128,.15);
  color: var(--green);
}
.ez-tip:hover .ez-pop { display: block; }
```

与旧版 `.tw .tt .tb` 的区别：
- 绿色主题（而非蓝色），暗示「帮助」
- 更宽的内容区（260px）
- 每条提示底部都有「💡 小贴士」示例
- 箭头指向图标（CSS 伪元素三角形）

---

## 🆕 核心优化 3：场景化傻瓜预设

### 三个场景按钮

| 预设 | 适用场景 | 关键参数 |
|------|---------|---------|
| 🎨 **二次元角色** | 赛璐璐/扁平上色立绘 | CIELAB, ΔE=20, Lw=1.0, 色相±30°, 饱和度10%, 自动分析 |
| 🏢 **写实场景/物件** | 写实风格贴图/PBR材质 | CIELAB, ΔE=8, Lw=2.2, 色相±15°, 饱和度25%, 强制区分明度, 8色 |
| ✨ **特效/半透明** | 发光/特效/半透明 | CIELAB, ΔE=25, Lw=1.0, 色相±40°, 饱和度5%, 边缘净化 |

### 参数配置字典

```javascript
M.Cfg.SCENE = [
  {
    k: 'anime', n: '🎨 二次元角色',
    tolMode: 'lab', de: 20, lw: 10,
    ht: 30, sm: 10, es: 2,
    am: 'alpha', ad: true, strict: false, amax: 4
  },
  {
    k: 'realistic', n: '🏢 写实场景/物件',
    tolMode: 'lab', de: 8, lw: 22,
    ht: 15, sm: 25, es: 1,
    am: 'pick', ad: true, strict: true, amax: 8
  },
  {
    k: 'vfx', n: '✨ 特效/半透明',
    tolMode: 'lab', de: 25, lw: 10,
    ht: 40, sm: 5, es: 3,
    am: 'alpha', ad: false, strict: false, amax: 4,
    er: { di: 1, ero: 0, fe: 2, rs: 60 }
  }
];
```

### 多通道引导提示

在「添加自定义通道」按钮下方新增：

> 💡 **提示**：基础 RGBA 四个通道一般够用。如果你的项目需要更多区分（比如「头发高光」「瞳孔」单独做 Mask），才需要添加自定义通道。超过 4 通道时，导出会自动打包成多张贴图。

---

## 📊 修改统计

| 文件 | 变更 |
|------|------|
| `auto-mask-v6.html` | +180 行新增，~50 行修改 |
| `auto-mask-v6.3-changelog.md` | 新建 |

---

## 🔄 向后兼容

- v6.2 工程文件 (JSON) 可直接导入 v6.3，所有 tolMode/lab/deltaE 字段完全兼容
- v6.0/v5 工程也兼容（默认 HSV 模式）
- 旧版预设卡片保留在场景预设下方，不影响已有工作流
