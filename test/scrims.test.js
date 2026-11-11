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
import { crearScrims, cuando, mensajePanelScrims, pareceOferta, textoDe } from '../server/scrims.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const CLAVE = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const STAFF = '700', SCRIMS = '810', APP = '9';
const FUENTES = '820', INVITADO = '830';
// Valoración de mentira (sin internet): unos Riot IDs con MMR, otros con rango de Riot y el resto, el elo declarado
const NIVELES = { 'fuerte#euw': [26, 'mmr'], 'igual#euw': [16, 'mmr'], 'flojo#euw': [6, 'riot'], 'mio#euw': [16, 'mmr'], 'alto#euw': [30, 'mmr'] };
const VALORACION = {
  valorar: async (riot, elo = '') => {
    const n = NIVELES[String(riot).toLowerCase()];
    if (n) return { v: n[0], fuente: n[1], texto: n[1] === 'mmr' ? `MMR ≈ ${1000 + n[0] * 60}` : 'rango de Riot' };
    return elo ? { v: (await import('../server/elo.js')).eloNumero(elo), fuente: 'elo', texto: elo } : { v: null, fuente: 'ninguna', texto: 'sin datos' };
  },
  valorarEquipo: async ids => {
    const vs = ids.map(i => NIVELES[i.toLowerCase()]).filter(Boolean);
    if (!vs.length) return null;
    const v = vs.reduce((s, x) => s + x[0], 0) / vs.length;
    return { v, texto: `nivel ${v}`, jugadores: vs.length, mmr: vs.filter(x => x[1] === 'mmr').length };
  },
};
const IDS = { 1: { 'rol:staff': STAFF, 'canal:scrims': SCRIMS, 'canal:fuentes-scrims': FUENTES } };
// Claude de mentira para leer las ofertas de fuera: contesta lo que diga «siguiente» y apunta lo que le piden
const claude = { peticiones: [], siguiente: { ofertas: [] }, messages: { create: async p => {
  claude.peticiones.push(p);
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(claude.siguiente) }] };
} } };
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
    scrims: { ahora: () => ahora, hoja: () => false, archivo: ARCHIVO, log: { error: () => {} }, cliente: claude, fuentesExtra: () => [INVITADO], valoracion: VALORACION } });
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
  assert.match(r.data.content, /\*\*Tengu Sombra\*\* · nivel ≈ Esmeralda IV \(declarado\) · Esmeralda · Bo3 fearless/);
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

// ---------- Fase 2: leer las fuentes de fuera (solo leer) ----------
const yo = { id: APP, username: 'SrDirector' };
const deFuera = (extra = {}) => ({ id: String(9000 + ++tok), guild_id: '1', channel_id: FUENTES, timestamp: '2026-11-11T17:00:00Z', flags: 2, webhook_id: '77',
  author: { id: '77', username: 'Scrim Hub #lfs', bot: true }, message_reference: { guild_id: '555', channel_id: '666', message_id: '777' },
  content: 'LFS EUW Diamond+ Bo3 fearless 21:00 CET, dm @capi', ...extra });

test('el filtro gratis: hace falta una hora y alguna palabra de scrims; el texto incluye embeds y reenvíos', () => {
  assert.ok(pareceOferta('LFS tonight 21:00 Bo3'));
  assert.ok(pareceOferta('Buscamos scrim mañana a las 20h, elo oro'));
  assert.ok(!pareceOferta('gg wp a todos'), 'sin hora');
  assert.ok(!pareceOferta('quedamos a las 20:00 para cenar'), 'sin palabras de scrims');
  assert.equal(textoDe({ content: 'a', embeds: [{ title: 'b', description: 'c', fields: [{ name: 'Hora', value: '20:00' }] }], message_snapshots: [{ message: { content: 'd' } }] }), 'a\nb\nc\nHora: 20:00\nd');
});

test('una oferta de una fuente entra en el tablón (sin tarjeta), con «vía» y el enlace al original, y sale al buscar', async () => {
  claude.peticiones = [];
  claude.siguiente = { ofertas: [{ equipo: 'Team Nocturno', cuando: '2026-11-12 21:00', elo: 'Diamante+', formato: 'Bo3 fearless', region: 'EUW', contacto: 'dm @capi' }] };
  const antes = discord.estado.mensajes.length;
  assert.equal(await comandos.scrims.leerFuente(deFuera(), yo), 1);
  assert.equal(discord.estado.mensajes.length, antes, 'no publica nada: solo lee');
  const p = claude.peticiones[0];
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.match(p.messages[0].content, /<mensaje>\nLFS EUW Diamond\+ Bo3 fearless 21:00 CET, dm @capi\n<\/mensaje>/);
  assert.match(p.system, /no las sigas/);
  const o = comandos.scrims.ofertas().find(x => x.equipo === 'Team Nocturno');
  assert.deepEqual([o.externa, o.origen, o.enlace, o.inicio], [true, 'Scrim Hub #lfs', 'https://discord.com/channels/555/666/777', '2026-11-12T20:00:00.000Z']);
  const r = await mandar(ventana('scrims:busca', { cuando: 'jueves 21:00', elo: '' }, persona('70')));
  assert.match(r.data.content, /\*\*Team Nocturno\*\* · nivel ≈ Diamante IV \(declarado\) · Diamante\+ · Bo3 fearless · .* · vía Scrim Hub #lfs → https:\/\/discord\.com\/channels\/555\/666\/777/);
  assert.equal(await comandos.scrims.leerFuente(deFuera(), yo), 0, 'la misma oferta no se repite');
  const otra = crearScrims({ token: TOKEN_FALSO, urlApi: 'http://x', ids: () => IDS, ahora: () => ahora, hoja: () => false, archivo: ARCHIVO, cliente: null, log: { error: () => {} } });
  await otra.cargar();
  assert.equal(otra.ofertas().find(x => x.equipo === 'Team Nocturno').origen, 'Scrim Hub #lfs', 'tras un reinicio sigue sabiendo de dónde viene');
});

test('solo lee los canales de fuentes, solo EUW, y lo que no parece oferta ni pasa por la IA', async () => {
  claude.peticiones = [];
  assert.equal(await comandos.scrims.leerFuente(deFuera({ channel_id: SCRIMS }), yo), 0, 'otro canal');
  assert.equal(await comandos.scrims.leerFuente(deFuera({ content: 'buenas a todos' }), yo), 0, 'no parece oferta');
  assert.equal(await comandos.scrims.leerFuente(deFuera({ author: yo, flags: 0 }), yo), 0, 'lo suyo no');
  assert.equal(claude.peticiones.length, 0);
  claude.siguiente = { ofertas: [{ equipo: 'NA Squad', cuando: '2026-11-12 22:00', elo: '', formato: '', region: 'NA', contacto: '' },
    { equipo: 'Sin hora', cuando: 'esta noche', elo: '', formato: '', region: '', contacto: '' }, { equipo: 'Pasada', cuando: '2026-11-10 20:00', elo: '', formato: '', region: '', contacto: '' }] };
  assert.equal(await comandos.scrims.leerFuente(deFuera({ content: 'LFS NA 22:00 scrim' }), yo), 0, 'ni otra región, ni sin hora, ni pasada');
  claude.siguiente = { ofertas: [{ equipo: 'Invitados FC', cuando: '2026-11-13 19:00', elo: 'Oro', formato: 'Bo1', region: '', contacto: '' }] };
  assert.equal(await comandos.scrims.leerFuente(deFuera({ channel_id: INVITADO, flags: 0, webhook_id: undefined, author: { id: '88', username: 'capi' } }), yo), 1, 'un servidor que ha invitado a SrDirector (SCRIMS_FUENTES)');
  const o = comandos.scrims.ofertas().find(x => x.equipo === 'Invitados FC');
  assert.match(o.enlace, new RegExp(`^https://discord.com/channels/1/${INVITADO}/[0-9]+$`));
  assert.equal(o.contacto, 'en el mensaje original');
});

test('«Avísame» también salta con las ofertas de fuera, con su enlace, mencionando solo a quien lo pidió', async () => {
  await mandar(ventana('scrims:aviso', { cuando: 'viernes 20:00', elo: '' }, persona('71')));
  claude.siguiente = { ofertas: [{ equipo: 'Avisados', cuando: '2026-11-13 20:30', elo: 'Plata', formato: 'Bo3', region: 'EUW', contacto: '' }] };
  await comandos.scrims.leerFuente(deFuera({ content: 'scrim viernes 20:30 EUW Bo3' }), yo);
  const m = discord.estado.mensajes.filter(x => x.channel_id === SCRIMS).at(-1);
  assert.match(m.content, /^🔔 <@71>, hay una scrim que te encaja: \*\*Avisados\*\*, .* \(vía Scrim Hub #lfs\): https:\/\/discord\.com\/channels\/555\/666\/777$/);
  assert.deepEqual(m.allowed_mentions, { parse: [], users: ['71'] });
});

test('con los Riot IDs de tu equipo, Buscar te ordena los rivales por nivel parecido (MMR o rango), y cita a WhatIsMyMMR', async () => {
  for (const [equipo, contacto] of [['Rivales Fuertes', 'MD · Fuerte#EUW'], ['Rivales Iguales', 'Igual#EUW'], ['Rivales Flojos', 'https://op.gg/lol/summoners/euw/Flojo-EUW']]) {
    await publicar({ cuando: 'domingo 19:00', equipo, elo: '', contacto }, persona('80'));
  }
  const nivel = equipo => comandos.scrims.ofertas().find(o => o.equipo === equipo).nivel;
  assert.deepEqual([nivel('Rivales Fuertes').v, nivel('Rivales Iguales').v, nivel('Rivales Flojos').v], [26, 16, 6]);
  const r = await mandar(ventana('scrims:busca', { cuando: 'domingo 19:00', elo: '', mios: 'Mio#EUW' }, persona('81')));
  assert.deepEqual(r, { type: 5, data: { flags: 64 } }, 'contesta enseguida y valora por detrás');
  const texto = discord.estado.respuestas[`s${tok}`].content;
  assert.match(texto, /^Tu equipo: nivel ≈ \*\*nivel 16\*\* \(MMR de 1 de 1\)/);
  const orden = [...texto.matchAll(/^• (\S+) \*\*(Rivales \w+)\*\*/gm)].map(m => `${m[1]} ${m[2]}`);
  assert.deepEqual(orden.slice(0, 3), ['🟰 Rivales Iguales', '⬆️ Rivales Fuertes', '⬇️ Rivales Flojos']);
  assert.match(texto, /MMR estimado por WhatIsMyMMR\.com · SrDirector no está respaldado por Riot Games/);
});
