@echo off
chcp 65001 >nul
title Realizador PC 1
cd /d "%~dp0.."
call windows\_node.bat || (pause & exit /b 1)
echo Realizador del PC 1. Deja esta ventana abierta: cuando empiece una partida en LoL la encuentra sola.
echo Panel: http://localhost:4600/   Para cerrar: Ctrl+C o cierra la ventana.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:4600/"
"%NODE%" pc1\agente.js
echo.
pause
