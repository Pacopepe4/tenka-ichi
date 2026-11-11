@echo off
chcp 65001 >nul
title Instalar realizador - PC 1
cd /d "%~dp0"
call windows\_node.bat || (pause & exit /b 1)
rem Si el realizador esta abierto (aunque sea oculto), se cierra antes de instalar (11/11)
curl -s -m 3 -X POST -H "Content-Type: application/json" -d "{\"accion\":\"cerrar\"}" http://localhost:4600/app >nul 2>nul && (echo Cerrando el realizador que estaba abierto... & timeout /t 4 >nul)
echo Instalacion del realizador en el PC 1.
echo Usa la contrasena del panel de Gokudo, la misma en los dos PCs: con ella se encuentran y se conectan.
echo.
set "CLAVE="
set /p "CLAVE=Contrasena del panel de Gokudo: "
if not defined CLAVE (echo Hace falta una contrasena. & pause & exit /b 1)
set "RUTA=C:\Riot Games\League of Legends"
if not exist "%RUTA%\Config" (
  echo No encuentro LoL en %RUTA%.
  set /p "RUTA=Escribe la carpeta de League of Legends (por ejemplo E:\Riot Games\League of Legends): "
)
"%NODE%" instalar\instalar.js pc1 --clave "%CLAVE%" --ruta "%RUTA%"
echo.
pause
