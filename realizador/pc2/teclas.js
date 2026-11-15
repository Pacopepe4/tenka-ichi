// Teclas al LoL del PC 2 (15/11): la visión de un solo equipo no está en la Replay API (solo «fogOfWar» sí/no), pero
// el espectador la cambia con F1 (azul), F2 (rojo) y F3 (los dos). Probado el 15/11 en una repetición: funciona.
// Para pulsarlas, la ventana del LoL se trae al frente y la pulsación va por código de escaneo (SendInput), como un
// teclado de verdad. En el PC 2 el LoL es la ventana que captura OBS, así que traerlo al frente no molesta.
// Todo el juego va en un solo PowerShell (arrancarlo y compilar su parte de C# tarda 1-3 s: si fuera uno por tecla,
// los tiempos no serían los que tocan). Solo Windows.
import { spawn } from 'node:child_process';

export const CODIGOS = { F1: 0x3b, F2: 0x3c, F3: 0x3d };
export const VISION = { azul: 'F1', rojo: 'F2', todos: 'F3' };

// pasos: [[tecla, milisegundos de espera después], …]; «alFinal»: tecla que se pulsa pase lo que pase al acabar
export function scriptTeclas(pasos, alFinal = null) {
  const lineas = pasos.map(([t, ms]) => `  [TecladoRealizador]::Pulsar(${CODIGOS[t]})${ms > 0 ? `; Start-Sleep -Milliseconds ${Math.round(ms)}` : ''}`).join('\n');
  return `$ErrorActionPreference='Stop'
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class TecladoRealizador {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static void Pulsar(ushort scan) {
    var a = new INPUT[2];
    a[0].type = 1; a[0].u.ki.wScan = scan; a[0].u.ki.dwFlags = 0x0008;
    a[1].type = 1; a[1].u.ki.wScan = scan; a[1].u.ki.dwFlags = 0x000A;
    SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
$p = Get-Process 'League of Legends' | Select-Object -First 1
[TecladoRealizador]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 150
try {
${lineas}
} finally {
${alFinal ? `  [TecladoRealizador]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; [TecladoRealizador]::Pulsar(${CODIGOS[alFinal]})` : ''}
}`;
}

// Lanza las pulsaciones en un PowerShell oculto. Se cumple al acabar
export function ejecutarTeclas(pasos, alFinal = null, lanzar = spawn) {
  if (pasos.some(([t]) => !CODIGOS[t]) || (alFinal && !CODIGOS[alFinal])) return Promise.reject(new Error('tecla desconocida'));
  if (process.platform !== 'win32' && lanzar === spawn) return Promise.reject(new Error('solo en Windows'));
  return new Promise((ok, mal) => {
    const p = lanzar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', scriptTeclas(pasos, alFinal)], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    p.stderr?.on('data', d => { error = (error + d).slice(-300); });
    p.on('error', mal);
    p.on('close', c => (c === 0 ? ok() : mal(new Error(error.trim().split('\n').at(-1) || `powershell salió con ${c}`))));
  });
}

// Visión de cada equipo un momento y vuelta a la de los dos: azul, rojo y, pase lo que pase, todos
export function juegoDeVision({ segundos = 2, ejecutar = ejecutarTeclas } = {}) {
  return ejecutar([[VISION.azul, segundos * 1000], [VISION.rojo, segundos * 1000]], VISION.todos);
}
