@echo off
chcp 65001 >nul
title Volcado de jugadores de Tenka Ichi
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0volcado-jugadores.ps1" %*
echo.
pause
