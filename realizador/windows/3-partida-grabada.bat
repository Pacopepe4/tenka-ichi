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
echo Realizador con una repeticion. Abre antes la repeticion en LoL y no la toques hasta que acabe la exploracion. Para acabar pulsa Ctrl+C.
echo.
node pc1\grabada.js
echo.
pause
