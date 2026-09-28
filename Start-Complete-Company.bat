@echo off
rem One click: starts Mizan, GMES, HR-System and Space Planner (each in its own window) and opens the portal.
rem Uses the REAL data of each application. For the demonstration copies use Start-Complete-Company-Demo.bat.
setlocal
cd /d "%~dp0"
set "PSH=powershell"
where pwsh >nul 2>nul && set "PSH=pwsh"
%PSH% -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" %*
if errorlevel 1 pause
endlocal
