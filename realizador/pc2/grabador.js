// Grabador del LoL del PC 2 (10/11, «¿no podemos grabar solo el LoL y luego subir el clip?»).
// El búfer de OBS graba la emisión tal cual sale, con el marcador de Gokudō dentro, así que sus clips no sirven
// para la repetición. Esto graba aparte, con ffmpeg, solo la pantalla donde está el LoL de la antena:
//  - Sin parar, en trozos de 2 s (mpegts) en una carpeta temporal; se borran los de más de «guardarSegundos».
//  - Para una jugada se juntan los trozos del último rato en un mp4 sin volver a codificar (casi no tarda) y
//    OBS lo repite con el cartel REPLAY. Como se sabe a qué hora empezó cada trozo, la repetición arranca justo
//    en el segundo que toca (sin el cambio de cámara). Los clips se quedan en partidas/clips-lol para el resumen.
//  - Codificador: se prueban en orden (la gráfica directa, la gráfica pasando por el procesador, y x264) y se
//    queda el primero que escribe un trozo. Si ffmpeg se cae, se vuelve a arrancar pasado un rato.
// La hora de cada trozo es la de creación del archivo; los nombres llevan la vuelta (r<id>-) para que nunca se
// reutilicen (Windows guarda la hora de creación de un nombre borrado unos segundos).
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const POR_DEFECTO = {
  activo: true,
  monitor: 0,             // pantalla donde está el LoL (0 = la principal)
  fps: 60,
  bitrate: 15000,         // kbps
  trozoSegundos: 2,
  guardarSegundos: 120,   // cuánto se guarda hacia atrás
  clipSegundos: 60,       // cuánto entra en cada clip (el final de la jugada y lo de antes)
  codificadores: ['h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264'],
  arranqueSegundos: 8,    // lo que se espera al primer trozo antes de probar el siguiente codificador
  reintentoSegundos: 15,
};

// Las formas de grabar, en orden de preferencia, para los codificadores pedidos
export function candidatos(c = POR_DEFECTO) {
  const fps = c.fps || 60;
  const entrada = ['-f', 'lavfi', '-i', `ddagrab=output_idx=${c.monitor || 0}:framerate=${fps}:draw_mouse=0`];
  const tasa = ['-b:v', `${c.bitrate}k`, '-maxrate', `${c.bitrate}k`, '-bufsize', `${c.bitrate * 2}k`, '-g', String(fps)];
  const lista = [];
  const pide = n => (c.codificadores || POR_DEFECTO.codificadores).includes(n);
  // 1. La imagen se queda en la gráfica: lo más ligero (AMD y NVIDIA aceptan las imágenes de D3D11)
  for (const n of ['h264_amf', 'h264_nvenc']) if (pide(n)) lista.push({ nombre: `${n} (gráfica)`, args: [...entrada, '-c:v', n, ...tasa] });
  // 2. Bajando la imagen al procesador y convirtiéndola: funciona con más drivers
  for (const n of ['h264_amf', 'h264_nvenc', 'h264_qsv']) {
    if (pide(n)) lista.push({ nombre: `${n} (procesador)`, args: [...entrada, '-vf', 'hwdownload,format=bgra,format=nv12', '-c:v', n, ...tasa] });
  }
  // 3. Sin gráfica: x264 lo más rápido posible, a 30 imágenes por segundo para no cargar el procesador
  if (pide('libx264')) {
    const e30 = ['-f', 'lavfi', '-i', `ddagrab=output_idx=${c.monitor || 0}:framerate=30:draw_mouse=0`];
    lista.push({ nombre: 'libx264 (procesador)', args: [...e30, '-vf', 'hwdownload,format=bgra,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-b:v', `${c.bitrate}k`, '-g', '30'] });
  }
  return lista;
}

export function argumentosSalida(c, prefijo) {
  return ['-an', '-f', 'segment', '-segment_time', String(c.trozoSegundos || 2), '-segment_format', 'mpegts', '-reset_timestamps', '1', `${prefijo}%06d.ts`];
}

// Trozos que hacen falta para cubrir [desdeMs, hastaMs] (hora del reloj). trozos: [{ archivo, inicioMs }] por orden.
// Cada trozo dura hasta que empieza el siguiente; el último (aún escribiéndose) llega hasta ahora.
export function elegirTrozos(trozos, desdeMs, hastaMs) {
  const elegidos = [];
  for (let i = 0; i < trozos.length; i++) {
    const fin = i + 1 < trozos.length ? trozos[i + 1].inicioMs : Infinity;
    if (fin > desdeMs && trozos[i].inicioMs < hastaMs) elegidos.push(trozos[i]);
  }
  return elegidos;
}

// Dónde poner OBS dentro del clip para que la repetición empiece en el segundo que toca.
// guardadoMs: hora en que se guardó; atras: segundos antes de ese momento en que empieza la repetición.
export function cursorEnClip(clip, atras) {
  return Math.max(0, Math.round(clip.guardadoMs - atras * 1000 - clip.inicioMs));
}

export class GrabadorLol extends EventEmitter {
  constructor({ ffmpeg = 'ffmpeg', opciones = {}, carpeta = join(tmpdir(), 'realizador-lol'), registrar = () => {} } = {}) {
    super();
    this.c = { ...POR_DEFECTO, ...opciones };
    this.ffmpeg = ffmpeg;
    this.carpeta = carpeta;
    this.registrar = registrar;
    this.proceso = null;
    this.activo = false;      // escribiendo trozos
    this.forma = null;        // la forma de grabar que funciona
    this.parado = true;
  }

  arrancar() {
    if (!this.parado) return;
    this.parado = false;
    try { rmSync(this.carpeta, { recursive: true, force: true }); } catch { /* lo que no se pueda borrar se queda */ }
    mkdirSync(this.carpeta, { recursive: true });
    this.limpieza = setInterval(() => this.limpiar(), 5000);
    this.limpieza.unref?.();
    this.probar(0);
  }

  parar() {
    this.parado = true;
    clearInterval(this.limpieza);
    clearTimeout(this.reintento);
    clearTimeout(this.espera);
    this.activo = false;
    try { this.proceso?.kill(); } catch { /* ya cerrado */ }
    this.proceso = null;
  }

  // Prueba las formas de grabar desde la i: la primera que escribe un trozo se queda
  probar(i) {
    if (this.parado) return;
    const formas = this.forma ? [this.forma, ...candidatos(this.c).filter(f => f.nombre !== this.forma.nombre)] : candidatos(this.c);
    if (i >= formas.length) {
      this.registrar('[grabador] ffmpeg no consigue grabar el LoL con ningún codificador: las repeticiones usarán el búfer de OBS');
      this.emit('cambio');
      this.reintento = setTimeout(() => this.probar(0), this.c.reintentoSegundos * 1000 * 4);
      this.reintento.unref?.();
      return;
    }
    const forma = formas[i];
    const prefijo = `r${Date.now().toString(36)}-`;
    let p;
    try {
      p = spawn(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...forma.args, ...argumentosSalida(this.c, prefijo)], { cwd: this.carpeta, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      this.registrar(`[grabador] no se puede abrir ffmpeg (${this.ffmpeg}): ${e.message}`);
      return;
    }
    this.proceso = p;
    let error = '';
    p.stderr.on('data', d => { error = (error + d).slice(-400); });
    p.on('error', e => { error = e.message; });
    const vigilar = () => {
      if (this.proceso !== p || this.parado) return;
      if (this.trozos().some(t => t.archivo.startsWith(prefijo))) {
        this.forma = forma;
        this.activo = true;
        this.registrar(`[grabador] grabando el LoL con ${forma.nombre}`);
        this.emit('cambio');
        return;
      }
      if (Date.now() - inicio > this.c.arranqueSegundos * 1000) { try { p.kill(); } catch { /* ya cerrado */ } return; }
      this.espera = setTimeout(vigilar, 250);
    };
    const inicio = Date.now();
    this.espera = setTimeout(vigilar, 250);
    p.on('exit', () => {
      if (this.proceso !== p) return;
      this.proceso = null;
      clearTimeout(this.espera);
      const estaba = this.activo;
      this.activo = false;
      if (this.parado) return;
      if (estaba) {
        // Se cayó grabando: se vuelve a arrancar con la misma forma pasado un rato
        this.registrar(`[grabador] ffmpeg se ha parado${error ? `: ${error.trim().split('\n').at(-1)}` : ''}; se vuelve a arrancar en ${this.c.reintentoSegundos} s`);
        this.emit('cambio');
        this.reintento = setTimeout(() => this.probar(0), this.c.reintentoSegundos * 1000);
        this.reintento.unref?.();
      } else {
        this.registrar(`[grabador] ${forma.nombre} no funciona aquí${error ? `: ${error.trim().split('\n').at(-1)}` : ''}`);
        this.probar(i + 1);
      }
    });
  }

  trozos() {
    let nombres = [];
    try { nombres = readdirSync(this.carpeta).filter(n => n.endsWith('.ts')); } catch { return []; }
    const lista = [];
    for (const archivo of nombres) {
      try { lista.push({ archivo, inicioMs: statSync(join(this.carpeta, archivo)).birthtimeMs }); } catch { /* recién borrado */ }
    }
    return lista.sort((a, b) => a.inicioMs - b.inicioMs || a.archivo.localeCompare(b.archivo));
  }

  limpiar(ahora = Date.now()) {
    const trozos = this.trozos();
    // Nunca se borra el último (el que se está escribiendo)
    for (const t of trozos.slice(0, -1)) {
      if (t.inicioMs < ahora - this.c.guardarSegundos * 1000) { try { unlinkSync(join(this.carpeta, t.archivo)); } catch { /* en uso */ } }
    }
  }

  // Junta en destino (mp4) lo grabado en los últimos «segundos». Devuelve { ruta, inicioMs, guardadoMs }.
  async clip(destino, { segundos = this.c.clipSegundos, ahora = Date.now() } = {}) {
    const elegidos = elegirTrozos(this.trozos(), ahora - segundos * 1000, ahora);
    if (!elegidos.length) throw new Error('no hay nada grabado del LoL');
    mkdirSync(join(destino, '..'), { recursive: true });
    await new Promise((resolver, fallar) => {
      const p = spawn(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', `concat:${elegidos.map(t => t.archivo).join('|')}`,
        '-c', 'copy', '-movflags', '+faststart', destino], { cwd: this.carpeta, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      p.stderr.on('data', d => { error = (error + d).slice(-300); });
      p.on('error', fallar);
      p.on('exit', codigo => (existsSync(destino) ? resolver() : fallar(new Error(`ffmpeg no ha hecho el clip (${codigo})${error ? `: ${error.trim()}` : ''}`))));
    });
    return { ruta: destino, inicioMs: elegidos[0].inicioMs, guardadoMs: ahora };
  }
}
