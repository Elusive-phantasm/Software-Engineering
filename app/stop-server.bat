@echo off
chcp 65001 >nul
title Stop Shiguang Platform
set PORTNUM=3081
set FOUND=

echo Looking for a process listening on port %PORTNUM% ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORTNUM% .*LISTENING"') do (
  set FOUND=1
  echo   stopping PID %%p ...
  taskkill /PID %%p /F >nul 2>nul
)

if not defined FOUND (
  echo Nothing is listening on port %PORTNUM%.
) else (
  echo Done. Port %PORTNUM% should be free now.
)
echo.
pause
