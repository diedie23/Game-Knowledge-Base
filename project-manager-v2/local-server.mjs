import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(directory, '../docs/project-manager-v2');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const appPrefix = '/Game-Knowledge-Base/project-manager-v2';
const tapdTarget = new URL(process.env.TAPD_API_TARGET || 'https://apiv2.tapd.woa.com');
const mcpTarget = new URL(process.env.MCP_GATEWAY_TARGET || 'https://mcpgw.knot.woa.com');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendText(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(text);
}

function proxyRequest(req, res, target, targetPrefix = '', sourcePrefix = '/tapd-api') {
  const incomingUrl = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
  const targetPath = `${targetPrefix}${incomingUrl.pathname.replace(new RegExp(`^${sourcePrefix}`), '') || '/'}`;
  const query = incomingUrl.search;
  const headers = { ...req.headers };
  headers.host = target.host;
  headers.connection = 'close';
  // Ask TAPD for an uncompressed body so JSON can be forwarded byte-for-byte.
  headers['accept-encoding'] = 'identity';
  delete headers['content-length'];

  const requestOptions = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 443,
    method: req.method,
    path: `${targetPath}${query}`,
    headers,
  };

  const handleResponse = upstream => {
    const responseHeaders = { ...upstream.headers };
    if (upstream.statusCode === 401 && responseHeaders['www-authenticate']) {
      responseHeaders['x-www-authenticate'] = responseHeaders['www-authenticate'];
      delete responseHeaders['www-authenticate'];
    }
    res.writeHead(upstream.statusCode || 502, responseHeaders);
    upstream.pipe(res);
  };

  const handleError = error => {
    if (!res.headersSent) {
      sendText(res, 502, `TAPD 上游连接失败：${error.message}`);
    } else {
      res.destroy(error);
    }
  };

  const startForwarding = createRequest => {
    const request = createRequest();
    request.on('error', handleError);
    req.on('aborted', () => request.destroy());
    req.pipe(request);
  };

  const proxyUrlValue = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxyUrlValue || target.protocol !== 'https:') {
    startForwarding(() => https.request(requestOptions, handleResponse));
    return;
  }

  let proxyUrl;
  try {
    proxyUrl = new URL(proxyUrlValue);
  } catch {
    sendText(res, 502, '系统 HTTPS 代理地址无效，请检查 HTTPS_PROXY 配置');
    return;
  }

  const tunnelHeaders = { Host: `${target.hostname}:${target.port || 443}` };
  if (proxyUrl.username || proxyUrl.password) {
    const proxyCredentials = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
    tunnelHeaders['Proxy-Authorization'] = `Basic ${Buffer.from(proxyCredentials).toString('base64')}`;
  }
  const proxyTransport = proxyUrl.protocol === 'https:' ? https : http;
  const connectRequest = proxyTransport.request({
    hostname: proxyUrl.hostname,
    port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
    method: 'CONNECT',
    path: `${target.hostname}:${target.port || 443}`,
    headers: tunnelHeaders,
  });

  connectRequest.on('connect', (connectResponse, socket, head) => {
    if (connectResponse.statusCode !== 200) {
      socket.destroy();
      sendText(res, 502, `系统 HTTPS 代理建立隧道失败（${connectResponse.statusCode || '未知状态'}）`);
      return;
    }
    if (head.length > 0) socket.unshift(head);
    const secureSocket = tls.connect({
      socket,
      servername: target.hostname,
    });
    secureSocket.once('secureConnect', () => {
      startForwarding(() => https.request({
        ...requestOptions,
        agent: false,
        createConnection: () => secureSocket,
      }, handleResponse));
    });
    secureSocket.on('error', handleError);
  });
  connectRequest.on('error', handleError);
  req.on('aborted', () => connectRequest.destroy());
  connectRequest.end();
}

function serveStatic(req, res, pathname) {
  let relativePath;
  if (pathname === '/' || pathname === appPrefix || pathname === `${appPrefix}/`) {
    relativePath = 'index.html';
  } else if (pathname.startsWith(`${appPrefix}/`)) {
    relativePath = pathname.slice(`${appPrefix}/`.length);
  } else {
    sendText(res, 404, 'Not Found');
    return;
  }

  let filePath;
  try {
    filePath = path.resolve(staticRoot, relativePath || 'index.html');
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) && filePath !== staticRoot) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendText(res, 404, 'Not Found');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`).pathname);
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }

  if (pathname.startsWith('/tapd-api/')) {
    proxyRequest(req, res, tapdTarget);
    return;
  }
  if (pathname.startsWith('/mcp-gateway')) {
    proxyRequest(req, res, mcpTarget, '/tapd', '/mcp-gateway');
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(port, host, () => {
  console.log(`Project Manager V2 local server: http://${host}:${port}${appPrefix}/`);
  console.log(`TAPD REST proxy: ${tapdTarget.origin}`);
});
