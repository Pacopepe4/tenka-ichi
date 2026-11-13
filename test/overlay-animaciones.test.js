// Las dos animaciones del overlay: la entrada del draft («Tubo que prende») y el telón del cambio de vista («Telón de
// noche»). Las funciones de verdad de overlay.js se sacan del archivo y se ejecutan con un DOM y un reloj de mentira
// (sin navegador), como en ingame.test.js; el CSS se lee para comprobar que solo anima transform y opacity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(path.join(raiz, r), 'utf8').replace(/\r\n/g, '\n');
const js = leer('public/overlay/overlay.js');
const css = leer('public/overlay/overlay.css');

const funcion = nombre => {
  const i = js.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `overlay.js tiene ${nombre}`);
  return js.slice(i, js.indexOf('\n}\n', i) + 2);
};
const constante = nombre => {
  const linea = js.split('\n').find(l => l.startsWith(`const ${nombre} =`));
  assert.ok(linea, `overlay.js tiene ${nombre}`);
  return linea;
};

// Un elemento de mentira: clases, dataset y atributos
function elemento() {
  const clases = new Set(), atributos = new Map();
  return {
    clases, dataset: {},
    classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c), toggle: (c, v) => (v ? clases.add(c) : clases.delete(c)) },
    getAttribute: k => atributos.get(k) ?? null,
    set src(v) { atributos.set('src', v); },
    getAnimations: () => [],
  };
}

// Carga la parte del overlay que decide qué se ve, con un reloj que se adelanta a mano
function cargarVistas({ vistaFija = null, menosMovimiento = false } = {}) {
  const els = { '.vista-partida': elemento(), '.telon': elemento(), '#lienzo': elemento() };
  const body = elemento();
  body.dataset.vista = 'draft';
  let ahora = 0;
  const pendientes = [];
  const mundo = {
    els, body, entradas: 0,
    setTimeout: (fn, ms) => { const t = { fn, cuando: ahora + ms }; pendientes.push(t); return t; },
    clearTimeout: t => { const i = pendientes.indexOf(t); if (i >= 0) pendientes.splice(i, 1); },
    avanzar(ms) {
      const fin = ahora + ms;
      for (;;) {
        pendientes.sort((a, b) => a.cuando - b.cuando);
        if (!pendientes.length || pendientes[0].cuando > fin) break;
        const t = pendientes.shift();
        ahora = t.cuando;
        t.fn();
      }
      ahora = fin;
    },
  };
  const crear = new Function('$', 'document', 'params', 'vistaFija', 'matchMedia', 'performance', 'setTimeout', 'clearTimeout', 'mundo',
    `let estado = null, firmaCamaras = '';
     const pintarCamaras = () => {}, pedirPrevia = () => {};
     ${constante('VISTAS_TELON')}
     ${constante('TELON')}
     ${constante('ANIMA_ENTRADA')}
     ${constante('DURACION_ENTRADA')}
     let vistaActual = null, vistaPedida = null, telonDesde = -Infinity, temporizadoresTelon = [], temporizadorEntrada = null;
     ${funcion('relanzar')}
     ${funcion('pintarVista')}
     ${funcion('cargarMarcador')}
     ${funcion('aplicarVista')}
     ${funcion('alDestapar')}
     ${funcion('conTelon')}
     ${funcion('lanzarTelon')}
     ${funcion('pararTelon')}
     ${funcion('entradaDraft')}
     ${funcion('quitarEntrada')}
     return { pintarVista, conTelon, TELON };`);
  const api = crear(s => els[s], { body }, new URLSearchParams(), vistaFija, () => ({ matches: menosMovimiento }), { now: () => mundo.ahora() },
    mundo.setTimeout, mundo.clearTimeout, mundo);
  mundo.ahora = () => ahora;
  const telon = () => els['.telon'].clases.has('pasa');
  const entra = () => els['#lienzo'].clases.has('entra');
  const ver = v => api.pintarVista({ vistaOverlay: v });
  return { ...api, mundo, body, telon, entra, ver };
}

test('el telón: solo entre draft, postdraft, partida y final; nunca al cargar, con ?vista= fija ni con REPLAY', () => {
  const { conTelon } = cargarVistas();
  assert.equal(conTelon(null, 'draft'), false, 'al cargar no hay vista de antes');
  assert.equal(conTelon('draft', 'draft'), false);
  for (const [a, b] of [['draft', 'postdraft'], ['postdraft', 'partida'], ['partida', 'final'], ['final', 'draft']]) assert.equal(conTelon(a, b), true, `${a} → ${b}`);
  assert.equal(conTelon('partida', 'replay'), false, 'al entrar en REPLAY, no');
  assert.equal(conTelon('replay', 'partida'), false, 'al salir de REPLAY, no');
  assert.equal(cargarVistas({ vistaFija: 'final' }).conTelon('draft', 'final'), false, 'con ?vista= fija, no');
});

test('al cargar no sale ni el telón ni la entrada del draft; al cambiar de vista, la vista cambia bajo el telón', () => {
  const o = cargarVistas();
  o.ver('postdraft');
  assert.equal(o.body.dataset.vista, 'postdraft', 'el primer estado pone su vista en el acto');
  assert.equal(o.telon(), false);
  assert.equal(o.entra(), false);

  o.ver('draft');
  assert.equal(o.telon(), true, 'sube el telón');
  assert.equal(o.body.clases.has('con-telon'), true, 'sin fundido de vistas mientras pasa');
  o.mundo.avanzar(o.TELON.tapa - 1);
  assert.equal(o.body.dataset.vista, 'postdraft', 'mientras sube, sigue la vista de antes');
  o.mundo.avanzar(1);
  assert.equal(o.body.dataset.vista, 'draft', 'con el telón tapándolo todo, cambia');
  assert.equal(o.entra(), false, 'el draft aún no entra: está tapado');
  o.mundo.avanzar(o.TELON.sale - o.TELON.tapa);
  assert.equal(o.entra(), true, 'al irse el telón, el draft entra');
  o.mundo.avanzar(o.TELON.acaba - o.TELON.sale);
  assert.equal(o.telon(), false, 'el telón acaba y deja de pintarse');
  assert.equal(o.body.clases.has('con-telon'), false);
  o.mundo.avanzar(2000);
  assert.equal(o.entra(), false, 'la entrada se quita al acabar');

  // Mismo estado otra vez: nada
  o.ver('draft');
  assert.equal(o.telon(), false);
  assert.equal(o.entra(), false, 'no entra cada vez que llega el estado');
});

test('la tapa del telón cae dentro de su tramo quieto (36-60 % de 1,25 s) y el marcador se carga antes de tapar', () => {
  const o = cargarVistas();
  assert.ok(o.TELON.tapa >= 1250 * 0.36 && o.TELON.tapa <= 1250 * 0.6);
  assert.ok(o.TELON.sale >= o.TELON.tapa && o.TELON.sale <= 1250 * 0.6 + 1);
  o.ver('postdraft');
  o.ver('partida');
  assert.ok(o.mundo.els['.vista-partida'].getAttribute('src').startsWith('/ingame/'), 'el marcador empieza a cargar con el telón subiendo');
  assert.equal(o.body.dataset.vista, 'postdraft');
  // Otro cambio mientras sube: el telón no vuelve a empezar y tapa con la última vista
  o.mundo.avanzar(200);
  o.ver('final');
  o.mundo.avanzar(o.TELON.tapa - 200);
  assert.equal(o.body.dataset.vista, 'final');
});

test('REPLAY entra y sale sin telón, y lo corta si estaba pasando', () => {
  const o = cargarVistas();
  o.ver('partida');
  o.ver('replay');
  assert.equal(o.body.dataset.vista, 'replay', 'en el acto');
  assert.equal(o.telon(), false);
  o.ver('partida');
  assert.equal(o.body.dataset.vista, 'partida');
  assert.equal(o.telon(), false);
  o.ver('final');
  assert.equal(o.telon(), true);
  o.ver('replay');
  assert.equal(o.telon(), false, 'el telón se quita');
  assert.equal(o.body.dataset.vista, 'replay');
  o.mundo.avanzar(2000);
  assert.equal(o.body.dataset.vista, 'replay', 'y no pone después la vista que tapaba');
});

test('con ?vista= fija no hay telón aunque el panel cambie de vista', () => {
  const o = cargarVistas({ vistaFija: 'postdraft' });
  for (const v of ['draft', 'partida', 'final', 'draft']) { o.ver(v); o.mundo.avanzar(100); }
  assert.equal(o.body.dataset.vista, 'postdraft');
  assert.equal(o.telon(), false);
  o.mundo.avanzar(2000);
  assert.equal(o.telon(), false);
});

test('con «reducir movimiento», la vista cambia sin telón', () => {
  const o = cargarVistas({ menosMovimiento: true });
  o.ver('draft');
  o.ver('postdraft');
  assert.equal(o.body.dataset.vista, 'postdraft');
  assert.equal(o.telon(), false);
});

test('el CSS de las dos animaciones solo mueve transform y opacity, y el telón está en el overlay', () => {
  const nombres = ['draft-baja', 'draft-sube', 'draft-aparece', 'draft-lado', 'draft-crece', 'draft-kanji', 'tubo-prende', 'telon-pasa', 'telon-aparece'];
  for (const n of nombres) {
    const i = css.indexOf(`@keyframes ${n} {`);
    assert.ok(i >= 0, `overlay.css tiene @keyframes ${n}`);
    // El bloque entero (con llaves anidadas)
    let nivel = 0, j = css.indexOf('{', i);
    for (; j < css.length; j++) { if (css[j] === '{') nivel++; else if (css[j] === '}' && --nivel === 0) break; }
    const props = [...css.slice(i, j).matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
    assert.ok(props.every(p => ['transform', 'opacity', 'animation-timing-function'].includes(p)), `${n} solo anima transform y opacity (${props})`);
  }
  const html = leer('public/overlay/index.html');
  assert.match(html, /<div class="telon"[^>]*><div class="lema-telon"><b>極道<\/b>/);
  // Los huecos llevan su orden para la cascada
  assert.match(js, /class="slot" data-i="\$\{i\}" style="--i:\$\{i\}"/);
  assert.match(js, /class="ban" data-i="\$\{i\}" style="--i:\$\{i\}"/);
});
