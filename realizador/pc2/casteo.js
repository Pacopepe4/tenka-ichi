// Abre solo, en el PC 2, las dos páginas del casteo a distancia (comun/casteo.js) en un Edge aparte:
//  - «compartir»: comparte la ventana del LoL. Edge la elige solo (--auto-select-desktop-capture-source) y acepta
//    los permisos (--use-fake-ui-for-media-stream). SIN PROBAR (15/11): si Edge exige un clic para compartir pantalla,
//    se queda esperando a que lo den en esa ventana. Por eso va apagado de fábrica (rele.casteo.activo).
//  - «hablar»: la voz del PC 2 en la sala (y por ahí suenan las de los casters, que OBS coge del escritorio).
// Cada LoL nuevo (otra partida) es otra ventana: la página de compartir se vuelve a abrir cuando vuelve el LoL.
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const TITULO_LOL = 'League of Legends (TM) Client';

export function rutaEdge(entorno = process.env) {
  for (const base of [entorno['ProgramFiles(x86)'], entorno.ProgramFiles, entorno.LOCALAPPDATA]) {
    if (!base) continue;
    const r = join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (existsSync(r)) return r;
  }
  return null;
}

// Perfil de Edge propio de cada página: así se puede cerrar una sin tocar la otra ni el Edge de la persona
export const perfil = (entorno, nombre) => join(entorno.LOCALAPPDATA || '.', 'RealizadorGokudo', `casteo-${nombre}`);

export function argumentosEdge({ url, perfil: dir, ventana = null }) {
  return [
    `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required', ...(ventana ? [`--auto-select-desktop-capture-source=${ventana}`] : []),
    '--new-window', url,
  ];
}

// Cierra el Edge de un perfil nuestro (por la carpeta de perfil en su línea de órdenes)
export function cerrarPerfil(dir, ejecutar = execFile) {
  const filtro = dir.replace(/\\/g, '\\\\').replace(/'/g, "''");
  return new Promise(ok => ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${filtro}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
  { windowsHide: true }, () => ok()));
}

export class Casteo {
  constructor({ enlaces, registrar = () => {}, entorno = process.env, lanzar = spawn, cerrar = cerrarPerfil } = {}) {
    Object.assign(this, { enlaces, registrar, entorno, lanzar, cerrar });
    this.edge = rutaEdge(entorno);
    this.hablando = false;
    this.compartiendo = false;
  }
  abrir(nombre, url, ventana = null) {
    if (!this.edge) { this.registrar('[casteo] no encuentro Edge: abrid las páginas a mano'); return false; }
    const p = this.lanzar(this.edge, argumentosEdge({ url, perfil: perfil(this.entorno, nombre), ventana }), { detached: true, stdio: 'ignore', windowsHide: false });
    p.unref?.();
    return true;
  }
  // Cada vuelta del relé: lol = ¿responde el LoL del PC 2 (hay ventana de partida)?
  async paso({ lol }) {
    if (!this.enlaces) return;
    if (!this.hablando) {
      this.hablando = this.abrir('hablar', this.enlaces.hablar);
      if (this.hablando) this.registrar('[casteo] abierta la sala de voz con los casters');
    }
    if (lol && !this.compartiendo) {
      await this.cerrar(perfil(this.entorno, 'partida'));
      this.compartiendo = this.abrir('partida', this.enlaces.compartir, TITULO_LOL);
      if (this.compartiendo) this.registrar('[casteo] compartiendo la ventana del LoL con los casters');
    } else if (!lol && this.compartiendo) {
      // El LoL se ha cerrado: la próxima partida es otra ventana y hay que volver a compartirla
      this.compartiendo = false;
    }
  }
  async parar() {
    await this.cerrar(perfil(this.entorno, 'partida'));
    await this.cerrar(perfil(this.entorno, 'hablar'));
    this.compartiendo = false; this.hablando = false;
  }
}
