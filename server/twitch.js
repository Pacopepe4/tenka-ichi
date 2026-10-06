// Conexión con Twitch: inicio de sesión de los espectadores (OAuth) y llamadas a la API Helix.
// Se activa con TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET (app registrada gratis en dev.twitch.tv).
import { sesionesActivas } from './sesion.js';

const ID = process.env.TWITCH_CLIENT_ID;
const SECRETO = process.env.TWITCH_CLIENT_SECRET;
export const CANAL = (process.env.CANAL_TWITCH || 'koryubudo').toLowerCase();
// Direcciones de Twitch; las pruebas las cambian por las de un Twitch falso (scripts/twitch-falso.js)
const URL_ID = (process.env.TWITCH_URL_ID || 'https://id.twitch.tv').replace(/\/$/, '');
const URL_API = (process.env.TWITCH_URL_API || 'https://api.twitch.tv/helix').replace(/\/$/, '');

export const twitchActivo = () => Boolean(ID && SECRETO && sesionesActivas());

// confirmar: Twitch enseña siempre con qué cuenta se va a entrar (y deja cambiarla), aunque ya se hubiera autorizado
// antes. Es para vincular: que nadie una sin querer la cuenta que tenía abierta en el navegador
export function urlAutorizar({ redirect, state, scope = '', confirmar = false }) {
  const q = new URLSearchParams({ client_id: ID, redirect_uri: redirect, response_type: 'code', scope, state, force_verify: String(confirmar) });
  return `${URL_ID}/oauth2/authorize?${q}`;
}

async function pedirToken(parametros) {
  const r = await fetch(`${URL_ID}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ID, client_secret: SECRETO, ...parametros }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twitch no dio el token: ${j.message || r.status}`);
  return j;
}

export const canjearCodigo = (code, redirect) => pedirToken({ code, grant_type: 'authorization_code', redirect_uri: redirect });
export const refrescarToken = refresh => pedirToken({ refresh_token: refresh, grant_type: 'refresh_token' });

export class ErrorTwitch extends Error {
  constructor(mensaje, estado) { super(mensaje); this.estado = estado; }
}

// Twitch exige validar los tokens que se guardan al arrancar y cada hora (dev.twitch.tv/docs/authentication/validate-tokens).
// Devuelve { client_id, login, user_id, scopes, expires_in }; si el token ya no vale, ErrorTwitch con estado 401.
export async function validarToken(token) {
  const r = await fetch(`${URL_ID}/oauth2/validate`, { headers: { Authorization: `OAuth ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorTwitch(j.message || `Twitch respondió ${r.status}`, r.status);
  return j;
}

// Token de aplicación (sin usuario), para buscar cuentas por nombre. Se valida cada hora como los demás
let tokenApp = null;
async function tokenDeApp() {
  if (tokenApp && tokenApp.caduca > Date.now() + 60000) return tokenApp.token;
  const t = await pedirToken({ grant_type: 'client_credentials' });
  tokenApp = { token: t.access_token, caduca: Date.now() + t.expires_in * 1000 };
  return tokenApp.token;
}
export async function validarTokenDeApp() {
  if (!tokenApp) return;
  try { await validarToken(tokenApp.token); }
  catch (e) { if (e.estado === 401) tokenApp = null; else throw e; }  // se pide otro la próxima vez
}
setInterval(() => validarTokenDeApp().catch(() => {}), 3600000).unref();

export async function helix(ruta, { token, method = 'GET', body } = {}, reintento = false) {
  const r = await fetch(`${URL_API}/${ruta}`, {
    method,
    headers: { 'Client-Id': ID, Authorization: `Bearer ${token || await tokenDeApp()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // El token de aplicación puede caducar o revocarse antes de tiempo: se pide otro y se repite una vez
  if (r.status === 401 && !token && !reintento) { tokenApp = null; return helix(ruta, { method, body }, true); }
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
