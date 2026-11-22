// Modo arcade (22/11): los ajustes de la página a partir de su dirección. Lo que falte o venga mal se queda con lo de
// fábrica: la cámara abajo a la izquierda como en el overlay de liga (x 16, y 856, 320×180, con la placa de 44 hasta el
// borde de abajo), sin color propio (el bermellón de Gokudō) y sin guía
export const FABRICA = { nombre: 'Caster', usuario: '', x: 16, y: 856, ancho: 320 };
const PLACA = 44;

const numero = (v, min, max, fabrica) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fabrica;
};

export function ajustesArcade(busqueda = '') {
  const p = new URLSearchParams(busqueda);
  const nombre = (p.get('nombre') || '').trim().slice(0, 40) || FABRICA.nombre;
  const u = (p.get('usuario') || '').trim().replace(/^@+/, '').slice(0, 40);
  const ancho = numero(p.get('ancho'), 160, 960, FABRICA.ancho);
  const alto = Math.round(ancho * 9 / 16);
  // El hueco y su placa, siempre dentro de la pantalla
  const x = Math.min(numero(p.get('x'), 0, 1920, FABRICA.x), 1920 - ancho);
  const y = Math.min(numero(p.get('y'), 0, 1080, 1080 - PLACA - alto), 1080 - PLACA - alto);
  const c = (p.get('color') || '').trim().replace(/^#/, '');
  return {
    nombre, usuario: u ? `@${u}` : '', x, y, ancho, alto,
    color: /^[0-9a-f]{6}$/i.test(c) ? `#${c.toUpperCase()}` : null,
    guia: p.get('guia') === '1',
  };
}
