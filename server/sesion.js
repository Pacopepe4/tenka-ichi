// Sesiones firmadas en cookies y cifrado de secretos guardados (tokens del canal de Twitch).
// Todo cuelga de SESION_SECRETO: sin él, en Render no hay inicio de sesión.
import crypto from 'node:crypto';

const SECRETO = process.env.SESION_SECRETO || (process.env.RENDER ? null : 'secreto-solo-para-pruebas-en-local');

export const sesionesActivas = () => Boolean(SECRETO);

// ---------- tokens firmados (cookie de sesión, estado de OAuth, tickets del panel) ----------
export function firmar(obj, segundos) {
  const datos = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + segundos * 1000 })).toString('base64url');
  const firma = crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url');
  return `${datos}.${firma}`;
}

export function verificar(token) {
  if (!SECRETO || !token) return null;
  const [datos, firma] = String(token).split('.');
  if (!datos || !firma) return null;
  const esperada = crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url');
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(datos, 'base64url').toString());
    return obj.exp > Date.now() ? obj : null;
  } catch { return null; }
}

// ---------- cookies ----------
export function leerCookies(req) {
  const res = {};
  for (const trozo of String(req.headers.cookie || '').split(';')) {
    const i = trozo.indexOf('=');
    if (i > 0) res[trozo.slice(0, i).trim()] = decodeURIComponent(trozo.slice(i + 1).trim());
  }
  return res;
}

export function ponerCookie(res, nombre, valor, segundos, req) {
  const segura = req.headers['x-forwarded-proto'] === 'https';
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${segundos}`];
  if (segura) partes.push('Secure');
  const previas = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(previas) ? previas : previas ? [previas] : []), partes.join('; ')]);
}

// ---------- cifrado de secretos (AES-256-GCM) ----------
const clave = () => crypto.createHash('sha256').update(`${SECRETO}:secretos`).digest();

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map(b => b.toString('base64url')).join('.');
}

export function descifrar(cadena) {
  const [iv, tag, datos] = String(cadena).split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}
