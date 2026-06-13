@echo off
cd /d "%~dp0"
title Black Swan Hunter

echo ============================================
echo    Black Swan Hunter v2.0
echo ============================================
echo.

REM Kill old server
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Install deps if first run
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server + browser...
echo http://localhost:3000
echo.
echo AI Status: check top-right corner of the page
echo Close this window to stop.
echo ============================================

node server.js
pause
