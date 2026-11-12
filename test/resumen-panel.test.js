// El bloque «Resumen final» del panel (public/panel/resumen.js): qué dice y qué botones van en cada fase del resumen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaResumen, minutos } from '../public/panel/resumen.js';

const foto = resumen => ({ tipo: 'foto', resumen });
const botones = v => ({ lanzar: v.lanzar, cancelar: v.cancelar, repetir: v.repetir });

test('sin foto del PC 1 el bloque no sale; con un PC 1 viejo, sin el campo resumen, lo dice y no hay botones', () => {
  assert.equal(vistaResumen(null).visible, false);
  const viejo = vistaResumen({ tipo: 'foto', tAntena: 300 });
  assert.equal(viejo.visible, true);
  assert.equal(viejo.botones, false);
  assert.match(viejo.texto, /no hace el resumen final/);
  assert.deepEqual(botones(viejo), { lanzar: false, cancelar: false, repetir: false });
  assert.equal(viejo.aviso, null);
});

test('cada fase con su texto y sus botones', () => {
  const casos = [
    [{ fase: 'sin', jugadas: 0, segundos: 0, faltan: null, clipActual: null }, 'Esta partida no tiene jugadas para el resumen', [false, false, false]],
    [{ fase: 'preparando', jugadas: 0, segundos: 0, faltan: null, clipActual: null }, 'Preparando: faltan clips', [false, false, false]],
    [{ fase: 'preparando', jugadas: 3, segundos: 40, faltan: null, clipActual: null }, 'Preparando: faltan clips · 3 jugadas de momento', [false, false, false]],
    [{ fase: 'listo', jugadas: 7, segundos: 84, faltan: null, clipActual: null }, 'Listo: 7 jugadas, 1:24', [true, false, true]],
    [{ fase: 'cuenta', jugadas: 7, segundos: 84, faltan: 71.3, clipActual: null }, 'Sale en 1:12 · 7 jugadas, 1:24', [true, true, false]],
    [{ fase: 'emitiendo', jugadas: 7, segundos: 84, faltan: null, clipActual: 3 }, 'En antena: clip 3 de 7', [false, true, false]],
    [{ fase: 'hecho', jugadas: 1, segundos: 12, faltan: null, clipActual: null }, 'Hecho: 1 jugada, 0:12', [false, false, true]],
  ];
  for (const [resumen, texto, [lanzar, cancelar, repetir]] of casos) {
    const v = vistaResumen(foto(resumen));
    assert.equal(v.texto, texto, resumen.fase);
    assert.deepEqual(botones(v), { lanzar, cancelar, repetir }, resumen.fase);
    assert.equal(v.botones, true);
  }
});

test('el aviso de la barra y subir arriba, solo con la cuenta atrás y en antena', () => {
  const cuenta = vistaResumen(foto({ fase: 'cuenta', jugadas: 7, segundos: 84, faltan: 72, clipActual: null }));
  assert.equal(cuenta.aviso, 'sale en 1:12');
  assert.equal(cuenta.arriba, true);
  const antena = vistaResumen(foto({ fase: 'emitiendo', jugadas: 7, segundos: 84, faltan: null, clipActual: 1 }));
  assert.equal(antena.aviso, 'en antena');
  assert.equal(antena.arriba, true);
  for (const fase of ['sin', 'preparando', 'listo', 'hecho']) {
    const v = vistaResumen(foto({ fase, jugadas: 2, segundos: 20, faltan: null, clipActual: null }));
    assert.equal(v.aviso, null, fase);
    assert.equal(v.arriba, false, fase);
  }
});

test('datos que faltan o raros no rompen el bloque', () => {
  assert.equal(vistaResumen(foto({ fase: 'cuenta', faltan: null })).texto, 'Sale en breve');
  assert.equal(vistaResumen(foto({ fase: 'emitiendo', clipActual: null })).texto, 'En antena');
  assert.equal(vistaResumen(foto({ fase: 'listo' })).texto, 'Listo: sin datos');
  const rara = vistaResumen(foto({ fase: 'otra' }));
  assert.equal(rara.botones, false);
  assert.deepEqual(botones(rara), { lanzar: false, cancelar: false, repetir: false });
  assert.equal(minutos(0), '0:00');
  assert.equal(minutos(120, Math.ceil), '2:00');
  assert.equal(minutos(-3), '0:00');
});
