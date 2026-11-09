@echo off
chcp 65001 >nul
title Instalar realizador - PC 2
cd /d "%~dp0"
call windows\_node.bat || (pause & exit /b 1)
echo Instalacion del realizador en el PC 2.
echo Usa la contrasena del panel de Gokudo, la misma en los dos PCs: con ella se encuentran y se conectan.
echo.
rem OBS tiene que estar cerrado: si no, no se puede dejar configurado (y al cerrarse pisaria los cambios)
:esperarObs
tasklist /FI "IMAGENAME eq obs64.exe" /NH | find /I "obs64.exe" >nul
if not errorlevel 1 (
  echo OBS esta abierto. Cierralo ^(tambien el icono de la bandeja, junto al reloj^) y pulsa una tecla.
  pause >nul
  goto :esperarObs
)
set "CLAVE="
set /p "CLAVE=Contrasena del panel de Gokudo: "
if not defined CLAVE (echo Hace falta una contrasena. & pause & exit /b 1)
set "RUTA=C:\Riot Games\League of Legends"
if not exist "%RUTA%\Config" (
  echo No encuentro LoL en %RUTA%.
  set /p "RUTA=Escribe la carpeta de League of Legends (por ejemplo E:\Riot Games\League of Legends): "
)
echo.
echo Clave de retransmision de Kick ^(en Kick: Panel del creador, Ajustes, Stream key^).
echo Se guarda solo en este PC y OBS la usa para emitir. Pulsa Enter sin escribir nada para dejar la que ya tenga OBS.
set "REALIZADOR_EMISION="
set /p "REALIZADOR_EMISION=Clave de retransmision de Kick: "
cls
echo Clave de Twitch para emitir tambien alli a la vez ^(en Twitch: Panel de control del creador, Configuracion,
echo Transmision, Clave de transmision principal^). Se guarda solo en este PC. Enter sin nada: solo Kick.
set "REALIZADOR_TWITCH="
set /p "REALIZADOR_TWITCH=Clave de Twitch: "
cls
"%NODE%" instalar\instalar.js pc2 --clave "%CLAVE%" --ruta "%RUTA%"
set "REALIZADOR_EMISION="
set "REALIZADOR_TWITCH="
echo.
pause
