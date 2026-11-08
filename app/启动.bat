@echo off
chcp 65001 >nul
title 拾光二手 · 校园二手交易平台
cd /d "%~dp0"

if not exist node_modules (
  echo [1/3] 首次运行，正在安装依赖...
  call npm install --cache ".\.npm-cache" --no-audit --no-fund || goto :err
) else (
  echo [1/3] 依赖已存在，跳过安装
)

if not exist data\platform.db (
  echo [2/3] 首次运行，正在灌入演示数据...
  call node --no-warnings src\seed\seed.js --reset || goto :err
) else (
  echo [2/3] 数据库已存在，保留现有数据
)

echo [3/3] 启动服务...
echo   学生端： http://127.0.0.1:3081/
echo   管理端： http://127.0.0.1:3081/admin  （ADM-001 / Admin@12345）
echo   演示账号： lin@campus.edu / zhao@campus.edu / ma@campus.edu / guo@campus.edu，密码 Test@12345
echo   按 Ctrl+C 停止服务
echo.
node --no-warnings src\server.js
goto :eof

:err
echo.
echo 启动失败，请检查 Node.js 版本是否 >= 22.5（当前：）
node -v
pause
