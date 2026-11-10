// Comandos del bot de Gokudō en el servidor de Discord. Discord los manda aquí (POST /discord/interacciones) y la
// web contesta; no hace falta tener el bot conectado todo el rato. Se activa con DISCORD_PUBLIC_KEY (la «Public
// Key» de la app, no es secreta) y DISCORD_BOT_TOKEN (el token del bot, secreto). Los comandos los registra
// npm run discord-aplicar (están en discord/servidor.json).
//   /reclutar quien: un Oyabun mete a alguien en SU familia (le da el rol de la familia y el de Kobun).
//   Así cada jefe solo puede reclutar para la suya, cosa que Discord no deja limitar con los permisos.
//   Los botones y ventanas de los tickets (custom_id «ticket:…») los atiende server/tickets.js.
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearTickets } from './tickets.js';
import { crearGateway } from './discord-gateway.js';
import { CLANES } from './clanes.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTE = 'DiscordBot (https://tenka-ichi.onrender.com, 1.0)';
// Tipos de Discord: interacción PING, COMANDO, BOTÓN y VENTANA enviada; respuesta PONG y MENSAJE; el mensaje solo lo
// ve quien lo pide
const PING = 1, COMANDO = 2, BOTON = 3, VENTANA = 5, PONG = 1, MENSAJE = 4, SOLO_TU = 64;

// La clave pública de la app viene en hexadecimal (32 bytes); Node la quiere en formato SPKI
function clavePublica(hex) {
  const prefijo = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({ key: Buffer.concat([prefijo, Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
}

// La Public Key se copia a mano en Render: se aceptan espacios, comillas o el nombre de la variable delante, y si
// no hay una clave válida se apagan los comandos (con un aviso en el registro) en vez de tumbar toda la web
export function leerClave(texto) {
  const hex = /[0-9a-f]{64}/i.exec(String(texto))?.[0];
  try {
    if (!hex) throw new Error('no son 64 caracteres hexadecimales');
    return clavePublica(hex);
  } catch (e) {
    console.error(`DISCORD_PUBLIC_KEY no es válida (${e.message}): /reclutar queda apagado. Cópiala de discord.com/developers › General Information › Public Key`);
    return null;
  }
}

// Discord firma cada petición: si la firma no cuadra, no es Discord y no se hace nada
export function firmaValida(clave, firma, momento, cuerpo) {
  if (!firma || !momento || !/^[0-9a-f]{128}$/i.test(firma)) return false;
  try {
    return crypto.verify(null, Buffer.from(momento + cuerpo), clave, Buffer.from(firma, 'hex'));
  } catch {
    return false;
  }
}

function leerTexto(req, limite = 1e5) {
  return new Promise((ok, mal) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', d => { s += d; if (s.length > limite) { mal(new Error('Petición demasiado grande')); req.destroy(); } });
    req.on('end', () => ok(s));
    req.on('error', mal);
  });
}

const respuesta = (texto, { soloTu = true, mencion = null } = {}) => ({
  type: MENSAJE,
  data: { content: texto, flags: soloTu ? SOLO_TU : 0, allowed_mentions: { parse: [], users: mencion ? [mencion] : [] } },
});

// Los ids de los roles de cada servidor salen de discord/ids.json (lo escribe npm run discord-aplicar)
export function rolesDelServidor(ids, guildId, familias) {
  const s = ids[guildId];
  if (!s) return null;
  return {
    oyabun: s['rol:jefes'],
    kobun: s['rol:jugador'],
    familias: familias.map(f => ({ id: f.id, nombre: f.nombre, rol: s[`familia:${f.id}`] })).filter(f => f.rol),
  };
}

// Qué hacer con un /reclutar (sin tocar Discord): o un error para quien lo pide, o los roles que hay que dar
export function decidirReclutar({ roles, quien, objetivo, objetivoMiembro }) {
  if (!roles) return { error: 'Este servidor no está montado con npm run discord-aplicar.' };
  const mios = quien.member?.roles || [];
  if (!roles.oyabun || !mios.includes(roles.oyabun)) return { error: 'Solo un Oyabun puede reclutar.' };
  const suyas = roles.familias.filter(f => mios.includes(f.rol));
  if (!suyas.length) return { error: 'No tienes el rol de ninguna familia: pide al staff que te lo ponga.' };
  if (suyas.length > 1) return { error: `Tienes el rol de varias familias (${suyas.map(f => f.nombre).join(', ')}): pide al staff que lo arregle.` };
  const familia = suyas[0];
  if (!objetivo) return { error: 'No encuentro a esa persona.' };
  if (objetivo.bot) return { error: 'A un bot no se le recluta.' };
  if (!objetivoMiembro) return { error: 'Esa persona no está en el servidor.' };
  const deEl = objetivoMiembro.roles || [];
  if (deEl.includes(familia.rol)) return { error: `<@${objetivo.id}> ya es de la familia ${familia.nombre}.` };
  const otra = roles.familias.find(f => deEl.includes(f.rol));
  if (otra) return { error: `<@${objetivo.id}> es de la familia ${otra.nombre}: tiene que salir antes (eso lo hace el staff).` };
  return { familia, dar: [familia.rol, ...(roles.kobun && !deEl.includes(roles.kobun) ? [roles.kobun] : [])] };
}

export function crearComandos({ clave = process.env.DISCORD_PUBLIC_KEY, token = process.env.DISCORD_BOT_TOKEN,
  urlApi = process.env.DISCORD_URL_API || 'https://discord.com/api/v10',
  ids = () => JSON.parse(readFileSync(path.join(RAIZ, 'discord/ids.json'), 'utf8')),
  familias = () => JSON.parse(readFileSync(path.join(RAIZ, 'data-proyecto/familias.json'), 'utf8')).familias,
  tickets: opcionesTickets = {} } = {}) {
  const publica = clave && token ? leerClave(clave) : null;
  const activo = Boolean(publica);
  const base = urlApi.replace(/\/$/, '');
  const tickets = activo ? crearTickets({ token, urlApi: base, ids, clanes: CLANES, ...opcionesTickets }) : null;

  async function darRol(guildId, usuario, rol, motivo) {
    const r = await fetch(`${base}/guilds/${guildId}/members/${usuario}/roles/${rol}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${token}`, 'User-Agent': AGENTE, 'X-Audit-Log-Reason': encodeURIComponent(motivo) },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`Discord respondió ${r.status} al dar el rol: ${j.message || 'error'}`);
    }
  }

  async function reclutar(i) {
    const opcion = i.data.options?.find(o => o.name === 'quien');
    const objetivo = i.data.resolved?.users?.[opcion?.value];
    const objetivoMiembro = i.data.resolved?.members?.[opcion?.value];
    const roles = rolesDelServidor(ids(), i.guild_id, familias());
    const d = decidirReclutar({ roles, quien: i, objetivo, objetivoMiembro });
    if (d.error) return respuesta(d.error);
    const oyabun = i.member.user;
    try {
      for (const rol of d.dar) await darRol(i.guild_id, objetivo.id, rol, `Reclutado por ${oyabun.username} con /reclutar`);
    } catch (e) {
      console.error('/reclutar', e.message);
      return respuesta('No he podido darle el rol: el rol del bot tiene que estar por encima de los de las familias.');
    }
    return respuesta(`<@${objetivo.id}> entra en la familia **${d.familia.nombre}** de la mano de <@${oyabun.id}>.`, { soloTu: false, mencion: objetivo.id });
  }

  // Devuelve { estado, cuerpo } para contestar a Discord
  async function atender(req) {
    if (!activo) return { estado: 404, cuerpo: { error: 'Los comandos de Discord no están activados' } };
    const texto = await leerTexto(req);
    if (!firmaValida(publica, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp'], texto)) {
      return { estado: 401, cuerpo: { error: 'Firma no válida' } };
    }
    let i;
    try { i = JSON.parse(texto); } catch { return { estado: 400, cuerpo: { error: 'Petición no válida' } }; }
    if (i.type === PING) return { estado: 200, cuerpo: { type: PONG } };
    if (i.type === COMANDO && i.data?.name === 'reclutar') {
      if (!i.guild_id || !i.member) return { estado: 200, cuerpo: respuesta('Esto solo funciona dentro del servidor.') };
      return { estado: 200, cuerpo: await reclutar(i) };
    }
    if ((i.type === BOTON || i.type === VENTANA) && String(i.data?.custom_id || '').startsWith('ticket:')) {
      return { estado: 200, cuerpo: tickets.atender(i) };
    }
    return { estado: 200, cuerpo: respuesta('No conozco ese comando.') };
  }

  // La conexión al gateway, para que SrDirector conteste cuando lo mencionan. Solo si hay IA (ANTHROPIC_API_KEY) y no
  // se ha apagado con DISCORD_GATEWAY=0
  function arrancarGateway() {
    if (!activo || !tickets?.iaActiva || process.env.DISCORD_GATEWAY === '0') return null;
    const g = crearGateway({ token, urlApi: base, alMensaje: (m, yo) => tickets.alMencionar(m, yo) });
    g.arrancar();
    return g;
  }

  return { activo, atender, tickets, arrancarGateway };
}
