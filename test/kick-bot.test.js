// El bot de Gokudō en Kick (server/kick-bot.js) con un Kick falso que firma los avisos como Kick (scripts/kick-falso.js)
// y un Discord falso: suscripción al conectar el canal, firma y avisos repetidos, sobres por subs, regalos y kicks,
// anuncios en el chat, el Omamori sin consultas periódicas (y los canjes que quedan sin resolver), alertas para OBS,
// el aviso de directo, los comandos del chat y la cuenta aparte del bot. La web arranca con datos temporales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearKickFalso, CLIENTE_KICK } from '../scripts/kick-falso.js';
import { crearDiscordFalso } from '../scripts/discord-webhook-falso.js';
import { comandoDe, responderComando, textoPartido, horaEspana } from '../server/comandos-kick.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let kick, urlKick, discord, urlDiscord, carpeta, web, urlWeb;

const esperar = ms => new Promise(r => setTimeout(r, ms));
// Lo que hace la web con un aviso va después de contestar a Kick: se espera a que pase
async function hasta(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fin) return v;
    await esperar(50);
  }
}

async function arrancarWeb() {
  const puerto = 4800 + Math.floor(Math.random() * 90);   // un tramo propio: las pruebas corren a la vez
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|KICK_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas',
      KICK_CLIENT_ID: CLIENTE_KICK.id, KICK_CLIENT_SECRET: CLIENTE_KICK.secreto,
      KICK_URL_ID: urlKick, KICK_URL_API: `${urlKick}/public/v1`,
      KICK_BOT_RESPIRO_MS: '0',
      DISCORD_WEBHOOK_URL: `${urlDiscord}/api/webhooks/1/general`, DISCORD_WEBHOOK_DIRECTO: `${urlDiscord}/api/webhooks/2/directos`,
      CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
      ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'),
      ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json') },
  });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) return; } catch {}
    await esperar(200);
  }
  throw new Error('La web no arranca');
}

function navegador() {
  const cookies = new Map();
  return {
    async ir(url, opciones = {}) {
      for (let saltos = 0; saltos < 10; saltos++) {
        const r = await fetch(url, { ...opciones, redirect: 'manual',
          headers: { ...(opciones.headers || {}), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
        for (const c of r.headers.getSetCookie()) {
          const [par] = c.split(';');
          const i = par.indexOf('=');
          const [k, v] = [par.slice(0, i), par.slice(i + 1)];
          if (/Max-Age=0/i.test(c) || !v) cookies.delete(k); else cookies.set(k, v);
        }
        if (r.status < 300 || r.status >= 400) return r;
        url = new URL(r.headers.get('location'), url).toString();
        opciones = {};
      }
      throw new Error('Demasiadas redirecciones');
    },
  };
}

async function accion(nombre, datos = {}) {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
  await new Promise((ok, mal) => { ws.on('open', ok); ws.on('error', mal); });
  const respuesta = await new Promise(ok => {
    ws.on('message', m => { const x = JSON.parse(m); if (x.tipo === 'respuesta' && x.id === 1) ok(x); });
    ws.send(JSON.stringify({ tipo: 'accion', id: 1, accion: nombre, datos, clave: CLAVE }));
  });
  ws.close();
  return respuesta;
}
const control = (orden, datos = {}) => fetch(`${urlKick}/_control/${orden}`, { method: 'POST', body: JSON.stringify(datos) }).then(r => r.json());
const estadoKick = () => control('estado');
const gacha = nav => nav.ir(`${urlWeb}/api/gacha`).then(r => r.json());
const sobresDe = async nav => (await gacha(nav)).usuario.sobres;
// Lo que ha escrito el bot en el chat desde un momento dado
const chatDesde = async n => (await estadoKick()).chat.slice(n);
const enChat = async (re, desde = 0) => hasta(async () => (await chatDesde(desde)).find(m => re.test(m.content)));
const registro = async () => JSON.parse(await readFile(path.join(carpeta, 'gacha.json'), 'utf8'));

// Personas de Kick como vienen en los avisos
const persona = (user_id, username) => ({ is_anonymous: false, user_id, username, is_verified: false, profile_picture: '', channel_slug: username.toLowerCase(), identity: null });
const CANAL = persona(5001, 'Gokudo_zoku');
const ANA = persona(6001, 'ana_kick'), BETO = persona(6002, 'Beto_K'), CARLA = persona(6003, 'carla_k');
const aviso = (tipo, datos, extra = {}) => control('evento', { tipo, datos: { broadcaster: CANAL, ...datos }, ...extra });
const chat = (quien, content) => aviso('chat.message.sent', { message_id: crypto.randomUUID(), sender: quien, content, emotes: [], created_at: new Date().toISOString() });

// Las alertas que recibe la fuente de OBS (/ws?canal=alertas)
const alertas = [], otros = [];
let wsAlertas;

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-kick-bot-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ jugadores: {}, equipos: {} }));
  for (const [archivo, vacio] of [['boosts.json', '[]'], ['campeones.json', '{}'], ['legacy.json', '[]']]) await writeFile(path.join(carpeta, archivo), vacio);

  kick = crearKickFalso();
  await new Promise(r => kick.servidor.listen(0, '127.0.0.1', r));
  urlKick = `http://127.0.0.1:${kick.servidor.address().port}`;
  discord = crearDiscordFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  urlDiscord = `http://127.0.0.1:${discord.servidor.address().port}`;
  await arrancarWeb();
  await control('webhook', { url: `${urlWeb}/webhooks/kick` });

  wsAlertas = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws?canal=alertas`);
  wsAlertas.on('message', m => { const x = JSON.parse(m); (x.tipo === 'alerta' ? alertas : otros).push(x); });
  await new Promise((ok, mal) => { wsAlertas.on('open', ok); wsAlertas.on('error', mal); });
});

after(async () => {
  wsAlertas?.close();
  if (web) { const fin = new Promise(r => web.once('exit', r)); web.kill(); await fin; }
  kick?.servidor.close();
  discord?.servidor.close();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

const ana = navegador();

test('al conectar el canal, la web se suscribe a sus 8 avisos de Kick, y al reconectar no los repite', async () => {
  await ana.ir(`${urlWeb}/auth/prueba?nombre=Ana`);
  await control('sesion', { login: 'ana' });
  await ana.ir(`${urlWeb}/auth/kick/vincular`);
  assert.deepEqual((await gacha(ana)).usuario.kick, { login: 'ana_kick' });

  for (let i = 0; i < 2; i++) {
    await control('sesion', { login: 'gokudo_zoku' });
    const r = await accion('kickCanal');
    assert.equal((await navegador().ir(new URL(r.url, urlWeb).toString())).status, 200);
  }
  const k = await estadoKick();
  assert.deepEqual(k.suscripciones.map(s => s.event).sort(), ['channel.followed', 'channel.reward.redemption.updated', 'channel.subscription.gifts',
    'channel.subscription.new', 'channel.subscription.renewal', 'chat.message.sent', 'kicks.gifted', 'livestream.status.updated']);
  assert.ok(k.suscripciones.every(s => s.method === 'webhook' && s.version === 1 && s.broadcaster_user_id === 5001));
  const ev = (await accion('gachaEstado')).gacha.kick.eventos;
  assert.equal(ev.suscritos.length, 8);
  assert.equal(ev.total, 8);
  assert.equal(ev.error, null);
});

test('un aviso sin firma o con la firma mal se rechaza y no da nada', async () => {
  const antes = await sobresDe(ana);
  const r = await aviso('channel.subscription.new', { subscriber: ANA, duration: 1 }, { firmaMala: true });
  assert.equal(r.estado, 401);
  const sinFirma = await fetch(`${urlWeb}/webhooks/kick`, { method: 'POST', body: '{}', headers: { 'Kick-Event-Type': 'channel.subscription.new' } });
  assert.equal(sinFirma.status, 401);
  await esperar(200);
  assert.equal(await sobresDe(ana), antes);
});

test('una sub nueva da 3 sobres a la cuenta vinculada y su alerta; el mismo aviso otra vez no da nada más', async () => {
  const antes = await sobresDe(ana);
  const r = await aviso('channel.subscription.new', { subscriber: ANA, duration: 1, created_at: new Date().toISOString() });
  assert.equal(r.estado, 200);
  assert.equal(await hasta(async () => (await sobresDe(ana)) === antes + 3), true);
  const otra = await control('evento', { id: r.id, tipo: 'channel.subscription.new', datos: { broadcaster: CANAL, subscriber: ANA, duration: 1 } });
  assert.equal(otra.estado, 200);
  assert.equal(otra.cuerpo.repetido, true);
  await esperar(200);
  assert.equal(await sobresDe(ana), antes + 3);
  const a = await hasta(() => alertas.find(x => x.alerta.tipo === 'sub'));
  assert.deepEqual([a.alerta.nombre, a.alerta.sobres, a.alerta.meses], ['ana_kick', 3, 1]);
  const m = await enChat(/ana_kick bebe del sakazuki/);
  assert.match(m.content, /\+3 sobres del gachapon\.$/, 'Ana ya ha vinculado su Kick: no se le dice que lo vincule');
  assert.equal(m.type, 'bot');
  assert.equal(m.de, 'Gokudo_zoku');
  assert.equal(otros.filter(x => x.tipo === 'estado' || x.tipo === 'partida').length, 0, 'la fuente de alertas no recibe el estado del draft');
});

test('una renovación da 2 sobres y su alerta dice los meses', async () => {
  const antes = await sobresDe(ana);
  await aviso('channel.subscription.renewal', { subscriber: ANA, duration: 6 });
  assert.equal(await hasta(async () => (await sobresDe(ana)) === antes + 2), true);
  const a = await hasta(() => alertas.find(x => x.alerta.tipo === 'renovacion'));
  assert.equal(a.alerta.meses, 6);
  assert.ok(await enChat(/ana_kick renueva el sakazuki: 6 meses en la familia\. \+2 sobres/));
});

test('subs regaladas: 2 sobres por sub a quien regala (aunque no haya vinculado) y 1 a cada una que la recibe; si es anónimo, solo a quien recibe', async () => {
  const antes = await sobresDe(ana);
  await aviso('channel.subscription.gifts', { gifter: BETO, giftees: [ANA, CARLA] });
  assert.equal(await hasta(async () => (await sobresDe(ana)) === antes + 1), true);
  const r = await hasta(async () => {
    const reg = await registro();
    return reg.some(e => e.id === 'kick-6002') && reg.some(e => e.id === 'kick-6003') ? reg : null;
  });
  const de = id => r.filter(e => e.id === id && e.tipo === 'apoyo').reduce((s, e) => s + e.cantidad, 0);
  assert.equal(de('kick-6002'), 4, 'Beto regaló 2: 4 sobres guardados a su Kick');
  assert.equal(de('kick-6003'), 1);
  assert.equal(r.find(e => e.id === 'kick-6002').usuario, 'Beto_K');
  const a = await hasta(() => alertas.find(x => x.alerta.tipo === 'regalo'));
  assert.deepEqual([a.alerta.nombre, a.alerta.cantidad, a.alerta.sobres], ['Beto_K', 2, 4]);
  assert.match((await enChat(/Beto_K regala 2 subs/)).content, /\+4 sobres del gachapon para Beto_K y 1 para cada kobun nuevo\. Vincula tu Kick en http/);

  await aviso('channel.subscription.gifts', { gifter: { is_anonymous: true, user_id: null, username: null }, giftees: [ANA] });
  assert.equal(await hasta(async () => (await sobresDe(ana)) === antes + 2), true);
  const anon = await hasta(() => alertas.find(x => x.alerta.tipo === 'regalo' && x.alerta.nombre === 'Anónimo'));
  assert.equal(anon.alerta.sobres, 0);
  assert.ok(await enChat(/Alguien regala 1 sub: 1 sobre/));
});

test('kicks: 1 sobre por cada 100 (redondeando hacia abajo); con menos de 100 solo sale la alerta', async () => {
  const antes = await sobresDe(ana);
  await aviso('kicks.gifted', { sender: ANA, gift: { amount: 250, name: 'Rage Quit', type: 'LEVEL_UP', tier: 'MID', message: 'vamos', pinned_time_seconds: 600 }, created_at: new Date().toISOString() });
  assert.equal(await hasta(async () => (await sobresDe(ana)) === antes + 2), true);
  await aviso('kicks.gifted', { sender: ANA, gift: { amount: 50, name: 'Hype', message: '' } });
  const a = await hasta(() => alertas.find(x => x.alerta.tipo === 'kicks' && x.alerta.cantidad === 50));
  assert.equal(a.alerta.sobres, 0);
  await esperar(150);
  assert.equal(await sobresDe(ana), antes + 2);
  assert.equal(alertas.find(x => x.alerta.cantidad === 250).alerta.mensaje, 'vamos');
  assert.ok(await enChat(/ana_kick manda 250 kicks: \+2 sobres/));
  assert.ok(await enChat(/ana_kick manda 50 kicks\. ¡Gracias por el tributo!/));
});

test('un seguidor nuevo sale como alerta y no da sobres ni se anuncia en el chat', async () => {
  const antes = await sobresDe(ana), n = (await estadoKick()).chat.length;
  await aviso('channel.followed', { follower: ANA });
  const a = await hasta(() => alertas.find(x => x.alerta.tipo === 'seguidor'));
  assert.equal(a.alerta.nombre, 'ana_kick');
  assert.equal(await sobresDe(ana), antes);
  await esperar(150);
  assert.equal((await estadoKick()).chat.length, n);
});

test('los avisos de otro canal no hacen nada', async () => {
  const antes = await sobresDe(ana);
  await control('evento', { tipo: 'channel.subscription.new', datos: { broadcaster: persona(9999, 'otro'), subscriber: ANA, duration: 1 } });
  await esperar(250);
  assert.equal(await sobresDe(ana), antes);
});

test('la web no pregunta a Kick por su cuenta: un canje sin aviso espera pendiente hasta el primer aviso de un Omamori', async () => {
  const antes = await sobresDe(ana);
  const llamadas = (await estadoKick()).llamadas.length;
  const [perdido] = (await control('canje', { login: 'ana' })).ids;   // canjeado sin que llegue aviso (la web dormida)
  await gacha(ana);   // entrar en el gachapon tampoco pregunta a Kick
  await esperar(300);
  assert.equal(await sobresDe(ana), antes);
  assert.deepEqual((await estadoKick()).llamadas.slice(llamadas).filter(l => l.includes('/public/v1/')), [], 'ninguna llamada a Kick');

  const r = await control('canje-avisado', { login: 'ana' });
  assert.equal(r.estado, 200);
  // El suyo y, como es el primer Omamori desde que arrancó la web, también el que esperaba
  assert.equal(await hasta(async () => (await sobresDe(ana)) === antes + 2), true);
  assert.equal(await hasta(async () => (await estadoKick()).canjes.filter(c => [r.canje, perdido].includes(c.id)).every(c => c.status === 'accepted')), true);
  assert.match((await enChat(/お守り ana_kick canjea un Omamori/)).content, /\+1 sobre del gachapon\./);
});

test('si Kick falla al aceptar, el canje queda sin resolver y se arregla con el siguiente Omamori, sin dar el sobre dos veces', async () => {
  const antes = await sobresDe(ana);
  await control('fallar-aceptar', { veces: 1 });
  const a = await control('canje-avisado', { login: 'ana' });
  assert.equal(await hasta(async () => (await accion('gachaEstado')).gacha.kick.canjesSinResolver), true);
  assert.equal(await sobresDe(ana), antes + 1, 'el sobre ya está dado');
  assert.equal((await estadoKick()).canjes.find(c => c.id === a.canje).status, 'pending');

  const b = await control('canje-avisado', { login: 'ana' });
  assert.equal(await hasta(async () => (await estadoKick()).canjes.filter(c => [a.canje, b.canje].includes(c.id)).every(c => c.status === 'accepted')), true);
  assert.equal(await sobresDe(ana), antes + 2);
  assert.equal(await hasta(async () => !(await accion('gachaEstado')).gacha.kick.canjesSinResolver), true);
});

test('«Recoger canjes pendientes» del panel los recoge a mano', async () => {
  const antes = await sobresDe(ana);
  await control('canje', { login: 'ana', veces: 2 });
  await accion('gachaSondear');
  assert.equal(await sobresDe(ana), antes + 2);
  assert.ok((await accion('gachaEstado')).gacha.kick.ultimaRecogida);
});

test('al empezar el directo se avisa en Discord con @everyone, una sola vez por directo', async () => {
  const datos = { is_live: true, title: 'Jornada 1 · *Tsuki* contra Yasha', started_at: '2026-11-15T17:00:00+01:00', ended_at: null };
  await aviso('livestream.status.updated', datos);
  const m = await hasta(() => discord.estado.mensajes.find(x => x.canal === 'directos'));
  assert.ok(m, 'llega al webhook de directos');
  assert.match(m.payload.content, /^@everyone /);
  assert.match(m.payload.content, /Jornada 1 · \\\*Tsuki\\\* contra Yasha/, 'el título va escapado');
  assert.match(m.payload.content, /https:\/\/kick\.com\/gokudo_zoku/);
  assert.deepEqual(m.payload.allowed_mentions, { parse: ['everyone'] });
  assert.equal(m.payload.embeds[0].title, datos.title);
  assert.equal(m.payload.embeds[0].url, 'https://kick.com/gokudo_zoku');
  await aviso('livestream.status.updated', datos);   // Kick lo vuelve a mandar (otro id, el mismo directo)
  await aviso('livestream.status.updated', { ...datos, is_live: false, ended_at: '2026-11-15T20:00:00+01:00' });
  await esperar(300);
  assert.equal(discord.estado.mensajes.filter(x => x.canal === 'directos').length, 1);
  assert.equal((await chatDesde(0)).filter(x => /Empieza el directo de Gokudō/.test(x.content)).length, 1, 'y una vez en el chat');
});

test('comandos del chat: contesta !sobres a quien lo pide (una vez cada 30 s), !clasificacion, !partido, !comandos y no se contesta a sí mismo', async () => {
  const n = (await estadoKick()).chat.length;
  const respuestas = async () => (await chatDesde(n)).filter(x => x.reply_to_message_id);
  await chat(ANA, '!sobres');
  const m = await hasta(async () => (await respuestas())[0]);
  assert.equal(m.type, 'bot');
  assert.ok(m.reply_to_message_id, 'contesta al mensaje');
  assert.match(m.content, /@ana_kick tienes \d+ sobres sin abrir y 0 cartas en el gachapon/);
  await chat(ANA, '!sobres');
  await esperar(250);
  assert.equal((await respuestas()).length, 1, 'no repite enseguida');

  await chat(BETO, '!SOBRES');
  assert.match((await hasta(async () => (await respuestas())[1])).content, /@Beto_K tienes 4 sobres esperándote: vincula tu Kick/);
  await chat(CARLA, '!clasificación');
  assert.match((await hasta(async () => (await respuestas())[2])).content, /aún no tiene puntos/);
  await chat(CARLA, '!partido');
  assert.match((await hasta(async () => (await respuestas())[3])).content, /Jornada 1|Ahora|Próximo|terminado/);
  await chat(CARLA, '!comandos');
  assert.equal((await hasta(async () => (await respuestas())[4])).content, 'Comandos de Gokudō: !sobres · !clasificacion · !gachapon · !partido');
  await chat(CANAL, '!gachapon');
  await chat(ANA, 'hola a todos');
  await esperar(250);
  assert.equal((await chatDesde(n)).length, 5);
});

test('con la cuenta del bot conectada, el bot escribe como GokudoBot en el canal; sin ella, otra vez como el canal', async () => {
  const conectarBot = async login => {
    await control('sesion', { login });
    const r = await accion('kickBot');
    assert.equal(r.ok, true, r.error);
    return navegador().ir(new URL(r.url, urlWeb).toString());
  };
  const mal = await conectarBot('gokudo_zoku');
  assert.equal(mal.status, 500);
  assert.match(await mal.text(), /Esa es la cuenta del canal/);

  const bien = await conectarBot('gokudobot');
  assert.equal(bien.status, 200);
  assert.match(await bien.text(), /como GokudoBot/);
  const b = (await accion('gachaEstado')).gacha.kick.bot;
  assert.deepEqual([b.conectado, b.login, b.escribeComo], [true, 'GokudoBot', 'GokudoBot']);

  let n = (await estadoKick()).chat.length;
  await chat(CARLA, '!gachapon');
  const m = await enChat(/Gachapon de Gokudō/, n);
  assert.deepEqual([m.de, m.type, m.canal], ['GokudoBot', 'user', 5001]);
  // Lo que escribe la cuenta del bot no lo contesta
  await chat(persona(5002, 'GokudoBot'), '!comandos');
  await esperar(250);
  assert.equal((await chatDesde(n)).length, 1);

  // Si Kick cierra la cuenta del bot, escribe el canal y el panel lo dice
  await control('revocar', { login: 'gokudobot' });
  n = (await estadoKick()).chat.length;
  await aviso('kicks.gifted', { sender: CARLA, gift: { amount: 100, name: 'Hype', message: '' } });
  const m2 = await enChat(/carla_k manda 100 kicks/, n);
  assert.deepEqual([m2.de, m2.type], ['Gokudo_zoku', 'bot']);
  assert.match((await accion('gachaEstado')).gacha.kick.bot.error, /vuelve a conectarla/);

  await conectarBot('gokudobot');
  const q = await accion('kickBotQuitar');
  assert.equal(q.gacha.kick.bot.conectado, false);
  assert.equal(q.gacha.kick.bot.escribeComo, 'Gokudo_zoku');
});

test('si Kick da de baja un aviso, «Volver a suscribir» lo recupera; si no lo acepta, el panel lo dice', async () => {
  await control('baja', { evento: 'chat.message.sent' });
  await control('rechazar', { eventos: ['chat.message.sent'] });
  let k = (await accion('kickAvisos')).gacha.kick.eventos;
  assert.equal(k.suscritos.length, 7);
  assert.match(k.error, /chat\.message\.sent/);
  await control('rechazar', { eventos: [] });
  k = (await accion('kickAvisos')).gacha.kick.eventos;
  assert.equal(k.suscritos.length, 8);
  assert.equal(k.error, null);
  assert.ok(k.ultimo, 'apunta cuándo llegó el último aviso');
});

test('«Probar alerta» del panel manda una alerta de mentira a la fuente de OBS', async () => {
  const n = alertas.length;
  const r = await accion('kickAlertaPrueba', { tipo: 'kicks' });
  assert.equal(r.ok, true);
  const a = await hasta(() => alertas[n]);
  assert.equal(a.alerta.tipo, 'kicks');
  assert.equal(a.alerta.prueba, true);
});

// ---------- los comandos, sin web ----------
test('comandoDe reconoce los comandos con tildes, mayúsculas y alias, y nada más', () => {
  assert.equal(comandoDe('!Sobres'), 'sobres');
  assert.equal(comandoDe('  !clasificación por favor'), 'clasificacion');
  assert.equal(comandoDe('!omamori'), 'gachapon');
  assert.equal(comandoDe('!próximo'), 'partido');
  assert.equal(comandoDe('!ayuda'), 'comandos');
  assert.equal(comandoDe('!ban pepe'), null);
  assert.equal(comandoDe('hola !sobres'), null);
});

test('!clasificacion: los 3 primeros y el puesto de quien pregunta si ha vinculado su Kick', () => {
  const ctx = { web: 'https://w', cuenta: id => (id === 1 ? { vinculada: true, id: 'discord-1' } : { vinculada: false, sobres: 0 }),
    clasificacion: () => [{ puesto: 1, nombre: 'A', puntos: 30 }, { puesto: 2, nombre: 'B', puntos: 20 }, { puesto: 3, nombre: 'C', puntos: 10 }, { puesto: 4, nombre: 'D', puntos: 5 }],
    puesto: () => 4 };
  assert.equal(responderComando('clasificacion', { user_id: 1, username: 'd' }, ctx), 'Fantasy de Gokudō: 1.º A (30) · 2.º B (20) · 3.º C (10) · @d vas 4.º');
  assert.equal(responderComando('clasificacion', { user_id: 2, username: 'x' }, ctx), 'Fantasy de Gokudō: 1.º A (30) · 2.º B (20) · 3.º C (10)');
  assert.match(responderComando('gachapon', { user_id: 2, username: 'x' }, { ...ctx, coste: 3000 }), /https:\/\/w\/gachapon\/ .*Omamori \(3000 puntos\)/);
});

test('!partido: el siguiente cruce con su hora de España, el que se está jugando y sin calendario', () => {
  const formato = { liguilla: [{ jornada: 1, nombre: 'Jornada 1', fecha: '2026-11-15' }, { jornada: 2, nombre: 'Jornada 2', fecha: '2026-11-22' }],
    playoffs: [{ ronda: 'final', nombre: 'Final', fecha: '2026-12-27' }], hora: '17:00', margen: 45 };
  const calendario = { jornadas: [[{ azul: 'SARU', rojo: 'KAIJU' }, { azul: 'TORA', rojo: 'BUSHI' }, { azul: 'ATSUI', rojo: 'KEMONO' }], [{ azul: 'SARU', rojo: 'TORA' }]] };
  const nombre = id => ({ SARU: 'Tsuki', KAIJU: 'Yasha', TORA: 'Byakko', BUSHI: 'Akuma', ATSUI: 'Ryūjin', KEMONO: 'Tengu' })[id];
  const antes = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(textoPartido({ formato, calendario, nombre }, antes), 'Próximo partido de Gokudō · Tsuki contra Yasha: Jornada 1, domingo 15/11 a las 17:00 (hora de España)');
  const durante = horaEspana('2026-11-15', '17:50').getTime();
  assert.equal(textoPartido({ formato, calendario, nombre }, durante), 'Ahora: Byakko contra Akuma (Jornada 1) · Después: Ryūjin contra Tengu: Jornada 1, domingo 15/11 a las 18:30 (hora de España)');
  assert.equal(textoPartido({ formato, calendario: null, nombre }, antes), 'Próximo partido de Gokudō · Jornada 1, domingo 15/11 a las 17:00 (hora de España). Los cruces salen en el sorteo del calendario');
  assert.match(textoPartido({ formato, calendario, nombre }, Date.parse('2026-12-01T00:00:00Z')), /Final, domingo 27\/12 a las 17:00/);
  assert.equal(textoPartido({ formato, calendario, nombre }, Date.parse('2027-01-01T00:00:00Z')), 'La temporada de Gokudō ha terminado: ¡gracias por verla!');
});
