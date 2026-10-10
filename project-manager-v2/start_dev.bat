@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_ENV=production"
echo 正在启动 Project Manager V2 本地服务...
echo 访问地址：http://127.0.0.1:4173/Game-Knowledge-Base/project-manager-v2/
echo 关闭窗口即可停止服务。
echo.
npm.cmd run start:local
pause
