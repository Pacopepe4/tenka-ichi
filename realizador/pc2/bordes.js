// Que la cámara no enseñe lo que hay fuera del mapa.
//
// Cuando la cámara sigue a un campeón que está cerca de un borde (la top lane arriba a la izquierda, la bot
// lane abajo a la derecha), el plano abierto deja ver el negro de fuera del mapa. Para evitarlo, cuanto más
// cerca del borde está el campeón:
//   - el plano se desplaza hacia el centro del mapa (la cámara «baja» si está arriba, va a la derecha si está
//     a la izquierda, etc.), y
//   - se cierra un poco el zoom (hacia el plano «cerca»), para que se vea menos alrededor.
// Todo poco a poco: el ajuste entra y sale suavizado, sin saltos.
//
// Coordenadas de la Replay API: x hacia la derecha (este), z hacia arriba de la pantalla (norte), y la altura.

export const POR_DEFECTO = {
  activo: true,
  min: 0,                 // límites del mapa (Grieta del Invocador: más o menos de 0 a 14800 en x y en z)
  max: 14800,
  // Distancia al borde a partir de la cual empieza el ajuste. Arriba es mayor porque la cámara mira hacia
  // arriba de la pantalla y por ahí es por donde más se ve de fuera.
  zona: { arriba: 3200, abajo: 2200, izquierda: 2600, derecha: 2600 },
  desplazamiento: { arriba: 900, abajo: 600, izquierda: 700, derecha: 700 }, // cuánto se mueve el plano, pegado al borde
  zoomMaximo: 0.7,        // pegado al borde, cuánto se acerca el zoom al del plano «cerca» (0 nada, 1 del todo)
  suavizadoSegundos: 0.6, // lo que tarda en entrar o salir el ajuste
  cadaMs: 200,            // cada cuánto se mira dónde está el campeón
};

const recorte = x => Math.max(0, Math.min(1, x));
const suave = x => x * x * (3 - 2 * x);

// Cuánto hay que ajustar con el campeón en «pos» ({x, z}): k (0..1, cuánto zoom in) y dx, dz (desplazamiento
// del plano, ya hacia el centro del mapa).
export function ajusteBorde(pos, c = POR_DEFECTO) {
  const nada = { k: 0, dx: 0, dz: 0 };
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return nada;
  const cerca = (dist, zona) => (zona > 0 ? suave(recorte((zona - dist) / zona)) : 0);
  const p = {
    arriba: cerca(c.max - pos.z, c.zona.arriba),
    abajo: cerca(pos.z - c.min, c.zona.abajo),
    izquierda: cerca(pos.x - c.min, c.zona.izquierda),
    derecha: cerca(c.max - pos.x, c.zona.derecha),
  };
  return {
    k: Math.max(p.arriba, p.abajo, p.izquierda, p.derecha) * (c.zoomMaximo ?? 0),
    dx: p.izquierda * c.desplazamiento.izquierda - p.derecha * c.desplazamiento.derecha,
    dz: p.abajo * c.desplazamiento.abajo - p.arriba * c.desplazamiento.arriba,
  };
}

// Acerca el ajuste actual al objetivo, como un muelle: con «segundos» de suavizado, en «dt» segundos
export function suavizar(actual, objetivo, dt, segundos) {
  const a = segundos > 0 ? 1 - Math.exp(-dt / segundos) : 1;
  return {
    k: actual.k + (objetivo.k - actual.k) * a,
    dx: actual.dx + (objetivo.dx - actual.dx) * a,
    dz: actual.dz + (objetivo.dz - actual.dz) * a,
  };
}

// El zoom con el ajuste: «z» (fov y distancia del plano) se acerca a «cerca» según k
export function zoomConBorde(z, cerca, k) {
  if (!k || !cerca) return z;
  return {
    fov: z.fov + (Math.min(z.fov, cerca.fov) - z.fov) * k,
    distancia: z.distancia + (Math.min(z.distancia, cerca.distancia) - z.distancia) * k,
  };
}

// Dónde está el campeón seguido, a partir de lo que dice la Replay API de la cámara: la cámara está en
// campeón + desplazamiento, así que el campeón está en cámara − desplazamiento.
export function posicionSeguido(render, offset) {
  const c = render?.cameraPosition;
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z) || !offset) return null;
  return { x: c.x - (offset.x || 0), z: c.z - (offset.z || 0) };
}
