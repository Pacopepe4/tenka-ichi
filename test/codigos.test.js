// Códigos de directo con dos instancias de la web a la vez (server/codigos.js). Mientras Render despliega, la versión
// vieja y la nueva están vivas: el panel y el overlay pueden crear el código en una y los canjes entrar por la otra,
// que solo leyó los ajustes al arrancar. Pasó en el directo del 15/11/2026 y todos los canjes salían «no vale».
// Aquí la «otra instancia» escribe el código directamente en los ajustes guardados (data/ajustes.json).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let carpeta, codigos, gacha;
const ana = { id: 'd-ana', nombre: 'Ana' }, beto = { id: 'd-beto', nombre: 'Beto' };

// Lo que haría la otra instancia: guardar su código en los ajustes, con lo demás que hubiera
async function otraInstanciaCrea(texto, minutos = 10) {
  const archivo = path.join(carpeta, 'ajustes.json');
  const todo = JSON.parse(await readFile(archivo, 'utf8').catch(() => '{}'));
  todo.codigo_directo = JSON.stringify({ texto, sobres: 2, caduca: Date.now() + minutos * 60000, maximo: 0, visible: true });
  await writeFile(archivo, JSON.stringify(todo));
}

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-codigos-'));
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_|RENDER|GACHA_)/.test(k)) delete process.env[k];
  process.env.CARPETA_DATOS = carpeta;
  const { cargarAjustes } = await import('../server/ajustes.js');
  await cargarAjustes();
  gacha = await import('../server/gacha.js');
  await gacha.cargarGacha();
  codigos = await import('../server/codigos.js');
});
after(() => rm(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

test('el código que crea esta instancia se canjea como siempre', async () => {
  const c = await codigos.crearCodigo({ sobres: 1, minutos: 10 });
  assert.deepEqual(await codigos.canjearCodigo(ana, c.texto.toLowerCase()), { sobres: 1 });
  assert.equal(gacha.estadoUsuario(ana.id).sobres, 1);
});

test('un código que ha creado otra instancia también vale, y pasa a ser el de esta', async () => {
  await otraInstanciaCrea('KKKKKK');
  assert.notEqual(codigos.estadoCodigo().texto, 'KKKKKK', 'esta instancia aún tiene el suyo en memoria');
  assert.deepEqual(await codigos.canjearCodigo(beto, 'kkk-kkk'), { sobres: 2 });
  assert.equal(gacha.estadoUsuario(beto.id).sobres, 2);
  assert.equal(codigos.estadoCodigo().texto, 'KKKKKK', 'el más nuevo pasa a ser el de esta instancia (y el del overlay)');
  await assert.rejects(codigos.canjearCodigo(beto, 'KKKKKK'), /Ya has canjeado este código/);
});

test('un código que no está ni en memoria ni en la hoja sigue sin valer', async () => {
  await assert.rejects(codigos.canjearCodigo(ana, 'NOEXISTE'), /no vale/);
});

test('un código de otra instancia más viejo vale para su canje, pero no sustituye al de esta', async () => {
  const nuevo = await codigos.crearCodigo({ sobres: 1, minutos: 30 });
  await otraInstanciaCrea('MMMMMM', 5);
  assert.deepEqual(await codigos.canjearCodigo(ana, 'MMMMMM'), { sobres: 2 });
  assert.equal(codigos.estadoCodigo().texto, nuevo.texto);
});
