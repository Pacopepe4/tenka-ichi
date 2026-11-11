// Sala del realizador (11/11): el PC 1 la apunta en la web y el PC 2 la recoge, solo con la contraseña del panel
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let carpeta, web, urlWeb;
const esperar = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-sala-realizador-'));
  const puerto = 4300 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', CARPETA_DATOS: carpeta } });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) break; } catch {}
    await esperar(250);
  }
});

after(async () => {
  web?.kill();
  await rm(carpeta, { recursive: true, force: true }).catch(() => {});
});

function conectar() {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
  const c = { ws, id: 0, esperas: new Map(), estados: [] };
  ws.on('message', m => {
    const x = JSON.parse(m);
    if (x.tipo === 'estado') c.estados.push(x.estado);
    if (x.tipo === 'respuesta') { c.esperas.get(x.id)?.(x); c.esperas.delete(x.id); }
  });
  c.accion = (accion, datos, clave = CLAVE) => new Promise(ok => {
    const id = ++c.id;
    c.esperas.set(id, ok);
    ws.send(JSON.stringify({ tipo: 'accion', id, accion, datos, clave }));
  });
  return new Promise((ok, mal) => { ws.on('open', () => ok(c)); ws.on('error', mal); });
}

test('el PC 1 apunta la sala y el PC 2 la recoge; con otra contraseña, no', async () => {
  const pc1 = await conectar();
  const pc2 = await conectar();
  try {
    assert.deepEqual(await pc2.accion('salaRealizador', {}), { tipo: 'respuesta', id: 1, ok: true, sala: null }, 'sin sala todavía');
    const sala = 'a'.repeat(64);
    assert.equal((await pc1.accion('salaRealizador', { sala })).sala, sala);
    assert.equal((await pc2.accion('salaRealizador', {})).sala, sala);
    const mal = await pc2.accion('salaRealizador', {}, 'otra-clave');
    assert.equal(mal.ok, false);
    assert.match(mal.error, /Contraseña/);
    assert.equal(mal.sala, undefined, 'sin la contraseña no se da la sala');
    assert.equal((await pc1.accion('salaRealizador', { sala: 'no-vale' })).ok, false);
    await esperar(300);
    assert.ok(!JSON.stringify(pc2.estados).includes(sala), 'la sala no va en el estado que se reparte a todos');
  } finally { pc1.ws.close(); pc2.ws.close(); }
});
