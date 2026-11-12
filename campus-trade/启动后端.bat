@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   拾光二手 - 启动后端 (Spring Boot)
echo ============================================
echo.

rem ---------- 1. 挑一个 JDK 17+ ----------
set "JAVA_EXE="
for %%P in (
  "%JAVA_HOME%\bin\java.exe"
  "C:\Program Files\Java\jdk-24\bin\java.exe"
  "C:\Program Files\Java\jdk-23\bin\java.exe"
  "C:\Program Files\Java\jdk-22\bin\java.exe"
  "C:\Program Files\Java\jdk-21\bin\java.exe"
  "C:\Program Files\Java\jdk-20\bin\java.exe"
  "C:\Program Files\Java\jdk-19\bin\java.exe"
  "C:\Program Files\Java\jdk-18\bin\java.exe"
  "C:\Program Files\Java\jdk-17\bin\java.exe"
) do (
  if not defined JAVA_EXE if exist "%%~P" call :try_java "%%~P"
)

if not defined JAVA_EXE (
  for /f "delims=" %%J in ('where java 2^>nul') do (
    if not defined JAVA_EXE call :try_java "%%J"
  )
)

if not defined JAVA_EXE (
  echo [错误] 未找到 JDK 17+。
  echo        当前 JAVA_HOME=%JAVA_HOME%
  echo        请安装 JDK 17 或以上（本项目在 JDK 24 上验证），
  echo        或把 JAVA_HOME 指向 JDK 17+ 后重新运行。
  pause
  exit /b 1
)
echo [OK] JDK: %JAVA_EXE%

rem ---------- 2. 检查 MySQL 3307 ----------
powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 3307 -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [错误] MySQL 未在 127.0.0.1:3307 运行。
  if exist ".mysql\data" (
    echo        可先双击同目录的「启动数据库.bat」，再运行本脚本。
  ) else (
    echo        请按 README 初始化 MySQL 8，并让库 campus_trade 监听 3307。
  )
  pause
  exit /b 1
)
echo [OK] MySQL 3307 可用

rem ---------- 3. 启动 ----------
if exist "backend\target\campus-trade-backend-1.0.0.jar" (
  echo [INFO] 使用已构建的 jar 启动（8080）
  echo [INFO] 接口文档 http://127.0.0.1:8080/swagger-ui.html
  echo.
  cd backend
  "%JAVA_EXE%" -jar "target\campus-trade-backend-1.0.0.jar"
) else (
  where mvn >nul 2>nul
  if errorlevel 1 (
    echo [错误] 未找到 jar，也未安装 Maven。
    echo        请先执行：cd backend ^&^& mvn package -DskipTests
    pause
    exit /b 1
  )
  echo [INFO] 使用 Maven 启动（8080）
  cd backend
  call mvn spring-boot:run
)

echo.
echo [提示] 后端已退出。若为异常退出，请查看上方日志。
pause
exit /b 0

rem ---------- 子程序：检查某个 java 是否 >= 17 ----------
:try_java
powershell -NoProfile -Command "$v=(& '%~1' -version 2>&1 | Out-String); if($v -match 'version \"?(\d+)'){ if([int]$Matches[1] -ge 17){ exit 0 } }; exit 1"
if not errorlevel 1 set "JAVA_EXE=%~1"
goto :eof
