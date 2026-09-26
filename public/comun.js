// Utilidades compartidas por el overlay y el panel
export async function cargarCampeones() {
  const r = await fetch('/ddragon/campeones.json');
  const { version, campeones } = await r.json();
  const porId = new Map(campeones.map(c => [c.id, c]));
  return { version, campeones, nombre: id => porId.get(id)?.nombre || id || '' };
}

export async function cargarClanes() {
  const r = await fetch('/api/clanes');
  const { clanes, roles } = await r.json();
  return { clanes, roles, clan: id => clanes.find(c => c.id === id) || clanes[clanes.length - 1] };
}

export const icono = id => `/ddragon/icono/${id}.png`;
export const splash = id => `/ddragon/splash/${id}.jpg`;
export const logo = clan => `/logos/${clan}.png`;

// Conexión en directo con reconexión automática
export function conectarDirecto({ alEstado, alRespuesta, alConexion }) {
  let ws, pendientes = new Map(), id = 0;
  function abrir() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => alConexion?.(true);
    ws.onclose = () => { alConexion?.(false); setTimeout(abrir, 1500); };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.tipo === 'estado') alEstado(m.estado);
      if (m.tipo === 'respuesta') {
        pendientes.get(m.id)?.(m);
        pendientes.delete(m.id);
        alRespuesta?.(m);
      }
    };
  }
  abrir();
  return {
    enviar(accion, datos, clave) {
      return new Promise(resolve => {
        const miId = ++id;
        pendientes.set(miId, resolve);
        ws.send(JSON.stringify({ tipo: 'accion', id: miId, accion, datos, clave }));
      });
    },
  };
}

// Huecos de cámara del overlay (coordenadas del lienzo 1920×1080, sin la placa del nombre).
// Todos en 16:9; la placa de 50 px va pegada debajo de cada hueco.
export const PLACA_CAMARA = 50;
export function disposicionCamaras(n) {
  const X = 620, W = 680;
  switch (n) {
    case 1: return [{ x: X, y: 320, w: 680, h: 383 }];
    case 2: return [{ x: X + 100, y: 224, w: 480, h: 270 }, { x: X + 100, y: 552, w: 480, h: 270 }];
    case 3: return [{ x: X + 60, y: 226, w: 560, h: 315 }, { x: X, y: 607, w: 334, h: 188 }, { x: X + W - 334, y: 607, w: 334, h: 188 }];
    case 4: return [0, 1, 2, 3].map(i => ({ x: i % 2 ? X + W - 334 : X, y: i < 2 ? 290 : 544, w: 334, h: 188 }));
    default: return [];
  }
}
