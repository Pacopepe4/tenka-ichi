// Lo que el usuario dicta en el chat para la web publicada (los jugadores de una plantilla, sus tiers) y que no se puede
// escribir en la hoja desde fuera sin la contraseña del panel: va en data-proyecto/importaciones.json, con un nombre.
// Cada importación se aplica una sola vez, al arrancar la web publicada, y queda apuntada en Ajustes
// («importaciones_hechas»): lo que el staff cambie después desde el panel no se vuelve a pisar.
// Con «fichas» se cambian el lema y la descripción de un clan (lo que falte se queda como esté).
// En una plantilla, un hueco que venga a null se queda como esté (para cambiar solo un puesto).
// Con «quitarPartidas» saca de la hoja partidas de prueba (las de esos clanes jugadas antes de un día): sus filas de
// «Registro» y «Estadisticas» pasan antes a «RegistroQuitadas» y «EstadisticasQuitadas», así que no se borra nada.
// En local y en las pruebas no se aplica nada, salvo con IMPORTACIONES=1
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajuste, guardarAjustes } from './ajustes.js';
import { plantilla, guardarPlantilla } from './plantillas.js';
import { ponerTier, guardarTierlistYa } from './tierlist.js';
import { hojaActiva, asegurarPestana, leer, anadir, escribirEncima } from './sheets.js';
import { cargar as cargarRegistro } from './registro.js';

const ARCHIVO = process.env.ARCHIVO_IMPORTACIONES
  ? path.resolve(process.env.ARCHIVO_IMPORTACIONES) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto', 'importaciones.json');
const ACTIVAS = /^(1|si|sí|true)$/i.test(process.env.IMPORTACIONES ?? (process.env.RENDER ? '1' : ''));
const CLAVE = 'importaciones_hechas';

// El día de una celda de fecha, la escriba la hoja como la escriba (2026-10-06…, 6/10/2026)
function diaDe(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

// Solo si en la pestaña no queda nada más que lo de prueba: reescribir filas leídas de la hoja podría cambiarles el
// formato, así que si hay más partidas no se toca y hay que hacerlo a mano
async function quitarPartidas({ antesDe, clanes = [] }, nombre) {
  if (!hojaActiva() || !antesDe) return;
  const suyos = new Set(clanes);
  const tablas = [{ pestana: 'Registro', es: f => suyos.has(f[5]) && suyos.has(f[6]) }, { pestana: 'Estadisticas', es: f => suyos.has(f[4]) }];
  for (const t of tablas) {
    const filas = await leer(t.pestana);
    const [cabecera, ...datos] = filas;
    const fuera = datos.filter(f => { const d = diaDe(f[0]); return d && d < antesDe && t.es(f); });
    if (!fuera.length) continue;
    if (fuera.length !== datos.filter(f => f.some(Boolean)).length) throw new Error(`${nombre}: en ${t.pestana} hay más filas que las de prueba; hay que quitarlas a mano`);
    await asegurarPestana(`${t.pestana}Quitadas`, cabecera);
    await anadir(`${t.pestana}Quitadas`, fuera);
    await escribirEncima(t.pestana, [cabecera], filas.length);
    console.log(`${nombre}: ${fuera.length} filas de ${t.pestana} pasadas a ${t.pestana}Quitadas`);
  }
  await cargarRegistro();
}

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
    // «fichas»: el lema y la descripción de un clan (p. ej. al pasar los clanes a las familias de Gokudō)
    for (const [clan, ficha] of Object.entries(imp.fichas || {})) {
      if (!plantilla(clan)) throw new Error(`${imp.nombre}: no existe el clan ${clan}`);
      await guardarPlantilla(clan, { lema: ficha?.lema, descripcion: ficha?.descripcion });
    }
    const tiers = Object.entries(imp.tiers || {});
    for (const [id, tier] of tiers) ponerTier('jugador', id, tier);
    if (tiers.length) await guardarTierlistYa();
    if (imp.quitarPartidas) await quitarPartidas(imp.quitarPartidas, imp.nombre);
    hechas.add(imp.nombre);
    await guardarAjustes({ [CLAVE]: JSON.stringify([...hechas]) });
    aplicadas.push(imp.nombre);
  }
  return aplicadas;
}
