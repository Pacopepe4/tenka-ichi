// Mejoras del marcador de partida: oro estimado por ingresos, puntos de fantasy provisionales, resumen de pelea,
// muestras de la gráfica de oro y la cámara del caster en partida. Paquetes inventados con la forma de la
// Live Client Data API, como en partida.test.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recibir, olvidarPartida, ajustarIngame, INGRESOS, REGLAS_PELEA } from '../server/partida.js';
import { puntuar } from '../server/puntuacion.js';
import { camaraLineas, restaurarEstado } from '../server/estado-guardado.js';
import { camaraPartida, camarasLineas, PLACA_CAMARA_PARTIDA, ZONA_MINIMAPA, ESCALA_LINEAS } from '../public/comun.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    // A3 muere ejecutado por una torre: no es asesinato de nadie (desde el 10/11, una muerte de un jugador rojo
    // contaría aunque el cliente aún no la diera en sus scores)
    muerte(600, 'Turret_T2_C_05_A', 'A3'),
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

// ---------- cámara del caster en partida (ingame.camaras: sale la primera; la segunda se queda por compatibilidad) ----------
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
  // Guardado cuando aún estaba la B (se borró el 08/11): vuelve con la A, la única que queda
  const guardado = { cuando: Date.now(), ingame: { estilo: 'b', oroIngresos: false,
    camaras: [{ activa: true, nombre: 'Koryu', detalle: '@koryubudo' }, { activa: false, nombre: 'Izakaya', detalle: '' }] } };
  const e = estado();
  restaurarEstado(e, JSON.stringify(guardado));
  assert.deepEqual(e.ingame, { estilo: 'a', puntosFantasy: true, resumenPelea: true, oroIngresos: false, camaras: guardado.ingame.camaras });
  // Guardado por una versión sin cámaras, o con una lista que no es de dos: se quedan las de fábrica
  for (const camaras of [undefined, [], [{ activa: true }], 'dos']) {
    const viejo = estado();
    restaurarEstado(viejo, JSON.stringify({ cuando: Date.now(), ingame: { estilo: 'a', camaras } }));
    assert.equal(viejo.ingame.estilo, 'a');
    assert.deepEqual(viejo.ingame.camaras, camarasDeFabrica());
  }
});

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leerRepo = r => readFileSync(path.join(raizRepo, r), 'utf8');
// Lo que mide el panel del línea por línea (ingame.css) y el filo del marco de la cámara por fuera del hueco (estilo-a.css)
const ANCHO_PANEL = 1560, ALTO_PANEL = 436, FILO_MARCO = 3;
const cajaLineas = () => ({ x: 960 - ANCHO_PANEL * ESCALA_LINEAS / 2, y: 1080 - ALTO_PANEL * ESCALA_LINEAS, w: ANCHO_PANEL * ESCALA_LINEAS, h: ALTO_PANEL * ESCALA_LINEAS });
const seCruzan = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// El hueco entero de la cámara: el marco (con su filo y el tubo bermellón de 6 px por encima) y la placa del nombre
const marcoCamara = h => ({ x: h.x - FILO_MARCO, y: h.y - 6, w: h.w + 2 * FILO_MARCO, h: h.h + PLACA_CAMARA_PARTIDA + 6 + FILO_MARCO });
// La ficha de un jugador (ingame.css): carta de 290 en 5:7, 22 de hueco y 400 de datos, a 56 px del borde de abajo
const ANCHO_FICHA = 290 + 22 + 400, ALTO_FICHA = Math.round(290 * 7 / 5);
const cajaFicha = ({ left, right }) => ({ x: left ?? 1920 - right - ANCHO_FICHA, y: 1080 - 56 - ALTO_FICHA, w: ANCHO_FICHA, h: ALTO_FICHA });
const reglaCss = (css, sel) => css.match(new RegExp(`\n${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`))?.[1] || '';
const px = (regla, prop) => { const m = regla.match(new RegExp(`(?:^|[ ;])${prop}: (\\d+)px`)); return m ? Number(m[1]) : undefined; };

test('el línea por línea va encogido a ESCALA_LINEAS: su caja de 1560×436 queda de x 430 a 1490 y de y 784 al borde', () => {
  assert.equal(ESCALA_LINEAS, 0.68);
  const css = leerRepo('public/ingame/ingame.css');
  assert.match(reglaCss(css, '.lineas'), /bottom: 0;[^}]*width: 1560px/);
  const lineas = cajaLineas();
  assert.ok(Math.abs(lineas.x - 429.6) < 1 && Math.abs(lineas.x + lineas.w - 1490.4) < 1 && Math.abs(lineas.y - 783.5) < 1);
  assert.equal(lineas.y + lineas.h, 1080);
  // Y no pisa la zona del minimapa, que va abajo a la izquierda
  assert.ok(!seCruzan(lineas, ZONA_MINIMAPA), 'el línea por línea no pisa el minimapa');
});

test('la cámara del caster en partida: un solo hueco en 16:9 abajo a la derecha, con la placa hasta el borde', () => {
  const h = camaraPartida();
  assert.deepEqual(h, { x: 1584, y: 856, w: 320, h: 180 });
  assert.equal(h.w / h.h, 16 / 9, 'la cámara no se deforma');
  assert.equal(h.y + h.h + PLACA_CAMARA_PARTIDA, 1080, 'la placa del nombre llega justo al borde de abajo');
  assert.ok(h.x + h.w + FILO_MARCO <= 1920, 'dentro del lienzo, con su filo');
  assert.equal(PLACA_CAMARA_PARTIDA, 44);
  // La placa mide lo mismo en el CSS, y el marco lleva el radio de Gokudō arriba, como siempre
  assert.match(leerRepo('public/ingame/ingame.css'), /\.placa-cam \{[^}]*height: 44px/);
  assert.match(leerRepo('public/ingame/estilo-a.css'), /\.camara-partida \{ border-radius: 8px 8px 0 0;/);
  // El nombre de antes sigue valiendo, pero ya solo da este hueco (la cámara de la izquierda se quitó)
  assert.deepEqual(camarasLineas(), [h]);
});

test('nada del overlay pisa el minimapa de abajo a la izquierda, y la cámara no pisa el línea por línea ni las fichas', () => {
  // La zona del minimapa: el marco del realizador en x 30, y 804, 250×250, con su placa de 10, su sombra y la pestaña
  // de arriba (unos 20 px por fuera)
  const marco = { x: 30, y: 804, w: 250, h: 250 };
  assert.ok(ZONA_MINIMAPA.x <= marco.x - 20 && ZONA_MINIMAPA.y <= marco.y - 20, 'la zona cubre el marco y lo que asoma');
  assert.ok(ZONA_MINIMAPA.x + ZONA_MINIMAPA.w >= marco.x + marco.w + 20 && ZONA_MINIMAPA.y + ZONA_MINIMAPA.h === 1080);
  const cam = marcoCamara(camaraPartida());
  assert.ok(!seCruzan(cam, ZONA_MINIMAPA), 'la cámara no pisa el minimapa');
  const lineas = cajaLineas();
  assert.ok(!seCruzan(cam, lineas), 'la cámara no pisa el línea por línea');
  assert.ok(cam.x > lineas.x + lineas.w, 'y queda a su derecha, con aire');
  // El marcador, los temporizadores, los módulos y los avisos van todos arriba (top de 112 a 172 px, en .arriba)
  assert.ok(cam.y > 700, 'muy por debajo del marcador y los avisos');
  // Las fichas: la del lado azul empieza pasado el minimapa; la del rojo, con la cámara fuera, se aparta a su izquierda
  const css = leerRepo('public/ingame/ingame.css');
  const azul = cajaFicha({ left: px(reglaCss(css, '.ficha.azul'), 'left') });
  const rojo = cajaFicha({ right: px(reglaCss(css, '.ficha.rojo'), 'right') });
  const rojoConCamara = cajaFicha({ right: px(reglaCss(css, 'body.con-camara-partida .ficha.rojo'), 'right') });
  assert.ok([azul, rojo, rojoConCamara].every(f => Number.isFinite(f.x)), 'las tres posiciones se leen del CSS');
  assert.ok(!seCruzan(azul, ZONA_MINIMAPA), 'la ficha azul no pisa el minimapa');
  assert.ok(!seCruzan(rojo, ZONA_MINIMAPA) && !seCruzan(rojoConCamara, ZONA_MINIMAPA));
  assert.ok(!seCruzan(rojoConCamara, cam), 'la ficha roja se aparta de la cámara');
  assert.ok(azul.x < 960 && rojoConCamara.x + rojoConCamara.w > 960, 'cada una sigue en su lado');
});

// Las funciones de verdad de ingame.js, sacadas del archivo y ejecutadas con lo mínimo alrededor (sin navegador)
function cargarCamaraDeIngame() {
  const js = leerRepo('public/ingame/ingame.js').replace(/\r\n/g, '\n');
  const funcion = nombre => {
    const i = js.indexOf(`function ${nombre}(`);
    assert.ok(i >= 0, `ingame.js tiene ${nombre}`);
    const j = js.indexOf('\n}\n', i);
    return js.slice(i, j + 2);
  };
  const mundo = { estado: null, partida: null, pintadas: [], clases: new Map(), lineas: null };
  const document = { body: { classList: { toggle: (c, v) => mundo.clases.set(c, v) } }, createElement: () => ({}) };
  const lista = (caja, items) => { mundo.pintadas = items; };
  const crear = new Function('$', 'document', 'lista', 'camaraPartida', 'pintarLineas', 'pintarFicha', 'pintarGrafica', 'mundo',
    `let estado = null, partida = null;
     ${funcion('pintarGraficos')}
     ${funcion('pintarCamaraPartida')}
     return () => { estado = mundo.estado; partida = mundo.partida; pintarGraficos(); };`);
  const pintarGraficos = crear(() => ({}), document, lista, camaraPartida, m => { mundo.lineas = m; }, () => {}, () => {}, mundo);
  return { pintarGraficos, mundo };
}

test('la cámara del caster sale por su cuenta en partida, se vea o no el línea por línea', () => {
  const { pintarGraficos, mundo } = cargarCamaraDeIngame();
  const lineas = Array.from({ length: 5 }, () => ({}));
  const camaras = activa => [{ activa, nombre: 'Koryu', detalle: '@koryubudo' }, { activa: true, nombre: 'Derecha', detalle: '' }];
  // En partida, sin ningún grafismo fuera: la cámara sale igual
  mundo.partida = { activo: true, lineas };
  mundo.estado = { grafico: null, ingame: { camaras: camaras(true) } };
  pintarGraficos();
  assert.equal(mundo.lineas, false, 'el línea por línea no está');
  assert.equal(mundo.pintadas.length, 1, 'un solo hueco');
  assert.equal(mundo.pintadas[0].nombre, 'Koryu', 'es la primera de la lista; la segunda no sale');
  assert.equal(mundo.clases.get('con-camara-partida'), true);
  // Con el línea por línea, con la ficha o con la gráfica, sigue igual
  for (const tipo of ['lineas', 'ficha', 'oro']) {
    mundo.estado = { grafico: { tipo, lado: 'azul', indice: 0 }, ingame: { camaras: camaras(true) } };
    pintarGraficos();
    assert.equal(mundo.pintadas.length, 1, `sale también con ${tipo}`);
  }
  // Quitada en el panel: se va (aunque esté el línea por línea), y la ficha roja vuelve a su sitio
  mundo.estado = { grafico: { tipo: 'lineas' }, ingame: { camaras: camaras(false) } };
  pintarGraficos();
  assert.equal(mundo.lineas, true);
  assert.equal(mundo.pintadas.length, 0);
  assert.equal(mundo.clases.get('con-camara-partida'), false);
  // Sin partida en marcha no sale, y un estado sin cámaras no rompe nada
  mundo.partida = { activo: false, lineas };
  mundo.estado = { grafico: null, ingame: { camaras: camaras(true) } };
  pintarGraficos();
  assert.equal(mundo.pintadas.length, 0);
  mundo.partida = { activo: true, lineas };
  mundo.estado = { ingame: {} };
  pintarGraficos();
  assert.equal(mundo.pintadas.length, 0);
});

test('el panel tiene su bloque de la cámara del caster en partida, aparte del línea por línea', () => {
  const html = leerRepo('public/panel/index.html'), js = leerRepo('public/panel/panel.js');
  assert.ok(html.includes('<summary>Cámara del caster en partida</summary>'));
  for (const id of ['camaraPartidaActiva', 'camaraPartidaNombre', 'camaraPartidaDetalle', 'camaraPartidaMedida', 'guardarCamaraPartida']) {
    assert.ok(html.includes(`id="${id}"`), `el panel tiene #${id}`);
    assert.ok(js.includes(`#${id}`), `panel.js usa #${id}`);
  }
  // Los avisos y la ayuda ya no la atan al línea por línea
  const inicio = html.indexOf('<details class="plegable camara-partida">');
  const bloque = html.slice(inicio, html.indexOf('</details>', inicio));
  assert.ok(!/sale con el línea por línea|solo está mientras el línea por línea/.test(bloque + js));
  // Marcarla manda solo la primera de la lista (la segunda se queda como estaba)
  assert.match(js, /enviar\('ingame', \{ camaras: \[\{ activa \}\] \}\)/);
});

test('la gráfica de oro sale en el mismo hueco que el línea por línea, y solo queda el estilo A', () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const leer = r => readFileSync(path.join(raiz, r), 'utf8');
  const css = leer('public/ingame/ingame.css'), html = leer('public/ingame/index.html'), js = leer('public/ingame/ingame.js');
  const regla = sel => css.match(new RegExp('\n' + sel.replace('.', '\.') + ' \{([^}]*)\}'))?.[1] || '';
  assert.match(regla('.lineas'), /bottom: 0;[^}]*width: 1560px/);
  assert.match(regla('.grafica'), /bottom: 0;[^}]*width: 1560px; height: 436px/);
  // Las dos van dentro de la zona que se encoge (la gráfica justo después del panel, antes de cerrar la zona)
  const zona = html.slice(html.indexOf('<div class="zona-lineas">'), html.indexOf('<div class="camaras-partida">'));
  assert.ok(zona.includes('<section class="lineas"') && zona.includes('<section class="grafica"'));
  // El dibujo de la gráfica, su viewBox y su caja miden lo mismo
  assert.match(js, /const W = 1560, H = 344/);
  assert.ok(html.includes('viewBox="0 0 1560 344"') && css.includes('.grafica-svg { display: block; width: 1560px; height: 344px; }'));
  assert.ok(!html.includes('estilo-b.css'), 'la B ya no se carga');
});
