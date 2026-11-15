// Cinemática de inicio y recorrido del río (15/11, Pacopepe: «La de los 20s y la del rio para los ratos muertos»).
// No es un vídeo: es una secuencia de la cámara del propio LoL (Replay API, /replay/sequence) que el relé del PC 2
// lanza sobre la partida en vivo al pasar a «partida» (la antena llega al segundo 0). Mientras dura, el guion no
// mueve la cámara; al acabar se quita la secuencia y la cámara vuelve al realizador.
//
// Coordenadas del mapa: x hacia el este, z hacia el norte, y es la altura. La cámara mira desde «p» hacia «o».

const grados = r => r * 180 / Math.PI;
export function mirar(p, o) {
  const dx = o.x - p.x, dz = o.z - p.z;
  return { x: grados(Math.atan2(dx, dz)), y: grados(Math.atan2(p.y - (o.y || 0), Math.hypot(dx, dz))), z: 0 };
}

// [segundo, posición de la cámara, a dónde mira, campo de visión, fundido hasta el siguiente] («snap» = corte)
const CENTRO = { x: 7400, z: 7400 }, BARON = { x: 5000, z: 10400 }, DRAGON = { x: 9850, z: 4400 };

// Cinemática de inicio, 20 s (la que vio Pacopepe el 14/11, «cinematica-inicio-v3»): todo el mapa desde arriba,
// el río, el Barón, el dragón y las dos bases desde detrás de su fuente (mirando siempre hacia dentro del mapa,
// para que no se vea el vacío de fuera), y acaba avanzando con los campeones que salen de la base azul.
export const INICIO = [
  [0, { x: 7400, y: 7600, z: 2200 }, { x: 7400, z: 6600 }, 55, 'smoothStep'],
  [4.5, { x: 6900, y: 3300, z: 4700 }, CENTRO, 55, 'smoothStep'],
  [8.5, { x: 3500, y: 1800, z: 8900 }, BARON, 50, 'smoothStep'],
  [12.5, { x: 8400, y: 1800, z: 2900 }, DRAGON, 50, 'snap'],
  [12.6, { x: 15400, y: 3000, z: 15400 }, { x: 12300, z: 12300 }, 52, 'smoothStep'],
  [16.4, { x: 14500, y: 2200, z: 14500 }, { x: 12100, z: 12100 }, 46, 'snap'],
  [16.5, { x: -700, y: 3000, z: -700 }, { x: 2400, z: 2400 }, 52, 'smoothStep'],
  [20, { x: 300, y: 1800, z: 300 }, { x: 2600, z: 2600 }, 48, 'linear'],
];

// Río, para los ratos muertos (los elige el PC 1): del foso del dragón al del Barón pasando por el centro, 12 s
export const RIO = [
  [0, { x: 10600, y: 2000, z: 2700 }, { x: 9850, z: 4400 }, 48, 'smoothStep'],
  [6, { x: 7900, y: 2600, z: 5400 }, { x: 7000, z: 7600 }, 50, 'smoothStep'],
  [12, { x: 4700, y: 2000, z: 8600 }, { x: 5000, z: 10400 }, 48, 'linear'],
];

export const duracion = guion => guion.at(-1)[0];

// Secuencia de la Replay API que empieza en el segundo de partida t0
export function secuencia(t0, guion = RIO) {
  const cameraPosition = [], cameraRotation = [], fieldOfView = [];
  let giro = null;
  for (const [s, p, o, fov, blend] of guion) {
    const rot = mirar(p, o);
    // El giro sigue el camino corto desde el anterior (sin vueltas de 360°)
    if (giro !== null) { while (rot.x - giro > 180) rot.x -= 360; while (rot.x - giro < -180) rot.x += 360; }
    giro = rot.x;
    const time = Math.round((t0 + s) * 100) / 100;
    cameraPosition.push({ time, value: { ...p }, blend });
    cameraRotation.push({ time, value: rot, blend });
    fieldOfView.push({ time, value: fov, blend });
  }
  return { cameraPosition, cameraRotation, fieldOfView };
}

// ¿Toca lanzarla? Solo una vez por partida, con la antena en marcha a velocidad normal, al principio de la partida
// (hasta «hastaSegundo»: si el relé entra con la partida ya avanzada, no sale) y sin control manual. No depende del
// PC 1: sale aunque el relé aún no tenga noticias suyas.
export function tocaCinematica({ opciones = {}, pb, hecha, manual }) {
  if (opciones.activo === false || hecha || manual || !pb) return false;
  if (pb.paused || pb.seeking || (pb.speed && pb.speed !== 1)) return false;
  return pb.time >= 0 && pb.time <= (opciones.hastaSegundo ?? 20);
}
