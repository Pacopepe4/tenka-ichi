// Datos adelantados del PC 1 del realizador (server/adelanto.js): CS repartidos entre los saltos de 10 que da el cliente
// y dragones, heraldo y Barón que salen solos cuando la emisión (el PC 2, 2 minutos detrás) llega a su minuto.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibirAdelanto, adelantoDe, csRepartido, olvidarAdelanto, sucesosAdelantados } from '../server/adelanto.js';
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
