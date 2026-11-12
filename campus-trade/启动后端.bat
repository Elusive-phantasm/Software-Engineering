@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   拾光二手 - 启动后端 (Spring Boot)
echo ============================================
echo.
where java >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 java，请安装 JDK 17+ 并设置 JAVA_HOME
  pause
  exit /b 1
)
if "%JAVA_HOME%"=="" echo [提示] JAVA_HOME 未设置，Maven 可能找不到 JDK
cd /d "%~dp0backend"
echo.
echo 后端地址： http://127.0.0.1:8080
echo 接口文档： http://127.0.0.1:8080/swagger-ui.html
echo 提示：需要 MySQL 运行在 127.0.0.1:3307（见 README）
echo.
call mvn spring-boot:run
pause