@echo off
chcp 65001 >nul
echo ========================================
echo   游戏项目知识库 - 一键更新到公网
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] 添加所有修改...
git add docs/

echo [2/3] 提交修改...
set /p msg="请输入更新说明（直接回车默认为"内容更新"）: "
if "%msg%"=="" set msg=内容更新
git commit -m "%msg%"

echo [3/3] 推送到 GitHub...
git push origin main

echo.
echo ========================================
echo  ✅ 推送完成！
echo  网站将在 1-2 分钟内自动更新
echo  🔗 https://diedie23.github.io/Game-Knowledge-Base/
echo ========================================
pause
