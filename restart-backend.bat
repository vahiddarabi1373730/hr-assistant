@echo off
setlocal

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
set "BACKEND_PID="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%BACKEND_PORT% .*LISTENING"') do set "BACKEND_PID=%%P"
if defined BACKEND_PID (
    echo [INFO] Stopping the process on port %BACKEND_PORT% (PID %BACKEND_PID%) ...
    taskkill /F /T /PID %BACKEND_PID% >nul
    if errorlevel 1 (
        echo [ERROR] The process on port %BACKEND_PORT% could not be stopped.
        echo Close the current backend window, then run this file again.
        goto :failed
    )
)

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
