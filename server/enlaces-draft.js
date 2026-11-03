// Enlaces de DraftCore creados por adelantado: uno por partida del calendario, guardados para que, cuando toque
// jugarla, baste con compartirlos (azul y rojo a cada capitán) y el panel se conecte solo al de espectador.
//
// DraftCore crea un draft sin cuenta ni clave (lo mismo que hace su web con «Crear draft», comprobado el
// 03/11/2026): POST https://ws.lol.draftcore.net/drafts/v2 con los dos equipos, y responde con
//   links: { id (espectador = el código del draft), team1 (azul), team2 (rojo), admin (gestor), stream }
// En fearless, las partidas 2 y 3 de una serie llevan en settings.fearlessPreviousDrafts los drafts anteriores:
// por eso solo se crean por adelantado las primeras y las demás al pasar a la siguiente partida (las anteriores
// ya se han jugado).
//
// Se guardan en Ajustes (clave enlaces_draft): sobreviven a los reinicios de la web.

const SERVIDOR = process.env.DRAFTCORE_URL_WS || 'https://ws.lol.draftcore.net';
const WEB = process.env.DRAFTCORE_URL_WEB || 'https://lol.draftcore.net';
const PUESTOS = ['top', 'jungle', 'middle', 'bottom', 'support'];

export const claveEnlace = ({ jornada, azul, rojo, partida = 1 }) => `${jornada}|${azul}|${rojo}|${partida}`;

// Pide a DraftCore un draft nuevo. equipos: { azul: { nombre, tag, jugadores }, rojo: {…} }
export async function crearDraft({ azul, rojo, anteriores = [] }, { pedir = fetch } = {}) {
  const equipo = e => ({
    id: null, name: String(e?.nombre || '').slice(0, 40), tag: String(e?.tag || '').slice(0, 5), logo: '/logo.webp',
    ...Object.fromEntries(PUESTOS.map((p, i) => [p, String(e?.jugadores?.[i] || '')])), subs: [], staff: {},
  });
  const cuerpo = {
    blueTeam: equipo(azul), redTeam: equipo(rojo), series_id: null, tournament_id: null, event_id: null,
    settings: { fearless: true, fearlessPreviousDrafts: anteriores.filter(Boolean), disabledChampions: [] },
  };
  const r = await pedir(`${SERVIDOR}/drafts/v2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: WEB }, body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`DraftCore contesta ${r.status} al crear el draft`);
  const d = await r.json();
  const l = d?.links;
  if (!l?.id || !l.team1 || !l.team2) throw new Error('DraftCore no ha devuelto los enlaces del draft');
  const url = c => `${WEB}/${c}`;
  return { id: l.id, azul: url(l.team1), rojo: url(l.team2), espectador: url(l.id), stream: l.stream ? url(l.stream) : null, gestor: l.admin ? url(l.admin) : null };
}

// Las partidas que quedan por jugar y se pueden crear ya: las de liga y, en playoffs, la primera de cada serie
// con los dos clanes decididos. comp es lo que devuelve competicion()
export function porCrear(comp) {
  const lista = [];
  if (!comp?.calendario) return lista;
  const hechas = comp.clasificacion?.resultados || {};
  for (const c of comp.calendario.jornadas.flat()) {
    if (!hechas[c.id]) lista.push({ jornada: `Jornada ${c.jornada}`, azul: c.azul, rojo: c.rojo, partida: 1 });
  }
  const d = comp.clasificacion?.desempate;
  if (d && !d.ganador) lista.push({ jornada: 'Desempate', azul: d.clanes[0], rojo: d.clanes[1], partida: 1 });
  if (comp.cuadro) {
    for (const s of [...comp.cuadro.cuartos, ...comp.cuadro.semis, comp.cuadro.final]) {
      if (!s?.alto || !s.bajo || s.ganador || s.siguiente?.partida !== 1) continue;
      const elige = s.siguiente.eligeLado || s.alto;
      lista.push({ jornada: s.ronda, azul: elige, rojo: elige === s.alto ? s.bajo : s.alto, partida: 1 });
    }
  }
  return lista;
}

export function crearEnlaces({ leer = () => null, guardar = () => {}, crear = crearDraft, equipo = id => ({ nombre: id }) } = {}) {
  let guardados = {};
  try { guardados = JSON.parse(leer() || '{}') || {}; } catch { guardados = {}; }
  const enCurso = new Map();  // clave → promesa: no se crea el mismo draft dos veces a la vez

  const publico = clave => (guardados[clave] ? { clave, ...guardados[clave] } : null);

  async function asegurar(p) {
    const clave = claveEnlace(p);
    if (guardados[clave]) return publico(clave);
    if (enCurso.has(clave)) return enCurso.get(clave);
    // Fearless: los drafts de las partidas anteriores de la misma serie
    const anteriores = [];
    for (let n = 1; n < (p.partida || 1); n++) {
      const previo = guardados[claveEnlace({ ...p, partida: n })] || guardados[claveEnlace({ ...p, azul: p.rojo, rojo: p.azul, partida: n })];
      if (previo?.id) anteriores.push(previo.id);
    }
    const promesa = (async () => {
      const links = await crear({ azul: equipo(p.azul), rojo: equipo(p.rojo), anteriores });
      guardados[clave] = { jornada: p.jornada, azulClan: p.azul, rojoClan: p.rojo, partida: p.partida || 1, ...links, creado: new Date().toISOString() };
      guardar(JSON.stringify(guardados));
      return publico(clave);
    })().finally(() => enCurso.delete(clave));
    enCurso.set(clave, promesa);
    return promesa;
  }

  return {
    buscar: p => publico(claveEnlace(p)),
    todos: () => Object.keys(guardados).map(publico),
    asegurar,
    // Crea las que falten de una lista; devuelve cuántas había y cuántas se han creado, sin parar por un fallo
    async precrear(lista) {
      let creados = 0, fallos = 0, error = null;
      for (const p of lista) {
        if (guardados[claveEnlace(p)]) continue;
        try { await asegurar(p); creados++; } catch (e) { fallos++; error = e.message; }
      }
      return { total: lista.length, creados, fallos, error };
    },
    olvidar(clave) {
      if (!guardados[clave]) return false;
      delete guardados[clave];
      guardar(JSON.stringify(guardados));
      return true;
    },
  };
}
