@echo off
setlocal
set SCRIPT_DIR=%~dp0
set LOG_DIR=%SCRIPT_DIR%dist\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set LOG_FILE=%LOG_DIR%\build-apk-bg-%TS%.log

start "OrionTV APK Build (Background)" /min cmd /c powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-apk.ps1" > "%LOG_FILE%" 2>&1

echo [OK] Background build started.
echo [INFO] Log: %LOG_FILE%
exit /b 0
