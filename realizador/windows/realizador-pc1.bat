@echo off
chcp 65001 >nul
rem Con "oculto" (lo abre Realizador.vbs, el acceso directo del escritorio) no se ve ninguna ventana negra:
rem lo que pasa queda en partidas\pc1-AAAA-MM-DD.log y en la pestana Registro del panel.
set "OCULTO="
if /I "%~1"=="oculto" set "OCULTO=1"
rem Con "sinpagina" (al volver a abrirse tras actualizar) no se abre otra ventana: la de antes se reconecta sola
set "SINPAGINA="
if /I "%~2"=="sinpagina" set "SINPAGINA=1"
if not defined OCULTO title Realizador PC 1 - no cierres esta ventana
cd /d "%~dp0.."
call windows\_node.bat
if errorlevel 1 goto :sinNode
rem Si ya esta abierto, solo se abre su ventana
curl -s -o nul -m 2 http://localhost:4600/estado >nul 2>nul && (call "%~dp0_abrir-pagina.bat" http://localhost:4600/ & exit /b 0)
if defined OCULTO goto :arrancar
echo Realizador del PC 1.
echo En unos segundos se abre su ventana: ahi esta el boton de Empezar directo y lo que falta para empezar.
echo Si la cierras sin querer, vuelve a abrirla en http://localhost:4600/
echo.
echo NO CIERRES ESTA VENTANA NEGRA mientras dure el directo (puedes minimizarla). Para cerrar el realizador: Ctrl+C.
echo.
:arrancar
if not defined SINPAGINA start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & call "%~dp0_abrir-pagina.bat" http://localhost:4600/"
rem Si al cerrarse deja una actualizacion pendiente y no lo abrio Realizador.vbs, se la pasa a el (misma linea:
rem el aplicador cambia este archivo)
"%NODE%" pc1\agente.js & if not defined OCULTO if exist ".actualizacion\pendiente.json" (start "" wscript.exe "%~dp0Realizador.vbs" pc1 sinpagina & exit /b 0)
rem Oculto: devuelve lo que devolvio Node, para que Realizador.vbs avise si no ha podido arrancar
if defined OCULTO exit /b %errorlevel%
echo.
pause
exit /b 0

:sinNode
if not defined OCULTO pause
exit /b 1
