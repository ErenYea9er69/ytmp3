@echo off
title YT to MP3 - Local Companion Server
color 0C
cls

echo ========================================================
echo   YT to MP3 - High-Speed Local Companion Server
echo ========================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist node_modules (
    echo [INFO] Installing required server dependencies...
    echo This is only required once.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Starting conversion server on http://localhost:4000...
echo Keep this window open while downloading YouTube MP3s locally.
echo You can minimize this window.
echo.
node server.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Server terminated unexpectedly.
    pause
)
