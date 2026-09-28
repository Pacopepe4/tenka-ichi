// Puntuación del fantasy: reglas, datos que faltan, multikills acumulativos, match-v5 y los datos del puente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puntuar, participacion, desdeMatchV5, reglasLegibles, REGLAS_PUNTOS as R } from '../server/puntuacion.js';

const puntosDe = (resultado, regla) => resultado.desglose.find(d => d.regla === regla)?.puntos ?? 0;

test('una partida completa suma cada regla y el total cuadra con el desglose', () => {
  const r = puntuar({ victoria: true, k: 8, d: 2, a: 7, cs: 231, vision: 18, dano: 24650, primeraSangre: true,
    triples: 1, quadras: 0, pentas: 0, kp: 68, torres: 3, mvp: true });
  assert.equal(puntosDe(r, 'jugar'), 1);
  assert.equal(puntosDe(r, 'victoria'), 3);
  assert.equal(puntosDe(r, 'asesinato'), 16);
  assert.equal(puntosDe(r, 'asistencia'), 10.5);
  assert.equal(puntosDe(r, 'muerte'), -2);
  assert.equal(puntosDe(r, 'subditos'), 7, '231 de farmeo son 7 tramos de 30');
  assert.equal(puntosDe(r, 'vision'), 1);
  assert.equal(puntosDe(r, 'dano'), 4);
  assert.equal(puntosDe(r, 'primeraSangre'), 2);
  assert.equal(puntosDe(r, 'triple'), 2);
  assert.equal(puntosDe(r, 'participacion'), 0, 'el 68 % no llega al 70 %');
  assert.equal(puntosDe(r, 'torre'), 3);
  assert.equal(puntosDe(r, 'mvp'), 3);
  assert.equal(r.total, 50.5);
  assert.equal(r.total, r.desglose.reduce((s, d) => s + d.puntos, 0));
});

test('lo que no se sabe no suma ni resta: una fila antigua solo con KDA', () => {
  const r = puntuar({ victoria: false, k: 2, d: 5, a: 3, mvp: false });
  assert.deepEqual(r.desglose.map(d => d.regla), ['jugar', 'asesinato', 'asistencia', 'muerte']);
  assert.equal(r.total, 1 + 4 + 4.5 - 5);
  // Vacío no es cero: sin daño apuntado no hay regla de daño, con 0 de visión tampoco suma
  assert.equal(puntosDe(puntuar({ k: 0, d: 1, a: 0, dano: '', vision: 0 }), 'dano'), 0);
});

test('sin morir da el extra y cero muertes no resta', () => {
  const r = puntuar({ k: 1, d: 0, a: 1 });
  assert.equal(puntosDe(r, 'sinMorir'), R.sinMorir);
  assert.equal(puntosDe(r, 'muerte'), 0);
  assert.equal(puntuar({ k: 1, a: 1 }).desglose.some(d => d.regla === 'sinMorir'), false, 'sin dato de muertes no hay extra');
});

test('los multikills se suman por escalones: un pentakill vale 10 en total', () => {
  // Como en el juego y en match-v5: el pentakill cuenta también como cuádruple y como triple
  const penta = puntuar({ triples: 1, quadras: 1, pentas: 1 });
  assert.equal(puntosDe(penta, 'triple') + puntosDe(penta, 'cuadruple') + puntosDe(penta, 'pentakill'), 10);
  const cuadruple = puntuar({ triples: 1, quadras: 1, pentas: 0 });
  assert.equal(puntosDe(cuadruple, 'triple') + puntosDe(cuadruple, 'cuadruple'), 5);
});

test('participación en asesinatos: sobre los asesinatos del equipo, con tope en el 100 %', () => {
  assert.equal(participacion(3, 9, 16), 75);
  assert.equal(participacion(0, 0, 0), null, 'sin asesinatos del equipo no se sabe');
  assert.equal(participacion(5, 5, 8), 100);
  assert.equal(puntosDe(puntuar({ kp: 70 }), 'participacion'), R.participacion.puntos);
  assert.equal(puntosDe(puntuar({ kp: 69 }), 'participacion'), 0);
});

test('los cinco roles puntúan parecido en una partida normal ganada', () => {
  // Partida de unos 30 minutos, equipo ganador con 22 asesinatos
  const roles = {
    top: { k: 4, d: 3, a: 6, cs: 190, vision: 18, dano: 18000, torres: 2 },
    jungla: { k: 6, d: 3, a: 10, cs: 150, vision: 30, dano: 14000, torres: 1 },
    medio: { k: 7, d: 2, a: 8, cs: 210, vision: 20, dano: 22000, torres: 1 },
    tirador: { k: 8, d: 2, a: 7, cs: 230, vision: 15, dano: 24000, torres: 3 },
    apoyo: { k: 1, d: 3, a: 16, cs: 30, vision: 60, dano: 7000, torres: 0 },
  };
  const totales = Object.fromEntries(Object.entries(roles).map(([rol, s]) =>
    [rol, puntuar({ victoria: true, ...s, kp: participacion(s.k, s.a, 22) }).total]));
  const valores = Object.values(totales);
  assert.ok(Math.max(...valores) / Math.min(...valores) < 1.6, `demasiada diferencia entre roles: ${JSON.stringify(totales)}`);
});

test('match-v5: un participante de la API de Riot se traduce a las mismas reglas', () => {
  const p = { win: true, kills: 10, deaths: 1, assists: 6, totalMinionsKilled: 180, neutralMinionsKilled: 24, visionScore: 22,
    totalDamageDealtToChampions: 31234, firstBloodKill: false, tripleKills: 1, quadraKills: 1, pentaKills: 1,
    turretTakedowns: 4, challenges: { killParticipation: 0.7272 } };
  const s = desdeMatchV5(p);
  assert.deepEqual(s, { victoria: true, k: 10, d: 1, a: 6, cs: 204, vision: 22, dano: 31234, primeraSangre: false,
    triples: 1, quadras: 1, pentas: 1, torres: 4, kp: 73 });
  const r = puntuar(s);
  assert.equal(puntosDe(r, 'pentakill') + puntosDe(r, 'cuadruple') + puntosDe(r, 'triple'), 10);
  assert.equal(puntosDe(r, 'participacion'), 2);
});

test('las reglas legibles cubren todas las reglas', () => {
  const textos = reglasLegibles().map(r => `${r.puntos} ${r.texto}`).join('\n');
  for (const trozo of ['+1 por jugar', '+3 si gana', '+2 por asesinato', '+1,5 por asistencia', '−1 por muerte', 'no muere',
    '30 de farmeo', '10 de puntuación de visión', '5000 de daño', 'primera sangre', '+10 por pentakill', '70 %', 'torre', 'MVP']) {
    assert.ok(textos.includes(trozo), `falta «${trozo}» en:\n${textos}`);
  }
});
