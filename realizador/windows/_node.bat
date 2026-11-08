@echo off
rem Deja en NODE la ruta de Node.js 22 o superior. Por orden: el del PC, el que trae esta carpeta (node\) y, si no
rem hay ninguno, lo baja solo (version portatil oficial de nodejs.org, sin pedir permisos ni instalar nada en el PC).
set "NODE="
set "NODE_LOCAL=%~dp0..\node\node.exe"
where node >nul 2>nul && node -e "process.exit(+process.versions.node.split('.')[0] < 22)" >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" "%ProgramFiles%\nodejs\node.exe" -e "process.exit(+process.versions.node.split('.')[0] < 22)" >nul 2>nul && set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%NODE_LOCAL%" set "NODE=%NODE_LOCAL%"
if defined NODE goto :listo
echo Este PC no tiene Node.js 22 o superior. Lo bajo ahora, solo para el realizador ^(no hace falta hacer nada^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_instalar-node.ps1"
if exist "%NODE_LOCAL%" set "NODE=%NODE_LOCAL%"
if defined NODE goto :listo
echo.
echo No se ha podido bajar Node.js ^(sin internet?^). Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo.
start https://nodejs.org
exit /b 1
:listo
rem Con el Node de la carpeta, que npm (lo usa INSTALAR-IA.bat) tambien se encuentre
if /I not "%NODE%"=="node" for %%D in ("%NODE%") do set "PATH=%%~dpD;%PATH%"
exit /b 0
