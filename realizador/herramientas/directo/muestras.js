// Muestras de las pantallas de directo en docs/muestras/directo/, con Chrome sin ventana a 1920×1080 y las animaciones
// congeladas en un instante fijo (document.getAnimations(): pausa y currentTime), para que salgan siempre iguales:
//   espera.png (con cuenta), espera-sin-cuenta.png, espera-cero.png, cabecera.png (el final quieto), cabecera-tira.png
//   (seis momentos), pausa.png, cierre.png, postpartida.png y cabecera.mp4 (12 s a 30 fps con obs/musica/intro.opus)
//
//   node herramientas/directo/muestras.js [--ffmpeg ruta] [--chrome ruta]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { abrirChrome } from './chrome.js';
import { rutaFfmpeg } from '../barrida/generar.js';

const RAIZ = join(import.meta.dirname, '..', '..');
const OBS = join(RAIZ, 'obs');
const DESTINO = join(RAIZ, 'docs', 'muestras', 'directo');
const CABECERA = { duracion: 12, fps: 30, jornada: 'Jornada 3' };
const TIRA = [0.5, 1.4, 2.3, 3.2, 4.6, 9];

const url = (pagina, q = {}) => `${pathToFileURL(join(OBS, pagina)).href}${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`;
// Congela todas las animaciones en t segundos desde que empezaron y espera a que se pinte
const congelar = t => `(async () => {
  await document.fonts.ready;
  if (document.querySelector('script')?.textContent.includes("classList.add('listo')"))
    while (!document.body.classList.contains('listo')) await new Promise(r => setTimeout(r, 20));
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${t * 1000}; }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return document.getAnimations().length;
})()`;

async function foto(pagina, direccion, t, salida) {
  await pagina.ir(direccion);
  await pagina.evaluar(congelar(t));
  writeFileSync(salida, await pagina.foto('png'));
  console.log(`  ${salida}`);
}

const { values } = parseArgs({ options: { ffmpeg: { type: 'string' }, chrome: { type: 'string' } } });
const ffmpeg = rutaFfmpeg(values.ffmpeg);
mkdirSync(DESTINO, { recursive: true });
const chrome = await abrirChrome(values.chrome ? { ruta: values.chrome } : {});
const tmp = mkdtempSync(join(tmpdir(), 'directo-muestras-'));
try {
  const p = await chrome.nuevaPagina(1920, 1080);
  const sinEstado = { estado: 'no' };   // en las muestras no se pregunta al relé
  await foto(p, url('espera.html', { ...sinEstado, hasta: String(Date.now() + 4 * 60e3 + 32.4e3), jornada: CABECERA.jornada }), 2.6, join(DESTINO, 'espera.png'));
  await foto(p, url('espera.html', { ...sinEstado, jornada: CABECERA.jornada }), 2.6, join(DESTINO, 'espera-sin-cuenta.png'));
  await foto(p, url('espera.html', { ...sinEstado, hasta: String(Date.now() - 1000), jornada: CABECERA.jornada }), 2.6, join(DESTINO, 'espera-cero.png'));
  await foto(p, url('pausa.html'), 2.6, join(DESTINO, 'pausa.png'));
  await foto(p, url('cierre.html'), 2.6, join(DESTINO, 'cierre.png'));
  await foto(p, url('postpartida.html'), 4, join(DESTINO, 'postpartida.png'));
  await foto(p, url('cabecera.html', { jornada: CABECERA.jornada }), 11.5, join(DESTINO, 'cabecera.png'));

  // Tira de la cabecera: seis momentos en 3×2
  const tira = TIRA.map((t, i) => join(tmp, `tira-${i}.png`));
  for (const [i, t] of TIRA.entries()) {
    await p.evaluar(congelar(t));
    writeFileSync(tira[i], await p.foto('png'));
  }
  const fuente = 'C\\:/Windows/Fonts/arialbd.ttf';
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...tira.flatMap(f => ['-i', f]), '-filter_complex',
    TIRA.map((t, i) => `[${i}:v]scale=640:360:flags=lanczos,drawtext=fontfile='${fuente}':text='t = ${String(t).replace('.', ',')} s':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=10:y=10,pad=648:368:4:4:color=0x2A2B38[t${i}]`).join(';')
      + `;${TIRA.map((_, i) => `[t${i}]`).join('')}xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[out]`,
    '-map', '[out]', '-frames:v', '1', join(DESTINO, 'cabecera-tira.png')], { stdio: 'inherit' });
  console.log(`  ${join(DESTINO, 'cabecera-tira.png')}`);

  // Vídeo de la cabecera: fotograma a fotograma por la entrada de ffmpeg, con la música de intro (los mismos 12 s,
  // con un fundido de 1 s al final, como cuando el relé cambia de escena)
  const mp4 = join(DESTINO, 'cabecera.mp4');
  const { duracion: D, fps } = CABECERA;
  const ff = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', join(OBS, 'musica', 'intro.opus'),
    '-filter_complex', `[1:a]atrim=0:${D},afade=t=out:st=${D - 1}:d=1[a]`, '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '160k', '-t', String(D), '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const fin = new Promise((ok, mal) => ff.on('close', c => (c === 0 ? ok() : mal(new Error(`ffmpeg acabó con código ${c}`)))));
  for (let n = 0; n < D * fps; n++) {
    await p.evaluar(congelar(n / fps));
    if (!ff.stdin.write(await p.foto('jpeg', 95))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await fin;
  console.log(`  ${mp4}`);
} finally {
  await chrome.cerrar();
  rmSync(tmp, { recursive: true, force: true });
}
