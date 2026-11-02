import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { crearSalasRealizador } from '../server/realizador.js';

const sala = clave => createHash('sha256').update(`realizador:${clave}`).digest('hex');

function conectar(puerto) {
  const ws = new WebSocket(`ws://127.0.0.1:${puerto}/realizador`);
  const cola = [];
  const esperas = [];
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); const e = esperas.shift(); e ? e(d) : cola.push(d); });
  ws.siguiente = () => (cola.length ? Promise.resolve(cola.shift()) : new Promise(r => esperas.push(r)));
  return new Promise(r => ws.addEventListener('open', () => r(ws)));
}

test('los dos PCs de la misma sala se pasan los mensajes; otra sala no los ve', async () => {
  const salas = crearSalasRealizador();
  const servidor = http.createServer();
  servidor.on('upgrade', (req, s, h) => salas.handleUpgrade(req, s, h));
  await new Promise(r => servidor.listen(0, r));
  const { port } = servidor.address();
  try {
    const pc2 = await conectar(port);
    pc2.send(JSON.stringify({ tipo: 'unirse', sala: sala('tenka123'), papel: 'pc2' }));
    assert.deepEqual(await pc2.siguiente(), { tipo: 'unido', papel: 'pc2', companero: false });

    const intruso = await conectar(port);
    intruso.send(JSON.stringify({ tipo: 'unirse', sala: sala('otra'), papel: 'pc1' }));
    assert.equal((await intruso.siguiente()).companero, false);

    const pc1 = await conectar(port);
    pc1.send(JSON.stringify({ tipo: 'unirse', sala: sala('tenka123'), papel: 'pc1' }));
    assert.deepEqual(await pc1.siguiente(), { tipo: 'unido', papel: 'pc1', companero: true });
    assert.deepEqual(await pc2.siguiente(), { tipo: 'companero', conectado: true });

    pc1.send(JSON.stringify({ tipo: 'guion', planos: [1, 2] }));
    assert.deepEqual(await pc2.siguiente(), { tipo: 'guion', planos: [1, 2] });
    pc2.send(JSON.stringify({ tipo: 'estado', tAntena: 12 }));
    assert.deepEqual(await pc1.siguiente(), { tipo: 'estado', tAntena: 12 });

    pc1.close();
    assert.deepEqual(await pc2.siguiente(), { tipo: 'companero', conectado: false });
    intruso.close();
    pc2.close();
  } finally {
    salas.cerrar();
    servidor.closeAllConnections?.();
    servidor.close();
  }
});

test('sin unirse a una sala válida no se pasa nada', async () => {
  const salas = crearSalasRealizador();
  const servidor = http.createServer();
  servidor.on('upgrade', (req, s, h) => salas.handleUpgrade(req, s, h));
  await new Promise(r => servidor.listen(0, r));
  try {
    const ws = await conectar(servidor.address().port);
    const cerrado = new Promise(r => ws.addEventListener('close', r));
    ws.send(JSON.stringify({ tipo: 'unirse', sala: 'corta', papel: 'pc1' }));
    assert.equal((await ws.siguiente()).tipo, 'error');
    await cerrado;
    assert.equal(salas.salas.size, 0);
  } finally { salas.cerrar(); servidor.close(); }
});
