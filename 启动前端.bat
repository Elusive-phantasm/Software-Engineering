@echo off
chcp 936 >nul
rem 注意：本文件请保持 GBK / ANSI 编码，勿存成 UTF-8（否则 cmd 会解析错位）。
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "NO_PAUSE=0"
if /i "%~1"=="nopause" set "NO_PAUSE=1"

echo ============================================
echo   拾光二手 - 启动前端 (Vue 3 + Vite)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请安装 Node 18+ 并加入 PATH。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm.cmd。请重新安装 Node.js（安装时勾选 npm）。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)

if not exist "%ROOT%frontend\package.json" (
  echo [错误] 未找到 frontend\package.json，请把本脚本放在仓库根目录。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)

cd /d "%ROOT%frontend"
if not exist "node_modules" (
  echo [INFO] 首次运行，正在安装前端依赖，请稍候...
  call npm.cmd install
  if errorlevel 1 (
    echo [错误] 依赖安装失败。可改用国内镜像重试：
    echo        npm.cmd install --registry=https://registry.npmmirror.com
    if "%NO_PAUSE%"=="0" pause
    exit /b 1
  )
)

if not exist ".tmp" mkdir ".tmp"
set "TEMP=%ROOT%frontend\.tmp"
set "TMP=%ROOT%frontend\.tmp"

echo.
echo 学生端： http://localhost:5173/
echo 管理端： http://localhost:5173/#/admin/login
echo 提示：若 5173 被占用，Vite 会自动改用 5174，请以窗口里打印的地址为准。
echo.
call npm.cmd run dev
set "RC=%errorlevel%"
echo.
echo [提示] 前端已退出（退出码 %RC%）。
if "%NO_PAUSE%"=="0" pause
exit /b %RC%
