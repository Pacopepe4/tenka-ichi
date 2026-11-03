# Volcado de los jugadores de la partida
# Guarda en volcado-jugadores.json lo que el cliente de League of Legends da de cada jugador (Live Client Data API,
# https://127.0.0.1:2999): hechizos, runas, objetos con su hueco y marcador. Sirve para ver cómo llega a las partidas
# de verdad la misión de rol (TP desatado, botas, pinkward…) y colocarla bien en el línea por línea del overlay.
# Úsalo con una partida (o una repetición) en marcha, mejor pasado el minuto 15, cuando ya se han cumplido misiones.
# Solo lee datos que el propio cliente ofrece; no toca el juego ni manda nada a internet.
param(
  [string]$Destino
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# El cliente de LoL sirve sus datos con un certificado propio en 127.0.0.1: se acepta solo para esa dirección
Add-Type -TypeDefinition @"
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
public static class ConfianzaLocal {
  public static bool Validar(object remitente, X509Certificate cert, X509Chain cadena, SslPolicyErrors errores) {
    var peticion = remitente as HttpWebRequest;
    if (peticion != null && peticion.RequestUri.Host == "127.0.0.1") return true;
    return errores == SslPolicyErrors.None;
  }
  public static void Activar() { ServicePointManager.ServerCertificateValidationCallback = Validar; }
}
"@
[ConfianzaLocal]::Activar()

if (-not $Destino) { $Destino = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'volcado-jugadores.json' }
$puerto = if ($env:PUERTO_CLIENTE_LOL) { $env:PUERTO_CLIENTE_LOL } else { '2999' }

try {
  $r = Invoke-WebRequest -Uri "https://127.0.0.1:$puerto/liveclientdata/playerlist" -UseBasicParsing -TimeoutSec 5
} catch {
  Write-Host 'No hay ninguna partida en marcha en este ordenador (el cliente no responde en el puerto 2999).' -ForegroundColor Yellow
  Write-Host 'Abre la partida o la repetición, espera a que cargue y vuelve a ejecutarlo.'
  exit 1
}
$jugadores = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
$texto = $jugadores | ConvertTo-Json -Depth 12
[IO.File]::WriteAllText($Destino, $texto, (New-Object Text.UTF8Encoding($false)))
Write-Host "Listo: $($jugadores.Count) jugadores guardados en $Destino" -ForegroundColor Green
Write-Host 'Mándame ese archivo.'
