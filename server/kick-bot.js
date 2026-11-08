// El bot de Gokudō en Kick: la app de Kick en modo webhook. Kick le manda los avisos a POST /webhooks/kick (la dirección
// que va en la app de kick.com/settings/developer con «Enable Webhooks») y el bot actúa por su cuenta. La web se suscribe
// a los avisos al conectar el canal (server/canal-kick.js) y NO pregunta nada a Kick cada cierto tiempo: solo llama a la
// API cuando llega un aviso (aceptar el canje, escribir en el chat, renovar el token). Lo pidió Pacopepe el 08/11/2026.
//   · channel.reward.redemption.updated → el sobre del Omamori, se acepta el canje y se anuncia en el chat
//   · livestream.status.updated         → al empezar el directo: aviso en Discord (@everyone) y en el chat, una vez
//   · channel.followed                  → alerta en el overlay de OBS (/alertas/), sin sobres ni anuncio
//   · channel.subscription.new/.renewal/.gifts y kicks.gifted → sobres (SOBRES_APOYO), alerta y anuncio en el chat
//   · chat.message.sent                 → los comandos del chat (server/comandos-kick.js)
// Cada aviso viene firmado (se comprueba con la clave pública de Kick), se atiende una sola vez (Kick-Event-Message-Id)
// y se contesta 200 al momento: lo demás se hace después. Si el webhook falla más de un día, Kick da de baja la suscripción.
//
// Quién escribe en el chat: si se conecta una cuenta de Kick aparte para el bot (p. ej. GokudoBot, «Conectar la cuenta
// del bot» en el panel), los mensajes salen con su nombre (tipo «user» en el canal de Gokudō); si no, salen como la
// cuenta del canal (tipo «bot», con el token del canal).
import { avisoDeKick, api, kickActivo, refrescarToken, slugDe, CANAL_KICK, ErrorKick } from './kick.js';
import { avisoRecibido, canjeAvisado, conToken, estadoCanalKick, idCanalKick, idKick } from './canal-kick.js';
import { cuentaDeKick, darSobres } from './gacha.js';
import { anunciarDirecto, directoDiscordActivo } from './discord.js';
import { ajuste, guardarAjustes } from './ajustes.js';
import { cifrar, descifrar } from './sesion.js';
import { comandoDe, esPersonal, responderComando, ESPERA_COMANDO_MS } from './comandos-kick.js';

// Tiradas (sobres, por dentro) por apoyar en Kick (las fijó Pacopepe el 08/11/2026). Van a la temporada del gachapon en curso, como los
// canjes: a la cuenta vinculada o, si aún no ha vinculado su Kick, guardados hasta que lo haga. Seguir al canal no da sobres
export const SOBRES_APOYO = { sub: 3, renovacion: 2, regalaPorSub: 2, recibeRegalo: 1, kicksPorSobre: 100 };

const MAXIMO_CUERPO = 256 * 1024;
const RECUERDO_MS = 24 * 3600e3;   // los ids de aviso se recuerdan un día (Kick reintenta como mucho durante un día)
const vistos = new Map();
function yaVisto(id) {
  const ahora = Date.now();
  if (vistos.size > 5000) for (const [k, t] of vistos) if (ahora - t > RECUERDO_MS || vistos.size > 4000) vistos.delete(k); else break;
  if (vistos.has(id)) return true;
  vistos.set(id, ahora);
  return false;
}

// Quien pinta las alertas (index.js las manda a las páginas /alertas/ abiertas en OBS)
let alertar = () => {};
export const alAlertar = fn => { alertar = fn; };

function leerCrudo(req) {
  return new Promise((ok, mal) => {
    const trozos = [];
    let total = 0;
    req.on('data', d => {
      total += d.length;
      if (total > MAXIMO_CUERPO) { mal(Object.assign(new Error('Aviso demasiado grande'), { estado: 413 })); req.destroy(); return; }
      trozos.push(d);
    });
    req.on('end', () => ok(Buffer.concat(trozos)));
    req.on('error', mal);
  });
}

// POST /webhooks/kick. Devuelve { estado, cuerpo } para contestar a Kick
export async function atenderWebhookKick(req, { web }) {
  if (!kickActivo()) return { estado: 503, cuerpo: { ok: false, error: 'Kick no está configurado en esta web' } };
  let cuerpo;
  try { cuerpo = await leerCrudo(req); } catch (e) { return { estado: e.estado || 400, cuerpo: { ok: false, error: e.message } }; }
  const h = req.headers;
  const aviso = { id: h['kick-event-message-id'], momento: h['kick-event-message-timestamp'], firma: h['kick-event-signature'], cuerpo };
  let valido;
  try { valido = await avisoDeKick(aviso); }
  catch (e) { console.error('Bot de Kick: no se pudo pedir la clave pública:', e.message); return { estado: 503, cuerpo: { ok: false } }; }
  if (!valido) return { estado: 401, cuerpo: { ok: false, error: 'Firma no válida' } };
  if (yaVisto(aviso.id)) return { estado: 200, cuerpo: { ok: true, repetido: true } };
  let datos;
  try { datos = JSON.parse(cuerpo.toString('utf8')); } catch { return { estado: 400, cuerpo: { ok: false, error: 'Aviso no válido' } }; }
  avisoRecibido();
  const tipo = String(h['kick-event-type'] || '');
  setImmediate(() => atenderEvento(tipo, datos, aviso.id, { web }).catch(e => console.error(`Bot de Kick, aviso ${tipo}:`, e.message)));
  return { estado: 200, cuerpo: { ok: true } };
}

// Dar sobres no puede perderse por un fallo pasajero (la hoja de Google que no responde): se reintenta tres veces.
// No se dan dos veces: el registro apunta el aviso que los dio
async function darConReintento(u, cantidad, detalle, intentos = 3) {
  for (let i = 1; ; i++) {
    try { return await darSobres(u, cantidad, 'apoyo', detalle); }
    catch (e) {
      if (i >= intentos) throw e;
      await new Promise(r => setTimeout(r, i * 20000).unref?.());
    }
  }
}
const persona = p => ({ id: idKick(p.user_id), nombre: p.username || `Kick ${p.user_id}` });
const conNombre = p => (p && !p.is_anonymous && p.user_id ? p : null);
// En la web y en el chat, cada sobre es una tirada de la tragaperras del gachapon (por dentro sigue siendo darSobres)
const tiradas = n => `+${n} ${n === 1 ? 'tirada' : 'tiradas'} en el gachapon`;
// A quien aún no ha vinculado su Kick, el anuncio le dice dónde hacerlo para recibir las tiradas
const vincula = (userId, web) => (cuentaDeKick(userId).vinculada ? '' : ` Vincula tu Kick en ${web}/gachapon/ para jugarlas.`);

export async function atenderEvento(tipo, d, idAviso, { web }) {
  const canal = idCanalKick();
  // Solo los avisos del canal de Gokudō (la suscripción es suya, pero por si acaso)
  if (!canal || (d?.broadcaster?.user_id !== undefined && String(d.broadcaster.user_id) !== String(canal))) return;

  if (tipo === 'channel.reward.redemption.updated') {
    const r = await canjeAvisado(d);
    if (r?.nuevo) anunciar(`お守り ${r.nombre} canjea un Omamori: ${tiradas(1)}.${vincula(r.quien, web)}`);
    return;
  }

  if (tipo === 'livestream.status.updated') {
    // La portada enseña el directo de Kick si lo hay: lo sabe por este aviso, sin preguntar a Kick (estadoDirectoKick)
    await guardarAjustes({ kick_en_directo: d.is_live ? '1' : '0', kick_titulo: d.is_live ? String(d.title || '') : '' });
    if (!d.is_live) return;
    const directo = d.started_at || idAviso;
    if (ajuste('kick_directo') === directo) return;   // ya avisado de este directo
    await guardarAjustes({ kick_directo: directo });
    anunciar(`¡Empieza el directo de Gokudō! Escribe !comandos para ver lo que hace el bot. Gachapon: ${web}/gachapon/`);
    if (directoDiscordActivo()) {
      await anunciarDirecto({ titulo: d.title, enlace: `https://kick.com/${d.broadcaster?.channel_slug || CANAL_KICK}`, avatar: `${web}/marca/gokudo.png` });
    }
    return;
  }

  if (tipo === 'channel.followed') {
    if (d.follower?.username) alertar({ tipo: 'seguidor', nombre: d.follower.username });
    return;
  }

  if (tipo === 'channel.subscription.new' || tipo === 'channel.subscription.renewal') {
    const s = conNombre(d.subscriber);
    if (!s) return;
    const nueva = tipo === 'channel.subscription.new', meses = Number(d.duration) || 1;
    const n = nueva ? SOBRES_APOYO.sub : SOBRES_APOYO.renovacion;
    alertar({ tipo: nueva ? 'sub' : 'renovacion', nombre: s.username, meses, sobres: n });
    await darConReintento(persona(s), n, `kk-${nueva ? 'sub' : 'renovacion'}:${idAviso}`);
    anunciar(nueva ? `盃 ¡${s.username} bebe del sakazuki y entra en la familia! ${tiradas(n)}.${vincula(s.user_id, web)}`
      : `盃 ${s.username} renueva el sakazuki: ${meses} ${meses === 1 ? 'mes' : 'meses'} en la familia. ${tiradas(n)}.${vincula(s.user_id, web)}`);
    return;
  }

  if (tipo === 'channel.subscription.gifts') {
    const giftees = (d.giftees || []).filter(g => g?.user_id);
    if (!giftees.length) return;
    const quien = conNombre(d.gifter);
    const n = quien ? giftees.length * SOBRES_APOYO.regalaPorSub : 0;
    alertar({ tipo: 'regalo', nombre: quien?.username || 'Anónimo', cantidad: giftees.length, sobres: n });
    if (quien) await darConReintento(persona(quien), n, `kk-regalo:${idAviso}`);
    for (const g of giftees) await darConReintento(persona(g), SOBRES_APOYO.recibeRegalo, `kk-regalado:${idAviso}:${g.user_id}`);
    const subs = `${giftees.length} ${giftees.length === 1 ? 'sub' : 'subs'}`;
    anunciar(quien ? `贈 ${quien.username} regala ${subs}: ${tiradas(n)} para ${quien.username} y 1 para cada kobun nuevo.${vincula(quien.user_id, web)}`
      : `贈 Alguien regala ${subs}: 1 tirada en el gachapon para cada kobun nuevo. Vincula tu Kick en ${web}/gachapon/ para jugarla.`);
    return;
  }

  if (tipo === 'kicks.gifted') {
    const s = conNombre(d.sender);
    const cantidad = Math.max(0, Math.floor(Number(d.gift?.amount) || 0));
    if (!s || !cantidad) return;
    const n = Math.floor(cantidad / SOBRES_APOYO.kicksPorSobre);
    alertar({ tipo: 'kicks', nombre: s.username, cantidad, regalo: d.gift?.name || '', mensaje: d.gift?.message || '', sobres: n });
    if (n) await darConReintento(persona(s), n, `kk-kicks:${idAviso}`);
    anunciar(n ? `蹴 ${s.username} manda ${cantidad} kicks: ${tiradas(n)}.${vincula(s.user_id, web)}`
      : `蹴 ${s.username} manda ${cantidad} kicks. ¡Gracias por el tributo! (cada ${SOBRES_APOYO.kicksPorSobre} kicks, una tirada)`);
    return;
  }

  if (tipo === 'chat.message.sent') return atenderChat(d, { web });
}

// ---------- quién escribe en el chat ----------
// La cuenta del bot (opcional): tokens cifrados en los ajustes, como los del canal. Solo necesita user:read y chat:write
export const SCOPE_BOT_KICK = 'user:read chat:write';
let tokensBot = null;
const bot = { conectado: false, login: null, id: null, error: null, ultimoMensaje: null, errorChat: null };

export function cargarBotKick() {
  const guardados = ajuste('kick_bot_tokens');
  if (!guardados || !kickActivo()) return;
  try { tokensBot = JSON.parse(descifrar(guardados)); }
  catch { bot.error = 'No se pudo leer la cuenta del bot de Kick: vuelve a conectarla desde el panel'; return; }
  Object.assign(bot, { conectado: true, login: ajuste('kick_bot_login'), id: ajuste('kick_bot_id') });
}

// u: { user_id, name } de la cuenta que ha autorizado. La del canal no hace falta: sin bot, ya escribe ella
export async function conectarBotKick(t, u) {
  if (slugDe(u.name) === CANAL_KICK) throw new Error(`Esa es la cuenta del canal (kick.com/${CANAL_KICK}): sin cuenta de bot, el bot ya escribe con ella. Entra en Kick con la cuenta del bot (por ejemplo GokudoBot)`);
  tokensBot = { access_token: t.access_token, refresh_token: t.refresh_token };
  await guardarAjustes({ kick_bot_tokens: cifrar(JSON.stringify(tokensBot)), kick_bot_id: String(u.user_id), kick_bot_login: u.name });
  Object.assign(bot, { conectado: true, login: u.name, id: String(u.user_id), error: null });
}

export async function quitarBotKick() {
  tokensBot = null;
  await guardarAjustes({ kick_bot_tokens: null, kick_bot_id: null, kick_bot_login: null });
  Object.assign(bot, { conectado: false, login: null, id: null, error: null });
}

async function conTokenBot(fn) {
  try { return await fn(tokensBot.access_token); }
  catch (e) {
    if (!(e instanceof ErrorKick) || e.estado !== 401) throw e;
    try {
      const nuevos = await refrescarToken(tokensBot.refresh_token);
      tokensBot = { access_token: nuevos.access_token, refresh_token: nuevos.refresh_token || tokensBot.refresh_token };
      await guardarAjustes({ kick_bot_tokens: cifrar(JSON.stringify(tokensBot)) });
    } catch (e2) {
      tokensBot = null;
      Object.assign(bot, { conectado: false, error: 'Kick ha cerrado la conexión de la cuenta del bot: vuelve a conectarla desde el panel. Mientras, escribe la cuenta del canal' });
      throw e2;
    }
    return fn(tokensBot.access_token);
  }
}

// Un mensaje en el chat del canal (Kick admite 500 letras). Con cuenta de bot, como ella; si no (o si se ha caído), como el canal
async function escribir(content, responderA = null) {
  const texto = [...String(content)].length > 500 ? `${[...String(content)].slice(0, 499).join('')}…` : String(content);
  const extra = responderA ? { reply_to_message_id: responderA } : {};
  if (tokensBot) {
    try {
      return await conTokenBot(tk => api('chat', { token: tk, method: 'POST', body: { type: 'user', broadcaster_user_id: Number(idCanalKick()), content: texto, ...extra } }));
    } catch (e) {
      if (tokensBot) throw e;   // falla el mensaje, pero la cuenta sigue conectada
    }
  }
  return conToken(tk => api('chat', { token: tk, method: 'POST', body: { type: 'bot', content: texto, ...extra } }));
}

// Los mensajes salen de uno en uno, con un respiro entre ellos para no chocar con el tope de Kick. Si se acumulan
// muchos (una lluvia de regalos), se descartan los anuncios más viejos; las respuestas a comandos se quedan
const cola = [];
let escribiendo = false;
const RESPIRO_MS = Number(process.env.KICK_BOT_RESPIRO_MS ?? 1200);
function encolar(texto, responderA) {
  if (cola.length >= 20) { const i = cola.findIndex(m => !m.responderA); cola.splice(i >= 0 ? i : 0, 1); }
  cola.push({ texto, responderA });
  vaciar();
}
async function vaciar() {
  if (escribiendo) return;
  escribiendo = true;
  try {
    while (cola.length) {
      const m = cola.shift();
      try { await escribir(m.texto, m.responderA); Object.assign(bot, { ultimoMensaje: new Date().toISOString(), errorChat: null }); }
      catch (e) { bot.errorChat = `No se pudo escribir en el chat de Kick: ${e.message}`; console.error('Bot de Kick:', e.message); }
      if (cola.length) await new Promise(r => setTimeout(r, RESPIRO_MS));
    }
  } finally {
    escribiendo = false;
  }
}
const anunciar = texto => { if (estadoCanalKick().conectado) encolar(texto, null); };

// ---------- comandos del chat ----------
const ultimos = new Map();   // comando (o comando y persona) → cuándo se contestó
let contexto = null;
// index.js dice de dónde sale lo que contestan los comandos (fantasy, calendario…): así este archivo no depende de todo
export const contextoComandos = fn => { contexto = fn; };

async function atenderChat(d, { web }) {
  const quien = d.sender;
  // El bot no se contesta a sí mismo, ni a la cuenta del canal ni a la del bot
  if (!quien?.user_id || [idCanalKick(), bot.id].includes(String(quien.user_id))) return;
  const comando = comandoDe(d.content);
  if (!comando) return;
  const clave = esPersonal(comando) ? `${comando}:${quien.user_id}` : comando;
  const espera = esPersonal(comando) ? ESPERA_COMANDO_MS.personal : ESPERA_COMANDO_MS.general;
  if (Date.now() - (ultimos.get(clave) || 0) < espera) return;
  ultimos.set(clave, Date.now());
  if (ultimos.size > 2000) ultimos.clear();
  const ctx = { web, coste: estadoCanalKick().coste, cuenta: cuentaDeKick, clasificacion: () => [], puesto: () => null,
    partido: () => 'El calendario aún no está listo.', ...(contexto?.() || {}) };
  const texto = responderComando(comando, quien, ctx);
  if (texto) encolar(texto, d.message_id);
}

// ¿Está el canal en directo en Kick? Lo apunta el aviso livestream.status.updated (si nunca ha llegado, no)
export const estadoDirectoKick = () => ({ enDirecto: ajuste('kick_en_directo') === '1', titulo: ajuste('kick_titulo') || '' });

export const estadoBotKick = () => ({ ...bot, escribeComo: bot.conectado ? bot.login : estadoCanalKick().login });

// ---------- prueba desde el panel ----------
// Una alerta de mentira para colocar la fuente de OBS sin esperar a que alguien se suscriba
const PRUEBAS = [
  { tipo: 'seguidor', nombre: 'Kobun_de_prueba' },
  { tipo: 'sub', nombre: 'Kobun_de_prueba', meses: 1, sobres: SOBRES_APOYO.sub },
  { tipo: 'renovacion', nombre: 'Kobun_de_prueba', meses: 6, sobres: SOBRES_APOYO.renovacion },
  { tipo: 'regalo', nombre: 'Oyabun_de_prueba', cantidad: 5, sobres: 5 * SOBRES_APOYO.regalaPorSub },
  { tipo: 'kicks', nombre: 'Kobun_de_prueba', cantidad: 500, regalo: 'Rage Quit', mensaje: '¡Vamos, familia!', sobres: 5 },
];
let siguientePrueba = 0;
export function alertaDePrueba(tipo) {
  const a = PRUEBAS.find(p => p.tipo === tipo) || PRUEBAS[siguientePrueba++ % PRUEBAS.length];
  alertar({ ...a, prueba: true });
  return a;
}
