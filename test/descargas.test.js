import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { archivosDescarga, zipDescarga, versionRealizador } from '../server/descargas.js';
import { createHash } from 'node:crypto';

const nombres = lista => lista.map(a => a.nombre);

test('Realizador PC 2: el realizador con su instalador y el puente del marcador dentro', async () => {
  const lista = await archivosDescarga('realizador-pc2.zip');
  const n = nombres(lista);
  for (const f of ['INSTALAR-PC2.bat', 'pc2/rele.js', 'comun/sala.js', 'instalar/instalar.js', 'windows/realizador-pc2.bat', 'opciones.json',
    'puente/Abrir el puente.bat', 'puente/puente-tenka-ichi.ps1', 'puente/LEEME.txt']) assert.ok(n.includes(f), `falta ${f}`);
  assert.ok(!n.includes('INSTALAR-PC1.bat') && !n.includes('INSTALAR-IA.bat'), 'ni el instalador del PC 1 ni el de la IA');
  for (const f of ['obs/replay.html', 'obs/repeticion-entrada.webm', 'obs/repeticion-salida.webm', 'obs/gokudo-neon.png', 'pc2/bordes.js', 'windows/_instalar-node.ps1']) assert.ok(n.includes(f), `falta ${f}`);
  assert.ok(!n.some(f => /clave\.txt|opciones\.local\.json|^test\//.test(f)), 'nada de contraseñas ni pruebas');
  const bat = lista.find(a => a.nombre === 'INSTALAR-PC2.bat').datos.toString('utf8');
  assert.ok(bat.includes('\r\n') && !/[^\r]\n/.test(bat), 'los .bat van con CRLF');
});

test('Realizador PC 1: solo su instalador y sin el puente', async () => {
  const n = nombres(await archivosDescarga('realizador-pc1.zip'));
  assert.ok(n.includes('INSTALAR-PC1.bat') && n.includes('pc1/agente.js') && n.includes('pc1/panel/index.html'));
  assert.ok(n.includes('INSTALAR-IA.bat') && n.includes('pc1/ia.js'), 'el PC 1 lleva el modo IA');
  assert.ok(!n.includes('INSTALAR-PC2.bat'));
  assert.ok(!n.some(f => f.startsWith('puente/')));
});

test('El zip del puente sigue igual y una descarga que no existe no da nada', async () => {
  assert.deepEqual(nombres(await archivosDescarga('puente-tenka-ichi.zip')), ['Abrir el puente.bat', 'puente-tenka-ichi.ps1', 'LEEME.txt']);
  assert.equal(await archivosDescarga('../secreto.zip'), null);
  assert.equal(await zipDescarga('nada.zip'), null);
});

test('El zip se abre: cada archivo comprimido vuelve a ser el original', async () => {
  const zip = await zipDescarga('realizador-pc2.zip');
  const lista = await archivosDescarga('realizador-pc2.zip');
  let p = 0;
  for (const a of lista) {
    assert.equal(zip.readUInt32LE(p), 0x04034b50);
    const comprimido = zip.readUInt32LE(p + 18);
    const largoNombre = zip.readUInt16LE(p + 26);
    const extra = zip.readUInt16LE(p + 28);
    assert.equal(zip.toString('utf8', p + 30, p + 30 + largoNombre), a.nombre);
    const inicio = p + 30 + largoNombre + extra;
    assert.ok(inflateRawSync(zip.subarray(inicio, inicio + comprimido)).equals(a.datos), a.nombre);
    p = inicio + comprimido;
  }
});

test('Versión del realizador para el botón Actualizar: la de VERSION.txt y la huella de cada zip tal como se sirve', async () => {
  const v = await versionRealizador();
  for (const n of ['realizador-pc1.zip', 'realizador-pc2.zip']) {
    const zip = await zipDescarga(n);
    assert.equal(v.zips[n].sha256, createHash('sha256').update(zip).digest('hex'), n);
    assert.equal(v.zips[n].bytes, zip.length);
  }
  assert.ok(v.version === null || /^[0-9a-f]{4,}$|^sin-git$/.test(v.version), String(v.version));
});
