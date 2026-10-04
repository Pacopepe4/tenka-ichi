// Ajustes clave-valor que tienen que sobrevivir a los reinicios de Render (canal de Twitch conectado,
// recompensa de puntos del canal, lo que el panel tiene puesto...). Van en la pestaña «Ajustes» de Google Sheets;
// en local, en data/ajustes.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { hojaActiva, asegurarPestana, leer, escribirEncima } from './sheets.js';
import { archivoDatos } from './datos.js';

const ARCHIVO = archivoDatos('ajustes.json');
const PESTANA = 'Ajustes';
const CABECERA = ['Clave', 'Valor'];

let ajustes = {};
let filasEnHoja = 0;  // filas escritas la última vez, para dejar en blanco las que sobren

export async function cargarAjustes() {
  try {
    if (hojaActiva()) {
      await asegurarPestana(PESTANA, CABECERA);
      const filas = await leer(PESTANA);
      filasEnHoja = filas.length;
      ajustes = Object.fromEntries(filas.slice(1).filter(f => f[0]).map(f => [f[0], f[1] ?? '']));
    } else {
      ajustes = JSON.parse(await readFile(ARCHIVO, 'utf8'));
    }
  } catch (e) {
    if (hojaActiva()) console.error('No se pudieron leer los ajustes:', e.message);
    ajustes = {};
  }
}

export const ajuste = clave => ajustes[clave] ?? null;

async function volcar() {
  if (hojaActiva()) {
    await asegurarPestana(PESTANA, CABECERA);
    const filas = [CABECERA, ...Object.entries(ajustes)];
    await escribirEncima(PESTANA, filas, filasEnHoja);
    filasEnHoja = filas.length;
  } else {
    await mkdir(path.dirname(ARCHIVO), { recursive: true });
    await writeFile(ARCHIVO, JSON.stringify(ajustes, null, 1));
  }
}

// Las escrituras van de una en una y siempre con todos los ajustes: si llegan varios cambios mientras se
// escribe, se juntan en la escritura siguiente
let cola = Promise.resolve(), enEspera = null;
export function guardarAjustes(cambios) {
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null || v === undefined) delete ajustes[k]; else ajustes[k] = String(v);
  }
  if (!enEspera) {
    enEspera = cola.then(() => { enEspera = null; return volcar(); });
    cola = enEspera.catch(() => {});
  }
  return enEspera;
}
