@echo off
chcp 936 >nul
rem 注意：本文件请保持 GBK / ANSI 编码，勿存成 UTF-8（否则 cmd 会解析错位）。
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "NO_PAUSE=0"
if /i "%~1"=="nopause" set "NO_PAUSE=1"

echo ============================================
echo   拾光二手 - 启动数据库 (MySQL 8 @ 3307)
echo ============================================
echo.

call :port_open 3307
if not errorlevel 1 (
  echo [OK] 3307 已在运行，无需重复启动。
  goto :done
)

set "DATA=%ROOT%.mysql\data"
set "INI=%ROOT%.mysql\my.ini"

if not exist "%DATA%" (
  echo [错误] 未找到 .mysql\data。
  echo.
  echo   仓库不带数据库文件。换电脑运行时，请先安装 MySQL 8，并按 README 的「数据库」一节建库：
  echo     CREATE DATABASE campus_trade CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  echo     CREATE USER 'campus'@'%%' IDENTIFIED BY '请自行设置口令';
  echo     GRANT ALL PRIVILEGES ON campus_trade.* TO 'campus'@'%%';
  echo   再把该口令通过环境变量 DB_PASSWORD 传给后端（默认值仅用于本机课程演示）。
  echo   然后让 MySQL 监听 3307，再运行本脚本。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)
if not exist "%INI%" (
  echo [错误] 未找到 .mysql\my.ini，无法启动本机实例。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)

set "MYSQLD="
for /f "delims=" %%M in ('where mysqld 2^>nul') do if not defined MYSQLD set "MYSQLD=%%M"
if not defined MYSQLD if exist "%ProgramFiles%\MySQL\MySQL Server 8.0\bin\mysqld.exe" set "MYSQLD=%ProgramFiles%\MySQL\MySQL Server 8.0\bin\mysqld.exe"
if not defined MYSQLD for /d %%D in ("%ProgramFiles%\MySQL\MySQL Server*") do if not defined MYSQLD if exist "%%~fD\bin\mysqld.exe" set "MYSQLD=%%~fD\bin\mysqld.exe"
if not defined MYSQLD if exist "%ProgramFiles(x86)%\MySQL" for /d %%D in ("%ProgramFiles(x86)%\MySQL\MySQL Server*") do if not defined MYSQLD if exist "%%~fD\bin\mysqld.exe" set "MYSQLD=%%~fD\bin\mysqld.exe"
if not defined MYSQLD if exist "C:\xampp\mysql\bin\mysqld.exe" set "MYSQLD=C:\xampp\mysql\bin\mysqld.exe"

if not defined MYSQLD (
  echo [错误] 未找到 mysqld.exe。
  echo        请安装 MySQL 8，或把 MySQL 的 bin 目录加入 PATH。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)

for %%I in ("%MYSQLD%") do set "MYSQL_BIN=%%~dpI"
for %%I in ("%MYSQL_BIN%..") do set "MYSQL_BASE=%%~fI"

echo [INFO] mysqld : %MYSQLD%
echo [INFO] datadir: %DATA%
echo [INFO] 在新窗口启动 MySQL，关闭那个窗口即停止数据库。
start "MySQL 3307（关闭此窗口即停止）" "%MYSQLD%" --defaults-file="%INI%" --datadir="%DATA%" --basedir="%MYSQL_BASE%" --console

call :wait_port 3307 30
if errorlevel 1 (
  echo [错误] 3307 在 30 秒内没有就绪。
  echo        请查看新开的 MySQL 窗口日志，常见原因是端口被占用或 datadir 不完整。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)
echo [OK] 3307 已就绪
goto :done

:port_open
netstat -ano -p tcp | findstr /c:":%1 " | findstr /i "LISTENING" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

:wait_port
for /l %%I in (1,1,%2) do (
  call :port_open %1
  if not errorlevel 1 exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1

:done
if "%NO_PAUSE%"=="0" pause
exit /b 0
