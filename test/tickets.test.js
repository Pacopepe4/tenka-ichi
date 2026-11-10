// Tickets de Discord: Discord manda los clics firmados a la web (scripts/discord-api-falso.js hace de Discord para los
// hilos y los mensajes) y la IA es un Claude de mentira que apunta lo que le piden. Se comprueba el recorrido entero:
// abrir el ticket, preguntar otra cosa, llamar al staff, cerrar, los topes y qué pasa si la IA falla.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { crearComandos } from '../server/discord-comandos.js';
import { conversacion, mensajePanel, textoSistema, textoCartas } from '../server/tickets.js';
import { crearApi } from '../scripts/discord-aplicar.js';
import { publicarPanel } from '../scripts/discord-tickets.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const CLAVE = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const STAFF = '700', CANAL = '800', APP = '9';
const IDS = { 1: { 'rol:staff': STAFF, 'canal:tickets': CANAL } };
const CLANES = [{ id: 'SARU', nombre: 'Tsuki' }, { id: 'TORA', nombre: 'Byakko' }, { id: 'AMATERATSU', nombre: 'Shinigami' }];
const SABER = `<!-- nota para el staff -->
## Base <!-- nucleo -->
FICHA DE PRUEBA
## Gacha <!-- gachapon -->
RAMA-GACHAPON
## Liga <!-- liga -->
RAMA-LIGA
## Lore <!-- lore -->
RAMA-LORE`;
const CATALOGO = [
  { id: 'SARU-TOP', tipo: 'jugador', clan: 'SARU', rol: 'TOP', nombre: 'KINGKAI', tier: 'A', campeon: 'KSante' },
  { id: 'BOOST-MAKITAH', tipo: 'boost', nombre: 'MAKITAH', subtitulo: 'EL TITIRITERO', tier: 'S+', campeon: 'Syndra', multiplicador: 3, condicion: 'dano' },
  { id: 'LEGACY-GAATSU', tipo: 'legacy', nombre: 'GAATSU', subtitulo: 'DEMON', clan: 'AMATERATSU', campeon: 'Aatrox' },
  { id: 'JEFE-SARU', tipo: 'jefe', nombre: 'TSUKI', subtitulo: 'Oyabun de Tsuki', clan: 'SARU' },
];

// Claude de mentira: contesta lo que diga «siguiente» (o el texto por defecto) y apunta cada petición
const claude = { peticiones: [], siguiente: null, messages: { create: async p => {
  claude.peticiones.push(p);
  const s = claude.siguiente; claude.siguiente = null;
  if (s instanceof Error) throw s;
  return { stop_reason: s?.stop_reason || 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(s?.json || { respuesta: 'La próxima jornada es el domingo a las 17:00.', llamarStaff: false }) }] };
} } };

let discord, web, url, comandos, errores, hoy;

before(async () => {
  discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  discord.estado.canales.push({ id: CANAL, type: 0, name: '🎫・tickets', position: 4, parent_id: '3', permission_overwrites: [] });
  comandos = crearComandos({ clave: CLAVE, token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, ids: () => IDS,
    familias: () => [], tickets: { cliente: claude, modelo: 'claude-haiku-5-5', topePersona: 2, topeDia: 4, saber: () => SABER,
      datosLiga: () => ({ formato: { liguilla: [{ jornada: 1, nombre: 'Jornada 1', fecha: '2026-11-15' }], hora: '17:00', margen: 45 },
        calendario: { jornadas: [[{ jornada: 1, azul: 'SARU', rojo: 'TORA' }]] },
        clasificacion: { filas: [{ clan: 'SARU', puesto: 1, victorias: 1, derrotas: 0, ganados: ['TORA'] }, { clan: 'TORA', puesto: 2, victorias: 0, derrotas: 1, ganados: [] }] } }),
      cartas: () => ({ catalogo: CATALOGO, puntos: new Map([['SARU-TOP', { puntos: 34.5, partidas: 2 }]]) }),
      kbstats: { datos: async () => ({ cabecera: 'CABECERA-KB', filas: [{ nombre: 'Despo', rol: 'Top', texto: '- KB Despo#KAIJU nota 85' }, { nombre: 'Sergi', rol: 'Support', texto: '- KB Sergi#KBK nota 85' }] }) },
      ahora: () => hoy, log: { error: (...a) => errores.push(a.join(' ')) } } });
  web = http.createServer(async (req, res) => {
    const r = await comandos.atender(req);
    res.writeHead(r.estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.cuerpo));
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${web.address().port}/discord/interacciones`;
});
after(() => { discord.servidor.close(); web.close(); });
let dia = 1;
beforeEach(() => {
  // Cada prueba en un día distinto, para que no se pisen los topes
  hoy = new Date(Date.UTC(2026, 10, dia++, 12));
  claude.peticiones = []; claude.siguiente = null; errores = [];
});

async function mandar(cuerpo) {
  const texto = JSON.stringify(cuerpo);
  const momento = String(Math.floor(Date.now() / 1000));
  const firma = crypto.sign(null, Buffer.from(momento + texto), privateKey).toString('hex');
  const r = await fetch(url, { method: 'POST', body: texto, headers: { 'Content-Type': 'application/json', 'X-Signature-Timestamp': momento, 'X-Signature-Ed25519': firma } });
  const j = await r.json();
  await comandos.tickets.esperar();
  return j;
}
const persona = (id, { staff = false } = {}) => ({ user: { id, username: `u${id}`, global_name: `Persona ${id}` }, roles: staff ? [STAFF] : [], permissions: '0' });
let tok = 0;
const clic = (custom_id, { quien = persona('20'), canal = CANAL } = {}) => ({ type: 3, id: 'x', application_id: APP, token: `t${++tok}`, guild_id: '1', channel_id: canal, member: quien, data: { custom_id, component_type: 2 } });
const enviar = (custom_id, texto, opciones) => ({ ...clic(custom_id, opciones), type: 5, data: { custom_id, components: [{ type: 1, components: [{ type: 4, custom_id: 'pregunta', value: texto }] }] } });
const ultimaRespuesta = () => discord.estado.respuestas[`t${tok}`];

async function abrirTicket(texto = '¿Cuándo es la próxima jornada?', quien = persona('20')) {
  const r = await mandar(enviar('ticket:nuevo', texto, { quien }));
  const hilo = discord.estado.canales.filter(c => c.type === 12).at(-1);
  return { r, hilo, mensajes: discord.estado.mensajes.filter(m => m.channel_id === hilo?.id) };
}

test('el botón «Abrir ticket» abre la ventana «¿Qué necesitas?»', async () => {
  const r = await mandar(clic('ticket:abrir'));
  assert.equal(r.type, 9);
  assert.equal(r.data.custom_id, 'ticket:nuevo');
  assert.equal(r.data.title, '¿Qué necesitas?');
  assert.equal(r.data.components[0].components[0].custom_id, 'pregunta');
});

test('al enviar la ventana se abre un hilo privado con esa persona y la IA contesta allí, con sus tres botones', async () => {
  const { r, hilo, mensajes } = await abrirTicket();
  assert.deepEqual(r, { type: 5, data: { flags: 64 } }, 'contesta enseguida con «pensando…» que solo ve ella');
  assert.equal(hilo.type, 12);
  assert.equal(hilo.parent_id, CANAL);
  assert.equal(hilo.invitable, false);
  assert.match(hilo.name, /Persona 20/);
  assert.ok(hilo.miembros.includes('20'), 'la persona entra en el hilo');
  assert.equal(mensajes.length, 2);
  const respuesta = mensajes[1];
  assert.match(respuesta.embeds[0].description, /¿Cuándo es la próxima jornada\?/);
  assert.match(respuesta.embeds[0].description, /domingo a las 17:00/);
  assert.equal(respuesta.embeds[0].color, 0xBE2A2F);
  assert.deepEqual(respuesta.components[0].components.map(b => b.custom_id), ['ticket:preguntar:20', 'ticket:staff:20', 'ticket:cerrar:20']);
  assert.deepEqual(respuesta.allowed_mentions, { parse: [] }, 'si la IA sabe la respuesta, no se menciona a nadie');
  assert.equal(ultimaRespuesta().content, `Tu ticket está abierto: <#${hilo.id}>`);
});

test('la IA recibe el núcleo en la caché y, en el mensaje, solo las ramas de la pregunta: la liga en vivo en texto corto', async () => {
  await abrirTicket('¿Cómo va Tsuki?');
  const p = claude.peticiones[0];
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.system.length, 1);
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.match(p.system[0].text, /FICHA DE PRUEBA/);
  assert.doesNotMatch(p.system[0].text, /RAMA-|nota para el staff|2026-11|Hoy es/, 'en la caché solo va lo que no cambia');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.deepEqual(p.output_config.format.schema.required, ['respuesta', 'llamarStaff']);
  assert.equal(p.thinking, undefined, 'no se manda thinking: con Haiku 5.5 y Opus 5.5 va solo');
  const mensaje = p.messages[0].content;
  assert.match(mensaje, /<pregunta>\n¿Cómo va Tsuki\?\n<\/pregunta>/);
  assert.match(mensaje, /RAMA-LIGA/);
  assert.match(mensaje, /RAMA-LORE/, 'nombra una familia: va su lore');
  assert.doesNotMatch(mensaje, /RAMA-GACHAPON/);
  assert.match(mensaje, /Jornada 1 \(2026-11-15\): Tsuki \(azul\) vs Byakko \(rojo\), gana Tsuki/);
  assert.match(mensaje, /Clasificación: 1\.º Tsuki 1-0 · 2\.º Byakko 0-1/);
  assert.doesNotMatch(mensaje, /SARU|kb_stats/);
});

test('si preguntan por un jugador van su carta y solo su fila de KB Stats; un «hola» va sin ramas', async () => {
  await abrirTicket('¿Qué KDA tiene Despo?');
  const m = claude.peticiones[0].messages[0].content;
  assert.match(m, /<kb_stats>\nCABECERA-KB\n- KB Despo#KAIJU nota 85\n<\/kb_stats>/);
  assert.doesNotMatch(m, /Sergi/);
  assert.match(m, /<cartas_y_jugadores>[\s\S]*Tsuki · Top · \*\*KINGKAI\*\* · tier A · dibujada como KSante · fantasy: 34.5 puntos en 2 partidas/);
  assert.doesNotMatch(m, /RAMA-LIGA|liga_en_vivo/);
  await abrirTicket('hola', persona('21'));
  const hola = claude.peticiones[1].messages[0].content;
  assert.doesNotMatch(hola, /<ficha>|liga_en_vivo|cartas_y_jugadores|kb_stats/);
  assert.ok(hola.length < 400, `el mensaje de un «hola» es corto (${hola.length})`);
});

test('si la IA no lo sabe, llama ella al staff: menciona a @Kumichō en el hilo', async () => {
  claude.siguiente = { json: { respuesta: 'Eso no lo sé.', llamarStaff: true } };
  const { mensajes } = await abrirTicket('¿Por qué no me ha llegado mi canje?');
  const m = mensajes[1];
  assert.match(m.embeds[0].description, new RegExp(`<@&${STAFF}>, os necesitan`));
  assert.deepEqual(m.allowed_mentions, { parse: [], roles: [STAFF] });
});

test('«Preguntar otra cosa» abre otra ventana y la IA lee lo hablado en el hilo', async () => {
  const { hilo } = await abrirTicket('¿Cuándo es la próxima jornada?');
  discord.estado.mensajes.push({ id: '9999', channel_id: hilo.id, author: { id: '20', username: 'u20', global_name: 'Persona 20' }, content: 'Gracias, ¿y a qué hora?', embeds: [] });
  const ventana = await mandar(clic('ticket:preguntar:20', { canal: hilo.id }));
  assert.equal(ventana.type, 9);
  assert.equal(ventana.data.custom_id, 'ticket:mas:20');
  claude.peticiones = [];
  const r = await mandar(enviar('ticket:mas:20', '¿Y la segunda jornada?', { canal: hilo.id }));
  assert.deepEqual(r, { type: 5 }, '«pensando…» en el hilo, para todos');
  const historia = claude.peticiones[0].messages[0].content;
  assert.match(historia, /\[SrDirector \(tú\)\] \*\*❓ Persona 20:\*\* ¿Cuándo es la próxima jornada\?/);
  assert.match(historia, /\[Persona 20 \(quien abrió el ticket\)\] Gracias, ¿y a qué hora\?/);
  assert.match(ultimaRespuesta().embeds[0].description, /¿Y la segunda jornada\?/);
  assert.equal(ultimaRespuesta().components[0].components[0].custom_id, 'ticket:preguntar:20');
});

test('«Llamar al staff» solo menciona a @Kumichō en el hilo, y una vez cada 10 minutos', async () => {
  const { hilo } = await abrirTicket();
  const r = await mandar(clic('ticket:staff:20', { canal: hilo.id }));
  assert.equal(r.type, 4);
  assert.equal(r.data.content, `🔔 <@&${STAFF}>: <@20> os llama en este ticket.`);
  assert.deepEqual(r.data.allowed_mentions, { parse: [], roles: [STAFF] });
  assert.equal(r.data.flags, undefined, 'lo ve todo el hilo');
  const otra = await mandar(clic('ticket:staff:20', { canal: hilo.id }));
  assert.equal(otra.data.flags, 64);
  assert.match(otra.data.content, /Ya se ha avisado/);
  hoy = new Date(hoy.getTime() + 11 * 60 * 1000);
  assert.equal((await mandar(clic('ticket:staff:20', { canal: hilo.id }))).data.flags, undefined);
});

test('«Cerrar» lo puede usar quien lo abrió o el staff: archiva y bloquea el hilo', async () => {
  const { hilo } = await abrirTicket();
  const otro = await mandar(clic('ticket:cerrar:20', { canal: hilo.id, quien: persona('30') }));
  assert.match(otro.data.content, /Solo puede cerrarlo quien lo abrió o el staff/);
  assert.equal(hilo.archived, false);
  const r = await mandar(clic('ticket:cerrar:20', { canal: hilo.id, quien: persona('40', { staff: true }) }));
  assert.equal(r.type, 5);
  assert.match(ultimaRespuesta().content, /Ticket cerrado por <@40>/);
  assert.equal(hilo.archived, true);
  assert.equal(hilo.locked, true);
});

test('el tope por persona y el del servidor: al pasarse, contesta el staff (y el staff no tiene tope)', async () => {
  await abrirTicket('una', persona('50'));
  await abrirTicket('dos', persona('50'));
  const { mensajes } = await abrirTicket('tres', persona('50'));
  assert.equal(claude.peticiones.length, 2, 'la tercera ya no va a la IA');
  assert.match(mensajes[1].embeds[0].description, /Hoy ya has hecho 2 preguntas a la IA/);
  assert.match(mensajes[1].embeds[0].description, new RegExp(`<@&${STAFF}>`));
  await abrirTicket('cuatro', persona('60', { staff: true }));
  await abrirTicket('cinco', persona('60', { staff: true }));
  const ultima = await abrirTicket('seis', persona('61'));
  assert.equal(claude.peticiones.length, 4, 'el tope del servidor (4) se acaba aunque sea staff');
  assert.match(ultima.mensajes[1].embeds[0].description, /ya ha contestado todo lo que puede por hoy/);
});

test('si la API de Claude falla o se niega, el ticket sigue y avisa al staff', async () => {
  claude.siguiente = new Anthropic.APIError(529, { error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers());
  const caida = await abrirTicket('¿Cuándo?', persona('71'));
  assert.match(caida.mensajes[1].embeds[0].description, /no puedo contestar: aviso al staff/);
  assert.match(caida.mensajes[1].embeds[0].description, new RegExp(`<@&${STAFF}>`));
  assert.ok(errores.some(e => /529/.test(e)));
  claude.siguiente = { stop_reason: 'refusal', json: {} };
  const negada = await abrirTicket('¿Cuándo?', persona('72'));
  assert.match(negada.mensajes[1].embeds[0].description, /una persona del staff/);
  claude.siguiente = { json: { nada: 1 } };
  const rara = await abrirTicket('¿Cuándo?', persona('73'));
  assert.match(rara.mensajes[1].embeds[0].description, /aviso al staff/);
});

test('sin clave de Anthropic, los tickets funcionan igual: contesta el staff y no sale «Preguntar otra cosa»', async () => {
  const sinIA = crearComandos({ clave: CLAVE, token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, ids: () => IDS,
    familias: () => [], tickets: { cliente: null, saber: () => '' } });
  assert.equal(sinIA.tickets.iaActiva, false);
  const otro = http.createServer(async (req, res) => { const r = await sinIA.atender(req); res.writeHead(r.estado); res.end(JSON.stringify(r.cuerpo)); });
  await new Promise(r => otro.listen(0, '127.0.0.1', r));
  const antes = url;
  url = `http://127.0.0.1:${otro.address().port}/`;
  try {
    const texto = JSON.stringify(enviar('ticket:nuevo', 'Hola'));
    const momento = String(Math.floor(Date.now() / 1000));
    await fetch(url, { method: 'POST', body: texto, headers: { 'X-Signature-Timestamp': momento, 'X-Signature-Ed25519': crypto.sign(null, Buffer.from(momento + texto), privateKey).toString('hex') } });
    await sinIA.tickets.esperar();
  } finally {
    url = antes; otro.close();
  }
  const hilo = discord.estado.canales.filter(c => c.type === 12).at(-1);
  const m = discord.estado.mensajes.filter(x => x.channel_id === hilo.id).at(-1);
  assert.match(m.embeds[0].description, /El staff te contestará aquí/);
  assert.match(m.embeds[0].description, new RegExp(`<@&${STAFF}>`));
  assert.deepEqual(m.components[0].components.map(b => b.custom_id), ['ticket:staff:20', 'ticket:cerrar:20']);
});

test('si Discord no deja abrir el hilo, se lo dice a quien lo pidió', async () => {
  discord.estado.responder = { estado: 403, cuerpo: { message: 'Missing Permissions', code: 50013 } };
  await mandar(enviar('ticket:nuevo', 'Hola'));
  assert.match(ultimaRespuesta().content, /No he podido abrir el ticket/);
  assert.ok(errores.some(e => /403/.test(e)));
});

test('la conversación y los datos en vivo se preparan bien para la IA', () => {
  const mensajes = [
    { author: { id: '40', username: 'kumicho' }, content: 'Te lo miro ahora', embeds: [] },
    { author: { id: APP, bot: true }, content: '', embeds: [{ description: 'Respuesta de la IA' }] },
    { author: { id: '20', username: 'u20' }, content: '', embeds: [] },
  ];
  assert.equal(conversacion(mensajes, { dueno: '20', bot: APP }), '[SrDirector (tú)] Respuesta de la IA\n[kumicho (staff)] Te lo miro ahora');
  assert.match(textoSistema('X'), /Solo hablas de Gokudō/);
  assert.match(readFileSync(new URL('../discord/tickets-saber.md', import.meta.url), 'utf8'), /## Gachapon/, 'la ficha de verdad existe');
});

test('npm run discord-tickets publica el mensaje del botón y, la segunda vez, lo actualiza en vez de poner otro', async () => {
  const carpeta = mkdtempSync(path.join(os.tmpdir(), 'tickets-'));
  const archivoIds = path.join(carpeta, 'ids.json');
  writeFileSync(archivoIds, JSON.stringify({ 1: { 'canal:tickets': CANAL } }));
  const api = crearApi({ token: TOKEN_FALSO, base: `http://127.0.0.1:${discord.servidor.address().port}/api/v10` });
  const log = () => {};
  assert.deepEqual(await publicarPanel({ api, archivoIds, prueba: true, log }), { canal: CANAL, mensaje: null, nuevo: true });
  assert.equal(discord.estado.mensajes.filter(m => m.channel_id === CANAL).length, 0, 'en prueba no publica');
  const primera = await publicarPanel({ api, archivoIds, log });
  const enCanal = () => discord.estado.mensajes.filter(m => m.channel_id === CANAL);
  assert.equal(enCanal().length, 1);
  assert.equal(enCanal()[0].components[0].components[0].custom_id, 'ticket:abrir');
  assert.equal(JSON.parse(readFileSync(archivoIds, 'utf8'))[1]['mensaje:tickets'], primera.mensaje);
  const segunda = await publicarPanel({ api, archivoIds, log });
  assert.equal(segunda.nuevo, false);
  assert.equal(enCanal().length, 1);
  assert.deepEqual(mensajePanel().components, enCanal()[0].components);
});

test('la IA es uno de los nuestros: colegueo y jerga de LoL, Pacopepe es el capo y KB es el demonio, sin saltarse las reglas', () => {
  const t = textoSistema('');
  assert.ok(t.startsWith('Eres **SrDirector**, un kobun de Gokudō'));
  assert.match(t, /Pacopepe\*\*, el que manda en todo Gokudō: un capo mafioso superpeligroso/);
  assert.match(t, /jerga de LoL/);
  assert.match(t, /\*\*KB\*\* o \*\*Koryu Budo\*\*: son el demonio/);
  assert.match(t, /el personaje no cambia ninguna/);
  assert.match(t, /no la inventes/);
  const ficha = readFileSync(new URL('../discord/tickets-saber.md', import.meta.url), 'utf8');
  for (const oyabun of ['Ryūjin', 'Byakko', 'Tengu', 'Tsuki', 'Yasha', 'Akuma', 'Shinigami']) assert.ok(ficha.includes(`- **${oyabun}**, `), `lore de ${oyabun}`);
});

test('las cartas para la IA: jugadores con su familia, tier, campeón y puntos; BOOST con su condición; LEGACY y jefes', () => {
  const t = textoCartas(CATALOGO, { 'SARU-TOP': { puntos: 10, partidas: 1 } }, CLANES);
  assert.match(t, /## Jugadores de la liga[\s\S]*- Tsuki · Top · \*\*KINGKAI\*\* · tier A · dibujada como KSante · fantasy: 10 puntos en 1 partidas/);
  assert.match(t, /\*\*MAKITAH\*\* «EL TITIRITERO» · tier S\+ · dibujada como Syndra · multiplica ×3 los puntos del jugador vinculado si es el que más daño a campeones hace/);
  assert.match(t, /\*\*GAATSU\*\* «DEMON» · Shinigami · dibujada como Aatrox/);
  assert.match(t, /## Cartas de jefe[\s\S]*- Oyabun de Tsuki/);
  assert.equal(textoCartas(null, null, CLANES), 'No hay datos de las cartas ahora mismo.');
});

test('si mencionan a SrDirector en un ticket, contesta en el hilo a ese mensaje y, si hace falta, llama al staff', async () => {
  const { hilo } = await abrirTicket('Hola', persona('80'));
  const yo = { id: APP, username: 'SrDirector' };
  const autor = { id: '80', username: 'u80', global_name: 'Persona 80' };
  claude.peticiones = [];
  await comandos.tickets.alMencionar({ id: '7001', guild_id: '1', channel_id: hilo.id, author: autor, member: { roles: [] }, content: `<@${APP}> ¿cuándo juega Tsuki?`, mentions: [yo] }, yo);
  assert.equal(claude.peticiones.length, 1);
  assert.match(claude.peticiones[0].messages[0].content, /<pregunta>\n¿cuándo juega Tsuki\?\n<\/pregunta>/, 'la pregunta va sin la mención');
  const r = discord.estado.mensajes.filter(m => m.channel_id === hilo.id).at(-1);
  assert.deepEqual(r.message_reference, { message_id: '7001', fail_if_not_exists: false }, 'contesta a ese mensaje');
  assert.match(r.embeds[0].description, /domingo a las 17:00/);
  assert.deepEqual(r.allowed_mentions, { parse: [], replied_user: true });
  hoy = new Date(hoy.getTime() + 10_000);
  claude.siguiente = { json: { respuesta: 'Eso lo mira el staff.', llamarStaff: true } };
  // Otra persona del hilo (la primera ya ha gastado sus 2 preguntas de prueba)
  await comandos.tickets.alMencionar({ id: '7002', guild_id: '1', channel_id: hilo.id, author: { id: '85', username: 'u85' }, member: { roles: [] }, content: `<@${APP}> no me ha llegado mi canje`, mentions: [yo] }, yo);
  const staff = discord.estado.mensajes.filter(m => m.channel_id === hilo.id).at(-1);
  assert.match(staff.embeds[0].description, new RegExp(`<@&${STAFF}>, os necesitan en este ticket`));
  assert.deepEqual(staff.allowed_mentions.roles, [STAFF]);
});

test('en un canal público contesta allí y, si es cosa del staff, manda a abrir un ticket sin mencionar al staff', async () => {
  const yo = { id: APP, username: 'SrDirector' };
  claude.siguiente = { json: { respuesta: 'Eso no lo sé.', llamarStaff: true } };
  await comandos.tickets.alMencionar({ id: '7101', guild_id: '1', channel_id: '4', author: { id: '81', username: 'u81' }, member: { roles: [] }, content: `oye <@${APP}> ¿me das un rol?`, mentions: [yo] }, yo);
  const r = discord.estado.mensajes.filter(m => m.channel_id === '4').at(-1);
  assert.match(r.embeds[0].description, new RegExp(`abre un ticket en <#${CANAL}>`));
  assert.doesNotMatch(r.embeds[0].description, /<@&/);
  assert.equal(r.allowed_mentions.roles, undefined);
  assert.match(claude.peticiones.at(-1).messages[0].content, /¿me das un rol\?/);
});

test('sin mención, de un bot o con otra a la vez en el mismo canal, no contesta; con la mención sola, saluda sin gastar IA', async () => {
  const yo = { id: APP, username: 'SrDirector' };
  const base = { guild_id: '1', channel_id: '4', member: { roles: [] }, mentions: [] };
  assert.equal(comandos.tickets.alMencionar({ ...base, id: '7201', author: { id: '82' }, content: 'hola a todos' }, yo), null);
  assert.equal(comandos.tickets.alMencionar({ ...base, id: '7202', author: { id: '83', bot: true }, content: `<@${APP}> hola`, mentions: [yo] }, yo), null);
  claude.peticiones = [];
  const antes = discord.estado.mensajes.length;
  await comandos.tickets.alMencionar({ ...base, id: '7203', author: { id: '84' }, content: `<@${APP}>`, mentions: [yo] }, yo);
  assert.equal(claude.peticiones.length, 0);
  assert.match(discord.estado.mensajes.at(-1).embeds[0].description, /Dime qué necesitas/);
  assert.equal(discord.estado.mensajes.length, antes + 1);
  hoy = new Date(hoy.getTime() + 1000);
  assert.equal(comandos.tickets.alMencionar({ ...base, id: '7204', author: { id: '84' }, content: `<@${APP}> otra`, mentions: [yo] }, yo), null, 'la misma persona, antes de 5 s');
});

test('una pregunta de seguimiento hereda el jugador del que se hablaba, y quien no tiene fila en KB se dice', async () => {
  const c = await comandos.tickets.contexto('¿y sus stats?', '[SrDirector (tú)] **❓ Persona 20:** háblame de KINGKAI → Es el top de Tsuki y DESPO es de Yasha');
  assert.ok(c.ramas.has('stats') && c.ramas.has('cartas'));
  const texto = c.partes.join('\n');
  assert.match(texto, /\*\*KINGKAI\*\*/, 'su carta');
  assert.doesNotMatch(texto, /Despo/, 'lo que contestó SrDirector no cuenta para saber de quién se habla');
  assert.match(texto, /No aparecen en KB Stats con ese nombre[^\n]*KINGKAI/);
});

test('si lo mencionan respondiendo a otro mensaje, la IA lee ese mensaje', async () => {
  const yo = { id: APP, username: 'SrDirector' };
  claude.peticiones = [];
  await comandos.tickets.alMencionar({ id: '7301', guild_id: '1', channel_id: '4', author: { id: '86', username: 'u86' }, member: { roles: [] },
    content: `<@${APP}> ¿esto es verdad?`, mentions: [yo], referenced_message: { author: { id: '87', username: 'u87', global_name: 'Persona 87' }, content: 'Tsuki va primera\ny ganará la liga' } }, yo);
  assert.match(claude.peticiones[0].messages[0].content, /\[Persona 87 \(el mensaje al que responde\)\] Tsuki va primera y ganará la liga/);
});
