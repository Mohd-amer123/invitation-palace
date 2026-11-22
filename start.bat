@echo off
title THE INVITATION PALACE - Event Reminder Management System
echo ================================================================
echo   THE INVITATION PALACE - Free WhatsApp Reminder System
echo ================================================================
echo.

:: 1. Check if node is in system PATH
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Found Node.js in system PATH.
    echo Starting server at http://localhost:3000 ...
    echo Press Ctrl+C to stop the server at any time.
    echo.
    node server.js
    pause
    exit /b
)

:: 2. Check standard Node.js installation
if exist "C:\Program Files\nodejs\node.exe" (
    echo [OK] Using standard Node.js at C:\Program Files\nodejs\node.exe ...
    echo Starting server at http://localhost:3000 ...
    echo Press Ctrl+C to stop the server at any time.
    echo.
    "C:\Program Files\nodejs\node.exe" server.js
    pause
    exit /b
)

:: 3. Not detected
echo [!] Node.js was not detected in your PATH.
echo.
echo Please install Node.js (LTS recommended) from:
echo   https://nodejs.org
echo.
echo After installing, restart VS Code and run:
echo   npm start
echo.
pause
