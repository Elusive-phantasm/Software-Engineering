@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   拾光二手 - 启动前端 (Vue 3 + Vite)
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node 18+ 并加入 PATH
  pause
  exit /b 1
)
cd /d "%~dp0frontend"
if not exist "node_modules" (
  echo 首次运行，正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络或改用 npm install --registry=https://registry.npmmirror.com
    pause
    exit /b 1
  )
)
if not exist ".tmp" mkdir ".tmp"
set "TEMP=%~dp0frontend\.tmp"
set "TMP=%~dp0frontend\.tmp"
echo.
echo 学生端： http://localhost:5173/
echo 管理端： http://localhost:5173/#/admin/login
echo 提示：若 5173 被占用，Vite 会自动改用 5174，请以窗口里打印的地址为准
echo.
call npm run dev
pause