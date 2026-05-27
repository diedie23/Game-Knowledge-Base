// ═══ 游戏项目知识库 Service Worker v3.0 ═══
// 支持离线访问已浏览过的文档

var CACHE_NAME = 'kb-cache-v3';
var PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './analytics.js',
  './sidebar.json',
  './index.json'
];

// 安装阶段 - 预缓存核心资源
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching core assets');
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// 激活阶段 - 清理旧缓存
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// 请求拦截 - Network First + Cache Fallback 策略
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  
  // 只缓存同源请求和GET请求
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.href.includes('cdn.jsdelivr.net')) return;
  
  // CDN资源使用 Cache First 策略
  if (url.href.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 本地资源使用 Network First 策略（保持内容最新）
  // 对 HTML/JS/CSS 文件强制跳过浏览器 HTTP 缓存
  var fetchOpts = {};
  if (url.pathname.match(/\.(html|js|css|json)(\?|$)/)) {
    fetchOpts = { cache: 'no-cache' };
  }
  event.respondWith(
    fetch(event.request, fetchOpts).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // 网络失败时从缓存返回
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        // 对于HTML页面请求，返回离线页面（主index）
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
        return new Response('离线不可用', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
