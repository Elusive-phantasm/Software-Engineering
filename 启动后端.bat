@echo off
chcp 936 >nul
rem 注意：本文件请保持 GBK / ANSI 编码，勿存成 UTF-8（否则 cmd 会解析错位）。
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "NO_PAUSE=0"
if /i "%~1"=="nopause" set "NO_PAUSE=1"

echo ============================================
echo   拾光二手 - 启动后端 (Spring Boot)
echo ============================================
echo.

rem ---------- 1. 找 JDK 17+ ----------
set "JAVA_EXE="
if defined JAVA_HOME call :try_java "%JAVA_HOME%\bin\java.exe"
if not defined JAVA_EXE for /d %%D in ("%ProgramFiles%\Java\jdk-*") do if not defined JAVA_EXE call :try_java "%%~fD\bin\java.exe"
if not defined JAVA_EXE for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-*") do if not defined JAVA_EXE call :try_java "%%~fD\bin\java.exe"
if not defined JAVA_EXE for /d %%D in ("%ProgramFiles%\Microsoft\jdk-*") do if not defined JAVA_EXE call :try_java "%%~fD\bin\java.exe"
if not defined JAVA_EXE for /d %%D in ("%ProgramFiles%\Amazon Corretto\jdk*") do if not defined JAVA_EXE call :try_java "%%~fD\bin\java.exe"
if not defined JAVA_EXE for /f "delims=" %%J in ('where java 2^>nul') do if not defined JAVA_EXE call :try_java "%%J"

if not defined JAVA_EXE (
  echo [错误] 未找到 JDK 17 或以上。
  echo        请安装 JDK 17+（本项目在 24 上验证），并设置 JAVA_HOME 或把 java 加入 PATH。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)
echo [OK] JDK: %JAVA_EXE%

rem ---------- 2. 检查 MySQL 3307 ----------
call :port_open 3307
if errorlevel 1 (
  echo [错误] MySQL 未在 127.0.0.1:3307 运行。
  echo        请先运行「启动数据库.bat」，或直接双击「一键启动.bat」。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)
echo [OK] MySQL 3307 可用

rem ---------- 3. 找 jar 或 Maven ----------
if not exist "%ROOT%backend\pom.xml" (
  echo [错误] 未找到 backend\pom.xml，请把本脚本放在仓库根目录。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)

set "JAR="
for /f "delims=" %%J in ('dir /b "%ROOT%backend\target\campus-trade-backend-*.jar" 2^>nul') do set "JAR=%ROOT%backend\target\%%J"

set "MVN="
for /f "delims=" %%M in ('where mvn 2^>nul') do if not defined MVN set "MVN=%%M"
if not defined MVN if exist "%ROOT%mvnw.cmd" set "MVN=%ROOT%mvnw.cmd"

if not defined JAR if not defined MVN (
  echo [错误] 没有已构建的 jar，也没有找到 Maven。
  echo        请安装 Maven 后执行：cd backend ^&^& mvn package -DskipTests
  echo        或直接用 IDEA / Eclipse 启动 CampusTradeApplication。
  if "%NO_PAUSE%"=="0" pause
  exit /b 1
)

rem ---------- 4. 启动 ----------
pushd "%ROOT%backend"
if defined JAR (
  echo [INFO] 使用已构建的 jar 启动（8080）
  echo [INFO] 接口文档 http://127.0.0.1:8080/swagger-ui.html
  echo.
  "%JAVA_EXE%" -jar "%JAR%"
) else (
  echo [INFO] 使用 Maven 启动（8080）
  echo [INFO] 接口文档 http://127.0.0.1:8080/swagger-ui.html
  echo.
  call "%MVN%" spring-boot:run
)
set "RC=%errorlevel%"
popd
echo.
echo [提示] 后端已退出（退出码 %RC%）。若为异常退出，请查看上方日志。
if "%NO_PAUSE%"=="0" pause
exit /b %RC%

:try_java
if not exist "%~1" goto :eof
set "JVER="
set "JVERFILE=%TEMP%\campus-jver-%RANDOM%.txt"
"%~1" -version 2>"%JVERFILE%"
for /f "tokens=3" %%V in ('findstr /i "version" "%JVERFILE%" 2^>nul') do set "JVER=%%~V"
if exist "%JVERFILE%" del "%JVERFILE%" >nul 2>nul
if not defined JVER goto :eof
set "JV=%JVER:"=%"
set "MAJOR="
for /f "tokens=1 delims=._-" %%A in ("%JV%") do set "MAJOR=%%A"
if "%MAJOR%"=="1" for /f "tokens=2 delims=._-" %%A in ("%JV%") do set "MAJOR=%%A"
if not defined MAJOR goto :eof
if %MAJOR% LSS 17 goto :eof
set "JAVA_EXE=%~1"
goto :eof

:port_open
netstat -ano -p tcp | findstr /c:":%1 " | findstr /i "LISTENING" >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0
