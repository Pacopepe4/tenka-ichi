@echo off
chcp 65001 >nul
title Modo IA del realizador - PC 1
cd /d "%~dp0"
call windows\_node.bat || (pause & exit /b 1)
echo Modo IA del realizador (solo en el PC 1).
echo La IA elige que sale en el overlay en los ratos tranquilos, que repeticion va si coinciden varias,
echo escribe titulares y el resumen final. La camara y las transiciones siguen con las reglas de siempre.
echo.
echo La clave se lee del archivo "realizado" de tus Documentos y no sale de este PC (solo va a Anthropic).
echo.
"%NODE%" instalar\ia.js
echo.
pause