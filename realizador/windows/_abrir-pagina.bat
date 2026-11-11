@echo off
rem Abre la pagina del realizador como una ventana propia (Edge o Chrome en modo app); si no, en el navegador.
rem Uso: call _abrir-pagina.bat http://localhost:4600/
set "URL=%~1"
set "NAV="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined NAV if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined NAV if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined NAV if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "NAV=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if defined NAV (
  start "" "%NAV%" --app=%URL% --window-size=1440,900 --user-data-dir="%LOCALAPPDATA%\RealizadorGokudo\ventana" --no-first-run --no-default-browser-check
) else (
  start "" %URL%
)
exit /b 0
