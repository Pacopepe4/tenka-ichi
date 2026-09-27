@echo off
chcp 65001 >nul
title Puente de Tenka Ichi
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0puente-tenka-ichi.ps1" %*
echo.
echo El puente se ha cerrado.
pause
