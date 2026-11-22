// Resultados de mesa en la clasificación (server/competicion.js): cuentan como victoria, no necesitan partida y
// mandan sobre una partida registrada del mismo cruce
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultadosLiga, clasificacion } from '../server/competicion.js';

const CAL = { semilla: 1, participantes: ['A', 'B', 'C', 'D'], jornadas: [[{ id: 'J1-1', azul: 'A', rojo: 'B' }, { id: 'J1-2', azul: 'C', rojo: 'D' }]] };
const jugada = { fase: 'Fase de liga', clanAzul: 'A', clanRojo: 'B', ganador: 'azul', fecha: '2026-11-15' };

test('un resultado de mesa cuenta como victoria sin partida', () => {
  const mesa = { 'J1-2': { ganador: 'D', motivo: 'Incumplimiento de la normativa', fecha: '2026-11-22' } };
  const res = resultadosLiga(CAL, [jugada], mesa);
  assert.equal(res['J1-1'].ganador, 'A');
  assert.deepEqual(res['J1-2'], { ganador: 'D', azul: 'C', rojo: 'D', fecha: '2026-11-22', mesa: 'Incumplimiento de la normativa' });
  const c = clasificacion(CAL, [jugada], mesa);
  assert.equal(c.filas.find(f => f.clan === 'D').victorias, 1);
  assert.equal(c.filas.find(f => f.clan === 'C').derrotas, 1);
  assert.equal(c.jugadas, 2);
});

test('un ganador de mesa que no juega ese cruce no cuenta, y sin mesa todo sigue igual', () => {
  assert.equal(resultadosLiga(CAL, [], { 'J1-2': { ganador: 'A' } })['J1-2'], undefined);
  assert.equal(resultadosLiga(CAL, [jugada], {})['J1-1'].ganador, 'A');
  assert.equal(resultadosLiga(CAL, [jugada])['J1-2'], undefined);
});
