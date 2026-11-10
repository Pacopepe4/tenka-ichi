// Lo que salió en la 3.ª prueba real del realizador (10/11): las kills del marcador, que iban por detrás, y el retrato
// roto de Mega Gnar.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibir, olvidarPartida, cargarPartida } from '../server/partida.js';

const POSICIONES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const NOMBRES = ['A1', 'A2', 'A3', 'A4', 'A5', 'R1', 'R2', 'R3', 'R4', 'R5'];
function jugadores({ kills = {}, campeon = {}, crudo = {} } = {}) {
  return NOMBRES.map((nombre, k) => ({ riotIdGameName: nombre, riotId: `${nombre}#EUW`, summonerName: `${nombre}#EUW`, team: k < 5 ? 'ORDER' : 'CHAOS',
    position: POSICIONES[k % 5], championName: campeon[nombre] || 'Ahri', rawChampionName: `game_character_displayname_${crudo[nombre] || campeon[nombre] || 'Ahri'}`,
    level: 10, items: [], scores: { kills: kills[nombre] || 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 } }));
}
let id = 1;
const muerte = (t, KillerName, VictimName, Assisters = []) => ({ EventID: id++, EventName: 'ChampionKill', EventTime: t, KillerName, VictimName, Assisters });

before(() => cargarPartida());
beforeEach(() => { olvidarPartida(); id = 1; });

test('las kills del marcador no se quedan atrás: si los sucesos van por delante de los scores del cliente, mandan ellos', () => {
  // El cliente aún dice 0 asesinatos, pero ya han llegado dos muertes de A1 sobre R1 y R2, con A2 ayudando
  const p = recibir({ juego: { gameTime: 300 }, jugadores: jugadores(), eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 },
    muerte(200, 'A1#EUW', 'R1#EUW', ['A2#EUW']), muerte(240, 'A1#EUW', 'R2#EUW', ['A2#EUW'])] });
  assert.equal(p.azul.kills, 2, 'el total del clan cuenta las dos');
  assert.equal(p.lineas[0].azul.k, 2);
  assert.equal(p.lineas[1].azul.a, 2, 'y las asistencias');
  assert.equal(p.lineas[0].rojo.d, 1, 'y las muertes de la víctima');
  // Si el cliente va por delante (se entró con la partida empezada), manda el cliente
  const q = recibir({ juego: { gameTime: 301 }, jugadores: jugadores({ kills: { A1: 5 } }), eventos: [] });
  assert.equal(q.azul.kills, 5);
  // Una ejecución (lo mata una torre) no suma al clan de nadie
  const r = recibir({ juego: { gameTime: 320 }, jugadores: jugadores({ kills: { A1: 5 } }), eventos: [muerte(310, 'Turret_T1_L_03_A', 'R3#EUW')] });
  assert.equal(r.azul.kills, 5);
});

test('Mega Gnar y otras transformaciones no rompen el retrato: se reconoce al campeón o se queda el de antes', () => {
  let p = recibir({ juego: { gameTime: 100 }, jugadores: jugadores({ campeon: { A1: 'Gnar' } }), eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] });
  assert.equal(p.lineas[0].azul.campeon, 'Gnar');
  // Se transforma: el cliente da otro nombre interno o «Mega Gnar»
  p = recibir({ juego: { gameTime: 110 }, jugadores: jugadores({ campeon: { A1: 'Mega Gnar' }, crudo: { A1: 'GnarBig' } }), eventos: [] });
  assert.equal(p.lineas[0].azul.campeon, 'Gnar');
  // Un nombre que no se parece a ninguno: el último que se le reconoció
  p = recibir({ juego: { gameTime: 120 }, jugadores: jugadores({ campeon: { A1: '???' }, crudo: { A1: 'Transformado' } }), eventos: [] });
  assert.equal(p.lineas[0].azul.campeon, 'Gnar');
  // Y no confunde a Vi con Viktor
  p = recibir({ juego: { gameTime: 130 }, jugadores: jugadores({ campeon: { A2: 'Viktor' } }), eventos: [] });
  assert.equal(p.lineas[1].azul.campeon, 'Viktor');
});
