// La barrida de la repetición (stingers obs/repeticion-entrada.webm y -salida.webm), dibujada fotograma a fotograma
// sin dependencias: cada fotograma es un búfer RGBA (alfa sin premultiplicar) que generar.js pasa a ffmpeg.
//
// Un solo movimiento: un paño de noche #0C0D13 entra de lado a lado con una curva suave, tapa la pantalla, enseña
// el emblema de Gokudō quieto en medio y sale por el otro lado con la misma curva. El bermellón #E0303A solo está en
// el filo del paño (3 px) con un halo corto. La entrada va de izquierda a derecha; la salida es la misma barrida al
// revés (de derecha a izquierda), para volver al juego.
//
// OBS cambia de escena en transition_point (400 ms, instalar/configurar-obs.js): la pantalla está tapada del todo
// desde 0,25 s hasta 0,68 s (tapado() lo calcula), con margen a los dos lados.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export const ANCHO = 1920;
export const ALTO = 1080;
export const FPS = 60;
export const DURACION = 1.0;                       // segundos (60 fotogramas)
export const FOTOGRAMAS = Math.round(DURACION * FPS);

const NOCHE = [0x0C, 0x0D, 0x13].map(c => c / 255);
const SHU = [0xE0, 0x30, 0x3A].map(c => c / 255);       // bermellón del filo
const SHU_NEON = [0xFF, 0x5A, 0x63].map(c => c / 255);  // la línea central del filo, un punto más viva

// Movimiento: el filo cruza de MARGEN fuera de la pantalla a MARGEN fuera del otro lado
export const ENTRADA = { desde: 0.0, hasta: 0.32 };
export const SALIDA = { desde: 0.62, hasta: 0.94 };
const MARGEN = 48;                                   // px fuera de pantalla: el halo no asoma en el primer fotograma
const FILO = 3;                                      // px de bermellón en el borde del paño
const HALO_DENTRO = { alfa: 0.20, px: 16 };          // resplandor sobre el paño (decae exp(-d/px))
const HALO_FUERA = { alfa: 0.30, px: 3.5 };          // resplandor sobre el juego: corto, para no ensuciarlo
const OBTURADOR = 0;                                 // sin desenfoque de movimiento: el filo se ve nítido en cada fotograma
const SUB_T = OBTURADOR > 0 ? 40 : 1;                // muestras en el tiempo por fotograma (con pocas, el desenfoque deja rastros)
const SUB_X = 4;                                     // muestras por píxel

// Emblema: entra y sale en opacidad y escala, sin girar, solo con la pantalla tapada
// (herramientas/barrida/gokudo.png, el emblema plano de 640 px, a la mitad: el círculo queda de unos 200 px)
export const EMBLEMA = { entra: [0.24, 0.36], sale: [0.52, 0.62], escala: [0.94, 1, 1.03] };
export const RUTA_EMBLEMA = new URL('./gokudo.png', import.meta.url);

// ease-in-out fuerte (cuártica): arranca y llega suave, rápido en medio
export const curva = p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2);
const suave = p => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

// Fase y posición del filo (en el sentido de la entrada, de izquierda a derecha): al entrar, el filo de delante; al
// salir, el de atrás. 'tapa': el paño lo cubre todo; 'nada': aún no ha entrado o ya se ha ido
export function estado(t) {
  const recorrido = x => -MARGEN + (ANCHO + 2 * MARGEN) * x;
  if (t < ENTRADA.desde) return { fase: 'nada' };
  if (t <= ENTRADA.hasta) return { fase: 'entra', filo: recorrido(curva((t - ENTRADA.desde) / (ENTRADA.hasta - ENTRADA.desde))) };
  if (t < SALIDA.desde) return { fase: 'tapa' };
  if (t <= SALIDA.hasta) return { fase: 'sale', filo: recorrido(curva((t - SALIDA.desde) / (SALIDA.hasta - SALIDA.desde))) };
  return { fase: 'nada' };
}

// Color premultiplicado [r, g, b, a] en x (sentido de la entrada) para un instante
function muestra(x, e) {
  if (e.fase === 'nada') return [0, 0, 0, 0];
  if (e.fase === 'tapa') return [...NOCHE, 1];
  // d: cuánto se mete x dentro del paño (positivo dentro, negativo fuera)
  const d = e.fase === 'entra' ? e.filo - x : x - e.filo;
  if (d <= 0) {
    const a = HALO_FUERA.alfa * Math.exp(d / HALO_FUERA.px);
    return [SHU[0] * a, SHU[1] * a, SHU[2] * a, a];
  }
  if (d <= FILO) {
    const c = Math.abs(d - FILO / 2) < 0.5 ? SHU_NEON : SHU;
    return [...c, 1];
  }
  const g = HALO_DENTRO.alfa * Math.exp(-(d - FILO) / HALO_DENTRO.px);
  return [NOCHE[0] + (SHU[0] - NOCHE[0]) * g, NOCHE[1] + (SHU[1] - NOCHE[1]) * g, NOCHE[2] + (SHU[2] - NOCHE[2]) * g, 1];
}

// Una fila (todas las filas del paño son iguales): premultiplicado en Float32, 4 valores por píxel
export function fila(t) {
  const out = new Float32Array(ANCHO * 4);
  const dt = OBTURADOR / FPS;
  const estados = [];
  for (let k = 0; k < SUB_T; k++) estados.push(estado(t + dt * ((k + 0.5) / SUB_T - 0.5)));
  const n = SUB_T * SUB_X;
  for (let x = 0; x < ANCHO; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const e of estados) {
      for (let s = 0; s < SUB_X; s++) {
        const m = muestra(x + (s + 0.5) / SUB_X, e);
        r += m[0]; g += m[1]; b += m[2]; a += m[3];
      }
    }
    out.set([r / n, g / n, b / n, a / n], x * 4);
  }
  return out;
}

// Cuánto se ve el emblema (opacidad y escala) en t
export function emblema(t) {
  const [e0, e1] = EMBLEMA.entra, [s0, s1] = EMBLEMA.sale, [k0, k1, k2] = EMBLEMA.escala;
  if (t <= e0 || t >= s1) return { alfa: 0, escala: k0 };
  if (t < e1) { const p = suave((t - e0) / (e1 - e0)); return { alfa: p, escala: k0 + (k1 - k0) * p }; }
  if (t <= s0) return { alfa: 1, escala: k1 };
  const p = suave((t - s0) / (s1 - s0));
  return { alfa: 1 - p, escala: k1 + (k2 - k1) * p };
}

// PNG RGBA de 8 bits sin entrelazar (el emblema), a premultiplicado en Float32
export function leerPng(ruta) {
  const b = readFileSync(ruta);
  let p = 8, ancho = 0, alto = 0;
  const idat = [];
  while (p < b.length) {
    const largo = b.readUInt32BE(p), tipo = b.toString('latin1', p + 4, p + 8), datos = b.subarray(p + 8, p + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0); alto = datos.readUInt32BE(4);
      if (datos[8] !== 8 || datos[9] !== 6 || datos[12] !== 0) throw new Error(`${ruta}: hace falta PNG RGBA de 8 bits sin entrelazar`);
    } else if (tipo === 'IDAT') idat.push(datos);
    p += 12 + largo;
  }
  const raw = inflateSync(Buffer.concat(idat)), linea = ancho * 4, px = new Uint8Array(alto * linea);
  for (let y = 0; y < alto; y++) {
    const f = raw[y * (linea + 1)], src = raw.subarray(y * (linea + 1) + 1, (y + 1) * (linea + 1));
    for (let i = 0; i < linea; i++) {
      const a = i >= 4 ? px[y * linea + i - 4] : 0, up = y ? px[(y - 1) * linea + i] : 0, c = i >= 4 && y ? px[(y - 1) * linea + i - 4] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * linea + i] = v & 255;
    }
  }
  const pre = new Float32Array(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) {
    const a = px[i * 4 + 3] / 255;
    pre[i * 4] = (px[i * 4] / 255) * a; pre[i * 4 + 1] = (px[i * 4 + 1] / 255) * a; pre[i * 4 + 2] = (px[i * 4 + 2] / 255) * a; pre[i * 4 + 3] = a;
  }
  return { ancho, alto, pre };
}

// A la mitad de tamaño, promediando cada 2×2 (en premultiplicado): el emblema sale nítido, sin dientes
export function mitad(img) {
  const ancho = img.ancho >> 1, alto = img.alto >> 1, pre = new Float32Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) for (let c = 0; c < 4; c++) {
    const at = (xx, yy) => img.pre[(yy * img.ancho + xx) * 4 + c];
    pre[(y * ancho + x) * 4 + c] = (at(2 * x, 2 * y) + at(2 * x + 1, 2 * y) + at(2 * x, 2 * y + 1) + at(2 * x + 1, 2 * y + 1)) / 4;
  }
  return { ancho, alto, pre };
}

export const cargarEmblema = (ruta = RUTA_EMBLEMA) => mitad(leerPng(ruta));

// El centro del emblema es el del círculo (los píxeles opacos y rojos), no el del PNG, que lleva el tajo descentrado
export function centroEmblema(img) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < img.alto; y++) for (let x = 0; x < img.ancho; x++) {
    const i = (y * img.ancho + x) * 4, a = img.pre[i + 3];
    if (a > 0.95 && img.pre[i] > 0.7 && img.pre[i + 1] < 0.4) { sx += x + 0.5; sy += y + 0.5; n++; }
  }
  return n ? { x: sx / n, y: sy / n } : { x: img.ancho / 2, y: img.alto / 2 };
}

// Fotograma n de la entrada o la salida: Buffer RGBA de ANCHO×ALTO con alfa sin premultiplicar
export function fotograma(n, tipo, img, centro = centroEmblema(img)) {
  const t = n / FPS, base = fila(t), espejo = tipo === 'salida';
  const premult = new Float32Array(ANCHO * 4);
  for (let x = 0; x < ANCHO; x++) premult.set(base.subarray((espejo ? ANCHO - 1 - x : x) * 4, (espejo ? ANCHO - 1 - x : x) * 4 + 4), x * 4);
  const filaBytes = aBytes(premult);
  const buf = Buffer.alloc(ANCHO * ALTO * 4);
  for (let y = 0; y < ALTO; y++) filaBytes.copy(buf, y * ANCHO * 4);

  const em = emblema(t);
  if (em.alfa > 0) {
    const s = em.escala, cx = ANCHO / 2, cy = ALTO / 2;
    const x0 = Math.max(0, Math.floor(cx - centro.x * s)), x1 = Math.min(ANCHO, Math.ceil(cx + (img.ancho - centro.x) * s));
    const y0 = Math.max(0, Math.floor(cy - centro.y * s)), y1 = Math.min(ALTO, Math.ceil(cy + (img.alto - centro.y) * s));
    const px = new Float32Array(4);
    for (let y = y0; y < y1; y++) {
      const fila2 = new Float32Array(ANCHO * 4);
      fila2.set(premult);
      for (let x = x0; x < x1; x++) {
        bilineal(img, (x + 0.5 - cx) / s + centro.x - 0.5, (y + 0.5 - cy) / s + centro.y - 0.5, px);
        const i = x * 4, debajo = premult[i + 3];
        const k = em.alfa * debajo;            // solo encima del paño, nunca sobre el juego
        const a = px[3] * k;
        for (let c = 0; c < 3; c++) fila2[i + c] = px[c] * k + premult[i + c] * (1 - a);
        fila2[i + 3] = a + debajo * (1 - a);
      }
      aBytes(fila2.subarray(x0 * 4, x1 * 4)).copy(buf, (y * ANCHO + x0) * 4);
    }
  }
  return buf;
}

function bilineal(img, u, v, out) {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  out.fill(0);
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const x = x0 + dx, y = y0 + dy;
    if (w === 0 || x < 0 || y < 0 || x >= img.ancho || y >= img.alto) continue;
    const i = (y * img.ancho + x) * 4;
    for (let c = 0; c < 4; c++) out[c] += img.pre[i + c] * w;
  }
}

// Premultiplicado → bytes RGBA sin premultiplicar. Donde no hay nada, el color es el bermellón del halo: así el
// submuestreo de color 4:2:0 de VP9 no mete un cerco negro alrededor del filo
function aBytes(pre) {
  const n = pre.length / 4, b = Buffer.alloc(pre.length);
  for (let i = 0; i < n; i++) {
    const a = pre[i * 4 + 3], j = i * 4;
    const A = Math.round(Math.min(1, a) * 255);
    if (A === 0) { b[j] = 0xE0; b[j + 1] = 0x30; b[j + 2] = 0x3A; b[j + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) b[j + c] = Math.round(Math.min(1, pre[j + c] / a) * 255);
    b[j + 3] = A;
  }
  return b;
}

// Cuándo está la pantalla tapada del todo (alfa 255 en todas las columnas, con el desenfoque de movimiento incluido)
export function tapado() {
  let desde = null, hasta = null;
  for (let n = 0; n < FOTOGRAMAS; n++) {
    const f = fila(n / FPS);
    let lleno = true;
    for (let x = 0; x < ANCHO; x++) if (Math.round(f[x * 4 + 3] * 255) < 255) { lleno = false; break; }
    if (lleno) { if (desde === null) desde = n / FPS; hasta = n / FPS; }
  }
  return { desde, hasta };
}
