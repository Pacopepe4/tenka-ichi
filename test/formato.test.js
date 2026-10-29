// La temporada de seis clanes: liguilla de cuatro jornadas (8, 15, 22 y 29 de noviembre) y playoffs con los seis
// (cuartos el 6 de diciembre, semifinales el 13 y final el 20), donde el 1.º y el 2.º se saltan los cuartos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPORADA } from '../server/formato.js';
import { sortear, clasificacion, cuadro, competicion, FASE_LIGA, FASE_FINAL } from '../server/competicion.js';
import { sortearCalendario } from '../server/calendario.js';

const par = (a, b) => [a, b].sort().join('-');

// Una liguilla entera en la que gana siempre el clan que va antes en la lista de la temporada
function liguilla(semilla = 1509) {
  const calendario = sortear(TEMPORADA.clanes, semilla);
  const fuerza = c => TEMPORADA.clanes.indexOf(c);
  const partidas = calendario.jornadas.flat().map(c => ({ fase: FASE_LIGA, clanAzul: c.azul, clanRojo: c.rojo, partida: 1,
    ganador: fuerza(c.azul) < fuerza(c.rojo) ? 'azul' : 'rojo', fecha: TEMPORADA.liguilla[c.jornada - 1] }));
  return { calendario, partidas };
}

// Una serie a Bo3 que gana 2-0 el clan de mejor puesto
const serieGanada = (s, partidas) => {
  for (const n of [1, 2]) partidas.push({ fase: FASE_FINAL, clanAzul: s.alto, clanRojo: s.bajo, ganador: 'azul', partida: n, fecha: s.fecha });
};

test('las fechas son las que fijó el usuario: domingos de noviembre y diciembre, en orden', () => {
  assert.deepEqual(TEMPORADA.liguilla, ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  assert.deepEqual(TEMPORADA.playoffs, { cuartos: '2026-12-06', semis: '2026-12-13', final: '2026-12-20' });
  const todas = [...TEMPORADA.liguilla, ...Object.values(TEMPORADA.playoffs)];
  for (const f of todas) assert.equal(new Date(`${f}T12:00:00Z`).getUTCDay(), 0, `${f} es domingo`);
  assert.deepEqual([...todas].sort(), todas, 'cada fecha va después de la anterior');
});

test('antes del sorteo la web ya tiene las fechas y los clanes de la temporada', () => {
  const c = competicion(null, []);
  assert.equal(c.calendario, null);
  assert.deepEqual(c.formato.clanes, ['SARU', 'KAIJU', 'KEMONO', 'ATSUI', 'TORA', 'BUSHI']);
  assert.deepEqual(c.formato.liguilla.map(j => [j.nombre, j.fecha]),
    [['Jornada 1', '2026-11-08'], ['Jornada 2', '2026-11-15'], ['Jornada 3', '2026-11-22'], ['Jornada 4', '2026-11-29']]);
  assert.deepEqual(c.formato.playoffs.map(r => [r.nombre, r.fecha]),
    [['Cuartos de final', '2026-12-06'], ['Semifinales', '2026-12-13'], ['Final', '2026-12-20']]);
});

test('el sorteo da 4 jornadas de 3 partidas: cada clan juega una vez por jornada y nunca repite rival', () => {
  for (const semilla of [1, 7, 1509, 424242]) {
    const { jornadas } = sortear(TEMPORADA.clanes, semilla);
    assert.equal(jornadas.length, 4);
    const vistos = new Set(), partidasDe = Object.fromEntries(TEMPORADA.clanes.map(c => [c, 0]));
    for (const j of jornadas) {
      assert.equal(j.length, 3);
      assert.deepEqual(j.flatMap(c => [c.azul, c.rojo]).sort(), [...TEMPORADA.clanes].sort(), 'los seis juegan en cada jornada');
      for (const c of j) {
        assert.ok(!vistos.has(par(c.azul, c.rojo)), `${c.azul} y ${c.rojo} no se repiten`);
        vistos.add(par(c.azul, c.rojo));
        partidasDe[c.azul]++; partidasDe[c.rojo]++;
      }
    }
    assert.ok(Object.values(partidasDe).every(n => n === 4), 'cada clan juega cuatro partidas');
  }
});

test('el sorteo exige los seis clanes', async () => {
  await assert.rejects(sortearCalendario(TEMPORADA.clanes.slice(0, 5), 7), /Hacen falta 6 clanes y hay 5/);
  // Los seis que ya no están (como KURU) no entran
  await assert.rejects(sortearCalendario([...TEMPORADA.clanes.slice(0, 5), 'KURU'], 7), /No compiten en Tenka Ichi: KURU/);
});

test('con seis plazas para seis clanes pasan todos y no hay partida de desempate', () => {
  for (const semilla of [1, 7, 1509, 99]) {
    const { calendario, partidas } = liguilla(semilla);
    const clasif = clasificacion(calendario, partidas);
    assert.equal(clasif.completa, true);
    assert.equal(clasif.plazas, 6);
    assert.equal(clasif.desempate, null);
    assert.ok(clasif.filas.every(f => f.playoffs));
  }
});

test('el cuadro no se forma hasta que acaba la liguilla', () => {
  const { calendario, partidas } = liguilla();
  assert.equal(cuadro(clasificacion(calendario, []), []), null);
  assert.equal(cuadro(clasificacion(calendario, partidas.slice(0, 11)), partidas.slice(0, 11)), null);
});

test('playoffs: el 1.º y el 2.º esperan en semifinales al ganador del 4-5 y del 3-6', () => {
  const { calendario, partidas } = liguilla();
  const clasif = clasificacion(calendario, partidas);
  const [p1, p2, p3, p4, p5, p6] = clasif.filas.map(f => f.clan);

  let c = cuadro(clasif, partidas);
  assert.deepEqual(c.cuartos.map(s => [s.id, s.alto, s.bajo, s.fecha]), [['C1', p4, p5, '2026-12-06'], ['C2', p3, p6, '2026-12-06']]);
  // Los dos primeros ya saben su sitio en semifinales y su rival se decide en los cuartos
  assert.deepEqual(c.semis.map(s => [s.id, s.alto, s.bajo, s.fecha]), [['S1', p1, null, '2026-12-13'], ['S2', p2, null, '2026-12-13']]);
  assert.equal(c.semis[0].puestos[p1], 1);
  assert.equal(c.semis[1].puestos[p2], 2);
  assert.equal(c.final.fecha, '2026-12-20');
  assert.equal(c.campeon, null);

  for (const s of c.cuartos) serieGanada(s, partidas);
  c = cuadro(clasif, partidas);
  assert.deepEqual(c.cuartos.map(s => s.ganador), [p4, p3]);
  assert.deepEqual(c.semis.map(s => [s.alto, s.bajo]), [[p1, p4], [p2, p3]]);

  for (const s of c.semis) serieGanada(s, partidas);
  c = cuadro(clasif, partidas);
  assert.deepEqual([c.final.alto, c.final.bajo], [p1, p2]);

  serieGanada(c.final, partidas);
  c = cuadro(clasif, partidas);
  assert.equal(c.campeon, p1);
});
