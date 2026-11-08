// Crónicas de las partidas (lo pidió Pacopepe el 08/11/2026): al acabar cada partida, el realizador (repo
// Pacopepe4/realizador, su IA) manda su texto y su resumen a POST /api/cronicas/partida; la web los guarda, los enseña en
// la portada (los enfrentamientos del último día de partidas, en la zona de la liga) y los publica en el canal
// #resultados del servidor de Discord con su webhook (server/discord.js → publicarCronica). Primero se pensó como
// newsletter por correo; Pacopepe prefirió el canal de Discord, así que no se guarda ningún correo.
//
// - Crónicas: pestaña «Cronicas» de la hoja (o data/cronicas.json en local), una fila por crónica.
// - El realizador se identifica con CRONICAS_CLAVE (cabecera Authorization: Bearer …).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { archivoDatos } from './datos.js';
import { hojaActiva, asegurarPestana, leer, anadir } from './sheets.js';

const CRON = { pestana: 'Cronicas', archivo: archivoDatos('cronicas.json'), cabecera: ['Fecha', 'Azul', 'Rojo', 'Titulo', 'Texto', 'Resumen', 'Discord'] };
export const MAXIMO_TEXTO = 20000;

let cronicas = [];
const estado = { ultima: null };

export const claveRealizador = () => process.env.CRONICAS_CLAVE || '';

// En la hoja, un texto que empiece por = + - @ se tomaría por una fórmula
const celda = s => (/^[=+\-@]/.test(String(s ?? '')) ? `'${s}` : String(s ?? ''));
const deFila = f => ({ fecha: f[0], azul: f[1], rojo: f[2], titulo: f[3] || '', texto: f[4] || '', resumen: f[5] || '', discord: f[6] || '' });
const aFila = c => [c.fecha, c.azul, c.rojo, c.titulo, c.texto, c.resumen, c.discord];

export async function cargarCronicas() {
  try {
    if (hojaActiva()) {
      await asegurarPestana(CRON.pestana, CRON.cabecera);
      cronicas = (await leer(CRON.pestana)).slice(1).filter(f => f[0]).map(deFila);
    } else {
      cronicas = JSON.parse(await readFile(CRON.archivo, 'utf8')).map(deFila);
    }
  } catch (e) {
    if (hojaActiva()) console.error('Crónicas: no se pudieron leer:', e.message);
    cronicas = [];
  }
}

// La crónica de una partida: la última de esas dos familias (en el orden que sea) mandada ese día o después (el
// realizador puede mandarla pasada la medianoche). Sin fecha, la última que haya
export function cronicaDe(azul, rojo, desde = null) {
  const de = c => ((c.azul === azul && c.rojo === rojo) || (c.azul === rojo && c.rojo === azul)) && (!desde || c.fecha.slice(0, 10) >= desde);
  return cronicas.filter(de).at(-1) || null;
}

// Una operación detrás de otra: que dos crónicas a la vez no se pisen al guardarse
let cola = Promise.resolve();
const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };

// Guarda la crónica y la publica en Discord con publicar() (la pone index.js: server/discord.js). Si Discord falla, la
// crónica se guarda igual y sale en la portada; el panel cuenta qué pasó
export async function publicarCronica({ azul, rojo, titulo, texto, resumen }, publicar) {
  const c = { fecha: new Date().toISOString(), azul, rojo, titulo, texto, resumen, discord: '' };
  let error = null;
  try { await publicar(); c.discord = 'publicada'; }
  catch (e) { error = e.message; c.discord = `no: ${e.message}`; }
  // «La última» se apunta a la vez que se cuenta la crónica (antes de guardarla), para que el panel nunca vea la
  // crónica nueva con la información de la anterior
  estado.ultima = { fecha: c.fecha, partida: `${azul} contra ${rojo}`, publicada: !error, error };
  await enCola(async () => {
    cronicas.push(c);
    if (hojaActiva()) {
      await asegurarPestana(CRON.pestana, CRON.cabecera);
      await anadir(CRON.pestana, [aFila(c).map(celda)]);
    } else {
      await mkdir(path.dirname(CRON.archivo), { recursive: true });
      await writeFile(CRON.archivo, JSON.stringify(cronicas.map(aFila), null, 1));
    }
  });
  return { publicada: !error, error };
}

export const estadoCronicas = () => ({ cronicas: cronicas.length, realizador: Boolean(claveRealizador()), ultima: estado.ultima });
