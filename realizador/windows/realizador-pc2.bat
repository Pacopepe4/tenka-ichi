@echo off
chcp 65001 >nul
title Realizador PC 2 - no cierres esta ventana
cd /d "%~dp0.."
call windows\_node.bat || (pause & exit /b 1)
call "%~dp05-abrir-obs.bat" sinpausa
rem El puente del marcador de TENKA ICHI (si viene en la descarga de la guia) en su propia ventana
if exist "%~dp0..\puente\Abrir el puente.bat" start "Puente de Tenka Ichi" /d "%~dp0..\puente" cmd /c "Abrir el puente.bat"
echo.
echo Realizador del PC 2 (emision).
echo En unos segundos se abre su ventana: ahi esta el boton de Empezar directo y lo que falta para empezar.
echo Si la cierras sin querer, vuelve a abrirla en http://localhost:4601/
echo.
echo NO CIERRES ESTA VENTANA NEGRA mientras dure el directo (puedes minimizarla). Para cerrar el realizador: Ctrl+C.
echo.
start "" /min cmd /c "timeout /t 4 >nul & call "%~dp0_abrir-pagina.bat" http://localhost:4601/"
"%NODE%" pc2\rele.js
echo.
pause
