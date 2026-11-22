// Línea por línea: hechizos de invocador, runa principal y hueco de misión de rol de cada jugador.
// Paquetes inventados con la forma de la Live Client Data API, como en partida.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibir, olvidarPartida } from '../server/partida.js';

const POSICIONES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const hechizo = id => ({ displayName: 'x', rawDisplayName: `GeneratedTip_SummonerSpell_${id}_DisplayName` });
// Azul: A1…A5 y rojo: R1…R5, cada uno en su línea; `extra` pone o cambia campos de un jugador por su nombre
function jugadores(extra = {}) {
  return ['A', 'R'].flatMap(l => POSICIONES.map((position, i) => {
    const nombre = `${l}${i + 1}`;
    return { riotIdGameName: nombre, riotId: `${nombre}#EUW`, summonerName: `${nombre}#EUW`, team: l === 'A' ? 'ORDER' : 'CHAOS', position,
      championName: 'Ahri', rawChampionName: 'game_character_displayname_Ahri', level: 10, items: [],
      scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 }, ...extra[nombre] };
  }));
}
const linea = (p, rol, lado) => p.lineas[rol][lado];
const paquete = jug => recibir({ juego: { gameTime: 600 }, jugadores: jug, eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] });

beforeEach(() => olvidarPartida());

test('los hechizos salen como ids de Data Dragon, en el orden del cliente, y las variantes enseñan el icono base', () => {
  const p = paquete(jugadores({
    A1: { summonerSpells: { summonerSpellOne: hechizo('SummonerTeleport'), summonerSpellTwo: hechizo('SummonerFlash') } },
    A2: { summonerSpells: { summonerSpellOne: hechizo('S5_SummonerSmitePlayerGanker'), summonerSpellTwo: hechizo('SummonerFlash') } },
    A3: { summonerSpells: { summonerSpellOne: hechizo('SummonerDot'), summonerSpellTwo: hechizo('SummonerHaste') } },
  }));
  assert.deepEqual(linea(p, 0, 'azul').hechizos, ['SummonerTeleport', 'SummonerFlash']);
  assert.deepEqual(linea(p, 1, 'azul').hechizos, ['SummonerSmite', 'SummonerFlash'], 'el Aplastar helado es el Aplastar');
  assert.deepEqual(linea(p, 2, 'azul').hechizos, ['SummonerDot', 'SummonerHaste']);
});

test('sin nombre interno se reconoce el traducido; lo desconocido o ausente queda vacío, sin romper nada', () => {
  const p = paquete(jugadores({
    A1: { summonerSpells: { summonerSpellOne: { displayName: 'Destello' }, summonerSpellTwo: { displayName: 'Teleportar' } } },
    A2: { summonerSpells: { summonerSpellOne: hechizo('SummonerInventado'), summonerSpellTwo: {} } },
  }));
  assert.deepEqual(linea(p, 0, 'azul').hechizos, ['SummonerFlash', 'SummonerTeleport']);
  assert.deepEqual(linea(p, 1, 'azul').hechizos, [null, null]);
  assert.deepEqual(linea(p, 4, 'azul').hechizos, [null, null], 'el cliente no los mandó');
});

test('la runa principal es la piedra angular del jugador, si el cliente la da', () => {
  const p = paquete(jugadores({ A3: { runes: { keystone: { id: 8112, displayName: 'Electrocute' } } } }));
  assert.equal(linea(p, 2, 'azul').runa, 8112);
  assert.equal(linea(p, 0, 'azul').runa, null);
});

test('el hueco de misión (el 7) no se cuela entre los objetos y sale aparte; sin él, la misión queda vacía', () => {
  const p = paquete(jugadores({
    A5: { items: [
      { itemID: 3871, count: 1, slot: 0 }, { itemID: 3340, count: 1, slot: 6 }, { itemID: 2055, count: 2, slot: 7 },
    ] },
  }));
  const a5 = linea(p, 4, 'azul');
  assert.deepEqual(a5.objetos, [3871, null, null, null, null, null, 3340], 'los siete huecos de siempre, intactos');
  assert.deepEqual(a5.mision, { objeto: 2055 });
  assert.equal(linea(p, 3, 'azul').mision, null);
});

test('22/11: la misión de rol completada se marca en todos los puestos, cada uno con su señal', () => {
  const sinNada = paquete(jugadores({
    A1: { summonerSpells: { summonerSpellOne: hechizo('S12_SummonerTeleportUpgrade'), summonerSpellTwo: hechizo('SummonerFlash') }, level: 18 },
    A2: { summonerSpells: { summonerSpellOne: hechizo('SummonerSmite'), summonerSpellTwo: hechizo('SummonerFlash') } },
    A3: { items: [{ itemID: 3020, count: 1, slot: 1 }] },
  }));
  assert.deepEqual([0, 1, 2, 3, 4].map(i => linea(sinNada, i, 'azul').misionHecha), [false, false, false, false, false],
    'el Teleportar desatado del minuto 10 no es la misión del top; el Castigo de siempre y las botas de nivel 2 tampoco');
  const hechas = paquete(jugadores({
    A1: { level: 19 },                                                                                                // top: pasa del 18
    R1: { items: [{ itemID: 1001, count: 1, slot: 7 }] },                                                            // top sin Teleportar: su hueco
    A2: { summonerSpells: { summonerSpellOne: hechizo('SummonerSmiteAvatarDefensive'), summonerSpellTwo: hechizo('SummonerFlash') } },
    A3: { items: [{ itemID: 3171, count: 1, slot: 1 }] },                                                            // medio: botas de nivel 3
    A4: { items: [{ itemID: 3006, count: 1, slot: 7 }] },                                                            // ADC: su hueco
  }));
  assert.equal(linea(hechas, 0, 'azul').misionHecha, true);
  assert.equal(linea(hechas, 0, 'rojo').misionHecha, true);
  assert.equal(linea(hechas, 1, 'azul').misionHecha, true, 'el Castigo mejorado');
  assert.equal(linea(hechas, 2, 'azul').misionHecha, true);
  assert.equal(linea(hechas, 3, 'azul').misionHecha, true);
  assert.equal(linea(hechas, 4, 'azul').misionHecha, false);
  assert.equal('castigoMejorado' in linea(hechas, 1, 'azul'), false, 'los datos de paso no salen al overlay');
});

test('EGM 22/11 (M7, M9): solo las botas de nivel 3 de verdad; la señal vale en cualquier fila; misionEn la primera vez', () => {
  const guja = paquete(jugadores({ A3: { items: [{ itemID: 3179, count: 1, slot: 1 }] }, R3: { items: [{ itemID: 3177, count: 1, slot: 2 }] } }));
  assert.equal(linea(guja, 2, 'azul').misionHecha, false, 'la Guja sombría (3179) no es de la misión');
  assert.equal(linea(guja, 2, 'rojo').misionHecha, false, 'la Espada del guardián (3177) tampoco');
  // Un medio que cae en la fila del top (sin nombres ni picks): sus botas cuentan igual
  const cruzado = paquete(jugadores({ A1: { items: [{ itemID: 3176, count: 1, slot: 1 }] } }));
  assert.equal(linea(cruzado, 0, 'azul').misionHecha, true);
  assert.equal(linea(cruzado, 0, 'azul').misionEn, 600, 'el segundo en que se vio hecha');
  // En el siguiente paquete sigue con el mismo misionEn
  const despues = recibir({ juego: { gameTime: 650 }, jugadores: jugadores({ A1: { items: [{ itemID: 3176, count: 1, slot: 1 }] } }), eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] });
  assert.equal(linea(despues, 0, 'azul').misionEn, 600);
  assert.equal(linea(despues, 1, 'azul').misionEn, null, 'sin misión, sin segundo');
});
