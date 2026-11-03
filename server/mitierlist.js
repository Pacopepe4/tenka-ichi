// Tier lists de los espectadores: en la portada, cada uno coloca a los jugadores y a los equipos a su gusto (S+ a D) y
// la puede compartir en Discord. Con su cuenta de Discord se guarda para siempre en la pestaña «TierlistsPublico» de
// Google Sheets (una fila por persona; no depende de la temporada del gachapon); en local, en data/tierlists-publico.json.
// Si al arrancar no se ha podido leer la pestaña, no se escribe en ella hasta leerla: así nunca se pisan las de los demás.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { hojaActiva, asegurarPestana, leer, escribirEncima } from './sheets.js';
import { archivoDatos } from './datos.js';
import { vistaTierlist } from './tierlist.js';

export const TIERS_PUBLICO = ['S+', 'S', 'A', 'B', 'C', 'D'];
const PESTANA = 'TierlistsPublico';
const CABECERA = ['Usuario', 'Nombre', 'Jugadores', 'Equipos', 'Actualizada'];
const ARCHIVO = archivoDatos('tierlists-publico.json');

let listas = new Map();   // usuario → { nombre, jugadores, equipos, fecha }
let leida = false, filasEnHoja = 0;

const deTexto = t => { try { const o = JSON.parse(t || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };

export async function cargarTierlistsPublico() {
  try {
    if (hojaActiva()) {
      await asegurarPestana(PESTANA, CABECERA);
      const filas = await leer(PESTANA);
      listas = new Map(filas.slice(1).filter(f => f[0]).map(([id, nombre, j, e, fecha]) => [id, { nombre, jugadores: deTexto(j), equipos: deTexto(e), fecha }]));
      filasEnHoja = filas.length;
    } else {
      const datos = JSON.parse(await readFile(ARCHIVO, 'utf8').catch(e => { if (e.code === 'ENOENT') return '{}'; throw e; }));
      listas = new Map(Object.entries(datos));
    }
    leida = true;
  } catch (e) {
    console.error('No se pudieron leer las tier lists de los espectadores:', e.message);
  }
}

let cola = Promise.resolve();
function volcar() {
  const hecho = cola.then(async () => {
    if (!leida) await cargarTierlistsPublico();
    if (!leida) throw new Error('Ahora mismo no se pueden guardar: prueba otra vez en un momento');
    if (hojaActiva()) {
      const filas = [CABECERA, ...[...listas].map(([id, l]) => [id, l.nombre, JSON.stringify(l.jugadores), JSON.stringify(l.equipos), l.fecha])];
      await asegurarPestana(PESTANA, CABECERA);
      await escribirEncima(PESTANA, filas, filasEnHoja);
      filasEnHoja = filas.length;
    } else {
      await mkdir(path.dirname(ARCHIVO), { recursive: true });
      await writeFile(ARCHIVO, JSON.stringify(Object.fromEntries(listas), null, 1));
    }
  });
  cola = hecho.catch(() => {});
  return hecho;
}

// Quién se puede colocar: los jugadores con nombre en su plantilla y los clanes que compiten
export function candidatos() {
  const v = vistaTierlist();
  return {
    jugadores: v.jugadores.filter(j => j.nombre).map(({ id, clan, rol, nombre }) => ({ id, clan, rol, nombre })),
    equipos: v.equipos.map(({ id, nombre }) => ({ id, nombre })),
  };
}

// Solo ids que existen y tiers válidas
function limpiar(tiers, validos) {
  const ok = new Set(validos.map(x => x.id));
  return Object.fromEntries(Object.entries(tiers && typeof tiers === 'object' ? tiers : {}).filter(([id, t]) => ok.has(id) && TIERS_PUBLICO.includes(t)));
}

export function tierlistDe(usuario) {
  const l = usuario ? listas.get(usuario.id) : null;
  return { jugadores: l?.jugadores || {}, equipos: l?.equipos || {}, fecha: l?.fecha || null };
}

export async function guardarTierlistPublico(usuario, { jugadores, equipos } = {}) {
  const c = candidatos();
  const antes = listas.get(usuario.id);
  const nueva = { nombre: usuario.nombre || antes?.nombre || '', jugadores: limpiar(jugadores, c.jugadores), equipos: limpiar(equipos, c.equipos), fecha: new Date().toISOString() };
  listas.set(usuario.id, nueva);
  try { await volcar(); }
  catch (e) { if (antes) listas.set(usuario.id, antes); else listas.delete(usuario.id); throw e; }
  return tierlistDe(usuario);
}
