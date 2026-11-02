@echo off
chcp 65001 >nul
title Realizador PC 2
cd /d "%~dp0.."
call windows\_node.bat || (pause & exit /b 1)
call "%~dp05-abrir-obs.bat" sinpausa
rem El puente del marcador de TENKA ICHI (si viene en la descarga de la guia) en su propia ventana
if exist "%~dp0..\puente\Abrir el puente.bat" start "Puente de Tenka Ichi" /d "%~dp0..\puente" cmd /c "Abrir el puente.bat"
echo.
echo Realizador del PC 2. Deja esta ventana abierta y espectea la partida en LoL: la antena va sola 2 minutos por detras.
echo Para cerrar: Ctrl+C o cierra la ventana.
echo.
"%NODE%" pc2\rele.js
echo.
pause
