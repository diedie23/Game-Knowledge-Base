' LocalPM - Auto Start Script (游戏项目知识库 副本)
' This script silently starts the Vite dev server for LocalProjectManager
' Place a shortcut to this file in the Windows Startup folder to auto-start on boot

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "H:\游戏项目知识库\LocalProjectManager"
WshShell.Run "cmd /c npm run dev -- --port 5174", 0, False
Set WshShell = Nothing
