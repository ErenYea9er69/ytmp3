@echo off
title Stop YT to MP3 Server
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo YT to MP3 Server on port 4000 stopped.
timeout /t 2 >nul
