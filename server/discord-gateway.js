// Conexión del bot de Gokudō al gateway de Discord, para que SrDirector conteste cuando lo mencionan (@SrDirector) en
// cualquier canal o en un ticket. Los botones y los comandos no la necesitan (llegan por POST /discord/interacciones).
// Solo pide los intents GUILDS y GUILD_MESSAGES: Discord siempre le da el texto de los mensajes que lo mencionan, así
// que no hace falta el permiso privilegiado de «Message Content».
// Para leer las fuentes de scrims (server/scrims.js) sí hace falta: con 'contenido' (DISCORD_LEER_FUENTES=1, después de
// activar «Message Content Intent» en el Developer Portal) lo pide también. Si Discord no lo deja (cierre 4014: no está
// activado en el portal), vuelve a conectarse sin él, para que las menciones sigan funcionando.
// Mientras la web duerme (Render gratis), el bot está desconectado y no se entera de las menciones: al despertar se
// vuelve a conectar solo. Con DISCORD_GATEWAY=0 no se conecta (para no tener dos conexiones, la de Render y la de un PC).
import WebSocket from 'ws';

const INTENTS = (1 << 0) | (1 << 9);   // GUILDS, GUILD_MESSAGES
const CONTENIDO = 1 << 15;             // MESSAGE_CONTENT (privilegiado)
const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID: 9, HELLO: 10, ACK: 11 };
// Códigos de cierre con los que no vale la pena volver a intentarlo
const FATALES = { 4004: 'el DISCORD_BOT_TOKEN no vale', 4010: 'shard no válido', 4011: 'hace falta sharding', 4012: 'versión de la API no válida',
  4013: 'intents no válidos', 4014: 'intents no permitidos' };
const AGENTE = 'DiscordBot (https://tenka-ichi.onrender.com, 1.0)';

export function crearGateway({ token, urlApi = 'https://discord.com/api/v10', alMensaje, log = console, crearSocket = url => new WebSocket(url),
  esperar = (ms, fn) => setTimeout(fn, ms), contenido = false }) {
  let ws = null, latido = null, sinAck = false, secuencia = null, sesion = null, urlReanudar = null, yo = null;
  let intentos = 0, parado = false;
  const intents = () => INTENTS | (contenido ? CONTENIDO : 0);

  const enviar = datos => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(datos)); };

  async function direccion() {
    if (urlReanudar) return urlReanudar;
    const r = await fetch(`${urlApi.replace(/\/$/, '')}/gateway/bot`, { headers: { Authorization: `Bot ${token}`, 'User-Agent': AGENTE } });
    if (!r.ok) throw new Error(`Discord respondió ${r.status} a /gateway/bot`);
    return (await r.json()).url;
  }

  function cerrarLatido() { if (latido) clearInterval(latido); latido = null; }

  function reconectar(reanudar) {
    cerrarLatido();
    try { ws?.removeAllListeners(); ws?.close(); } catch {}
    ws = null;
    if (parado) return;
    if (!reanudar) { sesion = null; secuencia = null; urlReanudar = null; }
    const ms = Math.min(60_000, 1000 * 2 ** Math.min(intentos++, 6));
    esperar(ms, () => conectar().catch(e => { log.error('Gateway de Discord:', e.message); reconectar(false); }));
  }

  async function conectar() {
    if (parado) return;
    const url = `${(await direccion()).replace(/\/$/, '')}/?v=10&encoding=json`;
    ws = crearSocket(url);
    ws.on('message', datos => {
      let p;
      try { p = JSON.parse(String(datos)); } catch { return; }
      if (p.s != null) secuencia = p.s;
      if (p.op === OP.HELLO) {
        cerrarLatido();
        sinAck = false;
        latido = setInterval(() => {
          // Si Discord no contestó al latido anterior, la conexión está muerta: se reanuda
          if (sinAck) return reconectar(true);
          sinAck = true;
          enviar({ op: OP.HEARTBEAT, d: secuencia });
        }, p.d.heartbeat_interval);
        if (sesion) enviar({ op: OP.RESUME, d: { token, session_id: sesion, seq: secuencia } });
        else enviar({ op: OP.IDENTIFY, d: { token, intents: intents(), properties: { os: 'linux', browser: 'gokudo', device: 'gokudo' },
          presence: { status: 'online', activities: [{ type: 4, name: 'Mostrador de tickets', state: 'Mencióname con @ y te contesto' }], afk: false } } });
      } else if (p.op === OP.ACK) sinAck = false;
      else if (p.op === OP.HEARTBEAT) enviar({ op: OP.HEARTBEAT, d: secuencia });
      else if (p.op === OP.RECONNECT) reconectar(true);
      else if (p.op === OP.INVALID) reconectar(Boolean(p.d));
      else if (p.op === OP.DISPATCH) {
        if (p.t === 'READY') {
          sesion = p.d.session_id; urlReanudar = p.d.resume_gateway_url; yo = p.d.user; intentos = 0;
          log.log?.(`Gateway de Discord: conectado como ${yo?.username}`);
        } else if (p.t === 'RESUMED') intentos = 0;
        else if (p.t === 'MESSAGE_CREATE' && yo) {
          Promise.resolve(alMensaje(p.d, yo)).catch(e => log.error('Gateway de Discord, al atender un mensaje:', e.message));
        }
      }
    });
    ws.on('close', codigo => {
      // Se pidió leer el contenido y el portal no lo deja: se sigue sin él (las menciones funcionan igual)
      if (codigo === 4014 && contenido) {
        contenido = false;
        log.error('Gateway de Discord: «Message Content Intent» no está activado en el Developer Portal; sigo sin leer las fuentes de scrims');
        return reconectar(false);
      }
      if (FATALES[codigo]) { parado = true; cerrarLatido(); log.error(`Gateway de Discord: se para (${codigo}, ${FATALES[codigo]})`); return; }
      reconectar(codigo !== 1000 && codigo !== 4007 && codigo !== 4009);
    });
    ws.on('error', e => log.error('Gateway de Discord:', e.message));
  }

  return {
    arrancar: () => conectar().catch(e => { log.error('Gateway de Discord:', e.message); reconectar(false); }),
    parar: () => { parado = true; cerrarLatido(); try { ws?.close(1000); } catch {} },
    yo: () => yo,
    leeContenido: () => contenido,
  };
}
