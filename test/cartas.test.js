// Cartas del gachapon: dos clases (Jugador y BOOST), la parte del sorteo de cada tier, arte, marcos por clase y
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
    { id: 'boost-kami', nombre: 'Kami', tier: 'S+', subtitulo: 'Guardián del torneo', multiplicador: 3, condicion: 'dano' },
    { id: 'BOOST-TENGU', nombre: 'Tengu', tier: 'S', multiplicador: 2, condicion: 'inventada' },
    { id: 'BOOST-KAPPA', nombre: 'Kappa', tier: 'B', multiplicador: 1, condicion: 'cs' },
    { id: 'BOOST-SIN-NOMBRE', tier: 'A' },
    { id: 'BOOST-FLOJA', nombre: 'Floja', tier: 'C' },
    { id: 'KAIJU-TOP', nombre: 'Impostor', tier: 'S' },
    { id: 'BOOST-DORMIDA', nombre: 'Dormida', tier: 'A', activa: false },
    { id: 'BOOST-KAMI', nombre: 'Kami repetida', tier: 'S' },
  ]));
  // Campeones: uno con el id en minúsculas, uno que Data Dragon no conoce y uno de BOOST
  await writeFile(path.join(carpeta, 'campeones.json'), JSON.stringify({
    'KAIJU-TOP': 'Rumble', 'kaiju-jungla': 'RekSai', 'TORA-TOP': 'NoExisteEsteCampeon', 'BOOST-KAMI': 'Ornn' }));
  // Dibujo de una carta (con el nombre en minúsculas), marcos de Jugador C y BOOST S+, y el reverso
  const cartas = path.join(carpeta, 'cartas');
  await mkdir(path.join(cartas, 'marcos', 'jugador'), { recursive: true });
  await mkdir(path.join(cartas, 'marcos', 'boost'), { recursive: true });
  await writeFile(path.join(cartas, 'kaiju-top.png'), 'png');
  await writeFile(path.join(cartas, 'notas.txt'), 'no es un dibujo');
  await writeFile(path.join(cartas, 'marcos', 'jugador', 'C.webp'), 'webp');
  await writeFile(path.join(cartas, 'marcos', 'boost', 'SP.webp'), 'webp');
  await writeFile(path.join(cartas, 'marcos', 'reverso.webp'), 'webp');
  // Dibujo «full art» (vertical) de una BOOST; el de la carpeta fullart no cuenta como dibujo cuadrado
  await mkdir(path.join(cartas, 'fullart'), { recursive: true });
  await writeFile(path.join(cartas, 'fullart', 'boost-kami.webp'), 'webp');

  for (const k of Object.keys(process.env)) if (/^(GOOGLE_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
    ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'), CARPETA_CARTAS: cartas,
    ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json') });   // sin las LEGACY del proyecto (tienen su prueba en legacy.test.js)

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
  assert.equal(kami.peso, 0.3, 'la parte de la S+ entera: es su única carta');
  assert.equal(porId().get('BOOST-KAPPA').subtitulo, 'Boost', 'sin subtítulo, «Boost»');
});

test('cada carta lleva su campeón de Data Dragon, sea jugador o BOOST; sin campeón o con uno desconocido, null', () => {
  const cat = porId();
  assert.deepEqual(cat.get('KAIJU-TOP').campeon, { id: 'Rumble', nombre: 'Rumble' });
  assert.deepEqual(cat.get('KAIJU-JUNGLA').campeon, { id: 'RekSai', nombre: "Rek'Sai" }, 'el id del archivo puede ir en minúsculas');
  assert.deepEqual(cat.get('BOOST-KAMI').campeon, { id: 'Ornn', nombre: 'Ornn' });
  assert.equal(cat.get('TORA-TOP').campeon, null, 'un campeón que Data Dragon no conoce se descarta');
  assert.equal(cat.get('TORA-JUNGLA').campeon, null, 'sin campeón apuntado');
});

test('el multiplicador de una BOOST solo vale con una condición conocida y más de ×1', async () => {
  const { CAMPO_CONDICION } = await import('../server/puntuacion.js');
  assert.deepEqual(Object.keys(g.CONDICIONES_BOOST).sort(), Object.keys(CAMPO_CONDICION).sort(), 'cada condición tiene su dato en la puntuación');
  const cat = porId();
  assert.deepEqual(cat.get('BOOST-KAMI').bonus,
    { multiplicador: 3, condicion: 'dano', etiqueta: '×3 · más daño', texto: '×3 si es el que más daño hace de la partida' });
  assert.equal(cat.get('BOOST-TENGU').bonus, null, 'condición inventada');
  assert.equal(cat.get('BOOST-KAPPA').bonus, null, '×1 no es un bonus');
  assert.equal('bonus' in cat.get('KAIJU-TOP'), false, 'los jugadores no tienen bonus');
  for (const [condicion, c] of Object.entries(g.CONDICIONES_BOOST)) assert.ok(c.texto && c.corto, condicion);
});

test('el fondo de cada carta: su dibujo si existe, si no el splash de su campeón, si no el de su clan o el sol partido', () => {
  const cat = porId();
  assert.match(cat.get('KAIJU-TOP').arte, /^\/cartas\/kaiju-top\.png\?v=[0-9a-z]+$/, 'el dibujo propio gana al splash de Rumble');
  assert.equal(cat.get('KAIJU-JUNGLA').arte, '/ddragon/splash/RekSai.jpg');
  assert.equal(cat.get('BOOST-KAMI').arte, '/ddragon/splash/Ornn.jpg', 'también las BOOST');
  assert.equal(cat.get('TORA-TOP').arte, '/clanes/TORA.jpg', 'con un campeón que no existe, el clan');
  assert.equal(cat.get('TORA-JUNGLA').arte, '/clanes/TORA.jpg', 'sin campeón, el clan');
  assert.equal(cat.get('BOOST-TENGU').arte, '/marca/sol-partido.jpg', 'una BOOST sin campeón, el sol partido');
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

test('carta «full art»: solo la que tiene dibujo vertical en fullart/, y conserva su dibujo cuadrado y su marco', () => {
  const cat = porId();
  const kami = cat.get('BOOST-KAMI');
  assert.match(kami.fullart, /^\/cartas\/fullart\/boost-kami\.webp\?v=[0-9a-z]+$/);
  assert.equal(kami.arte, '/ddragon/splash/Ornn.jpg', 'el fondo cuadrado no cambia: lo usan las imágenes de compartir');
  assert.match(kami.marco, /^\/cartas\/marcos\/boost\/SP\.webp\?v=/, 'el marco tampoco');
  assert.equal(cat.get('BOOST-TENGU').fullart, null);
  assert.equal(cat.get('KAIJU-TOP').fullart, null, 'un dibujo cuadrado no es full art');
});

test('el reverso es el mismo para todas las cartas', () => {
  assert.match(g.reversoCarta(), /^\/cartas\/marcos\/reverso\.webp\?v=/);
});

const cerca = (a, b, texto) => assert.ok(Math.abs(a - b) < 1e-12, `${texto || ''} ${a} frente a ${b}`);

test('cada tier tiene su parte del sorteo, haya las cartas que haya: S+ 0,3 %, S 1,2 %, A 6,5 %, B 22 %, C 30 % y D 40 %', () => {
  const p = g.probabilidades();
  assert.deepEqual(Object.keys(p), ['S+', 'S', 'A', 'B', 'C', 'D']);
  for (const [t, parte] of Object.entries({ 'S+': 0.003, S: 0.012, A: 0.065, B: 0.22, C: 0.3, D: 0.4 })) cerca(p[t], parte, t);
  cerca(p.S + p['S+'], 0.015, 'una S o una S+: 3 de cada 200 cartas');
  cerca(p.B + p.C + p.D, 0.92, 'casi todo es de las tiers bajas');
  // La parte de una tier se la reparten por igual sus cartas, sean de Jugador o BOOST
  const cat = porId();
  for (const id of ['KAIJU-TOP', 'TORA-TOP', 'BOOST-TENGU']) cerca(cat.get(id).peso, 1.2 / 3, id);
  for (const id of ['KAIJU-MEDIO', 'TORA-MEDIO', 'BOOST-KAPPA']) cerca(cat.get(id).peso, 22 / 3, id);
  for (const id of ['KAIJU-SUPPORT', 'TORA-SUPPORT']) cerca(cat.get(id).peso, 40 / 2, id);
});

test('si una tier no tiene cartas, su parte se reparte entre las demás en proporción', () => {
  const p = g.probabilidades(g.catalogo().filter(c => c.tier !== 'D'));
  assert.equal(p.D, 0);
  cerca(p.C, 30 / 60);
  cerca(p['S+'], 0.3 / 60);
  cerca(Object.values(p).reduce((s, x) => s + x, 0), 1, 'suman 1');
});

test('los sobres no se abren mientras no hay cartas de Jugador: solo con las BOOST saldrían todas de las mejores', () => {
  const cat = g.catalogo(), boosts = cat.filter(c => c.tipo === 'boost');
  assert.equal(g.sobresListos(cat), true);
  assert.equal(g.sobresListos(boosts), false);
  assert.equal(g.sobresListos([]), false);
  assert.equal(g.resumenGacha().listos, true);
});

test('el sorteo respeta la parte de cada tier, también la de la S+, que es muy pequeña', () => {
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
  assert.equal(g.estadoUsuario('u1').sobres, g.SOBRES_INICIALES - 1);
  assert.equal(g.SOBRES_INICIALES, 3, 'tres sobres de bienvenida');
});

test('las BOOST no ocupan un hueco de rol en el fantasy', async () => {
  await assert.rejects(fantasy.cambiarAlineacion({ id: 'u1', nombre: 'Ana' }, { TOP: 'BOOST-KAMI' }), /no es de TOP/);
  await assert.rejects(fantasy.cambiarAlineacion({ id: 'u1', nombre: 'Ana' }, { TOP: 'KAIJU-JUNGLA' }), /no es de TOP/);
});

// ---------- BOOST vinculadas a un jugador ----------
// Para tener justo las cartas que hacen falta, todas las tiers salen igual y se abren sobres hasta que salgan
async function coleccionar(u, quiero) {
  await g.darAlta(u);
  await g.darSobres(u, 300, 'regalo');
  for (let i = 0; i < 300; i++) {
    const tengo = new Map(g.estadoUsuario(u.id).cartas.map(c => [c.id, c.cantidad]));
    if (quiero.every(([id, n]) => (tengo.get(id) || 0) >= n)) return;
    await g.abrirSobre(u);
  }
  throw new Error('No han salido las cartas que hacían falta');
}
const ROLES_LIGA = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const bea = { id: 'bea', nombre: 'Bea' };
const alinear = (slots, u = bea) => fantasy.cambiarAlineacion(u, slots);
// Las fechas llevan milisegundos: una pausa evita que una alineación y una partida caigan en el mismo
const pausa = () => new Promise(r => setTimeout(r, 5));

test('una alineación lleva hasta 2 BOOST, cada una con un jugador alineado y un jugador solo lleva una', async () => {
  const pesos = { ...g.PESOS };
  Object.keys(g.PESOS).forEach(t => { g.PESOS[t] = 1; });
  try { await coleccionar(bea, [['KAIJU-TOP', 1], ['KAIJU-JUNGLA', 1], ['BOOST-KAMI', 2], ['BOOST-TENGU', 1], ['BOOST-KAPPA', 1]]); }
  finally { Object.assign(g.PESOS, pesos); }

  const base = { TOP: 'KAIJU-TOP', JUNGLA: 'KAIJU-JUNGLA' };
  const ok = await alinear({ ...base, boosts: [{ carta: 'BOOST-KAMI', rol: 'TOP' }, { carta: 'BOOST-TENGU', rol: 'JUNGLA' }] });
  assert.deepEqual(ok.boosts, [{ carta: 'BOOST-KAMI', rol: 'TOP' }, { carta: 'BOOST-TENGU', rol: 'JUNGLA' }]);
  assert.deepEqual(fantasy.infoFantasy(bea).yo.alineacion.boosts, ok.boosts, 'la página la recibe igual');

  await assert.rejects(alinear({ ...base, boosts: [{ carta: 'BOOST-KAMI', rol: 'TOP' }, { carta: 'BOOST-TENGU', rol: 'JUNGLA' }, { carta: 'BOOST-KAPPA', rol: 'TOP' }] }),
    /máximo 2 BOOST/);
  await assert.rejects(alinear({ ...base, boosts: [{ carta: 'BOOST-KAMI', rol: 'TOP' }, { carta: 'BOOST-TENGU', rol: 'TOP' }] }), /solo puede llevar una BOOST/);
  await assert.rejects(alinear({ ...base, boosts: [{ carta: 'BOOST-KAMI', rol: 'MEDIO' }] }), /tiene que ir con un jugador alineado/, 'el medio está vacío');
  await assert.rejects(alinear({ ...base, boosts: [{ carta: 'BOOST-KAMI', rol: 'INVENTADO' }] }), /jugador alineado/);
  await assert.rejects(alinear({ ...base, boosts: [{ carta: 'KAIJU-TOP', rol: 'TOP' }] }), /no es una BOOST/, 'un jugador no vale de BOOST');
  await assert.rejects(alinear({ ...base, boosts: 'BOOST-KAMI' }), /máximo 2 BOOST/);
  await assert.rejects(alinear({ boosts: [{ carta: 'BOOST-KAMI', rol: 'TOP' }] }, { id: 'cai', nombre: 'Cai' }), /Solo puedes usar BOOST que tengas/);

  // Con dos copias de la misma BOOST se pueden vincular a dos jugadores; sin alineación previa no hay BOOST
  const dos = await alinear({ ...base, boosts: [{ carta: 'BOOST-KAMI', rol: 'TOP' }, { carta: 'BOOST-KAMI', rol: 'JUNGLA' }] });
  assert.equal(dos.boosts.length, 2);
  const sola = await alinear({ boosts: [null, null] });
  assert.deepEqual(sola.boosts, [null, null]);
  assert.deepEqual(fantasy.infoFantasy(null).boostsMaximos, 2);
});

test('el bonus de una BOOST multiplica los puntos de su jugador solo si cumple la condición en esa partida', async () => {
  await alinear({ TOP: 'KAIJU-TOP', JUNGLA: 'KAIJU-JUNGLA', boosts: [{ carta: 'BOOST-KAMI', rol: 'TOP' }, null] });
  await pausa();
  const fila = (clan, rol, extra) => ({ jornada: 'J1', fase: 'liga', clan, rol, jugador: `${clan}-${rol}`, id: `${clan}-${rol}`,
    victoria: clan === 'KAIJU', mvp: false, k: 2, d: 2, a: 3, cs: 100, vision: 10, dano: 10000, ...extra });
  const jugar = (partida, danos) => fantasy.guardarEstadisticas(partida,
    ['KAIJU', 'TORA'].flatMap(clan => ROLES_LIGA.map(rol => fila(clan, rol, { dano: `${clan}-${rol}` in danos ? danos[`${clan}-${rol}`] : 10000 }))));
  const puntos = (resultado, id) => resultado.find(p => p.id === id).puntos;

  // Partida 1: KAIJU-TOP hace el máximo daño (BOOST-KAMI: ×3 si es el que más daño hace)
  const p1 = await jugar('P1', { 'KAIJU-TOP': 30000 });
  const top1 = puntos(p1, 'KAIJU-TOP'), jungla1 = puntos(p1, 'KAIJU-JUNGLA');
  let yo = fantasy.infoFantasy(bea).yo;
  assert.equal(yo.puntos, top1 * 3 + jungla1, 'los puntos de su jugador se triplican');
  assert.equal(yo.puntosBoost, top1 * 2);

  // Partida 2: otro jugador hace más daño → sin bonus
  const p2 = await jugar('P2', { 'KAIJU-TOP': 12000, 'TORA-ADC': 40000 });
  yo = fantasy.infoFantasy(bea).yo;
  assert.equal(yo.puntos, top1 * 3 + jungla1 + puntos(p2, 'KAIJU-TOP') + puntos(p2, 'KAIJU-JUNGLA'));
  assert.equal(yo.puntosBoost, top1 * 2, 'no suma más bonus');

  // Partida 3: empate en lo más alto → cuenta; pero si a alguien le falta el daño no se sabe y no hay bonus
  const p3 = await jugar('P3', { 'KAIJU-TOP': 25000, 'TORA-TOP': 25000 });
  yo = fantasy.infoFantasy(bea).yo;
  assert.equal(yo.puntosBoost, top1 * 2 + puntos(p3, 'KAIJU-TOP') * 2, 'el empate cuenta');
  const antes = yo.puntosBoost;
  await jugar('P4', { 'KAIJU-TOP': 25000, 'TORA-SUPPORT': null });
  assert.equal(fantasy.infoFantasy(bea).yo.puntosBoost, antes, 'sin el daño de alguno no hay bonus');

  // Con el jugador cambiado de alineación antes de la partida, la BOOST ya no puntúa
  await pausa();
  await alinear({ TOP: 'KAIJU-TOP', JUNGLA: 'KAIJU-JUNGLA', boosts: [null, { carta: 'BOOST-KAMI', rol: 'JUNGLA' }] });
  await pausa();
  await jugar('P5', { 'KAIJU-TOP': 30000 });
  assert.equal(fantasy.infoFantasy(bea).yo.puntosBoost, antes, 'la BOOST va con la JUNGLA, que no hizo el máximo daño');
});
