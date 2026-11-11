// Montar el servidor de Discord con el bot (scripts/discord-api-falso.js hace de Discord): el modo de prueba no
// cambia nada, la primera vez lo crea todo, la segunda no hace nada, se cambia solo lo distinto, no se borra
// nada sin --borrar-sobrantes y las direcciones de los webhooks van al .env. Estas pruebas van con --forzar y --crear
// (imponer servidor.json); las del final, sin ellos: lo que manda es lo que hay en el servidor.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { aplicar, crearApi, leerConfig, leerFamilias, guardarEnEnv, PERMISOS, PERMISOS_BOT, nombreCanal } from '../scripts/discord-aplicar.js';

let discord, api, carpeta, opciones;
// Familias de prueba (fijas, para que los tests no dependan de los nombres de verdad de data-proyecto/familias.json)
const FAMILIAS = [1, 2, 3, 4, 5, 6].map(n => ({ id: `familia-${n}`, nombre: `Familia ${n}`, kanji: '', color: ['#C1272D', '#EE7B2B', '#D9A400', '#5FA341', '#39C6F0', '#8E5BD0'][n - 1] }))
  .concat({ id: 'legacy', nombre: 'Legacy', kanji: '', color: '#D9D3C7', legacy: true });
const escritas = () => discord.estado.peticiones.filter(p => p.metodo !== 'GET');
// Busca por el nombre sin el emoji de delante («📜・normas» → normas, «📜 Info» → Info)
const sinEmoji = n => n.replace(/^.*?[・ ]/u, '');
const canal = nombre => discord.estado.canales.find(c => c.name === nombre) || discord.estado.canales.find(c => /[・ ]/u.test(c.name) && sinEmoji(c.name) === nombre);
const categoria = nombre => discord.estado.canales.find(c => c.type === 4 && sinEmoji(c.name) === nombre);
const voz = nombre => discord.estado.canales.find(c => c.type === 2 && sinEmoji(c.name) === nombre);
const rol = nombre => discord.estado.roles.find(r => r.name === nombre);

beforeEach(async () => {
  discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  api = crearApi({ token: TOKEN_FALSO, base: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, esperar: async () => {} });
  carpeta = mkdtempSync(path.join(tmpdir(), 'discord-aplicar-'));
  opciones = { api, config: leerConfig(), familias: FAMILIAS, archivoEnv: path.join(carpeta, '.env'), archivoIds: path.join(carpeta, 'ids.json'),
    archivoFoto: path.join(carpeta, 'servidor-actual.json'), forzar: true, crear: true, log: () => {} };
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

test('la primera vez lo crea todo: categorías en orden, canales, y por cada familia y Legacy un rol y su categoría con un chat y dos canales de voz', async () => {
  await aplicar(opciones);
  const cats = discord.estado.canales.filter(c => c.type === 4 && !/Channels/.test(c.name)).sort((a, b) => a.position - b.position).map(c => c.name);
  const deFamilias = ['Familia 1', 'Familia 2', 'Familia 3', 'Familia 4', 'Familia 5', 'Familia 6', 'Legacy'].map(n => `🏮 ${n}`);
  // La Izakaya va antes de las familias, como la puso Pacopepe (10/11/2026)
  assert.deepEqual(cats, ['🏯 Staff', '🔴 Directo', '📜 Info', '🏆 Liga', '⚔️ Scrims', '🎰 Gachapón', '🍶 General-La Izakaya', ...deFamilias], 'una categoría por familia, donde estaba la de Familias');
  // Cada familia en su categoría, como los enseña Discord: primero el de texto y luego los de voz
  for (const [i, n] of ['Familia 1', 'Familia 6', 'Legacy'].entries()) {
    const cat = categoria(n);
    const dentro = discord.estado.canales.filter(c => c.parent_id === cat.id).sort((a, b) => a.type - b.type || a.position - b.position).map(c => c.name);
    assert.deepEqual(dentro, [`🏮・${nombreCanal(n)}`, `🔊・${n}`, `🔒・${n} privado`], `canales de ${n} (${i})`);
  }
  assert.equal(voz('Familia 1').type, 2, 'los de voz son de voz');
  assert.equal(voz('Familia 1').topic, null, 'y sin descripción');
  assert.equal(voz('Izakaya').parent_id, categoria('General-La Izakaya').id, 'Izakaya: su categoría, su chat y sus dos canales de voz');
  assert.equal(voz('Izakaya 2').parent_id, categoria('General-La Izakaya').id);
  assert.equal(canal('chat-general').parent_id, categoria('General-La Izakaya').id);
  for (const n of ['Kumichō', 'Oyabun', 'Kobun', 'Familia 1', 'Familia 6', 'Legacy']) assert.ok(rol(n), `rol ${n}`);
  assert.equal(rol('Familia 1').color, 0xC1272D);
  assert.equal(canal('normas').parent_id, canal('Info').id);
  assert.equal(canal('normas').topic, 'Normas del servidor y de la liga.');
  assert.ok(canal('general'), 'no borra lo que ya había');
});

test('los permisos: Info es de solo lectura, Staff es privado y la voz privada de cada familia solo la ve su familia', async () => {
  await aplicar(opciones);
  const bit = n => 1n << BigInt(n);
  const ow = (c, id) => c.permission_overwrites.find(o => o.id === id);
  const todos = ow(canal('anuncios'), '1');
  assert.ok(BigInt(todos.deny) & bit(11), '@everyone no escribe en anuncios');
  assert.ok(BigInt(ow(canal('anuncios'), rol('Kumichō').id).allow) & bit(11), 'el staff sí');
  assert.ok(BigInt(ow(canal('staff'), '1').deny) & bit(10), '@everyone no ve el canal del staff');
  assert.ok(BigInt(ow(canal('staff'), '9').allow) & bit(10), 'el bot se deja ver el canal privado para seguir gestionándolo');
  assert.deepEqual(canal('familia-2').permission_overwrites, [], 'el chat público de la familia es de todos');
  assert.deepEqual(voz('Familia 2').permission_overwrites, [], 'la voz abierta es de todos');
  const privado = canal('Familia 2 privado');
  assert.ok(BigInt(ow(privado, '1').deny) & bit(10) && BigInt(ow(privado, '1').deny) & bit(20), '@everyone ni lo ve ni entra');
  assert.ok(BigInt(ow(privado, rol('Familia 2').id).allow) & bit(20), 'su familia sí entra');
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
  rol('Kobun').color = 0;
  discord.estado.peticiones = [];
  await aplicar(opciones);
  assert.deepEqual(escritas().map(p => `${p.metodo} ${p.ruta}`).sort(),
    [`PATCH /channels/${canal('anuncios').id}`, `PATCH /guilds/1/roles/${rol('Kobun').id}`].sort());
  assert.equal(canal('anuncios').topic, 'Anuncios de Gokudō.');
});

test('al renombrar una familia se renombran su canal y su rol, no se crean otros', async () => {
  await aplicar(opciones);
  const antes = { canal: canal('familia-1').id, rol: rol('Familia 1').id, total: discord.estado.canales.length };
  const familias = FAMILIAS.map(f => (f.id === 'familia-1' ? { ...f, nombre: 'Yamada Gumi' } : f));
  await aplicar({ ...opciones, familias });
  assert.equal(canal('yamada-gumi').id, antes.canal);
  assert.ok(canal('Yamada Gumi privado'), 'también su voz privada');
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
  for (const v of ['DISCORD_WEBHOOK_ALINEACION', 'DISCORD_WEBHOOK_TIERLIST', 'DISCORD_WEBHOOK_CLASIFICACION', 'DISCORD_WEBHOOK_RESULTADOS', 'DISCORD_WEBHOOK_DIRECTO']) assert.match(env, new RegExp(`^${v}=`, 'm'));
  await aplicar(opciones);
  assert.equal(discord.estado.webhooks.length, 6, 'no repite webhooks');
  // Las crónicas van a #resultados y el aviso de directo de Kick a #avisos-directo
  const de = v => { const id = env.match(new RegExp(`^${v}=.*/webhooks/([^/]+)/`, 'm'))[1]; return discord.estado.webhooks.find(w => String(w.id) === id); };
  assert.equal(de('DISCORD_WEBHOOK_RESULTADOS').channel_id, canal('resultados').id);
  assert.equal(de('DISCORD_WEBHOOK_DIRECTO').channel_id, canal('avisos-directo').id);
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

test('los roles van en orden (cada uno solo da los de debajo) y Oyabun puede invitar y mover gente, pero no dar roles (para eso está /reclutar)', async () => {
  await aplicar(opciones);
  const orden = discord.estado.roles.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => r.name);
  assert.deepEqual(orden, ['Gokudō', 'Kumichō', 'Oyabun', 'Familia 1', 'Familia 2', 'Familia 3', 'Familia 4', 'Familia 5', 'Familia 6', 'Legacy', 'Kobun'],
    'el bot arriba; el staff por encima de los jefes y los jefes por encima de las familias');
  const p = BigInt(rol('Oyabun').permissions);
  for (const n of ['CREATE_INSTANT_INVITE', 'MOVE_MEMBERS']) assert.ok(p & (1n << BigInt(PERMISOS[n])), n);
  assert.ok(!(p & (1n << BigInt(PERMISOS.MANAGE_ROLES))), 'sin «Gestionar roles»: reclutan con /reclutar, solo para su familia');
  assert.ok(!(p & 8n), 'los Oyabun no son administradores');
  assert.equal(rol('Familia 1').permissions, '1071698660929', 'a los roles sin permisos en el archivo no se les tocan');
  discord.estado.peticiones = [];
  await aplicar(opciones);
  assert.deepEqual(escritas(), [], 'la segunda vez no reordena ni cambia permisos');
  rol('Oyabun').position = 1;
  rol('Kobun').position = 9;
  await aplicar(opciones);
  assert.equal(escritas().length, 1);
  assert.equal(escritas()[0].ruta, '/guilds/1/roles');
  assert.ok(rol('Oyabun').position > rol('Familia 1').position && rol('Kobun').position < rol('Legacy').position);
});

test('ids.json solo guarda lo que está en el archivo, y un canal adoptado por su id se renombra y se coloca', async () => {
  // Alguien creó a mano un canal de voz suelto, y en ids.json se apunta que es el de Izakaya (y queda una clave vieja)
  const suelto = { id: '77', type: 2, name: 'Izakazya', position: 0, parent_id: null, permission_overwrites: [] };
  discord.estado.canales.push(suelto);
  writeFileSync(opciones.archivoIds, JSON.stringify({ 1: { 'canal:izakaya': '77', 'canal:viejo': '123' } }));
  await aplicar(opciones);
  assert.equal(suelto.name, '🍶・Izakaya');
  assert.equal(suelto.parent_id, categoria('General-La Izakaya').id);
  assert.equal(discord.estado.canales.filter(c => /^🍶・Izakaya$/.test(c.name) && c.type === 2).length, 1, 'no crea otro');
  const despues = JSON.parse(readFileSync(opciones.archivoIds, 'utf8'))['1'];
  assert.equal(despues['canal:izakaya'], '77');
  assert.ok(!('canal:viejo' in despues));
});

test('registra los comandos del bot una vez, y no quita los que no son suyos sin --borrar-sobrantes', async () => {
  await aplicar(opciones);
  assert.deepEqual(discord.estado.comandos.map(c => c.name), ['reclutar']);
  assert.equal(discord.estado.comandos[0].options[0].type, 6, 'la opción es un usuario');
  discord.estado.peticiones = [];
  await aplicar(opciones);
  assert.deepEqual(escritas(), [], 'la segunda vez no los vuelve a registrar');
  discord.estado.comandos.push({ id: '5', name: 'otro', description: 'de otra cosa', options: [] });
  await aplicar(opciones);
  assert.deepEqual(escritas(), []);
  await aplicar({ ...opciones, borrarSobrantes: true });
  assert.deepEqual(discord.estado.comandos.map(c => c.name), ['reclutar']);
});

test('el archivo de familias de verdad: seis familias y una Legacy, con id, nombre y color, y nombres que valen como canal', () => {
  const familias = leerFamilias();
  assert.equal(familias.length, 7);
  assert.deepEqual(familias.map(f => f.id), ['familia-1', 'familia-2', 'familia-3', 'familia-4', 'familia-5', 'familia-6', 'legacy'], 'los ids no se cambian: con ellos se encuentran canales y roles');
  assert.equal(familias.filter(f => f.legacy).length, 1);
  for (const f of familias) {
    assert.ok(f.nombre && f.nombre.length <= 20, f.id);
    assert.match(f.color, /^#[0-9A-F]{6}$/i, f.id);
  }
  assert.equal(new Set(familias.map(f => nombreCanal(f.nombre))).size, 7, 'dos familias no pueden dar el mismo canal');
});

test('la marca: icono del servidor, avatar del bot y de los webhooks, y un emoji por familia; la segunda vez no sube nada', async () => {
  const familias = leerFamilias();
  await aplicar({ ...opciones, familias });
  assert.ok(discord.estado.guild.icon, 'icono del servidor');
  assert.ok(discord.estado.webhooks.every(w => w.avatar), 'los webhooks con su imagen');
  assert.deepEqual(discord.estado.emojis.map(e => e.name).sort(), familias.map(f => f.insignia).sort(), 'un emoji por familia');
  assert.ok(discord.estado.emojis.every(e => e.imagen.startsWith('data:image/png;base64,')));
  // El distintivo de cada familia delante de su categoría y de su chat
  for (const f of familias) {
    assert.ok(discord.estado.canales.some(c => c.type === 4 && c.name === `${f.emoji} ${f.nombre}`), `categoría de ${f.nombre}`);
    assert.ok(discord.estado.canales.some(c => c.type === 0 && c.name === `${f.emoji}・${nombreCanal(f.nombre)}`), `chat de ${f.nombre}`);
  }
  const ids = JSON.parse(readFileSync(opciones.archivoIds, 'utf8'))['1'];
  assert.match(ids['imagen:servidor'], /^[0-9a-f]{16}$/);
  const antes = discord.estado.peticiones.length;
  const { acciones } = await aplicar({ ...opciones, familias });
  assert.deepEqual(acciones.filter(a => !['sobra', 'guardar'].includes(a.accion)), [], 'la segunda vez no hace nada');
  assert.ok(discord.estado.peticiones.slice(antes).every(p => p.metodo === 'GET'));
});

test('si cambia la imagen de una insignia, su emoji se borra y se sube otra vez; con nivel 2 de mejoras, los roles llevan la insignia', async () => {
  const familias = leerFamilias();
  await aplicar({ ...opciones, familias });
  const ids = JSON.parse(readFileSync(opciones.archivoIds, 'utf8'));
  const viejo = ids['1']['emoji:familia-1'];
  ids['1']['imagen:emoji:familia-1'] = 'otra';
  writeFileSync(opciones.archivoIds, JSON.stringify(ids));
  discord.estado.guild.features = ['ROLE_ICONS'];
  const { acciones } = await aplicar({ ...opciones, familias });
  assert.ok(acciones.some(a => a.que === 'el emoji' && a.accion === 'cambiar' && a.nombre === ':ryujin:'));
  assert.ok(!discord.estado.emojis.some(e => e.id === viejo) && discord.estado.emojis.some(e => e.name === 'ryujin'));
  assert.equal(discord.estado.emojis.length, 7);
  for (const f of familias) assert.ok(rol(f.nombre).icon, `icono del rol ${f.nombre}`);
});

test('si Discord no deja cambiar el avatar del bot (muchas veces seguidas), avisa y sigue con lo demás', async () => {
  discord.estado.responder = null;
  const lineas = [];
  const original = api.patch;
  api.patch = (r, c) => (r === '/users/@me' ? Promise.reject(new (class extends Error {})('x')) : original(r, c));
  await assert.rejects(aplicar({ ...opciones, log: () => {} }), /x/, 'un error que no es de Discord sí para');
  const { ErrorDiscord } = await import('../scripts/discord-aplicar.js');
  api.patch = (r, c) => (r === '/users/@me' ? Promise.reject(new ErrorDiscord('Discord respondió 400: You are changing your avatar too fast')) : original(r, c));
  await aplicar({ ...opciones, log: l => lineas.push(l) });
  assert.match(lineas.join('\n'), /No se ha podido cambiar el avatar del bot/);
  assert.ok(discord.estado.guild.icon, 'lo demás sí se hace');
  assert.ok(!('imagen:bot' in JSON.parse(readFileSync(opciones.archivoIds, 'utf8'))['1']), 'la próxima vez lo intenta otra vez');
});

// ---------- Sin --forzar: manda lo que hay en el servidor (lo pidió Pacopepe el 10/11/2026: «deja los canales como los puse yo») ----------
const respetando = (mas = {}) => ({ ...opciones, forzar: false, crear: false, ...mas });

test('sin --forzar, lo que se cambió a mano en Discord se queda: nombres, descripción, categoría, permisos, color y orden', async () => {
  await aplicar(opciones);   // el servidor montado como dice servidor.json
  const anuncios = canal('anuncios'), staff = categoria('Staff'), kobun = rol('Kobun'), izakaya = categoria('General-La Izakaya');
  Object.assign(anuncios, { name: '📢・novedades', topic: 'Lo que digo yo', parent_id: categoria('Liga').id, permission_overwrites: [] });
  staff.name = '🏯 Jefatura';
  kobun.color = 0x123456;
  izakaya.position = -1;   // la Izakaya, arriba del todo
  discord.estado.peticiones = [];
  const lineas = [];
  const { acciones } = await aplicar(respetando({ log: l => lineas.push(l) }));
  assert.deepEqual(escritas(), [], 'no escribe nada en Discord');
  assert.deepEqual([anuncios.name, anuncios.topic, anuncios.parent_id], ['📢・novedades', 'Lo que digo yo', categoria('Liga').id]);
  assert.equal(staff.name, '🏯 Jefatura');
  assert.equal(kobun.color, 0x123456);
  assert.equal(izakaya.position, -1);
  const respeta = acciones.filter(a => a.accion === 'respeta').map(a => `${a.que} ${a.nombre}`);
  assert.ok(respeta.includes('el canal #📢・novedades'));
  assert.ok(respeta.includes('la categoría 🏯 Jefatura'));
  assert.ok(respeta.includes('el rol Kobun'));
  assert.ok(respeta.includes('el orden de categorías y canales'));
  assert.match(lineas.join('\n'), /Se respeta lo que ya hay en el servidor/);
  assert.match(lineas.at(-1), /respetadas como están \(con --forzar se cambiarían\)/);
});

test('sin --crear no crea canales, categorías, roles ni emojis que falten, pero sí el webhook que falte en un canal que existe', async () => {
  await aplicar(opciones);
  // Pacopepe borra #clips y la categoría de Staff con sus canales; y un webhook desaparece
  const quitar = c => { discord.estado.canales = discord.estado.canales.filter(x => x !== c); };
  quitar(canal('clips'));
  const staff = categoria('Staff');
  for (const x of discord.estado.canales.filter(x => x.parent_id === staff.id)) quitar(x);
  quitar(staff);
  const tier = discord.estado.webhooks.find(w => w.channel_id === canal('tier-list').id);
  discord.estado.webhooks = discord.estado.webhooks.filter(w => w !== tier);
  discord.estado.peticiones = [];
  const { acciones } = await aplicar(respetando());
  assert.deepEqual(escritas().map(p => `${p.metodo} ${p.ruta}`), [`POST /channels/${canal('tier-list').id}/webhooks`], 'solo el webhook');
  assert.ok(!canal('clips') && !categoria('Staff'), 'no vuelven');
  const faltan = acciones.filter(a => a.accion === 'falta').map(a => `${a.que} ${a.nombre}`);
  assert.ok(faltan.includes('el canal #🎬・clips'));
  assert.ok(faltan.includes('la categoría 🏯 Staff'));
  assert.match(readFileSync(opciones.archivoEnv, 'utf8'), /^DISCORD_WEBHOOK_TIERLIST=http/m);
});

test('con --crear crea lo que falta, pero sigue sin tocar lo que hay', async () => {
  await aplicar(opciones);
  canal('anuncios').name = '📢・novedades';
  discord.estado.canales = discord.estado.canales.filter(x => x !== canal('clips'));
  discord.estado.peticiones = [];
  await aplicar(respetando({ crear: true }));
  assert.ok(canal('clips'), '#clips vuelve');
  assert.equal(canal('novedades').name, '📢・novedades', 'el renombrado se queda');
  assert.deepEqual(escritas().map(p => `${p.metodo} ${p.ruta.replace(/\d+/g, 'N')}`), ['POST /guilds/N/channels']);
});

test('cada pasada guarda una foto del servidor tal como está, en orden y sin ids', async () => {
  await aplicar(opciones);
  canal('anuncios').name = '📢・novedades';
  categoria('General-La Izakaya').position = -1;
  await aplicar(respetando());
  const foto = JSON.parse(readFileSync(opciones.archivoFoto, 'utf8'));
  assert.equal(foto.categorias[0].nombre, '🍶 General-La Izakaya', 'en el orden de Discord');
  assert.ok(foto.categorias.find(c => c.nombre === '📜 Info').canales.some(k => k.nombre === '📢・novedades'));
  assert.ok(foto.roles.includes('Kobun'));
  assert.doesNotMatch(JSON.stringify(foto), /"id"|webhooks\//, 'sin ids ni direcciones');
  await aplicar(respetando({ prueba: true, archivoFoto: path.join(carpeta, 'otra.json') }));
  assert.ok(!existsSync(path.join(carpeta, 'otra.json')), 'en el modo de prueba no escribe nada');
});

test('#tickets: nadie escribe ni abre hilos, el staff ve y gestiona los hilos privados y el bot los abre; con --crear se crea solo él', async () => {
  await aplicar(opciones);
  const bit = n => 1n << BigInt(n);
  const ow = (c, id) => c.permission_overwrites.find(o => o.id === id);
  const tickets = canal('tickets');
  assert.equal(tickets.parent_id, categoria('Info').id, 'va en Info');
  const todos = ow(tickets, '1');
  assert.ok(BigInt(todos.deny) & bit(11) && BigInt(todos.deny) & bit(35) && BigInt(todos.deny) & bit(36), '@everyone no escribe ni abre hilos');
  assert.ok(BigInt(todos.allow) & bit(38), 'pero sí escribe dentro de su hilo');
  assert.ok(BigInt(ow(tickets, rol('Kumichō').id).allow) & bit(34), 'el staff gestiona (y ve) los hilos privados');
  const bot = ow(tickets, '9');
  assert.equal(bot.type, 1, 'el permiso del bot es para él (miembro), no para un rol');
  for (const n of [10, 11, 34, 36, 38]) assert.ok(BigInt(bot.allow) & bit(n), `el bot tiene el permiso ${n}`);
  // En un servidor ya montado sin #tickets, --crear solo crea el canal
  discord.estado.canales = discord.estado.canales.filter(x => x !== tickets);
  discord.estado.peticiones = [];
  await aplicar(respetando({ crear: true }));
  assert.ok(canal('tickets'));
  assert.deepEqual(escritas().map(p => `${p.metodo} ${p.ruta.replace(/\d+/g, 'N')}`), ['POST /guilds/N/channels']);
});

test('registra el comando global /gokudo-red (el de server/red.js) y la segunda vez no lo toca', async () => {
  const { COMANDO_RED } = await import('../server/red.js');
  assert.deepEqual(leerConfig().comandosGlobales, [COMANDO_RED], 'servidor.json lleva el mismo comando que atiende la web');
  await aplicar(opciones);
  assert.deepEqual((discord.estado.globales || []).map(c => c.name), ['gokudo-red']);
  discord.estado.peticiones = [];
  await aplicar(respetando());
  assert.ok(!discord.estado.peticiones.some(p => p.metodo === 'PUT' && /\/commands$/.test(p.ruta) && !/guilds/.test(p.ruta)), 'no lo vuelve a registrar');
});
