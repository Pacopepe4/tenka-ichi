@echo off
chcp 65001 >nul
cd /d "%~dp0.."
call "%~dp0_node.bat" || (pause & exit /b 1)
cd /d "%~dp0.."
echo Deja tu OBS como lo tenias: tu perfil y tu coleccion de siempre vuelven a ser los de arranque,
echo para que tu OBS no emita en los canales de Gokudo. Los del realizador siguen ahi, pero ya no se abren solos.
echo Si OBS esta abierto, se cierra antes ^(si esta emitiendo, OBS te preguntara^).
echo.
"%NODE%" instalar\desconfigurar-obs.js
echo.
pause
