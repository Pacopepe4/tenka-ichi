// Datos del fantasy que salen de la partida que manda el puente: visión, primera sangre, multikills y torres.
// Paquetes inventados con la forma de la Live Client Data API (playerlist y eventdata).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibir, olvidarPartida } from '../server/partida.js';

const POSICIONES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
// Azul: A1…A5 y rojo: R1…R5, cada uno en su línea
function jugadores(kills = {}, vision = {}) {
  return ['A', 'R'].flatMap(l => POSICIONES.map((position, i) => {
    const nombre = `${l}${i + 1}`;
    return { riotIdGameName: nombre, riotId: `${nombre}#EUW`, summonerName: `${nombre}#EUW`, team: l === 'A' ? 'ORDER' : 'CHAOS', position,
      championName: 'Ahri', rawChampionName: 'game_character_displayname_Ahri', level: 12, items: [],
      scores: { kills: kills[nombre] || 0, deaths: 0, assists: 0, creepScore: 100, wardScore: vision[nombre] ?? 10.4 } };
  }));
}
let id = 0;
const ev = (EventName, EventTime, datos = {}) => ({ EventID: id++, EventName, EventTime, ...datos });
const linea = (p, rol, lado) => p.lineas[rol][lado];

beforeEach(() => { olvidarPartida(); id = 0; });

test('primera sangre, triple, torres (también las que remata un súbdito) y visión redondeada', () => {
  const p = recibir({
    juego: { gameTime: 1500 }, jugadores: jugadores({ A1: 1, A4: 3 }, { A5: 47.6 }),
    eventos: [
      ev('GameStart', 0),
      ev('ChampionKill', 200, { KillerName: 'A1', VictimName: 'R1', Assisters: ['A2'] }),
      ev('FirstBlood', 200, { Recipient: 'A1' }),
      ev('ChampionKill', 700, { KillerName: 'A4', VictimName: 'R4', Assisters: [] }),
      ev('ChampionKill', 702, { KillerName: 'A4', VictimName: 'R5', Assisters: [] }),
      ev('Multikill', 702, { KillerName: 'A4', KillStreak: 2 }),
      ev('ChampionKill', 705, { KillerName: 'A4', VictimName: 'R3', Assisters: ['A5'] }),
      ev('Multikill', 705, { KillerName: 'A4', KillStreak: 3 }),
      ev('TurretKilled', 800, { KillerName: 'A1', TurretKilled: 'Turret_T2_L_03_A', Assisters: ['A2'] }),
      ev('TurretKilled', 900, { KillerName: 'Minion_T100L0S01N0001', TurretKilled: 'Turret_T2_C_05_A', Assisters: ['A3'] }),
    ],
  });
  assert.equal(p.historiaIncompleta, false);
  assert.equal(linea(p, 0, 'azul').primeraSangre, true);
  assert.equal(linea(p, 1, 'azul').primeraSangre, false);
  assert.equal(linea(p, 0, 'azul').torres, 1, 'la derriba');
  assert.equal(linea(p, 1, 'azul').torres, 1, 'ayuda');
  assert.equal(linea(p, 2, 'azul').torres, 1, 'ayuda aunque la remate un súbdito');
  assert.equal(linea(p, 3, 'azul').triples, 1);
  assert.equal(linea(p, 3, 'azul').quadras, 0);
  assert.equal(linea(p, 4, 'azul').vision, 48);
  assert.equal(p.azul.torres, 2, 'el marcador del overlay sigue contando las torres del equipo');
});

test('un pentakill llega por escalones y cuenta como triple, cuádruple y pentakill', () => {
  const muertes = ['R1', 'R2', 'R3', 'R4', 'R5'].map((v, i) => ev('ChampionKill', 1000 + i, { KillerName: 'A4', VictimName: v, Assisters: [] }));
  const escalones = [2, 3, 4, 5].map(n => ev('Multikill', 1000 + n - 1, { KillerName: 'A4', KillStreak: n }));
  const p = recibir({ juego: { gameTime: 1200 }, jugadores: jugadores({ A4: 5 }), eventos: [ev('GameStart', 0), ...muertes, ...escalones] });
  const a4 = linea(p, 3, 'azul');
  assert.deepEqual([a4.triples, a4.quadras, a4.pentas], [1, 1, 1]);
});

test('si el cliente no da la primera sangre, es el primer asesinato de un jugador', () => {
  const p = recibir({ juego: { gameTime: 600 }, jugadores: jugadores({ R2: 1, A3: 1 }), eventos: [
    ev('GameStart', 0),
    ev('ChampionKill', 150, { KillerName: 'R2', VictimName: 'A2', Assisters: [] }),
    ev('ChampionKill', 300, { KillerName: 'A3', VictimName: 'R3', Assisters: [] }),
  ] });
  assert.equal(linea(p, 1, 'rojo').primeraSangre, true);
  assert.equal(linea(p, 2, 'azul').primeraSangre, false);
});

test('si el puente entra con la partida empezada, primera sangre, multikills y torres quedan sin saber', () => {
  // Sin GameStart y con asesinatos en el KDA que no se han visto
  const p = recibir({ juego: { gameTime: 900 }, jugadores: jugadores({ A1: 2 }), eventos: [
    ev('TurretKilled', 850, { KillerName: 'A1', TurretKilled: 'Turret_T2_L_03_A', Assisters: [] }),
  ] });
  assert.equal(p.historiaIncompleta, true);
  const a1 = linea(p, 0, 'azul');
  assert.deepEqual([a1.primeraSangre, a1.triples, a1.quadras, a1.pentas, a1.torres], [null, null, null, null, null]);
  assert.equal(a1.k, 2, 'el KDA del cliente sí está completo');
  assert.equal(a1.vision, 10);
});
