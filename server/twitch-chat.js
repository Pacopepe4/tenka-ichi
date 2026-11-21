// El bot del chat de Twitch (nuevo, 21/11/2026): !pregunta en el chat de gokudo_zoku lo contesta SrDirector con IA
// (server/preguntas-chat.js), igual que en Kick. Escucha el chat con EventSub por WebSocket (channel.chat.message) y
// contesta con POST /helix/chat/messages, las dos cosas con el token del canal (server/canal.js) y como la cuenta del
// canal. Necesita que el canal se haya conectado en el panel con los permisos user:read:chat y user:write:chat: una
// conexión de antes solo tiene el de las recompensas y hay que pulsar «Volver a conectar el canal».
//   · session_welcome   → se suscribe a channel.chat.message de su propio canal
//   · session_keepalive → nada (si pasa el tiempo que dice Twitch sin ningún mensaje, se reconecta)
//   · session_reconnect → se pasa a la dirección nueva que da Twitch (las suscripciones siguen)
//   · revocation        → Twitch ha quitado la suscripción (permiso retirado): hay que volver a conectar el canal
// Si se cae, vuelve a conectar solo, esperando cada vez un poco más (hasta un minuto).
import WebSocket from 'ws';
import { preguntaDe } from './preguntas-chat.js';

const URL_EVENTSUB = process.env.TWITCH_URL_EVENTSUB || 'wss://eventsub.wss.twitch.tv/ws';

export function crearChatTwitch({ helix, conToken, canal, activo, preguntar, url = URL_EVENTSUB, crearSocket = u => new WebSocket(u),
  respiroMs = 1100, reintentoMs = 5000, log = console } = {}) {
  const estado = { conectado: false, suscrito: false, error: null, ultimaPregunta: null };
  let socket = null, parado = true, espera = reintentoMs, vigilante = null, reintento = null;
  const cola = [];
  let escribiendo = false;

  function vigilar(segundos) {
    clearTimeout(vigilante);
    vigilante = setTimeout(() => { log.error('Chat de Twitch: sin noticias de Twitch, vuelvo a conectar'); socket?.terminate?.(); socket?.close?.(); }, (segundos + 10) * 1000);
    vigilante.unref?.();
  }

  async function suscribir(sesion) {
    try {
      await conToken(tk => helix('eventsub/subscriptions', { token: tk, method: 'POST', body: {
        type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: canal(), user_id: canal() },
        transport: { method: 'websocket', session_id: sesion } } }));
      Object.assign(estado, { suscrito: true, error: null });
    } catch (e) {
      estado.suscrito = false;
      estado.error = e.estado === 403 || e.estado === 401
        ? 'Twitch no deja leer el chat con la conexión guardada: pulsa «Volver a conectar el canal» en el panel'
        : `No se pudo escuchar el chat de Twitch: ${e.message}`;
      log.error('Chat de Twitch:', estado.error);
    }
  }

  function conectar(direccion = url, { reconexion = false } = {}) {
    const anterior = reconexion ? socket : null;
    const s = crearSocket(direccion);
    socket = s;
    s.on('message', datos => {
      let m;
      try { m = JSON.parse(String(datos)); } catch { return; }
      const tipo = m.metadata?.message_type;
      if (tipo === 'session_welcome') {
        espera = reintentoMs;
        estado.conectado = true;
        vigilar(m.payload.session.keepalive_timeout_seconds || 10);
        if (anterior) { anterior.removeAllListeners?.('close'); anterior.close?.(); }   // la vieja ya no hace falta
        else suscribir(m.payload.session.id);
        return;
      }
      vigilar(m.payload?.session?.keepalive_timeout_seconds || 30);
      if (tipo === 'session_reconnect') conectar(m.payload.session.reconnect_url, { reconexion: true });
      else if (tipo === 'revocation') {
        Object.assign(estado, { suscrito: false, error: 'Twitch ha quitado el permiso del chat: vuelve a conectar el canal en el panel' });
        log.error('Chat de Twitch:', estado.error);
      } else if (tipo === 'notification' && m.payload?.subscription?.type === 'channel.chat.message') {
        mensaje(m.payload.event).catch(e => log.error('Chat de Twitch:', e.message));
      }
    });
    s.on('close', () => {
      if (s !== socket) return;
      Object.assign(estado, { conectado: false, suscrito: false });
      clearTimeout(vigilante);
      if (parado) return;
      reintento = setTimeout(() => { if (!parado && activo()) conectar(); }, espera);
      reintento.unref?.();
      espera = Math.min(espera * 2, 60_000);
    });
    s.on('error', e => log.error('Chat de Twitch:', e.message));
  }

  // Un mensaje del chat: si es !pregunta (y no lo ha escrito el propio canal, que es quien contesta), contesta
  async function mensaje(e) {
    if (!e || e.chatter_user_id === canal()) return;
    const pregunta = preguntaDe(e.message?.text);
    if (pregunta === null) return;
    const texto = await preguntar({ pregunta, plataforma: 'twitch', quien: { id: String(e.chatter_user_id), nombre: e.chatter_user_name || e.chatter_user_login } });
    if (!texto) return;
    estado.ultimaPregunta = new Date().toISOString();
    cola.push({ texto, responderA: e.message_id });
    if (cola.length > 20) cola.shift();
    vaciar();
  }
  async function vaciar() {
    if (escribiendo) return;
    escribiendo = true;
    try {
      while (cola.length) {
        const m = cola.shift();
        try {
          await conToken(tk => helix('chat/messages', { token: tk, method: 'POST', body: {
            broadcaster_id: canal(), sender_id: canal(), message: m.texto, ...(m.responderA && { reply_parent_message_id: m.responderA }) } }));
        } catch (err) { estado.error = `No se pudo escribir en el chat de Twitch: ${err.message}`; log.error('Chat de Twitch:', err.message); }
        if (cola.length) await new Promise(r => setTimeout(r, respiroMs));
      }
    } finally { escribiendo = false; }
  }

  // Arranca si el canal está conectado con permiso de chat; si ya estaba en marcha, no hace nada
  function arrancar() {
    if (!activo()) { parar(); return false; }
    if (!parado) return true;
    parado = false;
    conectar();
    return true;
  }
  function parar() {
    parado = true;
    clearTimeout(vigilante);
    clearTimeout(reintento);
    const s = socket;
    socket = null;
    s?.close?.();
    Object.assign(estado, { conectado: false, suscrito: false });
  }

  return { arrancar, parar, estado: () => ({ ...estado }), mensaje, esperar: async () => { while (escribiendo || cola.length) await new Promise(r => setTimeout(r, 10)); } };
}

// Lo que enseña el panel del chat de Twitch, en una frase
export function textoChatTwitch(canal, chat, ia) {
  if (!canal.conectado) return '';
  if (!canal.chat) return 'El chat (!pregunta) necesita permiso nuevo: pulsa «Volver a conectar el canal».';
  if (!ia) return 'El chat está conectado, pero !pregunta necesita ANTHROPIC_API_KEY.';
  if (chat.error) return chat.error;
  return chat.suscrito ? 'SrDirector escucha el chat y contesta a !pregunta.' : 'Conectando con el chat de Twitch…';
}
