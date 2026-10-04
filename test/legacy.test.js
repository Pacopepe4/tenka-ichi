// Cartas LEGACY: los jugadores del equipo Legacy. No salen entre las tres cartas del sobre: de vez en cuando un sobre
// trae, además, una de regalo. Son de colección: no se alinean en el fantasy ni sirven de BOOST.
// Una LEGACY no existe hasta que tiene su dibujo vertical: nunca sale con el splash de Riot.
// Todo con datos temporales y con la probabilidad de la carta extra al 100 % para que salga siempre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
let carpeta, g, fantasy;
const ana = { id: 'prueba-ana', nombre: 'Ana' };

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-legacy-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ equipos: {}, jugadores: Object.fromEntries(ROLES.map(r => [`KAIJU-${r}`, 'B'])) }));
  await writeFile(path.join(carpeta, 'boosts.json'), JSON.stringify([{ id: 'BOOST-TENGU', nombre: 'Tengu', tier: 'S', multiplicador: 2, condicion: 'dano' }]));
  await writeFile(path.join(carpeta, 'campeones.json'), JSON.stringify({ 'LEGACY-UNO': 'Aatrox' }));
  // Dos buenas; y otras que no valen: desactivada, sin nombre, que pisa a un jugador, que pisa a una BOOST, repetida y
  // una a la que aún le falta el dibujo. El clan solo cuenta si es un equipo Legacy
  await writeFile(path.join(carpeta, 'legacy.json'), JSON.stringify([
    { id: 'legacy-uno', nombre: 'UNO', subtitulo: 'DEMON', clan: 'AMATERATSU' },
    { id: 'LEGACY-DOS', nombre: 'DOS', clan: 'KAIJU' },
    { id: 'LEGACY-DORMIDA', nombre: 'DORMIDA', subtitulo: 'JUNGAP', activa: false },
    { id: 'LEGACY-SIN-NOMBRE' },
    { id: 'KAIJU-TOP', nombre: 'Impostor' },
    { id: 'BOOST-TENGU', nombre: 'Impostor' },
    { id: 'LEGACY-UNO', nombre: 'UNO repetida' },
    { id: 'LEGACY-SIN-DIBUJO', nombre: 'SIN DIBUJO', subtitulo: 'JUNGAP', clan: 'AMATERATSU' },
  ]));
  // Los dibujos verticales de las dos buenas (para el catálogo basta con que el archivo exista)
  await mkdir(path.join(carpeta, 'cartas', 'fullart'), { recursive: true });
  for (const id of ['LEGACY-UNO', 'LEGACY-DOS']) await writeFile(path.join(carpeta, 'cartas', 'fullart', `${id}.webp`), 'dibujo');
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_|LEGACY_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'), ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'),
    ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'), ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json'), CARPETA_CARTAS: path.join(carpeta, 'cartas'),
    PROBABILIDAD_LEGACY: '1' });
  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  fantasy = await import('../server/fantasy.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
  await fantasy.cargarFantasy();
});
after(() => rm(carpeta, { recursive: true, force: true }));

test('el catálogo lleva las LEGACY como clase aparte, sin peso en el sorteo', () => {
  const cat = g.catalogo(), legacy = cat.filter(c => c.tipo === 'legacy');
  assert.deepEqual(legacy.map(c => c.id), ['LEGACY-UNO', 'LEGACY-DOS'], 'la que no tiene dibujo no está: ni en el álbum ni en los sobres');
  const uno = legacy[0];
  assert.deepEqual([uno.nombre, uno.tier, uno.subtitulo, uno.clan, uno.rol, uno.bonus, uno.peso], ['UNO', 'LEGACY', 'DEMON', 'AMATERATSU', null, null, 0]);
  assert.ok(uno.fullart?.startsWith('/cartas/fullart/LEGACY-UNO.webp?v='), 'se pinta con su dibujo vertical, a carta completa');
  assert.equal(uno.marco, null);
  assert.deepEqual([legacy[1].subtitulo, legacy[1].clan], ['Legacy', null], 'sin título propio y con un clan que no es Legacy');
  // No cambian las probabilidades de las cartas normales ni cuentan como cartas de los sobres
  const p = g.probabilidades(cat);
  assert.ok(Math.abs(Object.values(p).reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.equal(p.LEGACY, undefined);
  assert.deepEqual([g.resumenGacha().cartas, g.resumenGacha().legacy], [6, 2]);
});

test('la carta extra: sale según la probabilidad y nunca entre las tres del sobre', async () => {
  const legacy = g.catalogo().filter(c => c.tipo === 'legacy');
  assert.equal(g.PROBABILIDAD_LEGACY, 1);
  assert.equal(g.sacarLegacy(legacy, 0), null);
  assert.equal(g.sacarLegacy([], 1), null);
  assert.equal(g.sacarLegacy(legacy, 0.03, () => 0.5), null, 'con un 3 %, la mayoría de los sobres no la traen');
  assert.equal(g.sacarLegacy(legacy, 0.03, () => 0.01).id, 'LEGACY-UNO');
  assert.equal(g.sacarLegacy(legacy, 1, () => 0.999999).id, 'LEGACY-DOS');

  await g.darAlta(ana);
  await g.darSobres(ana, 10, 'regalo', 'prueba');
  for (let i = 0; i < 12; i++) {
    const sobre = await g.abrirSobre(ana);
    assert.equal(sobre.length, 4, 'tres cartas y la extra');
    assert.ok(sobre.slice(0, 3).every(c => c.tipo !== 'legacy' && !c.extra), 'las tres del sobre son de las normales');
    assert.deepEqual([sobre[3].tipo, sobre[3].extra, sobre[3].tier], ['legacy', true, 'LEGACY']);
    assert.equal(sobre[3].peso, undefined);
  }
  const mias = Object.fromEntries(g.estadoUsuario(ana.id).cartas.map(c => [c.id, c.cantidad]));
  assert.equal((mias['LEGACY-UNO'] || 0) + (mias['LEGACY-DOS'] || 0), 12);
});

test('las LEGACY son de colección: ni se alinean ni sirven de BOOST, pero las repetidas se funden', async () => {
  const mias = new Map(g.estadoUsuario(ana.id).cartas.map(c => [c.id, c.cantidad]));
  const legacy = ['LEGACY-UNO', 'LEGACY-DOS'].find(id => mias.get(id) >= 6);
  assert.ok(legacy, 'con doce extras, de alguna hay seis o más');
  await assert.rejects(fantasy.cambiarAlineacion(ana, { TOP: legacy }), /no es de TOP/);
  const top = [...mias.keys()].find(id => id === 'KAIJU-TOP');
  if (top) await assert.rejects(fantasy.cambiarAlineacion(ana, { TOP: top, boosts: [{ carta: legacy, rol: 'TOP' }] }), /no es una BOOST/);
  const antes = g.estadoUsuario(ana.id).sobres;
  const r = await g.fundirRepetidas(ana, { [legacy]: 5 });
  assert.deepEqual(r, { sobres: 1, cartas: 5 });
  assert.equal(g.estadoUsuario(ana.id).sobres, antes + 1);
});

test('las LEGACY del proyecto: los cuatro de Amateratsu con carta, y Dextyle guardado sin activar', async () => {
  const lista = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'cartas-legacy.json'), 'utf8'));
  const activas = lista.filter(c => c.activa !== false);
  assert.deepEqual(activas.map(c => [c.nombre, c.subtitulo]), [['GATTSU', 'DEMON'], ['MAKITAH', 'EL TITIRITERO'], ['D4DT0R', 'THEBEAST'], ['SERGI', 'THE ENGAGE']]);
  assert.ok(lista.every(c => c.clan === 'AMATERATSU' && /^LEGACY-[A-Z0-9]+$/.test(c.id)));
  assert.deepEqual(lista.filter(c => c.activa === false).map(c => [c.nombre, c.subtitulo]), [['DEXTYLE', 'JUNGAP']]);
  const campeones = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'campeones-cartas.json'), 'utf8'));
  assert.deepEqual(activas.map(c => campeones[c.id]), ['Aatrox', 'Tristana', 'Aphelios', 'Rell']);
});
