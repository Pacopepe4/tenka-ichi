# Abre el puente del marcador de Gokudo (si viene en la descarga del PC 2) sin ventana, y solo si no esta ya abierto.
# Sin clave.txt el puente pregunta la contrasena: entonces se abre con su ventana para poder escribirla.
$carpeta = Join-Path $PSScriptRoot '..\puente'
$ps1 = Join-Path $carpeta 'puente-tenka-ichi.ps1'
if (-not (Test-Path $ps1)) { exit 0 }
$ya = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*puente-tenka-ichi.ps1*' }
if ($ya) { exit 0 }
$estilo = 'Hidden'
if (-not (Test-Path (Join-Path $carpeta 'clave.txt'))) { $estilo = 'Normal' }
Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$ps1`"") -WorkingDirectory $carpeta -WindowStyle $estilo
