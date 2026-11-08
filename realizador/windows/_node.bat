@echo off
rem Deja en NODE la ruta de Node.js 22 o superior. Por orden: el del PC, el que trae esta carpeta (node\) y, si no
rem hay ninguno, lo baja solo (version portatil oficial de nodejs.org, sin pedir permisos ni instalar nada en el PC).
set "NODE="
set "NODE_LOCAL=%~dp0..\node\node.exe"
set "VERSION_OK=process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
where node >nul 2>nul && node -e "%VERSION_OK%" >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" "%ProgramFiles%\nodejs\node.exe" -e "%VERSION_OK%" >nul 2>nul && set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%NODE_LOCAL%" set "NODE=%NODE_LOCAL%"
if defined NODE goto :listo
echo Este PC no tiene Node.js 22 o superior. Lo bajo ahora, solo para el realizador ^(no hace falta hacer nada^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_instalar-node.ps1"
if exist "%NODE_LOCAL%" set "NODE=%NODE_LOCAL%"
if defined NODE goto :listo
echo No se ha podido bajar. Pruebo a instalarlo con winget ^(puede pedir permiso^)...
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if defined NODE goto :listo
echo.
echo No se ha podido bajar Node.js ^(el motivo sale arriba en rojo^). Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo.
start https://nodejs.org
exit /b 1
:listo
rem Con el Node de la carpeta, que npm (lo usa INSTALAR-IA.bat) tambien se encuentre
if /I not "%NODE%"=="node" for %%D in ("%NODE%") do set "PATH=%%~dpD;%PATH%"
rem Que Node se fie de los certificados de Windows: algunos antivirus revisan las conexiones seguras con su propio
rem certificado y, sin esto, Node no conecta (por ejemplo con la API de Anthropic del modo IA)
"%NODE%" -e "process.exit(process.allowedNodeEnvironmentFlags.has('--use-system-ca') ? 0 : 1)" >nul 2>nul && set "NODE_OPTIONS=--use-system-ca"
exit /b 0
