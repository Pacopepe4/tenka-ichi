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
import { conversacion, datosEnVivo, mensajePanel, textoSistema } from '../server/tickets.js';
import { crearApi } from '../scripts/discord-aplicar.js';
import { publicarPanel } from '../scripts/discord-tickets.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const CLAVE = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const STAFF = '700', CANAL = '800', APP = '9';
const IDS = { 1: { 'rol:staff': STAFF, 'canal:tickets': CANAL } };
const CLANES = [{ id: 'SARU', nombre: 'Tsuki' }, { id: 'TORA', nombre: 'Byakko' }];

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
    familias: () => [], tickets: { cliente: claude, modelo: 'claude-haiku-5-5', topePersona: 2, topeDia: 4, saber: () => 'FICHA DE PRUEBA',
      datosLiga: () => ({ formato: { liguilla: [{ jornada: 1, fecha: '2026-11-15' }] }, clasificacion: [{ clan: 'SARU', victorias: 1 }] }),
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

test('la IA recibe la ficha en la caché, los datos en vivo con el nombre de las familias y la pregunta', async () => {
  await abrirTicket('¿Cómo va Tsuki?');
  const p = claude.peticiones[0];
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.match(p.system[0].text, /FICHA DE PRUEBA/);
  assert.doesNotMatch(p.system[0].text, /2026-11|Hoy es/, 'lo que cambia no va en la parte de la caché');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.deepEqual(p.output_config.format.schema.required, ['respuesta', 'llamarStaff']);
  assert.equal(p.thinking, undefined, 'no se manda thinking: con Haiku 5.5 y Opus 5.5 va solo');
  const mensaje = p.messages[0].content;
  assert.match(mensaje, /<pregunta>\n¿Cómo va Tsuki\?\n<\/pregunta>/);
  assert.match(mensaje, /"clan":"Tsuki"/);
  assert.doesNotMatch(mensaje, /SARU/);
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
  assert.match(historia, /\[IA de Gokudō\] \*\*❓ Persona 20:\*\* ¿Cuándo es la próxima jornada\?/);
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
  assert.equal(conversacion(mensajes, { dueno: '20', bot: APP }), '[IA de Gokudō] Respuesta de la IA\n[kumicho (staff)] Te lo miro ahora');
  assert.equal(datosEnVivo(null, CLANES), 'No hay datos de la liga ahora mismo.');
  assert.equal(datosEnVivo({ a: ['SARU', 'TORA', 'OTRO'] }, CLANES), '{"a":["Tsuki","Byakko","OTRO"]}');
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
