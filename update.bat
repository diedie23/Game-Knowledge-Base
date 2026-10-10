@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   游戏项目知识库 - 稳定发布到 GitHub Pages
echo ========================================
echo.

echo [1/4] 构建 Project Manager V2...
call npm --prefix "project-manager-v2" run build
if errorlevel 1 (
  echo.
  echo [失败] 生产构建失败，已停止发布。
  pause
  exit /b 1
)

echo.
echo [2/4] 添加知识库与项目管理器产物...
git add docs project-manager-v2
if errorlevel 1 (
  echo.
  echo [失败] Git 暂存失败，已停止发布。
  pause
  exit /b 1
)

echo.
set "msg=内容更新"
set /p "input_msg=请输入更新说明（直接回车默认为 内容更新）: "
if not "%input_msg%"=="" set "msg=%input_msg%"

echo [3/4] 提交修改...
git commit -m "%msg%"
if errorlevel 1 (
  echo.
  echo [提示] 没有可提交的修改，继续检查远程状态。
)

echo.
echo [4/4] 推送到 GitHub Pages...
set GIT_TERMINAL_PROMPT=0
git push origin main
if errorlevel 1 (
  echo.
  echo [失败] 推送失败。请先配置当前 Git 环境的 GitHub 写入凭据。
  echo 稳定访问地址不会变化，但本次内容不会更新到线上。
  pause
  exit /b 1
)

echo.
echo ========================================
echo  发布完成，GitHub Pages 将自动更新
echo  知识库: https://diedie23.github.io/Game-Knowledge-Base/
echo  项目管理器: https://diedie23.github.io/Game-Knowledge-Base/project-manager-v2/index.html
echo ========================================
pause
endlocal
