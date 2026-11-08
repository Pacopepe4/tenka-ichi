// Newsletter (server/newsletter.js) con un Brevo falso: apuntarse (correo válido, casilla, robots, repetidos, demasiados
// intentos), la crónica que manda el realizador (clave, partida que le toca, familias por nombre), el correo de texto a
// cada suscrito con su enlace de baja, darse de baja, lo que enseña la portada y el estado del panel. Datos temporales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba', CLAVE_NL = 'clave-del-realizador';
let carpeta, web, urlWeb, brevo, urlBrevo;
const correos = [];
let responderBrevo = null;

const esperar = ms => new Promise(r => setTimeout(r, ms));
async function hasta(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) { const v = await fn(); if (v || Date.now() > fin) return v; await esperar(50); }
}
const hoy = new Date().toISOString().slice(0, 10);
const partida = (azul, rojo, ganador, fecha = hoy) => ({ fecha, jornada: 'Jornada 1', fase: 'Fase de liga', serie: `Jornada 1 · ${azul} vs ${rojo}`, partida: 1,
  clanAzul: azul, clanRojo: rojo, ganador, picks: { azul: Array(5).fill(null), rojo: Array(5).fill(null) },
  bans: { azul: Array(5).fill(null), rojo: Array(5).fill(null) }, jugadores: { azul: Array(5).fill(''), rojo: Array(5).fill('') } });

async function arrancarWeb(extra = {}) {
  const puerto = 4900 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|KICK_|RENDER|BREVO_|NEWSLETTER_)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, CARPETA_DATOS: carpeta,
      NEWSLETTER_CLAVE: CLAVE_NL, BREVO_API_KEY: 'brevo-de-prueba', NEWSLETTER_REMITENTE: 'cronicas@gokudo.test', BREVO_URL: urlBrevo, ...extra },
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
async function accion(nombre, datos = {}) {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
  await new Promise((ok, mal) => { ws.on('open', ok); ws.on('error', mal); });
  const r = await new Promise(ok => {
    ws.on('message', m => { const x = JSON.parse(m); if (x.tipo === 'respuesta' && x.id === 1) ok(x); });
    ws.send(JSON.stringify({ tipo: 'accion', id: 1, accion: nombre, datos, clave: CLAVE }));
  });
  ws.close();
  return r;
}
let ip = 0;
const apuntarse = (cuerpo, otraIp = true) => fetch(`${urlWeb}/api/newsletter`, { method: 'POST', body: JSON.stringify(cuerpo),
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': otraIp ? `10.0.0.${++ip}` : '10.9.9.9' } }).then(async r => ({ estado: r.status, ...(await r.json()) }));
const cronica = (cuerpo, clave = CLAVE_NL) => fetch(`${urlWeb}/api/newsletter/partida`, { method: 'POST', body: JSON.stringify(cuerpo),
  headers: { 'Content-Type': 'application/json', ...(clave ? { Authorization: `Bearer ${clave}` } : {}) } }).then(async r => ({ estado: r.status, ...(await r.json()) }));
const portada = () => fetch(`${urlWeb}/api/newsletter`).then(r => r.json());

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-newsletter-'));
  // Brevo falso: guarda cada correo; con responderBrevo se simula un error
  brevo = http.createServer(async (req, res) => {
    let s = ''; for await (const t of req) s += t;
    if (responderBrevo) { const r = responderBrevo; res.writeHead(r.estado, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.cuerpo || {})); }
    if (req.url !== '/smtp/email' || req.headers['api-key'] !== 'brevo-de-prueba') { res.writeHead(401); return res.end('{"message":"Key not found"}'); }
    correos.push(JSON.parse(s));
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messageId: `<${correos.length}@brevo>` }));
  });
  await new Promise(r => brevo.listen(0, '127.0.0.1', r));
  urlBrevo = `http://127.0.0.1:${brevo.address().port}`;
  await arrancarWeb();
});
after(async () => {
  await pararWeb();
  brevo?.close();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

test('sin partidas, la portada dice cuándo es la primera', async () => {
  const n = await portada();
  assert.deepEqual(n.enfrentamientos, []);
  assert.equal(n.dia, null);
  assert.ok(n.proxima === null || /^Jornada \d$/.test(n.proxima.nombre));
});

test('apuntarse pide un correo válido y la casilla; el robot que rellena el campo escondido no queda apuntado', async () => {
  assert.equal((await apuntarse({ correo: 'ana@ejemplo.test' })).error, 'Marca la casilla para aceptar que te escribamos');
  assert.equal((await apuntarse({ correo: 'esto no es un correo', acepto: true })).estado, 400);
  assert.deepEqual(await apuntarse({ correo: 'robot@spam.test', acepto: true, web: 'http://spam' }), { estado: 200, ok: true });
  assert.deepEqual(await apuntarse({ correo: 'Ana@Ejemplo.test', acepto: true }), { estado: 200, ok: true, ya: false });
  assert.deepEqual(await apuntarse({ correo: 'ana@ejemplo.test ', acepto: true }), { estado: 200, ok: true, ya: true }, 'el mismo correo, aunque cambien mayúsculas o espacios');
  assert.equal((await apuntarse({ correo: 'beto@ejemplo.test', acepto: true })).ok, true);
  assert.equal((await accion('gachaEstado')).gacha.newsletter.suscritos, 2);
});

test('más de 5 intentos en 10 minutos desde la misma dirección se frenan', async () => {
  const r = [];
  for (let i = 0; i < 6; i++) r.push((await apuntarse({ correo: `x${i}@ejemplo.test` }, false)).estado);
  assert.deepEqual(r, [400, 400, 400, 400, 400, 429]);
});

test('la crónica del realizador necesita su clave y una partida guardada', async () => {
  assert.equal((await cronica({ texto: 'hola' }, null)).estado, 401);
  assert.equal((await cronica({ texto: 'hola' }, 'otra-clave')).estado, 401);
  assert.equal((await cronica({ texto: 'hola' })).estado, 409, 'todavía no hay partidas');
  assert.equal((await cronica({})).estado, 400);
});

test('con las partidas del día, la crónica va a su enfrentamiento, sale en la portada y llega en texto a cada suscrito con su baja', async () => {
  await pararWeb();
  await writeFile(path.join(carpeta, 'registro.json'), JSON.stringify([
    partida('SARU', 'KAIJU', 'azul', '2026-11-01'),   // de otro día: no sale en la portada
    partida('SARU', 'KAIJU', 'rojo'), partida('TORA', 'BUSHI', 'azul'), partida('ATSUI', 'KEMONO', 'azul'),
  ]));
  await arrancarWeb();

  // Familias por su nombre de Gokudō, con o sin tildes y en el orden que sea
  const r = await cronica({ azul: 'yasha', rojo: 'Tsuki', titulo: 'Yasha se come la luna', texto: 'Yasha robó el Barón.\nY ganó.', resumen: 'Yasha 21 – 12 Tsuki' });
  assert.equal(r.estado, 202);
  assert.deepEqual(r.partida, { azul: 'SARU', rojo: 'KAIJU', ganador: 'KAIJU', jornada: 'Jornada 1' });
  await hasta(() => correos.length >= 2);
  assert.equal(correos.length, 2, 'uno por suscrito');
  const [c] = correos.filter(x => x.to[0].email === 'ana@ejemplo.test');
  assert.deepEqual(c.sender, { name: 'Gokudō', email: 'cronicas@gokudo.test' });
  assert.equal(c.subject, 'Yasha se come la luna · Gokudō');
  assert.match(c.textContent, /^GOKUDŌ 極道 · Jornada 1\n\nTsuki contra Yasha: gana Yasha\n\nYasha se come la luna\n\nYasha robó el Barón\.\nY ganó\.\n\nRESUMEN\nYasha 21 – 12 Tsuki/);
  const baja = c.textContent.match(/(http:\/\/\S+\/newsletter\/baja\?t=[0-9a-f]{32})/)[1];
  assert.equal(c.headers['List-Unsubscribe'], `<${baja}>`);
  assert.ok(!c.html && !c.htmlContent, 'solo texto');

  // Sin familias: la última partida guardada
  assert.deepEqual((await cronica({ texto: 'Ryūjin arrasa.' })).partida.ganador, 'ATSUI');
  await hasta(() => correos.length >= 4);

  const n = await portada();
  assert.equal(n.dia, hoy);
  assert.equal(n.jornada, 'Jornada 1');
  assert.deepEqual(n.enfrentamientos.map(e => [e.azul, e.rojo, e.ganador, e.titulo]),
    [['SARU', 'KAIJU', 'KAIJU', 'Yasha se come la luna'], ['TORA', 'BUSHI', 'TORA', ''], ['ATSUI', 'KEMONO', 'ATSUI', '']]);
  assert.equal(n.enfrentamientos[2].texto, 'Ryūjin arrasa.');

  // Darse de baja con el enlace del correo: la siguiente crónica ya no le llega
  const pagina = await fetch(baja.replace(/^http:\/\/[^/]+/, urlWeb));
  assert.match(await pagina.text(), /Te has dado de baja/);
  assert.match(await (await fetch(baja.replace(/^http:\/\/[^/]+/, urlWeb))).text(), /Ya no estabas apuntado/);
  const antes = correos.length;
  await cronica({ azul: 'TORA', rojo: 'BUSHI', texto: 'Byakko caza a Akuma.' });
  await hasta(() => correos.length > antes);
  await esperar(200);
  assert.deepEqual(correos.slice(antes).map(x => x.to[0].email), ['beto@ejemplo.test']);
  const e = (await accion('gachaEstado')).gacha.newsletter;
  assert.deepEqual([e.suscritos, e.cronicas, e.envio, e.realizador, e.ultimoEnvio.enviados], [1, 3, true, true, 1]);
});

test('las suscripciones y las crónicas siguen tras reiniciar la web', async () => {
  await pararWeb();
  await arrancarWeb();
  const e = (await accion('gachaEstado')).gacha.newsletter;
  assert.deepEqual([e.suscritos, e.cronicas], [1, 3]);
  assert.equal((await portada()).enfrentamientos[0].titulo, 'Yasha se come la luna');
  const archivo = JSON.parse(await readFile(path.join(carpeta, 'newsletter.json'), 'utf8'));
  assert.deepEqual(archivo.map(f => f[2]), ['alta', 'alta', 'baja']);
});

test('si Brevo falla, la crónica se guarda igual y el panel lo dice', async () => {
  responderBrevo = { estado: 401, cuerpo: { message: 'Key not found' } };
  await cronica({ azul: 'ATSUI', rojo: 'KEMONO', texto: 'Otra.' });
  const e = await hasta(async () => { const x = (await accion('gachaEstado')).gacha.newsletter; return x.cronicas === 4 ? x : null; });
  responderBrevo = null;
  assert.equal(e.ultimoEnvio.enviados, 0);
  assert.equal(e.ultimoEnvio.fallos, 1);
  assert.match(e.ultimoEnvio.error, /Brevo respondió 401: Key not found/);
});

test('sin Brevo configurado no se manda nada, pero la crónica sale en la portada; sin NEWSLETTER_CLAVE no se aceptan crónicas', async () => {
  await pararWeb();
  await arrancarWeb({ BREVO_API_KEY: '', NEWSLETTER_REMITENTE: '' });
  const antes = correos.length;
  assert.equal((await cronica({ azul: 'SARU', rojo: 'KAIJU', titulo: 'Revancha', texto: 'Sin correo.' })).estado, 202);
  assert.equal(await hasta(async () => (await portada()).enfrentamientos[0].titulo === 'Revancha'), true);
  assert.equal(correos.length, antes);
  const e = (await accion('gachaEstado')).gacha.newsletter;
  assert.equal(e.envio, false);
  assert.match(e.ultimoEnvio.error, /no está configurado/);

  await pararWeb();
  await arrancarWeb({ NEWSLETTER_CLAVE: '' });
  assert.equal((await cronica({ texto: 'x' })).estado, 503);
});
