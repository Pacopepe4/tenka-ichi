// Alertas de Kick en OBS: cola de alertas, una cada vez. Cada una se enciende como un rótulo de neón del callejón,
// se queda unos segundos y se apaga. Los nombres van con textContent: vienen de Kick y no se interpretan como HTML.
import { conectarDirecto } from '/comun.js';

const DURACION_MS = 7000;
const SALIDA_MS = 700;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Kanji de sello, la etiqueta de arriba y la línea de debajo del nombre de cada tipo
const TIPOS = {
  seguidor: a => ({ kanji: '縁', etiqueta: 'Nuevo seguidor', detalle: 'Ya es de la calle de Gokudō' }),
  sub: a => ({ kanji: '盃', etiqueta: 'Sakazuki · nueva sub', detalle: 'Bebe del cuenco: entra en la familia' }),
  renovacion: a => ({ kanji: '盃', etiqueta: `Renueva el sakazuki · ${plural(a.meses || 1, 'mes', 'meses')}`, detalle: 'Sigue en la familia' }),
  regalo: a => ({ kanji: '贈', etiqueta: `Regala ${plural(a.cantidad || 1, 'sub', 'subs')}`, detalle: a.cantidad > 1 ? `${a.cantidad} kobun nuevos en la familia` : 'Un kobun nuevo en la familia' }),
  kicks: a => ({ kanji: '蹴', etiqueta: `${Number(a.cantidad || 0).toLocaleString('es-ES')} kicks`, detalle: a.regalo ? `Manda «${a.regalo}»` : 'Tributo para la familia' }),
};

const escena = document.getElementById('escena');
const plantilla = document.getElementById('plantilla');
const cola = [];
let ocupada = false;

function pintar(a) {
  const t = TIPOS[a.tipo]?.(a);
  if (!t) return null;
  const el = plantilla.content.firstElementChild.cloneNode(true);
  el.dataset.tipo = a.tipo;
  el.querySelector('.kanji').textContent = t.kanji;
  el.querySelector('.etiqueta').textContent = t.etiqueta;
  el.querySelector('.nombre').textContent = a.nombre || 'Anónimo';
  el.querySelector('.detalle').textContent = t.detalle;
  if (a.mensaje) Object.assign(el.querySelector('.mensaje'), { hidden: false, textContent: `«${a.mensaje}»` });
  if (a.sobres > 0) Object.assign(el.querySelector('.sobres'), { hidden: false, textContent: `+${plural(a.sobres, 'tirada', 'tiradas')} en el gachapon` });
  // Los nombres largos se encogen para caber en el rótulo
  const largo = [...(a.nombre || '')].length;
  if (largo > 14) el.querySelector('.nombre').style.setProperty('--encoge', String(Math.max(0.55, 14 / largo)));
  return el;
}

function siguiente() {
  if (ocupada || !cola.length) return;
  const el = pintar(cola.shift());
  if (!el) return siguiente();
  ocupada = true;
  escena.append(el);
  setTimeout(() => el.classList.add('sale'), DURACION_MS);
  setTimeout(() => { el.remove(); ocupada = false; siguiente(); }, DURACION_MS + SALIDA_MS);
}

export function encolar(a) {
  if (cola.length > 30) cola.shift();   // si llueven regalos, no se acumulan sin fin
  cola.push(a);
  siguiente();
}

const params = new URLSearchParams(location.search);
if (params.has('prueba')) {
  // Todas en bucle para colocar la fuente
  const pruebas = [
    { tipo: 'seguidor', nombre: 'Kobun_de_prueba' },
    { tipo: 'sub', nombre: 'Kobun_de_prueba', meses: 1, sobres: 3 },
    { tipo: 'renovacion', nombre: 'Un_nombre_de_kick_muy_largo', meses: 6, sobres: 2 },
    { tipo: 'regalo', nombre: 'Oyabun_de_prueba', cantidad: 5, sobres: 10 },
    { tipo: 'kicks', nombre: 'Kobun_de_prueba', cantidad: 500, regalo: 'Rage Quit', mensaje: '¡Vamos, familia!', sobres: 5 },
  ];
  let i = 0;
  const otra = () => { encolar(pruebas[i++ % pruebas.length]); };
  otra();
  setInterval(() => { if (!cola.length) otra(); }, 1000);
} else {
  conectarDirecto({ canal: 'alertas', alAlerta: encolar });
}
