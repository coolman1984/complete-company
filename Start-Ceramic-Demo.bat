@echo off
rem One click: the applications CONNECTED as a ceramic-tile factory (Demo Ceramics Co.) that has taken one tile order
rem from the distributor all the way to the payment. Small data, first run builds it (about a minute). Add -Rebuild to
rem build it again. Real data is never touched. The script for the presentation: scenario\ceramic\STORYBOARD.md
setlocal
cd /d "%~dp0"
set "PSH=powershell"
where pwsh >nul 2>nul && set "PSH=pwsh"
%PSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-IntegratedDemo.ps1" -Scenario ceramic %*
if errorlevel 1 pause
endlocal
