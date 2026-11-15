// Datos adelantados del PC 1 del realizador (server/adelanto.js): CS repartidos entre los saltos de 10 que da el cliente
// y dragones, heraldo y Barón que salen solos cuando la emisión (el PC 2, 2 minutos detrás) llega a su minuto.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibirAdelanto, adelantoDe, csRepartido, olvidarAdelanto, sucesosAdelantados, enfriamientosEn, peleaEn } from '../server/adelanto.js';
import { recibir, olvidarPartida, marcarObjetivo } from '../server/partida.js';

const POSICIONES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const NOMBRES = ['A1', 'A2', 'A3', 'A4', 'A5', 'R1', 'R2', 'R3', 'R4', 'R5'];
function jugadores(cs = {}) {
  return NOMBRES.map((nombre, k) => ({ riotIdGameName: nombre, riotId: `${nombre}#EUW`, summonerName: `${nombre}#EUW`, team: k < 5 ? 'ORDER' : 'CHAOS',
    position: POSICIONES[k % 5], championName: 'Ahri', level: 10, items: [], scores: { kills: 0, deaths: 0, assists: 0, creepScore: cs[nombre] ?? 0, wardScore: 0 } }));
}
const paquete = (gameTime, cs) => recibir({ juego: { gameTime }, jugadores: jugadores(cs), eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] });
// El PC 1: A1 llega a 10 CS a los 60 s, a 20 a los 120 s y a 30 a los 200 s; los demás, sin saltos
const delPc1 = (t, objetivos = []) => ({ t, jugadores: NOMBRES.map(nombre => ({ nombre, equipo: nombre[0] === 'A' ? 'ORDER' : 'CHAOS',
  cs: nombre === 'A1' ? [[0, 0], [60, 10], [120, 20], [200, 30]] : [[0, 0]] })), objetivos });

beforeEach(() => { olvidarAdelanto(); olvidarPartida(); });

test('los CS se reparten al ritmo real entre dos saltos de 10, sin pasar del siguiente ni bajar de lo que da el cliente', () => {
  assert.ok(recibirAdelanto(delPc1(210)));
  assert.equal(csRepartido('A1', 30, 0), 5, 'a mitad del primer tramo, la mitad');
  assert.equal(csRepartido('A1', 90, 10), 15);
  assert.equal(csRepartido('A1', 119.9, 10), 19, 'justo antes del salto, nunca el siguiente múltiplo de 10');
  assert.equal(csRepartido('A1', 120, 20), 20, 'en cada salto, exacto');
  assert.equal(csRepartido('A1', 160, 20), 25, 'el tramo de 80 s va más despacio');
  assert.equal(csRepartido('A1', 250, 30), 30, 'después del último salto conocido, lo del cliente');
  assert.equal(csRepartido('A1', 90, 40), 40, 'nunca por debajo de lo que dice el cliente');
  assert.equal(csRepartido('A1#EUW', 90, 10), 15, 'el nombre, con o sin el #');
  assert.equal(csRepartido('Nadie', 90, 10), 10, 'sin datos de ese jugador, lo del cliente');
});

test('solo vale lo de esta partida: reciente y con los mismos jugadores; y si el reloj del PC 1 vuelve atrás, es otra', () => {
  assert.equal(recibirAdelanto({ t: 'mucho' }), false);
  assert.equal(recibirAdelanto({ t: 10 }), false, 'sin jugadores no se entiende');
  const ahora = Date.now();
  recibirAdelanto(delPc1(210), ahora);
  assert.equal(adelantoDe(NOMBRES, ahora), true);
  assert.equal(adelantoDe(['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'X10'], ahora), false, 'otra partida, otros nombres');
  assert.equal(adelantoDe(NOMBRES, ahora + 11 * 60 * 1000), false, 'sin noticias del PC 1 en 10 minutos, ya no vale');
  recibirAdelanto({ t: 30, jugadores: [{ nombre: 'A1', cs: [[0, 0], [25, 10]] }] });
  assert.equal(csRepartido('A1', 90, 0), 10, 'partida nueva: lo de la anterior se ha olvidado');
});

test('los objetivos del PC 1 salen solos cuando la emisión llega a su minuto, y una marca a mano repetida sobra', () => {
  recibirAdelanto(delPc1(400, [
    { id: 'le-1', tipo: 'dragon', dragon: 'infernal', lado: 'azul', t: 300 },
    { id: 'le-2', tipo: 'heraldo', lado: 'rojo', t: 380 },
    { id: 'le-1', tipo: 'dragon', dragon: 'infernal', lado: 'azul', t: 300 },  // repetido: no cuenta dos veces
    { id: 'raro', tipo: 'nexo', lado: 'azul', t: 10 },                           // no se entiende: fuera
  ]));
  assert.equal(sucesosAdelantados().length, 2);
  // La emisión va 2 minutos detrás: a los 250 s todavía no ha caído nada
  let p = paquete(250, { A1: 30 });
  assert.equal(p.azul.dragones.length, 0, 'todavía no');
  // Llega al minuto del dragón: sale, del lado azul y de su elemento
  p = paquete(305, { A1: 30 });
  assert.deepEqual(p.azul.dragones, ['infernal']);
  assert.equal(p.rojo.heraldos, 0, 'el heraldo, aún no');
  // Alguien lo marca también a mano en el panel: no cuenta dos veces
  marcarObjetivo({ tipo: 'dragon', lado: 'azul', dragon: 'infernal' });
  p = paquete(390, { A1: 30 });
  assert.deepEqual(p.azul.dragones, ['infernal'], 'la marca a mano del mismo dragón sobra');
  assert.equal(p.rojo.heraldos, 1);
  // Una marca de algo que el PC 1 no ha dado sí cuenta (por si al PC 1 se le escapa alguno)
  marcarObjetivo({ tipo: 'baron', lado: 'rojo' });
  p = paquete(395, { A1: 30 });
  assert.equal(p.rojo.barones, 1);
});

test('el marcador enseña los CS repartidos, pero no en la partida de prueba ni sin PC 1', () => {
  let p = paquete(90, { A1: 10 });
  assert.equal(p.lineas[0].azul.cs, 10, 'sin PC 1, lo del cliente');
  recibirAdelanto(delPc1(210));
  p = paquete(90, { A1: 10 });
  assert.equal(p.lineas[0].azul.cs, 15, 'con PC 1, repartido');
  const prueba = recibir({ juego: { gameTime: 90 }, jugadores: jugadores({ A1: 10 }), eventos: [] }, { prueba: true });
  assert.equal(prueba.lineas[0].azul.cs, 10, 'la partida de prueba no usa lo del PC 1');
});

// ---------- 14/11: enfriamientos leídos de la pantalla del PC 1 y larvas ----------

test('los enfriamientos de la D, la F y la R se cuentan en el segundo de la emisión', () => {
  recibirAdelanto({ ...delPc1(600), hechizos: [
    { nombre: 'A1', equipo: 'azul', d: [[149, 329], [455, 635.1]], f: [], r: [[500.5, null]] },
    { nombre: 'R1', equipo: 'rojo', d: [[10, 'mal'], [-5, 20]], f: [[300, 280]], r: [] },   // tramos raros: fuera
  ] });
  assert.deepEqual(enfriamientosEn('A1', 100), { d: null, f: null, r: null }, 'antes de lanzar nada, todo listo');
  assert.deepEqual(enfriamientosEn('A1', 200).d, { quedan: 129 }, 'el Destello, con su cuenta atrás');
  assert.equal(enfriamientosEn('A1', 329).d, null, 'en cuanto vuelve, listo');
  assert.deepEqual(enfriamientosEn('A1', 600).d, { quedan: 36 }, 'el segundo tramo');
  assert.deepEqual(enfriamientosEn('A1', 550).r, { quedan: null }, 'la R lanzada sin saber aún cuándo vuelve: sin número');
  assert.deepEqual(enfriamientosEn('R1', 100), { d: null, f: null, r: null });
  assert.equal(enfriamientosEn('Nadie', 100), undefined, 'sin datos de ese jugador');
});

test('las larvas del PC 1 cuentan para su familia y el marcador enseña los enfriamientos solo con datos del PC 1', () => {
  let p = paquete(400, { A1: 30 });
  assert.equal(p.enfriamientos, false, 'sin PC 1, no hay columnas de enfriamientos');
  recibirAdelanto({ ...delPc1(600, [
    { id: 'grub-1', tipo: 'larvas', lado: 'rojo', t: 380 }, { id: 'grub-2', tipo: 'larvas', lado: 'rojo', t: 381 },
    { id: 'grub-3', tipo: 'larvas', lado: 'azul', t: 500 },
  ]), hechizos: [{ nombre: 'A1', equipo: 'azul', d: [[390, 690]], f: [], r: [] }] });
  p = paquete(400, { A1: 30 });
  assert.equal(p.rojo.larvas, 2);
  assert.equal(p.azul.larvas, 0, 'la de los 500 s aún no ha llegado a la emisión');
  assert.equal(p.enfriamientos, true);
  assert.deepEqual(p.lineas[0].azul.enfriamientos.d, { quedan: 290 });
  assert.equal(p.lineas[1].azul.enfriamientos, null, 'quien no tiene datos de hechizos, sin enfriamientos');
});

test('el KDA viene del PC 1 en el segundo de la emisión: lo que el PC 2 se salta en una repetición no se pierde', () => {
  const kda = [[0, 0, 0, 0], [300, 1, 0, 0], [480, 2, 1, 3], [700, 4, 1, 3]];
  recibirAdelanto({ ...delPc1(800), jugadores: delPc1(800).jugadores.map(j => (j.nombre === 'A1' ? { ...j, kda } : j)) });
  // La emisión va por los 500 s y el cliente del PC 2, por haber saltado, solo cuenta 1 asesinato
  let p = recibir({ juego: { gameTime: 500 }, jugadores: jugadores({ A1: 30 }).map(j => (j.riotIdGameName === 'A1' ? { ...j, scores: { ...j.scores, kills: 1 } } : j)),
    eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] });
  const a1 = p.lineas[0].azul;
  assert.deepEqual([a1.k, a1.d, a1.a], [2, 1, 3], 'lo del PC 1 a los 480 s');
  assert.equal(p.azul.kills, 2, 'y el total de la familia');
  // Aún no ha llegado a los 700 s: no se adelanta nada
  p = paquete(650, { A1: 30 });
  assert.equal(p.lineas[0].azul.k, 2);
  // Si el cliente va por delante del PC 1, manda el cliente
  p = recibir({ juego: { gameTime: 660 }, jugadores: jugadores({ A1: 30 }).map(j => (j.riotIdGameName === 'A1' ? { ...j, scores: { ...j.scores, kills: 5 } } : j)), eventos: [] });
  assert.equal(p.lineas[0].azul.k, 5);
});

test('en pelea (según el PC 1) el overlay quita las estadísticas, con 3 s de margen al acabar', () => {
  recibirAdelanto({ ...delPc1(900), peleas: [[400, 430], [800, null], ['mal', 2]] });
  assert.equal(peleaEn(390), false);
  assert.equal(peleaEn(400), true);
  assert.equal(peleaEn(432), true, 'margen al acabar');
  assert.equal(peleaEn(434), false);
  assert.equal(peleaEn(850), true, 'una pelea que sigue');
  assert.equal(paquete(410, { A1: 30 }).pelea, true);
  assert.equal(paquete(500, { A1: 30 }).pelea, false);
});

test('los temporizadores se fían del PC 1 aunque el PC 2 salte tramos, y las larvas salen una sola vez', () => {
  // El PC 2 ha saltado: su cliente cuenta 3 asesinatos de A1 que no ha visto como sucesos (historia incompleta)
  const conSaltos = t => recibir({ juego: { gameTime: t }, jugadores: jugadores({ A1: 30 }).map(j => (j.riotIdGameName === 'A1' ? { ...j, scores: { ...j.scores, kills: 3 } } : j)),
    eventos: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] });
  let p = conSaltos(420);
  assert.equal(p.historiaIncompleta, true);
  assert.equal(p.objetivos.some(o => o.tipo === 'larvas'), false, 'sin PC 1, no se sabe si las larvas siguen vivas');
  recibirAdelanto(delPc1(600, [{ id: 'g1', tipo: 'larvas', lado: 'azul', t: 450 }, { id: 'g2', tipo: 'larvas', lado: 'azul', t: 455 }, { id: 'g3', tipo: 'larvas', lado: 'rojo', t: 470 }]));
  p = conSaltos(420);
  const larvas = p.objetivos.find(o => o.tipo === 'larvas');
  assert.ok(larvas, 'con el PC 1, las larvas siguen vivas aunque el PC 2 haya saltado');
  assert.equal(larvas.quedan, 3);
  assert.ok(p.objetivos.some(o => o.tipo === 'dragon') && p.objetivos.some(o => o.tipo === 'baron'));
  // Caen las tres antes de las 9:45: ya no sale un segundo grupo, y el heraldo va a las 15:00
  p = conSaltos(500);
  assert.equal(p.objetivos.some(o => o.tipo === 'larvas'), false, 'una sola vez por partida');
  assert.equal(p.objetivos.find(o => o.tipo === 'heraldo')?.aparece, 900);
});
