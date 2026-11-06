// Montar el servidor de Discord con el bot (scripts/discord-api-falso.js hace de Discord): el modo de prueba no
// cambia nada, la primera vez lo crea todo, la segunda no hace nada, se cambia solo lo distinto, no se borra
// nada sin --borrar-sobrantes y las direcciones de los webhooks van al .env.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { aplicar, crearApi, leerConfig, leerFamilias, guardarEnEnv, PERMISOS_BOT, nombreCanal } from '../scripts/discord-aplicar.js';

let discord, api, carpeta, opciones;
const escritas = () => discord.estado.peticiones.filter(p => p.metodo !== 'GET');
// Busca por el nombre sin el emoji de delante («📜・normas» → normas, «📜 Info» → Info)
const sinEmoji = n => n.replace(/^.*?[・ ]/u, '');
const canal = nombre => discord.estado.canales.find(c => c.name === nombre) || discord.estado.canales.find(c => /[・ ]/u.test(c.name) && sinEmoji(c.name) === nombre);
const rol = nombre => discord.estado.roles.find(r => r.name === nombre);

beforeEach(async () => {
  discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  api = crearApi({ token: TOKEN_FALSO, base: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, esperar: async () => {} });
  carpeta = mkdtempSync(path.join(tmpdir(), 'discord-aplicar-'));
  opciones = { api, config: leerConfig(), familias: leerFamilias(), archivoEnv: path.join(carpeta, '.env'), archivoIds: path.join(carpeta, 'ids.json'), log: () => {} };
});
afterEach(() => discord.servidor.close());

test('el modo de prueba enseña lo que haría y no cambia nada en Discord ni en el disco', async () => {
  const lineas = [];
  const { acciones } = await aplicar({ ...opciones, prueba: true, log: l => lineas.push(l) });
  assert.deepEqual(escritas(), [], 'solo lee');
  assert.ok(!existsSync(opciones.archivoEnv) && !existsSync(opciones.archivoIds));
  assert.ok(acciones.some(a => a.accion === 'crear' && a.que === 'el canal' && a.nombre === '#📜・normas'));
  assert.ok(acciones.some(a => a.accion === 'crear' && a.que === 'el rol' && a.nombre === 'Familia 1'));
  assert.ok(acciones.some(a => a.accion === 'crear' && a.que === 'el webhook'));
  assert.ok(acciones.some(a => a.accion === 'sobra' && a.nombre === '#general'), 'avisa de lo que sobra, sin borrarlo');
  assert.match(lineas[0], /MODO DE PRUEBA/);
  assert.match(lineas.join('\n'), /Crearía el canal «#📜・normas»/);
});

test('la primera vez lo crea todo: categorías en orden, canales, un canal público y otro privado y un rol por familia, y Legacy', async () => {
  await aplicar(opciones);
  const cats = discord.estado.canales.filter(c => c.type === 4 && !/Channels/.test(c.name)).sort((a, b) => a.position - b.position).map(c => c.name);
  assert.deepEqual(cats, ['📜 Info', '🏆 Liga', '🎰 Gachapón', '🏮 Familias', '🔴 Directo', '🏯 Staff']);
  const familias = discord.estado.canales.filter(c => c.parent_id === canal('Familias').id).sort((a, b) => a.position - b.position).map(c => c.name);
  assert.equal(familias.length, 14);
  assert.deepEqual(familias.slice(0, 4), ['🏮・familia-1', '🔒・familia-1-privado', '🏮・familia-2', '🔒・familia-2-privado']);
  assert.deepEqual(familias.slice(-2), ['🏮・legacy', '🔒・legacy-privado']);
  for (const n of ['Staff', 'Jefes', 'Jugador', 'Familia 1', 'Familia 6', 'Legacy']) assert.ok(rol(n), `rol ${n}`);
  assert.equal(rol('Familia 1').color, 0xC1272D);
  assert.equal(canal('normas').parent_id, canal('Info').id);
  assert.equal(canal('normas').topic, 'Normas del servidor y de la liga.');
  assert.ok(canal('general'), 'no borra lo que ya había');
});

test('los permisos: Info es de solo lectura, Staff es privado y el privado de cada familia solo lo ve su familia', async () => {
  await aplicar(opciones);
  const bit = n => 1n << BigInt(n);
  const ow = (c, id) => c.permission_overwrites.find(o => o.id === id);
  const todos = ow(canal('anuncios'), '1');
  assert.ok(BigInt(todos.deny) & bit(11), '@everyone no escribe en anuncios');
  assert.ok(BigInt(ow(canal('anuncios'), rol('Staff').id).allow) & bit(11), 'el staff sí');
  assert.ok(BigInt(ow(canal('staff'), '1').deny) & bit(10), '@everyone no ve el canal del staff');
  assert.ok(BigInt(ow(canal('staff'), '9').allow) & bit(10), 'el bot se deja ver el canal privado para seguir gestionándolo');
  assert.deepEqual(canal('familia-2').permission_overwrites, [], 'el chat público de la familia es de todos');
  const privado = canal('familia-2-privado');
  assert.ok(BigInt(ow(privado, '1').deny) & bit(10), '@everyone no ve el privado');
  assert.ok(BigInt(ow(privado, rol('Familia 2').id).allow) & bit(10), 'su familia sí');
  assert.equal(ow(privado, rol('Familia 1').id), undefined, 'otra familia no');
  assert.ok(BigInt(ow(privado, '9').allow) & bit(10), 'y el bot, para gestionarlo');
  assert.ok(!ow(canal('clips'), '1'), 'en clips escribe todo el mundo');
});

test('la segunda vez no hace nada', async () => {
  await aplicar(opciones);
  discord.estado.peticiones = [];
  const { acciones } = await aplicar(opciones);
  assert.deepEqual(escritas(), []);
  assert.deepEqual(acciones.filter(a => a.accion !== 'sobra' && a.accion !== 'guardar'), []);
});

test('cambia solo lo que es distinto', async () => {
  await aplicar(opciones);
  canal('anuncios').topic = 'otra cosa';
  rol('Jugador').color = 0;
  discord.estado.peticiones = [];
  await aplicar(opciones);
  assert.deepEqual(escritas().map(p => `${p.metodo} ${p.ruta}`).sort(),
    [`PATCH /channels/${canal('anuncios').id}`, `PATCH /guilds/1/roles/${rol('Jugador').id}`].sort());
  assert.equal(canal('anuncios').topic, 'Anuncios de Gokudō.');
});

test('al renombrar una familia se renombran su canal y su rol, no se crean otros', async () => {
  await aplicar(opciones);
  const antes = { canal: canal('familia-1').id, rol: rol('Familia 1').id, total: discord.estado.canales.length };
  const familias = leerFamilias().map(f => (f.id === 'familia-1' ? { ...f, nombre: 'Yamada Gumi' } : f));
  await aplicar({ ...opciones, familias });
  assert.equal(canal('yamada-gumi').id, antes.canal);
  assert.ok(canal('yamada-gumi-privado'), 'también su privado');
  assert.equal(rol('Yamada Gumi').id, antes.rol);
  assert.equal(discord.estado.canales.length, antes.total);
});

test('solo borra lo que sobra con --borrar-sobrantes', async () => {
  await aplicar(opciones);
  assert.ok(canal('general'));
  await aplicar({ ...opciones, borrarSobrantes: true, prueba: true });
  assert.ok(canal('general'), 'en el modo de prueba tampoco');
  await aplicar({ ...opciones, borrarSobrantes: true });
  assert.ok(!canal('general') && !canal('Text Channels') && !canal('General'));
  assert.ok(rol('Gokudō'), 'el rol del bot (gestionado por Discord) no se toca');
  assert.ok(discord.estado.roles.find(r => r.name === '@everyone'));
});

test('los webhooks se crean una vez y sus direcciones van al .env sin tocar lo demás', async () => {
  writeFileSync(opciones.archivoEnv, 'DISCORD_BOT_TOKEN=abc\nDISCORD_WEBHOOK_URL=vieja\n');
  await aplicar(opciones);
  const env = readFileSync(opciones.archivoEnv, 'utf8');
  assert.match(env, /^DISCORD_BOT_TOKEN=abc$/m);
  assert.doesNotMatch(env, /vieja/);
  const hook = discord.estado.webhooks.find(w => w.channel_id === canal('colecciones').id);
  assert.match(env, new RegExp(`^DISCORD_WEBHOOK_URL=http://127\\.0\\.0\\.1:\\d+/api/v10/webhooks/${hook.id}/${hook.token}$`, 'm'));
  for (const v of ['DISCORD_WEBHOOK_ALINEACION', 'DISCORD_WEBHOOK_TIERLIST', 'DISCORD_WEBHOOK_CLASIFICACION']) assert.match(env, new RegExp(`^${v}=`, 'm'));
  await aplicar(opciones);
  assert.equal(discord.estado.webhooks.length, 4, 'no repite webhooks');
});

test('espera y reintenta si Discord pide calma (429), y explica los errores', async () => {
  discord.estado.responder = { estado: 429, cuerpo: { retry_after: 0.01 } };
  await aplicar({ ...opciones, prueba: true });
  const malo = crearApi({ token: 'otro', base: api.base });
  await assert.rejects(aplicar({ ...opciones, api: malo }), /401.*DISCORD_BOT_TOKEN/);
});

test('si el bot no está en ningún servidor, da el enlace para invitarlo', async () => {
  discord.servidor.removeAllListeners('request');
  discord.servidor.on('request', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.endsWith('/guilds') ? [] : { id: '9', username: 'Gokudō' }));
  });
  await assert.rejects(aplicar(opciones), new RegExp(`client_id=9&scope=bot&permissions=${PERMISOS_BOT}`));
  assert.equal(PERMISOS_BOT, 805306384n, 'Gestionar canales + Gestionar roles + Gestionar webhooks');
});

test('guardarEnEnv añade y cambia variables, y nombreCanal deja el nombre como Discord', () => {
  const f = path.join(carpeta, 'otro.env');
  guardarEnEnv(f, { A: '1' });
  guardarEnEnv(f, { B: '2', A: '3' });
  assert.equal(readFileSync(f, 'utf8'), 'A=3\nB=2\n');
  assert.equal(nombreCanal('Yamada Gumi'), 'yamada-gumi');
});
