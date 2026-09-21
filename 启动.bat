@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 个人工作生活

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没有找到 Node.js。请先安装 Node.js 20 或更高版本，再双击这个文件。
  echo 下载地址：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

set "READY=0"
powershell -NoProfile -Command "try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',4317); $c.Close(); exit 0 }catch{ exit 1 }"
if not errorlevel 1 set "READY=1"

if "%READY%"=="0" (
  echo 正在启动本地服务……
  start "个人工作生活 App 服务" /min cmd /k node server.js
  powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 24;$i++){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',4317); $c.Close(); exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; exit 1"
  if errorlevel 1 (
    echo.
    echo 启动失败：端口 4317 没有响应。
    echo 请看任务栏里「个人工作生活 App 服务」那个窗口的报错；
    echo 也可以在项目文件夹里执行 npm start 查看详细报错。
    echo.
    pause
    exit /b 1
  )
)

set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined BROWSER (
  start "" "%BROWSER%" --app=http://localhost:4317 --start-maximized --user-data-dir="%LocalAppData%\PersonalWorkLife\browser"
) else (
  start "" http://localhost:4317
)

exit /b 0
