@echo off
rem One click: the DEMONSTRATION copies of the four applications (own data folders and ports) and the portal.
rem Sign in to every application with admin / 123. Real data is never touched.
setlocal
cd /d "%~dp0"
set "PSH=powershell"
where pwsh >nul 2>nul && set "PSH=pwsh"
%PSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" -Demo %*
if errorlevel 1 pause
endlocal
