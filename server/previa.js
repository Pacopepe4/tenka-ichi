// Estadísticas de cada jugador y de cada clan, para el postdraft del overlay y las fichas de la web:
// lo que lleva cada jugador con el campeón que va a jugar («FIRST PICK» si es la primera vez), sus números de toda
// la liga, su carta y sus puntos del fantasy; y de cada clan, su porcentaje de victorias, su racha y sus medias.
// Las partidas salen del registro (picks, jugadores y ganador) y los números (KDA, farmeo, visión, daño, MVP), de
// las estadísticas del fantasy que guarda el staff: se cruzan por la partida y el puesto (CLAN-ROL).
import { todas } from './registro.js';
import { estadisticasFantasy, puntosDeJugadores } from './fantasy.js';
import { catalogo } from './gacha.js';
import { vistaTierlist } from './tierlist.js';
import { calendarioActual } from './calendario.js';
import { clasificacion } from './competicion.js';
import { CLANES, ROLES } from './clanes.js';
import { plantilla } from './plantillas.js';

const normal = s => String(s || '').trim().toLowerCase();
const decimal = x => Math.round(x * 10) / 10;
const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
// Así llama el panel a cada partida al guardar sus estadísticas (server/index.js, fantasyEstadisticas)
const nombrePartida = p => `${p.jornada}: ${p.clanAzul} vs ${p.clanRojo}, partida ${p.partida}`;
const clanDe = (p, lado) => (lado === 'azul' ? p.clanAzul : p.clanRojo);

// partida → puesto (CLAN-ROL) → fila de estadísticas
function indiceDe(filas) {
  const indice = new Map();
  for (const f of filas) (indice.get(f.partida) || indice.set(f.partida, new Map()).get(f.partida)).set(f.id, f);
  return indice;
}

// Cada partida del registro que ha jugado alguien: con qué campeón, si ganó y, si están guardadas, sus estadísticas.
// Se le reconoce por el nombre; si en esa partida no se apuntó ningún nombre, por el puesto
function actuaciones({ nombre, id }, partidas, indice) {
  const n = normal(nombre), lista = [];
  if (!n) return lista;
  for (const p of partidas) for (const lado of ['azul', 'rojo']) {
    for (let i = 0; i < ROLES.length; i++) {
      const apuntado = normal(p.jugadores?.[lado]?.[i]), puesto = `${clanDe(p, lado)}-${ROLES[i]}`;
      if (apuntado ? apuntado !== n : puesto !== id) continue;
      lista.push({ campeon: p.picks?.[lado]?.[i] || null, victoria: p.ganador === lado, fila: indice.get(nombrePartida(p))?.get(puesto) || null });
    }
  }
  return lista;
}

// De una lista de actuaciones: partidas, victorias y, de las que tienen estadísticas, las medias
function resumir(lista) {
  const conDatos = lista.map(x => x.fila).filter(Boolean);
  const suma = campo => conDatos.reduce((s, f) => s + (Number(f[campo]) || 0), 0);
  const media = campo => {
    const con = conDatos.filter(f => f[campo] != null && f[campo] !== '');
    return con.length ? decimal(con.reduce((s, f) => s + Number(f[campo]), 0) / con.length) : null;
  };
  const partidas = lista.length, victorias = lista.filter(x => x.victoria).length;
  const [k, d, a] = [suma('k'), suma('d'), suma('a')];
  return {
    partidas, victorias, derrotas: partidas - victorias, wr: pct(victorias, partidas),
    conDatos: conDatos.length,
    // KDA medio por partida y la relación (asesinatos + asistencias por muerte)
    kda: conDatos.length ? { k: decimal(k / conDatos.length), d: decimal(d / conDatos.length), a: decimal(a / conDatos.length), ratio: decimal((k + a) / Math.max(1, d)) } : null,
    cs: media('cs'), vision: media('vision'), dano: media('dano'), mvps: conDatos.filter(f => f.mvp).length,
  };
}

function porCampeon(lista) {
  const grupos = new Map();
  for (const x of lista) if (x.campeon) (grupos.get(x.campeon) || grupos.set(x.campeon, []).get(x.campeon)).push(x);
  return [...grupos].map(([id, suyas]) => ({ id, ...resumir(suyas) })).sort((a, b) => b.partidas - a.partidas || b.victorias - a.victorias || a.id.localeCompare(b.id));
}

// ---------- clanes ----------
// Totales de un clan en una partida, sumando a sus cinco jugadores (null si a alguno le falta el dato)
function totalesEquipo(p, lado, indice) {
  const filas = ROLES.map(rol => indice.get(nombrePartida(p))?.get(`${clanDe(p, lado)}-${rol}`)).filter(Boolean);
  if (filas.length < ROLES.length) return null;
  const suma = campo => (filas.every(f => f[campo] != null && f[campo] !== '') ? filas.reduce((s, f) => s + Number(f[campo]), 0) : null);
  return { k: suma('k'), d: suma('d'), a: suma('a'), dano: suma('dano'), vision: suma('vision'), cs: suma('cs'),
    primeraSangre: filas.every(f => f.primeraSangre != null) ? filas.some(f => f.primeraSangre) : null };
}

function resumenClan(clan, partidas, indice, puestos = {}) {
  const suyas = partidas.filter(p => p.clanAzul === clan || p.clanRojo === clan).map(p => ({ p, lado: p.clanAzul === clan ? 'azul' : 'rojo' }));
  const gana = x => x.p.ganador === x.lado;
  const victorias = suyas.filter(gana).length;
  // Racha: los últimos resultados iguales seguidos
  let racha = null;
  for (const x of [...suyas].reverse()) {
    const tipo = gana(x) ? 'V' : 'D';
    if (!racha) racha = { tipo, n: 1 };
    else if (racha.tipo === tipo) racha.n++;
    else break;
  }
  const totales = suyas.map(x => totalesEquipo(x.p, x.lado, indice)).filter(Boolean);
  const media = campo => {
    const con = totales.filter(t => t[campo] != null);
    return con.length ? decimal(con.reduce((s, t) => s + t[campo], 0) / con.length) : null;
  };
  const conSangre = totales.filter(t => t.primeraSangre != null);
  const picks = new Map();
  for (const x of suyas) for (const c of (x.p.picks?.[x.lado] || []).filter(Boolean)) {
    const e = picks.get(c) || picks.set(c, { id: c, partidas: 0, victorias: 0 }).get(c);
    e.partidas++;
    if (gana(x)) e.victorias++;
  }
  const delLado = lado => { const l = suyas.filter(x => x.lado === lado); return { partidas: l.length, victorias: l.filter(gana).length }; };
  return {
    partidas: suyas.length, victorias, derrotas: suyas.length - victorias, wr: pct(victorias, suyas.length), racha, puesto: puestos[clan] || null,
    lados: { azul: delLado('azul'), rojo: delLado('rojo') },
    medias: { conDatos: totales.length, asesinatos: media('k'), muertes: media('d'), asistencias: media('a'), dano: media('dano'), vision: media('vision'), cs: media('cs'),
      primeraSangre: conSangre.length ? pct(conSangre.filter(t => t.primeraSangre).length, conSangre.length) : null },
    campeones: [...picks.values()].sort((a, b) => b.partidas - a.partidas || b.victorias - a.victorias || a.id.localeCompare(b.id)).slice(0, 5),
  };
}

function puestosLiga(partidas) {
  const cal = calendarioActual();
  if (!cal) return {};
  try {
    const c = clasificacion(cal, partidas);
    return c.jugadas ? Object.fromEntries(c.filas.map(f => [f.clan, f.puesto])) : {};
  } catch { return {}; }
}

const fuentes = ({ partidas = todas(), filas = estadisticasFantasy() } = {}) => ({ partidas, indice: indiceDe(filas), puestos: puestosLiga(partidas) });

// ---------- el postdraft del overlay ----------
// e es el estado del panel: los clanes, los jugadores de cada puesto y los picks del draft
export function previa(e, datos) {
  const { partidas, indice, puestos } = fuentes(datos);
  const cartas = new Map(catalogo().map(({ peso, ...c }) => [c.id, c]));
  const fantasy = puntosDeJugadores();
  const lado = l => {
    const eq = e.equipos[l];
    return {
      clan: eq.clan, ...resumenClan(eq.clan, partidas, indice, puestos),
      jugadores: ROLES.map((rol, i) => {
        const id = `${eq.clan}-${rol}`, nombre = eq.jugadores[i] || '', campeon = e.draft.picks[l][i] || null;
        const lista = actuaciones({ nombre, id }, partidas, indice);
        const conCampeon = campeon ? resumir(lista.filter(x => x.campeon === campeon)) : null;
        // La carta es la del puesto: si hoy juega otro (un suplente), no es la suya
        const carta = cartas.get(id), esSuya = carta && normal(carta.nombre) === normal(nombre);
        return { id, rol, nombre, campeon, general: resumir(lista), conCampeon, primeraVez: Boolean(campeon && nombre) && !conCampeon.partidas,
          carta: esSuya ? carta : null, fantasy: esSuya ? fantasy.get(id) || { puntos: 0, partidas: 0 } : null };
      }),
    };
  };
  const [a, b] = [e.equipos.azul.clan, e.equipos.rojo.clan];
  const entreEllos = a !== b ? partidas.filter(p => (p.clanAzul === a && p.clanRojo === b) || (p.clanAzul === b && p.clanRojo === a)) : [];
  const ganadas = clan => entreEllos.filter(p => clanDe(p, p.ganador) === clan).length;
  return { azul: lado('azul'), rojo: lado('rojo'), partidasLiga: partidas.length,
    caraACara: { partidas: entreEllos.length, azul: ganadas(a), rojo: ganadas(b) } };
}

// ---------- fichas de la web ----------
export function fichaJugador(id, datos) {
  const j = vistaTierlist().jugadores.find(x => x.id === String(id).toUpperCase());
  if (!j || !j.nombre) return null;
  const { partidas, indice } = fuentes(datos);
  const lista = actuaciones(j, partidas, indice);
  const carta = catalogo().find(c => c.id === j.id);
  const { peso, ...limpia } = carta || {};
  return { id: j.id, clan: j.clan, rol: j.rol, nombre: j.nombre, tier: j.tier, carta: carta ? limpia : null,
    general: resumir(lista), campeones: porCampeon(lista).slice(0, 8), fantasy: puntosDeJugadores().get(j.id) || { puntos: 0, partidas: 0 } };
}

export function fichaClan(id, datos) {
  const clan = String(id).toUpperCase();
  if (!CLANES.some(c => c.id === clan && !c.invitado)) return null;
  // Los equipos Legacy no están en la tier list: sus jugadores salen de la plantilla, sin tier
  const conTier = vistaTierlist().jugadores.filter(j => j.clan === clan);
  const jugadores = conTier.length ? conTier
    : ROLES.map((rol, i) => ({ id: `${clan}-${rol}`, clan, rol, nombre: plantilla(clan)?.jugadores?.[i] || '', tier: null }));
  const { partidas, indice, puestos } = fuentes(datos);
  const fantasy = puntosDeJugadores();
  return { clan, ...resumenClan(clan, partidas, indice, puestos),
    cartas: catalogo().filter(c => c.tipo === 'legacy' && c.clan === clan).map(({ peso, ...c }) => c),
    jugadores: jugadores.map(j => ({ id: j.id, rol: j.rol, nombre: j.nombre, tier: j.tier, general: resumir(actuaciones(j, partidas, indice)),
      fantasy: fantasy.get(j.id) || { puntos: 0, partidas: 0 } })) };
}
