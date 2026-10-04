// Prueba de punta a punta del gachapon con un Twitch falso (scripts/twitch-falso.js): entrar con Twitch,
// abrir sobres, conectar el canal, canjes de puntos, renovación y retirada de tokens, regalos, reinicio
// y una partida del fantasy guardada desde el panel.
// La web arranca con datos temporales: no toca data/ ni la plantilla del repositorio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearTwitchFalso, CLIENTE } from '../scripts/twitch-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let twitch, urlTwitch, carpeta, web, urlWeb;

const esperar = ms => new Promise(r => setTimeout(r, ms));
async function arrancarWeb() {
  const puerto = 3900 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas',
      TWITCH_CLIENT_ID: CLIENTE.id, TWITCH_CLIENT_SECRET: CLIENTE.secreto, CANAL_TWITCH: 'koryubudo',
      TWITCH_URL_ID: urlTwitch, TWITCH_URL_API: `${urlTwitch}/helix`,
      CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
      // Sin las BOOST ni los campeones del proyecto: la prueba alinea la primera carta que le sale y tiene que ser de jugador
      ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'),
      ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json') },   // sin las LEGACY del proyecto: los sobres traen siempre tres cartas
  });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 60; i++) {
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

// Acción del panel por el WebSocket, con la contraseña
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
const control = (orden, datos = {}) => fetch(`${urlTwitch}/_control/${orden}`, { method: 'POST', body: JSON.stringify(datos) }).then(r => r.json());
const estadoTwitch = () => fetch(`${urlTwitch}/_control/estado`, { method: 'POST' }).then(r => r.json());
const gacha = nav => nav.ir(`${urlWeb}/api/gacha`).then(r => r.json());

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-prueba-'));
  // Plantilla con jugadores inventados en Kaiju y Tora, y su tier list
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  plantillas.TORA.jugadores = ['Byakko', 'Shiro', 'Kiba', 'Raiden', 'Hoshi'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  const tiers = ['S', 'A', 'B', 'C', 'D'];
  const jugadores = Object.fromEntries(['KAIJU', 'TORA'].flatMap(c => ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'].map((r, i) => [`${c}-${r}`, tiers[i]])));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ jugadores, equipos: {} }));

  twitch = crearTwitchFalso();
  await new Promise(r => twitch.servidor.listen(0, '127.0.0.1', r));
  urlTwitch = `http://127.0.0.1:${twitch.servidor.address().port}`;
  await arrancarWeb();
});

after(async () => {
  await pararWeb();
  twitch?.servidor.close();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

const ana = navegador();

test('un espectador entra con Twitch y empieza con 2 sobres', async () => {
  await control('sesion', { login: 'ana' });
  const r = await ana.ir(`${urlWeb}/auth/twitch`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
  assert.ok(ana.cookies.get('tk_sesion'), 'queda la cookie de sesión');
  const g = await gacha(ana);
  assert.equal(g.usuario.nombre, 'Ana');
  assert.equal(g.usuario.sobres, 2);
});

test('si cancela en Twitch vuelve al gachapon sin sesión', async () => {
  const otro = navegador();
  await control('denegar');
  const r = await otro.ir(`${urlWeb}/auth/twitch`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
  assert.equal(otro.cookies.get('tk_sesion'), undefined);
});

test('abre un sobre y le salen 3 cartas del catálogo', async () => {
  const r = await ana.ir(`${urlWeb}/api/gacha/abrir`, { method: 'POST' });
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.sobre.length, 3);
  for (const c of j.sobre) assert.match(c.id, /^(KAIJU|TORA)-(TOP|JUNGLA|MEDIO|ADC|SUPPORT)$/);
  assert.equal(j.usuario.sobres, 1);
});

test('el staff conecta el canal y la web crea la recompensa en Twitch', async () => {
  const t = await accion('twitchCanal');
  assert.equal(t.ok, true);
  await control('sesion', { login: 'koryubudo' });
  const r = await navegador().ir(`${urlWeb}${t.url}`);
  const html = await r.text();
  assert.match(html, /Canal conectado/);
  const e = await estadoTwitch();
  assert.equal(e.recompensas.length, 1);
  assert.equal(e.recompensas[0].title, 'Sobre de Tenka Ichi');
  const g = await accion('gachaEstado');
  assert.equal(g.gacha.canal.conectado, true);
  assert.equal(g.gacha.canal.error, null);
});

test('los canjes de puntos dan sobres, quedan hechos en Twitch y no se dan dos veces', async () => {
  const antes = (await gacha(ana)).usuario.sobres;
  await control('canje', { login: 'ana', veces: 2 });
  await accion('gachaSondear');
  assert.equal((await gacha(ana)).usuario.sobres, antes + 2);
  const e = await estadoTwitch();
  assert.ok(e.canjes.every(c => c.status === 'FULFILLED'), 'marcados como hechos');
  await accion('gachaSondear');
  assert.equal((await gacha(ana)).usuario.sobres, antes + 2, 'recoger otra vez no da más');
});

test('si el token del canal caduca, se renueva solo y sigue recogiendo', async () => {
  const antes = (await gacha(ana)).usuario.sobres;
  await control('caducar', { login: 'koryubudo' });
  await control('canje', { login: 'ana' });
  const g = await accion('gachaSondear');
  assert.equal(g.gacha.canal.error, null);
  assert.equal((await gacha(ana)).usuario.sobres, antes + 1);
});

test('el staff regala sobres a alguien que aún no ha entrado: lo busca en Twitch', async () => {
  const r = await accion('gachaRegalar', { usuario: 'Beto', cantidad: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.nombre, 'Beto');
  await control('sesion', { login: 'beto' });
  const beto = navegador();
  await beto.ir(`${urlWeb}/auth/twitch`);
  assert.equal((await gacha(beto)).usuario.sobres, 2 + 3, 'los 2 del alta más los 3 regalados');
});

test('al reiniciar la web valida la conexión guardada y sigue conectada', async () => {
  const validacionesAntes = (await estadoTwitch()).validaciones;
  await pararWeb();
  await arrancarWeb();
  const g = await accion('gachaEstado');
  assert.equal(g.gacha.canal.conectado, true);
  assert.ok((await estadoTwitch()).validaciones > validacionesAntes, 'ha llamado a /oauth2/validate al arrancar');
  assert.equal((await gacha(ana)).usuario.nombre, 'Ana', 'la sesión del espectador sigue valiendo');
});

test('si el canal retira el permiso, el panel lo avisa y deja de recoger canjes', async () => {
  await control('revocar', { login: 'koryubudo' });
  await control('canje', { login: 'ana' });
  const g = await accion('gachaSondear');
  assert.equal(g.gacha.canal.conectado, false);
  assert.match(g.gacha.canal.error, /vuelve a conectarlo/);
});

test('sin sobres no se puede abrir ninguno', async () => {
  await control('sesion', { login: 'carla' });
  const carla = navegador();
  await carla.ir(`${urlWeb}/auth/twitch`);
  for (let i = 0; i < 2; i++) assert.equal((await (await carla.ir(`${urlWeb}/api/gacha/abrir`, { method: 'POST' })).json()).ok, true);
  const r = await (await carla.ir(`${urlWeb}/api/gacha/abrir`, { method: 'POST' })).json();
  assert.equal(r.ok, false);
  assert.match(r.error, /No te quedan sobres/);
});

test('fantasy: se alinea una carta, el panel guarda la partida y el coleccionista suma los puntos de su jugador', async () => {
  // Ana alinea la primera carta que tiene
  const { usuario } = await gacha(ana);
  const carta = usuario.cartas[0].id, rol = carta.split('-')[1];
  const ali = await (await ana.ir(`${urlWeb}/api/fantasy/alineacion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [rol]: carta }) })).json();
  assert.equal(ali.ok, true, ali.error);
  // Una carta no se puede poner en el hueco de otro rol
  const mal = await (await ana.ir(`${urlWeb}/api/fantasy/alineacion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [rol === 'TOP' ? 'JUNGLA' : 'TOP']: carta }) })).json();
  assert.equal(mal.ok, false);

  // Partida KAIJU (azul) contra TORA (rojo): gana el azul y el panel guarda las estadísticas
  await accion('equipo', { lado: 'azul', clan: 'KAIJU', jugadores: ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'] });
  await accion('equipo', { lado: 'rojo', clan: 'TORA', jugadores: ['Byakko', 'Shiro', 'Kiba', 'Raiden', 'Hoshi'] });
  assert.equal((await accion('fantasyEstadisticas', { filas: [] })).ok, false, 'antes hay que marcar el ganador');
  assert.equal((await accion('ganador', { lado: 'azul' })).ok, true);
  const filas = ['azul', 'rojo'].flatMap(lado => [0, 1, 2, 3, 4].map(indice => ({ lado, indice,
    k: lado === 'azul' ? 3 : 1, d: lado === 'azul' ? 1 : 3, a: 4, cs: 150 + indice, vision: 20, dano: '',
    primeraSangre: lado === 'azul' && indice === 0, triples: 0, quadras: 0, pentas: 0, torres: 1, fuente: 'puente' })));
  const r = await accion('fantasyEstadisticas', { filas, mvp: 'azul-0' });
  assert.equal(r.ok, true, r.error);
  const top = r.puntos.find(p => p.id === 'KAIJU-TOP');
  // 1 jugar + 3 victoria + 6 asesinatos + 6 asistencias − 1 muerte + 5 farmeo + 2 visión + 2 primera sangre
  // + 1 torre + 3 MVP (participa en 7 de 15 asesinatos, el 47 %: no llega al 70 %)
  assert.equal(top.puntos, 1 + 3 + 6 + 6 - 1 + 5 + 2 + 2 + 1 + 3);
  assert.ok(top.desglose.some(d => d.regla === 'mvp'));
  assert.equal(top.desglose.some(d => d.regla === 'dano'), false, 'sin daño apuntado no hay regla de daño');

  // La página del fantasy: los puntos del jugador y los del coleccionista, que tiene alineada su carta
  const f = await (await ana.ir(`${urlWeb}/api/fantasy`)).json();
  const suyo = r.puntos.find(p => p.id === carta);
  assert.equal(f.jugadores.find(j => j.id === carta).puntos, suyo.puntos);
  assert.equal(f.yo.puntos, suyo.puntos);
  assert.equal(f.yo.puesto, 1);
  assert.ok(f.reglas.some(x => /pentakill/.test(x.texto)), 'las reglas llegan escritas para la página');
});
