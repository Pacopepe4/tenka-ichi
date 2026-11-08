@echo off
chcp 65001 >nul
cd /d "%~dp0.."
call "%~dp0_node.bat" || (pause & exit /b 1)
cd /d "%~dp0.."
echo Activa la Replay API y LiveEvents en el juego. Luego reinicia el cliente de LoL.
echo.
set "RUTA=C:\Riot Games\League of Legends"
if not exist "%RUTA%\Config" (
  echo No encuentro el juego en %RUTA%.
  set /p "RUTA=Escribe la carpeta de League of Legends (por ejemplo E:\Riot Games\League of Legends): "
)
"%NODE%" instalar\configurar-lol.js pc1 --ruta "%RUTA%"
echo.
pause
