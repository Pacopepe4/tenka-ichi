// /reclutar: Discord manda el comando firmado a la web (scripts/discord-api-falso.js hace de Discord para dar los
// roles). Solo un Oyabun recluta, y solo para su familia; lo que no viene firmado por Discord no hace nada.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { crearComandos, decidirReclutar } from '../server/discord-comandos.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const CLAVE = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const IDS = { 1: { 'rol:jefes': '501', 'rol:jugador': '502', 'familia:familia-1': '511', 'familia:familia-2': '512' } };
const FAMILIAS = [{ id: 'familia-1', nombre: 'Familia 1' }, { id: 'familia-2', nombre: 'Familia 2' }];
let discord, web, url;

before(async () => {
  discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  for (const id of ['501', '502', '511', '512']) discord.estado.roles.push({ id, name: `rol ${id}`, position: 1, managed: false });
  const comandos = crearComandos({ clave: CLAVE, token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, ids: () => IDS, familias: () => FAMILIAS });
  web = http.createServer(async (req, res) => {
    const r = await comandos.atender(req);
    res.writeHead(r.estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.cuerpo));
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${web.address().port}/discord/interacciones`;
});
after(() => { discord.servidor.close(); web.close(); });
beforeEach(() => {
  discord.estado.miembros = {
    10: { roles: ['501', '511'] },  // Oyabun de la familia 1
    20: { roles: [] },              // sin familia
    30: { roles: ['512'] },         // de la familia 2
  };
});

async function mandar(cuerpo, { firma = true } = {}) {
  const texto = JSON.stringify(cuerpo);
  const momento = String(Math.floor(Date.now() / 1000));
  const sello = crypto.sign(null, Buffer.from(momento + texto), privateKey).toString('hex');
  const r = await fetch(url, { method: 'POST', body: texto, headers: { 'Content-Type': 'application/json', 'X-Signature-Timestamp': momento,
    'X-Signature-Ed25519': firma ? sello : sello.replace(/^./, c => (c === 'a' ? 'b' : 'a')) } });
  return { estado: r.status, cuerpo: await r.json() };
}
const reclutar = (quien, objetivo) => mandar({
  type: 2, guild_id: '1', data: { name: 'reclutar', options: [{ name: 'quien', type: 6, value: objetivo }],
    resolved: { users: { [objetivo]: { id: objetivo, username: `u${objetivo}`, bot: objetivo === '99' } }, members: discord.estado.miembros[objetivo] ? { [objetivo]: { roles: [...discord.estado.miembros[objetivo].roles] } } : {} } },
  member: { user: { id: quien, username: `u${quien}` }, roles: [...(discord.estado.miembros[quien]?.roles || [])] },
});

test('sin la firma de Discord no hace nada, y al PING de Discord le contesta PONG', async () => {
  const mal = await mandar({ type: 1 }, { firma: false });
  assert.equal(mal.estado, 401);
  const bien = await mandar({ type: 1 });
  assert.deepEqual(bien, { estado: 200, cuerpo: { type: 1 } });
});

test('un Oyabun recluta para su familia: le da el rol de la familia y el de Kobun, y lo anuncia', async () => {
  const r = await reclutar('10', '20');
  assert.deepEqual(discord.estado.miembros[20].roles.sort(), ['502', '511']);
  assert.equal(r.cuerpo.type, 4);
  assert.match(r.cuerpo.data.content, /<@20> entra en la familia \*\*Familia 1\*\* de la mano de <@10>/);
  assert.equal(r.cuerpo.data.flags, 0, 'lo ve todo el canal');
  assert.deepEqual(r.cuerpo.data.allowed_mentions, { parse: [], users: ['20'] }, 'solo avisa al reclutado');
});

test('quien no es Oyabun no puede reclutar, y el aviso solo lo ve él', async () => {
  const r = await reclutar('30', '20');
  assert.match(r.cuerpo.data.content, /Solo un Oyabun/);
  assert.equal(r.cuerpo.data.flags, 64);
  assert.deepEqual(discord.estado.miembros[20].roles, []);
});

test('no se puede reclutar a alguien de otra familia, ni a uno que ya es de la tuya, ni a un bot', async () => {
  assert.match((await reclutar('10', '30')).cuerpo.data.content, /es de la familia Familia 2: tiene que salir antes/);
  assert.deepEqual(discord.estado.miembros[30].roles, ['512']);
  await reclutar('10', '20');
  assert.match((await reclutar('10', '20')).cuerpo.data.content, /ya es de la familia Familia 1/);
  assert.match((await reclutar('10', '99')).cuerpo.data.content, /bot/);
});

test('un Oyabun sin familia, o con dos, no recluta', () => {
  const roles = { oyabun: '501', kobun: '502', familias: [{ nombre: 'Familia 1', rol: '511' }, { nombre: 'Familia 2', rol: '512' }] };
  const objetivo = { id: '20' }, objetivoMiembro = { roles: [] };
  assert.match(decidirReclutar({ roles, quien: { member: { roles: ['501'] } }, objetivo, objetivoMiembro }).error, /ninguna familia/);
  assert.match(decidirReclutar({ roles, quien: { member: { roles: ['501', '511', '512'] } }, objetivo, objetivoMiembro }).error, /varias familias/);
  assert.deepEqual(decidirReclutar({ roles, quien: { member: { roles: ['501', '512'] } }, objetivo, objetivoMiembro: { roles: ['502'] } }).dar, ['512'], 'si ya es Kobun, solo la familia');
});

test('sin DISCORD_PUBLIC_KEY ni token, la ruta no hace nada', async () => {
  const apagado = crearComandos({ clave: '', token: '' });
  assert.equal(apagado.activo, false);
  assert.equal((await apagado.atender({})).estado, 404);
});

test('una DISCORD_PUBLIC_KEY mal copiada no tumba la web: se aceptan espacios y comillas, y si no vale se apaga el comando', () => {
  const errores = [];
  const original = console.error;
  console.error = m => errores.push(m);
  try {
    assert.equal(crearComandos({ clave: `  "${CLAVE}"  `, token: 't' }).activo, true);
    assert.equal(crearComandos({ clave: `DISCORD_PUBLIC_KEY = ${CLAVE}`, token: 't' }).activo, true);
    assert.equal(crearComandos({ clave: 'esto no es una clave', token: 't' }).activo, false);
  } finally {
    console.error = original;
  }
  assert.ok(errores.length >= 1 && errores.every(e => /DISCORD_PUBLIC_KEY no es válida/.test(e)));
});
