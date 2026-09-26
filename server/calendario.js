// Calendario real y temporada simulada (data-proyecto/simulacion.json).
// El calendario sorteado se guarda en la pestaña «Calendario» de Google Sheets, que sobrevive
// a los reinicios de Render, y además en data-proyecto/competicion.json como copia local.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortear } from './competicion.js';
import { hojaActiva, asegurarPestana, leer, escribir } from './sheets.js';

const carpeta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto');
const ARCHIVO = path.join(carpeta, 'competicion.json');
const SIMULACION = path.join(carpeta, 'simulacion.json');
const PESTANA = 'Calendario';
const CABECERA = ['Jornada', 'Cruce', 'Lado azul', 'Lado rojo', 'Semilla', 'Participantes'];

let calendario = null;
let simulacion = null;

// Una fila por cruce; la primera lleva también la semilla y el orden de los participantes
export function aFilas(cal) {
  return [CABECERA, ...cal.jornadas.flat().map((c, i) => [c.jornada, c.id, c.azul, c.rojo,
    i === 0 ? cal.semilla : '', i === 0 ? cal.participantes.join(', ') : ''])];
}

export function deFilas(filas) {
  const datos = filas.slice(1).filter(f => f[1]);
  if (!datos.length) return null;
  const jornadas = [];
  for (const [jornada, id, azul, rojo] of datos) {
    const j = Number(jornada);
    (jornadas[j - 1] ||= []).push({ id, jornada: j, azul, rojo });
  }
  const participantes = String(datos[0][5] || '').split(',').map(s => s.trim()).filter(Boolean);
  return { semilla: Number(datos[0][4]), participantes: participantes.length ? participantes : [...new Set(datos.flatMap(f => [f[2], f[3]]))], jornadas };
}

async function guardarEnHoja(cal) {
  await asegurarPestana(PESTANA, CABECERA);
  await escribir(PESTANA, aFilas(cal));
}

export async function cargarCalendario() {
  try { simulacion = JSON.parse(await readFile(SIMULACION, 'utf8')); } catch { simulacion = null; }
  let local = null;
  try { local = JSON.parse(await readFile(ARCHIVO, 'utf8')); } catch {}
  calendario = local;
  if (!hojaActiva()) return;
  try {
    await asegurarPestana(PESTANA, CABECERA);
    const enHoja = deFilas(await leer(PESTANA));
    if (enHoja) calendario = enHoja;
    else if (local) await guardarEnHoja(local); // primera vez: sube la copia local
  } catch (e) {
    console.error('No se pudo leer el calendario de Google Sheets:', e.message);
  }
}

export const calendarioActual = () => calendario;
export const temporadaSimulada = () => simulacion;

export async function sortearCalendario(participantes, semilla) {
  const clanes = [...new Set(participantes)];
  if (clanes.length !== 10) throw new Error(`Hacen falta 10 clanes y hay ${clanes.length}`);
  calendario = sortear(clanes, Number(semilla) || Math.floor(Math.random() * 1e6));
  await writeFile(ARCHIVO, JSON.stringify(calendario, null, 1)).catch(() => {});
  if (hojaActiva()) {
    try { await guardarEnHoja(calendario); }
    catch (e) { throw new Error(`Calendario sorteado, pero no se pudo guardar en Google Sheets y se perderá al reiniciar: ${e.message}`); }
  }
  return calendario;
}
