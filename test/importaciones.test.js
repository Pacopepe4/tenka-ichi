// Importaciones (server/importaciones.js): plantillas y tiers que el usuario dicta en el chat y que la web publicada lleva a
// la hoja al arrancar, una sola vez cada una. Con la web entera contra un Google Sheets de mentira (scripts/sheets-falso.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearSheetsFalso } from '../scripts/sheets-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let carpeta, web = null, urlWeb;
const esperar = ms => new Promise(r => setTimeout(r, ms));

const IMPORTACIONES = [
  { nombre: 'prueba KEMONO', plantillas: { KEMONO: ['JAAVAA', 'VASKOÑITO', 'KUCHAUU', 'DOMENACHE', 'FROZENRONIN'] },
    tiers: { 'KEMONO-TOP': 'C', 'KEMONO-JUNGLA': 'C', 'KEMONO-MEDIO': 'S', 'KEMONO-ADC': 'C', 'KEMONO-SUPPORT': 'C' } },
  // Solo el top: los demás puestos (null) se quedan como estén
  { nombre: 'prueba top de TORA', plantillas: { TORA: ['NUEVO', null, null, null, null] } },
];

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-importaciones-'));
  await writeFile(path.join(carpeta, 'importaciones.json'), JSON.stringify(IMPORTACIONES));
});
// Como la web publicada: plantillas con jugadores, KEMONO vacío y TORA sin top. La copia local es la que recibe una hoja
// sin jugadores; cada prueba empieza con la suya (guardar una plantilla también la escribe)
async function plantillasDeAntes() {
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  plantillas.KEMONO.jugadores = Array(5).fill('');
  plantillas.TORA.jugadores = ['', 'LUCASLOL', 'SPORFU', 'NARCISO', 'REXITO'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
}
after(async () => { await pararWeb(); await rm(carpeta, { recursive: true, force: true }); });

async function arrancarWeb(urlSheets, importar = '1') {
  const puerto = 4500 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER|GACHA_|IMPORTACIONES)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', CARPETA_DATOS: carpeta,
      ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'), ARCHIVO_IMPORTACIONES: path.join(carpeta, 'importaciones.json'),
      GOOGLE_URL_SHEETS: urlSheets, GOOGLE_SHEET_ID: 'hoja-de-prueba', GOOGLE_CREDENTIALS: 'prueba', ...(importar ? { IMPORTACIONES: importar } : {}) } });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  web.stdout.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) return; } catch {}
    await esperar(200);
  }
  throw new Error('La web no arranca');
}
async function pararWeb() {
  if (!web) return;
  const fin = new Promise(r => web.once('exit', r));
  web.kill();
  await fin;
  web = null;
}
function panel(accion, datos = {}) {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
    ws.on('open', () => ws.send(JSON.stringify({ tipo: 'accion', id: 1, accion, datos, clave: CLAVE })));
    ws.on('message', m => { const x = JSON.parse(m); if (x.tipo === 'respuesta') { ws.close(); ok(x); } });
    ws.on('error', mal);
  });
}
const fila = (hoja, clan) => hoja.leer('Plantillas').find(f => f[0] === clan);
const tiers = hoja => Object.fromEntries(hoja.leer('Tierlist').slice(1).filter(f => f[0] === 'Jugador').map(f => [f[1], f[5]]));
const hechas = hoja => JSON.parse(hoja.leer('Ajustes').find(f => f[0] === 'importaciones_hechas')?.[1] || '[]');
const clan = async id => (await (await fetch(`${urlWeb}/api/clan?id=${id}`)).json()).jugadores;

test('en la web publicada se aplican una vez: plantilla de KEMONO, sus tiers y el top de TORA, sin tocar lo demás', async () => {
  await plantillasDeAntes();
  const falso = crearSheetsFalso(), hoja = falso.estado;
  const url = await falso.abrir();
  try {
    await arrancarWeb(url);
    assert.deepEqual(fila(hoja, 'KEMONO').slice(1, 6), ['JAAVAA', 'VASKOÑITO', 'KUCHAUU', 'DOMENACHE', 'FROZENRONIN']);
    assert.deepEqual(fila(hoja, 'TORA').slice(1, 6), ['NUEVO', 'LUCASLOL', 'SPORFU', 'NARCISO', 'REXITO'], 'solo cambia el top');
    assert.deepEqual(fila(hoja, 'SARU').slice(1, 6), ['KINGKAI', 'MITSU', 'FREDDY', 'D4DT0R', 'SERGI']);
    assert.deepEqual(tiers(hoja), { 'KEMONO-TOP': 'C', 'KEMONO-JUNGLA': 'C', 'KEMONO-MEDIO': 'S', 'KEMONO-ADC': 'C', 'KEMONO-SUPPORT': 'C' });
    assert.deepEqual(hechas(hoja), ['prueba KEMONO', 'prueba top de TORA']);
    // En la ficha del clan, con sus tiers
    assert.deepEqual((await clan('KEMONO')).map(j => `${j.nombre}:${j.tier}`), ['JAAVAA:C', 'VASKOÑITO:C', 'KUCHAUU:S', 'DOMENACHE:C', 'FROZENRONIN:C']);
    // Con la tier list a medias (los de los otros clanes no tienen tier) los sobres siguen cerrados, y el panel dice por qué
    const g = (await panel('gachaEstado')).gacha;
    assert.equal(g.resumen.listos, false);
    assert.ok(g.resumen.faltanTiers.includes('SARU-TOP') && !g.resumen.faltanTiers.some(id => id.startsWith('KEMONO')));

    // El staff cambia una tier y un jugador desde el panel; al reiniciar la web, las importaciones no lo pisan
    assert.equal((await panel('tier', { tipo: 'jugador', id: 'KEMONO-MEDIO', tier: 'A' })).ok, true);
    assert.equal((await panel('plantilla', { clan: 'KEMONO', jugadores: ['JAAVAA', 'OTRO', 'KUCHAUU', 'DOMENACHE', 'FROZENRONIN'] })).ok, true);
    for (let i = 0; i < 40 && tiers(hoja)['KEMONO-MEDIO'] !== 'A'; i++) await esperar(100);
    await pararWeb();
    hoja.peticiones.length = 0;
    await arrancarWeb(url);
    assert.equal(tiers(hoja)['KEMONO-MEDIO'], 'A');
    assert.equal(fila(hoja, 'KEMONO')[2], 'OTRO');
    assert.deepEqual(hoja.peticiones.filter(p => ['Plantillas', 'Tierlist'].includes(p.pestana) && p.accion !== 'leer'), [], 'al arrancar otra vez no escribe nada');
  } finally { await pararWeb(); await falso.cerrar(); }
});

test('si la hoja falla a medias, la importación no queda apuntada y se repite en el siguiente arranque', async () => {
  await plantillasDeAntes();
  const falso = crearSheetsFalso(), hoja = falso.estado;
  const url = await falso.abrir();
  try {
    hoja.fallar = ({ accion, pestana }) => (accion === 'escribir' && pestana === 'Tierlist' ? 'antes' : null);
    await arrancarWeb(url);
    assert.deepEqual(hechas(hoja), [], 'la de KEMONO falló al guardar las tiers y la siguiente espera a que salga');
    hoja.fallar = null;
    await pararWeb();
    await arrancarWeb(url);
    assert.deepEqual(hechas(hoja), ['prueba KEMONO', 'prueba top de TORA'], 'en el siguiente arranque salen las dos, en su orden');
    assert.equal(tiers(hoja)['KEMONO-MEDIO'], 'S');
  } finally { await pararWeb(); await falso.cerrar(); }
});

test('en local y en las pruebas no se aplica ninguna, salvo que se pida', async () => {
  await plantillasDeAntes();
  const falso = crearSheetsFalso(), hoja = falso.estado;
  const url = await falso.abrir();
  try {
    await arrancarWeb(url, '');
    assert.equal(fila(hoja, 'KEMONO').slice(1, 6).filter(Boolean).length, 0, 'KEMONO sigue vacío');
    assert.deepEqual(hechas(hoja), []);
  } finally { await pararWeb(); await falso.cerrar(); }
});
