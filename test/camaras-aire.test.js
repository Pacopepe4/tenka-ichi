// EGM 22/11 (B5): el relé del PC 2 enciende las webcams de los casters con camarasEnAire del estado, que es lo mismo que
// pinta el overlay: marcada en el panel, con partida en marcha y con el marcador a la vista
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { puertoLibre, esperarWeb, pararWeb } from './web-de-prueba.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let carpeta, web, puerto;

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-camaras-'));
  puerto = await puertoLibre();
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER|GACHA_|IMPORTACIONES)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: 'ignore',
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', CARPETA_DATOS: carpeta } });
  await esperarWeb(web, `http://127.0.0.1:${puerto}`);
});
after(async () => {
  await pararWeb(web);
  await rm(carpeta, { recursive: true, force: true });
});

test('camarasEnAire: solo con la casilla, la partida en marcha y el marcador a la vista', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ws`);
  let estado = null, id = 0;
  const pendientes = new Map();
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.tipo === 'estado') estado = m.estado;
    if (m.tipo === 'respuesta' && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  });
  await new Promise(r => ws.once('open', r));
  const accion = (accion, datos) => new Promise(r => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ tipo: 'accion', id: n, accion, datos, clave: CLAVE })); });
  const esperarA = async (valor, quePasa) => {
    for (let i = 0; i < 60 && JSON.stringify(estado?.camarasEnAire) !== JSON.stringify(valor); i++) await new Promise(r => setTimeout(r, 100));
    assert.deepEqual(estado?.camarasEnAire, valor, quePasa);
  };
  try {
    await accion('ingame', { camaras: [{ activa: true }, { activa: true }] });
    await esperarA([false, false], 'marcadas pero sin partida: no');
    await accion('partidaPrueba', { activa: true });
    await esperarA([true, true], 'con partida: sí');
    await accion('ingame', { camaras: [{}, { activa: false }] });
    await esperarA([true, false], 'la 2 desmarcada');
    await accion('partidaVisible', { visible: false });
    await esperarA([false, false], 'marcador oculto: no');
    await accion('partidaVisible', { visible: true });
    await esperarA([true, false]);
    await accion('partidaPrueba', { activa: false });
    await esperarA([false, false], 'al acabar la partida: no');
  } finally { ws.close(); }
});
