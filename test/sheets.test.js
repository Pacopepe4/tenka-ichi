// server/sheets.js contra un Google Sheets de mentira (scripts/sheets-falso.js), que hace lo que de la hoja de verdad
// puede dar un disgusto: toma por fechas o números lo que lo parece y no deja escribir de golpe más filas de las que
// tiene una pestaña.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearSheetsFalso, comoTecleado } from '../scripts/sheets-falso.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CABECERA = ['Fecha', 'ID de usuario', 'Usuario', 'Tipo', 'Detalle', 'Cantidad', 'Rareza'];
let falso, hoja, s;

before(async () => {
  falso = crearSheetsFalso();
  hoja = falso.estado;
  Object.assign(process.env, { GOOGLE_URL_SHEETS: await falso.abrir(), GOOGLE_SHEET_ID: 'hoja-de-prueba', GOOGLE_CREDENTIALS: 'prueba' });
  s = await import('../server/sheets.js');
});
after(() => falso.cerrar());
beforeEach(() => { hoja.peticiones.length = 0; hoja.fallar = null; });

test('la hoja de mentira cambia lo mismo que cambiaría la de verdad: fechas, horas y números', () => {
  assert.equal(comoTecleado('2026-10-10'), '10/10/2026', 'una fecha no vuelve como se mandó');
  assert.equal(comoTecleado('007'), '7');
  assert.equal(comoTecleado('12:30'), '12:30:00');
  assert.equal(comoTecleado(-1), '-1');
  // Lo que el gachapon guarda empieza por letras o no es ni fecha ni número: vuelve igual
  for (const texto of ['T2', 'temporada', 'tw:123456:7890', '2001:ana_tw', '2026-10-10T18:00:00.000Z', 'discord-123456789012345678', 'KAIJU-TOP', 'S+'])
    assert.equal(comoTecleado(texto), texto);
});

test('crear una pestaña con su cabecera, añadirle filas y leerla', async () => {
  await s.asegurarPestana('GachaponT2', CABECERA);
  assert.deepEqual(await s.leer('GachaponT2'), [CABECERA]);
  assert.equal(hoja.peticiones.at(-1).rango, 'GachaponT2!A:Z', 'el nombre, de letras y números, va sin comillas en el rango');
  await s.anadir('GachaponT2', [['2026-10-03T18:00:00.000Z', 'discord-1', 'Ana', 'alta', '', 3, '']]);
  assert.deepEqual((await s.leer('GachaponT2'))[1], ['2026-10-03T18:00:00.000Z', 'discord-1', 'Ana', 'alta', '', '3'], 'sin las celdas vacías del final');
  // Si ya existe no se vuelve a crear ni se le toca la cabecera
  hoja.peticiones.length = 0;
  await s.asegurarPestana('GachaponT2', CABECERA);
  assert.deepEqual(hoja.peticiones, []);
});

test('escribir encima deja en blanco las filas que sobran, en una sola petición y sin vaciar antes la pestaña', async () => {
  await s.asegurarPestana('Ajustes', ['Clave', 'Valor']);
  await s.anadir('Ajustes', [['a', '1'], ['b', '2'], ['c', '3']]);
  hoja.peticiones.length = 0;
  await s.escribirEncima('Ajustes', [['Clave', 'Valor'], ['z', '9']], 4);
  assert.deepEqual(await s.leer('Ajustes'), [['Clave', 'Valor'], ['z', '9']]);
  assert.deepEqual(hoja.peticiones.map(p => p.accion), ['escribir', 'leer']);
});

test('una pestaña nueva trae 1000 filas: escribir de golpe más allá es un error, pero al añadir la hoja pone las que hagan falta', async () => {
  const filas = Array.from({ length: 2500 }, (_, i) => ['2026-10-03T18:00:00.000Z', 'discord-1', 'Ana', 'carta', `KAIJU-${i}`, '1', 'B']);
  await s.asegurarPestana('Grande', CABECERA);
  await assert.rejects(s.escribir('Grande', [CABECERA, ...filas]), /exceeds grid limits/);
  await s.asegurarPestana('Grande', CABECERA);
  await s.anadir('Grande', filas);
  assert.equal((await s.leer('Grande')).length, 2500);
});

test('un fallo de Google llega como error, con lo que dice', async () => {
  hoja.fallar = ({ accion, pestana }) => (accion === 'leer' && pestana === 'GachaponT2' ? 'antes' : null);
  await assert.rejects(s.leer('GachaponT2'), /unavailable/);
  assert.equal(s.estadoHoja().ok, false);
  hoja.fallar = null;
  assert.equal((await s.leer('GachaponT2')).length, 2);
  assert.equal(s.estadoHoja().ok, true);
});

test('la hoja de mentira solo vale en este ordenador: con otra dirección se usa la cuenta de servicio de verdad', () => {
  const codigo = "const s = await import('./server/sheets.js'); await s.leer('Gachapon').then(() => console.log('LEIDO'), e => console.log('ERROR', e.message));";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { cwd: RAIZ, encoding: 'utf8',
    env: { ...process.env, GOOGLE_URL_SHEETS: 'http://example.com:4060', GOOGLE_SHEET_ID: 'hoja-de-prueba', GOOGLE_CREDENTIALS: 'prueba' } });
  assert.match(r.stdout, /ERROR .*GOOGLE_CREDENTIALS no es un JSON válido/, 'no ha salido ninguna petición: ha ido a por la clave de Google y no la hay');
});
