// Porcentajes de un campeón sobre todas las partidas registradas de la liga
import { todas } from './registro.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

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
