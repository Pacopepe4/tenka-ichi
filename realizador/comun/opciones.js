// Carga opciones.json y, encima, opciones.local.json (contraseñas e IPs de cada PC; no se sube a GitHub).
// La ruta de las opciones se puede cambiar con la variable REALIZADOR_OPCIONES (la usa el simulador).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Mezcla b sobre a, entrando en los objetos (las listas se sustituyen enteras)
export function mezclar(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const r = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) r[k] = mezclar(r[k], v);
  return r;
}

function leer(ruta) {
  if (!existsSync(ruta)) return {};
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (e) {
    throw new Error(`No se puede leer ${ruta}: ${e.message}`);
  }
}

export function cargarOpciones() {
  const base = leer(join(RAIZ, 'opciones.json'));
  const local = leer(join(RAIZ, 'opciones.local.json'));
  const extra = process.env.REALIZADOR_OPCIONES ? leer(process.env.REALIZADOR_OPCIONES) : {};
  return mezclar(mezclar(base, local), extra);
}
