// La jornada de punta a punta con la web entera y datos temporales: sobres sin repetidas, códigos de directo,
// fundir repetidas, el cierre de la jornada con sus premios y las estadísticas del postdraft y de las fichas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const KAIJU = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'], TORA = ['Byakko', 'Shiro', 'Kiba', 'Raiden', 'Hoshi'];
const PICKS = { azul: ['Aatrox', 'LeeSin', 'Ahri', 'Jinx', 'Thresh'], rojo: ['Jax', 'Viego', 'Syndra', 'Kaisa', 'Nautilus'] };
let carpeta, web, urlWeb, panel, ana, beto;

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Navegador mínimo: guarda las cookies y sigue las redirecciones a mano
function navegador() {
  const cookies = new Map();
  const ir = async (url, opciones = {}) => {
    for (let saltos = 0; saltos < 10; saltos++) {
      const r = await fetch(url, { ...opciones, redirect: 'manual', headers: { ...(opciones.headers || {}), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
      for (const c of r.headers.getSetCookie()) {
        const [par] = c.split(';'), i = par.indexOf('=');
        if (/Max-Age=0/i.test(c) || !par.slice(i + 1)) cookies.delete(par.slice(0, i)); else cookies.set(par.slice(0, i), par.slice(i + 1));
      }
      if (r.status < 300 || r.status >= 400) return r;
      url = new URL(r.headers.get('location'), url).toString();
      opciones = {};
    }
    throw new Error('Demasiadas redirecciones');
  };
  const json = async (ruta, cuerpo) => (await ir(`${urlWeb}${ruta}`, cuerpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
  return { ir, json };
}

async function entrar(nombre) {
  const n = navegador();
  await n.ir(`${urlWeb}/auth/prueba?nombre=${nombre}`);
  return n;
}

// El panel: una conexión que manda acciones con la contraseña y guarda el último estado
async function conectarPanel() {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
  const c = { ws, estado: null, id: 0, esperas: new Map(), alEstado: null };
  ws.on('message', m => {
    const x = JSON.parse(m);
    if (x.tipo === 'estado') { c.estado = x.estado; c.alEstado?.(); }
    if (x.tipo === 'respuesta') { c.esperas.get(x.id)?.(x); c.esperas.delete(x.id); }
  });
  await new Promise((ok, mal) => { ws.on('open', ok); ws.on('error', mal); });
  c.accion = (accion, datos = {}) => new Promise(ok => {
    const id = ++c.id;
    // (si la acción falla no hay reparto: se sigue al momento)
    c.esperas.set(id, r => {
      if (!r.ok) return ok(r);
      const fin = () => { c.alEstado = null; clearTimeout(reloj); ok(r); };
      const reloj = setTimeout(fin, 1000);
      c.alEstado = fin;
    });
    ws.send(JSON.stringify({ tipo: 'accion', id, accion, datos, clave: CLAVE }));
  });
  while (!c.estado) await esperar(20);
  return c;
}

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-jornada-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  plantillas.KAIJU.jugadores = KAIJU;
  plantillas.TORA.jugadores = TORA;
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ equipos: {},
    jugadores: Object.fromEntries(['KAIJU', 'TORA'].flatMap(c => ROLES.map((r, i) => [`${c}-${r}`, ['S', 'A', 'B', 'C', 'D'][i]]))) }));
  await writeFile(path.join(carpeta, 'boosts.json'), JSON.stringify([{ id: 'BOOST-TENGU', nombre: 'Tengu', tier: 'S', multiplicador: 2, condicion: 'asistencias' }]));
  await writeFile(path.join(carpeta, 'campeones.json'), '{}');
  // Ana ya tiene cartas repetidas; Beto, las justas para alinear
  const carta = (id, usuario, detalle, veces) => Array.from({ length: veces }, () => ({ fecha: '2026-10-01T10:00:00.000Z', id, usuario, tipo: 'carta', detalle, cantidad: 1, rareza: 'A' }));
  await writeFile(path.join(carpeta, 'gacha.json'), JSON.stringify([
    ...carta('prueba-ana', 'Ana', 'KAIJU-TOP', 4), ...carta('prueba-ana', 'Ana', 'TORA-TOP', 3), ...carta('prueba-ana', 'Ana', 'KAIJU-ADC', 1),
    ...carta('prueba-ana', 'Ana', 'BOOST-TENGU', 3), ...carta('prueba-beto', 'Beto', 'TORA-TOP', 1), ...carta('prueba-beto', 'Beto', 'TORA-ADC', 2),
  ]));
  const puerto = 4200 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', ESPERA_VISTA_MS: '200',
      CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
      ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json') } });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) break; } catch {}
    await esperar(200);
  }
  panel = await conectarPanel();
  ana = await entrar('Ana');
  beto = await entrar('Beto');
});
after(async () => {
  panel?.ws.close();
  if (web) { const fin = new Promise(r => web.once('exit', r)); web.kill(); await fin; }
  await rm(carpeta, { recursive: true, force: true });
});

const cantidades = async quien => Object.fromEntries((await quien.json('/api/gacha')).usuario.cartas.map(c => [c.id, c.cantidad]));

test('en un sobre no sale dos veces la misma carta', async () => {
  assert.equal((await panel.accion('gachaRegalar', { usuario: 'Beto', cantidad: 20 })).ok, true);
  for (let i = 0; i < 22; i++) {
    const r = await beto.json('/api/gacha/abrir', {});
    assert.equal(r.ok, true);
    assert.equal(r.sobre.length, 3);
    assert.equal(new Set(r.sobre.map(c => c.id)).size, 3, `sobre con repetidas: ${r.sobre.map(c => c.id)}`);
  }
});

test('fundir repetidas: cinco copias que sobran por un sobre, sin tocar la última ni las BOOST alineadas', async () => {
  // Ana alinea dos jugadores y les pone sus dos BOOST-TENGU (tiene tres copias)
  const ali = await ana.json('/api/fantasy/alineacion', { TOP: 'KAIJU-TOP', ADC: 'KAIJU-ADC',
    boosts: [{ carta: 'BOOST-TENGU', rol: 'TOP' }, { carta: 'BOOST-TENGU', rol: 'ADC' }] });
  assert.equal(ali.ok, true);
  const antes = (await ana.json('/api/gacha')).usuario;
  assert.equal((await ana.json('/api/gacha')).repetidasPorSobre, 5);

  let r = await ana.json('/api/gacha/fundir', { cartas: { 'KAIJU-TOP': 3, 'TORA-TOP': 1 } });
  assert.match(r.error, /de 5 en 5/);
  r = await ana.json('/api/gacha/fundir', { cartas: { 'KAIJU-TOP': 4, 'TORA-TOP': 1 } });
  assert.match(r.error, /copias que te sobran/, 'la última copia no se funde');
  r = await ana.json('/api/gacha/fundir', { cartas: { 'KAIJU-TOP': 2, 'TORA-TOP': 1, 'BOOST-TENGU': 2 } });
  assert.match(r.error, /copias que te sobran/, 'las dos BOOST de la alineación no se funden');
  r = await ana.json('/api/gacha/fundir', { cartas: { 'KAIJU-TOP': 3, 'TORA-TOP': 2 } });
  assert.equal(r.ok, true);
  assert.equal(r.sobres, 1);
  assert.equal(r.usuario.sobres, antes.sobres + 1);
  assert.deepEqual(await cantidades(ana), { 'KAIJU-TOP': 1, 'TORA-TOP': 1, 'KAIJU-ADC': 1, 'BOOST-TENGU': 3 });
  assert.equal((await navegador().json('/api/gacha/fundir', { cartas: {} })).ok, false, 'sin entrar no se funde');
});

test('código de directo: sale en el overlay, se canjea una vez por persona y se agota', async () => {
  const r = await panel.accion('codigoCrear', { sobres: 2, minutos: 5, maximo: 1 });
  assert.equal(r.ok, true);
  const codigo = r.gacha.codigo.texto;
  assert.match(codigo, /^[A-Z0-9]{6}$/);
  assert.equal(panel.estado.codigo.texto, codigo, 'se enseña en el overlay');
  assert.equal(panel.estado.codigo.sobres, 2);

  const antes = (await ana.json('/api/gacha')).usuario.sobres;
  assert.match((await ana.json('/api/gacha/canjear', { codigo: 'NOVALE' })).error, /no vale/);
  // Vale en minúsculas y con espacios o guiones
  const bien = await ana.json('/api/gacha/canjear', { codigo: ` ${codigo.slice(0, 3).toLowerCase()}-${codigo.slice(3).toLowerCase()} ` });
  assert.equal(bien.ok, true);
  assert.equal(bien.usuario.sobres, antes + 2);
  assert.match((await ana.json('/api/gacha/canjear', { codigo })).error, /Ya has canjeado/);
  assert.match((await beto.json('/api/gacha/canjear', { codigo })).error, /agotado/);
  assert.equal((await navegador().json('/api/gacha/canjear', { codigo })).ok, false, 'sin entrar no se canjea');

  const estado = await panel.accion('gachaEstado');
  assert.equal(estado.gacha.codigo.canjes, 1);
  assert.equal(estado.gacha.codigo.vivo, false);
  assert.equal(panel.estado.codigo, null, 'agotado, ya no sale en el overlay');
  await panel.accion('codigoCerrar');
  assert.equal((await panel.accion('gachaEstado')).gacha.codigo, null);
  assert.match((await beto.json('/api/gacha/canjear', { codigo })).error, /no vale/);
});

test('la jornada: las alineaciones se cierran al empezar el draft y, al terminarla, hay sobres para los primeros', async () => {
  // Beto alinea a los dos de TORA que tiene; Ana ya tiene a dos de KAIJU con sus BOOST
  assert.equal((await beto.json('/api/fantasy/alineacion', { TOP: 'TORA-TOP', ADC: 'TORA-ADC' })).ok, true);
  await panel.accion('config', { jornada: 'Jornada 1', fase: 'Fase de liga', formato: 'bo1', partida: 1 });
  await panel.accion('equipo', { lado: 'azul', clan: 'KAIJU', jugadores: KAIJU });
  await panel.accion('equipo', { lado: 'rojo', clan: 'TORA', jugadores: TORA });
  assert.equal(panel.estado.fantasy.cerrado, false);
  for (const lado of ['azul', 'rojo']) for (let i = 0; i < 5; i++) await panel.accion('corregir', { tipo: 'picks', lado, indice: i, campeon: PICKS[lado][i] });
  assert.equal(panel.estado.fantasy.cerrado, true, 'al primer pick se cierran solas');
  assert.match((await beto.json('/api/fantasy/alineacion', { TOP: 'TORA-TOP' })).error, /cerradas/);

  // Antes de jugarse nada, el postdraft dice que todos estrenan campeón
  let previa = await (await fetch(`${urlWeb}/api/previa`)).json();
  assert.equal(previa.azul.jugadores[0].primeraVez, true);
  assert.equal(previa.azul.jugadores[0].nombre, 'Gojirasu');
  assert.equal(previa.azul.jugadores[0].carta.id, 'KAIJU-TOP');
  assert.equal(previa.azul.partidas, 0);
  assert.equal(previa.azul.wr, null);

  // Gana KAIJU; el top de KAIJU hace 5/0/10 y el de TORA 1/5/2
  assert.equal((await panel.accion('ganador', { lado: 'azul' })).ok, true);
  const filas = [
    { lado: 'azul', indice: 0, k: 5, d: 0, a: 10, cs: 240, vision: 20, dano: 25000 }, { lado: 'azul', indice: 3, k: 8, d: 2, a: 4, cs: 300, vision: 15, dano: 31000 },
    { lado: 'azul', indice: 1, k: 2, d: 1, a: 9 }, { lado: 'azul', indice: 2, k: 3, d: 2, a: 6 }, { lado: 'azul', indice: 4, k: 0, d: 3, a: 14 },
    { lado: 'rojo', indice: 0, k: 1, d: 5, a: 2, cs: 180, vision: 12, dano: 9000 }, { lado: 'rojo', indice: 3, k: 4, d: 4, a: 1, cs: 260, vision: 10, dano: 20000 },
    { lado: 'rojo', indice: 1, k: 1, d: 3, a: 3 }, { lado: 'rojo', indice: 2, k: 2, d: 3, a: 2 }, { lado: 'rojo', indice: 4, k: 0, d: 3, a: 5 },
  ];
  assert.equal((await panel.accion('fantasyEstadisticas', { filas, mvp: 'azul-0' })).ok, true);

  // La clasificación de la jornada, y nadie puede terminar una jornada sin puntos
  let j = await panel.accion('jornadaEstado', {});
  assert.deepEqual(j.jornadas, [{ nombre: 'Jornada 1', cerrada: false }]);
  assert.deepEqual(j.clasificacion.map(c => [c.puesto, c.nombre]), [[1, 'Ana'], [2, 'Beto']]);
  assert.ok(j.clasificacion[0].puntos > j.clasificacion[1].puntos);
  assert.match((await panel.accion('jornadaTerminar', { jornada: 'Jornada 9' })).error, /Nadie ha puntuado/);

  // Se termina: 3 sobres para la primera y 2 para el segundo (aquí el tercer premio se queda sin dueño)
  const sobres = async quien => (await quien.json('/api/gacha')).usuario.sobres;
  const [antesAna, antesBeto] = [await sobres(ana), await sobres(beto)];
  const fin = await panel.accion('jornadaTerminar', { jornada: 'Jornada 1' });
  assert.equal(fin.ok, true);
  assert.deepEqual(fin.ganadores.map(g => [g.puesto, g.nombre, g.sobres]), [[1, 'Ana', 3], [2, 'Beto', 2]]);
  assert.equal(await sobres(ana), antesAna + 3);
  assert.equal(await sobres(beto), antesBeto + 2);
  assert.equal(panel.estado.fantasy.cerrado, false, 'y se vuelven a abrir las alineaciones');
  assert.match((await panel.accion('jornadaTerminar', { jornada: 'Jornada 1' })).error, /ya está cerrada/);
  assert.equal(await sobres(ana), antesAna + 3, 'no se premia dos veces');
  j = await panel.accion('jornadaEstado', { jornada: 'Jornada 1' });
  assert.equal(j.cerrada.ganadores[0].nombre, 'Ana');

  // La web: la clasificación con los puntos de cada jornada y quién se llevó los premios, sin identificadores
  const f = await (await fetch(`${urlWeb}/api/fantasy`)).json();
  assert.deepEqual(f.jornadas, ['Jornada 1']);
  assert.equal(f.clasificacion[0].nombre, 'Ana');
  assert.equal(f.clasificacion[0].porJornada['Jornada 1'], f.clasificacion[0].puntos);
  assert.deepEqual(f.premios[0].ganadores.map(g => Object.keys(g).sort()), Array(2).fill(['nombre', 'puesto', 'puntos', 'sobres']));
  assert.deepEqual(f.sobresPremio, [3, 2, 1]);

  // Con la partida ya jugada, el postdraft sabe lo que lleva cada uno con su campeón y en general
  previa = await (await fetch(`${urlWeb}/api/previa`)).json();
  const top = previa.azul.jugadores[0];
  assert.equal(top.primeraVez, false);
  assert.deepEqual([top.conCampeon.partidas, top.conCampeon.victorias, top.conCampeon.kda.ratio], [1, 1, 15]);
  assert.deepEqual(top.general.kda, { k: 5, d: 0, a: 10, ratio: 15 });
  assert.equal(top.general.mvps, 1);
  assert.equal(top.general.dano, 25000);
  assert.ok(top.fantasy.puntos > 0);
  assert.deepEqual([previa.azul.wr, previa.rojo.wr, previa.azul.racha, previa.caraACara], [100, 0, { tipo: 'V', n: 1 }, { partidas: 1, azul: 1, rojo: 0 }]);
  assert.equal(previa.azul.medias.asesinatos, 18);
  assert.equal(previa.rojo.medias.muertes, 18);
  assert.equal(previa.azul.medias.dano, null, 'a tres de los cinco les falta el daño: no hay media de equipo');
  // Con otro campeón en el draft, vuelve a ser la primera vez
  await panel.accion('corregir', { tipo: 'picks', lado: 'azul', indice: 0, campeon: 'Garen' });
  previa = await (await fetch(`${urlWeb}/api/previa`)).json();
  assert.equal(previa.azul.jugadores[0].primeraVez, true);
  assert.equal(previa.azul.jugadores[0].general.partidas, 1);

  // Las fichas de la web
  const ficha = await (await fetch(`${urlWeb}/api/jugador?id=kaiju-top`)).json();
  assert.deepEqual([ficha.nombre, ficha.carta.id, ficha.general.partidas, ficha.campeones[0].id], ['Gojirasu', 'KAIJU-TOP', 1, 'Aatrox']);
  const clan = await (await fetch(`${urlWeb}/api/clan?id=TORA`)).json();
  assert.deepEqual([clan.partidas, clan.derrotas, clan.jugadores.length, clan.campeones.length], [1, 1, 5, 5]);
  assert.equal((await fetch(`${urlWeb}/api/jugador?id=NADIE-TOP`)).status, 404);
});
