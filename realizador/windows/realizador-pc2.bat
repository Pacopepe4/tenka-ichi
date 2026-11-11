@echo off
chcp 65001 >nul
rem Con "oculto" (lo abre Realizador.vbs, el acceso directo del escritorio) no se ve ninguna ventana negra:
rem lo que pasa queda en partidas\pc2-AAAA-MM-DD.log y en la pestana Registro del panel.
set "OCULTO="
if /I "%~1"=="oculto" set "OCULTO=1"
rem Con "sinpagina" (al volver a abrirse tras actualizar) no se abre otra ventana: la de antes se reconecta sola
set "SINPAGINA="
if /I "%~2"=="sinpagina" set "SINPAGINA=1"
if not defined OCULTO title Realizador PC 2 - no cierres esta ventana
cd /d "%~dp0.."
call windows\_node.bat
if errorlevel 1 goto :sinNode
rem Si ya esta abierto, solo se abre su ventana
curl -s -o nul -m 2 http://localhost:4601/estado >nul 2>nul && (call "%~dp0_abrir-pagina.bat" http://localhost:4601/ & exit /b 0)
call "%~dp05-abrir-obs.bat" sinpausa
rem Por si acaso: volver a la carpeta del realizador (abrir OBS cambia de carpeta)
cd /d "%~dp0.."
rem El puente del marcador de Gokudo (si viene en la descarga de la guia), sin ventana y una sola vez
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_puente.ps1"
if defined OCULTO goto :arrancar
echo.
echo Realizador del PC 2 (emision).
echo En unos segundos se abre su ventana: ahi esta el boton de Empezar directo y lo que falta para empezar.
echo Si la cierras sin querer, vuelve a abrirla en http://localhost:4601/
echo.
echo NO CIERRES ESTA VENTANA NEGRA mientras dure el directo (puedes minimizarla). Para cerrar el realizador: Ctrl+C.
echo.
:arrancar
if not defined SINPAGINA start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & call "%~dp0_abrir-pagina.bat" http://localhost:4601/"
"%NODE%" pc2\rele.js
if defined OCULTO exit /b 0
echo.
pause
exit /b 0

:sinNode
if not defined OCULTO pause
exit /b 1
