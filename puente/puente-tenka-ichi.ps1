# Puente de Tenka Ichi
# Lee la partida del cliente de League of Legends (Live Client Data API, https://127.0.0.1:2999)
# y la manda cada segundo a la web de Tenka Ichi, que la pinta en el overlay de partida (/ingame/).
# Se abre en el PC donde se mira la partida en modo espectador. No instala nada: usa PowerShell,
# que viene con Windows. Solo lee datos que el propio cliente ofrece; no toca el juego.
param(
  [string]$Servidor = 'https://tenka-ichi.onrender.com'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = 'Puente de Tenka Ichi'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# El cliente de LoL sirve sus datos con un certificado propio en 127.0.0.1. Se acepta solo para esa
# dirección; la conexión con la web de Tenka Ichi se comprueba como siempre.
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

$Servidor = $Servidor.TrimEnd('/')
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$archivoClave = Join-Path $carpeta 'clave.txt'
$Clave = ''
if (Test-Path $archivoClave) { $Clave = (Get-Content $archivoClave -Raw).Trim() }
if (-not $Clave) {
  $Clave = (Read-Host 'Contraseña del panel de Tenka Ichi').Trim()
  Set-Content -Path $archivoClave -Value $Clave -Encoding UTF8
  Write-Host 'Guardada en clave.txt. Si la cambias, borra ese archivo y vuelve a abrir el puente.'
}

function Hora { (Get-Date).ToString('HH:mm:ss') }

function LeerCliente([string]$ruta) {
  $r = Invoke-WebRequest -Uri "https://127.0.0.1:2999$ruta" -UseBasicParsing -TimeoutSec 2
  return [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
}

function Enviar([string]$json) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $r = Invoke-WebRequest -Uri "$Servidor/api/partida" -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' `
    -Headers @{ 'X-Clave' = $Clave } -UseBasicParsing -TimeoutSec 15
  return ($r.Content | ConvertFrom-Json)
}

# Barra de marcador del juego: se oculta con la Replay API (hay que activarla en game.cfg, ver la guía)
$marcadorOculto = $false
$replayAvisado = $false
function MarcadorDelJuego([bool]$visible) {
  $cuerpo = if ($visible) { '{"interfaceScore":true}' } else { '{"interfaceScore":false}' }
  try {
    Invoke-WebRequest -Uri 'https://127.0.0.1:2999/replay/render' -Method Post -Body $cuerpo -ContentType 'application/json' -UseBasicParsing -TimeoutSec 2 | Out-Null
    $script:marcadorOculto = -not $visible
    Write-Host "$(Hora)  Barra de marcador del juego $(if ($visible) { 'visible' } else { 'oculta: queda la de Tenka Ichi' })"
  } catch {
    if (-not $script:replayAvisado) {
      Write-Host "$(Hora)  No puedo ocultar la barra de marcador del juego: activa la Replay API (en la guía)." -ForegroundColor Yellow
      $script:replayAvisado = $true
    }
  }
}

Write-Host ''
Write-Host '  Puente de Tenka Ichi' -ForegroundColor Red
Write-Host "  Manda la partida a $Servidor"
Write-Host '  Déjalo abierto mientras se juega. Para cerrarlo, cierra esta ventana.'
Write-Host ''

$ultimoEvento = -1
$tiempoAnterior = 0
$enPartida = $false
$ultimoLatido = [DateTime]::MinValue
$ultimoMensaje = [DateTime]::MinValue

while ($true) {
  $inicio = Get-Date
  try {
    $juego = LeerCliente '/liveclientdata/gamestats'
    $tiempo = [double](($juego | ConvertFrom-Json).gameTime)
    # Partida nueva (el reloj vuelve atrás): se piden los eventos desde el principio
    if ($tiempo + 5 -lt $tiempoAnterior) { $ultimoEvento = -1 }
    $tiempoAnterior = $tiempo
    $jugadores = LeerCliente '/liveclientdata/playerlist'
    $desde = $ultimoEvento + 1
    $eventos = LeerCliente "/liveclientdata/eventdata?eventID=$desde"
    $lista = @(($eventos | ConvertFrom-Json).Events)
    foreach ($ev in $lista) { if ($ev -and [int]$ev.EventID -gt $ultimoEvento) { $ultimoEvento = [int]$ev.EventID } }

    if (-not $enPartida) {
      Write-Host "$(Hora)  Partida encontrada en el cliente de LoL." -ForegroundColor Green
      $enPartida = $true
    }
    try {
      $r = Enviar ('{"juego":' + $juego + ',"jugadores":' + $jugadores + ',"eventosData":' + $eventos + ',"desde":' + $desde + '}')
      # La web se ha reiniciado a mitad de partida y le faltan los eventos de antes: se mandan todos otra vez
      if ($r.reenviar) {
        $ultimoEvento = -1
        Write-Host "$(Hora)  La web se ha reiniciado: le vuelvo a mandar la partida desde el principio."
      }
      if ($r.ocultarMarcador -and -not $marcadorOculto) { MarcadorDelJuego $false }
      elseif (-not $r.ocultarMarcador -and $marcadorOculto) { MarcadorDelJuego $true }
      if (((Get-Date) - $ultimoMensaje).TotalSeconds -ge 15) {
        $m = [int][Math]::Floor($tiempo / 60); $s = [int][Math]::Floor($tiempo % 60)
        Write-Host ("{0}  Enviando la partida · minuto {1:00}:{2:00}" -f (Hora), $m, $s)
        $ultimoMensaje = Get-Date
      }
    } catch {
      $codigo = $_.Exception.Response.StatusCode.value__
      if ($codigo -eq 401) {
        Write-Host "$(Hora)  Contraseña incorrecta. Borra clave.txt, vuelve a abrir el puente y escríbela bien." -ForegroundColor Red
        Start-Sleep -Seconds 10
      } else {
        Write-Host "$(Hora)  No llego a la web (si estaba dormida, tarda un minuto en despertar). Reintento…" -ForegroundColor Yellow
        Start-Sleep -Seconds 3
      }
    }
  } catch {
    # Sin partida: el cliente no responde en 127.0.0.1:2999
    if ($enPartida) {
      Write-Host "$(Hora)  La partida ha terminado o se ha cerrado el cliente." -ForegroundColor Yellow
      $enPartida = $false
      $marcadorOculto = $false
    }
    $ultimoEvento = -1
    $tiempoAnterior = 0
    if (((Get-Date) - $ultimoLatido).TotalSeconds -ge 5) {
      try { Enviar '{"sinPartida":true}' | Out-Null } catch { }
      $ultimoLatido = Get-Date
      if (((Get-Date) - $ultimoMensaje).TotalSeconds -ge 30) {
        Write-Host "$(Hora)  Esperando una partida en el cliente de LoL (entra a mirarla como espectador)…"
        $ultimoMensaje = Get-Date
      }
    }
    Start-Sleep -Seconds 2
    continue
  }
  $resto = 1000 - ((Get-Date) - $inicio).TotalMilliseconds
  if ($resto -gt 0) { Start-Sleep -Milliseconds ([int]$resto) }
}
