@echo off
chcp 65001 >nul
title Instalar realizador - PC 1
cd /d "%~dp0"
call windows\_node.bat || (pause & exit /b 1)
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
