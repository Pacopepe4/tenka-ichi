// Registro de partidas terminadas.
// - Siempre se guarda en data/registro.json (útil en local).
// - Con Google Sheets configurado, además se escribe en la pestaña "Registro", y al
//   arrancar se lee de ahí (en Render el disco se borra al reiniciar, así que la hoja
//   es la fuente de verdad).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from './clanes.js';
import { hojaActiva, asegurarPestana, leer, anadir } from './sheets.js';

const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'registro.json');
const PESTANA = 'Registro';
const CABECERA = ['Fecha', 'Jornada', 'Fase', 'Serie', 'Partida', 'Clan azul', 'Clan rojo', 'Ganador',
  'Lado', 'Tipo', 'Orden', 'Rol', 'Jugador', 'Clan', 'Campeón', 'Resultado'];

let partidas = [];

// Una fila por pick y por ban (20 por partida): fácil de filtrar y de hacer tablas dinámicas
function aFilas(p) {
  const filas = [];
  for (const lado of ['azul', 'rojo']) {
    const clanLado = lado === 'azul' ? p.clanAzul : p.clanRojo;
    const clanGanador = p.ganador === 'azul' ? p.clanAzul : p.clanRojo;
    const resultado = p.ganador === lado ? 'Victoria' : 'Derrota';
    p.picks[lado].forEach((campeon, i) => filas.push([p.fecha, p.jornada, p.fase, p.serie, p.partida, p.clanAzul, p.clanRojo,
      clanGanador, lado, 'pick', i + 1, ROLES[i], p.jugadores[lado][i] || '', clanLado, campeon || '', resultado]));
    p.bans[lado].forEach((campeon, i) => filas.push([p.fecha, p.jornada, p.fase, p.serie, p.partida, p.clanAzul, p.clanRojo,
      clanGanador, lado, 'ban', i + 1, '', '', clanLado, campeon || '', resultado]));
  }
  return filas;
}

// Reconstruye las partidas a partir de las filas de la hoja
function deFilas(filas) {
  const mapa = new Map();
  for (const f of filas) {
    if (f[0] === 'Fecha' || f.length < 15) continue;
    const [fecha, jornada, fase, serie, partida, clanAzul, clanRojo, clanGanador, lado, tipo, orden, , jugador, , campeon] = f;
    const ganador = clanGanador === 'azul' || clanGanador === 'rojo' ? clanGanador : (clanGanador === clanAzul ? 'azul' : 'rojo');
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
  if (hojaActiva()) {
    try {
      await asegurarPestana(PESTANA, CABECERA);
      partidas = deFilas(await leer(PESTANA));
      console.log(`Registro: ${partidas.length} partidas leídas de Google Sheets`);
      return partidas;
    } catch (e) {
      console.error('No se pudo leer el registro de Google Sheets, uso el archivo local:', e.message);
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
  if (hojaActiva()) await anadir(PESTANA, aFilas(p));
  return { enHoja: hojaActiva() };
}
