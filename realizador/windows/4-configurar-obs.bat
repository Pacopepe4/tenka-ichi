@echo off
chcp 65001 >nul
cd /d "%~dp0.."
call "%~dp0_node.bat" || (pause & exit /b 1)
cd /d "%~dp0.."
echo Prepara OBS para el realizador: escenas Juego, Repeticion, Casters y Pausa, bufer de repeticion y WebSocket.
echo Tus escenas y perfiles de siempre no se tocan: siguen en los menus Coleccion de escenas y Perfil de OBS.
echo.
tasklist /FI "IMAGENAME eq obs64.exe" /NH | find /I "obs64.exe" >nul
if not errorlevel 1 (
  echo OBS esta abierto. Cierralo ^(tambien de la bandeja, junto al reloj^) y pulsa una tecla.
  pause >nul
)
"%NODE%" instalar\configurar-obs.js
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
