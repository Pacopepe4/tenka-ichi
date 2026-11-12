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
// La definitiva (la R) de cada campeón, con el nombre del id del campeón (npm run ddragon-definitivas)
export const definitiva = id => `/ddragon/definitiva/${id}.png`;
// El modo espectador del cliente no da el enfriamiento de la R: solo se sabe el nivel. La R se desbloquea a nivel 6 y
// sube a 11 y 16 (rango 0 a 3); estos cinco la tienen desde nivel 1 (es su cambio de forma o de postura) y se ven
// encendidos desde el principio
export const RANGOS_DEFINITIVA = [6, 11, 16];
const R_DESDE_NIVEL_1 = new Set(['Elise', 'Jayce', 'Karma', 'Nidalee', 'Udyr']);
export function estadoDefinitiva(campeon, nivel) {
  const rango = RANGOS_DEFINITIVA.filter(n => (Number(nivel) || 0) >= n).length;
  return { rango, encendida: rango > 0 || R_DESDE_NIVEL_1.has(campeon) };
}
export const logo = clan => `/logos/${clan}.png`;

// Conexión en directo con reconexión automática.
// Si la web se actualiza mientras la página está abierta (una fuente de OBS puede pasar así toda la jornada), al
// volver a conectarse llega una versión distinta y la página se recarga sola; con alVersion, se avisa en su lugar
// Con canal: 'sorteo' solo llega el sorteo del calendario en directo (la portada no necesita el estado del draft);
// con 'alertas', solo las alertas de Kick (seguidores, subs, regalos y kicks) para la fuente de OBS /alertas/
export function conectarDirecto({ alEstado, alRespuesta, alConexion, alPartida, alVersion, alSorteo, alAlerta, canal }) {
  let ws, pendientes = new Map(), id = 0, version = null, intentos = 0;
  function abrir() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws${canal ? `?canal=${canal}` : ''}`);
    ws.onopen = () => { intentos = 0; alConexion?.(true); };
    ws.onclose = () => {
      alConexion?.(false);
      // Lo que estuviera esperando respuesta se da por perdido, para que ningún botón se quede esperando
      for (const [, resolver] of pendientes) resolver({ ok: false, sinConexion: true, error: 'Se ha cortado la conexión con la web: prueba otra vez' });
      pendientes.clear();
      // Reintenta cada vez más despacio (1,5 s, 3 s, 6 s… hasta 15 s), con algo de azar: si la web se reinicia, las
      // fuentes de OBS y las páginas abiertas no vuelven todas a la vez ni insisten cada segundo y medio mientras no está
      const espera = Math.min(15000, 1500 * 2 ** intentos++) * (0.8 + Math.random() * 0.4);
      setTimeout(abrir, espera);
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
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

// El línea por línea del marcador de partida (y la gráfica de oro, que sale en su mismo hueco) va siempre encogido a
// ESCALA_LINEAS, que el marcador pone en .zona-lineas: así queda de x 430 a 1490 y de y 784 al borde de abajo.
// Desde el 08/11 solo hay un estilo (el A)
export const ESCALA_LINEAS = 0.68;  // 09/11: Pacopepe lo quiere más pequeño aún (antes 0.78)

// Cámara del caster en partida: un hueco en 16:9 abajo a la izquierda (el de la izquierda de siempre), con la placa
// del nombre (PLACA_CAMARA_PARTIDA) pegada debajo hasta el borde. Coordenadas del lienzo, sin la placa. Va por su
// cuenta, se vea o no el línea por línea (12/11). Abajo a la derecha va el marco del minimapa del LoL, pegado al borde
// para que cuadre con el mapa (lo calibra el realizador: más o menos de x 1640 a 1920 y de y 780 al borde): ahí no va
// nada del overlay (ZONA_MINIMAPA), así que la cámara de la derecha que había antes se quitó. Tampoco pisa la caja del
// línea por línea (desde x 430)
export const PLACA_CAMARA_PARTIDA = 44;
export const ZONA_MINIMAPA = { x: 1620, y: 780, w: 300, h: 300 };
export function camaraPartida() {
  const w = 320, h = 180, margen = 16;
  return { x: margen, y: 1080 - PLACA_CAMARA_PARTIDA - h, w, h };
}
// Alias de antes (lo que lo importe recibe ya solo el hueco de partida)
export const camarasLineas = () => [camaraPartida()];
