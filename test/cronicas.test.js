// Crónicas de las partidas (server/cronicas.js) con un Discord falso (scripts/discord-webhook-falso.js): la clave del
// realizador, la partida a la que va cada crónica (por el nombre de las familias o la última), la publicación en
// #resultados con el color y el kamon de la ganadora, el corte de los textos largos, lo que enseña la portada, el
// reinicio y qué pasa si Discord falla o falta configurarlo. La web arranca con datos temporales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearDiscordFalso } from '../scripts/discord-webhook-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba', CLAVE_CR = 'clave-del-realizador';
let carpeta, web, urlWeb, discord, urlDiscord;

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
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|KICK_|RENDER|CRONICAS_)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, CARPETA_DATOS: carpeta, CRONICAS_CLAVE: CLAVE_CR,
      DISCORD_WEBHOOK_URL: `${urlDiscord}/api/webhooks/1/colecciones`, DISCORD_WEBHOOK_RESULTADOS: `${urlDiscord}/api/webhooks/3/resultados`, ...extra },
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
const cronica = (cuerpo, clave = CLAVE_CR) => fetch(`${urlWeb}/api/cronicas/partida`, { method: 'POST', body: JSON.stringify(cuerpo),
  headers: { 'Content-Type': 'application/json', ...(clave ? { Authorization: `Bearer ${clave}` } : {}) } }).then(async r => ({ estado: r.status, ...(await r.json()) }));
const portada = () => fetch(`${urlWeb}/api/cronicas`).then(r => r.json());
const enResultados = () => discord.estado.mensajes.filter(m => m.canal === 'resultados');
const estadoPanel = async () => (await accion('gachaEstado')).gacha.cronicas;

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-cronicas-'));
  discord = crearDiscordFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  urlDiscord = `http://127.0.0.1:${discord.servidor.address().port}`;
  await arrancarWeb();
});
after(async () => {
  await pararWeb();
  discord?.servidor.close();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

test('sin partidas, la portada dice cuándo es la primera y el realizador no puede mandar nada todavía', async () => {
  const n = await portada();
  assert.deepEqual(n.enfrentamientos, []);
  assert.equal(n.dia, null);
  assert.ok(n.proxima === null || /^Jornada \d$/.test(n.proxima.nombre));
  assert.equal((await cronica({ texto: 'hola' })).estado, 409);
});

test('la crónica necesita la clave del realizador y texto o resumen', async () => {
  assert.equal((await cronica({ texto: 'hola' }, null)).estado, 401);
  assert.equal((await cronica({ texto: 'hola' }, 'otra-clave')).estado, 401);
  assert.equal((await cronica({})).estado, 400);
  assert.equal((await cronica({ texto: 'x'.repeat(20001) })).estado, 413);
});

test('con las partidas del día, la crónica va a su enfrentamiento, sale en #resultados y en la portada', async () => {
  await pararWeb();
  await writeFile(path.join(carpeta, 'registro.json'), JSON.stringify([
    partida('SARU', 'KAIJU', 'azul', '2026-11-01'),   // de otro día: no sale en la portada
    partida('SARU', 'KAIJU', 'rojo'), partida('TORA', 'BUSHI', 'azul'), partida('ATSUI', 'KEMONO', 'azul'),
  ]));
  await arrancarWeb();

  // Familias por su nombre de Gokudō, con o sin mayúsculas y en el orden que sea
  const r = await cronica({ azul: 'yasha', rojo: 'Tsuki', titulo: 'Yasha se come la *luna*', texto: 'Yasha robó el Barón.\nY ganó.', resumen: 'Yasha 21 – 12 Tsuki' });
  assert.equal(r.estado, 202);
  assert.deepEqual(r.partida, { azul: 'SARU', rojo: 'KAIJU', ganador: 'KAIJU', jornada: 'Jornada 1' });
  const m = await hasta(() => enResultados()[0]);
  const e = m.payload.embeds[0];
  assert.equal(e.title, 'Tsuki contra Yasha: gana Yasha');
  assert.equal(e.color, 0x5FA341, 'el verde de Yasha');
  assert.match(e.thumbnail.url, /\/logos\/KAIJU\.png$/);
  assert.match(e.url, /\/#liga$/);
  assert.equal(e.description, '**Yasha se come la \\*luna\\***\n\nYasha robó el Barón.\nY ganó.', 'el título en negrita y el texto escapado');
  assert.deepEqual(e.fields, [{ name: 'Resumen', value: 'Yasha 21 – 12 Tsuki' }]);
  assert.equal(e.footer.text, 'Gokudō 極道 · Jornada 1');
  assert.deepEqual(m.payload.allowed_mentions, { parse: [] });
  assert.equal(m.payload.username, 'Gokudō');

  // Sin familias: la última partida guardada
  assert.equal((await cronica({ texto: 'Ryūjin arrasa.' })).partida.ganador, 'ATSUI');
  await hasta(() => enResultados().length >= 2);

  const n = await portada();
  assert.equal(n.dia, hoy);
  assert.equal(n.jornada, 'Jornada 1');
  assert.deepEqual(n.enfrentamientos.map(x => [x.azul, x.rojo, x.ganador, x.titulo]),
    [['SARU', 'KAIJU', 'KAIJU', 'Yasha se come la *luna*'], ['TORA', 'BUSHI', 'TORA', ''], ['ATSUI', 'KEMONO', 'ATSUI', '']]);
  assert.equal(n.enfrentamientos[2].texto, 'Ryūjin arrasa.');
  const p = await estadoPanel();
  assert.deepEqual([p.cronicas, p.realizador, p.discord, p.ultima.publicada], [2, true, true, true]);
});

test('un texto más largo de lo que cabe en Discord se corta con un enlace a la web', async () => {
  const antes = enResultados().length;
  await cronica({ azul: 'TORA', rojo: 'BUSHI', texto: 'palabra '.repeat(1000), resumen: 'dato '.repeat(400) });
  const e = (await hasta(() => enResultados()[antes])).payload.embeds[0];
  assert.ok(e.description.length <= 4096);
  assert.match(e.description, /… \[Sigue en la web\]\(http:\/\/\S+\/#liga\)$/);
  assert.ok(e.fields[0].value.length <= 1024);
  assert.equal((await portada()).enfrentamientos[1].texto, 'palabra '.repeat(1000).trim(), 'en la web va entera');
});

test('las crónicas siguen tras reiniciar la web', async () => {
  await pararWeb();
  await arrancarWeb();
  assert.equal((await estadoPanel()).cronicas, 3);
  assert.equal((await portada()).enfrentamientos[0].titulo, 'Yasha se come la *luna*');
  const archivo = JSON.parse(await readFile(path.join(carpeta, 'cronicas.json'), 'utf8'));
  assert.deepEqual(archivo.map(f => f[6]), ['publicada', 'publicada', 'publicada']);
});

test('si Discord falla, la crónica se guarda igual, sale en la portada y el panel lo dice', async () => {
  discord.estado.responder = { estado: 404, cuerpo: { message: 'Unknown Webhook' } };
  await cronica({ azul: 'ATSUI', rojo: 'KEMONO', titulo: 'Sin Discord', texto: 'Otra.' });
  // Se espera a esta crónica en concreto (la de Ryūjin contra Tengu, sin publicar), no solo a que haya 4: con todas las
  // pruebas a la vez, el equipo va cargado y el panel puede contestar mientras la web aún la está guardando
  const p = await hasta(async () => { const x = await estadoPanel(); return x.cronicas === 4 && x.ultima?.partida === 'ATSUI contra KEMONO' ? x : null; }, 10000);
  assert.equal(p.ultima.publicada, false);
  assert.match(p.ultima.error, /ya no existe/);
  assert.equal((await portada()).enfrentamientos[2].titulo, 'Sin Discord');
});

test('sin webhook de #resultados va al de siempre; sin ninguno, solo a la portada; sin CRONICAS_CLAVE no se aceptan', async () => {
  await pararWeb();
  await arrancarWeb({ DISCORD_WEBHOOK_RESULTADOS: '' });
  const antes = discord.estado.mensajes.length;
  await cronica({ azul: 'SARU', rojo: 'KAIJU', titulo: 'Al de siempre', texto: '.' });
  const m = await hasta(() => discord.estado.mensajes[antes]);
  assert.equal(m.canal, 'colecciones');

  await pararWeb();
  await arrancarWeb({ DISCORD_WEBHOOK_RESULTADOS: '', DISCORD_WEBHOOK_URL: '' });
  await cronica({ azul: 'SARU', rojo: 'KAIJU', titulo: 'Sin webhook', texto: '.' });
  assert.equal(await hasta(async () => (await portada()).enfrentamientos[0].titulo === 'Sin webhook'), true);
  const p = await estadoPanel();
  assert.equal(p.discord, false);
  assert.match(p.ultima.error, /DISCORD_WEBHOOK_RESULTADOS/);

  await pararWeb();
  await arrancarWeb({ CRONICAS_CLAVE: '' });
  assert.equal((await cronica({ texto: 'x' })).estado, 503);
});
