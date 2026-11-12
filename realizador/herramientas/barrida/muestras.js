// Hoja de muestras de la barrida, en docs/muestras/barrida/:
//   tira.png       fotogramas en t = 0,10 … 1,10 s sobre un juego de prueba (antes, si se da --antes, y ahora)
//   barrida.mp4    entrada y salida sobre el juego de prueba (720p), a velocidad real y luego a cámara lenta (×0,25)
// Como en OBS, la escena cambia en el transition_point (0,40 s): de JUEGO a REPETICIÓN y al revés.
//
//   node herramientas/barrida/muestras.js [--antes carpeta-con-los-webm-viejos] [--nuevo carpeta] [--ffmpeg ruta]
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { rutaFfmpeg } from './generar.js';

const RAIZ = join(import.meta.dirname, '..', '..');
const CAMBIO = 0.4;                                     // transition_point de instalar/configurar-obs.js
const TIEMPOS = [0.10, 0.25, 0.38, 0.40, 0.45, 0.60, 0.85, 1.10];
const FUENTE = 'C\\:/Windows/Fonts/arialbd.ttf';

// Juego de prueba con textura y movimiento: degradado que se mueve, grano, rejilla y el nombre de la escena
const escenaPrueba = (nombre, c0, c1, d) => `gradients=s=1920x1080:r=60:d=${d}:c0=${c0}:c1=${c1}:c2=0x202020:nb_colors=3:speed=0.03:type=radial,`
  + `noise=alls=8,drawgrid=w=160:h=160:t=2:c=white@0.10,`
  + `drawbox=x=120+700*sin(t*2):y=700:w=220:h=120:c=0xF2D16B@0.9:t=fill,`
  + `drawtext=fontfile='${FUENTE}':text='${nombre}':fontsize=150:fontcolor=white@0.85:x=(w-tw)/2:y=(h-th)/2-220,format=yuv420p`;

// Filtros de un stinger sobre el juego: escena A hasta el cambio, B después, y el stinger encima (empieza en `inicio`)
function compuesto(entrada, a, b, inicio, etiqueta) {
  return `[${entrada}:v]setpts=PTS-STARTPTS+${inicio}/TB,format=yuva420p[s${etiqueta}];`
    + `${a}[b${etiqueta}a];${b}[b${etiqueta}b];`
    + `[b${etiqueta}a][b${etiqueta}b]overlay=enable='gte(t,${inicio + CAMBIO})'[f${etiqueta}];`
    + `[f${etiqueta}][s${etiqueta}]overlay=eof_action=pass:format=auto[c${etiqueta}]`;
}

function tira(ffmpeg, filas, salida) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  const partes = [];
  filas.forEach(([webm, , tipo], i) => {
    args.push('-c:v', 'libvpx-vp9', '-i', webm);
    const [A, B] = tipo === 'entrada' ? ['JUEGO', 'REPETICION'] : ['REPETICION', 'JUEGO'];
    const juego = n => escenaPrueba(n, n === 'JUEGO' ? '0x1E6B3A' : '0x23407A', n === 'JUEGO' ? '0x6B8F2A' : '0x7A2350', 1.3);
    partes.push(compuesto(i, juego(A), juego(B), 0, i));
    const sel = TIEMPOS.map(t => `eq(n\\,${Math.round(t * 60)})`).join('+');
    partes.push(`[c${i}]select='${sel}',scale=480:270:flags=lanczos,`
      + `drawtext=fontfile='${FUENTE}':text='t = %{eif\\:floor(t)\\:d},%{eif\\:mod(round(t*100)\\,100)\\:d\\:2} s':fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=10:y=10,`
      + `pad=iw+8:ih+8:4:4:color=0x333333,tile=${TIEMPOS.length}x1,pad=iw+260:ih:260:0:color=0x15151C,`
      + `drawtext=fontfile='${FUENTE}':text='${filas[i][1]}':fontsize=26:fontcolor=white:x=20:y=(h-th)/2[t${i}]`);
  });
  partes.push(`${filas.map((_, i) => `[t${i}]`).join('')}vstack=inputs=${filas.length}[out]`);
  execFileSync(ffmpeg, [...args, '-filter_complex', partes.join(';'), '-map', '[out]', '-frames:v', '1', salida], { stdio: 'inherit' });
}

// Vídeo: 0,8 s de JUEGO, entrada (cambio a REPETICION a los 0,4 s), 1,8 s de repetición, salida y 0,8 s de JUEGO.
// Luego lo mismo a ×0,25, solo los dos stingers
function video(ffmpeg, entrada, salida, mp4) {
  const t1 = 0.8, t2 = 3.0, total = 4.3;
  const juego = escenaPrueba('JUEGO', '0x1E6B3A', '0x6B8F2A', total);
  const repe = escenaPrueba('REPETICION', '0x23407A', '0x7A2350', total);
  const f = [
    `[0:v]setpts=PTS-STARTPTS+${t1}/TB,format=yuva420p[se]`,
    `[1:v]setpts=PTS-STARTPTS+${t2}/TB,format=yuva420p[ss]`,
    `${juego}[ja]`, `${repe}[rb]`,
    `[ja][rb]overlay=enable='between(t,${t1 + CAMBIO},${t2 + CAMBIO})'[base]`,
    `[base][se]overlay=eof_action=pass[x1]`,
    `[x1][ss]overlay=eof_action=pass,format=yuv420p,split=3[v1][v2][v3]`,
    `[v1]drawtext=fontfile='${FUENTE}':text='x1':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=w-tw-30:y=30[real]`,
    `[v2]trim=${t1 - 0.15}:${t1 + 1.1},setpts=4*(PTS-STARTPTS),fps=60,drawtext=fontfile='${FUENTE}':text='x0,25 entrada':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=w-tw-30:y=30[le]`,
    `[v3]trim=${t2 - 0.15}:${t2 + 1.1},setpts=4*(PTS-STARTPTS),fps=60,drawtext=fontfile='${FUENTE}':text='x0,25 salida':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=w-tw-30:y=30[ls]`,
    `[real][le][ls]concat=n=3:v=1:a=0,scale=1280:720:flags=lanczos[out]`,  // a 720p, para que pese poco
  ];
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', entrada, '-c:v', 'libvpx-vp9', '-i', salida,
    '-filter_complex', f.join(';'), '-map', '[out]', '-t', '20', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });
}

const { values } = parseArgs({ options: { antes: { type: 'string' }, nuevo: { type: 'string' }, ffmpeg: { type: 'string' } } });
const ffmpeg = rutaFfmpeg(values.ffmpeg), nuevo = values.nuevo || join(RAIZ, 'obs');
const destino = join(RAIZ, 'docs', 'muestras', 'barrida');
mkdirSync(destino, { recursive: true });
const filas = [];
for (const tipo of ['entrada', 'salida']) {
  if (values.antes) filas.push([join(values.antes, `repeticion-${tipo}.webm`), `ANTES - ${tipo}`, tipo]);
  filas.push([join(nuevo, `repeticion-${tipo}.webm`), `AHORA - ${tipo}`, tipo]);
}
tira(ffmpeg, filas, join(destino, 'tira.png'));
video(ffmpeg, join(nuevo, 'repeticion-entrada.webm'), join(nuevo, 'repeticion-salida.webm'), join(destino, 'barrida.mp4'));
console.log(`Hecho: ${destino}`);
