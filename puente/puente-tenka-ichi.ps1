# Puente de Tenka Ichi
# Lee la partida del cliente de League of Legends (Live Client Data API, https://127.0.0.1:2999)
# y la manda cada segundo a la web de Tenka Ichi, que la pinta en el overlay de partida (/ingame/).
# Se abre en el PC donde se mira la partida en modo espectador y se deja abierto toda la jornada:
# espera hasta que el panel le pide buscar la partida (o hasta que acaba el draft) y deja de buscar
# cuando la partida termina. No instala nada: usa PowerShell, que viene con Windows. Solo lee datos
# que el propio cliente ofrece; no toca el juego.
param(
  [string]$Servidor = 'https://tenka-ichi.onrender.com'
)
$Version = 2

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

# Si la web no responde o la contraseña está mal, se dice una vez cada 20 s para no llenar la ventana
$ultimoFallo = [DateTime]::MinValue
function FalloWeb($err) {
  if (((Get-Date) - $script:ultimoFallo).TotalSeconds -lt 20) { return }
  $script:ultimoFallo = Get-Date
  if ($err.Exception.Response.StatusCode.value__ -eq 401) {
    Write-Host "$(Hora)  Contraseña incorrecta. Borra clave.txt, vuelve a abrir el puente y escríbela bien." -ForegroundColor Red
  } else {
    Write-Host "$(Hora)  No llego a la web (si estaba dormida, tarda un minuto en despertar). Reintento…" -ForegroundColor Yellow
  }
}

# Latido sin partida: la web sabe que el puente sigue abierto y contesta si el panel quiere que busque
function Latido([bool]$espera) {
  $cuerpo = '{"sinPartida":true,"version":' + $Version + $(if ($espera) { ',"espera":true' } else { '' }) + '}'
  try { return [bool](Enviar $cuerpo).buscar } catch { FalloWeb $_; return $script:buscar }
}

Write-Host ''
Write-Host '  Puente de Tenka Ichi' -ForegroundColor Red
Write-Host "  Conectado con $Servidor"
Write-Host '  Déjalo abierto toda la jornada: busca la partida cuando se lo pide el panel,'
Write-Host '  o solo al acabar el draft. Para cerrarlo, cierra esta ventana.'
Write-Host ''

$buscar = $false
$ultimoEvento = -1
$tiempoAnterior = 0
$enPartida = $false
$fallosSeguidos = 0
$ultimoLatido = [DateTime]::MinValue
$ultimoMensaje = [DateTime]::MinValue
$avisadoEspera = $false

while ($true) {
  $inicio = Get-Date

  # En espera: no se toca el cliente de LoL, solo se pregunta a la web cada 3 s si hay que buscar
  if (-not $buscar) {
    if ($enPartida) {
      Write-Host "$(Hora)  El panel ha dejado de buscar: dejo de mandar la partida." -ForegroundColor Yellow
      $enPartida = $false
    }
    if ($marcadorOculto) { MarcadorDelJuego $true; $marcadorOculto = $false }
    if (((Get-Date) - $ultimoLatido).TotalSeconds -ge 3) {
      $buscar = Latido $true
      $ultimoLatido = Get-Date
      if ($buscar) {
        Write-Host "$(Hora)  El panel pide la partida: la busco en el cliente de LoL…" -ForegroundColor Cyan
        $ultimoMensaje = Get-Date
        $avisadoEspera = $false
      } elseif (-not $avisadoEspera) {
        Write-Host "$(Hora)  En espera. Me pongo a buscar cuando el panel pulse «Buscar la partida» o cuando acabe el draft."
        $avisadoEspera = $true
      }
    }
    Start-Sleep -Milliseconds 500
    continue
  }

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
    $fallosSeguidos = 0

    if (-not $enPartida) {
      Write-Host "$(Hora)  Partida encontrada: empieza el marcador de Tenka Ichi." -ForegroundColor Green
      $enPartida = $true
    }
    try {
      $r = Enviar ('{"version":' + $Version + ',"juego":' + $juego + ',"jugadores":' + $jugadores + ',"eventosData":' + $eventos + ',"desde":' + $desde + '}')
      $buscar = [bool]$r.buscar
      # La web se ha reiniciado a mitad de partida y le faltan los eventos de antes: se mandan todos otra vez
      if ($r.reenviar) {
        $ultimoEvento = -1
        Write-Host "$(Hora)  La web se ha reiniciado: le vuelvo a mandar la partida desde el principio."
      }
      if ($buscar -and $r.ocultarMarcador -and -not $marcadorOculto) { MarcadorDelJuego $false }
      elseif ($buscar -and -not $r.ocultarMarcador -and $marcadorOculto) { MarcadorDelJuego $true }
      if (((Get-Date) - $ultimoMensaje).TotalSeconds -ge 15) {
        $m = [int][Math]::Floor($tiempo / 60); $s = [int][Math]::Floor($tiempo % 60)
        Write-Host ("{0}  Enviando la partida · minuto {1:00}:{2:00}" -f (Hora), $m, $s)
        $ultimoMensaje = Get-Date
      }
    } catch {
      FalloWeb $_
      Start-Sleep -Seconds 2
    }
  } catch {
    # El cliente no responde en 127.0.0.1:2999. En plena partida, un corte de unos segundos (cargando,
    # saltando en una repetición) no la da por terminada: tiene que fallar 4 veces seguidas
    if ($enPartida -and $fallosSeguidos -lt 4) {
      $fallosSeguidos++
      Start-Sleep -Seconds 1
      continue
    }
    $fallosSeguidos = 0
    if ($enPartida) {
      Write-Host "$(Hora)  La partida ha terminado o se ha cerrado el cliente." -ForegroundColor Yellow
      $enPartida = $false
      $marcadorOculto = $false
    }
    $ultimoEvento = -1
    $tiempoAnterior = 0
    if (((Get-Date) - $ultimoLatido).TotalSeconds -ge 3) {
      $buscar = Latido $false
      $ultimoLatido = Get-Date
      if (-not $buscar) {
        Write-Host "$(Hora)  Se ha dejado de buscar la partida."
      } elseif (((Get-Date) - $ultimoMensaje).TotalSeconds -ge 30) {
        Write-Host "$(Hora)  Buscando la partida en el cliente de LoL (entra a mirarla como espectador)…"
        $ultimoMensaje = Get-Date
      }
    }
    Start-Sleep -Seconds 1
    continue
  }
  $resto = 1000 - ((Get-Date) - $inicio).TotalMilliseconds
  if ($resto -gt 0) { Start-Sleep -Milliseconds ([int]$resto) }
}
