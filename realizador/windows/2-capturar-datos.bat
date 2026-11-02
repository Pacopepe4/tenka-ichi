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
echo Captura de datos. Abre antes una repeticion en LoL. Para acabar pulsa Ctrl+C y luego S.
echo.
node herramientas\capturar.js
echo.
pause
