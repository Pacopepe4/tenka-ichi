// Inicio de sesión de los espectadores con Discord (OAuth2, permiso «identify»).
// Se activa con DISCORD_CLIENT_ID y DISCORD_CLIENT_SECRET (app gratis en discord.com/developers).
// Del perfil solo se leen el id, el nombre y el avatar; el token se usa una vez y no se guarda.
// (Publicar en un canal de Discord con un webhook es otra cosa y vive en discord.js.)
import { sesionesActivas } from './sesion.js';

const ID = process.env.DISCORD_CLIENT_ID;
const SECRETO = process.env.DISCORD_CLIENT_SECRET;
// Direcciones de Discord; las pruebas las cambian por las de un Discord falso (scripts/discord-falso.js)
const URL_WEB = (process.env.DISCORD_URL_WEB || 'https://discord.com').replace(/\/$/, '');
const URL_API = (process.env.DISCORD_URL_API || 'https://discord.com/api/v10').replace(/\/$/, '');
const URL_CDN = (process.env.DISCORD_URL_CDN || 'https://cdn.discordapp.com').replace(/\/$/, '');
// Discord pide que toda petición diga quién la hace
const AGENTE = 'TenkaIchi (https://tenka-ichi.onrender.com, 1.0)';

export const loginDiscordActivo = () => Boolean(ID && SECRETO && sesionesActivas());

export function urlAutorizarDiscord({ redirect, state }) {
  // prompt=none: quien ya dio permiso entra sin volver a ver la pantalla de autorización
  const q = new URLSearchParams({ client_id: ID, redirect_uri: redirect, response_type: 'code', scope: 'identify', state, prompt: 'none' });
  return `${URL_WEB}/oauth2/authorize?${q}`;
}

class ErrorLoginDiscord extends Error {
  constructor(mensaje, estado) { super(mensaje); this.estado = estado; }
}

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { 'User-Agent': AGENTE, ...(opciones.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorLoginDiscord(j.error_description || j.message || j.error || `Discord respondió ${r.status}`, r.status);
  return j;
}

const canjearCodigo = (code, redirect) => pedir(`${URL_API}/oauth2/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: ID, client_secret: SECRETO, grant_type: 'authorization_code', code, redirect_uri: redirect }),
});

// El nombre de Discord es texto libre y acaba en la hoja de Google (que interpreta lo que empieza por = + - @ como una fórmula)
// y en las páginas. Fuera los caracteres invisibles, de control o de dirección del texto, y fuera lo que lo convierta en fórmula.
export function limpiarNombre(texto) {
  const limpio = String(texto ?? '').replace(/\p{C}/gu, '').trim().replace(/^[=+\-@\s]+/, '').slice(0, 32).trim();
  return limpio || 'Jugador';
}

function urlAvatar(u) {
  if (!u.avatar) return null;
  return `${URL_CDN}/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`;
}

// Canjea el código de la vuelta de Discord y devuelve la sesión { id, nombre, avatar }
export async function sesionDeDiscord(code, redirect) {
  const t = await canjearCodigo(code, redirect);
  const u = await pedir(`${URL_API}/users/@me`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (!u?.id) throw new ErrorLoginDiscord('Discord no devolvió el perfil', 502);
  return { id: `discord-${u.id}`, nombre: limpiarNombre(u.global_name || u.username), avatar: urlAvatar(u) };
}
