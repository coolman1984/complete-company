@echo off
rem Demo Ceramics Co.: Mizan + Itqan + HR-System together, sample data only, sign in with admin / 123.
rem Start-Ceramic-Showreel.bat -Rebuild  plays the company's history again from scratch.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Ceramic-Showreel.ps1" %*
if errorlevel 1 pause

