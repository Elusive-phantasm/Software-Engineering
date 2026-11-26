@echo off
chcp 936 >nul
rem 注意：本文件请保持 GBK / ANSI 编码，勿存成 UTF-8（否则 cmd 会解析错位）。
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "OPEN_BROWSER=1"
if /i "%~1"=="nobrowser" set "OPEN_BROWSER=0"

title 拾光二手 - 一键启动
echo ============================================
echo   拾光二手 - 一键启动
echo   数据库 3307  →  后端 8080  →  前端 5173
echo ============================================
echo.

rem ---------- 1. 数据库 ----------
call :port 3306
if errorlevel 1 (
  call :port 3307
  if errorlevel 1 (
    echo [ERROR] MySQL 3306/3307 未运行，正在尝试启动项目数据库...
    call "%ROOT%启动数据库.bat" nopause
    if errorlevel 1 ( pause & exit /b 1 )
    set "DB_PORT=3307"
  ) else (
    set "DB_PORT=3307"
    echo [1/3] MySQL 3307 已运行
  )
) else (
  set "DB_PORT=3306"
  echo [1/3] MySQL 3306 已运行
)
rem ---------- 2. 后端 ----------
call :port 8080
if errorlevel 1 (
  echo [2/3] 启动后端（新窗口）...
  start "后端 8080" "%ROOT%启动后端.bat"
  call :wait 8080 90
  if errorlevel 1 echo [警告] 后端 90 秒内未就绪，请看「后端 8080」窗口的报错。
) else (
  echo [2/3] 后端 8080 已在运行
)

rem ---------- 3. 前端 ----------
call :port 5173
if errorlevel 1 (
  echo [3/3] 启动前端（新窗口）...
  start "前端 5173" "%ROOT%启动前端.bat"
  call :wait 5173 120
  if errorlevel 1 echo [提示] 前端 120 秒内未就绪；若正在 npm install，装完会自动启动。
) else (
  echo [3/3] 前端 5173 已在运行
)

echo.
echo ============================================
echo   学生端： http://localhost:5173/
echo   管理端： http://localhost:5173/#/admin/login
echo   管理员： ADM-001 / Admin@12345
echo   学  生： lin@campus.edu / Test@12345
echo ============================================
echo.
echo 关闭「后端 8080」和「前端 5173」两个窗口即停止服务；
echo 关闭 MySQL 窗口即停止数据库。
echo.
if "%OPEN_BROWSER%"=="1" start "" "http://localhost:5173/"
pause
exit /b 0

:port
netstat -ano -p tcp | findstr /c:":%1 " | findstr /i "LISTENING" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

:wait
for /l %%I in (1,1,%2) do (
  call :port %1
  if not errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1
