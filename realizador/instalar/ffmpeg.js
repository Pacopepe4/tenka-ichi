// ffmpeg para el grabador del LoL del PC 2 (pc2/grabador.js). Se baja la versión fija «essentials» de gyan.dev
// (publicada en github.com/GyanD/codexffmpeg), se comprueba su SHA-256 y se deja solo ffmpeg.exe en
// herramientas/ffmpeg/ de la carpeta del realizador. Si ya está, no hace nada. Sin administrador.
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RAIZ } from '../comun/opciones.js';

export const FFMPEG = {
  version: '9.0.2',
  url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
  sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
};

export const carpetaFfmpeg = (raiz = RAIZ) => join(raiz, 'herramientas', 'ffmpeg');

// Busca ffmpeg.exe dentro de lo descomprimido (va en <carpeta del zip>/bin/)
export function buscarExe(carpeta) {
  for (const n of readdirSync(carpeta)) {
    const r = join(carpeta, n);
    if (statSync(r).isDirectory()) { const d = buscarExe(r); if (d) return d; }
    else if (n.toLowerCase() === 'ffmpeg.exe') return r;
  }
  return null;
}

export async function instalarFfmpeg({ destino = carpetaFfmpeg(), paquete = FFMPEG, bajar = fetch, descomprimir = null } = {}) {
  const exe = join(destino, 'ffmpeg.exe');
  if (existsSync(exe)) return { hecho: true, ya: true, exe };
  const r = await bajar(paquete.url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`no se pudo bajar ffmpeg (HTTP ${r.status})`);
  const datos = Buffer.from(await r.arrayBuffer());
  const suma = createHash('sha256').update(datos).digest('hex');
  if (suma !== paquete.sha256) throw new Error('el ffmpeg bajado no coincide con su huella oficial: no se instala');
  const tmp = join(tmpdir(), `realizador-ffmpeg-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, 'ffmpeg.zip');
  writeFileSync(zip, datos);
  try {
    const x = join(tmp, 'x');
    if (descomprimir) descomprimir(zip, x);
    else execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${x.replace(/'/g, "''")}' -Force`], { stdio: 'ignore', timeout: 300000 });
    const encontrado = buscarExe(x);
    if (!encontrado) throw new Error('el zip de ffmpeg no trae ffmpeg.exe');
    mkdirSync(destino, { recursive: true });
    copyFileSync(encontrado, exe);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { hecho: true, ya: false, exe };
}

// node instalar/ffmpeg.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  instalarFfmpeg()
    .then(r => console.log(r.ya ? `ffmpeg ya estaba (${r.exe})` : `ffmpeg ${FFMPEG.version} instalado en ${r.exe}`))
    .catch(e => { console.error(`ffmpeg: ${e.message}`); process.exitCode = 1; });
}
