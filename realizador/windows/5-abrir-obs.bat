@echo off
chcp 65001 >nul
rem setlocal: al acabar vuelve a la carpeta de antes (si no, quien lo llama se queda en la de OBS)
setlocal
rem Abre OBS con la coleccion y el perfil del realizador y el bufer de repeticion ya arrancado, en la bandeja.
rem Con "sinpausa" (lo llama el realizador, a veces oculto) no pregunta ni espera nada: si no encuentra OBS, lo dice
rem y sigue (el realizador lo vuelve a intentar y en su panel sale el boton Abrir OBS).
set "INTERACTIVO=1"
if /I "%~1"=="sinpausa" set "INTERACTIVO="
tasklist /FI "IMAGENAME eq obs64.exe" /NH | find /I "obs64.exe" >nul
if not errorlevel 1 (
  echo OBS ya esta abierto.
  if defined INTERACTIVO pause
  exit /b 0
)
rem Donde esta OBS: lo que apunta su instalador en el registro de Windows y, si no, los sitios de siempre
set "OBS="
for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\OBS Studio" /ve 2^>nul ^| find "REG_SZ"') do set "OBS=%%b\bin\64bit"
if not defined OBS set "OBS=%ProgramFiles%\obs-studio\bin\64bit"
if not exist "%OBS%\obs64.exe" set "OBS=%ProgramFiles%\obs-studio\bin\64bit"
if not exist "%OBS%\obs64.exe" set "OBS=%ProgramFiles(x86)%\Steam\steamapps\common\OBS Studio\bin\64bit"
if not exist "%OBS%\obs64.exe" (
  echo No encuentro OBS ^(obs64.exe^).
  if not defined INTERACTIVO exit /b 1
  set /p "OBS=Escribe la carpeta donde esta obs64.exe (por ejemplo D:\obs-studio\bin\64bit): "
)
if not exist "%OBS%\obs64.exe" (
  echo Tampoco esta ahi. Abre OBS a mano y en Controles pulsa Iniciar bufer de repeticion.
  if defined INTERACTIVO pause
  exit /b 1
)
cd /d "%OBS%"
start "" obs64.exe --collection "Realizador" --profile "Realizador" --startreplaybuffer --minimize-to-tray
echo OBS abierto en la bandeja ^(junto al reloj^) con el bufer de repeticion en marcha: %OBS%
if defined INTERACTIVO timeout /t 3 >nul
exit /b 0
