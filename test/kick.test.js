// Puntos del canal de Kick con un Kick falso (scripts/kick-falso.js): conectar el canal, la recompensa «Omamori», vincular
// el Kick de cada espectador a su cuenta, canjes que dan sobres una sola vez, renovación y retirada de tokens y reinicio.
// La web arranca con datos temporales: no toca data/ ni la hoja de Google.
import { test, before, after } from 'node:test';
import { puertoLibre, esperarWeb, pararWeb as pararProceso } from './web-de-prueba.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearKickFalso, CLIENTE_KICK } from '../scripts/kick-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let kick, urlKick, carpeta, web, urlWeb;

const esperar = ms => new Promise(r => setTimeout(r, ms));
async function arrancarWeb() {
  const puerto = await puertoLibre();
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|KICK_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas',
      KICK_CLIENT_ID: CLIENTE_KICK.id, KICK_CLIENT_SECRET: CLIENTE_KICK.secreto,
      KICK_URL_ID: urlKick, KICK_URL_API: `${urlKick}/public/v1`,
      CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
      ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'),
      ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json') },
  });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  await esperarWeb(web, urlWeb);
}
async function pararWeb() {
  if (!web) return;
  await pararProceso(web);
  web = null;
}

// Navegador mínimo: guarda las cookies y sigue las redirecciones a mano
function navegador() {
  const cookies = new Map();
  return {
    cookies,
    async ir(url, opciones = {}) {
      for (let saltos = 0; saltos < 10; saltos++) {
        const r = await fetch(url, { ...opciones, redirect: 'manual',
          headers: { ...(opciones.headers || {}), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
        for (const c of r.headers.getSetCookie()) {
          const [par] = c.split(';');
          const i = par.indexOf('=');
          const [k, v] = [par.slice(0, i), par.slice(i + 1)];
          if (/Max-Age=0/i.test(c) || !v) cookies.delete(k); else cookies.set(k, v);
        }
        if (r.status < 300 || r.status >= 400) return r;
        url = new URL(r.headers.get('location'), url).toString();
        opciones = {};
      }
      throw new Error('Demasiadas redirecciones');
    },
  };
}

async function accion(nombre, datos = {}) {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
  await new Promise((ok, mal) => { ws.on('open', ok); ws.on('error', mal); });
  const respuesta = await new Promise(ok => {
    ws.on('message', m => { const x = JSON.parse(m); if (x.tipo === 'respuesta' && x.id === 1) ok(x); });
    ws.send(JSON.stringify({ tipo: 'accion', id: 1, accion: nombre, datos, clave: CLAVE }));
  });
  ws.close();
  return respuesta;
}
const control = (orden, datos = {}) => fetch(`${urlKick}/_control/${orden}`, { method: 'POST', body: JSON.stringify(datos) }).then(r => r.json());
const estadoKick = () => control('estado');
const gacha = nav => nav.ir(`${urlWeb}/api/gacha`).then(r => r.json());
const entrar = async (nav, nombre) => { await nav.ir(`${urlWeb}/auth/prueba?nombre=${nombre}`); return gacha(nav); };
// El staff pulsa «Conectar el canal de Kick» en el panel y entra en Kick con la cuenta que tenga abierta
async function conectarCanal(login) {
  await control('sesion', { login });
  const r = await accion('kickCanal');
  assert.equal(r.ok, true, r.error);
  return navegador().ir(new URL(r.url, urlWeb).toString());
}

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-kick-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  const jugadores = Object.fromEntries(['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'].map(r => [`KAIJU-${r}`, 'B']));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ jugadores, equipos: {} }));
  for (const [archivo, vacio] of [['boosts.json', '[]'], ['campeones.json', '{}'], ['legacy.json', '[]']]) await writeFile(path.join(carpeta, archivo), vacio);

  kick = crearKickFalso();
  await new Promise(r => kick.servidor.listen(0, '127.0.0.1', r));
  urlKick = `http://127.0.0.1:${kick.servidor.address().port}`;
  await arrancarWeb();
});

after(async () => {
  await pararWeb();
  kick?.servidor.close();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

const ana = navegador(), beto = navegador();

test('sin conectar el canal, el gachapon no habla de Kick y el panel dice que falta conectarlo', async () => {
  const g = await entrar(ana, 'Ana');
  assert.equal(g.usuario.sobres, 3);
  assert.equal(g.recompensaKick, null);
  assert.equal(g.canalKick, 'gokudo-zoku');
  const p = await accion('gachaEstado');
  assert.equal(p.gacha.kick.activo, true);
  assert.equal(p.gacha.kick.conectado, false);
});

test('el canal solo se conecta con la cuenta del canal, y entonces la web crea «Omamori» sin saltarse la cola', async () => {
  const mal = await conectarCanal('ana');
  assert.equal(mal.status, 500);
  assert.match(await mal.text(), /cuenta del canal \(kick\.com\/gokudo-zoku\)/);
  assert.equal((await estadoKick()).recompensas.length, 0);

  const bien = await conectarCanal('gokudo_zoku');
  assert.equal(bien.status, 200);
  assert.match(await bien.text(), /Omamori.*3000 puntos/);
  const [r] = (await estadoKick()).recompensas;
  assert.deepEqual([r.title, r.cost, r.skip, r.background_color], ['Omamori', 3000, false, '#BE2A2F']);
  assert.match(r.description, /vincula tu Kick/);
  assert.ok(r.description.length <= 200);
  const g = await gacha(ana);
  assert.deepEqual(g.recompensaKick, { titulo: 'Omamori', coste: 3000 });
  // Conectar otra vez no crea otra recompensa
  await conectarCanal('gokudo_zoku');
  assert.equal((await estadoKick()).recompensas.length, 1);
});

test('si cancela en Kick vuelve al gachapon sin vincular nada', async () => {
  await control('denegar');
  const r = await ana.ir(`${urlWeb}/auth/kick/vincular`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
  assert.equal((await gacha(ana)).usuario.kick, null);
});

test('sin sesión del gachapon, «vincula tu Kick» manda primero a entrar', async () => {
  const r = await navegador().ir(`${urlWeb}/auth/kick/vincular`);
  assert.doesNotMatch(r.url, /oauth/, 'no llega a pedir nada a Kick');
});

test('Ana vincula su Kick y sus canjes le llegan a su colección, aunque sean varias páginas, una sola vez', async () => {
  await control('sesion', { login: 'ana' });
  const r = await ana.ir(`${urlWeb}/auth/kick/vincular`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
  assert.deepEqual((await gacha(ana)).usuario.kick, { login: 'ana_kick' });

  await control('canje', { login: 'ana', veces: 5 });   // el Kick falso da los canjes de 3 en 3
  await accion('gachaSondear');
  const g = await gacha(ana);
  assert.equal(g.usuario.sobres, 3 + 5);
  const k = await estadoKick();
  assert.ok(k.canjes.every(c => c.status === 'accepted'), 'todos aceptados en Kick');
  // Volver a recoger no da nada más
  await accion('gachaSondear');
  assert.equal((await gacha(ana)).usuario.sobres, 8);
  const p = await accion('gachaEstado');
  assert.equal(p.gacha.resumen.conKick, 1);
  assert.ok(p.gacha.kick.ultimaRecogida);
});

test('lo que Beto canjea antes de vincular su Kick se le guarda y le llega al vincularlo', async () => {
  await control('canje', { login: 'beto', veces: 2 });
  await accion('gachaSondear');
  const registro = JSON.parse(await readFile(path.join(carpeta, 'gacha.json'), 'utf8'));
  const suyos = registro.filter(e => e.tipo === 'canje' && e.id === 'kick-6002');
  assert.equal(suyos.length, 2);
  assert.equal(suyos[0].usuario, 'Beto_K', 'con su nombre de Kick');

  const g0 = await entrar(beto, 'Beto');
  assert.equal(g0.usuario.sobres, 3);
  await control('sesion', { login: 'beto' });
  await beto.ir(`${urlWeb}/auth/kick/vincular`);
  const g = await gacha(beto);
  assert.equal(g.usuario.sobres, 3 + 2);
  assert.deepEqual(g.usuario.kick, { login: 'Beto_K' });
});

test('el coste de «Omamori» se cambia desde el panel', async () => {
  const r = await accion('kickCoste', { coste: 1500 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.gacha.kick.coste, 1500);
  assert.equal((await estadoKick()).recompensas[0].cost, 1500);
  assert.equal((await accion('kickCoste', { coste: 0 })).ok, false);
});

test('si el token del canal caduca se renueva solo y los canjes siguen llegando', async () => {
  await control('caducar', { login: 'gokudo_zoku' });
  await control('canje', { login: 'ana' });
  await accion('gachaSondear');
  assert.equal((await gacha(ana)).usuario.sobres, 9);
  assert.equal((await accion('gachaEstado')).gacha.kick.error, null);
});

test('tras reiniciar la web sigue conectada, con los vínculos, y recoge lo que se canjeó mientras dormía', async () => {
  await pararWeb();
  await control('canje', { login: 'beto' });
  await arrancarWeb();
  const p = await accion('gachaEstado');
  assert.equal(p.gacha.kick.conectado, true);
  assert.equal(p.gacha.kick.coste, 1500);
  await accion('gachaSondear');
  assert.deepEqual((await gacha(ana)).usuario.kick, { login: 'ana_kick' });
  assert.equal((await gacha(beto)).usuario.sobres, 6);
  assert.equal((await estadoKick()).recompensas.length, 1, 'no ha creado otra recompensa');
});

test('al desvincular, los canjes ya no llegan a esa cuenta', async () => {
  const r = await ana.ir(`${urlWeb}/api/gacha/desvincular-kick`, { method: 'POST' }).then(x => x.json());
  assert.equal(r.ok, true);
  assert.equal(r.usuario.kick, null);
  await control('canje', { login: 'ana' });
  await accion('gachaSondear');
  assert.equal((await gacha(ana)).usuario.sobres, 9);
});

test('si el canal retira el permiso, el panel pide volver a conectarlo', async () => {
  await control('revocar', { login: 'gokudo_zoku' });
  await accion('gachaSondear');
  const k = (await accion('gachaEstado')).gacha.kick;
  assert.equal(k.conectado, false);
  assert.match(k.error, /vuelve a conectarlo/);
  assert.equal((await gacha(ana)).recompensaKick, null);
});
