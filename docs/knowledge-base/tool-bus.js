/**
 * ═══════════════════════════════════════════════════════
 *   Tool Bus v1.0
 *   美术在线工具间通信总线
 * ═══════════════════════════════════════════════════════
 *
 * 基于 BroadcastChannel API 实现跨标签页实时通信。
 * 支持场景：
 *   - Mask 工具 → 换色工具 传递遮罩图
 *   - 通道打包 ← 多个工具传递单通道图
 *   - 任意工具间传递画布/数据
 *
 * 用法：
 *   <script src="tool-bus.js"></script>
 *
 *   // 注册当前工具
 *   ToolBus.register('mask-tool', { name: 'Mask 手动编辑器' });
 *
 *   // 监听消息
 *   ToolBus.on('image-transfer', (data) => {
 *     // data = { from: 'color-swap-tool', imageData: '...', ... }
 *   });
 *
 *   // 发送消息（广播给所有已打开的工具）
 *   ToolBus.emit('image-transfer', { imageData: canvas.toDataURL() });
 *
 *   // 发送给特定工具
 *   ToolBus.send('channel-packer', 'channel-data', { channel: 'R', data: ... });
 *
 *   // 请求-响应模式
 *   const result = await ToolBus.request('mask-tool', 'get-mask', { layer: 0 });
 *
 *   // 查询在线工具列表
 *   const peers = await ToolBus.getPeers();
 */
;(function(global) {
  'use strict';

  const CHANNEL_NAME = 'game-kb-tool-bus';
  const HEARTBEAT_INTERVAL = 3000; // ms
  const PEER_TIMEOUT = 10000; // ms

  let channel = null;
  let selfId = null;
  let selfMeta = {};
  let heartbeatTimer = null;
  const listeners = new Map();  // event -> Set<callback>
  const peers = new Map();      // peerId -> { meta, lastSeen }
  const pendingRequests = new Map(); // requestId -> { resolve, reject, timer }

  /**
   * 注册当前工具到总线
   * @param {string} id - 工具唯一标识 (如 'mask-tool', 'color-swap-tool')
   * @param {object} [meta] - 元信息 { name, version, ... }
   */
  function register(id, meta) {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[ToolBus] BroadcastChannel not supported');
      return;
    }

    selfId = id;
    selfMeta = meta || {};

    // 创建频道
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = handleMessage;

    // 开始心跳
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    sendHeartbeat();

    // 广播上线
    broadcast({ type: '__online', from: selfId, meta: selfMeta, ts: Date.now() });

    // 页面关闭时发送离线通知
    window.addEventListener('beforeunload', () => {
      broadcast({ type: '__offline', from: selfId, ts: Date.now() });
      if (channel) channel.close();
    });
  }

  function handleMessage(e) {
    const msg = e.data;
    if (!msg || !msg.type) return;

    // 忽略自己发的
    if (msg.from === selfId) return;

    switch (msg.type) {
      case '__heartbeat':
      case '__online':
        peers.set(msg.from, { meta: msg.meta || {}, lastSeen: Date.now() });
        // 回复 online（让新上线的工具知道我存在）
        if (msg.type === '__online') {
          broadcast({ type: '__heartbeat', from: selfId, meta: selfMeta, ts: Date.now() });
        }
        break;

      case '__offline':
        peers.delete(msg.from);
        break;

      case '__request':
        // 处理请求
        if (msg.to === selfId) {
          handleRequest(msg);
        }
        break;

      case '__response':
        // 处理响应
        if (msg.to === selfId && pendingRequests.has(msg.requestId)) {
          const { resolve, timer } = pendingRequests.get(msg.requestId);
          clearTimeout(timer);
          pendingRequests.delete(msg.requestId);
          resolve(msg.result);
        }
        break;

      default:
        // 用户自定义事件
        if (msg.to && msg.to !== selfId) return; // 不是发给我的
        const cbs = listeners.get(msg.type);
        if (cbs) cbs.forEach(cb => {
          try { cb(msg.data, msg); } catch(err) { console.error('[ToolBus] Listener error:', err); }
        });
        break;
    }
  }

  function handleRequest(msg) {
    const cbs = listeners.get(msg.event);
    if (!cbs || cbs.size === 0) {
      broadcast({ type: '__response', from: selfId, to: msg.from, requestId: msg.requestId, result: null });
      return;
    }
    // 调用第一个监听器作为请求处理器
    const handler = cbs.values().next().value;
    Promise.resolve(handler(msg.data, msg)).then(result => {
      broadcast({ type: '__response', from: selfId, to: msg.from, requestId: msg.requestId, result });
    });
  }

  function sendHeartbeat() {
    broadcast({ type: '__heartbeat', from: selfId, meta: selfMeta, ts: Date.now() });
    // 清理超时 peers
    const now = Date.now();
    for (const [id, info] of peers) {
      if (now - info.lastSeen > PEER_TIMEOUT) peers.delete(id);
    }
  }

  function broadcast(msg) {
    if (channel) channel.postMessage(msg);
  }

  /**
   * 监听事件
   * @param {string} event - 事件名
   * @param {Function} callback
   */
  function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
  }

  /**
   * 取消监听
   */
  function off(event, callback) {
    if (listeners.has(event)) {
      if (callback) listeners.get(event).delete(callback);
      else listeners.delete(event);
    }
  }

  /**
   * 广播事件给所有工具
   * @param {string} event - 事件名
   * @param {*} data - 数据
   */
  function emit(event, data) {
    broadcast({ type: event, from: selfId, data, ts: Date.now() });
  }

  /**
   * 发送给特定工具
   * @param {string} targetId - 目标工具ID
   * @param {string} event - 事件名
   * @param {*} data - 数据
   */
  function send(targetId, event, data) {
    broadcast({ type: event, from: selfId, to: targetId, data, ts: Date.now() });
  }

  /**
   * 请求-响应模式
   * @param {string} targetId - 目标工具ID
   * @param {string} event - 事件名
   * @param {*} data - 请求数据
   * @param {number} [timeout=5000] - 超时时间 ms
   * @returns {Promise<*>}
   */
  function request(targetId, event, data, timeout) {
    timeout = timeout || 5000;
    const requestId = selfId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`[ToolBus] Request to ${targetId}:${event} timed out`));
      }, timeout);
      pendingRequests.set(requestId, { resolve, reject, timer });
      broadcast({ type: '__request', from: selfId, to: targetId, event, data, requestId, ts: Date.now() });
    });
  }

  /**
   * 获取在线 peers 列表
   * @returns {Array<{id, meta, lastSeen}>}
   */
  function getPeers() {
    const result = [];
    for (const [id, info] of peers) {
      result.push({ id, ...info });
    }
    return result;
  }

  /**
   * 发送画布图像到另一个工具
   * @param {string} targetId - 目标工具ID
   * @param {HTMLCanvasElement} canvas - 画布
   * @param {object} [meta] - 附加信息 { label, width, height, ... }
   */
  function sendCanvas(targetId, canvas, meta) {
    const data = {
      imageDataURL: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      ...(meta || {})
    };
    send(targetId, 'image-transfer', data);
  }

  /**
   * 便捷：监听画布传入
   * @param {Function} callback - (data: {imageDataURL, width, height, ...}, msg)
   */
  function onImageTransfer(callback) {
    on('image-transfer', callback);
  }

  // 暴露全局 API
  global.ToolBus = {
    register, on, off, emit, send, request,
    getPeers, sendCanvas, onImageTransfer,
    get selfId() { return selfId; },
    get peers() { return peers; }
  };

})(typeof window !== 'undefined' ? window : this);
