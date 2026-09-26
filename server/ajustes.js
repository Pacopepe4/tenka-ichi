// Ajustes clave-valor que tienen que sobrevivir a los reinicios de Render (canal de Twitch conectado,
// recompensa de puntos del canal...). Van en la pestaña «Ajustes» de Google Sheets; en local, en data/ajustes.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hojaActiva, asegurarPestana, leer, escribir } from './sheets.js';

const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ajustes.json');
const PESTANA = 'Ajustes';
const CABECERA = ['Clave', 'Valor'];

let ajustes = {};

export async function cargarAjustes() {
  try {
    if (hojaActiva()) {
      await asegurarPestana(PESTANA, CABECERA);
      ajustes = Object.fromEntries((await leer(PESTANA)).slice(1).filter(f => f[0]).map(f => [f[0], f[1] ?? '']));
    } else {
      ajustes = JSON.parse(await readFile(ARCHIVO, 'utf8'));
    }
  } catch (e) {
    if (hojaActiva()) console.error('No se pudieron leer los ajustes:', e.message);
    ajustes = {};
  }
}

export const ajuste = clave => ajustes[clave] ?? null;

export async function guardarAjustes(cambios) {
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null || v === undefined) delete ajustes[k]; else ajustes[k] = String(v);
  }
  if (hojaActiva()) {
    await asegurarPestana(PESTANA, CABECERA);
    await escribir(PESTANA, [CABECERA, ...Object.entries(ajustes)]);
  } else {
    await mkdir(path.dirname(ARCHIVO), { recursive: true });
    await writeFile(ARCHIVO, JSON.stringify(ajustes, null, 1));
  }
}
