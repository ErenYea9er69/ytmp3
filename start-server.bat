@echo off
title YT to MP3 - Local Conversion Server
color 0A
cls

cd /d "%~dp0\server"

echo ========================================================
echo   🎵 YT to MP3 - Local 100%% Self-Contained Server
echo   ⚡ Zero External APIs - Direct 320kbps MP3
echo ========================================================
echo.

:: Check Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in PATH!
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    pause
    exit /b 1
)

:: Start server
node server.js
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Server stopped with error.
    pause
)
