// El bloque «Fases del directo» del panel (public/panel/fases.js): qué dice en cada fase, qué botones van y qué se
// manda al PC 1 con la hora de la espera
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaFases, ordenFase, hastaDesdeHora, horaDe, cuenta, preguntaCierre, preguntaFase, problemaHora, BOTONES } from '../public/panel/fases.js';

const foto = fase => ({ tipo: 'foto', fase });
// Los botones de la primera tanda (los tráilers y «Saltar», aparte)
const botones = v => Object.fromEntries(['intro', 'pausa', 'postpartida', 'casters', 'cierre', 'auto', 'espera'].map(b => [b, v[b]]));
// Hoy a las 20:00 (hora local), para que las cuentas no dependan del día
const AHORA = new Date(2026, 10, 15, 20, 0, 0, 0).getTime();

test('sin foto del PC 1 el bloque no sale; con un PC 1 viejo, sin el campo fase o a null, lo dice y no hay botones', () => {
  assert.equal(vistaFases(null).visible, false);
  for (const viejo of [vistaFases({ tipo: 'foto', tAntena: 300 })]) {
    assert.equal(viejo.visible, true);
    assert.equal(viejo.botones, false);
    assert.match(viejo.texto, /no lleva las fases del directo: actualízalo/);
    assert.ok(Object.values(botones(viejo)).every(b => b === false));
    assert.equal(viejo.aviso, null);
  }
});

test('el texto grande de cada fase, con lo que viene después y la cuenta', () => {
  const hasta = new Date(2026, 10, 15, 20, 12, 34).getTime();
  const casos = [
    [{ actual: 'espera', manual: false, hasta, faltan: 754, siguiente: 'intro', escena: 'Espera' }, 'En antena: Espera · la intro en 12:34 (a las 20:12)'],
    [{ actual: 'postpartida', manual: false, hasta: null, faltan: 20.2, siguiente: 'casters', escena: 'MVP' }, 'En antena: Postpartida · los casters en 0:21'],
    [{ actual: 'partida', manual: false, hasta: null, faltan: null, siguiente: null, escena: 'Juego' }, 'En antena: Partida'],
    [{ actual: 'intro', manual: false, hasta: null, faltan: 9, siguiente: 'draft', escena: 'Intro' }, 'En antena: Intro · el draft en 0:09'],
    [{ actual: 'casters', manual: true, hasta: null, faltan: null, siguiente: 'resumen', escena: 'Casters' }, 'En antena: Casters · luego, el resumen'],
    [{ actual: 'cierre', manual: false, hasta: null, faltan: null, siguiente: null, escena: 'Final' }, 'En antena: Cierre'],
    [{ actual: null, manual: false, hasta: null, faltan: null, siguiente: null, escena: null }, 'Fuera de antena'],
  ];
  for (const [fase, texto] of casos) assert.equal(vistaFases(foto(fase), AHORA).texto, texto, fase.actual);
  const v = vistaFases(foto(casos[0][0]), AHORA);
  assert.equal(v.titulo, 'Espera');
  assert.equal(v.modo, 'Automático');
  assert.equal(v.escena, 'Escena de OBS: Espera');
  assert.equal(vistaFases(foto(casos[4][0]), AHORA).modo, 'A mano');
});

test('la espera sin `faltan` saca la cuenta de su hora, y de más de una hora sale con horas', () => {
  const hasta = new Date(2026, 10, 15, 21, 2, 5).getTime();
  const v = vistaFases(foto({ actual: 'espera', manual: true, hasta, faltan: null, siguiente: 'intro', escena: 'Espera' }), AHORA);
  assert.equal(v.texto, 'En antena: Espera · la intro en 1:02:05 (a las 21:02)');
  assert.deepEqual(v.aviso, { etiqueta: 'Fase', texto: 'Espera · 1:02:05' });
  assert.equal(v.hora, '21:02');
  assert.equal(v.esperaTexto, 'Cambiar hora');
});

test('qué botones van en cada fase', () => {
  const F = [false, false, false, false, false, false, false];
  //                   intro  pausa  postp. casters cierre auto   espera
  const casos = [
    ['espera', false, [true, true, false, true, true, false, true]],
    ['intro', false, [false, true, false, true, true, false, true]],
    ['draft', false, [false, true, false, true, true, false, false]],
    ['pausa', false, [true, false, true, true, true, false, true]],
    ['partida', false, [false, true, true, true, true, false, false]],
    ['repeticion', false, [false, true, true, true, true, false, false]],
    ['postpartida', false, [false, true, false, true, true, false, false]],
    ['casters', true, [true, true, true, false, true, true, true]],
    ['resumen', false, [false, false, false, false, true, false, false]],  // con el resumen saliendo, solo el cierre (cancelar antes el resumen)
    ['cierre', true, [true, true, false, true, false, true, true]],
    [null, false, [true, true, false, true, true, false, true]],
  ];
  for (const [actual, manual, esperado] of casos) {
    const v = vistaFases(foto({ actual, manual, hasta: null, faltan: null, siguiente: null, escena: null }), AHORA);
    assert.equal(v.botones, true, String(actual));
    assert.deepEqual(botones(v), Object.fromEntries(['intro', 'pausa', 'postpartida', 'casters', 'cierre', 'auto', 'espera'].map((b, i) => [b, esperado[i]])), String(actual));
  }
  // Una fase que el panel no conoce: se dice y no hay botones
  const rara = vistaFases(foto({ actual: 'otra', manual: false }), AHORA);
  assert.equal(rara.titulo, 'Fase desconocida');
  assert.equal(rara.botones, false);
  assert.deepEqual(Object.values(botones(rara)), F);
});

test('la pastilla de la barra: la fase con su cuenta, «a mano» o «auto»; fuera de antena, ninguna', () => {
  assert.deepEqual(vistaFases(foto({ actual: 'postpartida', faltan: 21, siguiente: 'casters' }), AHORA).aviso, { etiqueta: 'Fase', texto: 'Postpartida · 0:21' });
  assert.deepEqual(vistaFases(foto({ actual: 'pausa', manual: true }), AHORA).aviso, { etiqueta: 'Fase', texto: 'Pausa · a mano' });
  assert.deepEqual(vistaFases(foto({ actual: 'partida' }), AHORA).aviso, { etiqueta: 'Fase', texto: 'Partida · auto' });
  assert.equal(vistaFases(foto({ actual: null }), AHORA).aviso, null);
});

test('la hora de la espera: de hoy si aún no ha llegado, de mañana si ya pasó', () => {
  assert.equal(hastaDesdeHora('21:30', AHORA), new Date(2026, 10, 15, 21, 30).getTime());
  assert.equal(hastaDesdeHora('9:05', AHORA), new Date(2026, 10, 16, 9, 5).getTime());
  assert.equal(hastaDesdeHora('20:00', AHORA), null, 'justo ahora (o pasada hace menos de 6 h) no vale: nada de cuentas de 24 h');
  assert.equal(hastaDesdeHora('19:59', AHORA), null);
  assert.equal(problemaHora('19:59', AHORA), 'Esa hora ya ha pasado: pon una hora que aún no haya llegado');
  assert.equal(problemaHora('2x:00', AHORA), 'Escribe la hora de empezar (HH:MM)');
  assert.equal(problemaHora('21:00', AHORA), null);
  assert.equal(hastaDesdeHora('20.15', AHORA), new Date(2026, 10, 15, 20, 15).getTime());
  for (const mal of ['', null, undefined, '25:00', '12:60', 'mañana', '1230', '12:3']) assert.equal(hastaDesdeHora(mal, AHORA), null, String(mal));
  assert.equal(horaDe(new Date(2026, 10, 15, 7, 4).getTime()), '07:04');
  assert.equal(horaDe(null), '');
});

test('los mensajes que se mandan al PC 1', () => {
  assert.deepEqual(ordenFase('espera', { hora: '21:30', jornada: '  Jornada 3 ', ahora: AHORA }),
    { tipo: 'panelFase', fase: 'espera', hasta: new Date(2026, 10, 15, 21, 30).getTime(), jornada: 'Jornada 3' });
  assert.deepEqual(ordenFase('espera', { hora: '21:30', jornada: ' ', ahora: AHORA }),
    { tipo: 'panelFase', fase: 'espera', hasta: new Date(2026, 10, 15, 21, 30).getTime() }, 'sin jornada no va el campo');
  assert.equal(ordenFase('espera', { hora: 'nada', ahora: AHORA }), null);
  for (const fase of BOTONES) assert.deepEqual(ordenFase(fase), { tipo: 'panelFase', fase });
  assert.equal(ordenFase('draft'), null, 'el draft no se pone a mano (la partida sí, desde el 15/11: «meter partida»)');
});

test('cuenta atrás y la pregunta del cierre', () => {
  assert.equal(cuenta(0), '0:00');
  assert.equal(cuenta(-4), '0:00');
  assert.equal(cuenta(59.1), '1:00');
  assert.equal(cuenta(3600), '1:00:00');
  assert.match(preguntaCierre('partida'), /con la partida en antena/);
  assert.equal(preguntaCierre('casters'), '¿Pasar al cierre del directo?');
});

test('revisión 15/11: PC 2 ausente, sin emitir, resumen en antena y preguntas en plena partida', () => {
  const sinPc2 = vistaFases(foto(null), AHORA);
  assert.equal(sinPc2.botones, false);
  assert.match(sinPc2.texto, /Esperando al PC 2/);
  const apagada = vistaFases({ ...foto({ actual: 'espera', hasta: AHORA + 60000, siguiente: 'intro' }), emision: { fase: 'apagada' } }, AHORA);
  assert.ok(apagada.texto.startsWith("En OBS (sin emitir): Espera"), apagada.texto);
  const resumen = vistaFases(foto({ actual: 'resumen', siguiente: 'casters' }), AHORA);
  assert.equal(resumen.pausa || resumen.casters || resumen.intro || resumen.postpartida, false);
  assert.match(resumen.detalle, /cancela antes el resumen/);
  assert.match(preguntaFase('pausa', 'partida'), /con la partida en antena/);
  assert.equal(preguntaFase('pausa', 'casters'), null);
  assert.equal(preguntaFase('cierre', 'casters'), '¿Pasar al cierre del directo?');
});

test('tráilers y saltar: Tráilers donde la intro o tras ella; Saltar solo con algo que dura un tiempo fijo', () => {
  const v = actual => vistaFases(foto({ actual }), AHORA);
  assert.equal(v('espera').traileres, true);
  assert.equal(v('intro').traileres, true);
  assert.equal(v('traileres').traileres, false);
  assert.equal(v('partida').traileres, false);
  for (const a of ['intro', 'traileres', 'postpartida']) assert.equal(v(a).saltar, true, a);
  for (const a of ['espera', 'draft', 'partida', 'casters', 'pausa']) assert.equal(v(a).saltar, false, a);
  assert.equal(v('traileres').titulo, 'Tráilers');
  assert.deepEqual(ordenFase('traileres'), { tipo: 'panelFase', fase: 'traileres' });
  assert.deepEqual(ordenFase('saltar'), { tipo: 'panelFase', fase: 'saltar' });
  assert.ok(BOTONES.includes('traileres') && BOTONES.includes('saltar'));
});

test('tráilers: el «2 de 8» del realizador va delante de lo que viene', () => {
  const v = vistaFases(foto({ actual: 'traileres', faltan: 300, siguiente: 'draft', detalle: '2 de 8' }), AHORA);
  assert.equal(v.detalle, '2 de 8 · el draft en 5:00');
});

test('meter partida: botón antes de que la partida esté en antena, aviso de que espera en 0:00 y pregunta si corta el inicio', () => {
  const v = (fase, extra = {}) => vistaFases(foto({ actual: fase, ...extra }), AHORA);
  assert.equal(v('intro').partida, true);
  assert.equal(v('draft').partida, true);
  assert.equal(v('partida').partida, false);
  assert.equal(v('repeticion').partida, false);
  assert.match(v('traileres', { partidaEsperando: true, faltan: 60, siguiente: 'draft' }).detalle, /la partida espera en 0:00/);
  assert.doesNotMatch(v('draft', { partidaEsperando: false }).detalle, /espera en 0:00/);
  assert.deepEqual(ordenFase('partida'), { tipo: 'panelFase', fase: 'partida' });
  assert.match(preguntaFase('partida', 'intro'), /Se corta la intro/);
  assert.equal(preguntaFase('partida', 'draft'), null);
});
