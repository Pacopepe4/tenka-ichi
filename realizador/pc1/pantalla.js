// Lector de pantalla (PC 1, 14/11): mira la ventana del LoL (sin tenerla delante) para sacar lo que la Live Client no da
// a los espectadores desde que Riot quitó LiveEvents (parche 14.1):
//  - los contadores del marcador de arriba (dragones, heraldo, larvas y torres de cada equipo): cuando uno cambia,
//    es que ese equipo acaba de cogerlo;
//  - los hechizos de invocador (D y F) y la definitiva (R) de los marcos de los lados: si están en enfriamiento salen
//    oscurecidos, con la aguja del reloj.
// Captura con ffmpeg (gfxcapture: la captura de ventanas de Windows 10, la misma que usa OBS), 2 fotos por segundo,
// escalada a 768 de alto: con la interfaz del LoL a escala 0 los marcos y el marcador caen siempre en el mismo sitio
// (medido a 1024×768: los de la izquierda contra el borde izquierdo, los de la derecha contra el derecho y el marcador
// contra el centro). La ventana puede estar detrás de otras, pero no minimizada.
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

export const ALTO = 768;

// Marcador de arriba: dónde va el número de cada contador (x desde el centro de la ventana) — el orden del LoL es
// dragón, heraldo, larvas, torres para el azul y al revés para el rojo
export const CONTADORES = [
  { equipo: 'azul', tipo: 'dragon', x: -314, ancho: 16 },
  { equipo: 'azul', tipo: 'heraldo', x: -261, ancho: 16 },
  { equipo: 'azul', tipo: 'larvas', x: -212, ancho: 16 },
  { equipo: 'azul', tipo: 'torres', x: -155, ancho: 18 },
  { equipo: 'rojo', tipo: 'torres', x: 159, ancho: 18 },
  { equipo: 'rojo', tipo: 'larvas', x: 207, ancho: 16 },
  { equipo: 'rojo', tipo: 'heraldo', x: 262, ancho: 16 },
  { equipo: 'rojo', tipo: 'dragon', x: 317, ancho: 16 },
];
const MARCADOR_Y = [6, 25]; // debajo, las recompensas (grises y doradas); con ellas el número sube un poco

// Marcos de los lados: 5 por equipo, de arriba abajo en el orden de la Live Client (top, jungla, mid, bot, apoyo)
export const MARCOS = {
  primero: 113,          // y de arriba del primer hechizo del primer marco
  paso: 73.25,           // de un marco al siguiente
  d: { x: 6, y: 0, ancho: 10, alto: 9 },     // hechizo D (x desde el borde de su lado)
  f: { x: 6, y: 17, ancho: 10, alto: 9 },    // hechizo F
  r: { x: 46, y: -2, ancho: 8, alto: 8 },    // círculo de la definitiva, arriba a la derecha del retrato
};

// Píxeles en RGB (3 bytes) de una imagen de ancho × alto
function caja(px, ancho, alto, x0, y0, w, h) {
  const xs = Math.max(0, Math.round(x0)), ys = Math.max(0, Math.round(y0));
  const xe = Math.min(ancho, Math.round(x0 + w)), ye = Math.min(alto, Math.round(y0 + h));
  return { xs, ys, xe, ye };
}

// Brillo medio y cuántos píxeles casi blancos (la aguja del reloj del enfriamiento)
export function brillo(px, ancho, alto, x0, y0, w, h) {
  const { xs, ys, xe, ye } = caja(px, ancho, alto, x0, y0, w, h);
  let suma = 0, blancos = 0, n = 0;
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      const i = (y * ancho + x) * 3;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      suma += (r + g + b) / 3;
      if (Math.min(r, g, b) > 200) blancos++;
      n++;
    }
  }
  return n ? { medio: suma / n, blancos: blancos / n } : { medio: 0, blancos: 0 };
}

// Huella del número de un contador: los píxeles de color fuerte (el número sale en azul o rojo; los iconos y las
// recompensas de debajo son grises o dorados), recortados a lo que ocupan, tal cual (ancho×alto:bits)
export function huellaNumero(px, ancho, alto, x0, y0, w, h) {
  const { xs, ys, xe, ye } = caja(px, ancho, alto, x0, y0, w, h);
  const color = (x, y) => {
    const i = (y * ancho + x) * 3;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx > 120 && mx - mn > 110; // azul o rojo fuerte: fuera los iconos grises y el dorado de las recompensas
  };
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1, n = 0;
  for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
    if (!color(x, y)) continue;
    n++;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (n < 6 || by1 - by0 < 4) return null; // no hay número (pantalla de carga, interfaz quitada…)
  let bits = '';
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) bits += color(x, y) ? '1' : '0';
  return `${bx1 - bx0 + 1}x${by1 - by0 + 1}:${bits}`;
}

// Cuánto se parecen dos huellas, de 0 (iguales) a 1 o más: píxeles que no coinciden entre los que tienen tinta,
// probando a mover una sobre otra un píxel en cada sentido. El borde del número parpadea (el marcador es algo
// transparente y lo de detrás cambia): el mismo «2» sale a veces de 6 y a veces de 7 de ancho.
const leerHuella = h => { const [tam, bits] = h.split(':'); const [w, a] = tam.split('x').map(Number); return { w, a, bits }; };
export function distanciaHuellas(a, b) {
  if (!a || !b) return Infinity;
  const A = leerHuella(a), B = leerHuella(b);
  if (Math.abs(A.w - B.w) > 2 || Math.abs(A.a - B.a) > 2) return Infinity;
  const en = (H, x, y) => x >= 0 && y >= 0 && x < H.w && y < H.a && H.bits[y * H.w + x] === '1';
  const tinta = H => [...H.bits].filter(c => c === '1').length;
  const total = Math.max(tinta(A), tinta(B), 1);
  let mejor = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let mal = 0;
    for (let y = -1; y <= Math.max(A.a, B.a); y++) for (let x = -1; x <= Math.max(A.w, B.w); x++) {
      if (en(A, x, y) !== en(B, x + dx, y + dy)) mal++;
    }
    mejor = Math.min(mejor, mal);
  }
  return mejor / total;
}

// Lo que se lee de un fotograma (ya a 768 de alto)
export function leerFotograma(px, ancho, alto) {
  const centro = ancho / 2;
  const contadores = CONTADORES.map(c => ({
    equipo: c.equipo, tipo: c.tipo,
    huella: huellaNumero(px, ancho, alto, centro + c.x - 2, MARCADOR_Y[0], c.ancho + 4, MARCADOR_Y[1] - MARCADOR_Y[0]),
  }));
  const marcos = [];
  for (const equipo of ['azul', 'rojo']) {
    for (let k = 0; k < 5; k++) {
      const y = MARCOS.primero + k * MARCOS.paso;
      const x = z => (equipo === 'azul' ? z.x : ancho - z.x - z.ancho);
      const leer = z => brillo(px, ancho, alto, x(z), y + z.y, z.ancho, z.alto);
      marcos.push({ equipo, k, d: leer(MARCOS.d), f: leer(MARCOS.f), r: leer(MARCOS.r) });
    }
  }
  return { contadores, marcos };
}

// ---------- De lecturas sueltas a sucesos ----------
const UMBRAL_RELOJ = 0.06;   // más de un 6 % de píxeles blancos en el icono = la aguja del enfriamiento
const PARECIDAS = 0.3;       // huellas a esta distancia o menos son el mismo número
const SEGUIDAS = 2;          // fotos seguidas iguales para dar por bueno un cambio (2 fotos = 1 s)

// Contadores del marcador: cuando el número de un equipo cambia a uno que no se había visto, ese equipo lo ha cogido.
// Los contadores solo suben, así que un número ya visto (un parpadeo, la interfaz que vuelve) no cuenta otra vez.
export class SeguidorMarcador {
  constructor() { this.limpiar(); }
  limpiar() { this.estado = new Map(); }
  // contadores: los de leerFotograma. Devuelve [{ equipo, tipo, t }] con lo que se acaba de coger
  apuntar(t, contadores) {
    const sucesos = [];
    for (const c of contadores) {
      if (!c.huella) continue;
      const clave = `${c.equipo}-${c.tipo}`;
      let e = this.estado.get(clave);
      if (!e) { e = { actual: null, vistas: [], candidata: null, veces: 0, desde: null }; this.estado.set(clave, e); }
      if (e.actual && distanciaHuellas(c.huella, e.actual) <= PARECIDAS) { e.candidata = null; e.veces = 0; continue; }
      if (e.candidata && distanciaHuellas(c.huella, e.candidata) <= PARECIDAS) e.veces++;
      else { e.candidata = c.huella; e.veces = 1; e.desde = t; }
      if (e.veces < SEGUIDAS) continue;
      const nueva = !e.vistas.some(v => distanciaHuellas(v, e.candidata) <= PARECIDAS);
      // La primera lectura de la partida es el punto de partida, no un suceso
      if (e.actual && nueva) sucesos.push({ equipo: c.equipo, tipo: c.tipo, t: e.desde });
      e.actual = e.candidata;
      if (nueva) e.vistas.push(e.candidata);
      e.candidata = null; e.veces = 0;
    }
    return sucesos;
  }
}

// Enfriamientos de D, F y R de cada marco: tramos [desde, hasta] (hasta = null mientras dura)
export class SeguidorHechizos {
  constructor() { this.limpiar(); }
  limpiar() { this.estado = new Map(); }
  apuntar(t, marcos) {
    let cambio = false;
    for (const m of marcos) {
      for (const s of ['d', 'f', 'r']) {
        const clave = `${m.equipo}-${m.k}-${s}`;
        let e = this.estado.get(clave);
        if (!e) { e = { equipo: m.equipo, k: m.k, s, enfriando: null, veces: 0, desde: null, tramos: [] }; this.estado.set(clave, e); }
        const ahora = m[s].blancos > UMBRAL_RELOJ;
        if (e.enfriando === null) { e.enfriando = ahora; if (ahora) e.tramos.push([t, null]); continue; }
        if (ahora === e.enfriando) { e.veces = 0; continue; }
        if (e.veces === 0) e.desde = t;
        if (++e.veces < SEGUIDAS) continue;
        e.enfriando = ahora; e.veces = 0; cambio = true;
        if (ahora) e.tramos.push([e.desde, null]);
        else if (e.tramos.length && e.tramos.at(-1)[1] === null) e.tramos.at(-1)[1] = e.desde;
      }
    }
    return cambio;
  }
  // Tramos de un marco (equipo, k = 0..4), con t redondeado a décimas
  de(equipo, k) {
    const r = {};
    for (const s of ['d', 'f', 'r']) {
      const e = this.estado.get(`${equipo}-${k}-${s}`);
      r[s] = (e?.tramos || []).map(([a, b]) => [Math.round(a * 10) / 10, b === null ? null : Math.round(b * 10) / 10]);
    }
    return r;
  }
}

// ---------- Captura ----------
// Corta un flujo de BMP (image2pipe) en fotogramas { ancho, alto, px (RGB de arriba abajo) }
export class CortadorBmp {
  constructor() { this.resto = Buffer.alloc(0); }
  meter(trozo) {
    this.resto = this.resto.length ? Buffer.concat([this.resto, trozo]) : trozo;
    const fotos = [];
    while (this.resto.length >= 54) {
      if (this.resto[0] !== 0x42 || this.resto[1] !== 0x4d) { this.resto = Buffer.alloc(0); break; } // descolocado: se espera al siguiente
      const tam = this.resto.readUInt32LE(2);
      if (this.resto.length < tam) break;
      const bmp = this.resto.subarray(0, tam);
      this.resto = this.resto.subarray(tam);
      const datos = bmp.readUInt32LE(10), ancho = bmp.readInt32LE(18), altoFirmado = bmp.readInt32LE(22), bits = bmp.readUInt16LE(28);
      if (bits !== 24) continue;
      const alto = Math.abs(altoFirmado), fila = Math.ceil(ancho * 3 / 4) * 4;
      const px = Buffer.alloc(ancho * alto * 3);
      for (let y = 0; y < alto; y++) {
        const origen = datos + (altoFirmado > 0 ? alto - 1 - y : y) * fila;
        for (let x = 0; x < ancho; x++) {
          const o = origen + x * 3, d = (y * ancho + x) * 3;
          px[d] = bmp[o + 2]; px[d + 1] = bmp[o + 1]; px[d + 2] = bmp[o];
        }
      }
      fotos.push({ ancho, alto, px });
    }
    return fotos;
  }
}

export function argumentosCaptura({ ventana = 'League of Legends.exe', fps = 2 } = {}) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-filter_complex', `gfxcapture=window_exe=${ventana}:capture_cursor=0:max_framerate=${fps},hwdownload,format=bgra,fps=${fps},scale=-2:${ALTO},format=bgr24`,
    '-f', 'image2pipe', '-c:v', 'bmp', '-',
  ];
}

// Arranca y vigila ffmpeg; emite 'foto' ({ ancho, alto, px }) y 'estado' (true/false: si llegan fotos)
export class LectorPantalla extends EventEmitter {
  constructor({ ffmpeg = 'ffmpeg', ventana, fps = 2, reintentoSegundos = 10 } = {}, lanzar = spawn) {
    super();
    Object.assign(this, { ffmpeg, ventana, fps, reintentoMs: reintentoSegundos * 1000, lanzar });
    this.proceso = null;
    this.activo = false;
    this.ultimaFoto = 0;
    this.error = null;
  }
  arrancar() {
    if (this.activo) return;
    this.activo = true;
    this.lanzarFfmpeg();
  }
  lanzarFfmpeg() {
    if (!this.activo || this.proceso) return;
    const cortador = new CortadorBmp();
    let errores = '';
    let p;
    try {
      p = this.lanzar(this.ffmpeg, argumentosCaptura({ ventana: this.ventana, fps: this.fps }), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { this.error = e.message; this.reintentar(); return; }
    this.proceso = p;
    p.stdout.on('data', d => {
      for (const f of cortador.meter(d)) {
        if (!this.ultimaFoto || this.error) this.emit('estado', true);
        this.ultimaFoto = Date.now(); this.error = null;
        this.emit('foto', f);
      }
    });
    p.stderr?.on('data', d => { errores = (errores + d).slice(-500); });
    p.on('error', e => { errores = e.message; });
    p.on('close', () => {
      if (this.proceso === p) this.proceso = null;
      if (!this.activo) return;
      // Sin ventana del LoL (o minimizada) ffmpeg no arranca: se vuelve a probar
      this.error = errores.trim().split('\n').at(-1) || 'la captura se ha cerrado';
      this.emit('estado', false);
      this.reintentar();
    });
  }
  reintentar() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.lanzarFfmpeg(), this.reintentoMs);
    this.temporizador.unref?.();
  }
  parar() {
    this.activo = false;
    clearTimeout(this.temporizador);
    const p = this.proceso; this.proceso = null;
    try { p?.kill(); } catch { /* ya cerrado */ }
  }
  // ¿Llegan fotos? (para la luz del panel)
  vivo(ms = 5000) { return this.activo && Date.now() - this.ultimaFoto < ms; }
}
