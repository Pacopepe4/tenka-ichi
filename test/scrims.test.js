// Tablón de scrims: Discord manda los clics firmados a la web y scripts/discord-api-falso.js hace de Discord. Se
// comprueba publicar (tarjeta en #scrims), buscar, «Avísame», retirar, el tope por persona y que caduquen solas.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { crearComandos } from '../server/discord-comandos.js';
import { crearScrims, cuando, mensajePanelScrims } from '../server/scrims.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const CLAVE = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const STAFF = '700', SCRIMS = '810', APP = '9';
const IDS = { 1: { 'rol:staff': STAFF, 'canal:scrims': SCRIMS } };
const ARCHIVO = path.join(mkdtempSync(path.join(os.tmpdir(), 'scrims-')), 'scrims.json');
// Miércoles 11/11/2026 a las 19:00 en Madrid
let ahora = new Date('2026-11-11T18:00:00Z');
let discord, web, url, comandos, tok = 0;

before(async () => {
  discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  discord.estado.canales.push({ id: SCRIMS, type: 0, name: '🔎・scrims', position: 0, parent_id: null, permission_overwrites: [] });
  comandos = crearComandos({ clave: CLAVE, token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, ids: () => IDS, familias: () => [],
    tickets: { cliente: null, kbstats: null, memoria: null, saber: () => '' },
    scrims: { ahora: () => ahora, hoja: () => false, archivo: ARCHIVO, log: { error: () => {} } } });
  web = http.createServer(async (req, res) => { const r = await comandos.atender(req); res.writeHead(r.estado, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.cuerpo)); });
  await new Promise(r => web.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${web.address().port}/`;
});
after(() => { discord.servidor.close(); web.close(); });
beforeEach(() => { ahora = new Date('2026-11-11T18:00:00Z'); });

async function mandar(cuerpo) {
  const texto = JSON.stringify(cuerpo);
  const momento = String(Math.floor(Date.now() / 1000));
  const firma = crypto.sign(null, Buffer.from(momento + texto), privateKey).toString('hex');
  const r = await fetch(url, { method: 'POST', body: texto, headers: { 'X-Signature-Timestamp': momento, 'X-Signature-Ed25519': firma } });
  const j = await r.json();
  await comandos.scrims.esperar();
  return j;
}
const persona = (id, roles = []) => ({ user: { id, username: `u${id}`, global_name: `Capi ${id}` }, roles, permissions: '0' });
const clic = (custom_id, quien = persona('20')) => ({ type: 3, application_id: APP, token: `s${++tok}`, guild_id: '1', channel_id: SCRIMS, member: quien, data: { custom_id } });
const ventana = (custom_id, campos, quien) => ({ ...clic(custom_id, quien), type: 5, data: { custom_id, components: Object.entries(campos).map(([id, value]) => ({ type: 1, components: [{ type: 4, custom_id: id, value }] })) } });
const publicar = (campos, quien) => mandar(ventana('scrims:nueva', { equipo: 'Akuma Academy', elo: 'Oro-Platino', formato: 'Bo3 fearless', contacto: 'MD a @capi', ...campos }, quien));
const tarjetas = () => discord.estado.mensajes.filter(m => m.channel_id === SCRIMS && m.embeds?.[0]?.title?.includes('busca scrim'));

test('los botones del mensaje fijo abren sus ventanas', async () => {
  assert.deepEqual(mensajePanelScrims().components[0].components.map(b => b.custom_id), ['scrims:publicar', 'scrims:buscar', 'scrims:avisame']);
  const v = await mandar(clic('scrims:publicar'));
  assert.equal(v.type, 9);
  assert.equal(v.data.custom_id, 'scrims:nueva');
  assert.deepEqual(v.data.components.map(f => f.components[0].custom_id), ['equipo', 'cuando', 'elo', 'formato', 'contacto']);
  assert.equal((await mandar(clic('scrims:buscar'))).data.custom_id, 'scrims:busca');
});

test('publicar deja una tarjeta en #scrims con la hora en la de cada uno y un botón para retirarla, y se guarda', async () => {
  const r = await publicar({ cuando: 'jueves 20:00' });
  assert.deepEqual(r, { type: 5, data: { flags: 64 } });
  const t = tarjetas().at(-1);
  assert.equal(t.embeds[0].title, '⚔️ Akuma Academy busca scrim');
  const inicio = Date.parse('2026-11-12T19:00:00Z') / 1000;
  assert.equal(t.embeds[0].fields[0].value, `<t:${inicio}:F> (<t:${inicio}:R>)`);
  assert.match(t.components[0].components[0].custom_id, /^scrims:retirar:[0-9a-f]{10}$/);
  assert.match(discord.estado.respuestas[`s${tok}`].content, new RegExp(`^Publicada: https://discord.com/channels/1/${SCRIMS}/${t.id}$`));
  assert.ok(JSON.parse(readFileSync(ARCHIVO, 'utf8')).some(o => o.mensaje === t.id));
});

test('si no se entiende la hora, o ya ha pasado, lo dice y no publica', async () => {
  const antes = tarjetas().length;
  assert.match((await publicar({ cuando: 'cuando podáis' })).data.content, /No entiendo cuándo/);
  assert.match((await publicar({ cuando: 'hoy 10:00' })).data.content, /ya ha pasado/);
  assert.equal(tarjetas().length, antes);
});

test('buscar enseña las que empiezan una hora antes o después (y del elo que se diga), solo a quien busca', async () => {
  await publicar({ cuando: 'viernes 21:00', equipo: 'Tengu Sombra', elo: 'Esmeralda' });
  const r = await mandar(ventana('scrims:busca', { cuando: 'viernes 21:30', elo: '' }, persona('30')));
  assert.equal(r.data.flags, 64);
  assert.match(r.data.content, /\*\*Tengu Sombra\*\* · Esmeralda · Bo3 fearless/);
  assert.match(r.data.content, /https:\/\/discord\.com\/channels\/1\/810\/\d+/);
  assert.match((await mandar(ventana('scrims:busca', { cuando: 'viernes 21:00', elo: 'hierro' }, persona('30')))).data.content, /no hay ninguna scrim/);
  assert.match((await mandar(ventana('scrims:busca', { cuando: 'viernes 23:30', elo: '' }, persona('30')))).data.content, /Avísame/);
});

test('«Avísame»: cuando alguien publica una que encaja, menciona solo a esa persona en #scrims', async () => {
  const r = await mandar(ventana('scrims:aviso', { cuando: 'sábado 18:00', elo: 'platino' }, persona('40')));
  assert.match(r.data.content, /^Hecho: te menciono/);
  await publicar({ cuando: 'sábado 18:30', elo: 'Oro-Platino', equipo: 'Byakko B' }, persona('41'));
  const m = discord.estado.mensajes.filter(x => x.channel_id === SCRIMS).at(-1);
  assert.match(m.content, /^🔔 <@40>, hay una scrim que te encaja: \*\*Byakko B\*\*/);
  assert.deepEqual(m.allowed_mentions, { parse: [], users: ['40'] });
  assert.equal(comandos.scrims.avisos().filter(a => a.usuario === '40').length, 0, 'el aviso se gasta');
});

test('retirar: solo quien la puso o el staff; la tarjeta se borra', async () => {
  await publicar({ cuando: 'domingo 17:00', equipo: 'Para retirar' }, persona('50'));
  const t = tarjetas().find(x => x.embeds[0].title.includes('Para retirar'));
  const boton = t.components[0].components[0].custom_id;
  assert.match((await mandar(clic(boton, persona('51')))).data.content, /Solo puede retirarla/);
  assert.match((await mandar(clic(boton, persona('52', [STAFF])))).data.content, /Retirada/);
  assert.ok(!discord.estado.mensajes.includes(t));
});

test('como mucho 3 a la vez por persona (el staff, sin tope), y se borran solas al empezar', async () => {
  for (const d of ['lunes 20:00', 'martes 20:00', 'miércoles 20:00']) await publicar({ cuando: d, equipo: `Tope ${d}` }, persona('60'));
  assert.match((await publicar({ cuando: 'jueves 22:00' }, persona('60'))).data.content, /Ya tienes 3 scrims/);
  const lunes = tarjetas().find(x => x.embeds[0].title.includes('Tope lunes'));
  ahora = new Date('2026-11-16T19:30:00Z');   // lunes 20:30 en Madrid: la del lunes ya ha empezado
  assert.ok(await comandos.scrims.limpiar() >= 1);
  assert.ok(!discord.estado.mensajes.includes(lunes));
  assert.ok(!comandos.scrims.ofertas().some(o => o.equipo === 'Tope lunes 20:00'));
});

test('tras un reinicio se vuelven a cargar las ofertas guardadas', async () => {
  const otra = crearScrims({ token: TOKEN_FALSO, urlApi: 'http://x', ids: () => IDS, ahora: () => ahora, hoja: () => false, archivo: ARCHIVO, log: { error: () => {} } });
  await otra.cargar();
  assert.equal(otra.ofertas().length, comandos.scrims.ofertas().length);
});

test('cuándo: entiende «jueves 20:00», «mañana 19.30», «14/11 19:30», «20:00» y «pasado mañana 22», en hora de España', () => {
  const base = new Date('2026-11-11T18:00:00Z');   // miércoles 19:00
  const madrid = d => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  assert.equal(madrid(cuando('jueves 20:00', base)), 'jueves, 12/11, 20:00');
  assert.equal(madrid(cuando('mañana 19.30', base)), 'jueves, 12/11, 19:30');
  assert.equal(madrid(cuando('14/11 19:30', base)), 'sábado, 14/11, 19:30');
  assert.equal(madrid(cuando('20:00', base)), 'miércoles, 11/11, 20:00');
  assert.equal(madrid(cuando('18:00', base)), 'jueves, 12/11, 18:00', 'sin día y ya pasada: mañana');
  assert.equal(madrid(cuando('miércoles 18:00', base)), 'miércoles, 18/11, 18:00', 'el mismo día de la semana ya pasado: la semana que viene');
  assert.equal(madrid(cuando('pasado mañana 22', base)), 'viernes, 13/11, 22:00');
  assert.equal(cuando('cuando podáis', base), null);
  assert.equal(cuando('25:00', base), null);
  // En verano (CEST, UTC+2) también
  assert.equal(cuando('1/7 20:00', base).toISOString(), '2027-07-01T18:00:00.000Z');
});

test('npm run discord-scrims publica el mensaje con los tres botones en #scrims (y la segunda vez lo actualiza)', async () => {
  const { publicarPanel } = await import('../scripts/discord-tickets.js');
  const { crearApi } = await import('../scripts/discord-aplicar.js');
  const { writeFileSync } = await import('node:fs');
  const archivoIds = path.join(mkdtempSync(path.join(os.tmpdir(), 'scrims-ids-')), 'ids.json');
  writeFileSync(archivoIds, JSON.stringify({ 1: { 'canal:scrims': SCRIMS } }));
  const api = crearApi({ token: TOKEN_FALSO, base: `http://127.0.0.1:${discord.servidor.address().port}/api/v10` });
  const primera = await publicarPanel({ api, archivoIds, panel: 'scrims', log: () => {} });
  assert.equal(primera.nuevo, true);
  assert.equal(JSON.parse(readFileSync(archivoIds, 'utf8'))[1]['mensaje:scrims'], primera.mensaje);
  assert.equal((await publicarPanel({ api, archivoIds, panel: 'scrims', log: () => {} })).nuevo, false);
  await assert.rejects(publicarPanel({ api, archivoIds, panel: 'tickets', log: () => {} }), /No está el canal #tickets/);
});
