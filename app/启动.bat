@echo off
chcp 65001 >nul
title Shiguang Campus Reuse Platform
cd /d "%~dp0"

echo ==========================================================
echo   Shiguang Second-hand Platform  (Campus Reuse)   V2.1
echo   Student : http://127.0.0.1:3081/
echo   Admin   : http://127.0.0.1:3081/admin
echo ==========================================================
echo.

rem ---------------- 1) Node.js check ----------------
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found in PATH.
  echo     Please install Node.js 22.5 or newer: https://nodejs.org
  goto :failed
)
for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo [1/4] Node.js %NODEVER%  ^(requires v22.5+^)

rem ---------------- 2) dependencies ----------------
if exist "node_modules\express\package.json" (
  echo [2/4] Dependencies OK, skip npm install
) else (
  echo [2/4] Installing dependencies, please wait ...
  call npm install --cache ".\.npm-cache" --no-audit --no-fund
  if errorlevel 1 goto :failed
)

rem ---------------- 3) database ----------------
if exist "data\platform.db" (
  echo [3/4] Database found, keep existing demo data
) else (
  echo [3/4] Creating database and demo data ...
  call node --no-warnings src\seed\seed.js --reset
  if errorlevel 1 goto :failed
)

rem ---------------- 4) port check ----------------
set PORTNUM=3081
set BUSYPID=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORTNUM% .*LISTENING"') do set BUSYPID=%%p
if defined BUSYPID (
  echo [4/4] Port %PORTNUM% is already in use by PID %BUSYPID%
  echo.
  echo   A server seems to be running already. Just open in your browser:
  echo       http://127.0.0.1:%PORTNUM%/
  echo   To stop the running instance, run stop-server.bat
  goto :failed
)

echo [4/4] Starting server on port %PORTNUM% ...
echo.
node --no-warnings src\server.js
echo.
echo Server stopped.
pause
exit /b 0

:failed
echo.
echo Startup aborted. Read the messages above.
pause
exit /b 1
