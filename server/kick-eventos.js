// Avisos de Kick (webhooks): Kick los manda a POST /webhooks/kick, la dirección que se pone en la app de
// kick.com/settings/developer con «Enable Webhooks». La web se suscribe a ellos al conectar el canal (server/canal-kick.js).
//   · channel.reward.redemption.updated → el sobre del Omamori al momento (la consulta de cada minuto queda de respaldo)
//   · livestream.status.updated         → aviso en Discord de que empieza el directo, una vez por directo
//   · channel.followed                  → alerta en el overlay de OBS (/alertas/), sin sobres
//   · channel.subscription.new/.renewal/.gifts y kicks.gifted → alerta y sobres para la cuenta vinculada (SOBRES_APOYO)
//   · chat.message.sent                 → los comandos del chat (server/comandos-kick.js)
// Cada aviso viene firmado (se comprueba con la clave pública de Kick), se atiende una sola vez (Kick-Event-Message-Id)
// y se contesta 200 al momento: lo demás se hace después. Si el webhook falla más de un día, Kick da de baja la suscripción.
import { avisoDeKick, escribirEnChat, kickActivo, CANAL_KICK } from './kick.js';
import { avisoRecibido, canjeAvisado, conToken, estadoCanalKick, idCanalKick, idKick } from './canal-kick.js';
import { cuentaDeKick, darSobres } from './gacha.js';
import { anunciarDirecto, directoDiscordActivo } from './discord.js';
import { ajuste, guardarAjustes } from './ajustes.js';
import { comandoDe, esPersonal, responderComando, ESPERA_COMANDO_MS } from './comandos-kick.js';

// Sobres por apoyar en Kick (los fijó Pacopepe el 08/11/2026). Van a la temporada del gachapon en curso, como los
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
  catch (e) { console.error('Avisos de Kick: no se pudo pedir la clave pública:', e.message); return { estado: 503, cuerpo: { ok: false } }; }
  if (!valido) return { estado: 401, cuerpo: { ok: false, error: 'Firma no válida' } };
  if (yaVisto(aviso.id)) return { estado: 200, cuerpo: { ok: true, repetido: true } };
  let datos;
  try { datos = JSON.parse(cuerpo.toString('utf8')); } catch { return { estado: 400, cuerpo: { ok: false, error: 'Aviso no válido' } }; }
  avisoRecibido();
  const tipo = String(h['kick-event-type'] || '');
  setImmediate(() => atenderEvento(tipo, datos, aviso.id, { web }).catch(e => console.error(`Aviso de Kick ${tipo}:`, e.message)));
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

export async function atenderEvento(tipo, d, idAviso, { web }) {
  const canal = idCanalKick();
  // Solo los avisos del canal de Gokudō (la suscripción es suya, pero por si acaso)
  if (!canal || (d?.broadcaster?.user_id !== undefined && String(d.broadcaster.user_id) !== String(canal))) return;

  if (tipo === 'channel.reward.redemption.updated') return canjeAvisado(d);

  if (tipo === 'livestream.status.updated') {
    if (!d.is_live || !directoDiscordActivo()) return;
    const directo = d.started_at || idAviso;
    if (ajuste('kick_directo') === directo) return;   // ya avisado de este directo
    await guardarAjustes({ kick_directo: directo });
    return anunciarDirecto({ titulo: d.title, enlace: `https://kick.com/${d.broadcaster?.channel_slug || CANAL_KICK}`, avatar: `${web}/marca/gokudo.png` });
  }

  if (tipo === 'channel.followed') {
    if (d.follower?.username) alertar({ tipo: 'seguidor', nombre: d.follower.username });
    return;
  }

  if (tipo === 'channel.subscription.new' || tipo === 'channel.subscription.renewal') {
    const s = conNombre(d.subscriber);
    if (!s) return;
    const nueva = tipo === 'channel.subscription.new';
    const sobres = nueva ? SOBRES_APOYO.sub : SOBRES_APOYO.renovacion;
    alertar({ tipo: nueva ? 'sub' : 'renovacion', nombre: s.username, meses: Number(d.duration) || 1, sobres });
    return darConReintento(persona(s), sobres, `kk-${nueva ? 'sub' : 'renovacion'}:${idAviso}`);
  }

  if (tipo === 'channel.subscription.gifts') {
    const giftees = (d.giftees || []).filter(g => g?.user_id);
    if (!giftees.length) return;
    const quien = conNombre(d.gifter);
    const sobres = quien ? giftees.length * SOBRES_APOYO.regalaPorSub : 0;
    alertar({ tipo: 'regalo', nombre: quien?.username || 'Anónimo', cantidad: giftees.length, sobres });
    if (quien) await darConReintento(persona(quien), sobres, `kk-regalo:${idAviso}`);
    for (const g of giftees) await darConReintento(persona(g), SOBRES_APOYO.recibeRegalo, `kk-regalado:${idAviso}:${g.user_id}`);
    return;
  }

  if (tipo === 'kicks.gifted') {
    const s = conNombre(d.sender);
    const cantidad = Math.max(0, Math.floor(Number(d.gift?.amount) || 0));
    if (!s || !cantidad) return;
    const sobres = Math.floor(cantidad / SOBRES_APOYO.kicksPorSobre);
    alertar({ tipo: 'kicks', nombre: s.username, cantidad, regalo: d.gift?.name || '', mensaje: d.gift?.message || '', sobres });
    if (sobres) await darConReintento(persona(s), sobres, `kk-kicks:${idAviso}`);
    return;
  }

  if (tipo === 'chat.message.sent') return atenderChat(d, { web });
}

// ---------- chat ----------
const ultimos = new Map();   // comando (o comando y persona) → cuándo se contestó
let contexto = null;
// index.js dice de dónde sale lo que contestan los comandos (fantasy, calendario…): así este archivo no depende de todo
export const contextoComandos = fn => { contexto = fn; };

async function atenderChat(d, { web }) {
  const quien = d.sender;
  if (!quien?.user_id || String(quien.user_id) === String(idCanalKick())) return;   // la web no se contesta a sí misma
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
  if (texto) await conToken(tk => escribirEnChat(tk, texto, d.message_id));
}

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
