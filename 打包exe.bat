@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 打包 exe

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js，请先安装后再打包。
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo 正在安装依赖，第一次会比较慢，请耐心等待……
  call npm install
)

for /f "delims=" %%v in ('node -p "require('./node_modules/electron/package.json').version"') do set "EVER=%%v"
set "ZIPARG="
for /f "delims=" %%i in ('dir /b /s "%LOCALAPPDATA%\electron\Cache\electron-v%EVER%-win32-x64.zip" 2^>nul') do set "ZIPFILE=%%i"
if defined ZIPFILE for %%i in ("%ZIPFILE%") do set "ZIPDIR=%%~dpi"
if defined ZIPDIR set "ZIPDIR=%ZIPDIR:~0,-1%"
if defined ZIPDIR set "ZIPARG=--electron-zip-dir="%ZIPDIR%""

echo 正在打包（Electron %EVER%），请稍候……
call npx electron-packager . "个人工作生活" --platform=win32 --arch=x64 --out=dist --overwrite --prune --icon="build\icon.ico" --electron-version=%EVER% %ZIPARG% --ignore="^/(dist[^/]*|data|backups|test|docs|tools|\.git)(/|$)"

if errorlevel 1 (
  echo.
  echo 打包失败，请把上面的报错发给我。
  pause
  exit /b 1
)

echo.
echo 打包完成：dist\个人工作生活-win32-x64\个人工作生活.exe
echo 双击它就能打开软件，data 目录会和 exe 放在一起。
echo.
pause
exit /b 0
