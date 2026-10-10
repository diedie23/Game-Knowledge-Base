# 稳定发布与访问说明

## 固定访问地址

本知识库使用 GitHub Pages 提供稳定静态访问，不依赖本机进程、Cloudflare Quick Tunnel 或临时公网地址。

- 知识库首页：<https://diedie23.github.io/Game-Knowledge-Base/>
- Project Manager V2：<https://diedie23.github.io/Game-Knowledge-Base/project-manager-v2/index.html>

`trycloudflare.com` 地址属于临时隧道，进程停止或隧道重启后就会失效，不再作为对外入口。

## 发布约定

仓库：`diedie23/Game-Knowledge-Base`

GitHub Pages 配置：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/docs`

每次更新线上内容前：

1. 确认本地已完成修改。
2. 在项目管理器目录构建生产版本：

```bash
npm --prefix "project-manager-v2" run build
```

3. 将构建产物和必要源码提交到 `main`。
4. 推送成功后，等待 GitHub Pages 完成更新。

GitHub Pages 只发布 `docs/`，因此不能只修改 `project-manager-v2/src/` 后直接期待线上变化；必须先构建，把最新产物写入 `docs/project-manager-v2/`。

## 一键更新

Windows 可运行项目根目录的 `update.bat`。脚本会先构建 Project Manager V2，再提交 `docs/` 和 `project-manager-v2/`，最后推送到 `main`。

如果推送出现用户名或认证错误，需要先在当前 Git 环境配置 GitHub 写入凭据；匿名读取正常不代表具备推送权限。

## 访问故障排查

- 首页打不开：检查 GitHub Pages 是否仍指向 `main` 的 `/docs`。
- Project Manager V2 打不开：确认访问路径包含 `/Game-Knowledge-Base/project-manager-v2/index.html`。
- 页面能打开但 TAPD 无法同步：GitHub Pages 是静态托管，不提供 Vite 开发服务器的 `/tapd-api` 代理；需要在可访问的环境运行本地/服务端代理，或使用已配置的 TAPD MCP 网关模式。
- 不要把 `trycloudflare.com` 地址写入对外文档，它只是临时通道，不是永久域名。
