@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没有找到 Node.js。请先安装 Node.js 20 或更高版本，再双击这个文件。
  echo 下载地址：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo 正在启动本地服务，请稍候……
start "个人工作生活 App 服务" cmd /k node server.js

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 24;$i++){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',4317); $c.Close(); $ok=$true; break }catch{ Start-Sleep -Milliseconds 500 } }; if($ok){ Start-Process 'http://localhost:4317'; Write-Host '服务已就绪，浏览器正在打开。' -ForegroundColor Green; exit 0 } else { Write-Host '启动失败：端口 4317 没有响应。' -ForegroundColor Red; Write-Host '请看上面那个「个人工作生活 App 服务」窗口里的报错。' -ForegroundColor Yellow; exit 1 }"

if errorlevel 1 (
  echo.
  echo 如果提示端口被占用，先关掉之前打开的服务窗口再试。
  echo.
  pause
)

exit /b 0
