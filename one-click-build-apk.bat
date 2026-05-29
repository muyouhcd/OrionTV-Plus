@echo off
setlocal
set SCRIPT_DIR=%~dp0
set LOG_DIR=%SCRIPT_DIR%dist\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set LOG_FILE=%LOG_DIR%\build-apk-foreground-%TS%.log

echo [INFO] Running build script...
echo [INFO] Log: %LOG_FILE%
echo.

cmd /c powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-apk.ps1" > "%LOG_FILE%" 2>&1
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE%==0 (
  echo [OK] Build finished successfully.
) else (
  echo [ERROR] Build failed with code %EXIT_CODE%.
  echo [INFO] Check log: %LOG_FILE%
)
echo.
pause
exit /b %EXIT_CODE%
