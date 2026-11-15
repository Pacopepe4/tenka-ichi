// Rehace los fondos (obs/fondos/) y la música (obs/musica/) de las escenas de directo nuevas (espera, cabecera,
// pausa, postpartida y cierre) a partir de los originales de Gokudō. Procedencia en herramientas/directo/LEEME.md.
//
//   node herramientas/directo/preparar.js                 fondos y música
//   node herramientas/directo/preparar.js --solo fondos   (o --solo musica)
//   node herramientas/directo/preparar.js --ffmpeg C:\...\ffmpeg.exe --chrome C:\...\chrome.exe
//   --kit, --logo y --musica cambian las carpetas de origen (por defecto, las de E:\ Escritorio\Claude\gokudo)
//
// ffmpeg: --ffmpeg, la variable FFMPEG, herramientas/ffmpeg/ffmpeg.exe o el del PATH (hace falta libopus).
// Chrome: --chrome, la variable CHROME o el de Program Files (solo para el fondo de la espera).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { rutaFfmpeg } from '../barrida/generar.js';

const RAIZ = join(import.meta.dirname, '..', '..');
const GOKUDO = 'E:\\ Escritorio\\Claude\\gokudo';
export const ORIGEN = {
  kit: join(GOKUDO, 'diseno', 'redes', 'kit'),          // kit de redes: generar.js, piezas.json y salida/twitch/*.png
  logo: join(GOKUDO, 'diseno', 'logo-tenka'),           // logo actual (sol cortado)
  musica: join(GOKUDO, 'teaser', 'musica'),             // temas de Flow Music (Pacopepe)
};

// Música: tema de origen (versión A) → archivo de obs/musica. OBS los pone en bucle
export const MUSICA = [
  ['espera.opus', '03-espera-a.wav'],
  ['intro.opus', '02-intro-directo-a.wav'],
  ['pausa.opus', '04-pausa-brb-a.wav'],
  ['victoria.opus', '10-victoria-a.wav'],
  ['despedida.opus', '05-despedida-a.wav'],
];
export const SONORIDAD = { I: -18, TP: -1.5, LRA: 20 };   // LUFS integrados y pico real; LRA ancho para que vaya en lineal
export const FUNDIDO = { entra: 0.5, sale: 1.5 };         // s: el bucle no salta
export const OPUS_KBPS = 104;
const JPG_MAX = 420 * 1024;

const correr = (ffmpeg, args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

// JPG 4:4:4 (el rojo no se emborrona) con la mejor calidad que quepa en ~400 KB
function aJpg(ffmpeg, entrada, salida, filtro) {
  for (let q = 1; q <= 6; q++) {
    correr(ffmpeg, ['-i', entrada, ...(filtro ? ['-vf', filtro] : []), '-frames:v', '1', '-pix_fmt', 'yuvj444p', '-qmin', '1', '-q:v', String(q), salida]);
    if (statSync(salida).size <= JPG_MAX) break;
  }
  return salida;
}

// Fondo de la espera: la pieza «empezamos» del kit sin el subtítulo («LA FAMILIA SE ESTÁ REUNIENDO»), que ocupa el
// sitio de la cuenta atrás; espera.html lo pinta él cuando no hay cuenta. Se usa el generador del propio kit
// (generar.js, layout pantalla) en una carpeta temporal, con un sustituto de playwright que tira de chrome.js.
async function empezamosSinSubtitulo(kit, chrome) {
  const tmp = mkdtempSync(join(tmpdir(), 'directo-kit-'));
  try {
    copyFileSync(join(kit, 'generar.js'), join(tmp, 'generar.js'));
    for (const d of ['assets', 'fondos']) symlinkSync(join(kit, d), join(tmp, d), 'junction');
    const cfg = JSON.parse(readFileSync(join(kit, 'piezas.json'), 'utf8'));
    const pieza = cfg.piezas.find(p => p.red === 'twitch' && p.id === 'empezamos');
    if (!pieza) throw new Error('El kit no tiene la pieza twitch/empezamos');
    writeFileSync(join(tmp, 'piezas.json'), JSON.stringify({ comun: cfg.comun, piezas: [{ ...pieza, id: 'empezamos-cuenta', subtitulo: '' }] }));
    mkdirSync(join(tmp, 'node_modules', 'playwright'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules', 'playwright', 'index.js'), `// Sustituto mínimo de playwright para generar.js del kit
const { abrirChrome } = require(${JSON.stringify(join(import.meta.dirname, 'chrome.js'))});
exports.chromium = { async launch() {
  const c = await abrirChrome({ ruta: process.env.CHROME || undefined });
  return { async newPage({ viewport }) {
    const p = await c.nuevaPagina(viewport.width, viewport.height);
    return { goto: u => p.ir(u), evaluate: f => p.evaluar('(' + f + ')()'), waitForTimeout: ms => new Promise(r => setTimeout(r, ms)),
      screenshot: async ({ path }) => require('fs').writeFileSync(path, await p.foto('png')), close: () => p.cerrar() };
  }, close: () => c.cerrar() };
} };
`);
    const r = spawnSync(process.execPath, ['generar.js', 'empezamos-cuenta'], { cwd: tmp, stdio: 'inherit', env: { ...process.env, ...(chrome ? { CHROME: chrome } : {}) } });
    if (r.status !== 0) throw new Error('El generador del kit ha fallado');
    const png = join(tmpdir(), `empezamos-cuenta-${process.pid}.png`);
    copyFileSync(join(tmp, 'salida', 'twitch', 'empezamos-cuenta.png'), png);
    return png;
  } finally {
    rmSync(tmp, { recursive: true, force: true });   // las junction se quitan sin tocar el kit
  }
}

export async function fondos({ ffmpeg, chrome, kit = ORIGEN.kit, logo = ORIGEN.logo, carpeta = join(RAIZ, 'obs', 'fondos') } = {}) {
  mkdirSync(carpeta, { recursive: true });
  const twitch = join(kit, 'salida', 'twitch');
  const hechos = [];
  const png = await empezamosSinSubtitulo(kit, chrome);
  hechos.push(aJpg(ffmpeg, png, join(carpeta, 'empezamos.jpg')));
  rmSync(png, { force: true });
  hechos.push(aJpg(ffmpeg, join(twitch, 'pausa.png'), join(carpeta, 'pausa.jpg')));
  hechos.push(aJpg(ffmpeg, join(twitch, 'fin.png'), join(carpeta, 'fin.jpg')));
  // Noche para la cabecera y la postpartida: el callejón del kit, desenfocado y oscuro (como el layout pantalla)
  hechos.push(aJpg(ffmpeg, join(kit, 'fondos', 'fondo-callejon-16x9.jpg'), join(carpeta, 'noche.jpg'),
    'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,gblur=sigma=2.5,colorchannelmixer=rr=.5:gg=.5:bb=.52'));
  // El sol cortado con neón, a 720 px con alfa, para la cabecera
  const sol = join(carpeta, 'sol-neon.png');
  correr(ffmpeg, ['-i', join(logo, 'simbolo-neon-transparente-2K.png'), '-vf', 'scale=720:720:flags=lanczos', '-pix_fmt', 'rgba', '-compression_level', '9', sol]);
  hechos.push(sol);
  return hechos;
}

// Dos pasadas de loudnorm (mide y aplica en lineal), fundidos de entrada y salida y Opus a OPUS_KBPS
export function medir(ffmpeg, entrada, filtroPrevio = '') {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', entrada, '-map', '0:a:0', '-af',
    `${filtroPrevio}loudnorm=I=${SONORIDAD.I}:TP=${SONORIDAD.TP}:LRA=${SONORIDAD.LRA}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) throw new Error(`loudnorm no ha medido ${entrada}`);
  return JSON.parse(m[0]);
}

const duracion = (ffmpeg, f) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', f], { encoding: 'utf8' });
  const m = r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

export function musica({ ffmpeg, origen = ORIGEN.musica, carpeta = join(RAIZ, 'obs', 'musica') } = {}) {
  mkdirSync(carpeta, { recursive: true });
  const hechos = [];
  for (const [destino, wav] of MUSICA) {
    const entrada = join(origen, wav), salida = join(carpeta, destino);
    const m = medir(ffmpeg, entrada);
    const d = duracion(ffmpeg, entrada);
    const ln = `loudnorm=I=${SONORIDAD.I}:TP=${SONORIDAD.TP}:LRA=${SONORIDAD.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}`
      + `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    correr(ffmpeg, ['-i', entrada, '-map', '0:a:0', '-map_metadata', '-1', '-af',
      `${ln},aresample=48000,afade=t=in:d=${FUNDIDO.entra},afade=t=out:st=${(d - FUNDIDO.sale).toFixed(3)}:d=${FUNDIDO.sale}`,
      '-c:a', 'libopus', '-b:a', `${OPUS_KBPS}k`, '-vbr', 'on', '-application', 'audio', salida]);
    const r = medir(ffmpeg, salida);
    console.log(`  ${destino} ← ${wav}: ${Number(m.input_i).toFixed(1)} → ${Number(r.input_i).toFixed(1)} LUFS, pico ${Number(r.input_tp).toFixed(1)} dBTP, ${d.toFixed(0)} s`);
    hechos.push(salida);
  }
  return hechos;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    solo: { type: 'string' }, ffmpeg: { type: 'string' }, chrome: { type: 'string' },
    kit: { type: 'string' }, logo: { type: 'string' }, musica: { type: 'string' },
  } });
  const ffmpeg = rutaFfmpeg(values.ffmpeg);
  const kb = f => `${(statSync(f).size / 1024).toFixed(0)} KB`;
  let total = 0;
  if (values.solo !== 'musica') {
    console.log('Fondos:');
    for (const f of await fondos({ ffmpeg, chrome: values.chrome, kit: values.kit || ORIGEN.kit, logo: values.logo || ORIGEN.logo })) console.log(`  ${f}  ${kb(f)}`);
  }
  if (values.solo !== 'fondos') {
    console.log('Música:');
    for (const f of musica({ ffmpeg, origen: values.musica || ORIGEN.musica })) { total += statSync(f).size; console.log(`  ${f}  ${kb(f)}`); }
    console.log(`  Total música: ${(total / 1024 / 1024).toFixed(2)} MB`);
  }
}
