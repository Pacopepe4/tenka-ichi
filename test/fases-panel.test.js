// El bloque «Fases del directo» del panel (public/panel/fases.js): qué dice en cada fase, qué botones van y qué se
// manda al PC 1 con la hora de la espera
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaFases, ordenFase, hastaDesdeHora, horaDe, cuenta, preguntaCierre, BOTONES } from '../public/panel/fases.js';

const foto = fase => ({ tipo: 'foto', fase });
const botones = v => Object.fromEntries([...BOTONES, 'espera'].map(b => [b, v[b]]));
// Hoy a las 20:00 (hora local), para que las cuentas no dependan del día
const AHORA = new Date(2026, 10, 15, 20, 0, 0, 0).getTime();

test('sin foto del PC 1 el bloque no sale; con un PC 1 viejo, sin el campo fase o a null, lo dice y no hay botones', () => {
  assert.equal(vistaFases(null).visible, false);
  for (const viejo of [vistaFases({ tipo: 'foto', tAntena: 300 }), vistaFases(foto(null))]) {
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
  assert.deepEqual(v.aviso, { etiqueta: 'Espera', texto: '1:02:05' });
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
    ['resumen', false, [false, true, true, true, true, false, false]],
    ['cierre', true, [true, true, false, true, false, true, true]],
    [null, false, [true, true, false, true, true, false, true]],
  ];
  for (const [actual, manual, esperado] of casos) {
    const v = vistaFases(foto({ actual, manual, hasta: null, faltan: null, siguiente: null, escena: null }), AHORA);
    assert.equal(v.botones, true, String(actual));
    assert.deepEqual(botones(v), Object.fromEntries([...BOTONES, 'espera'].map((b, i) => [b, esperado[i]])), String(actual));
  }
  // Una fase que el panel no conoce: se dice y no hay botones
  const rara = vistaFases(foto({ actual: 'otra', manual: false }), AHORA);
  assert.equal(rara.titulo, 'Fase desconocida');
  assert.equal(rara.botones, false);
  assert.deepEqual(Object.values(botones(rara)), F);
});

test('la pastilla de la barra: la fase con su cuenta, «a mano» o «auto»; fuera de antena, ninguna', () => {
  assert.deepEqual(vistaFases(foto({ actual: 'postpartida', faltan: 21, siguiente: 'casters' }), AHORA).aviso, { etiqueta: 'Postpartida', texto: '0:21' });
  assert.deepEqual(vistaFases(foto({ actual: 'pausa', manual: true }), AHORA).aviso, { etiqueta: 'Pausa', texto: 'a mano' });
  assert.deepEqual(vistaFases(foto({ actual: 'partida' }), AHORA).aviso, { etiqueta: 'Partida', texto: 'auto' });
  assert.equal(vistaFases(foto({ actual: null }), AHORA).aviso, null);
});

test('la hora de la espera: de hoy si aún no ha llegado, de mañana si ya pasó', () => {
  assert.equal(hastaDesdeHora('21:30', AHORA), new Date(2026, 10, 15, 21, 30).getTime());
  assert.equal(hastaDesdeHora('9:05', AHORA), new Date(2026, 10, 16, 9, 5).getTime());
  assert.equal(hastaDesdeHora('20:00', AHORA), new Date(2026, 10, 16, 20, 0).getTime(), 'justo ahora cuenta como pasada');
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
  assert.equal(ordenFase('partida'), null, 'la partida no se pone a mano');
});

test('cuenta atrás y la pregunta del cierre', () => {
  assert.equal(cuenta(0), '0:00');
  assert.equal(cuenta(-4), '0:00');
  assert.equal(cuenta(59.1), '1:00');
  assert.equal(cuenta(3600), '1:00:00');
  assert.match(preguntaCierre('partida'), /con la partida en antena/);
  assert.equal(preguntaCierre('casters'), '¿Pasar al cierre del directo?');
});
