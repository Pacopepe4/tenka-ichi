// Fantasy de Tenka Ichi: cada coleccionista alinea una carta por rol y suma los puntos que hacen
// esos jugadores en las partidas reales. Además puede llevar hasta 2 cartas BOOST, cada una vinculada a uno de sus
// jugadores (uno solo por jugador): si ese jugador cumple la condición de la BOOST en la partida («el que más daño
// hace», etc.), sus puntos de esa partida se multiplican.
// - Estadísticas: el staff guarda en el panel las de cada partida (pestaña «Estadisticas»): el KDA, el farmeo,
//   la visión y el MVP, que el puente rellena solos al terminar, y el daño de la pantalla final. Los puntos
//   salen de server/puntuacion.js.
// - Alineaciones: cada cambio queda registrado con su fecha (pestaña «Alineaciones»).
// - Una partida puntúa a la alineación que cada coleccionista tenía cuando se guardaron sus estadísticas.
//   Para que nadie cambie a un jugador sabiendo el resultado, el staff cierra las alineaciones durante la jornada.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROLES } from './clanes.js';
import { vistaTierlist } from './tierlist.js';
import { estadoUsuario, catalogo } from './gacha.js';
import { ajuste, guardarAjustes } from './ajustes.js';
import { hojaActiva, asegurarPestana, leer, anadir, escribir } from './sheets.js';
import { CARPETA_DATOS } from './datos.js';
import { puntuar, participacion, cumpleCondicion, reglasLegibles } from './puntuacion.js';

const CARPETA = CARPETA_DATOS;
// Las columnas nuevas van al final, para que las filas guardadas antes se sigan leyendo igual
const EST = { pestana: 'Estadisticas', archivo: path.join(CARPETA, 'estadisticas.json'),
  cabecera: ['Fecha', 'Partida', 'Jornada', 'Fase', 'Clan', 'Rol', 'Jugador', 'Id', 'Victoria', 'Asesinatos', 'Muertes', 'Asistencias', 'MVP', 'Puntos',
    'Farmeo', 'Visión', 'Daño', 'Primera sangre', 'Triples', 'Cuádruples', 'Pentakills', 'Torres', 'Participación', 'Fuente', 'Desglose', 'Daño a torres'] };
const ALI = { pestana: 'Alineaciones', archivo: path.join(CARPETA, 'alineaciones.json'),
  cabecera: ['Fecha', 'ID de usuario', 'Usuario', ...ROLES, 'Boost 1', 'Vinculada 1', 'Boost 2', 'Vinculada 2'] };
export const BOOSTS_POR_ALINEACION = 2;
const sinBoosts = () => Array(BOOSTS_POR_ALINEACION).fill(null);

let estadisticas = [];   // una fila por jugador y partida
let alineaciones = [];   // cambios de alineación
let calculo = null;      // resultados cacheados

export const puntosDeFila = f => puntuar(f).total;
// Las filas de estadísticas (una por jugador y partida) y los puntos de cada jugador, para las fichas y el postdraft
export const estadisticasFantasy = () => estadisticas;
export const puntosDeJugadores = () => calcular().jugadores;

// Números de una fila: vacío es «no se sabe» (null), salvo el KDA, que siempre se apunta
const numero = (v, maximo = 99) => Math.max(0, Math.min(maximo, Math.round(Number(v) || 0)));
const opcional = (v, maximo) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : numero(v, maximo));
const siNo = v => (v == null || v === '' ? null : v === true || v === '1' || v === 1);
const LIMITES = { cs: 2000, vision: 500, dano: 500000, danoTorres: 200000, triples: 20, quadras: 20, pentas: 20, torres: 11, kp: 100 };

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
      victoria: f[8] === '1', k: Number(f[9]) || 0, d: Number(f[10]) || 0, a: Number(f[11]) || 0, mvp: f[12] === '1',
      cs: opcional(f[14], LIMITES.cs), vision: opcional(f[15], LIMITES.vision), dano: opcional(f[16], LIMITES.dano), primeraSangre: siNo(f[17]),
      triples: opcional(f[18], LIMITES.triples), quadras: opcional(f[19], LIMITES.quadras), pentas: opcional(f[20], LIMITES.pentas),
      torres: opcional(f[21], LIMITES.torres), kp: opcional(f[22], LIMITES.kp), fuente: f[23] || '', danoTorres: opcional(f[25], LIMITES.danoTorres) }));
    alineaciones = await leerTabla(ALI, f => ({ fecha: f[0], id: f[1], usuario: f[2], slots: { ...Object.fromEntries(ROLES.map((r, i) => [r, f[3 + i] || null])), boosts: boostsDeFila(f) } }));
  } catch (e) {
    console.error('No se pudo leer el fantasy:', e.message);
  }
  calculo = null;
}

// Las dos BOOST van en las columnas siguientes a los roles: la carta y el rol del jugador al que se vinculan
const boostsDeFila = f => Array.from({ length: BOOSTS_POR_ALINEACION }, (_, i) => {
  const carta = f[3 + ROLES.length + 2 * i], rol = f[4 + ROLES.length + 2 * i];
  return carta && ROLES.includes(rol) ? { carta, rol } : null;
});

const vacio = v => (v == null ? '' : v);
const filaEst = f => {
  const p = puntuar(f);
  return [f.fecha, f.partida, f.jornada, f.fase, f.clan, f.rol, f.jugador, f.id, f.victoria ? '1' : '0', f.k, f.d, f.a, f.mvp ? '1' : '0', p.total,
    vacio(f.cs), vacio(f.vision), vacio(f.dano), f.primeraSangre == null ? '' : f.primeraSangre ? '1' : '0',
    vacio(f.triples), vacio(f.quadras), vacio(f.pentas), vacio(f.torres), vacio(f.kp), f.fuente || '',
    p.desglose.map(d => `${d.texto} ${d.puntos > 0 ? '+' : '−'}${Math.abs(d.puntos).toLocaleString('es-ES')}`).join(' · '), vacio(f.danoTorres)];
};

async function guardarEstadisticasTodas() {
  if (hojaActiva()) { await asegurarPestana(EST.pestana, EST.cabecera); await escribir(EST.pestana, [EST.cabecera, ...estadisticas.map(filaEst)]); }
  else { await mkdir(CARPETA, { recursive: true }); await writeFile(EST.archivo, JSON.stringify(estadisticas)); }
}

// ---------- estadísticas de una partida (desde el panel) ----------
// Si ya había estadísticas de esa partida se corrigen, pero se conserva su fecha: así puntúa la misma alineación.
// La participación en asesinatos se calcula aquí con el KDA de los cinco del mismo equipo.
export function limpiarFilas(filas) {
  const limpias = filas.map(f => ({
    jornada: f.jornada, fase: f.fase, clan: f.clan, rol: f.rol, jugador: f.jugador || '', id: f.id,
    victoria: Boolean(f.victoria), mvp: Boolean(f.mvp), k: numero(f.k), d: numero(f.d), a: numero(f.a),
    cs: opcional(f.cs, LIMITES.cs), vision: opcional(f.vision, LIMITES.vision), dano: opcional(f.dano, LIMITES.dano),
    danoTorres: opcional(f.danoTorres, LIMITES.danoTorres), primeraSangre: siNo(f.primeraSangre), triples: opcional(f.triples, LIMITES.triples), quadras: opcional(f.quadras, LIMITES.quadras),
    pentas: opcional(f.pentas, LIMITES.pentas), torres: opcional(f.torres, LIMITES.torres), fuente: f.fuente === 'puente' ? 'puente' : 'a mano',
  }));
  for (const f of limpias) {
    const equipo = limpias.filter(x => x.clan === f.clan).reduce((s, x) => s + x.k, 0);
    f.kp = participacion(f.k, f.a, equipo);
  }
  return limpias;
}

export async function guardarEstadisticas(partida, filas) {
  const previa = estadisticas.find(f => f.partida === partida);
  const fecha = previa?.fecha || new Date().toISOString();
  const limpias = limpiarFilas(filas).map(f => ({ ...f, fecha, partida }));
  estadisticas = estadisticas.filter(f => f.partida !== partida).concat(limpias);
  calculo = null;
  await guardarEstadisticasTodas();
  return limpias.map(f => ({ id: f.id, jugador: f.jugador, ...puntuar(f) })).map(({ total, ...r }) => ({ ...r, puntos: total }));
}

// ---------- alineaciones ----------
export const alineacionesCerradas = () => ajuste('fantasy_cerrado') === '1';
export const cerrarAlineaciones = cerrado => guardarAjustes({ fantasy_cerrado: cerrado ? '1' : '0' });

// Las alineaciones guardadas antes de las BOOST no tienen la clave boosts
function alineacionEn(id, fecha = null) {
  let actual = null;
  for (const e of alineaciones) if (e.id === id && (!fecha || e.fecha <= fecha)) actual = e.slots;
  return actual && { ...actual, boosts: actual.boosts || sinBoosts() };
}

// Hasta 2 BOOST, cada una vinculada a un jugador ya alineado, y un jugador solo lleva una. Se pueden usar tantas copias
// de una misma BOOST como se tengan
function validarBoosts(pedidas, limpia, mias) {
  if (pedidas != null && (!Array.isArray(pedidas) || pedidas.length > BOOSTS_POR_ALINEACION)) {
    throw new Error(`Una alineación lleva como máximo ${BOOSTS_POR_ALINEACION} BOOST`);
  }
  const boosts = new Map(catalogo().filter(x => x.tipo === 'boost').map(x => [x.id, x]));
  const usadas = new Map(), vinculados = new Set();
  return Array.from({ length: BOOSTS_POR_ALINEACION }, (_, i) => {
    const b = pedidas?.[i];
    if (!b?.carta) return null;
    const boost = boosts.get(b.carta);
    if (!boost) throw new Error('Esa carta no es una BOOST');
    if (!mias.get(b.carta)) throw new Error('Solo puedes usar BOOST que tengas');
    if ((usadas.get(b.carta) || 0) >= mias.get(b.carta)) throw new Error(`Solo tienes una copia de ${boost.nombre}`);
    if (!ROLES.includes(b.rol) || !limpia[b.rol]) throw new Error(`${boost.nombre} tiene que ir con un jugador alineado`);
    if (vinculados.has(b.rol)) throw new Error('Un jugador solo puede llevar una BOOST');
    usadas.set(b.carta, (usadas.get(b.carta) || 0) + 1);
    vinculados.add(b.rol);
    return { carta: b.carta, rol: b.rol };
  });
}

export async function cambiarAlineacion(u, slots) {
  if (alineacionesCerradas()) throw new Error('Las alineaciones están cerradas mientras se juega la jornada');
  const mias = new Map(estadoUsuario(u.id).cartas.map(c => [c.id, c.cantidad]));
  // En los huecos de rol solo van cartas de Jugador (las BOOST no tienen rol y se vinculan aparte)
  const rolDe = new Map(vistaTierlist().jugadores.map(j => [j.id, j.rol]));
  const limpia = {};
  for (const rol of ROLES) {
    const carta = slots?.[rol] || null;
    if (carta && rolDe.get(carta) !== rol) throw new Error(`Esa carta no es de ${rol}`);
    if (carta && !mias.get(carta)) throw new Error('Solo puedes alinear cartas que tengas');
    limpia[rol] = carta;
  }
  limpia.boosts = validarBoosts(slots?.boosts, limpia, mias);
  const e = { fecha: new Date().toISOString(), id: u.id, usuario: u.nombre, slots: limpia };
  alineaciones.push(e);
  calculo = null;
  const fila = [e.fecha, e.id, e.usuario, ...ROLES.map(r => limpia[r] || ''), ...limpia.boosts.flatMap(b => [b?.carta || '', b?.rol || ''])];
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
    const p = partidas.get(f.partida) || partidas.set(f.partida, { fecha: f.fecha, jornada: f.jornada, puntos: new Map(), filas: [] }).get(f.partida);
    p.puntos.set(f.id, puntosDeFila(f));
    p.filas.push(f);
  }
  // Puntos de cada jugador de la liga
  const jugadores = new Map();
  for (const f of estadisticas) {
    const j = jugadores.get(f.id) || jugadores.set(f.id, { puntos: 0, partidas: 0 }).get(f.id);
    j.puntos += puntosDeFila(f); j.partidas += 1;
  }
  // Puntos de cada coleccionista: por cada partida, su alineación de ese momento
  const coleccionistas = new Map();
  const boosts = new Map(catalogo().filter(x => x.tipo === 'boost').map(x => [x.id, x]));
  const ids = new Set(alineaciones.map(e => e.id));
  const jornadas = [...new Set([...partidas.values()].map(p => p.jornada))];
  for (const id of ids) {
    const c = { id, nombre: alineaciones.filter(e => e.id === id).at(-1).usuario, puntos: 0, puntosBoost: 0, porJornada: {} };
    for (const p of partidas.values()) {
      const slots = alineacionEn(id, p.fecha);
      if (!slots) continue;
      let suma = ROLES.reduce((s, r) => s + (slots[r] ? p.puntos.get(slots[r]) || 0 : 0), 0);
      // El bonus de una BOOST son los puntos de su jugador multiplicados (solo si sumó, para que nunca reste)
      for (const b of slots.boosts) {
        const bonus = b && boosts.get(b.carta)?.bonus, jugador = b && slots[b.rol];
        const fila = jugador && p.filas.find(x => x.id === jugador);
        if (!bonus || !fila || !cumpleCondicion(bonus.condicion, fila, p.filas)) continue;
        const extra = Math.max(0, p.puntos.get(jugador) || 0) * (bonus.multiplicador - 1);
        suma += extra;
        c.puntosBoost += extra;
      }
      c.puntos += suma;
      c.porJornada[p.jornada] = (c.porJornada[p.jornada] || 0) + suma;
    }
    coleccionistas.set(id, c);
  }
  const clasificacion = [...coleccionistas.values()].sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));
  calculo = { jugadores, clasificacion, jornadas };
  return calculo;
}

// Clasificación de una jornada: lo que ha sumado en ella cada coleccionista que tenía alineación. Los empates se
// deshacen por los puntos de toda la liga y, si siguen, por orden alfabético
export function clasificacionJornada(jornada) {
  return calcular().clasificacion.filter(c => jornada in c.porJornada)
    .map(c => ({ id: c.id, nombre: c.nombre, puntos: c.porJornada[jornada], total: c.puntos }))
    .sort((a, b) => b.puntos - a.puntos || b.total - a.total || a.nombre.localeCompare(b.nombre))
    .map((c, i) => ({ puesto: i + 1, ...c }));
}
export const jornadasFantasy = () => calcular().jornadas;

export function infoFantasy(u) {
  const { jugadores, clasificacion, jornadas } = calcular();
  const ultima = jornadas.at(-1) || null;
  const puesto = u ? clasificacion.findIndex(c => c.id === u.id) : -1;
  return {
    reglas: reglasLegibles(), cerrado: alineacionesCerradas(), ultimaJornada: ultima, jornadas, boostsMaximos: BOOSTS_POR_ALINEACION,
    jugadores: vistaTierlist().jugadores.filter(j => j.nombre)
      .map(j => ({ id: j.id, clan: j.clan, rol: j.rol, nombre: j.nombre, tier: j.tier, puntos: jugadores.get(j.id)?.puntos || 0, partidas: jugadores.get(j.id)?.partidas || 0 }))
      .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)),
    clasificacion: clasificacion.slice(0, 50).map((c, i) => ({ puesto: i + 1, nombre: c.nombre, puntos: c.puntos, ultima: ultima ? c.porJornada[ultima] || 0 : 0,
      porJornada: c.porJornada, yo: u ? c.id === u.id : false })),
    yo: u ? { alineacion: alineacionEn(u.id) || { ...Object.fromEntries(ROLES.map(r => [r, null])), boosts: sinBoosts() },
      puntos: puesto >= 0 ? clasificacion[puesto].puntos : 0, puntosBoost: puesto >= 0 ? clasificacion[puesto].puntosBoost : 0, puesto: puesto >= 0 ? puesto + 1 : null } : null,
  };
}
