@echo off
chcp 65001 >nul
rem Aplica la actualizacion pendiente del realizador (lo pasa Realizador.vbs con el realizador ya cerrado).
rem El aplicador cambia los archivos de esta carpeta mientras corre: por eso la orden de Node y la salida van en la
rem misma linea (cmd ya la tiene leida y no vuelve a mirar este archivo).
cd /d "%~dp0.."
call "%~dp0_node.bat" >nul 2>nul
if errorlevel 1 exit /b 1
"%NODE%" ".actualizacion\aplicar.mjs" --carpeta "%CD%" --papel %1 & exit /b
