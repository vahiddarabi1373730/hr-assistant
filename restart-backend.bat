@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "BACKEND_PORT=8000"

title HR Assist - Restart Backend

if not exist "%BACKEND_DIR%\.venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment was not found.
    echo Expected: %BACKEND_DIR%\.venv\Scripts\python.exe
    goto :failed
)

echo [INFO] Checking the existing backend on port %BACKEND_PORT% ...
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'SilentlyContinue'; $listenerPids = @(Get-NetTCPConnection -LocalPort $env:BACKEND_PORT -State Listen | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($pid in $listenerPids) { taskkill.exe /F /T /PID $pid | Out-Null }; Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python(\.exe)?$' -and $_.CommandLine -match '(?i)uvicorn.*app\.main:app' } | ForEach-Object { taskkill.exe /F /T /PID $_.ProcessId | Out-Null }; exit 0"

powershell.exe -NoProfile -Command "$deadline = (Get-Date).AddSeconds(10); while ((Get-Date) -lt $deadline) { if (-not (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $env:BACKEND_PORT -State Listen -ErrorAction SilentlyContinue)) { exit 0 }; Start-Sleep -Milliseconds 250 }; exit 1"
if errorlevel 1 (
    echo [ERROR] Port %BACKEND_PORT% did not become available.
    goto :failed
)

echo [INFO] Starting backend with automatic reload ...
start "HR Assist - Backend" /D "%BACKEND_DIR%" cmd.exe /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %BACKEND_PORT% --reload"

echo [OK] Backend restart requested. The backend log window is open.
exit /b 0

:failed
echo.
echo The backend was not restarted. Review the message above.
pause
exit /b 1
