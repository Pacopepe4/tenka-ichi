@echo off
chcp 65001 >nul
cd /d "%~dp0.."
call "%~dp0_node.bat" || (pause & exit /b 1)
cd /d "%~dp0.."
echo Captura de datos. Abre antes una repeticion en LoL. Para acabar pulsa Ctrl+C y luego S.
echo.
"%NODE%" herramientas\capturar.js
echo.
pause
