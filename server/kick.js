// Conexión con Kick: OAuth 2.1 con PKCE (id.kick.com) y llamadas a la API pública (api.kick.com/public/v1).
// Se activa con KICK_CLIENT_ID y KICK_CLIENT_SECRET (app creada gratis en kick.com › Ajustes › Developer).
// Documentación: https://docs.kick.com (OAuth, Users y Channel Rewards).
import crypto from 'node:crypto';
import { sesionesActivas } from './sesion.js';

const ID = process.env.KICK_CLIENT_ID;
const SECRETO = process.env.KICK_CLIENT_SECRET;
// El canal (su «slug», el de kick.com/gokudo-zoku). La cuenta se llama Gokudo_zoku: Kick cambia «_» por «-» en el slug
export const CANAL_KICK = (process.env.CANAL_KICK || 'gokudo-zoku').toLowerCase();
export const slugDe = nombre => String(nombre || '').trim().toLowerCase().replace(/_/g, '-');
// Direcciones de Kick; las pruebas las cambian por las de un Kick falso (scripts/kick-falso.js)
const URL_ID = (process.env.KICK_URL_ID || 'https://id.kick.com').replace(/\/$/, '');
const URL_API = (process.env.KICK_URL_API || 'https://api.kick.com/public/v1').replace(/\/$/, '');

export const kickActivo = () => Boolean(ID && SECRETO && sesionesActivas());

// PKCE (obligatorio en Kick, con S256): el verificador se queda en la cookie firmada del navegador que empieza la
// autorización y el reto va a Kick
export function pkce() {
  const verificador = crypto.randomBytes(32).toString('base64url');
  return { verificador, reto: crypto.createHash('sha256').update(verificador).digest('base64url') };
}

export function urlAutorizar({ redirect, state, scope, reto }) {
  const q = new URLSearchParams({ response_type: 'code', client_id: ID, redirect_uri: redirect, scope, state,
    code_challenge: reto, code_challenge_method: 'S256' });
  return `${URL_ID}/oauth/authorize?${q}`;
}

export class ErrorKick extends Error {
  constructor(mensaje, estado) { super(mensaje); this.estado = estado; }
}

async function pedirToken(parametros) {
  const r = await fetch(`${URL_ID}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ID, client_secret: SECRETO, ...parametros }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorKick(`Kick no dio el token: ${j.message || j.error_description || j.error || r.status}`, r.status);
  return j;
}

export const canjearCodigo = (code, redirect, verificador) =>
  pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verificador });
export const refrescarToken = refresh => pedirToken({ grant_type: 'refresh_token', refresh_token: refresh });

// Qué permisos tiene un token y si sigue valiendo: { active, scope: 'a b', exp, token_type }
export async function examinarToken(token) {
  const r = await fetch(`${URL_ID}/oauth/token/introspect`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorKick(j.message || `Kick respondió ${r.status}`, r.status);
  return j.data || {};
}

export async function api(ruta, { token, method = 'GET', body } = {}) {
  const r = await fetch(`${URL_API}/${ruta}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorKick(j.message || `Kick respondió ${r.status}`, r.status);
  return j;
}

// { user_id, name, profile_picture } de quien ha dado el token (necesita el permiso user:read)
export async function usuarioDeToken(token) {
  const { data } = await api('users', { token });
  return data?.[0] || null;
}

// Nombres de varias cuentas por su id (el listado de canjes solo trae el id de quien canjea)
export async function usuariosPorId(ids, token) {
  if (!ids.length) return [];
  const { data } = await api(`users?${ids.map(id => `id=${encodeURIComponent(id)}`).join('&')}`, { token });
  return data || [];
}
