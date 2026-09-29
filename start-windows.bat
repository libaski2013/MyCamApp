@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 20 or newer is required. Install it from nodejs.org and run this file again.
 pause
 exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 (pause & exit /b 1)
start "" http://127.0.0.1:3000
call npm start
pause
