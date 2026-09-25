// Plantillas de los clanes: lema, descripción, jugadores por rol y suplentes.
// Se guardan en data-proyecto/plantillas.json, que va dentro del repositorio: así sobreviven
// a los reinicios de Render. Lo que se edite desde el panel en la web publicada dura hasta
// el siguiente reinicio; para dejarlo fijo, se edita el archivo y se sube a GitHub.
// (En Google Sheets solo va el registro de picks y bans.)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLANES } from './clanes.js';

const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto', 'plantillas.json');

let plantillas = {};

const inicial = () => Object.fromEntries(CLANES.map(c => [c.id,
  { lema: c.lema, descripcion: c.descripcion, jugadores: Array(5).fill(''), suplentes: '' }]));

export async function cargarPlantillas() {
  try { plantillas = { ...inicial(), ...JSON.parse(await readFile(ARCHIVO, 'utf8')) }; }
  catch {
    plantillas = inicial();
    await mkdir(path.dirname(ARCHIVO), { recursive: true });
    await writeFile(ARCHIVO, JSON.stringify(plantillas, null, 1));
  }
  return plantillas;
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
  await writeFile(ARCHIVO, JSON.stringify(plantillas, null, 1));
  return plantillas[id];
}
