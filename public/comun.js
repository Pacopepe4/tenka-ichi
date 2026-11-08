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

// Los clanes que compiten en Tenka Ichi: ni los invitados ni los equipos Legacy (de la organización, pero fuera de la competición)
export const compite = c => !c.invitado && !c.legacy;

// Una fecha del calendario (AAAA-MM-DD) en palabras: «8 nov» o, con largo, «8 de noviembre»
// Un día y una hora de España (Europe/Madrid) como instante, sea cual sea la zona horaria de quien mira
export function horaEspana(fecha, hora = '00:00') {
  const supuesto = new Date(`${fecha}T${hora}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(supuesto).map(x => [x.type, x.value]));
  const enMadrid = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(supuesto.getTime() - (enMadrid - supuesto.getTime()));
}
// Las horas de los partidos de un día: el primero a su hora y cada uno, «margen» minutos después del anterior
export function horasDelDia(cuantos, primera = '17:00', margen = 45) {
  const [h, m] = primera.split(':').map(Number);
  return Array.from({ length: cuantos }, (_, i) => {
    const t = h * 60 + m + i * margen;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  });
}

export function fechaCorta(fecha, largo = false) {
  if (!fecha) return '';
  const d = new Date(`${fecha}T12:00:00Z`);
  return largo ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
}

export const icono = id => `/ddragon/icono/${id}.png`;
export const splash = id => `/ddragon/splash/${id}.jpg`;
export const logo = clan => `/logos/${clan}.png`;

// Conexión en directo con reconexión automática.
// Si la web se actualiza mientras la página está abierta (una fuente de OBS puede pasar así toda la jornada), al
// volver a conectarse llega una versión distinta y la página se recarga sola; con alVersion, se avisa en su lugar
// Con canal: 'sorteo' solo llega el sorteo del calendario en directo (la portada no necesita el estado del draft);
// con 'alertas', solo las alertas de Kick (seguidores, subs, regalos y kicks) para la fuente de OBS /alertas/
export function conectarDirecto({ alEstado, alRespuesta, alConexion, alPartida, alVersion, alSorteo, alAlerta, canal }) {
  let ws, pendientes = new Map(), id = 0, version = null;
  function abrir() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws${canal ? `?canal=${canal}` : ''}`);
    ws.onopen = () => alConexion?.(true);
    ws.onclose = () => {
      alConexion?.(false);
      // Lo que estuviera esperando respuesta se da por perdido, para que ningún botón se quede esperando
      for (const [, resolver] of pendientes) resolver({ ok: false, sinConexion: true, error: 'Se ha cortado la conexión con la web: prueba otra vez' });
      pendientes.clear();
      setTimeout(abrir, 1500);
    };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.tipo === 'hola') {
        if (version && m.version !== version) { if (alVersion) alVersion(m.version); else location.reload(); }
        version ??= m.version;
      }
      if (m.tipo === 'estado') alEstado?.(m.estado);
      if (m.tipo === 'partida') alPartida?.(m.partida);
      if (m.tipo === 'sorteo') alSorteo?.(m.sorteo);
      if (m.tipo === 'alerta') alAlerta?.(m.alerta);
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
        if (ws.readyState !== 1) return resolve({ ok: false, sinConexion: true, error: 'Sin conexión con la web: espera un momento y prueba otra vez' });
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

// Cámaras de los casters en el línea por línea del marcador de partida: dos huecos en 16:9, uno a cada lado del panel
// (izquierda y derecha), abajo, con la placa del nombre de 44 px pegada debajo. Mismas coordenadas del lienzo y sin
// la placa. El panel (y la gráfica de oro, que sale en su mismo hueco) va siempre encogido a ESCALA_LINEAS, que el
// marcador pone en .zona-lineas, haya cámaras o no: así queda de x 352 a 1568 y de y 740 al borde de abajo.
// Si se toca el tamaño del línea por línea o la escala, se tocan los huecos. Desde el 08/11 solo hay un estilo (el A)
export const ESCALA_LINEAS = 0.78;
export function camarasLineas() {
  const w = 320, h = 180, x = 16, y = 856;
  return [{ x, y, w, h }, { x: 1920 - x - w, y, w, h }];
}
