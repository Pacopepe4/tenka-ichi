// Porcentajes de un campeón sobre todas las partidas registradas de la liga
import { todas } from './registro.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Resumen de la liga para la portada: clasificación por clan y campeones con más presencia
export function statsLiga({ limite = 10 } = {}) {
  const partidas = todas();
  const clanes = {};
  const campeones = {};
  const sumar = (id, campo, extra = 0) => {
    campeones[id] ??= { id, picks: 0, bans: 0, victorias: 0, presencia: 0 };
    campeones[id][campo] += 1;
    campeones[id].victorias += extra;
  };
  for (const p of partidas) {
    for (const [lado, clan] of [['azul', p.clanAzul], ['rojo', p.clanRojo]]) {
      clanes[clan] ??= { clan, victorias: 0, derrotas: 0 };
      if (p.ganador === lado) clanes[clan].victorias++; else clanes[clan].derrotas++;
    }
    const vistos = new Set();
    for (const lado of ['azul', 'rojo']) {
      for (const c of p.picks[lado].filter(Boolean)) { sumar(c, 'picks', p.ganador === lado ? 1 : 0); vistos.add(c); }
      for (const c of p.bans[lado].filter(Boolean)) { sumar(c, 'bans'); vistos.add(c); }
    }
    for (const c of vistos) campeones[c].presencia++;
  }
  const total = partidas.length;
  return {
    partidas: total,
    clasificacion: Object.values(clanes).sort((a, b) => b.victorias - a.victorias || a.derrotas - b.derrotas),
    campeones: Object.values(campeones)
      .map(c => ({ ...c, pick: pct(c.picks, total), ban: pct(c.bans, total), presenciaPct: pct(c.presencia, total),
        winrate: c.picks ? pct(c.victorias, c.picks) : null }))
      .sort((a, b) => b.presencia - a.presencia || b.picks - a.picks)
      .slice(0, limite),
  };
}

export function statsCampeon(campeon, { clan = null, jugador = null } = {}) {
  const partidas = todas();
  const total = partidas.length;
  let picks = 0, bans = 0, presencia = 0, victorias = 0;
  let deClan = 0, delJugador = 0, jugadorGana = 0;

  for (const p of partidas) {
    let aparece = false;
    for (const lado of ['azul', 'rojo']) {
      const i = p.picks[lado].indexOf(campeon);
      if (i !== -1) {
        picks++; aparece = true;
        const gana = p.ganador === lado;
        if (gana) victorias++;
        const clanLado = lado === 'azul' ? p.clanAzul : p.clanRojo;
        if (clan && clanLado === clan) deClan++;
        if (jugador && (p.jugadores?.[lado]?.[i] || '').toLowerCase() === jugador.toLowerCase()) {
          delJugador++;
          if (gana) jugadorGana++;
        }
      }
      if (p.bans[lado].includes(campeon)) { bans++; aparece = true; }
    }
    if (aparece) presencia++;
  }

  return {
    partidas: total,
    pick: pct(picks, total),
    ban: pct(bans, total),
    presencia: pct(presencia, total),
    winrate: picks ? pct(victorias, picks) : null,
    vecesPick: picks,
    vecesBan: bans,
    clan: clan ? { veces: deClan } : null,
    jugador: jugador ? { veces: delJugador, victorias: jugadorGana, derrotas: delJugador - jugadorGana } : null,
  };
}
