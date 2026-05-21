/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/Game-Knowledge-Base/project-manager/',
  build: {
    outDir: path.resolve(__dirname, '../docs/project-manager'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/tapd-api': {
        // 腾讯内部版 TAPD API 地址（apiv2.tapd.woa.com）
        // 如果是外部公有云，请改为 https://api.tapd.cn
        target: 'http://apiv2.tapd.woa.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tapd-api/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // 拦截 401 响应，移除 www-authenticate 头，防止浏览器弹出原生登录框
            if (proxyRes.statusCode === 401 && proxyRes.headers['www-authenticate']) {
              proxyRes.headers['x-www-authenticate'] = proxyRes.headers['www-authenticate'];
              delete proxyRes.headers['www-authenticate'];
            }
          });
        },
      },
      '/mcp-gateway': {
        // TAPD MCP Gateway (streamable-http)
        target: 'https://mcpgw.knot.woa.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/mcp-gateway/, '/tapd'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});