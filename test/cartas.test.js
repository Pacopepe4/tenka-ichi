// Cartas del gachapon: pesos con la S+, probabilidades, cartas especiales, arte y marcos por tier.
// Todo con datos temporales: plantilla inventada, tier list, especiales y una carpeta de dibujos de prueba.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIERS = ['S', 'A', 'B', 'C', 'D'];
let carpeta, g, fantasy;

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-cartas-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  plantillas.TORA.jugadores = ['Byakko', 'Shiro', 'Kiba', 'Raiden', 'Hoshi'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  // Dos jugadores por tier: KAIJU y TORA con S, A, B, C y D en el mismo orden de roles
  const jugadores = Object.fromEntries(['KAIJU', 'TORA'].flatMap(c => ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'].map((r, i) => [`${c}-${r}`, TIERS[i]])));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ jugadores, equipos: {} }));
  // Una especial buena, una sin nombre, una que pisa a un jugador, una desactivada y una repetida
  await writeFile(path.join(carpeta, 'especiales.json'), JSON.stringify([
    { id: 'esp-kami', nombre: 'Kami', subtitulo: 'Guardián del torneo' },
    { id: 'ESP-SIN-NOMBRE' },
    { id: 'KAIJU-TOP', nombre: 'Impostor' },
    { id: 'ESP-DORMIDA', nombre: 'Dormida', activa: false },
    { id: 'ESP-KAMI', nombre: 'Kami repetida' },
  ]));
  // Dibujo de una carta (con el nombre en minúsculas) y marcos de la C y de la S+
  const cartas = path.join(carpeta, 'cartas');
  await mkdir(path.join(cartas, 'marcos'), { recursive: true });
  await writeFile(path.join(cartas, 'kaiju-top.png'), 'png');
  await writeFile(path.join(cartas, 'notas.txt'), 'no es un dibujo');
  await writeFile(path.join(cartas, 'marcos', 'C.png'), 'png');
  await writeFile(path.join(cartas, 'marcos', 'SP.png'), 'png');

  for (const k of Object.keys(process.env)) if (/^(GOOGLE_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
    ARCHIVO_ESPECIALES: path.join(carpeta, 'especiales.json'), CARPETA_CARTAS: cartas });

  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  fantasy = await import('../server/fantasy.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
});

after(async () => { if (carpeta) await rm(carpeta, { recursive: true, force: true }); });

test('las especiales entran como S+ sin clan ni rol, y se descartan las que están mal', () => {
  const especiales = g.catalogo().filter(c => c.especial);
  assert.deepEqual(especiales.map(c => c.id), ['ESP-KAMI']);
  const kami = especiales[0];
  assert.equal(kami.tier, 'S+');
  assert.equal(kami.clan, null);
  assert.equal(kami.rol, null);
  assert.equal(kami.subtitulo, 'Guardián del torneo');
  assert.equal(kami.peso, 0.5);
  assert.equal(g.catalogo().length, 11, '10 jugadores y 1 especial');
});

test('cada carta lleva su dibujo si existe y si no el de su clan o el sol partido', () => {
  const cat = new Map(g.catalogo().map(c => [c.id, c]));
  assert.match(cat.get('KAIJU-TOP').arte, /^\/cartas\/kaiju-top\.png\?v=[0-9a-z]+$/);
  assert.equal(cat.get('KAIJU-JUNGLA').arte, '/clanes/KAIJU.jpg');
  assert.equal(cat.get('TORA-TOP').arte, '/clanes/TORA.jpg');
  assert.equal(cat.get('ESP-KAMI').arte, '/marca/sol-partido.jpg');
});

test('marcos por tier: la S+ usa SP.png, la D el de la C y sin marco no hay', () => {
  const cat = new Map(g.catalogo().map(c => [c.id, c]));
  assert.match(cat.get('ESP-KAMI').marco, /^\/cartas\/marcos\/SP\.png\?v=/);
  assert.match(cat.get('KAIJU-ADC').marco, /^\/cartas\/marcos\/C\.png\?v=/, 'C');
  assert.match(cat.get('KAIJU-SUPPORT').marco, /^\/cartas\/marcos\/C\.png\?v=/, 'la D usa el de la C');
  assert.equal(cat.get('KAIJU-TOP').marco, null, 'la S aún no tiene marco');
  assert.equal(g.claveTier('S+'), 'SP');
});

test('las probabilidades salen de los pesos: S+ 0,5, S 1, A 3, B 6, C 10 y D 15', () => {
  const p = g.probabilidades();
  const total = 0.5 + 2 * (1 + 3 + 6 + 10 + 15);
  assert.equal(p['S+'], 0.5 / total);
  assert.equal(p.S, 2 / total);
  assert.equal(p.D, 30 / total);
  assert.ok(Math.abs(Object.values(p).reduce((s, x) => s + x, 0) - 1) < 1e-12, 'suman 1');
  assert.deepEqual(Object.keys(p), ['S+', 'S', 'A', 'B', 'C', 'D']);
});

test('el sorteo respeta los pesos, también el decimal de la S+', () => {
  const cat = g.catalogo(), p = g.probabilidades(cat), n = 120000;
  const veces = Object.fromEntries(Object.keys(p).map(t => [t, 0]));
  for (let i = 0; i < n; i++) veces[g.sacarCarta(cat).tier]++;
  for (const [t, esperada] of Object.entries(p)) {
    const margen = 5 * Math.sqrt(esperada * (1 - esperada) / n);   // cinco desviaciones: no falla por mala suerte
    assert.ok(Math.abs(veces[t] / n - esperada) < margen, `${t}: ${veces[t] / n} frente a ${esperada}`);
  }
  assert.ok(veces['S+'] > 0, 'la S+ sale alguna vez');
});

test('un sobre da 3 cartas con su dibujo y su marco, sin el peso del sorteo', async () => {
  const u = { id: 'u1', nombre: 'Ana' };
  assert.equal(await g.darAlta(u), true);
  const sobre = await g.abrirSobre(u);
  assert.equal(sobre.length, 3);
  for (const c of sobre) {
    assert.ok(c.arte, 'lleva arte');
    assert.ok('marco' in c);
    assert.equal('peso' in c, false);
  }
  assert.equal(g.estadoUsuario('u1').sobres, 1);
});

test('las especiales no se pueden alinear en el fantasy', async () => {
  await assert.rejects(fantasy.cambiarAlineacion({ id: 'u1', nombre: 'Ana' }, { TOP: 'ESP-KAMI' }), /no es de TOP/);
  await assert.rejects(fantasy.cambiarAlineacion({ id: 'u1', nombre: 'Ana' }, { TOP: 'KAIJU-JUNGLA' }), /no es de TOP/);
});
