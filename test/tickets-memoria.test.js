// Lo que aprende SrDirector hablando: cada dato con el rango de quien lo dijo (jefe > staff > Oyabun > jugador > sin rol)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearMemoria, RANGOS } from '../server/tickets-memoria.js';

const nueva = (opciones = {}) => {
  const archivo = path.join(mkdtempSync(path.join(os.tmpdir(), 'srdirector-')), 'memoria.json');
  let t = Date.parse('2026-11-11T12:00:00Z');
  return { archivo, m: crearMemoria({ hoja: () => false, archivo, ahora: () => new Date(t += 1000), log: { error: () => {} }, ...opciones }) };
};

test('apunta con el rango de quien lo dijo, y lo de más rango va primero (y, con el mismo, lo más nuevo)', async () => {
  const { m, archivo } = nueva();
  assert.equal(await m.apuntar([{ sobre: 'Dakin', dato: 'Dicen que juega con los pies.' }], { rango: 0, quien: 'Troll', id: '1' }), 1);
  await m.apuntar([{ sobre: 'Dakin', dato: 'Ganó dos Cinturones con Atsui.' }], { rango: 4, quien: 'Pacopepe', id: '9' });
  await m.apuntar([{ sobre: 'Dakin', dato: 'Es el rey de las pestañas.' }], { rango: 2, quien: 'Oyabun', id: '2' });
  const lineas = m.relevantes('¿quién es Dakin?').split('\n');
  assert.match(lineas[0], /Ganó dos Cinturones con Atsui\. \(lo dijo Pacopepe, el jefe, el 2026-11-11\)/);
  assert.match(lineas[1], /rey de las pestañas\. \(lo dijo Oyabun, Oyabun/);
  assert.match(lineas[2], /juega con los pies\. \(lo dijo alguien sin rol, Troll/);
  assert.equal(m.relevantes('¿y Tengu?'), '', 'solo lo que habla de lo que se pregunta');
  assert.equal(JSON.parse(readFileSync(archivo, 'utf8')).length, 3, 'sin hoja, se guarda en el archivo');
});

test('se carga otra vez tras un reinicio, no repite datos y cada uno enseña como mucho 5 al día (el jefe y el staff, sin tope)', async () => {
  const { m, archivo } = nueva();
  for (let n = 0; n < 4; n++) await m.apuntar([{ sobre: `Cosa ${n}`, dato: 'a' }, { sobre: `Otra ${n}`, dato: 'b' }], { rango: 1, id: '5' });
  assert.equal(m.todos().filter(d => d.id === '5').length, 5);
  assert.equal(await m.apuntar([{ sobre: 'Cosa 0', dato: 'a' }], { rango: 4, id: '9' }), 1, 'si lo repite alguien de más rango, cuenta');
  assert.equal(await m.apuntar([{ sobre: 'Cosa 0', dato: 'A' }], { rango: 1, id: '6' }), 0, 'el mismo dato de menos rango no se repite');
  for (let n = 0; n < 8; n++) await m.apuntar([{ sobre: `Staff ${n}`, dato: 'c' }], { rango: 3, id: '7' });
  assert.equal(m.todos().filter(d => d.id === '7').length, 8);
  const otra = crearMemoria({ hoja: () => false, archivo, log: { error: () => {} } });
  await otra.cargar();
  assert.equal(otra.todos().length, m.todos().length);
  assert.equal(await m.apuntar([{ sobre: '', dato: 'x' }, { sobre: 'y', dato: '   ' }], { rango: 4, id: '9' }), 0, 'sin «sobre» o sin dato no se apunta');
});

test('con Google Sheets, lo guarda en la pestaña «SrDirector» sin que una celda se tome por fórmula', async () => {
  const filas = [['Fecha', 'Sobre', 'Dato', 'Rango', 'Quien', 'ID']];
  const m = crearMemoria({ hoja: () => true, asegurar: async () => {}, leerHoja: async () => filas, anadirHoja: async (p, nuevas) => { assert.equal(p, 'SrDirector'); filas.push(...nuevas); }, log: { error: () => {} } });
  await m.cargar();
  await m.apuntar([{ sobre: 'Gaatsu', dato: '=1+1 es su número favorito' }], { rango: 3, quien: 'Kumi', id: '3' });
  assert.equal(filas[1][2], "'=1+1 es su número favorito");
  assert.equal(filas[1][3], '3');
  assert.equal(RANGOS[3], 'staff (Kumichō)');
});
