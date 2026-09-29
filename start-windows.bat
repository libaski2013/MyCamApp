@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 20 or newer is required. Install it from nodejs.org and run this file again.
 pause
 exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 (echo Install failed. Read the error above. & pause & exit /b 1)
call npm run launch
pause
