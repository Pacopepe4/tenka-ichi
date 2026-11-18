// Vuelca TODAS las pestañas de la hoja de Google de Tenka Ichi en JSON, por la salida estándar.
// Se ejecuta dentro del contenedor de la web, que ya tiene las credenciales y la librería:
//   docker compose exec -T app node --input-type=module - < scripts/copia-hoja.mjs > hoja.json
// Solo lee (permiso de lectura): no puede cambiar nada de la hoja.
import { createRequire } from 'node:module';

const require = createRequire('/app/package.json');
const { JWT } = require('google-auth-library');

let crudo = String(process.env.GOOGLE_CREDENTIALS || '').trim();
if ((crudo.startsWith("'") && crudo.endsWith("'")) || (crudo.startsWith('"') && crudo.endsWith('"') && !crudo.startsWith('"{'))) crudo = crudo.slice(1, -1);
if (crudo.startsWith('"{')) crudo = JSON.parse(crudo);
const cred = JSON.parse(crudo);
const valor = String(process.env.GOOGLE_SHEET_ID || '').trim();
const id = (valor.match(/\/d\/([A-Za-z0-9_-]{20,})/) || valor.match(/([A-Za-z0-9_-]{25,})/) || [, valor])[1];
if (!id || !cred.client_email) throw new Error('Faltan GOOGLE_SHEET_ID o GOOGLE_CREDENTIALS');

const cliente = new JWT({
  email: cred.client_email,
  key: cred.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;

const { data: meta } = await cliente.request({ url: `${base}?fields=properties.title,sheets.properties.title` });
const titulos = meta.sheets.map(s => s.properties.title);
const pestanas = {};
for (let i = 0; i < titulos.length; i += 50) {
  const trozo = titulos.slice(i, i + 50);
  const q = new URLSearchParams(trozo.map(t => ['ranges', `'${t.replace(/'/g, "''")}'`]));
  q.set('valueRenderOption', 'FORMULA');
  const { data } = await cliente.request({ url: `${base}/values:batchGet?${q}` });
  data.valueRanges.forEach((r, j) => { pestanas[trozo[j]] = r.values || []; });
}

process.stdout.write(JSON.stringify({ hoja: meta.properties.title, id, fecha: new Date().toISOString(), pestanas }));
