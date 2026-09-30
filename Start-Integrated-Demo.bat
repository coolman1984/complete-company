@echo off
rem One click: the four applications CONNECTED, sharing one company that has already done some business.
rem First run builds the demo company (about two minutes). Add -Rebuild to build it again. Real data is never touched.
setlocal
cd /d "%~dp0"
set "PSH=powershell"
where pwsh >nul 2>nul && set "PSH=pwsh"
%PSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-IntegratedDemo.ps1" %*
if errorlevel 1 pause
endlocal
