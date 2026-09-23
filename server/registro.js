// Registro de partidas terminadas.
// - Siempre se guarda en data/registro.json (útil en local).
// - Si hay credenciales de Google (GOOGLE_SHEET_ID + GOOGLE_CREDENTIALS), además se
//   escribe en la pestaña "Registro" de la hoja, y al arrancar se lee de ahí
//   (en Render el disco se borra al reiniciar, así que la hoja es la fuente de verdad).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JWT } from 'google-auth-library';
import { ROLES } from './clanes.js';

const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'registro.json');
const PESTANA = 'Registro';
const CABECERA = ['Fecha', 'Jornada', 'Fase', 'Serie', 'Partida', 'Clan azul', 'Clan rojo', 'Ganador',
  'Lado', 'Tipo', 'Orden', 'Rol', 'Jugador', 'Clan', 'Campeón'];

let partidas = [];

function hoja() {
  const id = process.env.GOOGLE_SHEET_ID;
  const cred = process.env.GOOGLE_CREDENTIALS;
  if (!id || !cred) return null;
  const c = JSON.parse(cred);
  const jwt = new JWT({ email: c.client_email, key: c.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values`;
  return {
    async leer() {
      const r = await jwt.request({ url: `${base}/${encodeURIComponent(PESTANA)}!A:O` });
      return r.data.values || [];
    },
    async anadir(filas) {
      await jwt.request({
        url: `${base}/${encodeURIComponent(PESTANA)}!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        method: 'POST',
        data: { values: filas },
      });
    },
  };
}

// Una fila por pick y por ban (20 por partida): fácil de filtrar y de hacer tablas dinámicas
function aFilas(p) {
  const filas = [];
  for (const lado of ['azul', 'rojo']) {
    const clanLado = lado === 'azul' ? p.clanAzul : p.clanRojo;
    p.picks[lado].forEach((campeon, i) => filas.push([p.fecha, p.jornada, p.fase, p.serie, p.partida, p.clanAzul, p.clanRojo,
      p.ganador, lado, 'pick', i + 1, ROLES[i], p.jugadores[lado][i] || '', clanLado, campeon || '']));
    p.bans[lado].forEach((campeon, i) => filas.push([p.fecha, p.jornada, p.fase, p.serie, p.partida, p.clanAzul, p.clanRojo,
      p.ganador, lado, 'ban', i + 1, '', '', clanLado, campeon || '']));
  }
  return filas;
}

// Reconstruye las partidas a partir de las filas de la hoja
function deFilas(filas) {
  const mapa = new Map();
  for (const f of filas) {
    if (f[0] === 'Fecha' || f.length < 15) continue;
    const [fecha, jornada, fase, serie, partida, clanAzul, clanRojo, ganador, lado, tipo, orden, , jugador, , campeon] = f;
    const clave = `${fecha}|${serie}|${partida}`;
    if (!mapa.has(clave)) mapa.set(clave, {
      fecha, jornada, fase, serie, partida: Number(partida), clanAzul, clanRojo, ganador,
      picks: { azul: Array(5).fill(null), rojo: Array(5).fill(null) },
      bans: { azul: Array(5).fill(null), rojo: Array(5).fill(null) },
      jugadores: { azul: Array(5).fill(''), rojo: Array(5).fill('') },
    });
    const p = mapa.get(clave);
    const i = Number(orden) - 1;
    if (tipo === 'pick') { p.picks[lado][i] = campeon || null; p.jugadores[lado][i] = jugador || ''; }
    else if (tipo === 'ban') p.bans[lado][i] = campeon || null;
  }
  return [...mapa.values()];
}

export async function cargar() {
  const h = hoja();
  if (h) {
    try {
      const filas = await h.leer();
      if (!filas.length) await h.anadir([CABECERA]);
      partidas = deFilas(filas);
      console.log(`Registro: ${partidas.length} partidas leídas de Google Sheets`);
      return partidas;
    } catch (e) {
      console.error('No se pudo leer Google Sheets, uso el archivo local:', e.message);
    }
  }
  try {
    partidas = JSON.parse(await readFile(ARCHIVO, 'utf8'));
  } catch { partidas = []; }
  console.log(`Registro: ${partidas.length} partidas en ${ARCHIVO}`);
  return partidas;
}

export function todas() {
  return partidas;
}

export async function guardarPartida(p) {
  partidas.push(p);
  await mkdir(path.dirname(ARCHIVO), { recursive: true });
  await writeFile(ARCHIVO, JSON.stringify(partidas, null, 1));
  const h = hoja();
  if (h) await h.anadir(aFilas(p));
  return { enHoja: Boolean(h) };
}

export function usaHoja() {
  return Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_CREDENTIALS);
}
