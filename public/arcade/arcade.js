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

// ---------- Marcos de Gokudō alrededor de la interfaz del LoL del jugador (22/11) ----------
// Cajas de la interfaz que se enmarcan (el marco va por fuera: lo de dentro se ve entero). De serie, la interfaz del LoL
// a 1920×1080 con la escala de serie: el minimapa pegado abajo a la derecha, la barra de habilidades y objetos abajo
// en el centro y el marcador pequeño arriba a la derecha. Son aproximadas: cada jugador tiene su escala, así que se
// ajustan por la dirección:
//   ?hud=1.1              escala de la interfaz (barra y marcador), desde su sitio (abajo en el centro / arriba a la derecha)
//   ?minimapa=0.9         escala del minimapa, desde la esquina de abajo a la derecha
//   ?mapa=x,y,ancho,alto  (y lo mismo con barra= y marcador=) la caja exacta, que manda sobre las escalas
//   ?marcos=0             sin marcos
export const ZONAS_FABRICA = {
  mapa: { x: 1648, y: 808, ancho: 272, alto: 272 },
  barra: { x: 580, y: 930, ancho: 760, alto: 150 },
  marcador: { x: 1560, y: 0, ancho: 360, alto: 28 },
};

const escala = (v, fabrica = 1) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n >= 0.5 && n <= 1.6 ? n : fabrica; };
const recortar = c => {
  const ancho = Math.max(20, Math.min(1920, Math.round(c.ancho))), alto = Math.max(10, Math.min(1080, Math.round(c.alto)));
  return { x: Math.max(0, Math.min(1920 - ancho, Math.round(c.x))), y: Math.max(0, Math.min(1080 - alto, Math.round(c.y))), ancho, alto };
};
const exacta = v => {
  const n = String(v || '').split(',').map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? { x: n[0], y: n[1], ancho: n[2], alto: n[3] } : null;
};

export function zonasArcade(busqueda = '') {
  const p = new URLSearchParams(busqueda);
  if (p.get('marcos') === '0') return null;
  const hud = escala(p.get('hud')), mapa = escala(p.get('minimapa'));
  const f = ZONAS_FABRICA;
  // Cada caja crece o encoge desde donde la ancla el LoL
  const deMapa = { ancho: f.mapa.ancho * mapa, alto: f.mapa.alto * mapa };
  const deBarra = { ancho: f.barra.ancho * hud, alto: f.barra.alto * hud };
  const deMarcador = { ancho: f.marcador.ancho * hud, alto: f.marcador.alto * hud };
  return {
    mapa: recortar(exacta(p.get('mapa')) || { x: 1920 - deMapa.ancho, y: 1080 - deMapa.alto, ...deMapa }),
    barra: recortar(exacta(p.get('barra')) || { x: (1920 - deBarra.ancho) / 2, y: 1080 - deBarra.alto, ...deBarra }),
    marcador: recortar(exacta(p.get('marcador')) || { x: 1920 - deMarcador.ancho, y: 0, ...deMarcador }),
  };
}
