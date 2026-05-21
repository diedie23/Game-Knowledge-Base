/**
 * =====================================================
 *  APM 知识库 — 前端访客数据采集脚本
 *  功能：静默记录页面访问 + 停留时间 + SPA Hash 路由追踪
 * =====================================================
 *
 *  使用方式：在 index.html 的 </body> 前引入
 *  <script src="analytics.js"></script>
 *
 *  配置：修改下方 API_BASE 为你的 Worker 地址
 */

(function() {
  'use strict';

  // ═══ 配置 ═══
  // 部署 Worker 后替换为你的实际地址，如：https://apm-analytics.your-name.workers.dev
  var API_BASE = 'https://apm-analytics.yzing054.workers.dev';

  // ═══ 状态管理 ═══
  var currentVisitId = null;   // 当前访问记录ID
  var enterTime = Date.now();  // 当前页面进入时间
  var lastPage = '';           // 上一个页面路径

  // ═══ 获取当前页面路径（Hash 路由适配）═══
  function getPagePath() {
    var hash = location.hash.slice(1) || 'home';
    return '/' + hash;
  }

  // ═══ 获取页面标题 ═══
  function getPageTitle() {
    var hash = location.hash.slice(1) || '';
    // 尝试从侧边栏活跃节点获取标题
    var activeLeaf = document.querySelector('.leaf.active .leaf-text');
    if (activeLeaf) return activeLeaf.textContent.trim();
    // 尝试从面包屑获取
    var bcCurrent = document.querySelector('.bc-current');
    if (bcCurrent) return bcCurrent.textContent.trim();
    // 回退到 hash
    return hash || 'home';
  }

  // ═══ 上报访问记录 ═══
  function trackPageView() {
    var path = getPagePath();
    // 避免重复上报同一页面
    if (path === lastPage) return;

    // 先上报上一个页面的停留时间
    reportLeave();

    lastPage = path;
    enterTime = Date.now();

    // 延迟 300ms 等待页面渲染完成后再获取标题
    setTimeout(function() {
      var payload = {
        path: path,
        title: getPageTitle(),
        referrer: document.referrer || ''
      };

      sendBeacon('/api/track', payload, function(resp) {
        if (resp && resp.id) {
          currentVisitId = resp.id;
        }
      });
    }, 300);
  }

  // ═══ 上报离开/停留时间 ═══
  function reportLeave() {
    if (!currentVisitId) return;
    var duration = Math.round((Date.now() - enterTime) / 1000);
    if (duration < 1) return; // 不到 1 秒不上报

    // 使用 sendBeacon 确保页面关闭时也能发送
    var payload = { id: currentVisitId, duration: duration };
    sendBeacon('/api/leave', payload);
    currentVisitId = null;
  }

  // ═══ 网络请求封装（兼容 sendBeacon 和 fetch）═══
  function sendBeacon(endpoint, data, callback) {
    var url = API_BASE + endpoint;
    var body = JSON.stringify(data);

    // 优先使用 fetch（支持回调）
    if (callback) {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true  // 页面关闭时也能发送
        }).then(function(r) { return r.json(); })
          .then(callback)
          .catch(function() {});
      } catch(e) {}
      return;
    }

    // 无回调时使用 navigator.sendBeacon（更可靠的离开时上报）
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      } catch(e) {}
    }

    // 最终回退到 fetch
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function() {});
    } catch(e) {}
  }

  // ═══ 监听事件 ═══

  // 1. 初始页面加载
  if (document.readyState === 'complete') {
    trackPageView();
  } else {
    window.addEventListener('load', trackPageView);
  }

  // 2. SPA Hash 路由切换
  window.addEventListener('hashchange', function() {
    // 延迟一帧确保 navigate() 先执行完
    requestAnimationFrame(trackPageView);
  });

  // 3. 页面关闭/切换标签时上报停留时间
  window.addEventListener('beforeunload', reportLeave);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      reportLeave();
    } else if (document.visibilityState === 'visible') {
      // 标签页重新激活时，重新开始计时
      enterTime = Date.now();
      if (!currentVisitId) {
        trackPageView();
      }
    }
  });

  // ═══ 全局暴露（供管理员页面使用）═══
  window.__APM_ANALYTICS_API = API_BASE;

  // ═══ 搜索行为追踪（记录搜索失败关键词，用于内容运营） ═══
  var SEARCH_LOG_KEY = 'apm_search_log';
  var SEARCH_LOG_MAX = 200; // 本地最多保留 200 条

  /**
   * 记录一次搜索事件
   * @param {string} query - 用户搜索词
   * @param {number} resultCount - 搜索结果数量
   * @param {string} source - 搜索来源：'sidebar'|'hero'|'ai'|'command'
   */
  function trackSearch(query, resultCount, source) {
    if (!query || query.length < 2) return;
    try {
      var logs = JSON.parse(localStorage.getItem(SEARCH_LOG_KEY) || '[]');
      logs.unshift({
        q: query.trim().substring(0, 50),
        n: resultCount,
        s: source || 'sidebar',
        t: Date.now()
      });
      // 保留最近 200 条
      if (logs.length > SEARCH_LOG_MAX) logs = logs.slice(0, SEARCH_LOG_MAX);
      localStorage.setItem(SEARCH_LOG_KEY, JSON.stringify(logs));

      // 如果搜索失败（0结果），额外向 Worker 上报（可选，需后端配合）
      if (resultCount === 0) {
        sendBeacon('/api/track', {
          path: '/search-miss',
          title: 'SearchMiss: ' + query.trim().substring(0, 50),
          referrer: ''
        });
      }
    } catch(e) {}
  }

  /**
   * 获取搜索失败热词排行（供管理员面板使用）
   * @param {number} topN - 返回前 N 个高频失败词
   * @returns {Array} [{query, count}]
   */
  function getSearchMissReport(topN) {
    try {
      var logs = JSON.parse(localStorage.getItem(SEARCH_LOG_KEY) || '[]');
      var missMap = {};
      logs.forEach(function(log) {
        if (log.n === 0) {
          var key = log.q.toLowerCase();
          missMap[key] = (missMap[key] || 0) + 1;
        }
      });
      var sorted = Object.keys(missMap).map(function(k) {
        return { query: k, count: missMap[k] };
      }).sort(function(a, b) { return b.count - a.count; });
      return sorted.slice(0, topN || 20);
    } catch(e) { return []; }
  }

  /**
   * 获取搜索使用统计摘要
   * @returns {Object} {total, hits, misses, hitRate, topMissed}
   */
  function getSearchStats() {
    try {
      var logs = JSON.parse(localStorage.getItem(SEARCH_LOG_KEY) || '[]');
      var total = logs.length;
      var misses = logs.filter(function(l) { return l.n === 0; }).length;
      return {
        total: total,
        hits: total - misses,
        misses: misses,
        hitRate: total > 0 ? Math.round((total - misses) / total * 100) : 0,
        topMissed: getSearchMissReport(10)
      };
    } catch(e) { return { total: 0, hits: 0, misses: 0, hitRate: 0, topMissed: [] }; }
  }

  // 暴露全局搜索追踪 API
  window.__APM_TRACK_SEARCH = trackSearch;
  window.__APM_SEARCH_MISS_REPORT = getSearchMissReport;
  window.__APM_SEARCH_STATS = getSearchStats;

  console.log('[Analytics] 访客追踪已启用');
  console.log('[Analytics] 搜索行为追踪已启用 (管理员可用 __APM_SEARCH_STATS() 查看)');
})();
