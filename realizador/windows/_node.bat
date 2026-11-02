@echo off
rem Deja en NODE la ruta de Node.js. Si no esta, intenta instalarlo con winget.
set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if defined NODE exit /b 0
echo No tienes Node.js. Intentando instalarlo ^(puede pedir permiso^)...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if defined NODE exit /b 0
echo No se pudo instalar solo. Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo.
start https://nodejs.org
exit /b 1
