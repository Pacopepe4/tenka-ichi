// La entrada del panel (public/panel/entrada.js) pregunta a /api/clave si la contraseña vale; quien falla muchas espera
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
let carpeta, web, urlWeb;
const esperar = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-entrada-'));
  const puerto = 4600 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER|GACHA_|IMPORTACIONES)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, stdio: 'ignore',
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', CARPETA_DATOS: carpeta } });
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) return; } catch {}
    await esperar(200);
  }
  throw new Error('La web no arranca');
});
after(async () => {
  const fin = new Promise(r => web.once('exit', r));
  web.kill();
  await fin;
  await rm(carpeta, { recursive: true, force: true });
});

const probar = (clave, ip = '10.0.0.1') => fetch(`${urlWeb}/api/clave`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ clave }) }).then(r => r.status);

test('la buena entra y la mala no; tras 10 malas desde la misma dirección, ni la buena hasta que pase el freno', async () => {
  assert.equal(await probar(CLAVE), 200);
  assert.equal(await probar('otra'), 401);
  assert.equal(await probar(CLAVE), 200, 'acertar borra los fallos');
  for (let i = 0; i < 10; i++) assert.equal(await probar(`mala-${i}`), 401);
  assert.equal(await probar(CLAVE), 429);
  assert.equal(await probar(CLAVE, '10.0.0.2'), 200, 'otra dirección no está frenada');
  assert.equal((await fetch(`${urlWeb}/api/clave`)).status, 405);
});

test('la página del panel trae la entrada y deja el resto sin poder tocar hasta entrar', async () => {
  const html = await (await fetch(`${urlWeb}/panel/`)).text();
  assert.match(html, /id="entrada"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /<header class="barra" inert>/);
  assert.match(html, /<div class="disposicion" inert>/);
  assert.ok(html.indexOf('entrada.js') < html.indexOf('panel.js'), 'la entrada carga antes que el panel');
  assert.doesNotMatch(html, /id="clave" type="password"/, 'la contraseña ya no va en la barra');
});
