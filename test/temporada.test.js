// Estrenar una temporada del gachapon (server/datos.js y estrenarTemporada en server/gacha.js): todos empiezan de cero
// con los sobres de bienvenida, conservan la cuenta y su Twitch vinculado, y no arrastran cartas, historial ni
// alineación. Lo de la temporada anterior no se toca: se queda en su pestaña o en su archivo. Primero con los datos en
// archivos y después con la web entera contra un Google Sheets de mentira (scripts/sheets-falso.js), que es como está
// publicada, también cuando la hoja falla a medias.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearSheetsFalso } from '../scripts/sheets-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'], TIERS = ['S', 'A', 'B', 'C', 'D'];
const F = '2026-10-03T18:00:00.000Z';
let carpeta, g, fantasy;
const ana = { id: 'discord-1', nombre: 'Ana' }, beto = { id: 'discord-2', nombre: 'Beto' }, eva = { id: 'discord-5', nombre: 'Eva' };
const archivo = nombre => path.join(carpeta, nombre);
const leerArchivo = nombre => readFile(archivo(nombre), 'utf8');
const vacio = { sobres: 0, abiertos: 0, cartas: [], twitch: null };
const alineados = u => Object.values(fantasy.infoFantasy(u).yo.alineacion).filter(x => typeof x === 'string').length;

// La temporada 1, como la dejó la web: Ana con un sobre abierto y un regalo; Beto con su Twitch vinculado (apuntado
// como antes, sin «tw:»), un canje y un código; Carla solo ha canjeado en Twitch y a Dani le han regalado sobres, pero
// ninguno de los dos ha entrado nunca
const mov = (id, usuario, tipo, detalle, cantidad, rareza = '') => ({ fecha: F, id, usuario, tipo, detalle, cantidad, rareza });
const TEMPORADA_1 = [
  mov('discord-1', 'Ana', 'alta', '', 2), mov('discord-1', 'Ana', 'apertura', 'a1b2c3d4', -1),
  mov('discord-1', 'Ana', 'carta', 'KAIJU-TOP', 1, 'S'), mov('discord-1', 'Ana', 'carta', 'KAIJU-ADC', 1, 'C'), mov('discord-1', 'Ana', 'carta', 'KAIJU-SUPPORT', 1, 'D'),
  mov('discord-1', 'Ana', 'regalo', 'Regalo del staff', 5),
  mov('discord-2', 'Beto', 'alta', '', 2), mov('discord-2', 'Beto', 'vinculo', '2002:beto_tw', 0),
  mov('2002', 'BETO_TW', 'canje', 'canje-1', 1), mov('2003', 'CARLA_TW', 'canje', 'canje-2', 1),
  mov('discord-2', 'Beto', 'codigo', 'KB1234', 2), mov('discord-9', 'Dani', 'regalo', 'Regalo del staff', 2)];
const ALINEACIONES_1 = [{ fecha: F, id: 'discord-1', usuario: 'Ana', slots: { TOP: 'KAIJU-TOP', JUNGLA: null, MEDIO: null, ADC: 'KAIJU-ADC', SUPPORT: 'KAIJU-SUPPORT', boosts: [null, null] } }];

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-temporada-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  await writeFile(archivo('plantillas.json'), JSON.stringify(plantillas));
  await writeFile(archivo('tierlist.json'), JSON.stringify({ equipos: {}, jugadores: Object.fromEntries(ROLES.map((r, i) => [`KAIJU-${r}`, TIERS[i]])) }));
  for (const [nombre, contenido] of [['boosts.json', '[]'], ['campeones.json', '{}'], ['legacy.json', '[]'],
    ['gacha.json', JSON.stringify(TEMPORADA_1)], ['alineaciones.json', JSON.stringify(ALINEACIONES_1)]]) await writeFile(archivo(nombre), contenido);
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_|RENDER|GACHA_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { GACHA_TEMPORADA: '2', CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: archivo('plantillas.json'), ARCHIVO_BOOSTS: archivo('boosts.json'),
    ARCHIVO_CAMPEONES: archivo('campeones.json'), ARCHIVO_LEGACY: archivo('legacy.json'), CARPETA_CARTAS: archivo('cartas') });
  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  fantasy = await import('../server/fantasy.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
  await fantasy.cargarFantasy();
});
after(async () => { await pararWeb(); await rm(carpeta, { recursive: true, force: true }); });

// ---------- con los datos en archivos ----------
test('la temporada: la 2 en la web publicada desde el 10/10/2026, la 1 en local y en las pruebas, u otra si se pide', () => {
  const codigo = "const d = await import('./server/datos.js'); const p = await import('node:path'); console.log(JSON.stringify([d.TEMPORADA, d.pestanaDeTemporada('Gachapon'), d.pestanaDeTemporada('Alineaciones'), p.basename(d.archivoDeTemporada('gacha'))]))";
  const con = entorno => {
    const limpio = { ...process.env };
    for (const k of Object.keys(limpio)) if (/^(RENDER|GACHA_)/.test(k)) delete limpio[k];
    return JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { cwd: RAIZ, encoding: 'utf8', env: { ...limpio, ...entorno } }).stdout);
  };
  assert.deepEqual(con({}), [1, 'Gachapon', 'Alineaciones', 'gacha.json']);
  assert.deepEqual(con({ RENDER: 'true' }), [2, 'GachaponT2', 'AlineacionesT2', 'gacha-t2.json']);
  assert.deepEqual(con({ RENDER: 'true', GACHA_TEMPORADA: '1' }), [1, 'Gachapon', 'Alineaciones', 'gacha.json'], 'volver a la anterior es volver a lo que había');
  assert.deepEqual(con({ GACHA_TEMPORADA: '3' }), [3, 'GachaponT3', 'AlineacionesT3', 'gacha-t3.json']);
  for (const mal of ['', '0', '-1', '2.5', 'dos']) assert.equal(con({ RENDER: 'true', GACHA_TEMPORADA: mal })[0], 2, `«${mal}» no es una temporada`);
});

test('antes de estrenarla, la temporada nueva está vacía y la anterior sigue donde estaba', async () => {
  assert.deepEqual(g.estadoTemporada(), { numero: 2, estreno: null, pendiente: true, error: null });
  assert.equal(g.resumenGacha().coleccionistas, 0);
  assert.deepEqual(g.estadoUsuario(ana.id), vacio);
});

test('al estrenarla, cada cuenta empieza con sus 3 sobres y su Twitch, sin cartas, sin historial y sin alineación', async () => {
  assert.deepEqual(await g.estrenarTemporada(), { cuentas: 2 });
  assert.deepEqual(g.estadoUsuario(ana.id), { ...vacio, sobres: 3 });
  assert.deepEqual(g.estadoUsuario(beto.id), { ...vacio, sobres: 3, twitch: { login: 'beto_tw' } }, 'conserva su Twitch vinculado');
  assert.deepEqual([g.estadoUsuario('2003'), g.estadoUsuario('discord-9')], [vacio, vacio], 'quien no había entrado nunca no tiene cuenta');
  const r = g.resumenGacha();
  assert.deepEqual([r.coleccionistas, r.sobresAbiertos, r.sobresSinAbrir, r.conTwitch], [2, 0, 6, 1]);
  assert.equal(g.buscarUsuario('Ana')?.id, ana.id, 'la cuenta sigue ahí, con su nombre');
  assert.deepEqual([g.canjeProcesado('canje-1'), g.canjeoCodigo(beto.id, 'KB1234'), g.usosDeCodigo('KB1234')], [false, false, 0]);
  assert.equal(alineados(ana), 0, 'sin cartas no hay a quién alinear');
  assert.deepEqual(fantasy.infoFantasy(null).clasificacion, []);
  // El registro nuevo: la marca del estreno y, por cada cuenta, su alta y su Twitch
  assert.deepEqual(JSON.parse(await leerArchivo('gacha-t2.json')).map(e => [e.id, e.tipo, e.detalle, e.cantidad]), [
    ['tenka-ichi', 'temporada', 'T2', 2],
    [ana.id, 'alta', '', 3], [beto.id, 'alta', '', 3], [beto.id, 'vinculo', 'tw:2002:beto_tw', 0]]);
  const t = g.estadoTemporada();
  assert.deepEqual([t.numero, t.estreno.cuentas, t.pendiente, t.error], [2, 2, false, null]);
});

test('lo de la temporada anterior no se toca: su registro y sus alineaciones siguen en sus archivos', async () => {
  assert.equal(await leerArchivo('gacha.json'), JSON.stringify(TEMPORADA_1));
  assert.equal(await leerArchivo('alineaciones.json'), JSON.stringify(ALINEACIONES_1));
});

test('después todo sigue como siempre, en el registro y las alineaciones de la temporada nueva', async () => {
  await g.darSobres({ id: '2002', nombre: 'BETO_TW' }, 1, 'canje', 'canje-3');
  assert.equal(g.estadoUsuario(beto.id).sobres, 4, 'el canje le llega a su cuenta de siempre');
  assert.equal(await g.darAlta(ana), false, 'volver a entrar no da otros tres sobres');
  assert.equal(await g.darAlta(eva), true);
  assert.equal(g.estadoUsuario(eva.id).sobres, 3);
  assert.equal((await g.abrirSobre(ana)).length, 3);
  assert.deepEqual([g.estadoUsuario(ana.id).sobres, g.estadoUsuario(ana.id).abiertos], [2, 1]);
  const carta = g.estadoUsuario(ana.id).cartas[0].id;
  await fantasy.cambiarAlineacion(ana, { [carta.split('-')[1]]: carta });
  assert.equal(alineados(ana), 1);
  assert.equal(JSON.parse(await leerArchivo('alineaciones-t2.json')).length, 1);
  assert.equal(await leerArchivo('gacha.json'), JSON.stringify(TEMPORADA_1));
  assert.equal(await leerArchivo('alineaciones.json'), JSON.stringify(ALINEACIONES_1));
});

test('una temporada se estrena una sola vez, también después de volver a leer el registro (un reinicio de la web)', async () => {
  const foto = () => JSON.stringify([ana, beto, eva].map(u => g.estadoUsuario(u.id)));
  const antes = foto(), guardado = await leerArchivo('gacha-t2.json');
  assert.equal(await g.estrenarTemporada(), null);
  await g.cargarGacha();
  await fantasy.cargarFantasy();
  assert.equal(await g.estrenarTemporada(), null);
  assert.equal(foto(), antes);
  assert.equal(alineados(ana), 1);
  assert.equal(await leerArchivo('gacha-t2.json'), guardado);
  assert.equal(JSON.parse(guardado).filter(e => e.tipo === 'temporada').length, 1);
});

test('si el registro de esta temporada no se puede leer, no se estrena nada: no se sabe si ya lo está y se darían los sobres dos veces', async () => {
  const guardado = await leerArchivo('gacha-t2.json');
  await writeFile(archivo('gacha-t2.json'), '{ esto no es un registro');
  await g.cargarGacha();   // la web arranca con el gachapon vacío
  assert.equal(g.estadoTemporada().pendiente, true);
  await assert.rejects(g.estrenarTemporada(), SyntaxError);
  assert.equal(await leerArchivo('gacha-t2.json'), '{ esto no es un registro');
  assert.match(g.estadoTemporada().error, /JSON|Unexpected|property/i);
  // Con el registro otra vez en su sitio, todo vuelve a estar como estaba
  await writeFile(archivo('gacha-t2.json'), guardado);
  await g.cargarGacha();
  assert.deepEqual([g.estadoUsuario(ana.id).sobres, g.estadoUsuario(ana.id).abiertos], [2, 1]);
  assert.equal(await g.estrenarTemporada(), null);
  assert.equal(g.estadoTemporada().error, null);
});

test('si el de la temporada anterior no se puede leer, tampoco; y quien ya tenga cuenta en la nueva no recibe los sobres dos veces', async () => {
  // La temporada 2, otra vez por estrenar; y Ana entra antes de que se estrene
  await rm(archivo('gacha-t2.json'));
  await g.cargarGacha();
  assert.equal(await g.darAlta(ana), true);
  await g.abrirSobre(ana);
  await writeFile(archivo('gacha.json'), '{ esto tampoco');
  await assert.rejects(g.estrenarTemporada(), SyntaxError);
  assert.equal(g.resumenGacha().coleccionistas, 1, 'nadie más ha entrado: no se ha estrenado');
  assert.equal(JSON.parse(await leerArchivo('gacha-t2.json')).some(e => e.tipo === 'temporada'), false);

  await writeFile(archivo('gacha.json'), JSON.stringify(TEMPORADA_1));
  assert.deepEqual(await g.estrenarTemporada(), { cuentas: 2 });
  assert.deepEqual([g.estadoUsuario(ana.id).sobres, g.estadoUsuario(ana.id).abiertos], [2, 1], 'Ana sigue con lo suyo: no recibe otros tres sobres');
  assert.deepEqual(g.estadoUsuario(beto.id), { ...vacio, sobres: 3, twitch: { login: 'beto_tw' } });
  assert.deepEqual(JSON.parse(await leerArchivo('gacha-t2.json')).filter(e => ['temporada', 'alta', 'vinculo'].includes(e.tipo)).map(e => [e.id, e.tipo]),
    [[ana.id, 'alta'], ['tenka-ichi', 'temporada'], [beto.id, 'alta'], [beto.id, 'vinculo']]);
});

// ---------- con la web entera y la hoja de Google (de mentira) ----------
const CLAVE = 'clave-de-prueba';
const CABECERA_GACHA = ['Fecha', 'ID de usuario', 'Usuario', 'Tipo', 'Detalle', 'Cantidad', 'Rareza'];
const CABECERA_ALI = ['Fecha', 'ID de usuario', 'Usuario', ...ROLES, 'Boost 1', 'Vinculada 1', 'Boost 2', 'Vinculada 2'];
// Lo que hay en la hoja publicada, tal como lo guarda la web (las cuentas, con el id de la entrada de prueba)
const hojasDeAntes = () => ({
  Gachapon: [CABECERA_GACHA,
    [F, 'prueba-ana', 'Ana', 'alta', '', '2'],
    [F, 'prueba-ana', 'Ana', 'apertura', 'a1b2c3d4', '-1'],
    [F, 'prueba-ana', 'Ana', 'carta', 'KAIJU-TOP', '1', 'S'],
    [F, 'prueba-ana', 'Ana', 'carta', 'KAIJU-ADC', '1', 'C'],
    [F, 'prueba-ana', 'Ana', 'carta', 'KAIJU-SUPPORT', '1', 'D'],
    [F, 'prueba-ana', 'Ana', 'regalo', 'Regalo del staff', '5'],
    [F, 'prueba-beto', 'Beto', 'alta', '', '2'],
    [F, 'prueba-beto', 'Beto', 'vinculo', '2002:beto_tw', '0'],
    [F, '2002', 'BETO_TW', 'canje', 'canje-1', '1'],
    [F, '2003', 'CARLA_TW', 'canje', 'canje-2', '1'],
    [],                                                           // una fila en blanco, de alguien que tocó la hoja
    [F, 'prueba-beto', 'Beto', 'codigo', 'KB1234', '2']],
  Alineaciones: [CABECERA_ALI, [F, 'prueba-ana', 'Ana', 'KAIJU-TOP', '', '', 'KAIJU-ADC', 'KAIJU-SUPPORT']],
});
const ESTRENO = [
  ['tenka-ichi', 'Tenka Ichi', 'temporada', 'T2', '2'],
  ['prueba-ana', 'Ana', 'alta', '', '3'],
  ['prueba-beto', 'Beto', 'alta', '', '3'],
  ['prueba-beto', 'Beto', 'vinculo', 'tw:2002:beto_tw', '0']];
const sinFecha = filas => filas.slice(1).map(f => f.slice(1));
const escrituras = (hoja, ...pestanas) => hoja.peticiones.filter(p => pestanas.includes(p.pestana) && p.accion !== 'leer').map(p => `${p.accion} ${p.pestana}`);

let web = null, urlWeb;
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function arrancarWeb(urlSheets) {
  const puerto = 4400 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER|GACHA_)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas',
      GOOGLE_URL_SHEETS: urlSheets, GOOGLE_SHEET_ID: 'hoja-de-prueba', GOOGLE_CREDENTIALS: 'prueba', GACHA_TEMPORADA: '2' } });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  web.stdout.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) return; } catch {}
    await esperar(200);
  }
  throw new Error('La web no arranca');
}
async function pararWeb() {
  if (!web) return;
  const fin = new Promise(r => web.once('exit', r));
  web.kill();
  await fin;
  web = null;
}

// Navegador mínimo: guarda las cookies y sigue las redirecciones a mano
async function entrar(nombre) {
  const cookies = new Map();
  const ir = async (url, opciones = {}) => {
    for (let saltos = 0; saltos < 10; saltos++) {
      const r = await fetch(url, { ...opciones, redirect: 'manual', headers: { ...(opciones.headers || {}), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
      for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'), i = par.indexOf('='); cookies.set(par.slice(0, i), par.slice(i + 1)); }
      if (r.status < 300 || r.status >= 400) return r;
      url = new URL(r.headers.get('location'), url).toString();
      opciones = {};
    }
    throw new Error('Demasiadas redirecciones');
  };
  await ir(`${urlWeb}/auth/prueba?nombre=${nombre}`);
  // Las direcciones van con la web del momento: la sesión sigue valiendo aunque la web se reinicie en otro puerto
  return { json: async (ruta, cuerpo) => (await ir(`${urlWeb}${ruta}`, cuerpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })).json() };
}
// Sobres sin abrir, sobres abiertos y cartas de alguien
const usuario = async quien => { const u = (await quien.json('/api/gacha')).usuario; return [u.sobres, u.abiertos, u.cartas.reduce((s, c) => s + c.cantidad, 0)]; };

// Una acción del panel, con la contraseña
function panel(accion, datos = {}) {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
    ws.on('open', () => ws.send(JSON.stringify({ tipo: 'accion', id: 1, accion, datos, clave: CLAVE })));
    ws.on('message', m => { const x = JSON.parse(m); if (x.tipo === 'respuesta') { ws.close(); ok(x); } });
    ws.on('error', mal);
  });
}
const temporada = async () => (await panel('gachaEstado')).gacha.temporada;

// Cada prueba con su hoja: la de antes, y lo que se le añada
async function conHoja(fn, mas = {}) {
  const falso = crearSheetsFalso({ hojas: { ...hojasDeAntes(), ...mas } });
  const url = await falso.abrir();
  try { await fn(falso.estado, url, hojasDeAntes()); }
  finally { await pararWeb(); await falso.cerrar(); }
}

test('en la hoja de Google: la temporada nueva va en pestañas nuevas, las de antes no se tocan y al reiniciar la web no se repite', async () => {
  await conHoja(async (hoja, url, antes) => {
    await arrancarWeb(url);
    // El registro nuevo, en su pestaña: la marca del estreno y cada cuenta con su alta y su Twitch
    assert.deepEqual(hoja.leer('GachaponT2')[0], CABECERA_GACHA);
    assert.deepEqual(sinFecha(hoja.leer('GachaponT2')), ESTRENO);
    assert.deepEqual(hoja.leer('AlineacionesT2'), [CABECERA_ALI]);
    // Lo de antes sigue igual, y ni se ha intentado escribir en ello
    assert.deepEqual(hoja.leer('Gachapon'), antes.Gachapon);
    assert.deepEqual(hoja.leer('Alineaciones'), antes.Alineaciones);
    assert.deepEqual(escrituras(hoja, 'Gachapon', 'Alineaciones'), []);

    // Cada uno entra con la cuenta que ya tenía: tres sobres, ninguna carta y su Twitch
    const ana = await entrar('Ana'), beto = await entrar('Beto');
    let g = await ana.json('/api/gacha');
    assert.deepEqual(await usuario(ana), [3, 0, 0]);
    assert.deepEqual([g.sobresIniciales, g.temporada.numero, typeof g.temporada.estreno], [3, 2, 'string']);
    assert.deepEqual((await beto.json('/api/gacha')).usuario.twitch, { login: 'beto_tw' });
    assert.deepEqual(await usuario(beto), [3, 0, 0]);
    assert.equal(Object.values((await ana.json('/api/fantasy')).yo.alineacion).filter(x => typeof x === 'string').length, 0);
    let p = (await panel('gachaEstado')).gacha;
    assert.deepEqual([p.temporada.numero, p.temporada.pendiente, p.temporada.error, p.temporada.estreno.cuentas], [2, false, null, 2]);
    assert.deepEqual([p.resumen.coleccionistas, p.resumen.sobresAbiertos, p.resumen.sobresSinAbrir, p.resumen.conTwitch], [2, 0, 6, 1]);

    // Aún no hay cartas de Jugador (nadie tiene tier): los sobres esperan, no se gastan en balde
    assert.deepEqual([g.sobresListos, p.resumen.listos], [false, false]);
    let r = await ana.json('/api/gacha/abrir', {});
    assert.deepEqual([r.ok, /cuando estén las cartas de los jugadores/.test(r.error)], [false, true]);
    assert.deepEqual(await usuario(ana), [3, 0, 0]);
    // El staff pone las tiers desde el panel y ya se abren, con el reparto nuevo (aquí no hay ninguna S+)
    for (const [i, rol] of ROLES.entries()) assert.equal((await panel('tier', { tipo: 'jugador', id: `KAIJU-${rol}`, tier: TIERS[i] })).ok, true);
    g = await ana.json('/api/gacha');
    assert.equal(g.sobresListos, true);
    for (const [t, parte] of Object.entries({ S: 0.012, A: 0.065, B: 0.22, C: 0.3, D: 0.4 })) assert.ok(Math.abs(g.probabilidades[t] - parte / 0.997) < 1e-9, t);
    r = await ana.json('/api/gacha/abrir', {});
    assert.deepEqual([r.ok, r.sobre.length], [true, 3]);
    assert.deepEqual(await usuario(ana), [2, 1, 3]);
    // Y alinea una de sus cartas: va a las alineaciones de la temporada nueva
    const carta = (await ana.json('/api/gacha')).usuario.cartas[0].id;
    assert.equal((await ana.json('/api/fantasy/alineacion', { [carta.split('-')[1]]: carta })).ok, true);
    assert.equal(hoja.leer('AlineacionesT2').length, 2);
    for (let i = 0; i < 40 && !(hoja.leer('Tierlist')?.length > 1); i++) await esperar(100);   // la tier list se guarda con un momento de espera

    // Mientras Render cambia de versión, la anterior sigue viva unos segundos y escribe en la pestaña de siempre:
    // alguien abre allí un sobre de los que tenía. A la temporada nueva no le llega
    hoja.hojas.get('Gachapon').push([F, 'prueba-beto', 'Beto', 'apertura', 'ffff0000', '-1'], [F, 'prueba-beto', 'Beto', 'carta', 'KAIJU-TOP', '1', 'S']);

    // La web se reinicia (Render la duerme y la despierta a menudo): la temporada ya está estrenada y no se repite
    await pararWeb();
    hoja.peticiones.length = 0;
    await arrancarWeb(url);
    assert.deepEqual(escrituras(hoja, 'Gachapon', 'GachaponT2', 'Alineaciones', 'AlineacionesT2'), [], 'al arrancar solo se lee');
    assert.deepEqual(await usuario(ana), [2, 1, 3], 'Ana sigue con lo que tenía, y con la sesión abierta');
    assert.deepEqual(await usuario(beto), [3, 0, 0]);
    assert.equal(Object.values((await ana.json('/api/fantasy')).yo.alineacion).filter(x => typeof x === 'string').length, 1);
    assert.equal(hoja.leer('GachaponT2').filter(f => f[3] === 'temporada').length, 1);
    assert.equal((await temporada()).pendiente, false);
    assert.deepEqual(hoja.leer('Gachapon').slice(0, antes.Gachapon.length), antes.Gachapon);
    assert.deepEqual(hoja.leer('Alineaciones'), antes.Alineaciones);
  });
});

test('si la hoja falla al escribir el estreno, se hace en el siguiente arranque, y quien haya entrado entretanto no recibe los sobres dos veces', async () => {
  await conHoja(async (hoja, url, antes) => {
    let fallos = 0;
    hoja.fallar = ({ accion, pestana }) => (accion === 'anadir' && pestana === 'GachaponT2' && fallos++ === 0 ? 'antes' : null);
    await arrancarWeb(url);
    assert.deepEqual(hoja.leer('GachaponT2'), [CABECERA_GACHA], 'no se ha estrenado');
    const t = await temporada();
    assert.deepEqual([t.pendiente, t.estreno, /unavailable/.test(t.error)], [true, null, true], 'el panel dice que está sin estrenar y por qué');
    // Ana entra entretanto: es como si fuera nueva
    const ana = await entrar('Ana');
    assert.deepEqual(await usuario(ana), [3, 0, 0]);

    await pararWeb();
    await arrancarWeb(url);
    assert.deepEqual(await usuario(ana), [3, 0, 0], 'tres sobres, no seis');
    const beto = await entrar('Beto');
    assert.deepEqual(await usuario(beto), [3, 0, 0]);
    assert.deepEqual((await beto.json('/api/gacha')).usuario.twitch, { login: 'beto_tw' });
    assert.deepEqual(sinFecha(hoja.leer('GachaponT2')), [ESTRENO[1], ESTRENO[0], ESTRENO[2], ESTRENO[3]]);
    assert.deepEqual([(await temporada()).pendiente, (await temporada()).error], [false, null]);
    assert.deepEqual(hoja.leer('Gachapon'), antes.Gachapon);
  });
});

test('si el estreno se escribe pero la respuesta de Google se pierde, cuenta como hecho y no se repite', async () => {
  await conHoja(async (hoja, url) => {
    hoja.fallar = ({ accion, pestana }) => (accion === 'anadir' && pestana === 'GachaponT2' ? 'despues' : null);
    await arrancarWeb(url);
    assert.deepEqual(sinFecha(hoja.leer('GachaponT2')), ESTRENO);
    const t = await temporada();
    assert.deepEqual([t.pendiente, t.error, t.estreno.cuentas], [false, null, 2]);
    hoja.fallar = null;
    assert.deepEqual(await usuario(await entrar('Ana')), [3, 0, 0]);
    await pararWeb();
    await arrancarWeb(url);
    assert.deepEqual(sinFecha(hoja.leer('GachaponT2')), ESTRENO, 'ni una fila más');
  });
});

test('si el registro de la temporada anterior no se puede leer, no se estrena; se hace cuando la hoja vuelve a ir bien', async () => {
  await conHoja(async (hoja, url, antes) => {
    hoja.fallar = ({ accion, pestana }) => (accion === 'leer' && pestana === 'Gachapon' ? 'antes' : null);
    await arrancarWeb(url);
    assert.deepEqual(hoja.leer('GachaponT2'), [CABECERA_GACHA]);
    const t = await temporada();
    assert.deepEqual([t.pendiente, /unavailable/.test(t.error)], [true, true]);
    hoja.fallar = null;
    await pararWeb();
    await arrancarWeb(url);
    assert.deepEqual(sinFecha(hoja.leer('GachaponT2')), ESTRENO);
    assert.deepEqual(hoja.leer('Gachapon'), antes.Gachapon);
  });
});

test('si el registro de esta temporada no se puede leer al arrancar, no se estrena otra vez encima: nadie recibe los sobres dos veces', async () => {
  // La temporada 2 ya está estrenada y Ana ha abierto un sobre
  const yaEstrenada = [CABECERA_GACHA, ...ESTRENO.map(f => [F, ...f]), [F, 'prueba-ana', 'Ana', 'apertura', 'a1b2c3d4', '-1'],
    [F, 'prueba-ana', 'Ana', 'carta', 'KAIJU-TOP', '1', 'S'], [F, 'prueba-ana', 'Ana', 'carta', 'KAIJU-ADC', '1', 'C'], [F, 'prueba-ana', 'Ana', 'carta', 'KAIJU-SUPPORT', '1', 'D']];
  await conHoja(async (hoja, url) => {
    hoja.fallar = ({ accion, pestana }) => (accion === 'leer' && pestana === 'GachaponT2' ? 'antes' : null);
    await arrancarWeb(url);
    assert.deepEqual(escrituras(hoja, 'GachaponT2'), []);
    assert.deepEqual(hoja.leer('GachaponT2'), yaEstrenada);
    assert.equal((await temporada()).pendiente, true);
    hoja.fallar = null;
    await pararWeb();
    await arrancarWeb(url);
    assert.deepEqual(hoja.leer('GachaponT2'), yaEstrenada);
    assert.deepEqual(await usuario(await entrar('Ana')), [2, 1, 3]);
    assert.equal((await temporada()).pendiente, false);
  }, { GachaponT2: yaEstrenada });
});

test('con un registro de miles de filas en la temporada anterior, el estreno es igual de corto: solo se lee', async () => {
  const grande = [...hojasDeAntes().Gachapon, ...Array.from({ length: 2400 }, (_, i) => [F, 'prueba-ana', 'Ana', 'carta', `KAIJU-${ROLES[i % 5]}`, '1', 'B'])];
  await conHoja(async (hoja, url) => {
    await arrancarWeb(url);
    assert.deepEqual(sinFecha(hoja.leer('GachaponT2')), ESTRENO);
    assert.equal(hoja.leer('Gachapon').length, 2413);
    assert.deepEqual(escrituras(hoja, 'Gachapon'), []);
    assert.deepEqual(await usuario(await entrar('Ana')), [3, 0, 0]);
  }, { Gachapon: grande });
});
