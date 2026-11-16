// Contexto que ve Sonnet en cada turno de la conversación (pc1/ia.js). Compacto, en JSON y en segundos de partida.
// No repite lo que ya está en la conversación: de las jugadas solo van las nuevas o las que han cambiado desde el
// último turno; el resto es un estado corto (reloj, marcador, CS, objetivos, ratos tranquilos y lo programado).
import { ventana, ratosTranquilos } from './ia-limites.js';

const NOMBRES_OBJETIVO = { DragonKill: 'dragón', BaronKill: 'Barón', HeraldKill: 'heraldo', HordeKill: 'larvas', AtakhanKill: 'Atakhan', DragonSoul: 'alma', TurretKilled: 'torre', InhibKilled: 'inhibidor' };
const LADO = { ORDER: 'azul', CHAOS: 'rojo', azul: 'azul', rojo: 'rojo' };
const r0 = x => Math.round(x);

export function equipos(jugadores = []) {
  const de = eq => jugadores.filter(j => j.equipo === eq).map(j => ({ campeon: j.campeon, jugador: j.jugador, posicion: j.posicion || null }));
  return { azul: de('azul'), rojo: de('rojo') };
}

// Asesinatos y objetivos de cada equipo hasta el segundo «hasta»
export function marcadorCorto(cerebro, jugadores, hasta = Infinity) {
  const m = { azul: { asesinatos: 0, objetivos: [] }, rojo: { asesinatos: 0, objetivos: [] } };
  const eq = c => jugadores.find(j => j.campeon === c)?.equipo || null;
  const vistos = new Set();
  for (const j of cerebro.jugadas) for (const e of j.eventos) {
    if (e.t > hasta || (e.id && vistos.has(e.id))) continue;
    if (e.id) vistos.add(e.id);
    if (e.nombre === 'ChampionKill') { const lado = eq(e.asesino) || ({ azul: 'rojo', rojo: 'azul' })[eq(e.victima)]; if (m[lado]) m[lado].asesinatos++; }
    else if (NOMBRES_OBJETIVO[e.nombre] && m[eq(e.asesino)]) m[eq(e.asesino)].objetivos.push(`${NOMBRES_OBJETIVO[e.nombre]} ${r0(e.t)}`);
  }
  return m;
}

// CS de cada equipo en el segundo t (el oro no llega al PC 1: el espectador no lo da)
export function csEquipos(cs, t) {
  if (!cs?.jugadores) return null;
  const r = { azul: 0, rojo: 0 };
  for (const h of cs.jugadores()) {
    const lado = LADO[h.equipo] || LADO[String(h.equipo).toUpperCase()];
    const p = h.cs.filter(x => x[0] <= t).at(-1);
    if (lado && p) r[lado] += p[1];
  }
  return { ...r, diferencia: r.azul - r.rojo };
}

// Objetivos vistos (con su equipo) y dragones de cada uno, para tiempos y almas
export function objetivos(cerebro, jugadores) {
  const eq = c => jugadores.find(j => j.campeon === c)?.equipo || null;
  const r = { dragones: { azul: 0, rojo: 0 }, vistos: [] };
  const vistos = new Set();
  for (const j of cerebro.jugadas) for (const e of j.eventos) {
    if (!['DragonKill', 'BaronKill', 'HeraldKill', 'HordeKill', 'AtakhanKill', 'DragonSoul'].includes(e.nombre) || vistos.has(e.id)) continue;
    vistos.add(e.id);
    const lado = eq(e.asesino);
    if (e.nombre === 'DragonKill' && r.dragones[lado] !== undefined) r.dragones[lado]++;
    r.vistos.push([r0(e.t), NOMBRES_OBJETIVO[e.nombre], lado]);
  }
  return r;
}

function estadoJugada(j, tA) {
  if (tA !== null && j.fin <= tA) return 'emitida';
  if (tA !== null && j.inicio <= tA) return 'en antena';
  return 'por emitir';
}

function jugadaCorta(j, tA) {
  return {
    id: j.id, tipo: j.tipo, desde: r0(j.inicio), hasta: r0(j.fin), estado: estadoJugada(j, tA), muertes: j.muertes,
    objetivos: j.objetivos.map(o => NOMBRES_OBJETIVO[o] || o), campeones: Object.keys(j.campeones),
    sucesos: j.eventos.slice(0, 10).map(e => `${r0(e.t)} ${e.nombre}${e.asesino ? ' ' + e.asesino : ''}${e.victima ? '>' + e.victima : ''}`),
    repeticion: j.repeticion || (j.repetir ? 'pendiente' : 'no'),
  };
}

// Lo programado por emitir: grafismos, repeticiones, recorridos, visión y planos de cámara de la IA
export function programado(cerebro, desde) {
  const r = [];
  for (const a of cerebro.acciones) if (a.t + (a.segundos || 0) > desde) r.push([r0(a.t), a.tipo + (a.campeon ? ' ' + a.campeon : '') + (a.jugada ? ' ' + a.jugada : ''), a.segundos, a.ia ? 'tuyo' : 'reglas']);
  for (const v of cerebro.visiones || []) if (v.t > desde) r.push([r0(v.t), 'vision', 2 * (v.segundos || 2), 'reglas']);
  for (const x of cerebro.recorridos || []) if (x.t > desde) r.push([r0(x.t), 'recorrido', x.segundos, 'reglas']);
  for (const p of cerebro.propuestasIa || []) if (p.hasta > desde) r.push([r0(p.desde), 'camara ' + p.jugador.campeon, r0(p.hasta - p.desde), 'tuyo']);
  return r.sort((a, b) => a[0] - b[0]);
}

// enviadas: Map id → firma de lo que ya se contó de cada jugada (se actualiza solo si el turno sale bien)
export function contextoTurno({ cerebro, jugadores = [], tA, tD, reglas, limites, enviadas, primera = false, fase = null, cs = null, final = false }) {
  const v = ventana({ tA, tD, reglas, finPartida: cerebro.finPartida }, limites.L);
  const nuevas = [], cambiadas = [], firmas = new Map();
  for (const j of cerebro.jugadas) {
    const c = jugadaCorta(j, tA);
    const firma = JSON.stringify(c);
    if (enviadas.get(j.id) === firma) continue;
    // Las ya emitidas hace rato que no cambian no hace falta contarlas otra vez
    (enviadas.has(j.id) ? cambiadas : nuevas).push(c);
    firmas.set(j.id, firma);
  }
  const rachas = [...cerebro.rachas.entries()].filter(([, n]) => n >= 2).map(([campeon, n]) => [campeon, n]);
  const datos = {
    ...(primera ? { equipos: equipos(jugadores) } : {}),
    reloj: { antena: tA === null ? null : r0(tA), sabido: tD === null ? null : r0(tD), programable: [Math.ceil(v.desde), Math.floor(v.hasta)], ...(cerebro.finPartida !== null ? { fin: r0(cerebro.finPartida) } : {}) },
    ...(fase ? { fase } : {}),
    marcador: { antena: marcadorCorto(cerebro, jugadores, tA ?? 0), real: marcadorCorto(cerebro, jugadores, tD ?? Infinity) },
    cs: csEquipos(cs, tD ?? 0),
    objetivos: objetivos(cerebro, jugadores),
    rachas,
    jugadasNuevas: nuevas,
    ...(cambiadas.length ? { jugadasCambiadas: cambiadas } : {}),
    ratosTranquilos: final ? [] : ratosTranquilos(cerebro, Math.max(v.desde, 0), v.hasta, { colchon: limites.L.colchonSegundos }),
    programado: programado(cerebro, tA ?? 0),
    cupo: limites.cupos(v.desde),
  };
  return { datos, firmas };
}
