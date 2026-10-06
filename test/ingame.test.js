// Mejoras del marcador de partida: oro estimado por ingresos, puntos de fantasy provisionales, resumen de pelea,
// muestras de la gráfica de oro y cámaras de los casters en el línea por línea. Paquetes inventados con la forma de la
// Live Client Data API, como en partida.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibir, olvidarPartida, ajustarIngame, INGRESOS, REGLAS_PELEA } from '../server/partida.js';
import { puntuar } from '../server/puntuacion.js';
import { camaraLineas, restaurarEstado } from '../server/estado-guardado.js';
import { camarasLineas, ESCALA_LINEAS_CON_CAMARAS } from '../public/comun.js';

const POSICIONES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
// Azul: A1…A5 y rojo: R1…R5, cada uno en su línea. Sin objetos, salvo que se pidan
function jugadores({ kills = {}, deaths = {}, assists = {}, cs = {}, items = {}, vision = {} } = {}) {
  return ['A', 'R'].flatMap(l => POSICIONES.map((position, i) => {
    const nombre = `${l}${i + 1}`;
    return { riotIdGameName: nombre, riotId: `${nombre}#EUW`, summonerName: `${nombre}#EUW`, team: l === 'A' ? 'ORDER' : 'CHAOS', position,
      championName: 'Ahri', rawChampionName: 'game_character_displayname_Ahri', level: 10, items: items[nombre] || [],
      scores: { kills: kills[nombre] || 0, deaths: deaths[nombre] || 0, assists: assists[nombre] || 0, creepScore: cs[nombre] ?? 0, wardScore: vision[nombre] ?? 0 } };
  }));
}
let id = 0;
const ev = (EventName, EventTime, datos = {}) => ({ EventID: id++, EventName, EventTime, ...datos });
const muerte = (t, KillerName, VictimName, Assisters = []) => ev('ChampionKill', t, { KillerName, VictimName, Assisters });
const linea = (p, rol, lado) => p.lineas[rol][lado];
const paquete = (gameTime, jug, eventos) => recibir({ juego: { gameTime }, jugadores: jug, eventos: [ev('GameStart', 0), ...eventos] });

beforeEach(() => { olvidarPartida(); id = 0; ajustarIngame({ oroIngresos: true }); });

// ---------- R8: oro estimado por ingresos ----------
test('el oro de cada jugador crece con el tiempo y los súbditos, y nunca baja del valor de los objetos', () => {
  const sinNada = paquete(60, jugadores(), []);
  const a1 = linea(sinNada, 0, 'azul');
  assert.equal(a1.oroObjetos, 0);
  assert.ok(a1.oro >= INGRESOS.inicial, 'al empezar, al menos el oro inicial');
  const conTiempo = paquete(600, jugadores({ cs: { A1: 80 } }), []);
  const b1 = linea(conTiempo, 0, 'azul'), b2 = linea(conTiempo, 1, 'azul');
  assert.ok(b1.oro > a1.oro, 'pasa el tiempo: más oro pasivo');
  assert.ok(b1.oro > b2.oro, 'con 80 súbditos más, más oro');
  assert.ok(b1.oro > 2000 && b1.oro < 4000, `una cifra razonable a los 10 minutos con 80 CS: ${b1.oro}`);
  // Con objetos por encima de lo que da la estimación, manda el valor de los objetos (el cliente da el precio de cada uno)
  const conObjetos = paquete(120, jugadores({ items: { A1: [{ itemID: 3031, price: 3400, count: 1, slot: 0 }] } }), []);
  const c1 = linea(conObjetos, 0, 'azul');
  assert.equal(c1.oroObjetos, 3400);
  assert.equal(c1.oro, 3400, 'nunca por debajo de los objetos');
  assert.ok(c1.ingresos < 3400);
});

test('asesinatos, asistencias y torres suman oro; el total del clan es la suma y conserva el de los objetos aparte', () => {
  const sinSucesos = paquete(600, jugadores(), []);
  const con = paquete(600, jugadores({ kills: { A1: 1 }, assists: { A2: 1 }, deaths: { R1: 1 } }), [
    muerte(300, 'A1', 'R1', ['A2']),
    ev('TurretKilled', 500, { KillerName: 'A3', TurretKilled: 'Turret_T2_L_03_A', Assisters: [] }),
  ]);
  assert.ok(linea(con, 0, 'azul').oro - linea(sinSucesos, 0, 'azul').oro >= 300, 'el asesino se lleva al menos la recompensa base');
  assert.ok(linea(con, 1, 'azul').oro > linea(sinSucesos, 1, 'azul').oro, 'la asistencia también da oro');
  assert.ok(linea(con, 2, 'azul').oro > linea(sinSucesos, 2, 'azul').oro + 200, 'la torre da oro local a quien la tira');
  assert.ok(linea(con, 4, 'azul').oro > linea(sinSucesos, 4, 'azul').oro, 'y oro global a todo el clan');
  assert.equal(con.azul.oro, con.lineas.reduce((s, l) => s + l.azul.oro, 0));
  assert.equal(con.azul.oroObjetos, 0);
  assert.ok(con.azul.oro > con.rojo.oro);
});

test('con el interruptor apagado, el oro vuelve a ser el valor de los objetos', () => {
  ajustarIngame({ oroIngresos: false });
  const p = paquete(600, jugadores({ items: { A1: [{ itemID: 1055, price: 450, count: 1, slot: 0 }] } }), []);
  assert.equal(linea(p, 0, 'azul').oro, linea(p, 0, 'azul').oroObjetos);
  assert.equal(linea(p, 1, 'azul').oro, 0);
  assert.equal(p.azul.oro, linea(p, 0, 'azul').oroObjetos);
  assert.ok(linea(p, 1, 'azul').ingresos > 0, 'la estimación se sigue calculando, por si se vuelve a encender');
});

// ---------- R4: puntos de fantasy provisionales ----------
test('cada jugador lleva sus puntos provisionales, sin daño, victoria ni MVP', () => {
  const p = paquete(900, jugadores({ kills: { A1: 2, A4: 1 }, assists: { A2: 3 }, deaths: { A3: 1, R1: 2, R4: 1 }, cs: { A1: 95 }, vision: { A5: 23 } }), [
    muerte(200, 'A1', 'R1', ['A2']), ev('FirstBlood', 200, { Recipient: 'A1' }),
    muerte(400, 'A4', 'R4', ['A2']),
    muerte(500, 'A1', 'R1', ['A2']),
    muerte(600, 'R2', 'A3'),
    ev('TurretKilled', 700, { KillerName: 'A1', TurretKilled: 'Turret_T2_L_03_A', Assisters: [] }),
  ]);
  const a1 = linea(p, 0, 'azul');
  // Lo mismo que daría puntuar con los datos en vivo: participa en 2 de 3 asesinatos (67 %), sin llegar al 70 %
  const esperado = puntuar({ k: 2, d: 0, a: 0, cs: 95, vision: 0, primeraSangre: true, triples: 0, quadras: 0, pentas: 0, torres: 1, kp: 67 }).total;
  assert.equal(a1.kp, 67);
  assert.equal(a1.puntos, esperado);
  assert.ok(a1.puntos > 0);
  const a2 = linea(p, 1, 'azul');
  assert.equal(a2.kp, 100, 'tres asistencias de tres asesinatos');
  assert.equal(a2.puntos, puntuar({ k: 0, d: 0, a: 3, cs: 0, vision: 0, primeraSangre: false, triples: 0, quadras: 0, pentas: 0, torres: 0, kp: 100 }).total);
  const r3 = linea(p, 2, 'rojo');
  assert.equal(r3.kp, null, 'su clan no ha matado a nadie: la participación no se sabe');
  assert.equal(r3.puntos, puntuar({ k: 0, d: 0, a: 0, cs: 0, vision: 0, primeraSangre: false, triples: 0, quadras: 0, pentas: 0, torres: 0 }).total);
});

test('con la historia incompleta, lo que sale de los sucesos no puntúa', () => {
  // Sin GameStart y con asesinatos que no se han visto: primera sangre, multikills y torres quedan en null
  const p = recibir({ juego: { gameTime: 900 }, jugadores: jugadores({ kills: { A1: 2 } }), eventos: [
    ev('TurretKilled', 850, { KillerName: 'A1', TurretKilled: 'Turret_T2_L_03_A', Assisters: [] }),
  ] });
  assert.equal(p.historiaIncompleta, true);
  const a1 = linea(p, 0, 'azul');
  assert.equal(a1.puntos, puntuar({ k: 2, d: 0, a: 0, cs: 0, vision: 0, kp: 100 }).total, 'sin la torre ni la primera sangre');
});

// ---------- R5: resumen de pelea ----------
const conPelea = (t, extra = []) => paquete(t, jugadores({ kills: { A1: 2, R2: 1 }, deaths: { R1: 1, R3: 1, A2: 1 } }), [
  muerte(600, 'A1', 'R1'), muerte(605, 'R2', 'A2'), muerte(612, 'A1', 'R3', ['A4']), ...extra,
]);
const peleas = p => p.avisos.filter(a => a.tipo === 'pelea');

test('tres muertes encadenadas son una pelea; sale una vez, al cerrarse a los 12 s, con el marcador y el destacado', () => {
  assert.equal(peleas(conPelea(620)).length, 0, 'aún abierta: no han pasado 12 s desde la última muerte');
  const p = conPelea(625);
  assert.equal(peleas(p).length, 1);
  const [a] = peleas(p);
  assert.deepEqual(a.marcador, { azul: 2, rojo: 1 });
  assert.equal(a.lado, 'azul', 'el clan que gana la pelea');
  assert.equal(a.destacado.nombre, 'A1');
  assert.equal(a.destacado.asesinatos, 2);
  assert.equal(a.t, 612);
  // El mismo paquete otra vez: el mismo aviso con el mismo id, no uno nuevo
  const otraVez = conPelea(626);
  assert.equal(peleas(otraVez)[0].id, a.id);
});

test('dos muertes no son pelea, y una muerte 13 s después de la anterior empieza otra', () => {
  const dos = paquete(700, jugadores({ kills: { A1: 1, R2: 1 } }), [muerte(600, 'A1', 'R1'), muerte(605, 'R2', 'A2')]);
  assert.equal(peleas(dos).length, 0);
  // Tres muertes, pero la tercera llega 13 s tarde: dos peleas de 2 y 1, ninguna llega a 3
  const sueltas = paquete(700, jugadores({ kills: { A1: 2, R2: 1 } }), [muerte(600, 'A1', 'R1'), muerte(605, 'R2', 'A2'), muerte(618, 'A1', 'R3')]);
  assert.equal(peleas(sueltas).length, 0);
  assert.equal(REGLAS_PELEA.separacion, 12);
});

test('una muerte por torre o súbditos cuenta para el clan contrario al de la víctima, y la pelea no se anuncia si es de hace más de un minuto', () => {
  const p = paquete(640, jugadores({ kills: { A1: 1 }, deaths: { R1: 1, R2: 1, R3: 1 } }), [
    muerte(600, 'A1', 'R1'), muerte(604, 'Turret_T1_C_05_A', 'R2'), muerte(609, 'Minion_T100L1S05N0010', 'R3'),
  ]);
  assert.deepEqual(peleas(p)[0].marcador, { azul: 3, rojo: 0 });
  assert.equal(peleas(p)[0].destacado, null, 'nadie con dos asesinatos');
  // Al saltar hacia delante en una repetición, una pelea de hace más de un minuto no se anuncia
  olvidarPartida();
  const tarde = paquete(700, jugadores({ kills: { A1: 1 }, deaths: { R1: 1, R2: 1, R3: 1 } }), [
    muerte(600, 'A1', 'R1'), muerte(604, 'Turret_T1_C_05_A', 'R2'), muerte(609, 'Minion_T100L1S05N0010', 'R3'),
  ]);
  assert.equal(peleas(tarde).length, 0);
});

// ---------- R7: muestras de la gráfica de oro ----------
test('la diferencia de oro se guarda cada 15 s de partida y, si el reloj vuelve atrás, se tiran las muestras posteriores', () => {
  const jug = jugadores({ cs: { A1: 50 } });
  for (const t of [60, 61, 70, 75, 76, 90, 100]) paquete(t, jug, []);
  let p = paquete(105, jug, []);
  assert.deepEqual(p.grafica.muestras.map(m => m[0]), [60, 75, 90, 105]);
  assert.ok(p.grafica.muestras.every(m => m[1] > 0), 'el azul va por delante (A1 tiene súbditos)');
  // Un retroceso corto del reloj (una repetición que vuelve unos segundos) tira lo posterior y sigue desde ahí
  p = paquete(102, jug, []);
  assert.deepEqual(p.grafica.muestras.map(m => m[0]), [60, 75, 90]);
  p = paquete(120, jug, []);
  assert.deepEqual(p.grafica.muestras.map(m => m[0]), [60, 75, 90, 120]);
  assert.equal(p.grafica.cada, 15);
});

test('si se entra con la partida empezada, la gráfica empieza donde hay datos', () => {
  const p = paquete(1300, jugadores(), []);
  assert.deepEqual(p.grafica.muestras.map(m => m[0]), [1300]);
  const q = paquete(1316, jugadores(), []);
  assert.deepEqual(q.grafica.muestras.map(m => m[0]), [1300, 1316]);
});

// ---------- cámaras de los casters, a los lados del línea por línea ----------
const camarasDeFabrica = () => [{ activa: false, nombre: '', detalle: '' }, { activa: false, nombre: '', detalle: '' }];

test('una cámara de caster cambia solo en lo que llega bien, y los nombres tienen tope', () => {
  const [izquierda, derecha] = camarasDeFabrica();
  // Marcarla en el panel manda solo eso: lo demás se queda
  assert.deepEqual(camaraLineas({ activa: true }, izquierda), { activa: true, nombre: '', detalle: '' });
  // El botón manda el nombre y el detalle, sin tocar si está activa
  assert.deepEqual(camaraLineas({ nombre: 'x'.repeat(60), detalle: '@koryu' }, { ...izquierda, activa: true }), { activa: true, nombre: 'x'.repeat(40), detalle: '@koryu' });
  assert.deepEqual(camaraLineas({ nombre: '' }, { activa: true, nombre: 'Koryu', detalle: '@koryu' }), { activa: true, nombre: '', detalle: '@koryu' }, 'un nombre vacío lo borra');
  // Nada, o algo que no se entiende: como estaba. Y no se cuela ningún campo de más
  assert.deepEqual(camaraLineas(undefined, derecha), derecha);
  assert.deepEqual(camaraLineas({ activa: 'sí', tipo: 'azul', color: 'rojo' }, derecha), derecha);
});

test('las cámaras de los casters vuelven con el estado guardado; uno anterior a ellas no las toca', () => {
  const estado = () => ({ ingame: { estilo: 'a', puntosFantasy: true, resumenPelea: true, oroIngresos: true, camaras: camarasDeFabrica() } });
  const guardado = { cuando: Date.now(), ingame: { estilo: 'b', oroIngresos: false,
    camaras: [{ activa: true, nombre: 'Koryu', detalle: '@koryubudo' }, { activa: false, nombre: 'Izakaya', detalle: '' }] } };
  const e = estado();
  restaurarEstado(e, JSON.stringify(guardado));
  assert.deepEqual(e.ingame, { estilo: 'b', puntosFantasy: true, resumenPelea: true, oroIngresos: false, camaras: guardado.ingame.camaras });
  // Guardado por una versión sin cámaras, o con una lista que no es de dos: se quedan las de fábrica
  for (const camaras of [undefined, [], [{ activa: true }], 'dos']) {
    const viejo = estado();
    restaurarEstado(viejo, JSON.stringify({ cuando: Date.now(), ingame: { estilo: 'b', camaras } }));
    assert.equal(viejo.ingame.estilo, 'b');
    assert.deepEqual(viejo.ingame.camaras, camarasDeFabrica());
  }
});

test('los huecos de las cámaras: dos en 16:9, en espejo, a los lados del línea por línea encogido y sin pisarlo', () => {
  // Lo que mide el panel en cada versión (ingame.css y estilo-b.css; la B lleva además su filo de 5 px), el filo del
  // marco de la cámara por fuera del hueco (estilo-a.css y estilo-b.css) y la placa del nombre
  const ANCHO_PANEL = { a: 1560, b: 1600 + 2 * 5 }, ALTO_PANEL = { a: 436, b: 458 + 12 }, FILO_MARCO = { a: 3, b: 8 }, PLACA = 44;
  for (const estilo of ['a', 'b']) {
    const escala = ESCALA_LINEAS_CON_CAMARAS[estilo];
    assert.ok(escala > 0.7 && escala < 1, 'el panel se encoge, pero sigue leyéndose');
    const izquierdaDelPanel = 960 - ANCHO_PANEL[estilo] * escala / 2, arribaDelPanel = 1080 - ALTO_PANEL[estilo] * escala;
    const [izquierda, derecha] = camarasLineas(estilo);
    assert.equal(camarasLineas(estilo).length, 2);
    for (const h of [izquierda, derecha]) {
      assert.equal(h.w / h.h, 16 / 9, 'la cámara no se deforma');
      assert.ok(h.x - FILO_MARCO[estilo] >= 0 && h.x + h.w + FILO_MARCO[estilo] <= 1920 && h.y + h.h + PLACA <= 1080, `dentro del lienzo, con su placa (${estilo})`);
      assert.ok(h.y > arribaDelPanel, 'a su lado, no por encima');
    }
    assert.ok(izquierda.x + izquierda.w + FILO_MARCO[estilo] < izquierdaDelPanel, `el marco no pisa el panel (${estilo})`);
    assert.equal(izquierda.x, 1920 - (derecha.x + derecha.w), 'en espejo');
    assert.equal(izquierda.y, derecha.y);
  }
  assert.deepEqual(camarasLineas(undefined), camarasLineas('a'), 'sin estilo, el de siempre');
});
