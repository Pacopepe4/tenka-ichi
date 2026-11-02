@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo.
  start https://nodejs.org
  pause
  exit /b 1
)
echo Prepara OBS para el realizador: escenas Juego, Repeticion, Casters y Pausa, bufer de repeticion y WebSocket.
echo Tus escenas y perfiles de siempre no se tocan: siguen en los menus Coleccion de escenas y Perfil de OBS.
echo.
tasklist /FI "IMAGENAME eq obs64.exe" /NH | find /I "obs64.exe" >nul
if not errorlevel 1 (
  echo OBS esta abierto. Cierralo ^(tambien de la bandeja, junto al reloj^) y pulsa una tecla.
  pause >nul
)
node instalar\configurar-obs.js
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
echo.
set "ABRIR=S"
set /p "ABRIR=Abrir OBS ahora con el bufer de repeticion en marcha? (S/N) [S]: "
if /I "%ABRIR%"=="S" call "%~dp05-abrir-obs.bat" sinpausa
echo.
pause
