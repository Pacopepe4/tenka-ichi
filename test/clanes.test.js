// La familia Legacy (Shinigami): de la organización, con su kamon y su plantilla, pero apartada de la competición de
// Gokudō. No entra en el sorteo ni en la tier list, así que tampoco tiene cartas ni puntúa en el fantasy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLANES, enCompeticion } from '../server/clanes.js';
import { vistaTierlist, ponerTier } from '../server/tierlist.js';
import { sortearCalendario } from '../server/calendario.js';

test('Shinigami (en el sitio de Amateratsu) es Legacy: lo conserva todo, pero no compite', () => {
  const a = CLANES.find(c => c.id === 'AMATERATSU');
  assert.equal(a.legacy, true);
  assert.deepEqual([a.nombre, a.kanji, a.lema], ['Shinigami', '死神', 'El dios de la muerte']);
  assert.ok(a.color && a.texto && a.descripcion);
  const compiten = CLANES.filter(enCompeticion).map(c => c.id);
  assert.deepEqual(compiten, ['SARU', 'KAIJU', 'KEMONO', 'ATSUI', 'TORA', 'BUSHI'], 'los seis de la temporada');
  assert.ok(!compiten.includes('AMATERATSU'));
  assert.ok(!compiten.includes('NONAME'), 'los invitados tampoco compiten');
});

test('un equipo Legacy no está en la tier list: no tiene tier, ni cartas, ni fantasy', () => {
  const v = vistaTierlist();
  assert.equal(v.equipos.length, 6);
  assert.equal(v.jugadores.length, 30);
  assert.ok(!v.jugadores.some(j => j.clan === 'AMATERATSU'));
  assert.ok(!v.equipos.some(e => e.id === 'AMATERATSU'));
  assert.throws(() => ponerTier('jugador', 'AMATERATSU-TOP', 'S'), /No existe/);
  assert.throws(() => ponerTier('equipo', 'AMATERATSU', 'S'), /No existe/);
});

test('un equipo Legacy no entra en el sorteo del calendario', async () => {
  const cinco = CLANES.filter(enCompeticion).slice(0, 5).map(c => c.id);
  await assert.rejects(sortearCalendario([...cinco, 'AMATERATSU'], 7), /No compiten en Gokudō: AMATERATSU/);
  await assert.rejects(sortearCalendario([...cinco, 'NONAME'], 7), /No compiten/);
});

test('los nombres, kanji y colores de las familias salen de data-proyecto/familias.json, cada una en el sitio de su clan', () => {
  const { familias } = JSON.parse(readFileSync(new URL('../data-proyecto/familias.json', import.meta.url), 'utf8'));
  assert.equal(familias.length, 7);
  for (const f of familias) {
    const c = CLANES.find(x => x.id === f.clan);
    assert.ok(c, `${f.id} apunta a un clan que existe`);
    assert.deepEqual([c.nombre, c.kanji, c.color, Boolean(c.legacy)], [f.nombre, f.kanji, f.color, Boolean(f.legacy)], f.id);
  }
  assert.deepEqual(CLANES.filter(enCompeticion).map(c => c.nombre), ['Tsuki', 'Yasha', 'Tengu', 'Ryūjin', 'Byakko', 'Akuma']);
});
