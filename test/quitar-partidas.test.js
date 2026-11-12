// Quitar partidas de prueba (server/importaciones.js, «quitarPartidas»): salen de «Registro» y «Estadisticas», pero
// antes se copian a «RegistroQuitadas» y «EstadisticasQuitadas». Con la web entera contra la hoja de mentira
import { test, before, after } from 'node:test';
import { puertoLibre, esperarWeb, pararWeb as pararProceso } from './web-de-prueba.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearSheetsFalso } from '../scripts/sheets-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let carpeta, web = null, urlWeb;
const esperar = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-quitar-'));
  await writeFile(path.join(carpeta, 'importaciones.json'), JSON.stringify([
    { nombre: 'quitar la de prueba', quitarPartidas: { antesDe: '2026-11-08', clanes: ['KAIJU', 'SARU'] } }]));
});
after(async () => { await pararWeb(); await rm(carpeta, { recursive: true, force: true }); });

async function arrancarWeb(urlSheets) {
  const puerto = await puertoLibre();
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER|GACHA_|IMPORTACIONES)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: 'ignore',
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: 'clave', SESION_SECRETO: 'secreto', CARPETA_DATOS: carpeta,
      ARCHIVO_PLANTILLAS: path.join(RAIZ, 'data-proyecto', 'plantillas.json'), ARCHIVO_IMPORTACIONES: path.join(carpeta, 'importaciones.json'),
      GOOGLE_URL_SHEETS: urlSheets, GOOGLE_SHEET_ID: 'hoja', GOOGLE_CREDENTIALS: 'prueba', IMPORTACIONES: '1' } });
  await esperarWeb(web, urlWeb);
}
async function pararWeb() { if (!web) return; await pararProceso(web); web = null; }

const CAB_REG = ['Fecha', 'Jornada', 'Fase', 'Serie', 'Partida', 'Clan azul', 'Clan rojo', 'Ganador', 'Lado', 'Tipo', 'Orden', 'Rol', 'Jugador', 'Clan', 'Campeón', 'Resultado'];
const filasPartida = (fecha, azul, rojo) => ['azul', 'rojo'].flatMap(lado => ['pick', 'ban'].flatMap(tipo => [1, 2, 3, 4, 5].map(o =>
  [fecha, 'Jornada 1', 'Fase de liga', '1', '1', azul, rojo, azul, lado, tipo, String(o), '', '', lado === 'azul' ? azul : rojo, 'Ahri', lado === 'azul' ? 'Victoria' : 'Derrota'])));
const CAB_EST = ['Fecha', 'Partida', 'Jornada', 'Fase', 'Clan', 'Rol', 'Jugador', 'Id'];
const hechas = hoja => JSON.parse(hoja.leer('Ajustes')?.find(f => f[0] === 'importaciones_hechas')?.[1] || '[]');

test('la de prueba sale de Registro y Estadisticas, copiada antes a sus pestañas «Quitadas»', async () => {
  const falso = crearSheetsFalso({ hojas: {
    Registro: [CAB_REG, ...filasPartida('2026-10-06', 'KAIJU', 'SARU')],
    Estadisticas: [CAB_EST, ['2026-10-06T19:00:00.000Z', 'p1', 'Jornada 1', 'Fase de liga', 'KAIJU', 'TOP', 'DESPO', 'KAIJU-TOP']],
  } });
  const hoja = falso.estado, url = await falso.abrir();
  try {
    await arrancarWeb(url);
    assert.equal(hoja.leer('Registro').filter(f => f.some(Boolean)).length, 1, 'solo la cabecera');
    assert.equal(hoja.leer('RegistroQuitadas').length, 21);
    assert.equal(hoja.leer('Estadisticas').filter(f => f.some(Boolean)).length, 1);
    assert.equal(hoja.leer('EstadisticasQuitadas').length, 2);
    assert.equal((await (await fetch(`${urlWeb}/api/liga`)).json()).partidas, 0);
    assert.deepEqual(hechas(hoja), ['quitar la de prueba']);
  } finally { await pararWeb(); await falso.cerrar(); }
});

test('si en Registro hay más partidas que la de prueba, no toca nada y no queda apuntada', async () => {
  const falso = crearSheetsFalso({ hojas: {
    Registro: [CAB_REG, ...filasPartida('2026-10-06', 'KAIJU', 'SARU'), ...filasPartida('2026-11-08', 'KAIJU', 'TORA')],
  } });
  const hoja = falso.estado, url = await falso.abrir();
  try {
    await arrancarWeb(url);
    assert.equal(hoja.leer('Registro').length, 41);
    assert.equal(hoja.leer('RegistroQuitadas'), null);
    assert.deepEqual(hechas(hoja), []);
  } finally { await pararWeb(); await falso.cerrar(); }
});
