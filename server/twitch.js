// Conexión con Twitch: inicio de sesión de los espectadores (OAuth) y llamadas a la API Helix.
// Se activa con TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET (app registrada gratis en dev.twitch.tv).
import { sesionesActivas } from './sesion.js';

const ID = process.env.TWITCH_CLIENT_ID;
const SECRETO = process.env.TWITCH_CLIENT_SECRET;
export const CANAL = (process.env.CANAL_TWITCH || 'koryubudo').toLowerCase();

export const twitchActivo = () => Boolean(ID && SECRETO && sesionesActivas());

export function urlAutorizar({ redirect, state, scope = '' }) {
  const q = new URLSearchParams({ client_id: ID, redirect_uri: redirect, response_type: 'code', scope, state, force_verify: 'false' });
  return `https://id.twitch.tv/oauth2/authorize?${q}`;
}

async function pedirToken(parametros) {
  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ID, client_secret: SECRETO, ...parametros }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twitch no dio el token: ${j.message || r.status}`);
  return j;
}

export const canjearCodigo = (code, redirect) => pedirToken({ code, grant_type: 'authorization_code', redirect_uri: redirect });
export const refrescarToken = refresh => pedirToken({ refresh_token: refresh, grant_type: 'refresh_token' });

// Token de aplicación (sin usuario), para buscar cuentas por nombre
let tokenApp = null;
async function tokenDeApp() {
  if (tokenApp && tokenApp.caduca > Date.now() + 60000) return tokenApp.token;
  const t = await pedirToken({ grant_type: 'client_credentials' });
  tokenApp = { token: t.access_token, caduca: Date.now() + t.expires_in * 1000 };
  return tokenApp.token;
}

export class ErrorTwitch extends Error {
  constructor(mensaje, estado) { super(mensaje); this.estado = estado; }
}

export async function helix(ruta, { token, method = 'GET', body } = {}) {
  const r = await fetch(`https://api.twitch.tv/helix/${ruta}`, {
    method,
    headers: { 'Client-Id': ID, Authorization: `Bearer ${token || await tokenDeApp()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorTwitch(j.message || `Twitch respondió ${r.status}`, r.status);
  return j;
}

export async function usuarioDeToken(token) {
  const { data } = await helix('users', { token });
  return data?.[0] || null;
}

export async function usuarioPorNombre(login) {
  const { data } = await helix(`users?login=${encodeURIComponent(String(login).trim().toLowerCase())}`);
  return data?.[0] || null;
}
