// Inhouses de Gokudō y la red de servidores: un servidor de fuera se une (con permiso de los dos lados), se convoca
// una inhouse que sale en los dos, la gente se apunta por rol desde cada uno, se hacen los equipos, la voz y el ranking.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { crearComandos } from '../server/discord-comandos.js';
import { eloNumero, equilibrar, mensajePanelInhouses } from '../server/inhouses.js';
import { COMANDO_RED } from '../server/red.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const CLAVE = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const APP = '9', CASA = '1', FUERA = '2';
const STAFF = '700', OYABUN = '701', INH = '840', INH_FUERA = '850', CANAL_STAFF = '860', CATEGORIA = '870';
const IDS = { [CASA]: { 'rol:staff': STAFF, 'rol:jefes': OYABUN, 'canal:inhouses': INH, 'canal:staff': CANAL_STAFF, 'categoria:scrims': CATEGORIA } };
const carpeta = mkdtempSync(path.join(os.tmpdir(), 'inhouses-'));
let ahora = new Date('2026-11-11T18:00:00Z');   // miércoles 19:00 en Madrid
let discord, web, url, comandos, tok = 0, idInhouse;

before(async () => {
  discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  for (const id of [INH, INH_FUERA, CANAL_STAFF]) discord.estado.canales.push({ id, type: 0, name: `c${id}`, position: 0, parent_id: null, permission_overwrites: [] });
  discord.estado.canales.push({ id: CATEGORIA, type: 4, name: '⚔️ Scrims', position: 9, parent_id: null, permission_overwrites: [] });
  discord.estado.otros = { [FUERA]: { id: FUERA, name: 'Club Amateur' } };
  const sinLog = { error: () => {} };
  comandos = crearComandos({ clave: CLAVE, token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, ids: () => IDS, familias: () => [],
    tickets: { cliente: null, kbstats: null, memoria: null, saber: () => '' },
    scrims: { hoja: () => false, archivo: path.join(carpeta, 'scrims.json'), cliente: null, log: sinLog },
    red: { hoja: () => false, archivo: path.join(carpeta, 'red.json'), log: sinLog },
    inhouses: { ahora: () => ahora, hoja: () => false, archivo: path.join(carpeta, 'inhouses.json'), archivoRanking: path.join(carpeta, 'ranking.json'), log: sinLog } });
  web = http.createServer(async (req, res) => { const r = await comandos.atender(req); res.writeHead(r.estado, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.cuerpo)); });
  await new Promise(r => web.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${web.address().port}/`;
});
after(() => { discord.servidor.close(); web.close(); });

async function mandar(cuerpo) {
  const texto = JSON.stringify(cuerpo);
  const momento = String(Math.floor(Date.now() / 1000));
  const firma = crypto.sign(null, Buffer.from(momento + texto), privateKey).toString('hex');
  const r = await fetch(url, { method: 'POST', body: texto, headers: { 'X-Signature-Timestamp': momento, 'X-Signature-Ed25519': firma } });
  const j = await r.json();
  await Promise.all([comandos.inhouses.esperar(), comandos.red.esperar()]);
  return j;
}
const persona = (id, { roles = [], permisos = '0' } = {}) => ({ user: { id, username: `u${id}`, global_name: `Jugador ${id}` }, roles, permissions: permisos });
const base = (guild, canal, quien) => ({ application_id: APP, token: `i${++tok}`, guild_id: guild, channel_id: canal, member: quien });
const clic = (custom_id, { guild = CASA, canal = INH, quien = persona('20') } = {}) => ({ ...base(guild, canal, quien), type: 3, data: { custom_id } });
const ventana = (custom_id, campos, opciones) => ({ ...clic(custom_id, opciones), type: 5, data: { custom_id, components: Object.entries(campos).map(([id, value]) => ({ type: 1, components: [{ type: 4, custom_id: id, value }] })) } });
const tarjetaEn = canal => discord.estado.mensajes.filter(m => m.channel_id === canal && m.embeds?.[0]?.title?.startsWith('🎲 Inhouse de las')).at(-1);

test('el elo en número y los equipos más igualados (un jugador de cada rol en cada lado)', () => {
  assert.equal(eloNumero('Hierro IV'), 0);
  assert.equal(eloNumero('Platino II'), 18);
  assert.equal(eloNumero('plat 2'), 18);
  assert.equal(eloNumero('D4'), 24);
  assert.equal(eloNumero('Emerald 1'), 23);
  assert.equal(eloNumero('Grandmaster'), 32);
  assert.equal(eloNumero('ni idea'), 12, 'si no se entiende, como un oro');
  const j = (n, valor) => ({ id: n, nombre: n, valor });
  const plazas = { TOP: [j('t1', 30), j('t2', 10)], JUNGLA: [j('j1', 30), j('j2', 10)], MEDIO: [j('m1', 20), j('m2', 20)], ADC: [j('a1', 20), j('a2', 20)], SUPPORT: [j('s1', 20), j('s2', 20)] };
  const e = equilibrar(plazas);
  assert.equal(e.diferencia, 0, 'el top bueno con el jungla malo y al revés');
  assert.equal(e.azul.length, 5);
  assert.deepEqual(e.azul.map(x => x.rol), ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT']);
});

test('la red: otro servidor lo pide con /gokudo-red y solo entra cuando el staff de Gokudō lo aprueba', async () => {
  const pedir = (quien, guild = FUERA) => mandar({ ...base(guild, INH_FUERA, quien), type: 2, data: { name: 'gokudo-red', options: [{ type: 1, name: 'unirse', options: [{ name: 'canal', value: INH_FUERA }, { name: 'tipo', value: 'inhouses' }] }] } });
  assert.match((await pedir(persona('30'))).data.content, /Solo el staff de este servidor/);
  assert.match((await pedir(persona('31', { permisos: '8' }), CASA)).data.content, /Este es el servidor de Gokudō/);
  const r = await pedir(persona('32', { permisos: '32' }));
  assert.match(r.data.content, /^Petición enviada/);
  const peticion = discord.estado.mensajes.filter(m => m.channel_id === CANAL_STAFF).at(-1);
  assert.match(peticion.embeds[0].description, /\*\*Club Amateur\*\* quiere recibir \*\*inhouses\*\*/);
  assert.deepEqual(comandos.red.canales('inhouses').map(c => c.guild), [CASA], 'pendiente: aún no sale allí');
  const aprobar = peticion.components[0].components[0].custom_id;
  assert.match((await mandar(clic(aprobar, { canal: CANAL_STAFF, quien: persona('33', { roles: [OYABUN] }) }))).data.content, /Solo el staff de Gokudō/);
  const ok = await mandar(clic(aprobar, { canal: CANAL_STAFF, quien: persona('34', { roles: [STAFF] }) }));
  assert.equal(ok.type, 7);
  assert.match(ok.data.embeds[0].description, /✅ aprobada/);
  assert.deepEqual(comandos.red.canales('inhouses').map(c => [c.guild, c.canal]), [[CASA, INH], [FUERA, INH_FUERA]]);
  const allí = discord.estado.mensajes.filter(m => m.channel_id === INH_FUERA);
  assert.match(allí.at(-2).embeds[0].title, /Conectado a la red de Gokudō/);
  assert.deepEqual(allí.at(-1).components, mensajePanelInhouses().components, 'y el panel con los botones, para su staff');
  assert.deepEqual(COMANDO_RED.options.map(o => o.name), ['unirse', 'salir']);
});

test('convocan los Oyabun y el staff (en la red, su staff); la tarjeta sale en todos los servidores de la red', async () => {
  assert.match((await mandar(clic('inh:convocar', { quien: persona('40') }))).data.content, /Convocan los Oyabun y el staff/);
  assert.equal((await mandar(clic('inh:convocar', { quien: persona('41', { roles: [OYABUN] }) }))).type, 9);
  assert.match((await mandar(clic('inh:convocar', { guild: FUERA, canal: INH_FUERA, quien: persona('42') }))).data.content, /Convoca el staff de este servidor/);
  const r = await mandar(ventana('inh:nueva', { cuando: 'viernes 22:00', elo: 'Oro-Esmeralda', notas: 'Draft de torneo' }, { quien: persona('41', { roles: [OYABUN] }) }));
  assert.deepEqual(r, { type: 5, data: { flags: 64 } });
  const casa = tarjetaEn(INH), fuera = tarjetaEn(INH_FUERA);
  assert.ok(casa && fuera, 'una copia en cada servidor');
  assert.match(casa.embeds[0].description, new RegExp(`<t:${Date.parse('2026-11-13T21:00:00Z') / 1000}:F>`));
  assert.match(casa.embeds[0].description, /\*\*Convoca:\*\* Jugador 41/);
  assert.deepEqual(casa.components[0].components.map(b => b.label), ['Top', 'Jungla', 'Medio', 'ADC', 'Support']);
  idInhouse = comandos.inhouses.inhouses()[0].id;
  assert.match(discord.estado.respuestas[`i${tok}`].content, /sale en 2 servidores/);
});

test('apuntarse por rol (se pide el elo); las dos copias se actualizan; no dos veces ni en un rol lleno', async () => {
  const ventanaRol = await mandar(clic(`inh:rol:${idInhouse}:TOP`, { quien: persona('50') }));
  assert.equal(ventanaRol.type, 9);
  assert.equal(ventanaRol.data.custom_id, `inh:apunta:${idInhouse}:TOP`);
  assert.match((await mandar(ventana(`inh:apunta:${idInhouse}:TOP`, { elo: 'Platino II' }, { quien: persona('50') }))).data.content, /Apuntado de \*\*Top\*\* \(Platino II\)/);
  assert.match((await mandar(ventana(`inh:apunta:${idInhouse}:TOP`, { elo: 'Diamante 4' }, { guild: FUERA, canal: INH_FUERA, quien: persona('60') }))).data.content, /Apuntado de \*\*Top\*\*/);
  for (const canal of [INH, INH_FUERA]) {
    const top = tarjetaEn(canal).embeds[0].fields[0];
    assert.equal(top.name, 'Top (2/2)');
    assert.match(top.value, /Jugador 50 · Platino II\nJugador 60 · Diamante 4 · Club Amateur/);
    assert.equal(tarjetaEn(canal).components[0].components[0].disabled, true, 'Top lleno');
  }
  assert.match((await mandar(clic(`inh:rol:${idInhouse}:JUNGLA`, { quien: persona('50') }))).data.content, /Ya estás apuntado/);
  assert.match((await mandar(clic(`inh:rol:${idInhouse}:TOP`, { quien: persona('51') }))).data.content, /Ese rol ya está lleno/);
});

test('con 10 se hacen los equipos igualados y se avisa a cada uno en su servidor (solo a los suyos)', async () => {
  const resto = [['JUNGLA', '51', CASA, 'Oro I'], ['JUNGLA', '61', FUERA, 'Esmeralda 2'], ['MEDIO', '52', CASA, 'Plata 1'], ['MEDIO', '62', FUERA, 'Diamante 2'],
    ['ADC', '53', CASA, 'Oro 3'], ['ADC', '63', FUERA, 'Oro 2'], ['SUPPORT', '54', CASA, 'Platino 4']];
  for (const [rol, id, guild, elo] of resto) await mandar(ventana(`inh:apunta:${idInhouse}:${rol}`, { elo }, { guild, canal: guild === CASA ? INH : INH_FUERA, quien: persona(id) }));
  assert.match((await mandar(clic('inh:salir:' + idInhouse, { quien: persona('54') }))).data.content, /Desapuntado/);
  await mandar(ventana(`inh:apunta:${idInhouse}:SUPPORT`, { elo: 'Platino 4' }, { quien: persona('54') }));
  const ultima = await mandar(ventana(`inh:apunta:${idInhouse}:SUPPORT`, { elo: 'Esmeralda 4' }, { guild: FUERA, canal: INH_FUERA, quien: persona('64') }));
  assert.match(ultima.data.content, /está completa: equipos hechos/);
  const x = comandos.inhouses.inhouses()[0];
  assert.equal(x.estado, 'llena');
  assert.ok(x.equipos.diferencia <= 4, `equipos igualados (diferencia ${x.equipos.diferencia})`);
  const t = tarjetaEn(INH);
  assert.match(t.embeds[0].fields[0].name, /^🔵 Azul · media /);
  assert.match(t.embeds[0].fields[1].name, /^🔴 Rojo · media /);
  assert.deepEqual(t.components[0].components.map(b => b.label), ['Ganó Azul', 'Ganó Rojo', 'Cancelar']);
  const avisoCasa = discord.estado.mensajes.filter(m => m.channel_id === INH && /Inhouse completa/.test(m.content || '')).at(-1);
  const avisoFuera = discord.estado.mensajes.filter(m => m.channel_id === INH_FUERA && /Inhouse completa/.test(m.content || '')).at(-1);
  assert.deepEqual(avisoCasa.allowed_mentions.users.sort(), ['50', '51', '52', '53', '54']);
  assert.deepEqual(avisoFuera.allowed_mentions.users.sort(), ['60', '61', '62', '63', '64']);
});

test('15 minutos antes: voz Azul y Rojo en Gokudō y aviso a los 10; el resultado lo pone quien convocó y va al ranking', async () => {
  ahora = new Date('2026-11-13T20:46:00Z');   // viernes 21:46: faltan 14 minutos
  await comandos.inhouses.reloj();
  const x = comandos.inhouses.inhouses()[0];
  assert.equal(x.estado, 'jugando');
  assert.equal(x.voz.length, 2);
  const voces = discord.estado.canales.filter(c => x.voz.includes(c.id));
  assert.deepEqual(voces.map(c => [c.type, c.name, c.parent_id]), [[2, '🔵 Azul · 22:00', CATEGORIA], [2, '🔴 Rojo · 22:00', CATEGORIA]]);
  assert.ok(discord.estado.mensajes.some(m => m.channel_id === INH_FUERA && /⏰ La inhouse empieza/.test(m.content || '')));
  assert.match((await mandar(clic(`inh:gana:${idInhouse}:azul`, { quien: persona('50') }))).data.content, /lo apunta quien la convocó o el staff/);
  assert.match((await mandar(clic(`inh:gana:${idInhouse}:azul`, { quien: persona('41', { roles: [OYABUN] }) }))).data.content, /ganó 🔵 Azul/);
  assert.equal(comandos.inhouses.inhouses().length, 0);
  assert.ok(!discord.estado.canales.some(c => x.voz.includes(c.id)), 'las voces se borran');
  assert.match(tarjetaEn(INH_FUERA).embeds[0].footer.text, /Terminada · ganó 🔵 Azul/);
  const rk = comandos.inhouses.ranking();
  assert.equal(Object.keys(rk).length, 10);
  assert.equal(Object.values(rk).filter(r => r.victorias === 1).length, 5);
  assert.match((await mandar(clic('inh:ranking', { guild: FUERA, canal: INH_FUERA, quien: persona('64') }))).data.content, /🏆 \*\*Ranking de inhouses\*\*\n1\. \*\*Jugador/);
  assert.ok(Object.keys(JSON.parse(readFileSync(path.join(carpeta, 'ranking.json'), 'utf8'))).length === 10, 'se guarda');
});

test('«Avísame»: menciona a quien lo pidió en su servidor cuando convocan una a su hora; si no se llena, se cancela sola', async () => {
  ahora = new Date('2026-11-14T10:00:00Z');
  await mandar(ventana('inh:aviso', { cuando: 'sábado 21:30' }, { guild: FUERA, canal: INH_FUERA, quien: persona('65') }));
  await mandar(ventana('inh:nueva', { cuando: 'sábado 22:00', elo: '', notas: '' }, { quien: persona('34', { roles: [STAFF] }) }));
  const m = discord.estado.mensajes.filter(x => x.channel_id === INH_FUERA && /🔔 <@65>/.test(x.content || '')).at(-1);
  assert.ok(m, 'aviso en el canal de su servidor');
  assert.deepEqual(m.allowed_mentions, { parse: [], users: ['65'] });
  ahora = new Date('2026-11-14T21:31:00Z');   // 22:31 del sábado: media hora tarde y sin llenar
  await comandos.inhouses.reloj();
  assert.equal(comandos.inhouses.inhouses().length, 0);
  assert.match(tarjetaEn(INH).embeds[0].footer.text, /Cancelada · no se llenó/);
});
