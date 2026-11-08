// Carta conmemorativa (08/11/2026, estrenarTemporada en server/gacha.js): quien acaba una temporada con 30 cartas distintas
// (de jugador, BOOST o LEGACY) se lleva la de esa temporada al estrenarse la siguiente, y las conmemorativas que ya tenía
// no se pierden. Se estrena la temporada 3 con el registro de la 2 en un archivo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'], FAMILIAS = ['SARU', 'ATSUI', 'KAIJU', 'KEMONO', 'TORA', 'BUSHI'];
const F = '2026-11-08T18:00:00.000Z';
const TODAS = FAMILIAS.flatMap(c => ROLES.map(r => `${c}-${r}`));   // las 30 de jugador
let carpeta, g;
const mov = (id, usuario, tipo, detalle, cantidad, rareza = '') => ({ fecha: F, id, usuario, tipo, detalle, cantidad, rareza });
const cartas = (id, usuario, ids) => ids.map(c => mov(id, usuario, 'carta', c, 1, 'C'));

// La temporada 2: Fran acaba con las 30 (una repetida) y ya tenía la de la 1; Gus, con 29 y muchas repetidas; Hana solo
// tiene la de la 1; Iker no tiene ninguna
const TEMPORADA_2 = [
  mov('d-fran', 'Fran', 'alta', '', 3), ...cartas('d-fran', 'Fran', [...TODAS, TODAS[0]]), mov('d-fran', 'Fran', 'premio-carta', 'TEMPORADA-T1', 1, 'TEMPORADA'),
  mov('d-gus', 'Gus', 'alta', '', 3), ...cartas('d-gus', 'Gus', [...TODAS.slice(1), ...TODAS.slice(1), ...TODAS.slice(1)]),
  mov('d-hana', 'Hana', 'alta', '', 3), mov('d-hana', 'Hana', 'premio-carta', 'TEMPORADA-T1', 1, 'TEMPORADA'),
  mov('d-iker', 'Iker', 'alta', '', 3),
];

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-conmemorativa-'));
  const archivo = n => path.join(carpeta, n);
  await writeFile(archivo('plantillas.json'), await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  await writeFile(archivo('tierlist.json'), JSON.stringify({ equipos: {}, jugadores: Object.fromEntries(TODAS.map(id => [id, 'C'])) }));
  for (const [n, contenido] of [['boosts.json', '[]'], ['campeones.json', '{}'], ['legacy.json', '[]'], ['gacha-t2.json', JSON.stringify(TEMPORADA_2)]]) await writeFile(archivo(n), contenido);
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_|RENDER|GACHA_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { GACHA_TEMPORADA: '3', CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: archivo('plantillas.json'), ARCHIVO_BOOSTS: archivo('boosts.json'),
    ARCHIVO_CAMPEONES: archivo('campeones.json'), ARCHIVO_LEGACY: archivo('legacy.json'), CARPETA_CARTAS: archivo('cartas') });
  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
});
after(() => rm(carpeta, { recursive: true, force: true }));

const suyas = id => g.estadoUsuario(id).cartas.map(c => c.id).sort();

test('en la temporada 3 existen las conmemorativas de la 1 y de la 2, de premio: no entran en el sorteo ni en el álbum', () => {
  const cat = g.catalogo(), conmemorativas = cat.filter(c => c.tipo === 'temporada');
  assert.deepEqual(conmemorativas.map(c => [c.id, c.tier, c.temporada, c.peso]), [['TEMPORADA-T1', 'TEMPORADA', 1, 0], ['TEMPORADA-T2', 'TEMPORADA', 2, 0]]);
  assert.equal(g.cartasDeColeccion(cat).length, 30);
});

test('al estrenar la 3: la de la 2 para quien acabó con 30 distintas, y cada uno conserva las que ya tenía', async () => {
  assert.deepEqual(await g.estrenarTemporada(), { cuentas: 4 });
  assert.deepEqual(suyas('d-fran'), ['TEMPORADA-T1', 'TEMPORADA-T2'], 'Fran: la de la 1 y la de la 2; ninguna carta más');
  assert.deepEqual(suyas('d-gus'), [], 'Gus se queda en 29 distintas, por muchas repetidas que tenga');
  assert.deepEqual(suyas('d-hana'), ['TEMPORADA-T1']);
  assert.deepEqual(suyas('d-iker'), []);
  assert.deepEqual(['d-fran', 'd-gus', 'd-hana', 'd-iker'].map(id => g.estadoUsuario(id).sobres), [3, 3, 3, 3], 'y todos con sus sobres de bienvenida');
});

test('estrenar otra vez no da las conmemorativas dos veces', async () => {
  assert.equal(await g.estrenarTemporada(), null);
  await g.cargarGacha();
  assert.deepEqual(suyas('d-fran'), ['TEMPORADA-T1', 'TEMPORADA-T2']);
});
