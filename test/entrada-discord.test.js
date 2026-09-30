// Prueba de punta a punta del inicio de sesión con Discord contra un Discord falso (scripts/entrada-discord-falso.js):
// entrar, sobres de bienvenida, cancelar, estados y códigos inválidos, redirecciones que no salen de la web,
// nombres que no pueden ser fórmulas en Sheets, regalos del staff, reinicio y el modo de producción sin claves.
// La web arranca con datos temporales: no toca data/ ni la plantilla del repositorio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearEntradaDiscordFalsa, CLIENTE } from '../scripts/entrada-discord-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let discord, urlDiscord, carpeta, web, urlWeb;

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Arranca la web con datos temporales; `extra` añade o cambia variables de entorno
async function lanzar(extra = {}) {
  const puerto = 3900 + Math.floor(Math.random() * 90);
  const url = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete entorno[k];
  const proceso = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas',
      CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
      // Sin las BOOST ni los campeones del proyecto: las cartas que salen son de jugador
      ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'), ...extra },
  });
  proceso.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${url}/salud`)).ok) return { proceso, url }; } catch {}
    await esperar(200);
  }
  proceso.kill();
  throw new Error('La web no arranca');
}
async function parar(instancia) {
  if (!instancia) return;
  const fin = new Promise(r => instancia.proceso.once('exit', r));
  instancia.proceso.kill();
  await fin;
}
const entornoDiscord = () => ({ DISCORD_CLIENT_ID: CLIENTE.id, DISCORD_CLIENT_SECRET: CLIENTE.secreto,
  DISCORD_URL_WEB: urlDiscord, DISCORD_URL_API: `${urlDiscord}/api/v10`, DISCORD_URL_CDN: `${urlDiscord}/cdn` });
async function arrancarWeb() {
  const i = await lanzar(entornoDiscord());
  web = i;
  urlWeb = i.url;
}

// Navegador mínimo: guarda las cookies y sigue las redirecciones a mano (o se queda en la primera con seguir = false)
function navegador() {
  const cookies = new Map();
  return {
    cookies,
    async ir(url, opciones = {}, seguir = true) {
      for (let saltos = 0; saltos < 10; saltos++) {
        const r = await fetch(url, { ...opciones, redirect: 'manual',
          headers: { ...(opciones.headers || {}), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
        for (const c of r.headers.getSetCookie()) {
          const [par] = c.split(';');
          const i = par.indexOf('=');
          const [k, v] = [par.slice(0, i), par.slice(i + 1)];
          if (/Max-Age=0/i.test(c) || !v) cookies.delete(k); else cookies.set(k, v);
        }
        if (!seguir || r.status < 300 || r.status >= 400) return r;
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
const control = (orden, datos = {}) => fetch(`${urlDiscord}/_control/${orden}`, { method: 'POST', body: JSON.stringify(datos) }).then(r => r.json());
const estadoDiscord = () => fetch(`${urlDiscord}/_control/estado`, { method: 'POST' }).then(r => r.json());
const gacha = (nav, base = urlWeb) => nav.ir(`${base}/api/gacha`).then(r => r.json());

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-discord-'));
  // Plantilla con jugadores inventados en Kaiju y Tora, y su tier list
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  plantillas.TORA.jugadores = ['Byakko', 'Shiro', 'Kiba', 'Raiden', 'Hoshi'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  const tiers = ['S', 'A', 'B', 'C', 'D'];
  const jugadores = Object.fromEntries(['KAIJU', 'TORA'].flatMap(c => ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'].map((r, i) => [`${c}-${r}`, tiers[i]])));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ jugadores, equipos: {} }));

  discord = crearEntradaDiscordFalsa();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  urlDiscord = `http://127.0.0.1:${discord.servidor.address().port}`;
  await arrancarWeb();
});

after(async () => {
  await parar(web);
  discord?.servidor.close();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

const ana = navegador();

test('un espectador entra con Discord y empieza con 2 sobres', async () => {
  await control('sesion', { usuario: 'ana' });
  const r = await ana.ir(`${urlWeb}/auth/discord`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
  assert.ok(ana.cookies.get('tk_sesion'), 'queda la cookie de sesión');
  const g = await gacha(ana);
  assert.equal(g.activo, true);
  assert.equal(g.discord, true);
  assert.equal(g.usuario.nombre, 'Ana');
  assert.equal(g.usuario.sobres, 2);
  assert.equal(g.usuario.avatar, `${urlDiscord}/cdn/avatars/300000000000000001/abc123.png?size=128`);
});

test('la app se presenta a Discord con un User-Agent propio', async () => {
  const { llamadas } = await estadoDiscord();
  const propias = llamadas.filter(l => l.ruta.startsWith('POST /api/v10/oauth2/token') || l.ruta.startsWith('GET /api/v10/users/@me'));
  assert.ok(propias.length >= 2, 'pidió el token y el perfil');
  for (const l of propias) assert.match(l.agente, /^TenkaIchi /);
});

test('volver a entrar no da otros 2 sobres', async () => {
  await ana.ir(`${urlWeb}/auth/discord`);
  assert.equal((await gacha(ana)).usuario.sobres, 2);
});

test('sin nombre visible usa el nombre de usuario y sin avatar no pone imagen', async () => {
  await control('sesion', { usuario: 'beto' });
  const beto = navegador();
  await beto.ir(`${urlWeb}/auth/discord`);
  const g = await gacha(beto);
  assert.equal(g.usuario.nombre, 'beto');
  assert.equal(g.usuario.avatar, null);
});

test('un nombre que empieza como una fórmula no llega a la hoja como fórmula', async () => {
  await control('sesion', { usuario: 'carla' });
  const carla = navegador();
  await carla.ir(`${urlWeb}/auth/discord`);
  assert.equal((await gacha(carla)).usuario.nombre, 'HYPERLINK("http://x.co","a")');

  await control('sesion', { usuario: 'dani' });
  const dani = navegador();
  await dani.ir(`${urlWeb}/auth/discord`);
  const g = await gacha(dani);
  assert.equal(g.usuario.nombre, 'Dani', 'sin caracteres de control, de dirección ni el + del principio');
  assert.match(g.usuario.avatar, /avatars\/300000000000000004\/a_gif99\.gif/, 'los avatares animados son gif');
});

test('si cancela en Discord vuelve al gachapon sin sesión', async () => {
  const otro = navegador();
  await control('denegar');
  const r = await otro.ir(`${urlWeb}/auth/discord`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
  assert.equal(otro.cookies.get('tk_sesion'), undefined);
});

test('el parámetro volver no puede sacar al visitante de la web', async () => {
  await control('sesion', { usuario: 'ana' });
  for (const volver of ['//evil.example/x', '/\\evil.example', 'https://evil.example/']) {
    const nav = navegador();
    const uno = await nav.ir(`${urlWeb}/auth/discord?volver=${encodeURIComponent(volver)}`, {}, false);
    const dos = await nav.ir(uno.headers.get('location'), {}, false);
    const tres = await nav.ir(dos.headers.get('location'), {}, false);
    assert.equal(tres.status, 302);
    const destino = new URL(tres.headers.get('location'), urlWeb);
    assert.equal(destino.origin, urlWeb, `«${volver}» no debe sacar de la web`);
    assert.equal(destino.pathname, '/gachapon/');
  }
});

test('un volver de la propia web se respeta', async () => {
  const nav = navegador();
  const r = await nav.ir(`${urlWeb}/auth/discord?volver=${encodeURIComponent('/gachapon/#fantasy')}`);
  assert.equal(new URL(r.url).pathname, '/gachapon/');
});

test('un estado que no es el suyo se rechaza y no hay sesión', async () => {
  const nav = navegador();
  await nav.ir(`${urlWeb}/auth/discord`, {}, false);   // deja la cookie con su estado
  const r = await nav.ir(`${urlWeb}/auth/discord/callback?code=lo-que-sea&state=falso`);
  assert.equal(r.status, 400);
  assert.equal(nav.cookies.get('tk_sesion'), undefined);
  // Sin haber empezado el inicio de sesión tampoco vale
  const r2 = await navegador().ir(`${urlWeb}/auth/discord/callback?code=x&state=falso`);
  assert.equal(r2.status, 400);
});

test('un código que Discord no acepta da un error legible y ninguna sesión', async () => {
  const nav = navegador();
  const uno = await nav.ir(`${urlWeb}/auth/discord`, {}, false);
  const estado = new URL(uno.headers.get('location')).searchParams.get('state');
  const r = await nav.ir(`${urlWeb}/auth/discord/callback?code=codigo-malo&state=${estado}`);
  assert.equal(r.status, 502);
  assert.match(await r.text(), /No se pudo entrar/);
  assert.equal(nav.cookies.get('tk_sesion'), undefined);
});

test('sin sesión no se puede abrir un sobre, y el aviso habla de Discord', async () => {
  const r = await navegador().ir(`${urlWeb}/api/gacha/abrir`, { method: 'POST' });
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /Discord/);
});

test('abre un sobre y le salen 3 cartas del catálogo', async () => {
  const j = await (await ana.ir(`${urlWeb}/api/gacha/abrir`, { method: 'POST' })).json();
  assert.equal(j.ok, true);
  assert.equal(j.sobre.length, 3);
  for (const c of j.sobre) assert.match(c.id, /^(KAIJU|TORA)-(TOP|JUNGLA|MEDIO|ADC|SUPPORT)$/);
  assert.equal(j.usuario.sobres, 1);
});

test('el staff regala sobres por el nombre de quien ya ha entrado, y si no existe lo dice sin hablar de Twitch', async () => {
  const antes = (await gacha(ana)).usuario.sobres;
  const r = await accion('gachaRegalar', { usuario: 'ana', cantidad: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.nombre, 'Ana');
  assert.equal((await gacha(ana)).usuario.sobres, antes + 3);
  const nadie = await accion('gachaRegalar', { usuario: 'NadieHaEntradoConEsteNombre', cantidad: 1 });
  assert.equal(nadie.ok, false);
  assert.match(nadie.error, /gachapon/);
  assert.doesNotMatch(nadie.error, /Twitch/);
});

test('el panel sabe que el inicio de sesión con Discord está activo', async () => {
  const g = await accion('gachaEstado');
  assert.equal(g.gacha.login, true);
});

test('al reiniciar la web la sesión del espectador y su colección siguen', async () => {
  const antes = await gacha(ana);
  await parar(web);
  await arrancarWeb();
  const despues = await gacha(ana);
  assert.equal(despues.usuario.nombre, 'Ana');
  assert.equal(despues.usuario.sobres, antes.usuario.sobres);
  assert.equal(despues.usuario.cartas.length, antes.usuario.cartas.length);
});

test('en producción sin las claves de Discord no hay inicio de sesión ni entrada de prueba', async () => {
  const produccion = await lanzar({ RENDER: '1' });
  try {
    const nav = navegador();
    const g = await gacha(nav, produccion.url);
    assert.equal(g.activo, false);
    assert.equal(g.discord, false);
    const r = await nav.ir(`${produccion.url}/auth/discord`);
    assert.equal(r.status, 503);
    assert.match(await r.text(), /Discord/);
    const prueba = await nav.ir(`${produccion.url}/auth/prueba?nombre=Intruso`, {}, false);
    assert.notEqual(prueba.status, 302, 'la entrada de prueba no existe en producción');
    assert.equal(nav.cookies.get('tk_sesion'), undefined);
  } finally {
    await parar(produccion);
  }
});
