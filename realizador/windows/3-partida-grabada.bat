@echo off
chcp 65001 >nul
cd /d "%~dp0.."
call "%~dp0_node.bat" || (pause & exit /b 1)
cd /d "%~dp0.."
echo Realizador con una repeticion. Abre antes la repeticion en LoL y no la toques hasta que acabe la exploracion. Para acabar pulsa Ctrl+C.
echo.
"%NODE%" pc1\grabada.js
echo.
pause
