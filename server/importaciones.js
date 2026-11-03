// Lo que el usuario dicta en el chat para la web publicada (los jugadores de una plantilla, sus tiers) y que no se puede
// escribir en la hoja desde fuera sin la contraseña del panel: va en data-proyecto/importaciones.json, con un nombre.
// Cada importación se aplica una sola vez, al arrancar la web publicada, y queda apuntada en Ajustes
// («importaciones_hechas»): lo que el staff cambie después desde el panel no se vuelve a pisar.
// En una plantilla, un hueco que venga a null se queda como esté (para cambiar solo un puesto).
// En local y en las pruebas no se aplica nada, salvo con IMPORTACIONES=1
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajuste, guardarAjustes } from './ajustes.js';
import { plantilla, guardarPlantilla } from './plantillas.js';
import { ponerTier, guardarTierlistYa } from './tierlist.js';

const ARCHIVO = process.env.ARCHIVO_IMPORTACIONES
  ? path.resolve(process.env.ARCHIVO_IMPORTACIONES) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto', 'importaciones.json');
const ACTIVAS = /^(1|si|sí|true)$/i.test(process.env.IMPORTACIONES ?? (process.env.RENDER ? '1' : ''));
const CLAVE = 'importaciones_hechas';

export function importacionesHechas() {
  try { return JSON.parse(ajuste(CLAVE) || '[]'); } catch { return []; }
}

// Devuelve los nombres de las que se han aplicado ahora. Si una falla a medias (la hoja no responde), no queda apuntada
// y se repite entera en el siguiente arranque: escribir lo mismo otra vez no cambia nada
export async function aplicarImportaciones() {
  if (!ACTIVAS) return [];
  const lista = JSON.parse(await readFile(ARCHIVO, 'utf8').catch(e => { if (e.code === 'ENOENT') return '[]'; throw e; }));
  const hechas = new Set(importacionesHechas()), aplicadas = [];
  for (const imp of Array.isArray(lista) ? lista : []) {
    if (!imp?.nombre || hechas.has(imp.nombre)) continue;
    for (const [clan, jugadores] of Object.entries(imp.plantillas || {})) {
      const antes = plantilla(clan)?.jugadores;
      if (!antes) throw new Error(`${imp.nombre}: no existe el clan ${clan}`);
      await guardarPlantilla(clan, { jugadores: antes.map((j, i) => (jugadores[i] == null ? j : String(jugadores[i]))) });
    }
    const tiers = Object.entries(imp.tiers || {});
    for (const [id, tier] of tiers) ponerTier('jugador', id, tier);
    if (tiers.length) await guardarTierlistYa();
    hechas.add(imp.nombre);
    await guardarAjustes({ [CLAVE]: JSON.stringify([...hechas]) });
    aplicadas.push(imp.nombre);
  }
  return aplicadas;
}
