// Abrir OBS desde el realizador del PC 2 (11/11: en el PC 2 OBS no se abría y no había forma de verlo). El .bat lo
// abre al arrancar; esto lo vuelve a abrir si se cierra mientras corre el realizador, y el botón «Abrir OBS» del panel
// lo abre con su ventana (para ver si se ha quedado en algún aviso, como el del modo seguro tras un cierre inesperado).
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';

// Dónde está obs64.exe: lo que diga opciones.json (obs.ruta) o los sitios de siempre
export function rutaObs(o = {}, entorno = process.env) {
  const candidatas = [
    o.obs?.ruta,
    entorno.ProgramFiles && join(entorno.ProgramFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe'),
    entorno['ProgramFiles(x86)'] && join(entorno['ProgramFiles(x86)'], 'Steam', 'steamapps', 'common', 'OBS Studio', 'bin', '64bit', 'obs64.exe'),
    entorno.ProgramW6432 && join(entorno.ProgramW6432, 'obs-studio', 'bin', '64bit', 'obs64.exe'),
  ].filter(Boolean);
  return candidatas.find(r => existsSync(r)) || null;
}

export function obsCorriendo() {
  return new Promise(resolver => {
    if (process.platform !== 'win32') return resolver(false);
    execFile('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], { windowsHide: true, timeout: 10000 }, (e, salida) => resolver(!e && /obs64\.exe/i.test(String(salida))));
  });
}

// Lo abre con la colección y el perfil del realizador y el búfer en marcha. minimizado: a la bandeja.
export function abrirObs(o = {}, { minimizado = true, lanzar = spawn } = {}) {
  const exe = rutaObs(o);
  if (!exe) throw new Error('no encuentro OBS (obs64.exe) en Archivos de programa; pon su ruta en opciones.json → obs.ruta');
  const args = ['--collection', 'Realizador', '--profile', 'Realizador', '--startreplaybuffer', ...(minimizado ? ['--minimize-to-tray'] : [])];
  // OBS tiene que arrancar desde su carpeta (si no, no encuentra sus idiomas y complementos)
  const p = lanzar(exe, args, { cwd: dirname(exe), detached: true, stdio: 'ignore' });
  p.unref?.();
  return exe;
}
