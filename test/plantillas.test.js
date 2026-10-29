// Las plantillas y la pestaña «Plantillas» de Google Sheets (contra la hoja de mentira de scripts/sheets-falso.js).
// La hoja publicada se hizo cuando aún no había jugadores: si sigue sin ninguno, recibe los de la copia local; en
// cuanto tiene alguno, manda ella.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearSheetsFalso } from '../scripts/sheets-falso.js';

const CABECERA = ['Clan', 'Top', 'Jungla', 'Medio', 'ADC', 'Support', 'Suplentes', 'Lema', 'Descripción'];
const LOCAL = {
  SARU: { lema: 'El Rey Mono', descripcion: 'Local', jugadores: ['KINGKAI', 'MITSU', 'FREDDY', 'D4DT0R', 'SERGI'], suplentes: 'PEPE' },
  TORA: { lema: 'El Samurái Tigre', descripcion: 'Local', jugadores: ['', 'LUCASLOL', 'SPORFU', 'NARCISO', 'REXITO'], suplentes: '' },
};
let falso, carpeta, n = 0;

before(async () => {
  falso = crearSheetsFalso();
  Object.assign(process.env, { GOOGLE_URL_SHEETS: await falso.abrir(), GOOGLE_SHEET_ID: 'hoja-de-prueba', GOOGLE_CREDENTIALS: 'prueba' });
  carpeta = await mkdtemp(path.join(tmpdir(), 'plantillas-'));
});
after(() => falso.cerrar());

// Un plantillas.js nuevo (con su estado a cero) sobre una copia local y una hoja dadas
async function cargar(hoja) {
  const archivo = path.join(carpeta, `plantillas-${++n}.json`);
  await writeFile(archivo, JSON.stringify(LOCAL));
  falso.estado.hojas.set('Plantillas', hoja.map(f => f.map(String)));
  process.env.ARCHIVO_PLANTILLAS = archivo;
  const m = await import(`../server/plantillas.js?caso=${n}`);
  await m.cargarPlantillas();
  return m;
}
const fila = (clan, jugadores = ['', '', '', '', ''], extra = ['', '', '']) => [clan, ...jugadores, ...extra];

test('una hoja sin ningún jugador recibe los de la copia local, con el lema y la descripción de la hoja', async () => {
  const m = await cargar([CABECERA, fila('SARU', undefined, ['', 'Lema de la hoja', 'Descripción de la hoja']), fila('TORA'), fila('KURU')]);
  assert.deepEqual(m.plantilla('SARU').jugadores, LOCAL.SARU.jugadores);
  assert.equal(m.plantilla('SARU').suplentes, 'PEPE');
  assert.equal(m.plantilla('SARU').lema, 'Lema de la hoja', 'lo que el staff escribió en la hoja no se pisa');
  assert.deepEqual(m.plantilla('TORA').jugadores, LOCAL.TORA.jugadores, 'el hueco del top sigue vacío');
  // Y se ha escrito en la hoja: la próxima vez ya manda ella
  const filas = falso.estado.hojas.get('Plantillas');
  assert.deepEqual(filas[0], CABECERA);
  const saru = filas.find(f => f[0] === 'SARU');
  assert.deepEqual(saru.slice(1, 8), [...LOCAL.SARU.jugadores, 'PEPE', 'Lema de la hoja']);
  assert.ok(!filas.some(f => f[0] === 'KURU'), 'los clanes que ya no están salen de la hoja');
});

test('si la hoja ya tiene algún jugador, manda ella y no se toca', async () => {
  const hoja = [CABECERA, fila('SARU', ['OTRO', '', '', '', '']), fila('TORA')];
  const m = await cargar(hoja);
  const peticiones = falso.estado.peticiones.length;
  assert.deepEqual(m.plantilla('SARU').jugadores, ['OTRO', '', '', '', '']);
  assert.deepEqual(m.plantilla('TORA').jugadores, ['', '', '', '', ''], 'un clan vacío en la hoja sigue vacío');
  assert.deepEqual(falso.estado.hojas.get('Plantillas')[1].slice(0, 2), ['SARU', 'OTRO']);
  assert.equal(falso.estado.peticiones.length, peticiones);
});

test('una hoja recién creada recibe la copia local entera', async () => {
  const m = await cargar([CABECERA]);
  assert.deepEqual(m.plantilla('SARU').jugadores, LOCAL.SARU.jugadores);
  assert.deepEqual(falso.estado.hojas.get('Plantillas').find(f => f[0] === 'SARU').slice(1, 6), LOCAL.SARU.jugadores);
});
