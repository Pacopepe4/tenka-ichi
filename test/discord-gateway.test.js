// La conexión de SrDirector al gateway de Discord: un gateway de mentira (con ws) que saluda, recibe la identificación,
// manda un mensaje y corta la conexión para ver que el bot reanuda la sesión.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { crearDiscordApiFalso, TOKEN_FALSO } from '../scripts/discord-api-falso.js';
import { crearGateway } from '../server/discord-gateway.js';

const esperarA = async (cumple, ms = 3000) => {
  const fin = Date.now() + ms;
  while (!cumple()) { if (Date.now() > fin) throw new Error('no ha pasado a tiempo'); await new Promise(r => setTimeout(r, 10)); }
};

test('se identifica con los intents justos, late, pasa los mensajes y, si se corta, reanuda la sesión', async () => {
  const discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  const gw = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(r => gw.on('listening', r));
  const url = `ws://127.0.0.1:${gw.address().port}`;
  discord.estado.gateway = url;
  const recibidos = [], conexiones = [];
  gw.on('connection', socket => {
    conexiones.push(socket);
    socket.on('message', d => recibidos.push(JSON.parse(String(d))));
    socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 40 } }));
  });
  const mensajes = [];
  const g = crearGateway({ token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, alMensaje: (m, yo) => mensajes.push([m, yo]),
    log: { log: () => {}, error: () => {} }, esperar: (ms, fn) => setTimeout(fn, 5) });
  try {
    g.arrancar();
    await esperarA(() => recibidos.some(p => p.op === 2));
    const identificar = recibidos.find(p => p.op === 2).d;
    assert.equal(identificar.token, TOKEN_FALSO);
    assert.equal(identificar.intents, 513, 'GUILDS y GUILD_MESSAGES, sin el privilegiado de Message Content');
    const primero = conexiones[0];
    primero.send(JSON.stringify({ op: 0, t: 'READY', s: 1, d: { session_id: 'sesion-1', resume_gateway_url: url, user: { id: '9', username: 'SrDirector' } } }));
    primero.send(JSON.stringify({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: '50', content: '<@9> hola' } }));
    await esperarA(() => mensajes.length === 1);
    assert.deepEqual(mensajes[0], [{ id: '50', content: '<@9> hola' }, { id: '9', username: 'SrDirector' }]);
    assert.equal(g.yo().username, 'SrDirector');
    // El latido lleva el último número de secuencia (alguno puede salir antes de que llegue el 2 si la máquina va cargada)
    await esperarA(() => recibidos.some(p => p.op === 1 && p.d === 2));
    primero.send(JSON.stringify({ op: 11 }));
    // Discord corta (por ejemplo, por mantenimiento): el bot vuelve y reanuda en vez de identificarse otra vez
    primero.close(4000);
    await esperarA(() => recibidos.some(p => p.op === 6));
    assert.deepEqual(recibidos.find(p => p.op === 6).d, { token: TOKEN_FALSO, session_id: 'sesion-1', seq: 2 });
    assert.equal(recibidos.filter(p => p.op === 2).length, 1);
  } finally {
    g.parar();
    gw.close();
    discord.servidor.close();
  }
});

test('con el token mal (cierre 4004) se para y no lo reintenta', async () => {
  const gw = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(r => gw.on('listening', r));
  let conexiones = 0;
  gw.on('connection', socket => { conexiones++; socket.close(4004); });
  const errores = [];
  const discord = crearDiscordApiFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  discord.estado.gateway = `ws://127.0.0.1:${gw.address().port}`;
  const g = crearGateway({ token: TOKEN_FALSO, urlApi: `http://127.0.0.1:${discord.servidor.address().port}/api/v10`, alMensaje: () => {},
    log: { log: () => {}, error: (...a) => errores.push(a.join(' ')) }, esperar: (ms, fn) => setTimeout(fn, 5) });
  try {
    g.arrancar();
    await esperarA(() => errores.some(e => /4004/.test(e)));
    await new Promise(r => setTimeout(r, 100));
    assert.equal(conexiones, 1);
    assert.ok(errores.some(e => /DISCORD_BOT_TOKEN no vale/.test(e)));
  } finally {
    g.parar();
    gw.close();
    discord.servidor.close();
  }
});
