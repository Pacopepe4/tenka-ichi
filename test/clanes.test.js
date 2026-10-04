// Equipos Legacy: de la organización, con su estandarte y su plantilla, pero apartados de la competición de
// Tenka Ichi. No entran en el sorteo ni en la tier list, así que tampoco tienen cartas ni puntúan en el fantasy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLANES, enCompeticion } from '../server/clanes.js';
import { vistaTierlist, ponerTier } from '../server/tierlist.js';
import { sortearCalendario } from '../server/calendario.js';

test('Amateratsu es Legacy: lo conserva todo, pero no compite', () => {
  const a = CLANES.find(c => c.id === 'AMATERATSU');
  assert.equal(a.legacy, true);
  assert.deepEqual([a.nombre, a.kanji, a.lema], ['Amateratsu', '天照', 'La Reina del Sol']);
  assert.ok(a.color && a.texto && a.descripcion);
  const compiten = CLANES.filter(enCompeticion).map(c => c.id);
  assert.equal(compiten.length, 12);
  assert.ok(!compiten.includes('AMATERATSU'));
  assert.ok(!compiten.includes('NONAME'), 'los invitados tampoco compiten');
});

test('un equipo Legacy no está en la tier list: no tiene tier, ni cartas, ni fantasy', () => {
  const v = vistaTierlist();
  assert.equal(v.equipos.length, 12);
  assert.equal(v.jugadores.length, 60);
  assert.ok(!v.jugadores.some(j => j.clan === 'AMATERATSU'));
  assert.ok(!v.equipos.some(e => e.id === 'AMATERATSU'));
  assert.throws(() => ponerTier('jugador', 'AMATERATSU-TOP', 'S'), /No existe/);
  assert.throws(() => ponerTier('equipo', 'AMATERATSU', 'S'), /No existe/);
});

test('un equipo Legacy no entra en el sorteo del calendario', async () => {
  const nueve = CLANES.filter(enCompeticion).slice(0, 9).map(c => c.id);
  await assert.rejects(sortearCalendario([...nueve, 'AMATERATSU'], 7), /No compiten en Tenka Ichi: AMATERATSU/);
  await assert.rejects(sortearCalendario([...nueve, 'NONAME'], 7), /No compiten/);
});
