// Calendario real (data-proyecto/competicion.json) y temporada simulada (data-proyecto/simulacion.json).
// Ambos van en el repositorio: el calendario se sortea una vez y se sube a GitHub para que
// sobreviva a los reinicios de Render.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortear } from './competicion.js';

const carpeta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto');
const ARCHIVO = path.join(carpeta, 'competicion.json');
const SIMULACION = path.join(carpeta, 'simulacion.json');

let calendario = null;
let simulacion = null;

export async function cargarCalendario() {
  try { calendario = JSON.parse(await readFile(ARCHIVO, 'utf8')); } catch { calendario = null; }
  try { simulacion = JSON.parse(await readFile(SIMULACION, 'utf8')); } catch { simulacion = null; }
}

export const calendarioActual = () => calendario;
export const temporadaSimulada = () => simulacion;

export async function sortearCalendario(participantes, semilla) {
  const clanes = [...new Set(participantes)];
  if (clanes.length !== 10) throw new Error(`Hacen falta 10 clanes y hay ${clanes.length}`);
  calendario = sortear(clanes, Number(semilla) || Math.floor(Math.random() * 1e6));
  await writeFile(ARCHIVO, JSON.stringify(calendario, null, 1));
  return calendario;
}
