// !pregunta en los chats de Kick y Twitch (server/preguntas-chat.js) y el bot del chat de Twitch (server/twitch-chat.js),
// con un Claude falso, un contexto falso, un WebSocket de EventSub falso y una API de Twitch falsa
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { crearPreguntasChat, preguntaDe, MAX_CHAT } from '../server/preguntas-chat.js';
import { crearChatTwitch, textoChatTwitch } from '../server/twitch-chat.js';

const SABER = '## Qué es Gokudō <!-- nucleo -->\nUna liga de LoL.\n\n## Gachapon <!-- gachapon -->\nCada tirada da cuatro cartas.\n';
function claudeFalso(texto = 'Ryūjin juega el domingo a las **17:00**, máquina.\nVamos.') {
  const peticiones = [];
  return { peticiones, messages: { create: async p => { peticiones.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: texto }] }; } } };
}
const silencio = { log() {}, error() {} };

test('preguntaDe: !pregunta y sus alias, y nada más', () => {
  assert.equal(preguntaDe('!pregunta ¿cuándo juega Ryūjin?'), '¿cuándo juega Ryūjin?');
  assert.equal(preguntaDe('!P  hola'), 'hola');
  assert.equal(preguntaDe('!srdirector'), '');
  assert.equal(preguntaDe('!partido'), null);
  assert.equal(preguntaDe('¿!pregunta?'), null);
});

test('contesta en una línea, con la mención, los trozos del contexto y el papel en la caché', async () => {
  const claude = claudeFalso();
  const buscados = [];
  const buscador = { activo: () => true, buscar: async (p, o) => { buscados.push([p, o.k]); return [{ titulo: 'Plantilla de la familia Ryūjin', texto: 'Top: GAATSU.' }]; } };
  const chat = crearPreguntasChat({ cliente: claude, buscador, saber: () => SABER, log: silencio });
  const r = await chat.responder({ pregunta: '¿cuándo juega Ryūjin?', plataforma: 'twitch', quien: { id: '1', nombre: 'ana' } });
  assert.equal(r, '@ana Ryūjin juega el domingo a las 17:00, máquina. Vamos.', 'sin markdown ni saltos de línea');
  assert.deepEqual(buscados, [['¿cuándo juega Ryūjin?', 5]]);
  const p = claude.peticiones[0];
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.match(p.system[0].text, /Una liga de LoL\./, 'el núcleo de la ficha va en el papel');
  assert.match(p.system[0].text, /NO debe decir nunca/);
  assert.match(p.messages[0].content, /<contexto>\n### Plantilla de la familia Ryūjin\nTop: GAATSU\.\n<\/contexto>/);
  assert.match(p.messages[0].content, /en el chat de Twitch\./);
  assert.match(p.system[0].text, /Don Paco/);
  // Si su nombre es el de alguien con ficha, le llega el tono que pidió
  const conFicha = crearPreguntasChat({ cliente: claude, saber: () => SABER, log: silencio,
    fichas: () => '## JLEGEND · Jungla · Yasha\n- **¿Cómo se le llama en la comunidad?:** JLEGEND\n- **Tono con esta persona:** Serio\n' });
  await conFicha.responder({ pregunta: 'hola', plataforma: 'kick', quien: { id: '7', nombre: 'jlegend' } });
  assert.match(claude.peticiones.at(-1).messages[0].content, /en el chat de Kick \(según su ficha es JLEGEND; tono con esta persona: Serio\)\./);
  assert.ok(p.max_tokens <= 400);
  assert.ok(MAX_CHAT < 500);
});

test('sin contexto (no hay base o ha fallado), van las ramas de la ficha; y lo largo se corta a 500', async () => {
  const claude = claudeFalso('x'.repeat(700));
  const chat = crearPreguntasChat({ cliente: claude, buscador: { activo: () => true, buscar: async () => null }, saber: () => SABER, log: silencio });
  const r = await chat.responder({ pregunta: '¿cuántas cartas da una tirada del gachapon?', plataforma: 'kick', quien: { id: '1', nombre: 'ana' } });
  assert.match(claude.peticiones[0].messages[0].content, /<contexto>\n## Gachapon\nCada tirada da cuatro cartas\./);
  assert.equal([...r].length, 500);
});

test('topes: una pregunta por minuto y persona (calla), 5 al día por persona y 100 al día entre los dos chats', async () => {
  let t = new Date('2026-11-23T18:00:00Z');
  const chat = crearPreguntasChat({ cliente: claudeFalso('Vale.'), saber: () => SABER, ahora: () => t, topeDia: 7, log: silencio });
  const preguntar = (id, plataforma = 'kick') => chat.responder({ pregunta: 'hola', plataforma, quien: { id, nombre: `u${id}` } });
  assert.equal(await preguntar('1'), '@u1 Vale.');
  assert.equal(await preguntar('1'), null, 'antes de un minuto, calla');
  for (let i = 0; i < 4; i++) { t = new Date(t.getTime() + 61_000); assert.equal(await preguntar('1'), '@u1 Vale.'); }
  t = new Date(t.getTime() + 61_000);
  assert.match(await preguntar('1'), /ya me has preguntado 5 veces/);
  assert.equal(await preguntar('1', 'twitch'), '@u1 Vale.', 'en Twitch es otra persona');
  assert.equal(await preguntar('2', 'twitch'), '@u2 Vale.');
  assert.match(await preguntar('3'), /por hoy ya he contestado todo/, 'el tope del día es de los dos chats juntos');
  assert.equal(chat.estado().hoy, 7);
  assert.match(await preguntar('4', 'twitch').then(() => chat.responder({ pregunta: '', plataforma: 'kick', quien: { id: '9', nombre: 'u9' } })), /!pregunta ¿cuándo juega Ryūjin\?/);
});

test('sin ANTHROPIC_API_KEY no contesta; si la IA falla, lo dice y manda al Discord', async () => {
  assert.equal(await crearPreguntasChat({ cliente: null }).responder({ pregunta: 'hola', plataforma: 'kick', quien: { id: '1', nombre: 'a' } }), null);
  const roto = { messages: { create: async () => { throw new Error('529'); } } };
  const r = await crearPreguntasChat({ cliente: roto, saber: () => SABER, log: silencio }).responder({ pregunta: 'hola', plataforma: 'kick', quien: { id: '1', nombre: 'a' } });
  assert.match(r, /^@a ahora mismo no puedo contestar.*#tickets/);
});

// ---------- el bot del chat de Twitch ----------
function socketFalso() {
  const s = new EventEmitter();
  s.cerrado = false;
  s.close = () => { if (!s.cerrado) { s.cerrado = true; s.emit('close'); } };
  s.recibir = m => s.emit('message', Buffer.from(JSON.stringify(m)));
  return s;
}
const bienvenida = (id, url) => ({ metadata: { message_type: url ? 'session_reconnect' : 'session_welcome' }, payload: { session: { id, keepalive_timeout_seconds: 10, reconnect_url: url } } });
const mensaje = (texto, de = { id: '50', nombre: 'Ana' }) => ({ metadata: { message_type: 'notification' }, payload: { subscription: { type: 'channel.chat.message' },
  event: { chatter_user_id: de.id, chatter_user_name: de.nombre, chatter_user_login: de.nombre.toLowerCase(), message_id: `m-${texto.length}`, message: { text: texto } } } });

function montarTwitch({ fallarSuscripcion = false } = {}) {
  const sockets = [], llamadas = [], preguntas = [];
  const helix = async (ruta, { token, method, body }) => {
    llamadas.push({ ruta, token, method, body });
    if (ruta === 'eventsub/subscriptions' && fallarSuscripcion) throw Object.assign(new Error('Forbidden'), { estado: 403 });
    return {};
  };
  const chat = crearChatTwitch({ helix, conToken: fn => fn('token-del-canal'), canal: () => '99', activo: () => true, respiroMs: 0, reintentoMs: 10, log: silencio,
    crearSocket: url => { const s = socketFalso(); s.url = url; sockets.push(s); return s; },
    preguntar: async x => { preguntas.push(x); return `@${x.quien.nombre} respuesta`; } });
  return { chat, sockets, llamadas, preguntas };
}
const hasta = async (fn, ms = 1000) => { const fin = Date.now() + ms; while (!fn() && Date.now() < fin) await new Promise(r => setTimeout(r, 5)); return fn(); };

test('Twitch: al conectar se suscribe al chat de su canal; contesta a !pregunta respondiendo al mensaje, y no a sí mismo', async () => {
  const { chat, sockets, llamadas, preguntas } = montarTwitch();
  assert.equal(chat.arrancar(), true);
  assert.equal(sockets[0].url, 'wss://eventsub.wss.twitch.tv/ws');
  sockets[0].recibir(bienvenida('sesion-1'));
  await hasta(() => llamadas.length);
  assert.deepEqual(llamadas[0], { ruta: 'eventsub/subscriptions', token: 'token-del-canal', method: 'POST', body: { type: 'channel.chat.message', version: '1',
    condition: { broadcaster_user_id: '99', user_id: '99' }, transport: { method: 'websocket', session_id: 'sesion-1' } } });
  assert.equal(chat.estado().suscrito, true);
  sockets[0].recibir(mensaje('hola a todos'));
  sockets[0].recibir(mensaje('!pregunta ¿quién es GAATSU?'));
  sockets[0].recibir(mensaje('!pregunta me contesto a mí mismo', { id: '99', nombre: 'gokudo_zoku' }));
  await hasta(() => llamadas.length >= 2);
  await chat.esperar();
  assert.deepEqual(preguntas, [{ pregunta: '¿quién es GAATSU?', plataforma: 'twitch', quien: { id: '50', nombre: 'Ana' } }]);
  assert.deepEqual(llamadas[1], { ruta: 'chat/messages', token: 'token-del-canal', method: 'POST',
    body: { broadcaster_id: '99', sender_id: '99', message: '@Ana respuesta', reply_parent_message_id: 'm-27' } });
  assert.equal(llamadas.length, 2);
  chat.parar();
});

test('Twitch: session_reconnect se pasa a la dirección nueva sin volver a suscribirse; si se cae, vuelve a conectar', async () => {
  const { chat, sockets, llamadas } = montarTwitch();
  chat.arrancar();
  sockets[0].recibir(bienvenida('s1'));
  await hasta(() => llamadas.length);
  sockets[0].recibir(bienvenida('s1', 'wss://otra/ws'));
  assert.equal(sockets[1].url, 'wss://otra/ws');
  sockets[1].recibir(bienvenida('s2'));
  assert.equal(sockets[0].cerrado, true, 'la vieja se cierra');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(llamadas.length, 1, 'las suscripciones siguen en la sesión nueva');
  assert.equal(chat.estado().conectado, true);
  sockets[1].close();   // se cae: vuelve a conectar a la dirección de siempre y se suscribe otra vez
  await hasta(() => sockets.length === 3);
  assert.equal(sockets[2].url, 'wss://eventsub.wss.twitch.tv/ws');
  sockets[2].recibir(bienvenida('s3'));
  await hasta(() => llamadas.length === 2);
  assert.equal(llamadas[1].body.transport.session_id, 's3');
  chat.parar();
  assert.equal(chat.estado().conectado, false);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(sockets.length, 3, 'parado, ya no vuelve a conectar');
});

test('Twitch: sin permiso de chat lo dice para el panel', async () => {
  const { chat, sockets } = montarTwitch({ fallarSuscripcion: true });
  chat.arrancar();
  sockets[0].recibir(bienvenida('s1'));
  await hasta(() => chat.estado().error);
  assert.match(chat.estado().error, /Volver a conectar el canal/);
  chat.parar();
  assert.match(textoChatTwitch({ conectado: true, chat: false }, {}, true), /necesita permiso nuevo/);
  assert.match(textoChatTwitch({ conectado: true, chat: true }, { suscrito: true }, true), /escucha el chat/);
  assert.equal(textoChatTwitch({ conectado: false }, {}, true), '');
});
