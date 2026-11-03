@echo off
chcp 65001 >nul
title Realizador PC 1 - no cierres esta ventana
cd /d "%~dp0.."
call windows\_node.bat || (pause & exit /b 1)
echo Realizador del PC 1.
echo En unos segundos se abre su ventana: ahi esta el boton de Empezar directo y lo que falta para empezar.
echo Si la cierras sin querer, vuelve a abrirla en http://localhost:4600/
echo.
echo NO CIERRES ESTA VENTANA NEGRA mientras dure el directo (puedes minimizarla). Para cerrar el realizador: Ctrl+C.
echo.
start "" /min cmd /c "timeout /t 3 >nul & call "%~dp0_abrir-pagina.bat" http://localhost:4600/"
"%NODE%" pc1\agente.js
echo.
pause
