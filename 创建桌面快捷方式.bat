@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "ICON=%SystemRoot%\System32\shell32.dll,167"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "ICON=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe,0"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "ICON=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe,0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $path = [Environment]::GetFolderPath('Desktop') + '\个人工作生活.lnk'; $lnk = $ws.CreateShortcut($path); $lnk.TargetPath = '%~dp0启动.bat'; $lnk.WorkingDirectory = '%~dp0'; $lnk.Description = '个人工作生活'; $lnk.IconLocation = '%ICON%'; $lnk.Save(); Write-Host ('桌面快捷方式已创建：' + $path) -ForegroundColor Green"

echo.
echo 提示：打开应用后，在任务栏那个窗口图标上右键选择「固定到任务栏」，就能随时一键打开。
echo.
pause
exit /b 0
