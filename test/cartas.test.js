// Cartas del gachapon: dos clases (Jugador y BOOST), pesos con la S+, probabilidades, arte, marcos por clase y
// tier, y el reverso común. Todo con datos temporales: plantilla inventada, tier list, BOOST y dibujos de prueba.
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
  // BOOST buenas de S+, S y B; y otras mal: sin nombre, de tier C (las BOOST van de S+ a B), que pisa a un
  // jugador, desactivada y repetida
  await writeFile(path.join(carpeta, 'boosts.json'), JSON.stringify([
    { id: 'boost-kami', nombre: 'Kami', tier: 'S+', subtitulo: 'Guardián del torneo' },
    { id: 'BOOST-TENGU', nombre: 'Tengu', tier: 'S' },
    { id: 'BOOST-KAPPA', nombre: 'Kappa', tier: 'B' },
    { id: 'BOOST-SIN-NOMBRE', tier: 'A' },
    { id: 'BOOST-FLOJA', nombre: 'Floja', tier: 'C' },
    { id: 'KAIJU-TOP', nombre: 'Impostor', tier: 'S' },
    { id: 'BOOST-DORMIDA', nombre: 'Dormida', tier: 'A', activa: false },
    { id: 'BOOST-KAMI', nombre: 'Kami repetida', tier: 'S' },
  ]));
  // Dibujo de una carta (con el nombre en minúsculas), marcos de Jugador C y BOOST S+, y el reverso
  const cartas = path.join(carpeta, 'cartas');
  await mkdir(path.join(cartas, 'marcos', 'jugador'), { recursive: true });
  await mkdir(path.join(cartas, 'marcos', 'boost'), { recursive: true });
  await writeFile(path.join(cartas, 'kaiju-top.png'), 'png');
  await writeFile(path.join(cartas, 'notas.txt'), 'no es un dibujo');
  await writeFile(path.join(cartas, 'marcos', 'jugador', 'C.webp'), 'webp');
  await writeFile(path.join(cartas, 'marcos', 'boost', 'SP.webp'), 'webp');
  await writeFile(path.join(cartas, 'marcos', 'reverso.webp'), 'webp');

  for (const k of Object.keys(process.env)) if (/^(GOOGLE_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
    ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), CARPETA_CARTAS: cartas });

  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  fantasy = await import('../server/fantasy.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
});

after(async () => { if (carpeta) await rm(carpeta, { recursive: true, force: true }); });

const porId = () => new Map(g.catalogo().map(c => [c.id, c]));

test('dos clases de carta: los jugadores de la tier list y las BOOST, de S+ a B, sin clan ni rol', () => {
  const cat = g.catalogo();
  const boosts = cat.filter(c => c.tipo === 'boost');
  assert.deepEqual(boosts.map(c => `${c.id} ${c.tier}`), ['BOOST-KAMI S+', 'BOOST-TENGU S', 'BOOST-KAPPA B'], 'se descartan las que están mal');
  assert.equal(cat.filter(c => c.tipo === 'jugador').length, 10);
  const kami = boosts[0];
  assert.equal(kami.clan, null);
  assert.equal(kami.rol, null);
  assert.equal(kami.subtitulo, 'Guardián del torneo');
  assert.equal(kami.peso, 0.5);
  assert.equal(porId().get('BOOST-KAPPA').subtitulo, 'Boost', 'sin subtítulo, «Boost»');
});

test('cada carta lleva su dibujo si existe y si no el de su clan o el sol partido', () => {
  const cat = porId();
  assert.match(cat.get('KAIJU-TOP').arte, /^\/cartas\/kaiju-top\.png\?v=[0-9a-z]+$/);
  assert.equal(cat.get('KAIJU-JUNGLA').arte, '/clanes/KAIJU.jpg');
  assert.equal(cat.get('TORA-TOP').arte, '/clanes/TORA.jpg');
  assert.equal(cat.get('BOOST-KAMI').arte, '/marca/sol-partido.jpg');
});

test('marcos por clase y tier, sin mezclar: la S de Jugador no usa uno de BOOST ni al revés', () => {
  const cat = porId();
  assert.match(cat.get('BOOST-KAMI').marco, /^\/cartas\/marcos\/boost\/SP\.webp\?v=/);
  assert.match(cat.get('KAIJU-ADC').marco, /^\/cartas\/marcos\/jugador\/C\.webp\?v=/, 'Jugador C');
  assert.equal(cat.get('KAIJU-SUPPORT').marco, null, 'la D sin marco propio va sin marco (nunca con la letra de otra tier)');
  assert.equal(cat.get('KAIJU-TOP').marco, null, 'la S de Jugador aún no tiene marco');
  assert.equal(cat.get('BOOST-TENGU').marco, null, 'la S de BOOST tampoco');
  assert.equal(g.claveTier('S+'), 'SP');
});

test('el reverso es el mismo para todas las cartas', () => {
  assert.match(g.reversoCarta(), /^\/cartas\/marcos\/reverso\.webp\?v=/);
});

test('las probabilidades salen de los pesos: S+ 0,5, S 1, A 3, B 6, C 10 y D 15, de las dos clases', () => {
  const p = g.probabilidades();
  const total = 2 * (1 + 3 + 6 + 10 + 15) + 0.5 + 1 + 6;
  assert.equal(p['S+'], 0.5 / total);
  assert.equal(p.S, 3 / total, 'dos jugadores S y una BOOST S');
  assert.equal(p.B, 18 / total, 'dos jugadores B y una BOOST B');
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

test('un sobre da 3 cartas con su clase, su dibujo y su marco, sin el peso del sorteo', async () => {
  const u = { id: 'u1', nombre: 'Ana' };
  assert.equal(await g.darAlta(u), true);
  const sobre = await g.abrirSobre(u);
  assert.equal(sobre.length, 3);
  for (const c of sobre) {
    assert.ok(['jugador', 'boost'].includes(c.tipo));
    assert.ok(c.arte, 'lleva arte');
    assert.ok('marco' in c);
    assert.equal('peso' in c, false);
  }
  assert.equal(g.estadoUsuario('u1').sobres, 1);
});

test('las BOOST no se pueden alinear en el fantasy', async () => {
  await assert.rejects(fantasy.cambiarAlineacion({ id: 'u1', nombre: 'Ana' }, { TOP: 'BOOST-KAMI' }), /no es de TOP/);
  await assert.rejects(fantasy.cambiarAlineacion({ id: 'u1', nombre: 'Ana' }, { TOP: 'KAIJU-JUNGLA' }), /no es de TOP/);
});
