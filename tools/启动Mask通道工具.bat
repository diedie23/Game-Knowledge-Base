@echo off
chcp 65001 >nul
title Mask 通道图制作工具 v9.0 Pro
echo ========================================
echo   Mask 通道图制作工具 v9.0 Pro
echo   CIELAB ΔE · 角色预设 · 通道微调
echo   边缘净化 · 命名模板 · 新手/专家模式
echo ========================================
echo.
cd /d "%~dp0"
python mask_tool.py
if errorlevel 1 (
    echo.
    echo 启动失败，请检查 Python 环境
    echo 需要: pip install PyQt5 Pillow numpy
    echo 可选: pip install opencv-python scikit-learn scipy
    pause
)
