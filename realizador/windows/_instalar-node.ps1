# Instala Node.js sin pedir permisos: baja la versión LTS portátil (zip oficial de nodejs.org) y la deja en la
# carpeta node\ del realizador. No toca nada fuera de esa carpeta ni necesita administrador.
# Lo usa windows\_node.bat cuando el PC no tiene Node 22 o superior.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz 'node'
$arq = if ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }

Write-Host 'Buscando la ultima version LTS de Node.js...'
$lista = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
$version = $lista | Where-Object { $_.lts -and ([int]($_.version.TrimStart('v').Split('.')[0]) -ge 22) -and ($_.files -contains "$arq-zip") } | Select-Object -First 1
if (-not $version) { throw 'No encuentro una version LTS de Node.js para este PC' }
$nombre = "node-$($version.version)-$arq"
$zip = Join-Path $env:TEMP "$nombre.zip"

Write-Host "Bajando Node.js $($version.version) (unos 30 MB)..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/$($version.version)/$nombre.zip" -OutFile $zip -UseBasicParsing -TimeoutSec 600

# Comprobar la descarga con la suma SHA-256 publicada por nodejs.org
$sumas = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$($version.version)/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 30).Content
$esperada = ($sumas -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape("$nombre.zip"))$" } | ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1
$real = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
if (-not $esperada -or $real -ne $esperada.ToLower()) { Remove-Item $zip -Force; throw 'La descarga de Node.js no coincide con la suma oficial' }

Write-Host 'Descomprimiendo...'
$tmp = Join-Path $env:TEMP "realizador-node-$PID"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
Move-Item -Path (Join-Path $tmp $nombre) -Destination $destino
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Write-Host "Node.js $($version.version) listo en $destino"
