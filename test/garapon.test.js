// La física de la garapon del sorteo (public/garapon.js): las bolas no se salen del bombo, la que toca acaba en la
// bandeja con el bombo parado y la boca abajo, y nada deja al sorteo esperando
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fisicaGarapon, MEDIDA } from '../public/garapon.js';

const CLANES = ['SARU', 'KAIJU', 'KEMONO', 'ATSUI', 'TORA', 'BUSHI'];
// Un azar con semilla, para que cada prueba salga siempre igual
function azarCon(semilla) {
  let a = semilla;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function bombo(semilla = 1, opciones = {}) {
  const f = fisicaGarapon({ azar: azarCon(semilla), ...opciones });
  CLANES.forEach(id => f.meter(id));
  f.asentar(1.5);
  return f;
}
// Dentro del octógono (con un pelo de holgura por los choques entre bolas)
function dentro(f, b) {
  const { apotema: A, radio: R } = MEDIDA;
  return [0, 1, 2, 3, 4, 5, 6, 7].every(k => {
    const a = f.tambor.th + k * Math.PI / 4;
    return b.x * Math.cos(a) + b.y * Math.sin(a) <= A - R + .02;
  });
}
// Corre la física hasta que se resuelva la promesa (o se acabe el tiempo), como lo haría la página
async function hasta(f, promesa, segundos = 8) {
  let hecho = false, valor;
  promesa.then(v => { hecho = true; valor = v; });
  for (let t = 0; t < segundos && !hecho; t += 1 / 60) {
    f.paso(1 / 60);
    await null;
  }
  return { hecho, valor };
}

test('en reposo, las bolas se quedan en el fondo del bombo', () => {
  const f = bombo();
  for (const b of f.bolas) {
    assert.ok(dentro(f, b), `${b.id} se ha salido`);
    assert.ok(b.y > 0, `${b.id} flota (y = ${b.y.toFixed(3)})`);
  }
});

test('agitado mucho rato, ninguna bola se sale ni se mete en el eje', () => {
  for (const semilla of [1, 2, 3]) {
    const f = bombo(semilla);
    f.tambor.meta = 9;
    for (let i = 0; i < 60 * 8; i++) {
      f.paso(1 / 60);
      for (const b of f.bolas) {
        assert.ok(dentro(f, b), `semilla ${semilla}: ${b.id} se ha salido en el fotograma ${i}`);
        assert.ok(Math.hypot(b.x, b.y) >= MEDIDA.eje + MEDIDA.radio - .02, `semilla ${semilla}: ${b.id} atraviesa el eje`);
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.vx));
      }
    }
  }
});

test('la bola que toca cae a la bandeja con el bombo parado y la boca abajo', async () => {
  for (const [semilla, id] of [[1, 'TORA'], [4, 'SARU'], [9, 'BUSHI'], [12, 'KEMONO']]) {
    const f = bombo(semilla);
    const { hecho, valor } = await hasta(f, f.extraer(id));
    assert.ok(hecho, `semilla ${semilla}: la extracción no ha terminado`);
    assert.equal(valor.id, id);
    assert.equal(valor.modo, 'quieta');
    assert.ok(Math.abs(valor.y - (MEDIDA.suelo - MEDIDA.radio)) < .01, 'no está en el fondo de la bandeja');
    assert.ok(Math.abs(valor.x) <= MEDIDA.bandeja - MEDIDA.radio + 1e-9, 'se ha salido de la bandeja');
    // Las demás siguen dentro
    for (const b of f.bolas) if (b.id !== id) assert.ok(dentro(f, b), `${b.id} se ha salido`);
  }
});

test('mientras la bola cae, el bombo está parado con la boca abajo', async () => {
  const f = bombo(5);
  const promesa = f.extraer('ATSUI');
  let vista = false;
  for (let t = 0; t < 8; t += 1 / 60) {
    f.paso(1 / 60);
    const b = f.bolas.find(x => x.id === 'ATSUI');
    if (b.modo === 'cae') {
      vista = true;
      const angulo = ((f.tambor.th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      assert.ok(Math.min(angulo, 2 * Math.PI - angulo) < 1e-6, `la boca no está abajo (${angulo})`);
      assert.equal(f.tambor.w, 0);
    }
    if (b.modo === 'quieta') break;
  }
  assert.ok(vista, 'la bola no ha llegado a caer');
  await promesa;
});

test('la extracción no tarda más de lo que da el automático más rápido (5 s por bola)', async () => {
  // Después de la bandeja aún quedan la subida a la diana, el nombre y el vuelo al tablero (unos 2,8 s); si con el
  // automático más rápido se acumulan bolas, el sorteo acelera las siguientes
  for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const f = bombo(semilla);
    let s = 0, listo = false;
    f.extraer(CLANES[semilla % 6]).then(() => { listo = true; });
    while (!listo && s < 8) { f.paso(1 / 60); s += 1 / 60; await null; }
    assert.ok(listo && s < 3.3, `semilla ${semilla}: ha tardado ${s.toFixed(2)} s en dejar la bola en la bandeja`);
  }
});

test('acabarYa deja la bola en la bandeja al momento (pestaña oculta)', async () => {
  const f = bombo(2);
  const promesa = f.extraer('KAIJU');
  f.paso(.3);
  f.acabarYa();
  const b = await promesa;
  assert.equal(b.id, 'KAIJU');
  assert.equal(b.modo, 'quieta');
  assert.equal(f.ocupada(), false);
});

test('cancelar suelta al sorteo (null) y devuelve la bola al bombo', async () => {
  const f = bombo(3);
  const promesa = f.extraer('BUSHI');
  for (let i = 0; i < 150; i++) f.paso(1 / 60);
  const devueltas = f.cancelar();
  assert.equal(await promesa, null);
  assert.ok(devueltas <= 1);
  f.asentar(1);
  for (const b of f.bolas) { assert.equal(b.modo, 'dentro'); assert.ok(dentro(f, b)); }
});

test('una bola que no está en el bombo no deja nada esperando', async () => {
  const f = bombo();
  f.quitar('SARU');
  assert.equal(await f.extraer('SARU'), null);
  assert.equal(f.ocupada(), false);
});

test('los golpes se avisan (para el sonido) y la bandeja suena', async () => {
  const golpes = [];
  const f = bombo(7, { alGolpe: (fuerza, tipo) => golpes.push(tipo) });
  await hasta(f, f.extraer('TORA'));
  assert.ok(golpes.includes('pared'));
  assert.ok(golpes.includes('bandeja'));
});
