// El sorteo del calendario en directo: las 24 bolas, lo que ve el público (nunca lo que falta ni la semilla antes de
// tiempo), el guardado solo al final, el ensayo y la web entera con su canal «sorteo».
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { crearSorteo, bolasDe } from '../server/sorteo.js';
import { sortear } from '../server/competicion.js';
import { TEMPORADA } from '../server/formato.js';

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Un sorteo con el guardado de mentira, para ver cuándo se guarda
function nuevo({ falla = false } = {}) {
  const fijados = [], avisos = [];
  const s = crearSorteo({
    preparar: (participantes, semilla) => sortear(participantes, Number(semilla) || 77),
    fijar: async cal => { if (falla) throw new Error('Sheets no responde'); fijados.push(cal); },
  });
  s.alCambiar(v => avisos.push(v));
  return { s, fijados, avisos };
}
const empezar = (s, extra = {}) => s.iniciar({ participantes: TEMPORADA.clanes, semilla: 2026, ...extra });

test('las 24 bolas: cada jornada saca los seis clanes una vez, de dos en dos (lado azul y lado rojo)', () => {
  const cal = sortear(TEMPORADA.clanes, 2026);
  const bolas = bolasDe(cal);
  assert.equal(bolas.length, 24);
  assert.deepEqual(bolas.map(b => b.n), Array.from({ length: 24 }, (_, i) => i + 1));
  for (let j = 1; j <= 4; j++) {
    const de = bolas.filter(b => b.jornada === j);
    assert.deepEqual(de.map(b => b.clan).sort(), [...TEMPORADA.clanes].sort(), `jornada ${j}: un bombo de seis`);
  }
  // Las parejas de bolas son los cruces del calendario, azul primero
  for (let i = 0; i < 24; i += 2) {
    const cruce = cal.jornadas.flat()[i / 2];
    assert.deepEqual([bolas[i].lado, bolas[i].clan, bolas[i].cruce], ['azul', cruce.azul, cruce.id]);
    assert.deepEqual([bolas[i + 1].lado, bolas[i + 1].clan, bolas[i + 1].cruce], ['rojo', cruce.rojo, cruce.id]);
  }
});

test('el público solo ve las bolas que han salido y la semilla, al terminar', async () => {
  const { s } = nuevo();
  assert.deepEqual(s.vista(), { estado: 'ninguno' });
  const r = empezar(s);
  assert.deepEqual(r, { semilla: 2026, total: 24 });
  let v = s.vista();
  assert.equal(v.estado, 'en curso');
  assert.deepEqual(v.sacadas, []);
  assert.equal(v.semilla, null);
  for (let i = 0; i < 5; i++) await s.siguiente();
  v = s.vista();
  assert.equal(v.sacadas.length, 5);
  assert.equal(v.semilla, null);
  // Nada de lo que falta viaja: ni el calendario entero ni las bolas siguientes
  const texto = JSON.stringify(v);
  assert.ok(!('bolas' in v) && !('calendario' in v));
  const todas = bolasDe(sortear(TEMPORADA.clanes, 2026));
  assert.ok(!texto.includes(`"n":6,`), 'la bola 6 aún no ha salido');
  assert.deepEqual(v.sacadas, todas.slice(0, 5));
});

test('el calendario solo se guarda al sacar la última bola, y la semilla sale entonces', async () => {
  const { s, fijados, avisos } = nuevo();
  empezar(s);
  for (let i = 0; i < 23; i++) await s.siguiente();
  assert.equal(fijados.length, 0, 'con 23 bolas todavía no hay calendario');
  assert.equal(s.vista().estado, 'en curso');
  await s.siguiente();
  const v = s.vista();
  assert.equal(fijados.length, 1);
  assert.deepEqual(fijados[0], sortear(TEMPORADA.clanes, 2026));
  assert.deepEqual([v.estado, v.guardado, v.semilla, v.sacadas.length], ['terminado', true, 2026, 24]);
  // La última bola se avisa nada más sacarla y otra vez cuando ya está guardado
  const ultimos = avisos.slice(-2);
  assert.deepEqual(ultimos.map(a => [a.estado, a.sacadas.length, a.guardado]), [['terminado', 24, null], ['terminado', 24, true]]);
  await assert.rejects(s.siguiente(), /Ya han salido las 24 bolas/);
});

test('un ensayo hace lo mismo pero no guarda nada', async () => {
  const { s, fijados } = nuevo();
  empezar(s, { ensayo: true });
  for (let i = 0; i < 24; i++) await s.siguiente();
  const v = s.vista();
  assert.deepEqual([v.estado, v.ensayo, v.guardado, v.semilla], ['terminado', true, null, 2026]);
  assert.equal(fijados.length, 0);
});

test('si no se puede guardar, el sorteo termina igual y se sabe que no está guardado', async () => {
  const { s } = nuevo({ falla: true });
  empezar(s);
  const error = console.error; console.error = () => {};
  try { for (let i = 0; i < 24; i++) await s.siguiente(); } finally { console.error = error; }
  assert.deepEqual([s.vista().estado, s.vista().guardado], ['terminado', false]);
});

test('no se empieza otro sorteo con uno en marcha; cancelar lo borra y terminado deja empezar de nuevo', async () => {
  const { s } = nuevo();
  await assert.rejects(s.siguiente(), /No hay ningún sorteo/);
  empezar(s);
  assert.throws(() => empezar(s), /Ya hay un sorteo en marcha/);
  await s.siguiente();
  s.cancelar();
  assert.deepEqual(s.vista(), { estado: 'ninguno' });
  empezar(s, { ensayo: true });
  for (let i = 0; i < 24; i++) await s.siguiente();
  const primero = s.vista().id;
  empezar(s, { ensayo: true });
  assert.notEqual(s.vista().id, primero, 'cada sorteo tiene su identificador');
});

test('en automático salen solas, a su ritmo, y se paran al terminar', async () => {
  const { s } = nuevo();
  empezar(s, { ensayo: true });
  s.automatico(10);
  assert.equal(s.vista().cadaMs, 10);
  for (let i = 0; i < 300 && s.vista().estado !== 'terminado'; i++) await esperar(10);
  assert.equal(s.vista().estado, 'terminado');
  assert.equal(s.vista().sacadas.length, 24);
  assert.equal(s.vista().cadaMs, 0, 'al terminar deja de ser automático');
  // Con 0 se para
  empezar(s, { ensayo: true });
  s.automatico(10);
  s.automatico(0);
  await esperar(60);
  assert.equal(s.vista().sacadas.length, 0);
});

// ---------- la web entera ----------
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let carpeta, web, urlWeb;

function conectar(canal) {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws${canal ? `?canal=${canal}` : ''}`);
  const c = { ws, mensajes: [], id: 0, esperas: new Map() };
  ws.on('message', m => {
    const x = JSON.parse(m);
    c.mensajes.push(x);
    if (x.tipo === 'respuesta') { c.esperas.get(x.id)?.(x); c.esperas.delete(x.id); }
  });
  c.accion = (accion, datos = {}) => new Promise(ok => {
    const id = ++c.id;
    c.esperas.set(id, ok);
    ws.send(JSON.stringify({ tipo: 'accion', id, accion, datos, clave: CLAVE }));
  });
  c.tipos = () => c.mensajes.map(m => m.tipo);
  c.sorteos = () => c.mensajes.filter(m => m.tipo === 'sorteo').map(m => m.sorteo);
  return new Promise((ok, mal) => { ws.on('open', () => ok(c)); ws.on('error', mal); });
}

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-sorteo-'));
  const puerto = 4300 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', CARPETA_DATOS: carpeta } });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) break; } catch {}
    await esperar(200);
  }
});
after(async () => {
  if (web) { const fin = new Promise(r => web.once('exit', r)); web.kill(); await fin; }
  await rm(carpeta, { recursive: true, force: true });
});

test('la web reparte el sorteo a todos; la portada, por su canal, sin el estado del draft', async () => {
  const panel = await conectar(), portada = await conectar('sorteo');
  await esperar(300);
  assert.deepEqual(portada.tipos().sort(), ['hola', 'sorteo'], 'la portada no recibe ni el estado ni la partida');
  assert.ok(panel.tipos().includes('estado') && panel.tipos().includes('partida') && panel.tipos().includes('sorteo'));
  assert.deepEqual(portada.sorteos().at(-1), { estado: 'ninguno' });

  const inicio = await panel.accion('sorteoIniciar', { semilla: 5, ensayo: true });
  assert.deepEqual([inicio.ok, inicio.semilla, inicio.total], [true, 5, 24]);
  await esperar(150);
  assert.deepEqual([portada.sorteos().at(-1).estado, portada.sorteos().at(-1).sacadas.length, portada.sorteos().at(-1).semilla], ['en curso', 0, null]);
  assert.equal((await panel.accion('sorteoIniciar', { ensayo: true })).ok, false, 'no se empieza otro con uno en marcha');

  const esperadas = bolasDe(sortear(TEMPORADA.clanes, 5));
  assert.equal((await panel.accion('sorteoBola')).ok, true);
  await esperar(150);
  assert.deepEqual(portada.sorteos().at(-1).sacadas, esperadas.slice(0, 1));

  // Quien entra a mitad ve lo que ya ha salido
  const tarde = await conectar('sorteo');
  await esperar(250);
  assert.deepEqual(tarde.sorteos().at(-1).sacadas, esperadas.slice(0, 1));

  // El calendario no existe hasta el final, y un ensayo no lo crea nunca
  for (let i = 1; i < 24; i++) assert.equal((await panel.accion('sorteoBola')).ok, true);
  await esperar(200);
  const fin = portada.sorteos().at(-1);
  assert.deepEqual([fin.estado, fin.ensayo, fin.semilla, fin.sacadas.length], ['terminado', true, 5, 24]);
  assert.equal((await (await fetch(`${urlWeb}/api/competicion`)).json()).calendario, null);

  assert.equal((await panel.accion('sorteoCancelar')).ok, true);
  await esperar(150);
  assert.deepEqual(portada.sorteos().at(-1), { estado: 'ninguno' });
  assert.ok(!portada.tipos().includes('estado') && !portada.tipos().includes('partida'), 'en ningún momento le llega el estado del draft');
  for (const c of [panel, portada, tarde]) c.ws.close();
});

test('el automático lo cambia el panel y se limita entre 5 y 30 segundos', async () => {
  const panel = await conectar(), portada = await conectar('sorteo');
  await panel.accion('sorteoIniciar', { semilla: 9, ensayo: true });
  assert.equal((await panel.accion('sorteoAuto', { activo: true, segundos: 1 })).ok, true);
  await esperar(150);
  assert.equal(portada.sorteos().at(-1).cadaMs, 5000, 'aunque pida 1 s, el mínimo es 5');
  await panel.accion('sorteoAuto', { activo: true, segundos: 500 });
  await esperar(150);
  assert.equal(portada.sorteos().at(-1).cadaMs, 30000);
  await panel.accion('sorteoAuto', { activo: false });
  await esperar(150);
  assert.equal(portada.sorteos().at(-1).cadaMs, 0);
  await panel.accion('sorteoCancelar');
  for (const c of [panel, portada]) c.ws.close();
});
