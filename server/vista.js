// Qué enseña el overlay del draft (/overlay/), que es la única fuente que hace falta en OBS:
// - draft: el draft en directo.
// - postdraft: el draft ya cerrado, con las estadísticas de cada jugador y de los dos clanes.
// - partida: el marcador de la partida, transparente, encima del juego.
// - final: la pantalla de fin de partida.
// Cambia sola según lo que va pasando, y el panel puede forzar cualquiera de las cuatro.
import { ROLES } from './clanes.js';

export const VISTAS = ['draft', 'postdraft', 'partida', 'final'];

// La partida que hay en el panel: la pantalla final solo vale mientras se siga en ella
export const clavePartida = e => `${e.config.jornada}|${e.config.partida}|${[e.equipos.azul.clan, e.equipos.rojo.clan].sort().join('-')}`;

export function vistaAutomatica({ enPartida, hayFinal, draftListo }) {
  if (enPartida) return 'partida';
  if (hayFinal) return 'final';
  if (draftListo) return 'postdraft';
  return 'draft';
}

const numero = v => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : null);
const ganadorDe = e => [...e.resultados].reverse().find(r => r.partida === e.config.partida)?.ganador || null;

// La partida tal como acaba, para la pantalla final: lo que lleva cada jugador de cada línea y cada clan.
// p es el resumen de server/partida.js. Si ya había pantalla final de esa misma partida, se conserva lo que
// puso el panel (ganador, MVP, daño y puntos del fantasy)
export function fotoFinal(p, e, previa = null) {
  const misma = previa && previa.clave === clavePartida(e) && previa.numero === p.numero;
  const jugador = (j, lado, i) => (j ? { nombre: e.equipos[lado].jugadores[i] || j.nombre, campeon: j.campeon, nivel: j.nivel,
    k: j.k, d: j.d, a: j.a, cs: j.cs, oro: j.oro, vision: j.vision, objetos: j.objetos || [] } : null);
  const equipo = lado => {
    const x = p[lado];
    return { clan: e.equipos[lado].clan, kills: x.kills, oro: x.oro, torres: x.torres, inhibidores: x.inhibidores, dragones: x.dragones,
      alma: x.alma, ancestrales: x.ancestrales, larvas: x.larvas, heraldos: x.heraldos, barones: x.barones };
  };
  return {
    clave: clavePartida(e), numero: p.numero, prueba: Boolean(p.prueba), cuando: new Date().toISOString(),
    duracion: Math.round(p.tiempo), incompleta: Boolean(p.historiaIncompleta), conMarcador: true,
    equipos: { azul: equipo('azul'), rojo: equipo('rojo') },
    lineas: p.lineas.map((l, i) => ({ rol: l.rol, azul: jugador(l.azul, 'azul', i), rojo: jugador(l.rojo, 'rojo', i) })),
    ganador: misma ? previa.ganador : ganadorDe(e), mvp: misma ? previa.mvp : null, extras: misma ? previa.extras : {},
  };
}

// Sin marcador (no se ha usado el puente): la pantalla final sale del draft y de lo que apunte el panel
export function fotoFinalDelDraft(e, previa = null) {
  const misma = previa && previa.clave === clavePartida(e);
  if (misma && previa.conMarcador) return previa;
  const jugador = (lado, i) => ({ nombre: e.equipos[lado].jugadores[i] || '', campeon: e.draft.picks[lado][i] || null,
    nivel: null, k: null, d: null, a: null, cs: null, oro: null, vision: null, objetos: [] });
  return {
    clave: clavePartida(e), numero: null, prueba: false, cuando: new Date().toISOString(), duracion: null, incompleta: false, conMarcador: false,
    equipos: Object.fromEntries(['azul', 'rojo'].map(l => [l, { clan: e.equipos[l].clan, kills: null, oro: null, torres: null, inhibidores: null,
      dragones: [], alma: null, ancestrales: 0, larvas: null, heraldos: null, barones: null }])),
    lineas: ROLES.map((rol, i) => ({ rol, azul: jugador('azul', i), rojo: jugador('rojo', i) })),
    ganador: ganadorDe(e), mvp: misma ? previa.mvp : null, extras: misma ? previa.extras : {},
  };
}

// Al guardar las estadísticas del fantasy: el MVP, el daño y los puntos de cada jugador pasan a la pantalla final.
// Sin marcador, también el KDA, el farmeo y la visión que ha apuntado el staff.
// filas: [{ lado, indice, k, d, a, cs, vision, dano }], puntos: [{ id, puntos }] con id CLAN-ROL
export function completarFinal(final, e, { filas = [], mvp = null, puntos = [] } = {}) {
  const extras = {};
  for (const lado of ['azul', 'rojo']) ROLES.forEach((rol, i) => {
    const f = filas.find(x => x.lado === lado && Number(x.indice) === i) || {};
    extras[`${lado}-${i}`] = { dano: numero(f.dano), puntos: numero(puntos.find(x => x.id === `${e.equipos[lado].clan}-${rol}`)?.puntos) };
    const j = final.lineas[i]?.[lado];
    if (j && !final.conMarcador) for (const k of ['k', 'd', 'a', 'cs', 'vision']) j[k] = numero(f[k]);
  });
  if (!final.conMarcador) {
    for (const lado of ['azul', 'rojo']) {
      const ks = final.lineas.map(l => l[lado]?.k);
      final.equipos[lado].kills = ks.every(k => k == null) ? null : ks.reduce((s, k) => s + (k || 0), 0);
    }
  }
  return { ...final, mvp: /^(azul|rojo)-[0-4]$/.test(String(mvp)) ? mvp : null, extras };
}
