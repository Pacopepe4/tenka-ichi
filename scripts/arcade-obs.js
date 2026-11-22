// Modo arcade (22/11): la colección de escenas de OBS para importar en el PC de quien emite su partida normal con el
// overlay de Gokudō encima (public/arcade/). Una sola escena: la captura del LoL, su webcam en el hueco del overlay y
// el overlay; más el audio del escritorio y el micro. Sin alertas: cada uno usa las de su canal (se añaden a mano).
//   node scripts/arcade-obs.js [--nombre Livir] [--usuario liviir_] [--web https://gokudo.es] [--salida archivo.json]
// Sin --salida escribe public/arcade/gokudo-arcade-<nombre>.json, que se descarga de la web.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajustesArcade } from '../public/arcade/arcade.js';

const ANCHO = 1920, ALTO = 1080;
const VENTANA_LOL = 'League of Legends (TM) Client:RiotWindowClass:League of Legends.exe';
const TRANSPARENTE = 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }';

function fuente(nombre, id, ajustes, { audio = false, pistas = null } = {}) {
  return {
    name: nombre, uuid: randomUUID(), id, versioned_id: id, settings: ajustes, enabled: true, muted: false,
    volume: 1.0, balance: 0.5, mixers: pistas ?? (audio ? 255 : 0), flags: 0, sync: 0, monitoring_type: 0,
    hotkeys: {}, private_settings: {},
  };
}
// Elemento de escena: a pantalla completa o encajado en un recuadro (la webcam cubre su hueco y se recorta)
function elemento(f, n, caja) {
  return {
    name: f.name, source_uuid: f.uuid, visible: true, locked: false, rot: 0.0,
    pos: caja ? { x: caja.x, y: caja.y } : { x: 0, y: 0 }, scale: { x: 1.0, y: 1.0 }, align: 5,
    bounds_type: caja ? 3 : 2, bounds_align: 0, bounds: caja ? { x: caja.w, y: caja.h } : { x: ANCHO, y: ALTO },
    ...(caja ? { bounds_crop: true } : {}),
    crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0, id: n, group_item_backup: false,
    scale_filter: 'disable', blend_method: 'default', blend_type: 'normal',
    show_transition: { duration: 0 }, hide_transition: { duration: 0 }, private_settings: {},
  };
}

// Las cajas de la interfaz del LoL de cada uno (x,y,ancho,alto a 1920×1080), medidas en una captura suya. Las de Livir,
// de su directo del 22/11: el HUD más estrecho y a la izquierda que el de serie (desde las estadísticas, x 528, hasta el
// botón de la tienda; con las flechas de subir de nivel dentro), y el minimapa (con sus botones de la izquierda) de 1645
// a la esquina desde y 835
export const CAJAS = {
  livir: { barra: '528,944,746,136', mapa: '1645,835,275,245', marcador: '1557,0,363,28' },
};

export function urlArcade({ nombre, usuario, web = 'https://gokudo.es', cajas = null }) {
  const u = new URL('/arcade/', web);
  if (nombre) u.searchParams.set('nombre', nombre);
  if (usuario) u.searchParams.set('usuario', usuario);
  for (const k of ['barra', 'mapa', 'marcador']) if (cajas?.[k]) u.searchParams.set(k, cajas[k]);
  return u.href.replace(/%2C/gi, ',');  // las comas, legibles, para poder pegarla a mano
}

export function coleccionArcade({ nombre = 'Livir', usuario = 'liviir_', web = 'https://gokudo.es', cajas = CAJAS[String(nombre).toLowerCase()] || null } = {}) {
  const a = ajustesArcade(new URLSearchParams({ nombre, usuario }).toString());
  const juego = fuente('Juego LoL', 'game_capture', { capture_mode: 'window', window: VENTANA_LOL, priority: 2, capture_cursor: true, allow_transparency: false });
  // La webcam: el dispositivo se elige una vez (doble clic); suelta la cámara cuando no se ve
  const camara = fuente(`Camara ${a.nombre}`, 'dshow_input', { deactivate_when_not_showing: true });
  const overlay = fuente('Overlay Gokudō arcade', 'browser_source', {
    url: urlArcade({ nombre, usuario, web, cajas }), width: ANCHO, height: ALTO, fps: 30, shutdown: false,
    restart_when_active: false, reroute_audio: false, css: TRANSPARENTE,
  });
  const escenaNombre = 'Partida';
  const items = [elemento(juego, 1), elemento(camara, 2, { x: a.x, y: a.y, w: a.ancho, h: a.alto }), elemento(overlay, 3)];
  const escena = fuente(escenaNombre, 'scene', { custom_size: false, id_counter: items.length, items });
  return {
    name: `Gokudō · Arcade (${a.nombre})`,
    current_scene: escenaNombre, current_program_scene: escenaNombre,
    scene_order: [{ name: escenaNombre }],
    sources: [escena, juego, camara, overlay],
    groups: [],
    DesktopAudioDevice1: fuente('Audio del escritorio', 'wasapi_output_capture', { device_id: 'default' }, { audio: true }),
    AuxAudioDevice1: fuente('Mic/Aux', 'wasapi_input_capture', { device_id: 'default' }, { audio: true }),
    transitions: [], current_transition: 'Fundido', transition_duration: 300,
    quick_transitions: [], saved_projectors: [], modules: {},
  };
}

if (process.argv[1] && import.meta.url === `file:///${path.resolve(process.argv[1]).replace(/\\/g, '/').replace(/^\//, '')}`.replace(/ /g, '%20')) {
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
  const nombre = arg('--nombre') || 'Livir', usuario = arg('--usuario') || 'liviir_';
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const salida = arg('--salida') || path.join(raiz, 'public', 'arcade', `gokudo-arcade-${nombre.toLowerCase()}.json`);
  writeFileSync(salida, JSON.stringify(coleccionArcade({ nombre, usuario, web: arg('--web') }), null, 2) + '\n');
  console.log(`Colección de OBS escrita en ${salida}`);
}
