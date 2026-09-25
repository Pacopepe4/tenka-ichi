// Acceso mínimo a Google Sheets con una cuenta de servicio.
// Se activa con GOOGLE_SHEET_ID y GOOGLE_CREDENTIALS (el JSON de la clave, entero).
import { JWT } from 'google-auth-library';

let cliente = null;

export function hojaActiva() {
  return Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_CREDENTIALS);
}

function jwt() {
  if (!cliente) {
    const c = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    cliente = new JWT({ email: c.client_email, key: c.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  }
  return cliente;
}

const base = () => `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}`;
const rango = (pestana, r) => encodeURIComponent(`${pestana}!${r}`);

// Crea la pestaña si no existe
export async function asegurarPestana(pestana, cabecera) {
  const meta = await jwt().request({ url: `${base()}?fields=sheets.properties.title` });
  const existe = meta.data.sheets.some(s => s.properties.title === pestana);
  if (!existe) {
    await jwt().request({ url: `${base()}:batchUpdate`, method: 'POST', data: { requests: [{ addSheet: { properties: { title: pestana } } }] } });
    await escribir(pestana, [cabecera]);
  }
}

export async function leer(pestana) {
  const r = await jwt().request({ url: `${base()}/values/${rango(pestana, 'A:Z')}` });
  return r.data.values || [];
}

export async function anadir(pestana, filas) {
  await jwt().request({
    url: `${base()}/values/${rango(pestana, 'A:Z')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    method: 'POST', data: { values: filas },
  });
}

// Sustituye todo el contenido de la pestaña
export async function escribir(pestana, filas) {
  await jwt().request({ url: `${base()}/values/${rango(pestana, 'A:Z')}:clear`, method: 'POST' });
  await jwt().request({ url: `${base()}/values/${rango(pestana, 'A1')}?valueInputOption=USER_ENTERED`, method: 'PUT', data: { values: filas } });
}
