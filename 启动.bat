@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "个人工作生活 App 服务" /min node server.js
timeout /t 2 >nul
start "" http://localhost:4317
