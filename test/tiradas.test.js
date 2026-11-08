// Tiradas del gachapon (08/11/2026, server/gacha.js): abrir varios sobres de una vez, la garantía de rareza (A segura tras
// 5 sobres sin A, S segura tras 10 sin S, y si ya tienes todas las de esa tier, baja), el premio por familia completa
// (un sobre y la carta del jefe) y la fusión por tiers (3 repetidas de una tier por una de la siguiente).
// Con dos familias, KAIJU y TORA, y una tier para cada jugador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const TIERS = { KAIJU: ['S', 'A', 'B', 'C', 'D'], TORA: ['A', 'B', 'C', 'D', 'D'] };
const F = '2026-11-08T18:00:00.000Z';
let carpeta, g;
const mov = (id, usuario, tipo, detalle, cantidad, rareza = '') => ({ fecha: F, id, usuario, tipo, detalle, cantidad, rareza });
// n sobres abiertos que solo han traído una D: rachas de n sin A y sin S
const sinSuerte = (id, usuario, n) => Array.from({ length: n }, (_, i) => [mov(id, usuario, 'apertura', `x${i}`, -1), mov(id, usuario, 'carta', 'TORA-SUPPORT', 1, 'D')]).flat();
const quien = (id, nombre) => ({ id, nombre });
const ana = quien('d-ana', 'Ana'), beto = quien('d-beto', 'Beto'), carla = quien('d-carla', 'Carla'), dani = quien('d-dani', 'Dani'), eva = quien('d-eva', 'Eva');
const BETOS = Array.from({ length: 6 }, (_, i) => quien(`d-beto${i}`, `Beto${i}`));
const RANGO = { 'S+': 0, S: 1, A: 2, B: 3, C: 4, D: 5 };

const REGISTRO = [
  mov(ana.id, 'Ana', 'alta', '', 20),
  // Beto (seis cuentas) ya tiene la única S y lleva 10 sobres sin S: su S segura tiene que bajar a una A que le falte
  ...BETOS.flatMap(b => [mov(b.id, b.nombre, 'alta', '', 11), mov(b.id, b.nombre, 'carta', 'KAIJU-TOP', 1, 'S'), ...sinSuerte(b.id, b.nombre, 10)]),
  // Carla, 10 sin S: le toca la S segura
  mov(carla.id, 'Carla', 'alta', '', 11), ...sinSuerte(carla.id, 'Carla', 10),
  // Dani tiene la familia KAIJU entera y un sobre
  mov(dani.id, 'Dani', 'alta', '', 1), ...ROLES.map(r => mov(dani.id, 'Dani', 'carta', `KAIJU-${r}`, 1, '')),
  // Eva, para fundir por tiers: cuatro copias de una D, dos de otra D, cuatro de una A y cuatro de la S
  mov(eva.id, 'Eva', 'alta', '', 0), ...Array(4).fill(mov(eva.id, 'Eva', 'carta', 'KAIJU-SUPPORT', 1, 'D')),
  ...Array(2).fill(mov(eva.id, 'Eva', 'carta', 'TORA-ADC', 1, 'D')), ...Array(4).fill(mov(eva.id, 'Eva', 'carta', 'KAIJU-JUNGLA', 1, 'A')),
  ...Array(4).fill(mov(eva.id, 'Eva', 'carta', 'KAIJU-TOP', 1, 'S')),
];

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-tiradas-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  plantillas.TORA.jugadores = ['Pablo', 'El 64', 'Manu', 'Narciso', 'Jeeda'];
  const archivo = n => path.join(carpeta, n);
  await writeFile(archivo('plantillas.json'), JSON.stringify(plantillas));
  await writeFile(archivo('tierlist.json'), JSON.stringify({ equipos: {}, jugadores: Object.fromEntries(Object.entries(TIERS).flatMap(([c, ts]) => ROLES.map((r, i) => [`${c}-${r}`, ts[i]]))) }));
  for (const [n, contenido] of [['boosts.json', '[]'], ['campeones.json', '{}'], ['legacy.json', '[]'], ['gacha.json', JSON.stringify(REGISTRO)]]) await writeFile(archivo(n), contenido);
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_|RENDER|GACHA_|PROBABILIDAD_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: archivo('plantillas.json'), ARCHIVO_BOOSTS: archivo('boosts.json'),
    ARCHIVO_CAMPEONES: archivo('campeones.json'), ARCHIVO_LEGACY: archivo('legacy.json'), CARPETA_CARTAS: archivo('cartas') });
  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
});
after(() => rm(carpeta, { recursive: true, force: true }));

test('el catálogo trae los siete jefes y ninguna conmemorativa en la temporada 1; ninguno entra en el sorteo', () => {
  const cat = g.catalogo();
  assert.deepEqual(cat.filter(c => c.tipo === 'jefe').map(c => c.id).sort(),
    ['JEFE-AMATERATSU', 'JEFE-ATSUI', 'JEFE-BUSHI', 'JEFE-KAIJU', 'JEFE-KEMONO', 'JEFE-SARU', 'JEFE-TORA']);
  const jefe = cat.find(c => c.id === 'JEFE-ATSUI');
  assert.deepEqual([jefe.tier, jefe.peso, jefe.subtitulo, jefe.arte], ['JEFE', 0, 'Oyabun de Ryūjin', '/personajes/ATSUI.jpg']);
  assert.equal(cat.filter(c => c.tipo === 'temporada').length, 0);
  assert.equal(g.cartasDeColeccion(cat).length, 10, 'el álbum son las diez de jugador');
});

test('tirar cinco de una vez: cinco tiradas de cuatro cartas, con «nueva» y «copias» contadas en orden', async () => {
  const tiradas = await g.abrirSobres(ana, 5);
  assert.equal(tiradas.length, 5);
  const vistas = new Map();
  for (const t of tiradas) {
    const normales = t.cartas.filter(c => !c.extra);
    assert.equal(normales.length, 4);
    assert.equal(new Set(normales.map(c => c.id)).size, 4, 'sin repetir dentro de la tirada');
    for (const c of [...t.cartas, ...t.premios.map(p => p.carta)]) {
      vistas.set(c.id, (vistas.get(c.id) || 0) + 1);
      assert.equal(c.copias, vistas.get(c.id));
      assert.equal(c.nueva, vistas.get(c.id) === 1);
      assert.equal('peso' in c, false);
    }
  }
  // Con solo diez cartas, en cinco tiradas puede completar una familia: cada premio es un sobre más
  const e = g.estadoUsuario(ana.id), premios = tiradas.flatMap(t => t.premios).length;
  assert.equal(e.sobres, 15 + premios);
  assert.deepEqual(Object.fromEntries(e.cartas.map(c => [c.id, c.cantidad])), Object.fromEntries(vistas));
});

test('«todos» abre los que quedan; y no se pueden abrir más de los que tienes', async () => {
  const quedan = g.estadoUsuario(ana.id).sobres;
  await assert.rejects(g.abrirSobres(ana, quedan + 1), new RegExp(`Solo te quedan ${quedan} tiradas`));
  await assert.rejects(g.abrirSobres(ana, 0), /de 1 a 50 veces/);
  const todas = await g.abrirSobres(ana, 'todos');
  assert.equal(todas.length, quedan);
  // Los sobres de los premios de familia que salen por el camino no se abren en la misma tanda
  assert.equal(g.estadoUsuario(ana.id).sobres, todas.flatMap(t => t.premios).length);
  while (g.estadoUsuario(ana.id).sobres) await g.abrirSobres(ana, 'todos');
  await assert.rejects(g.abrirSobres(ana, 1), /No te quedan tiradas/);
});

test('tras 10 sobres sin S, la siguiente tirada trae una S segura, y la racha vuelve a cero', async () => {
  assert.deepEqual(g.garantiaDe(carla.id), { sinA: 10, sinS: 10, umbralA: 5, umbralS: 10 });
  const [t] = await g.abrirSobres(carla, 1);
  assert.ok(t.cartas.some(c => RANGO[c.tier] <= RANGO.S), `sin S: ${t.cartas.map(c => c.tier)}`);
  if (t.garantia) assert.deepEqual(t.cartas.filter(c => c.garantia).map(c => [c.id, c.garantia]), [['KAIJU-TOP', 'S']]);
  assert.deepEqual([g.garantiaDe(carla.id).sinS, g.garantiaDe(carla.id).sinA], [0, 0]);
});

test('si ya tienes todas las S, la S segura baja a una A que te falte', async () => {
  let bajadas = 0;
  for (const b of BETOS) {
    const [t] = await g.abrirSobres(b, 1);
    if (t.cartas.some(c => c.tier === 'S')) continue;   // la S le ha salido sola: la garantía no hace falta
    const segura = t.cartas.find(c => c.garantia);
    assert.ok(segura, 'lleva carta segura');
    assert.deepEqual([t.garantia, segura.garantia, segura.nueva], ['S', 'S', true]);
    // Una A que le falte; si las dos A ya han salido en esta misma tirada, la de debajo (B)
    const aEnLaTirada = t.cartas.filter(c => c.tier === 'A' && c !== segura).length;
    assert.equal(segura.tier, aEnLaTirada === 2 ? 'B' : 'A', `segura ${segura.id} ${segura.tier}`);
    bajadas++;
  }
  assert.ok(bajadas > 0, 'en seis tiradas, alguna sin S natural');
});

test('la carta segura no cuenta como S: la racha sin S sigue hasta que salga una S de verdad', () => {
  for (const b of BETOS) {
    const e = g.garantiaDe(b.id);
    assert.ok(e.sinS === 0 || e.sinS === 11, `racha sin S: ${e.sinS}`);
    assert.equal(e.sinA, 0, 'la A segura sí corta la racha sin A');
  }
});

test('familia completa: con la siguiente operación llega un sobre y la carta de su jefe, una sola vez', async () => {
  const [t] = await g.abrirSobres(dani, 1);
  assert.deepEqual(t.premios.map(p => [p.tipo, p.clan, p.sobres, p.carta.id, p.carta.nueva, p.carta.extra]), [['familia', 'KAIJU', 1, 'JEFE-KAIJU', true, true]]);
  const e = g.estadoUsuario(dani.id);
  assert.deepEqual([e.sobres, e.familias, e.cartas.find(c => c.id === 'JEFE-KAIJU')?.cantidad], [1, ['KAIJU'], 1]);
  const [otra] = await g.abrirSobres(dani, 1);
  assert.ok(!otra.premios.some(p => p.clan === 'KAIJU'), 'el premio de KAIJU no se repite');
});

test('abrir un sobre como siempre devuelve sus cartas y, detrás, el jefe si se completa una familia', async () => {
  const cuenta = quien('d-fran', 'Fran');
  await g.darSobres(cuenta, 1, 'regalo', 'prueba');
  const sobre = await g.abrirSobre(cuenta);
  assert.equal(sobre.filter(c => !c.extra).length, 4);
});

test('fusión por tiers: tres repetidas de la misma tier por una carta de la siguiente', async () => {
  const r = await g.fundirPorTier(eva, { 'KAIJU-SUPPORT': 2, 'TORA-ADC': 1 });
  assert.equal(r.fundidas, 3);
  assert.equal(r.cartas.length, 1);
  assert.equal(r.cartas[0].tier, 'C');
  const mias = Object.fromEntries(g.estadoUsuario(eva.id).cartas.map(c => [c.id, c.cantidad]));
  assert.deepEqual([mias['KAIJU-SUPPORT'], mias['TORA-ADC']], [2, 1]);
  assert.equal(g.estadoUsuario(eva.id).sobres, 0, 'no da sobres');
  assert.equal(g.garantiaDe(eva.id).sinA, 0, 'y no toca la racha');
});

test('fusión por tiers: lo que no se puede', async () => {
  await assert.rejects(g.fundirPorTier(eva, { 'KAIJU-SUPPORT': 1, 'KAIJU-JUNGLA': 2 }), /misma tier/);
  await assert.rejects(g.fundirPorTier(eva, { 'KAIJU-JUNGLA': 1 }), /de 3 en 3/);
  await assert.rejects(g.fundirPorTier(eva, { 'KAIJU-TOP': 3 }), /no se mejoran/);
  await assert.rejects(g.fundirPorTier(eva, { 'TORA-ADC': 3 }), /copias que te sobran/, 'la última copia no se funde');
  await assert.rejects(g.fundirPorTier(eva, { 'JEFE-KAIJU': 3 }), /jugador o BOOST/);
});

test('de A sale una S (aquí solo hay una)', async () => {
  const r = await g.fundirPorTier(eva, { 'KAIJU-JUNGLA': 3 });
  assert.equal(r.cartas[0].id, 'KAIJU-TOP');
});
