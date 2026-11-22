// Modo arcade (22/11): el overlay de Gokudō encima de una partida normal del LoL (el directo personal de Livir)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { puertoLibre, esperarWeb, pararWeb } from './web-de-prueba.js';
import { ajustesArcade, FABRICA } from '../public/arcade/arcade.js';
import { coleccionArcade, urlArcade } from '../scripts/arcade-obs.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('los ajustes de la página: de fábrica abajo a la izquierda como en la liga, y lo que venga mal no lo descoloca', () => {
  const a = ajustesArcade('?nombre=Livir&usuario=liviir_');
  assert.deepEqual(a, { nombre: 'Livir', usuario: '@liviir_', x: 16, y: 856, ancho: 320, alto: 180, color: null, guia: false });
  assert.equal(a.y + a.alto + 44, 1080, 'la placa llega justo al borde de abajo');
  assert.equal(ajustesArcade('?usuario=@@liviir_').usuario, '@liviir_');
  assert.equal(ajustesArcade('').nombre, FABRICA.nombre);
  assert.equal(ajustesArcade('?usuario=').usuario, '', 'sin usuario, sin @');
  assert.equal(ajustesArcade('?color=e0303a').color, '#E0303A');
  assert.equal(ajustesArcade('?color=rojo').color, null, 'un color que no es hex no cuela');
  const fuera = ajustesArcade('?x=5000&y=5000&ancho=640');
  assert.deepEqual([fuera.x + fuera.ancho <= 1920, fuera.y + fuera.alto + 44 <= 1080], [true, true], 'siempre dentro de la pantalla');
  assert.equal(ajustesArcade('?ancho=abc').ancho, 320);
  assert.equal(ajustesArcade('?guia=1').guia, true);
});

test('no tapa la interfaz del LoL del jugador: ni habilidades ni objetos (desde x ~560), ni el minimapa, ni el marcador de arriba', () => {
  const a = ajustesArcade('?nombre=Livir');
  const caja = { x: a.x, y: a.y - 36, derecha: a.x + a.ancho, abajo: 1080 };  // con la pestaña 極道 de encima
  assert.ok(caja.derecha < 560, 'a la izquierda de las habilidades y los objetos');
  assert.ok(caja.derecha < 1650, 'lejos del minimapa');
  assert.ok(caja.y > 120, 'lejos del marcador de arriba');
});

test('la colección de OBS: juego, webcam en el hueco del overlay y overlay; sin alertas ni nada de Gokudō con token', () => {
  const c = coleccionArcade({ nombre: 'Livir', usuario: 'liviir_' });
  assert.equal(c.name, 'Gokudō · Arcade (Livir)');
  const escena = c.sources.find(s => s.id === 'scene');
  assert.deepEqual(escena.settings.items.map(i => i.name), ['Juego LoL', 'Camara Livir', 'Overlay Gokudō arcade']);
  const cam = escena.settings.items[1], a = ajustesArcade('?nombre=Livir');
  assert.deepEqual([cam.pos.x, cam.pos.y, cam.bounds.x, cam.bounds.y, cam.bounds_crop], [a.x, a.y, a.ancho, a.alto, true]);
  assert.equal(c.sources.find(s => s.name === 'Camara Livir').settings.deactivate_when_not_showing, true);
  assert.equal(c.sources.find(s => s.name === 'Overlay Gokudō arcade').settings.url, 'https://gokudo.es/arcade/?nombre=Livir&usuario=liviir_');
  const texto = JSON.stringify(c);
  assert.doesNotMatch(texto, /alertas|twitch|kick|token/i, 'las alertas son las de su canal: no va nada de Gokudō');
  assert.equal(urlArcade({ nombre: 'Livir', usuario: 'liviir_', web: 'http://localhost:3000' }), 'http://localhost:3000/arcade/?nombre=Livir&usuario=liviir_');
});

test('el archivo para descargar está al día con el generador (salvo los uuid)', () => {
  const sinUuid = c => JSON.parse(JSON.stringify(c, (k, v) => (k === 'uuid' || k === 'source_uuid' ? undefined : v)));
  const guardado = JSON.parse(readFileSync(path.join(RAIZ, 'public', 'arcade', 'gokudo-arcade-livir.json'), 'utf8'));
  assert.deepEqual(sinUuid(guardado), sinUuid(coleccionArcade({ nombre: 'Livir', usuario: 'liviir_' })));
});

let carpeta, web, url;
before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-arcade-'));
  const puerto = await puertoLibre();
  url = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER|GACHA_|IMPORTACIONES)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: 'ignore', env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: 'clave-de-prueba', SESION_SECRETO: 's', CARPETA_DATOS: carpeta } });
  await esperarWeb(web, url);
});
after(async () => { await pararWeb(web); await rm(carpeta, { recursive: true, force: true }); });

test('la web sirve la página, su módulo, la colección y el LEEME', async () => {
  const pagina = await fetch(`${url}/arcade/?nombre=Livir&usuario=liviir_`);
  assert.equal(pagina.status, 200);
  assert.match(await pagina.text(), /極道/);
  assert.equal((await fetch(`${url}/arcade/arcade.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  const json = await fetch(`${url}/arcade/gokudo-arcade-livir.json`);
  assert.equal(json.status, 200);
  assert.equal((await json.json()).name, 'Gokudō · Arcade (Livir)');
  assert.match((await fetch(`${url}/arcade/LEEME.md`)).headers.get('content-type'), /text\/markdown/);
});
