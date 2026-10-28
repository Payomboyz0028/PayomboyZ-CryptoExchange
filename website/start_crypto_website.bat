@echo off
chcp 65001 >nul
title PAYOMBØYZ Crypto Executive Vault (Port 8090)
color 0b

echo =====================================================================
echo   💎 PAYOMBØYZ CRYPTO EXECUTIVE VAULT (DEDICATED PORT 8090)
echo =====================================================================
echo.

cd /d "%~dp0"

echo [*] Starting Crypto Vault Web Server on http://127.0.0.1:8090...
py -3.12 -m uvicorn app.main:app --host 127.0.0.1 --port 8090 --reload

pause
