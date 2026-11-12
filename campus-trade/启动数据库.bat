@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   拾光二手 - 启动数据库 (MySQL 8 @ 3307)
echo ============================================
echo.

if not exist ".mysql\data" (
  echo [错误] 未找到 .mysql\data。
  echo        本脚本只用于本项目自带的 3307 实例；
  echo        如果没有该目录，请按 README 自行初始化 MySQL，或从备份恢复。
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 3307 -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [INFO] 3307 已在运行，无需重复启动。
  pause
  exit /b 0
)

if not exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" (
  echo [错误] 未找到 mysqld.exe，请确认 MySQL 8 安装在默认路径。
  pause
  exit /b 1
)

echo [INFO] 在新窗口启动 MySQL（关闭该窗口即停止数据库）
start "MySQL 3307 - 关闭此窗口即停止" "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" --defaults-file="%~dp0.mysql\my.ini" --console

echo [INFO] 等待端口就绪...
powershell -NoProfile -Command "for ($i=0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 700; if (Test-NetConnection 127.0.0.1 -Port 3307 -InformationLevel Quiet -WarningAction SilentlyContinue) { Write-Host '[OK] 3307 已就绪'; exit 0 } }; Write-Host '[错误] 3307 未就绪，请查看新窗口日志'; exit 1"
pause
