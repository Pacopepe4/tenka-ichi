// Genera los stingers de la repetición con herramientas/barrida/barrida.js:
//   obs/repeticion-entrada.webm y obs/repeticion-salida.webm (VP9 con alfa, 1920×1080 a 60 fps)
//
//   node herramientas/barrida/generar.js                     los dos, en obs/
//   node herramientas/barrida/generar.js --carpeta D:\prueba  en otra carpeta
//   node herramientas/barrida/generar.js --ffmpeg C:\...\ffmpeg.exe
//
// ffmpeg: --ffmpeg, la variable FFMPEG, herramientas/ffmpeg/ffmpeg.exe (npm run instalar-pc2 lo deja ahí) o el del PATH.
// Hace falta un ffmpeg con libvpx-vp9 (el «essentials» de gyan.dev lo trae).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ANCHO, ALTO, FPS, FOTOGRAMAS, fotograma, cargarEmblema, centroEmblema, tapado } from './barrida.js';

const RAIZ = join(import.meta.dirname, '..', '..');

export function rutaFfmpeg(dada = process.env.FFMPEG) {
  if (dada) return dada;
  const local = join(RAIZ, 'herramientas', 'ffmpeg', 'ffmpeg.exe');
  return existsSync(local) ? local : 'ffmpeg';
}

// Fotogramas en bruto por la entrada estándar de ffmpeg → VP9 con alfa. Sin alt-ref (si no, el alfa se pierde) y en
// cuatro columnas de teselas para que OBS lo descodifique en varios hilos
export async function generar(tipo, salida, ffmpeg = rutaFfmpeg()) {
  const img = cargarEmblema(), centro = centroEmblema(img);
  const p = spawn(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${ANCHO}x${ALTO}`, '-r', String(FPS), '-i', '-',
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '28',
    '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-tile-columns', '2', '-g', String(FOTOGRAMAS),
    '-metadata:s:v:0', 'alpha_mode=1', '-an', salida,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const fin = new Promise((ok, mal) => {
    p.on('error', mal);
    p.on('close', c => (c === 0 ? ok() : mal(new Error(`ffmpeg acabó con código ${c}`))));
  });
  for (let n = 0; n < FOTOGRAMAS; n++) {
    if (!p.stdin.write(fotograma(n, tipo, img, centro))) await new Promise(r => p.stdin.once('drain', r));
  }
  p.stdin.end();
  await fin;
  return salida;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { carpeta: { type: 'string' }, ffmpeg: { type: 'string' } } });
  const carpeta = values.carpeta || join(RAIZ, 'obs');
  mkdirSync(carpeta, { recursive: true });
  const t = tapado();
  console.log(`Tapa del todo de ${t.desde.toFixed(3)} s a ${t.hasta.toFixed(3)} s (${FOTOGRAMAS} fotogramas a ${FPS} fps)`);
  for (const tipo of ['entrada', 'salida']) {
    const r = await generar(tipo, join(carpeta, `repeticion-${tipo}.webm`), rutaFfmpeg(values.ffmpeg));
    console.log(`Hecho: ${r}`);
  }
}
