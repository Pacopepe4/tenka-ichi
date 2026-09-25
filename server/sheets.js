// Acceso mínimo a Google Sheets con una cuenta de servicio.
// Se activa con GOOGLE_SHEET_ID y GOOGLE_CREDENTIALS (el JSON de la clave, entero).
import { JWT } from 'google-auth-library';

let cliente = null;
let ultimoError = null;

export function hojaActiva() {
  return Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_CREDENTIALS);
}

// Acepta el código de la hoja o la dirección entera
// (los códigos de Google Sheets tienen unos 44 caracteres de letras, números, _ y -)
function idHoja() {
  const v = String(process.env.GOOGLE_SHEET_ID || '').trim();
  const m = v.match(/\/d\/([A-Za-z0-9_-]{20,})/) || v.match(/([A-Za-z0-9_-]{25,})/);
  return m ? m[1] : v;
}

function idResumido() {
  const id = idHoja();
  return id ? `${id.slice(0, 4)}…${id.slice(-4)} (${id.length} caracteres)` : null;
}

// Acepta el JSON pegado con espacios, saltos o comillas alrededor
function credenciales() {
  let v = String(process.env.GOOGLE_CREDENTIALS || '').trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"') && !v.startsWith('"{'))) v = v.slice(1, -1);
  if (v.startsWith('"{')) v = JSON.parse(v);
  let c;
  try { c = JSON.parse(v); } catch { throw new Error('GOOGLE_CREDENTIALS no es un JSON válido: pega el archivo entero, de la primera { a la última }'); }
  if (!c.client_email || !c.private_key) throw new Error('GOOGLE_CREDENTIALS no tiene client_email o private_key: ¿es la clave JSON de una cuenta de servicio?');
  return { ...c, private_key: c.private_key.replace(/\\n/g, '\n') };
}

export function correoCuenta() {
  try { return credenciales().client_email; } catch { return null; }
}

function jwt() {
  if (!cliente) {
    const c = credenciales();
    cliente = new JWT({ email: c.client_email, key: c.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  }
  return cliente;
}

// Traduce los errores de Google a algo accionable
function explicar(e) {
  const estado = e?.response?.status;
  const msg = e?.response?.data?.error?.message || e.message;
  if (/^\s*</.test(String(msg))) return `Google no encuentra la hoja con el código ${idResumido()}: revisa GOOGLE_SHEET_ID (el código entre /d/ y /edit) y que sea una hoja de Google, no un .xlsx subido.`;
  if (estado === 400 && /not supported for this document/i.test(msg)) return 'El archivo es un Excel subido a Drive, no una hoja de Google: ábrelo y usa Archivo → Guardar como Hojas de cálculo de Google, y pon el código de la nueva hoja.';
  if (estado === 403 && /has not been used|disabled/i.test(msg)) return 'La Google Sheets API no está habilitada en el proyecto de Google Cloud.';
  if (estado === 403) return `La cuenta de servicio no tiene permiso en la hoja: compártela como Editor con ${correoCuenta()}.`;
  if (estado === 404) return 'No se encuentra la hoja: revisa GOOGLE_SHEET_ID (el código entre /d/ y /edit).';
  if (/invalid_grant|invalid_client|PEM|DECODER|key/i.test(msg)) return `La clave de GOOGLE_CREDENTIALS no es válida o está incompleta (${msg}).`;
  return msg;
}

async function peticion(opciones) {
  try {
    const r = await jwt().request(opciones);
    ultimoError = null;
    return r;
  } catch (e) {
    ultimoError = explicar(e);
    throw new Error(ultimoError);
  }
}

export function estadoHoja() {
  return { configurada: hojaActiva(), ok: hojaActiva() && !ultimoError, error: ultimoError, cuenta: correoCuenta(),
    hoja: hojaActiva() ? idResumido() : null };
}

export function marcarError(msg) {
  ultimoError = msg;
}

const base = () => `https://sheets.googleapis.com/v4/spreadsheets/${idHoja()}`;
const rango = (pestana, r) => encodeURIComponent(`${pestana}!${r}`);

// Crea la pestaña si no existe
export async function asegurarPestana(pestana, cabecera) {
  const meta = await peticion({ url: `${base()}?fields=sheets.properties.title` });
  const existe = meta.data.sheets.some(s => s.properties.title === pestana);
  if (!existe) {
    await peticion({ url: `${base()}:batchUpdate`, method: 'POST', data: { requests: [{ addSheet: { properties: { title: pestana } } }] } });
    await escribir(pestana, [cabecera]);
  }
}

export async function leer(pestana) {
  const r = await peticion({ url: `${base()}/values/${rango(pestana, 'A:Z')}` });
  return r.data.values || [];
}

export async function anadir(pestana, filas) {
  await peticion({
    url: `${base()}/values/${rango(pestana, 'A:Z')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    method: 'POST', data: { values: filas },
  });
}

// Sustituye todo el contenido de la pestaña
export async function escribir(pestana, filas) {
  await peticion({ url: `${base()}/values/${rango(pestana, 'A:Z')}:clear`, method: 'POST' });
  await peticion({ url: `${base()}/values/${rango(pestana, 'A1')}?valueInputOption=USER_ENTERED`, method: 'PUT', data: { values: filas } });
}
