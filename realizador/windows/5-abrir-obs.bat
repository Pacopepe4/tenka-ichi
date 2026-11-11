@echo off
chcp 65001 >nul
rem setlocal: al acabar vuelve a la carpeta de antes (si no, quien lo llama se queda en la de OBS)
setlocal
rem Abre OBS con la coleccion y el perfil del realizador y el bufer de repeticion ya arrancado.
tasklist /FI "IMAGENAME eq obs64.exe" /NH | find /I "obs64.exe" >nul
if not errorlevel 1 (
  echo OBS ya esta abierto. Si el bufer no esta en marcha, pulsa Iniciar bufer de repeticion en Controles.
  if /I not "%~1"=="sinpausa" pause
  exit /b 0
)
set "OBS=%ProgramFiles%\obs-studio\bin\64bit"
if not exist "%OBS%\obs64.exe" set "OBS=%ProgramFiles(x86)%\Steam\steamapps\common\OBS Studio\bin\64bit"
if not exist "%OBS%\obs64.exe" (
  echo No encuentro OBS en "%ProgramFiles%\obs-studio".
  set /p "OBS=Escribe la carpeta donde esta obs64.exe (por ejemplo D:\obs-studio\bin\64bit): "
)
if not exist "%OBS%\obs64.exe" (
  echo Tampoco esta ahi. Abre OBS a mano y en Controles pulsa Iniciar bufer de repeticion.
  if /I not "%~1"=="sinpausa" pause
  exit /b 1
)
cd /d "%OBS%"
start "" obs64.exe --collection "Realizador" --profile "Realizador" --startreplaybuffer --minimize-to-tray
echo OBS abierto en la bandeja ^(junto al reloj^) con el bufer de repeticion en marcha.
if /I not "%~1"=="sinpausa" timeout /t 3 >nul
