// Plantillas de los clanes: lema, descripción, jugadores por rol y suplentes.
// Se guardan en la pestaña «Plantillas» de Google Sheets, que sobrevive a los reinicios de Render
// y se puede editar a mano desde la hoja. data-proyecto/plantillas.json es la copia local y el
// punto de partida la primera vez.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLANES } from './clanes.js';
import { hojaActiva, asegurarPestana, leer, escribir } from './sheets.js';

const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto', 'plantillas.json');
const PESTANA = 'Plantillas';
const CABECERA = ['Clan', 'Top', 'Jungla', 'Medio', 'ADC', 'Support', 'Suplentes', 'Lema', 'Descripción'];
const REFRESCO = 60 * 1000; // cada cuánto se vuelve a leer la hoja, por si alguien la edita a mano

let plantillas = {};
let leidaEn = 0;

const inicial = () => Object.fromEntries(CLANES.map(c => [c.id,
  { lema: c.lema, descripcion: c.descripcion, jugadores: Array(5).fill(''), suplentes: '' }]));

const aFilas = () => [CABECERA, ...CLANES.map(c => {
  const p = plantillas[c.id];
  return [c.id, ...p.jugadores, p.suplentes, p.lema, p.descripcion];
})];

function deFilas(filas) {
  const res = {};
  for (const f of filas.slice(1)) {
    const id = String(f[0] || '').trim().toUpperCase();
    if (!plantillas[id]) continue;
    res[id] = { jugadores: [1, 2, 3, 4, 5].map(i => String(f[i] || '').trim()), suplentes: String(f[6] || '').trim(),
      lema: String(f[7] || '').trim() || plantillas[id].lema, descripcion: String(f[8] || '').trim() || plantillas[id].descripcion };
  }
  return res;
}

async function desdeHoja() {
  await asegurarPestana(PESTANA, CABECERA);
  const filas = await leer(PESTANA);
  if (filas.length > 1) plantillas = { ...plantillas, ...deFilas(filas) };
  else await escribir(PESTANA, aFilas()); // primera vez: sube la copia local
  leidaEn = Date.now();
}

export async function cargarPlantillas() {
  try { plantillas = { ...inicial(), ...JSON.parse(await readFile(ARCHIVO, 'utf8')) }; }
  catch {
    plantillas = inicial();
    await mkdir(path.dirname(ARCHIVO), { recursive: true });
    await writeFile(ARCHIVO, JSON.stringify(plantillas, null, 1));
  }
  if (hojaActiva()) await desdeHoja().catch(e => console.error('No se pudieron leer las plantillas de Google Sheets:', e.message));
  return plantillas;
}

// Relee la hoja si ha pasado un rato, para recoger lo que se haya editado a mano
export async function refrescarPlantillas() {
  if (!hojaActiva() || Date.now() - leidaEn < REFRESCO) return;
  leidaEn = Date.now();
  await desdeHoja().catch(e => console.error('No se pudieron releer las plantillas:', e.message));
}

export function plantilla(id) {
  return plantillas[id] || inicial()[id];
}

export async function guardarPlantilla(id, datos) {
  const actual = plantilla(id);
  if (!actual) throw new Error(`Clan desconocido: ${id}`);
  plantillas[id] = {
    lema: datos.lema ?? actual.lema,
    descripcion: datos.descripcion ?? actual.descripcion,
    jugadores: Array.isArray(datos.jugadores) ? datos.jugadores.slice(0, 5).map(j => String(j || '').trim()) : actual.jugadores,
    suplentes: datos.suplentes ?? actual.suplentes,
  };
  await writeFile(ARCHIVO, JSON.stringify(plantillas, null, 1)).catch(() => {});
  if (hojaActiva()) {
    try { await escribir(PESTANA, aFilas()); leidaEn = Date.now(); }
    catch (e) { throw new Error(`Plantilla guardada, pero no en Google Sheets (se perderá al reiniciar): ${e.message}`); }
  }
  return plantillas[id];
}
