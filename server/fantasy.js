// Fantasy de Tenka Ichi: cada coleccionista alinea una carta por rol y suma los puntos que hacen
// esos jugadores en las partidas reales.
// - Estadísticas: el staff apunta en el panel el KDA y el MVP de cada partida (pestaña «Estadisticas»).
// - Alineaciones: cada cambio queda registrado con su fecha (pestaña «Alineaciones»).
// - Una partida puntúa a la alineación que cada coleccionista tenía cuando se guardaron sus estadísticas.
//   Para que nadie cambie a un jugador sabiendo el resultado, el staff cierra las alineaciones durante la jornada.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from './clanes.js';
import { vistaTierlist } from './tierlist.js';
import { estadoUsuario } from './gacha.js';
import { ajuste, guardarAjustes } from './ajustes.js';
import { hojaActiva, asegurarPestana, leer, anadir, escribir } from './sheets.js';

export const PUNTOS = { jugar: 1, victoria: 3, asesinato: 1, muerte: -1, asistencia: 0.5, mvp: 3 };

const CARPETA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const EST = { pestana: 'Estadisticas', archivo: path.join(CARPETA, 'estadisticas.json'),
  cabecera: ['Fecha', 'Partida', 'Jornada', 'Fase', 'Clan', 'Rol', 'Jugador', 'Id', 'Victoria', 'Asesinatos', 'Muertes', 'Asistencias', 'MVP', 'Puntos'] };
const ALI = { pestana: 'Alineaciones', archivo: path.join(CARPETA, 'alineaciones.json'),
  cabecera: ['Fecha', 'Twitch ID', 'Usuario', ...ROLES] };

let estadisticas = [];   // una fila por jugador y partida
let alineaciones = [];   // cambios de alineación
let calculo = null;      // resultados cacheados

export const puntosDeFila = f => PUNTOS.jugar + (f.victoria ? PUNTOS.victoria : 0) + f.k * PUNTOS.asesinato
  + f.d * PUNTOS.muerte + f.a * PUNTOS.asistencia + (f.mvp ? PUNTOS.mvp : 0);

const numero = v => Math.max(0, Math.min(99, Math.round(Number(v) || 0)));

// ---------- carga y guardado ----------
async function leerTabla(t, deFila) {
  if (hojaActiva()) {
    await asegurarPestana(t.pestana, t.cabecera);
    return (await leer(t.pestana)).slice(1).filter(f => f[1]).map(deFila);
  }
  try { return JSON.parse(await readFile(t.archivo, 'utf8')); } catch { return []; }
}

export async function cargarFantasy() {
  try {
    estadisticas = await leerTabla(EST, f => ({ fecha: f[0], partida: f[1], jornada: f[2], fase: f[3], clan: f[4], rol: f[5], jugador: f[6], id: f[7],
      victoria: f[8] === '1', k: Number(f[9]) || 0, d: Number(f[10]) || 0, a: Number(f[11]) || 0, mvp: f[12] === '1' }));
    alineaciones = await leerTabla(ALI, f => ({ fecha: f[0], id: f[1], usuario: f[2], slots: Object.fromEntries(ROLES.map((r, i) => [r, f[3 + i] || null])) }));
  } catch (e) {
    console.error('No se pudo leer el fantasy:', e.message);
  }
  calculo = null;
}

const filaEst = f => [f.fecha, f.partida, f.jornada, f.fase, f.clan, f.rol, f.jugador, f.id, f.victoria ? '1' : '0', f.k, f.d, f.a, f.mvp ? '1' : '0', puntosDeFila(f)];

async function guardarEstadisticasTodas() {
  if (hojaActiva()) { await asegurarPestana(EST.pestana, EST.cabecera); await escribir(EST.pestana, [EST.cabecera, ...estadisticas.map(filaEst)]); }
  else { await mkdir(CARPETA, { recursive: true }); await writeFile(EST.archivo, JSON.stringify(estadisticas)); }
}

// ---------- estadísticas de una partida (desde el panel) ----------
// Si ya había estadísticas de esa partida se corrigen, pero se conserva su fecha: así puntúa la misma alineación.
export async function guardarEstadisticas(partida, filas) {
  const previa = estadisticas.find(f => f.partida === partida);
  const fecha = previa?.fecha || new Date().toISOString();
  estadisticas = estadisticas.filter(f => f.partida !== partida)
    .concat(filas.map(f => ({ ...f, fecha, partida, k: numero(f.k), d: numero(f.d), a: numero(f.a) })));
  calculo = null;
  await guardarEstadisticasTodas();
  return filas.map(f => ({ id: f.id, jugador: f.jugador, puntos: puntosDeFila({ ...f, k: numero(f.k), d: numero(f.d), a: numero(f.a) }) }));
}

// ---------- alineaciones ----------
export const alineacionesCerradas = () => ajuste('fantasy_cerrado') === '1';
export const cerrarAlineaciones = cerrado => guardarAjustes({ fantasy_cerrado: cerrado ? '1' : '0' });

function alineacionEn(id, fecha = null) {
  let actual = null;
  for (const e of alineaciones) if (e.id === id && (!fecha || e.fecha <= fecha)) actual = e.slots;
  return actual;
}

export async function cambiarAlineacion(u, slots) {
  if (alineacionesCerradas()) throw new Error('Las alineaciones están cerradas mientras se juega la jornada');
  const mias = new Map(estadoUsuario(u.id).cartas.map(c => [c.id, c.cantidad]));
  const limpia = {};
  for (const rol of ROLES) {
    const carta = slots?.[rol] || null;
    if (carta && !String(carta).endsWith(`-${rol}`)) throw new Error(`Esa carta no es de ${rol}`);
    if (carta && !mias.get(carta)) throw new Error('Solo puedes alinear cartas que tengas');
    limpia[rol] = carta;
  }
  const e = { fecha: new Date().toISOString(), id: u.id, usuario: u.nombre, slots: limpia };
  alineaciones.push(e);
  calculo = null;
  const fila = [e.fecha, e.id, e.usuario, ...ROLES.map(r => limpia[r] || '')];
  if (hojaActiva()) { await asegurarPestana(ALI.pestana, ALI.cabecera); await anadir(ALI.pestana, [fila]); }
  else { await mkdir(CARPETA, { recursive: true }); await writeFile(ALI.archivo, JSON.stringify(alineaciones)); }
  return limpia;
}

// ---------- cálculo de puntos ----------
function calcular() {
  if (calculo) return calculo;
  // Partidas con sus puntos por jugador
  const partidas = new Map();
  for (const f of estadisticas) {
    const p = partidas.get(f.partida) || partidas.set(f.partida, { fecha: f.fecha, jornada: f.jornada, puntos: new Map() }).get(f.partida);
    p.puntos.set(f.id, puntosDeFila(f));
  }
  // Puntos de cada jugador de la liga
  const jugadores = new Map();
  for (const f of estadisticas) {
    const j = jugadores.get(f.id) || jugadores.set(f.id, { puntos: 0, partidas: 0 }).get(f.id);
    j.puntos += puntosDeFila(f); j.partidas += 1;
  }
  // Puntos de cada coleccionista: por cada partida, su alineación de ese momento
  const coleccionistas = new Map();
  const ids = new Set(alineaciones.map(e => e.id));
  const jornadas = [...new Set([...partidas.values()].map(p => p.jornada))];
  for (const id of ids) {
    const c = { id, nombre: alineaciones.filter(e => e.id === id).at(-1).usuario, puntos: 0, porJornada: {} };
    for (const p of partidas.values()) {
      const slots = alineacionEn(id, p.fecha);
      if (!slots) continue;
      const suma = ROLES.reduce((s, r) => s + (slots[r] ? p.puntos.get(slots[r]) || 0 : 0), 0);
      c.puntos += suma;
      c.porJornada[p.jornada] = (c.porJornada[p.jornada] || 0) + suma;
    }
    coleccionistas.set(id, c);
  }
  const clasificacion = [...coleccionistas.values()].sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));
  calculo = { jugadores, clasificacion, jornadas };
  return calculo;
}

export function infoFantasy(u) {
  const { jugadores, clasificacion, jornadas } = calcular();
  const ultima = jornadas.at(-1) || null;
  const puesto = u ? clasificacion.findIndex(c => c.id === u.id) : -1;
  return {
    reglas: PUNTOS, cerrado: alineacionesCerradas(), ultimaJornada: ultima,
    jugadores: vistaTierlist().jugadores.filter(j => j.nombre)
      .map(j => ({ id: j.id, clan: j.clan, rol: j.rol, nombre: j.nombre, tier: j.tier, puntos: jugadores.get(j.id)?.puntos || 0, partidas: jugadores.get(j.id)?.partidas || 0 }))
      .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)),
    clasificacion: clasificacion.slice(0, 50).map((c, i) => ({ puesto: i + 1, nombre: c.nombre, puntos: c.puntos, ultima: ultima ? c.porJornada[ultima] || 0 : 0, yo: u ? c.id === u.id : false })),
    yo: u ? { alineacion: alineacionEn(u.id) || Object.fromEntries(ROLES.map(r => [r, null])), puntos: puesto >= 0 ? clasificacion[puesto].puntos : 0, puesto: puesto >= 0 ? puesto + 1 : null } : null,
  };
}
