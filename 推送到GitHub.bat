@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 推送到 GitHub

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没有找到 git。请先安装 Git for Windows：winget install --id Git.Git -e
  echo 装完关掉这个窗口重新打开再试。
  echo.
  pause
  exit /b 1
)

echo 先看看有没有还没提交的改动……
git status --short
echo.
echo （上面如果列了文件，说明有改动还没提交；先告诉我，我帮你提交好再推。）
echo.

echo 正在推送代码……
git push
if errorlevel 1 (
  echo.
  echo 推送失败，把上面的报错发给我。
  pause
  exit /b 1
)

echo 正在推送版本标签……
git push origin --tags

echo.
echo 完成。可以到 GitHub 页面刷新看看。
echo.
pause
exit /b 0
