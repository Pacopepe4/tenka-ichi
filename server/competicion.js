// Formato de TENKA ICHI (las fechas y los clanes de la temporada están en formato.js)
// - Liguilla: 6 clanes en un grupo, Bo1, 4 jornadas de 3 partidas; cada clan juega contra 4 de sus 5 rivales,
//   sorteados sin repetir.
// - Clasificación: victorias; desempate por enfrentamiento directo (si empatan dos), fuerza de
//   calendario (suma de victorias de los rivales) y, si el empate cae en el corte de la última plaza, un Bo1
//   de desempate; en el resto de puestos, sorteo con la semilla. Con 6 plazas para 6 clanes no hay corte: la
//   clasificación solo decide el cuadro.
// - Playoffs Bo3 fearless, los 6 clanes con cuadro fijo: el 1.º y el 2.º se saltan los cuartos (4-5 y 3-6);
//   en semifinales el 1.º juega contra el ganador del 4-5 y el 2.º contra el del 3-6.
//   El mejor clasificado elige lado en la partida 1; en las siguientes elige quien perdió la anterior.
import { TEMPORADA } from './formato.js';

export const FASE_LIGA = 'Fase de liga';
export const FASE_DESEMPATE = 'Desempate';
export const FASE_FINAL = 'Fase final';
export const JORNADAS = TEMPORADA.liguilla.length;
export const PLAZAS_PLAYOFFS = 6;

// Generador pseudoaleatorio con semilla (mulberry32): el mismo número da el mismo sorteo
export function azar(semilla) {
  let a = Number(semilla) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function barajar(lista, rnd) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Sorteo del calendario ----------
// Método del círculo: genera todas las rondas de un todos-contra-todos y se quedan 5 al azar,
// así cada clan juega una vez por jornada y nunca repite rival.
export function sortear(participantes, semilla) {
  if (participantes.length % 2) throw new Error('Hace falta un número par de clanes');
  const rnd = azar(semilla);
  const equipos = barajar(participantes, rnd);
  const n = equipos.length;
  const rondas = [];
  let rot = [...equipos];
  for (let r = 0; r < n - 1; r++) {
    rondas.push(Array.from({ length: n / 2 }, (_, i) => [rot[i], rot[n - 1 - i]]));
    rot = [rot[0], rot[n - 1], ...rot.slice(1, n - 1)];
  }
  const elegidas = barajar(rondas, rnd).slice(0, Math.min(JORNADAS, n - 1));

  // Lados equilibrados: azul para quien lleve menos partidas en azul
  const azules = Object.fromEntries(equipos.map(e => [e, 0]));
  const jornadas = elegidas.map((ronda, j) => barajar(ronda, rnd).map(([a, b], k) => {
    let azul = a, rojo = b;
    if (azules[b] < azules[a] || (azules[b] === azules[a] && rnd() < 0.5)) { azul = b; rojo = a; }
    azules[azul]++;
    return { id: `J${j + 1}-${k + 1}`, jornada: j + 1, azul, rojo };
  }));

  return { semilla: Number(semilla), participantes: [...participantes], jornadas };
}

const mismaPareja = (p, a, b) => (p.clanAzul === a && p.clanRojo === b) || (p.clanAzul === b && p.clanRojo === a);
const ganadorDe = p => (p.ganador === 'azul' ? p.clanAzul : p.clanRojo);

// Asocia cada partida de la liguilla con su cruce del calendario (la última registrada manda)
export function resultadosLiga(calendario, partidas) {
  const res = {};
  const deLiga = partidas.filter(p => p.fase === FASE_LIGA);
  for (const cruce of calendario.jornadas.flat()) {
    const jugada = deLiga.filter(p => mismaPareja(p, cruce.azul, cruce.rojo)).at(-1);
    if (jugada) res[cruce.id] = { ganador: ganadorDe(jugada), azul: jugada.clanAzul, rojo: jugada.clanRojo, fecha: jugada.fecha };
  }
  return res;
}

// ---------- Clasificación ----------
export function clasificacion(calendario, partidas) {
  const res = resultadosLiga(calendario, partidas);
  const filas = Object.fromEntries(calendario.participantes.map(c => [c, { clan: c, jugadas: 0, victorias: 0, derrotas: 0, rivales: [], ganados: [] }]));
  for (const cruce of calendario.jornadas.flat()) {
    const r = res[cruce.id];
    if (!r) continue;
    const perdedor = r.ganador === cruce.azul ? cruce.rojo : cruce.azul;
    for (const [c, rival] of [[cruce.azul, cruce.rojo], [cruce.rojo, cruce.azul]]) {
      filas[c].jugadas++;
      filas[c].rivales.push(rival);
    }
    filas[r.ganador].victorias++;
    filas[r.ganador].ganados.push(perdedor);
    filas[perdedor].derrotas++;
  }
  for (const f of Object.values(filas)) f.fuerza = f.rivales.reduce((s, r) => s + filas[r].victorias, 0);

  const total = calendario.jornadas.flat().length;
  const completa = Object.keys(res).length === total;
  const rnd = azar(calendario.semilla + 7);
  const sorteoFijo = Object.fromEntries(barajar(calendario.participantes, rnd).map((c, i) => [c, i]));

  // Orden: victorias; dentro de cada empate, directo (si son dos), fuerza, sorteo
  const grupos = {};
  for (const f of Object.values(filas)) (grupos[f.victorias] ??= []).push(f);
  const orden = [];
  for (const v of Object.keys(grupos).map(Number).sort((a, b) => b - a)) {
    const g = grupos[v];
    if (g.length === 2 && g[0].ganados.includes(g[1].clan)) { orden.push(g[0], g[1]); g[0].criterio = g[1].criterio = 'directo'; continue; }
    if (g.length === 2 && g[1].ganados.includes(g[0].clan)) { orden.push(g[1], g[0]); g[0].criterio = g[1].criterio = 'directo'; continue; }
    g.sort((a, b) => b.fuerza - a.fuerza || sorteoFijo[a.clan] - sorteoFijo[b.clan]);
    if (g.length > 1) for (const f of g) f.criterio = g.filter(o => o.fuerza === f.fuerza).length > 1 ? 'sorteo' : 'fuerza';
    orden.push(...g);
  }

  // Corte de la última plaza: si el último que entra y el primero que se queda fuera siguen empatados tras la
  // fuerza, se juega un desempate (con tantas plazas como clanes no hay nadie fuera y no se juega nunca)
  let desempate = null;
  const ultimo = orden[PLAZAS_PLAYOFFS - 1], primeroFuera = orden[PLAZAS_PLAYOFFS];
  if (completa && ultimo && primeroFuera && ultimo.victorias === primeroFuera.victorias && ultimo.fuerza === primeroFuera.fuerza && ultimo.criterio === 'sorteo') {
    const jugado = partidas.filter(p => p.fase === FASE_DESEMPATE && mismaPareja(p, ultimo.clan, primeroFuera.clan)).at(-1);
    desempate = { clanes: [ultimo.clan, primeroFuera.clan], ganador: jugado ? ganadorDe(jugado) : null };
    if (jugado && ganadorDe(jugado) === primeroFuera.clan) [orden[PLAZAS_PLAYOFFS - 1], orden[PLAZAS_PLAYOFFS]] = [primeroFuera, ultimo];
    ultimo.criterio = primeroFuera.criterio = 'desempate';
  }

  orden.forEach((f, i) => { f.puesto = i + 1; f.playoffs = i < PLAZAS_PLAYOFFS; });
  return { filas: orden, completa, jugadas: Object.keys(res).length, total, resultados: res, desempate, plazas: PLAZAS_PLAYOFFS };
}

// ---------- Cuadro de playoffs ----------
const RONDAS = { cuartos: 'Cuartos de final', semis: 'Semifinales', final: 'Final' };

function serie(id, ronda, a, b, puestos, partidas) {
  const fecha = TEMPORADA.playoffs[ronda];
  if (!a || !b) {
    // Aún falta un clan (el ganador de la serie anterior), pero el otro ya sabe su puesto
    return { id, ronda: RONDAS[ronda], fecha, alto: a || null, bajo: b || null, puestos: Object.fromEntries([a, b].filter(Boolean).map(c => [c, puestos[c]])),
      victorias: {}, partidas: [], ganador: null };
  }
  const [alto, bajo] = puestos[a] <= puestos[b] ? [a, b] : [b, a];
  const jugadas = partidas.filter(p => p.fase === FASE_FINAL && mismaPareja(p, alto, bajo))
    .sort((x, y) => (x.fecha || '').localeCompare(y.fecha || '') || x.partida - y.partida);
  const victorias = { [alto]: 0, [bajo]: 0 };
  const lista = [];
  let eligeLado = alto;
  for (const p of jugadas) {
    if (victorias[alto] === 2 || victorias[bajo] === 2) break;
    const g = ganadorDe(p);
    victorias[g]++;
    lista.push({ n: lista.length + 1, azul: p.clanAzul, rojo: p.clanRojo, ganador: g, eligeLado });
    eligeLado = g === alto ? bajo : alto; // elige lado quien perdió
  }
  const ganador = victorias[alto] === 2 ? alto : victorias[bajo] === 2 ? bajo : null;
  return { id, ronda: RONDAS[ronda], fecha, alto, bajo, puestos: { [alto]: puestos[alto], [bajo]: puestos[bajo] }, victorias, partidas: lista,
    ganador, siguiente: ganador ? null : { partida: lista.length + 1, eligeLado } };
}

export function cuadro(clasif, partidas) {
  if (!clasif.completa || (clasif.desempate && !clasif.desempate.ganador)) return null;
  const s = clasif.filas.slice(0, PLAZAS_PLAYOFFS).map(f => f.clan);
  const puestos = Object.fromEntries(clasif.filas.map(f => [f.clan, f.puesto]));
  // El 1.º y el 2.º esperan en semifinales al ganador de su lado: el 4-5 para el 1.º y el 3-6 para el 2.º
  const c = [
    serie('C1', 'cuartos', s[3], s[4], puestos, partidas),
    serie('C2', 'cuartos', s[2], s[5], puestos, partidas),
  ];
  const sf = [
    serie('S1', 'semis', s[0], c[0].ganador, puestos, partidas),
    serie('S2', 'semis', s[1], c[1].ganador, puestos, partidas),
  ];
  const f = serie('F', 'final', sf[0].ganador, sf[1].ganador, puestos, partidas);
  return { cuartos: c, semis: sf, final: f, campeon: f.ganador };
}

// Los clanes y las fechas de la temporada: la web y el panel los enseñan aunque el calendario aún no se haya sorteado
export function formatoTemporada() {
  return {
    clanes: [...TEMPORADA.clanes],
    liguilla: TEMPORADA.liguilla.map((fecha, i) => ({ jornada: i + 1, nombre: `Jornada ${i + 1}`, fecha })),
    playoffs: Object.entries(RONDAS).map(([ronda, nombre]) => ({ ronda, nombre, fecha: TEMPORADA.playoffs[ronda] })),
  };
}

// Resumen completo para la web y el panel
export function competicion(calendario, partidas) {
  const formato = formatoTemporada();
  if (!calendario) return { calendario: null, formato };
  const clasif = clasificacion(calendario, partidas);
  return { calendario, clasificacion: clasif, cuadro: cuadro(clasif, partidas), formato };
}
