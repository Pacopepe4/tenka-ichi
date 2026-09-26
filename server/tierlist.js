// Tier list de jugadores y de equipos (S, A, B, C, D), puesta a mano por el staff desde el panel.
// La tier de cada jugador es también la rareza de su carta en el gachapon.
// Se guarda en la pestaña «Tierlist» de Google Sheets; en local, en data/tierlist.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLANES, ROLES } from './clanes.js';
import { plantilla } from './plantillas.js';
import { hojaActiva, asegurarPestana, leer, escribir } from './sheets.js';

export const TIERS = ['S', 'A', 'B', 'C', 'D'];
const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tierlist.json');
const PESTANA = 'Tierlist';
const CABECERA = ['Tipo', 'Id', 'Nombre', 'Clan', 'Rol', 'Tier'];

// Mapas id → tier. Los jugadores se identifican por su puesto: CLAN-ROL (p. ej. KAIJU-TOP)
let jugadores = {}, equipos = {};

const clanesLiga = () => CLANES.filter(c => !c.invitado);

export async function cargarTierlist() {
  try {
    if (hojaActiva()) {
      await asegurarPestana(PESTANA, CABECERA);
      jugadores = {}; equipos = {};
      for (const [tipo, id, , , , tier] of (await leer(PESTANA)).slice(1)) {
        if (!TIERS.includes(tier)) continue;
        if (tipo === 'Jugador') jugadores[id] = tier; else if (tipo === 'Equipo') equipos[id] = tier;
      }
    } else {
      ({ jugadores = {}, equipos = {} } = JSON.parse(await readFile(ARCHIVO, 'utf8')));
    }
  } catch (e) {
    if (hojaActiva()) console.error('No se pudo leer la tier list:', e.message);
  }
}

export function vistaTierlist() {
  const lista = [];
  for (const c of clanesLiga()) {
    const p = plantilla(c.id);
    ROLES.forEach((rol, i) => {
      const id = `${c.id}-${rol}`;
      lista.push({ id, clan: c.id, rol, nombre: p?.jugadores?.[i] || '', tier: jugadores[id] || null });
    });
  }
  return {
    jugadores: lista,
    equipos: clanesLiga().map(c => ({ id: c.id, nombre: c.nombre, tier: equipos[c.id] || null })),
  };
}

export const tierDeJugador = id => jugadores[id] || null;

// Guardado con una pequeña espera: si el staff cambia varias tiers seguidas, se escribe una sola vez
let pendiente = null;
function guardar() {
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    const v = vistaTierlist();
    const filas = [CABECERA,
      ...v.equipos.filter(e => e.tier).map(e => ['Equipo', e.id, e.nombre, e.id, '', e.tier]),
      ...v.jugadores.filter(j => j.tier).map(j => ['Jugador', j.id, j.nombre, j.clan, j.rol, j.tier])];
    try {
      if (hojaActiva()) { await asegurarPestana(PESTANA, CABECERA); await escribir(PESTANA, filas); }
      else { await mkdir(path.dirname(ARCHIVO), { recursive: true }); await writeFile(ARCHIVO, JSON.stringify({ jugadores, equipos }, null, 1)); }
    } catch (e) { console.error('No se pudo guardar la tier list:', e.message); }
  }, 1500);
}

export function ponerTier(tipo, id, tier) {
  const mapa = tipo === 'equipo' ? equipos : jugadores;
  const valido = tipo === 'equipo' ? clanesLiga().some(c => c.id === id) : vistaTierlist().jugadores.some(j => j.id === id);
  if (!valido) throw new Error(`No existe ${tipo === 'equipo' ? 'el equipo' : 'el jugador'} ${id}`);
  if (tier && !TIERS.includes(tier)) throw new Error(`Tier no válida: ${tier}`);
  if (tier) mapa[id] = tier; else delete mapa[id];
  guardar();
}
