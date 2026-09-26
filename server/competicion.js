// Formato de TENKA ICHI
// - Liguilla: 10 clanes en un grupo, Bo1, 5 jornadas de 5 partidas; rivales sorteados sin repetir.
// - Clasificación: victorias; desempate por enfrentamiento directo (si empatan dos), fuerza de
//   calendario (suma de victorias de los rivales) y, si el empate cae en el corte del 8.º, un Bo1
//   de desempate; en el resto de puestos, sorteo con la semilla.
// - Playoffs Bo3 fearless, top 8 con cuadro fijo: 1-8 y 4-5 por un lado, 2-7 y 3-6 por el otro.
//   El mejor clasificado elige lado en la partida 1; en las siguientes elige quien perdió la anterior.
export const FASE_LIGA = 'Fase de liga';
export const FASE_DESEMPATE = 'Desempate';
export const FASE_FINAL = 'Fase final';
export const JORNADAS = 5;
export const PLAZAS_PLAYOFFS = 8;

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

  // Corte del 8.º: si el 8.º y el 9.º siguen empatados tras la fuerza, se juega un desempate
  let desempate = null;
  const n8 = orden[PLAZAS_PLAYOFFS - 1], n9 = orden[PLAZAS_PLAYOFFS];
  if (completa && n8 && n9 && n8.victorias === n9.victorias && n8.fuerza === n9.fuerza && n8.criterio === 'sorteo') {
    const jugado = partidas.filter(p => p.fase === FASE_DESEMPATE && mismaPareja(p, n8.clan, n9.clan)).at(-1);
    desempate = { clanes: [n8.clan, n9.clan], ganador: jugado ? ganadorDe(jugado) : null };
    if (jugado && ganadorDe(jugado) === n9.clan) [orden[PLAZAS_PLAYOFFS - 1], orden[PLAZAS_PLAYOFFS]] = [n9, n8];
    n8.criterio = n9.criterio = 'desempate';
  }

  orden.forEach((f, i) => { f.puesto = i + 1; f.playoffs = i < PLAZAS_PLAYOFFS; });
  return { filas: orden, completa, jugadas: Object.keys(res).length, total, resultados: res, desempate };
}

// ---------- Cuadro de playoffs ----------
const RONDAS = { cuartos: 'Cuartos de final', semis: 'Semifinales', final: 'Final' };

function serie(id, ronda, a, b, puestos, partidas) {
  if (!a || !b) return { id, ronda: RONDAS[ronda], alto: a || null, bajo: b || null, victorias: {}, partidas: [], ganador: null };
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
  return { id, ronda: RONDAS[ronda], alto, bajo, puestos: { [alto]: puestos[alto], [bajo]: puestos[bajo] }, victorias, partidas: lista,
    ganador, siguiente: ganador ? null : { partida: lista.length + 1, eligeLado } };
}

export function cuadro(clasif, partidas) {
  if (!clasif.completa || (clasif.desempate && !clasif.desempate.ganador)) return null;
  const s = clasif.filas.slice(0, PLAZAS_PLAYOFFS).map(f => f.clan);
  const puestos = Object.fromEntries(clasif.filas.map(f => [f.clan, f.puesto]));
  const c = [
    serie('C1', 'cuartos', s[0], s[7], puestos, partidas),
    serie('C2', 'cuartos', s[3], s[4], puestos, partidas),
    serie('C3', 'cuartos', s[1], s[6], puestos, partidas),
    serie('C4', 'cuartos', s[2], s[5], puestos, partidas),
  ];
  const sf = [
    serie('S1', 'semis', c[0].ganador, c[1].ganador, puestos, partidas),
    serie('S2', 'semis', c[2].ganador, c[3].ganador, puestos, partidas),
  ];
  const f = serie('F', 'final', sf[0].ganador, sf[1].ganador, puestos, partidas);
  return { cuartos: c, semis: sf, final: f, campeon: f.ganador };
}

// Resumen completo para la web y el panel
export function competicion(calendario, partidas) {
  if (!calendario) return { calendario: null };
  const clasif = clasificacion(calendario, partidas);
  return { calendario, clasificacion: clasif, cuadro: cuadro(clasif, partidas) };
}
