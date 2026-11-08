// Newsletter de Gokudō (lo pidió Pacopepe el 08/11/2026): en la portada, donde estaba el anuncio del sorteo, cada
// visitante deja su correo; al acabar cada partida, el realizador (repo Pacopepe4/realizador, su IA) manda su texto y
// su resumen a POST /api/newsletter/partida y la web los reparte por correo, en texto plano, a quien esté apuntado.
// La portada enseña además los enfrentamientos del último día de partidas con su resultado y su crónica.
//
// - Suscripciones: pestaña «Newsletter» de la hoja (o data/newsletter.json en local). Solo se añaden filas: «alta» o
//   «baja», con el token que va en el enlace para darse de baja de cada correo.
// - Crónicas: pestaña «Cronicas» (o data/cronicas.json): el texto y el resumen de cada partida, con sus dos familias.
// - Envío: por la API de Brevo (gratis, 300 correos al día, sin dominio propio: basta verificar el correo remitente).
//   Se activa con BREVO_API_KEY y NEWSLETTER_REMITENTE en Render. Sin ellas, las crónicas se guardan y salen en la
//   portada, pero no se manda ningún correo.
// - El realizador se identifica con NEWSLETTER_CLAVE (cabecera Authorization: Bearer …).
import crypto from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { archivoDatos } from './datos.js';
import { hojaActiva, asegurarPestana, leer, anadir } from './sheets.js';

const SUS = { pestana: 'Newsletter', archivo: archivoDatos('newsletter.json'), cabecera: ['Fecha', 'Correo', 'Tipo', 'Token'] };
const CRON = { pestana: 'Cronicas', archivo: archivoDatos('cronicas.json'), cabecera: ['Fecha', 'Azul', 'Rojo', 'Titulo', 'Texto', 'Resumen', 'Correos'] };
const URL_BREVO = (process.env.BREVO_URL || 'https://api.brevo.com/v3').replace(/\/$/, '');
export const MAXIMO_TEXTO = 20000;

let eventos = [], cronicas = [];
const suscritos = new Map();   // correo → token (solo los que están de alta)
const estado = { ultimoEnvio: null };

export const envioActivo = () => Boolean(process.env.BREVO_API_KEY && process.env.NEWSLETTER_REMITENTE);
export const claveRealizador = () => process.env.NEWSLETTER_CLAVE || '';

// En la hoja, un texto que empiece por = + - @ se tomaría por una fórmula
const celda = s => (/^[=+\-@]/.test(String(s ?? '')) ? `'${s}` : String(s ?? ''));

async function leerTabla(t) {
  if (hojaActiva()) {
    await asegurarPestana(t.pestana, t.cabecera);
    return (await leer(t.pestana)).slice(1).filter(f => f[0]);
  }
  try { return JSON.parse(await readFile(t.archivo, 'utf8')); } catch { return []; }
}
async function anadirFila(t, fila, todas) {
  if (hojaActiva()) {
    await asegurarPestana(t.pestana, t.cabecera);
    await anadir(t.pestana, [fila.map(celda)]);
  } else {
    await mkdir(path.dirname(t.archivo), { recursive: true });
    await writeFile(t.archivo, JSON.stringify(todas, null, 1));
  }
}

function aplicar([, correo, tipo, token]) {
  if (tipo === 'alta') suscritos.set(correo, token);
  if (tipo === 'baja') suscritos.delete(correo);
}
const deFila = f => ({ fecha: f[0], azul: f[1], rojo: f[2], titulo: f[3] || '', texto: f[4] || '', resumen: f[5] || '', correos: f[6] || '' });

export async function cargarNewsletter() {
  try {
    eventos = await leerTabla(SUS);
    suscritos.clear();
    eventos.forEach(aplicar);
    cronicas = (await leerTabla(CRON)).map(deFila);
  } catch (e) {
    console.error('Newsletter: no se pudo leer:', e.message);
  }
}

// Una operación detrás de otra: que dos altas a la vez no se pisen
let cola = Promise.resolve();
const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };

const CORREO = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export const correoValido = c => typeof c === 'string' && c.length <= 254 && CORREO.test(c);

export const apuntar = correo => enCola(async () => {
  const c = String(correo || '').trim().toLowerCase();
  if (!correoValido(c)) return { ok: false, error: 'Ese correo no parece válido' };
  if (suscritos.has(c)) return { ok: true, ya: true };
  const fila = [new Date().toISOString(), c, 'alta', crypto.randomBytes(16).toString('hex')];
  eventos.push(fila);
  aplicar(fila);
  await anadirFila(SUS, fila, eventos);
  return { ok: true };
});

export const darDeBaja = token => enCola(async () => {
  const correo = [...suscritos].find(([, t]) => t === token)?.[0];
  if (!token || !correo) return false;
  const fila = [new Date().toISOString(), correo, 'baja', token];
  eventos.push(fila);
  aplicar(fila);
  await anadirFila(SUS, fila, eventos);
  return true;
});

// La crónica de una partida: la última de esas dos familias (en el orden que sea) mandada ese día o después (el
// realizador puede mandarla pasada la medianoche). Sin fecha, la última que haya
export function cronicaDe(azul, rojo, desde = null) {
  const de = c => ((c.azul === azul && c.rojo === rojo) || (c.azul === rojo && c.rojo === azul)) && (!desde || c.fecha.slice(0, 10) >= desde);
  return cronicas.filter(de).at(-1) || null;
}

// Guarda la crónica y la manda por correo a los suscritos (si el envío está configurado). texto lleva ya todo lo que se
// manda: lo arma index.js con el resultado de la partida. Devuelve cuántos correos se mandaron
export async function publicarCronica({ azul, rojo, titulo, texto, resumen, asunto, cuerpo, web }) {
  const c = { fecha: new Date().toISOString(), azul, rojo, titulo, texto, resumen, correos: '' };
  let r = { enviados: 0, fallos: 0, error: null };
  if (envioActivo() && suscritos.size) r = await mandarATodos(asunto, cuerpo, web);
  else if (!envioActivo()) r.error = 'El envío de correos no está configurado (BREVO_API_KEY y NEWSLETTER_REMITENTE)';
  c.correos = r.error && !r.enviados ? `no: ${r.error}` : `${r.enviados} enviados${r.fallos ? `, ${r.fallos} fallos` : ''}`;
  await enCola(async () => {
    cronicas.push(c);
    await anadirFila(CRON, [c.fecha, c.azul, c.rojo, c.titulo, c.texto, c.resumen, c.correos], cronicas.map(x => [x.fecha, x.azul, x.rojo, x.titulo, x.texto, x.resumen, x.correos]));
  });
  estado.ultimoEnvio = { fecha: c.fecha, partida: `${azul} contra ${rojo}`, ...r };
  return r;
}

// Un correo por persona (cada uno lleva su enlace para darse de baja), de uno en uno para no pasarse del ritmo de Brevo
async function mandarATodos(asunto, cuerpo, web) {
  const r = { enviados: 0, fallos: 0, error: null };
  for (const [correo, token] of suscritos) {
    try {
      await mandar(correo, asunto, `${cuerpo}\n\n—\nPara no recibir más correos de Gokudō: ${web}/newsletter/baja?t=${token}`, `${web}/newsletter/baja?t=${token}`);
      r.enviados++;
    } catch (e) {
      r.fallos++;
      r.error = e.message;
      if (e.estado === 401 || e.estado === 403) break;   // la clave no vale: no tiene sentido seguir
    }
  }
  return r;
}

async function mandar(para, asunto, texto, baja) {
  const res = await fetch(`${URL_BREVO}/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.NEWSLETTER_NOMBRE || 'Gokudō', email: process.env.NEWSLETTER_REMITENTE },
      to: [{ email: para }], subject: asunto, textContent: texto,
      headers: { 'List-Unsubscribe': `<${baja}>` },
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`Brevo respondió ${res.status}${j.message ? `: ${j.message}` : ''}`), { estado: res.status });
  }
}

export const estadoNewsletter = () => ({
  suscritos: suscritos.size, envio: envioActivo(), remitente: envioActivo() ? process.env.NEWSLETTER_REMITENTE : null,
  realizador: Boolean(claveRealizador()), cronicas: cronicas.length, ultimoEnvio: estado.ultimoEnvio,
});
