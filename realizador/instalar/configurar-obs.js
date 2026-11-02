// Deja OBS listo para el realizador (PC 2, o el mismo PC en las pruebas de un solo PC). Con OBS cerrado:
//
//   - Colección de escenas "Realizador": Juego, Repeticion, Casters y Pausa, con sus fuentes
//     (captura del juego, overlay de TENKA ICHI, "Repeticion clip", cámara, rótulos y audio).
//   - Perfil "Realizador": copia del perfil que usas ahora (clave de emisión incluida) con el búfer de
//     repetición activado y los clips en Vídeos\Realizador.
//   - Servidor WebSocket activado, con el puerto de opciones.json y una contraseña, que se apunta en
//     opciones.local.json para que el agente la use.
//   - OBS arranca con esa colección y ese perfil.
//
//   node instalar/configurar-obs.js
//   Opcional: --carpeta "C:\Users\yo\AppData\Roaming\obs-studio"   --overlay "https://.../overlay"
//
// No borra nada tuyo: tus colecciones y perfiles siguen en el menú de OBS, y lo que se cambia se copia antes
// en obs-studio\realizador-copia\<fecha>\.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ponerEnIni } from './configurar-lol.js';

export const NOMBRE = 'Realizador';
const ANCHO = 1920;
const ALTO = 1080;
const VENTANA_LOL = 'League of Legends (TM) Client:RiotWindowClass:League of Legends.exe';

export function carpetaObs() {
  if (process.env.APPDATA) return join(process.env.APPDATA, 'obs-studio');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'obs-studio');
  return join(homedir(), '.config', 'obs-studio');
}

// ---------- ini sencillo, para leer global.ini / user.ini ----------
export function leerIni(texto) {
  const r = {};
  let s = null;
  for (const l of texto.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = l.trim();
    const m = t.match(/^\[(.+)\]$/);
    if (m) { s = r[m[1]] ||= {}; continue; }
    const i = t.indexOf('=');
    if (s && i > 0) s[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return r;
}

const leerTexto = ruta => (existsSync(ruta) ? readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '') : '');

// ---------- colección de escenas ----------
function fuente(nombre, id, ajustes, { version, audio = false } = {}) {
  return {
    name: nombre, uuid: randomUUID(), id, versioned_id: version || id, settings: ajustes,
    enabled: true, muted: false, volume: 1.0, balance: 0.5, mixers: audio ? 255 : 0, flags: 0,
    sync: 0, monitoring_type: 0, hotkeys: {}, private_settings: {},
  };
}

function rotulo(nombre, contenido, tam) {
  return fuente(nombre, 'text_gdiplus', {
    text: contenido, font: { face: 'Arial', size: tam, style: 'Bold', flags: 1 },
    color: 0xFFFFFFFF, outline: true, outline_size: 4, outline_color: 0xFF000000,
  }, { version: 'text_gdiplus_v2' });
}

// Elemento de escena: a pantalla completa (por defecto) o a su tamaño, centrado en `centro`
function elemento(f, n, centro) {
  return {
    name: f.name, source_uuid: f.uuid, visible: true, locked: false, rot: 0.0,
    pos: centro || { x: 0, y: 0 }, scale: { x: 1.0, y: 1.0 },
    align: centro ? 0 : 5,  // 0 = centro, 5 = arriba a la izquierda
    bounds_type: centro ? 0 : 2, bounds_align: 0, bounds: centro ? { x: 0, y: 0 } : { x: ANCHO, y: ALTO },
    crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
    id: n, group_item_backup: false, scale_filter: 'disable', blend_method: 'default', blend_type: 'normal',
    show_transition: { duration: 0 }, hide_transition: { duration: 0 }, private_settings: {},
  };
}

// partes: lista de [fuente] o [fuente, centro]
function escena(nombre, partes) {
  const items = partes.map(([f, centro], i) => elemento(f, i + 1, centro));
  return fuente(nombre, 'scene', { custom_size: false, id_counter: items.length, items });
}

export function crearColeccion({ escenas, fuenteRepeticion, overlay = '' }) {
  const juego = fuente('Juego LoL', 'game_capture', {
    capture_mode: 'window', window: VENTANA_LOL, priority: 2, capture_cursor: false, allow_transparency: false,
  });
  const marcador = fuente('Overlay TENKA ICHI', 'browser_source', {
    url: overlay, width: ANCHO, height: ALTO, fps: 30, shutdown: false, restart_when_active: false,
    reroute_audio: false, css: 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }',
  });
  const clip = fuente(fuenteRepeticion, 'ffmpeg_source', {
    is_local_file: true, local_file: '', looping: false, restart_on_activate: false,
    close_when_inactive: false, clear_on_media_end: false, hw_decode: true,
  }, { audio: true });
  const fondo = fuente('Fondo', 'color_source', { color: 0xFF1A1410, width: ANCHO, height: ALTO }, { version: 'color_source_v3' });
  const camara = fuente('Camara casters', 'dshow_input', {});
  const rRepeticion = rotulo('Rotulo repeticion', 'REPETICIÓN', 64);
  const rCasters = rotulo('Rotulo casters', 'TENKA ICHI', 72);
  const rPausa = rotulo('Rotulo pausa', 'PAUSA · volvemos enseguida', 96);

  const lista = [
    escena(escenas.juego, [[juego], [marcador]]),
    escena(escenas.repeticion, [[clip], [marcador], [rRepeticion, { x: 220, y: 80 }]]),
    escena(escenas.casters, [[fondo], [camara], [rCasters, { x: ANCHO / 2, y: 980 }]]),
    escena(escenas.pausa, [[fondo], [rPausa, { x: ANCHO / 2, y: ALTO / 2 }]]),
  ];

  return {
    name: NOMBRE,
    current_scene: lista[0].name,
    current_program_scene: lista[0].name,
    scene_order: lista.map(e => ({ name: e.name })),
    sources: [...lista, juego, marcador, clip, fondo, camara, rRepeticion, rCasters, rPausa],
    groups: [],
    DesktopAudioDevice1: fuente('Audio del escritorio', 'wasapi_output_capture', { device_id: 'default' }, { audio: true }),
    AuxAudioDevice1: fuente('Mic/Aux', 'wasapi_input_capture', { device_id: 'default' }, { audio: true }),
    transitions: [],
    current_transition: 'Fade',
    transition_duration: 300,
    quick_transitions: [],
    saved_projectors: [],
    preview_locked: false,
    scaling_enabled: false,
    resolution: { x: ANCHO, y: ALTO },
    modules: {},
  };
}

// Busca en tus colecciones una fuente de navegador que parezca el overlay de TENKA ICHI
export function buscarOverlay(carpetaEscenas) {
  if (!existsSync(carpetaEscenas)) return '';
  for (const f of readdirSync(carpetaEscenas)) {
    if (!f.endsWith('.json') || f === `${NOMBRE}.json`) continue;
    try {
      const c = JSON.parse(leerTexto(join(carpetaEscenas, f)));
      const b = (c.sources || []).find(s => s.id === 'browser_source' && s.settings?.url &&
        /tenka|overlay|marcador/i.test(`${s.name} ${s.settings.url}`));
      if (b) return b.settings.url;
    } catch { /* colección rota o a medias: se ignora */ }
  }
  return '';
}

// ---------- perfil ----------
// codificador "x264" (por defecto): el del procesador, que funciona en cualquier PC. El que elige el asistente
// de OBS (QuickSync, NVENC, AMD) puede fallar con drivers viejos o portátiles con dos gráficas, y entonces
// el búfer no arranca. Con "" se deja el del perfil copiado.
export function ajustesPerfil({ carpetaClips, segundosBufer, codificador = 'x264' }) {
  const r = {
    General: { Name: NOMBRE },
    SimpleOutput: {
      // "Sin pérdidas" no deja usar el búfer: se graba con la calidad de la emisión
      FilePath: carpetaClips, RecFormat2: 'mkv', RecQuality: 'Stream', RecRB: 'true', RecRBTime: String(segundosBufer),
      RecRBSize: '1024', RecRBPrefix: 'Repeticion',
    },
    // Con "Salida personalizada (FFmpeg)" tampoco hay búfer: grabación estándar
    AdvOut: { RecType: 'Standard', RecFormat2: 'mkv', RecRB: 'true', RecRBTime: String(segundosBufer), RecRBSize: '1024', RecFilePath: carpetaClips },
  };
  if (codificador === 'x264') {
    Object.assign(r.SimpleOutput, { StreamEncoder: 'x264', RecEncoder: 'x264', Preset: 'veryfast' });
    Object.assign(r.AdvOut, { Encoder: 'obs_x264', RecEncoder: 'none' });  // none = el mismo que la emisión
  }
  return r;
}

// Solo para un perfil nuevo (si se copia el tuyo, se queda con tu vídeo y tu modo de salida)
const VIDEO_NUEVO = {
  Output: { Mode: 'Simple' },
  Video: { BaseCX: String(ANCHO), BaseCY: String(ALTO), OutputCX: String(ANCHO), OutputCY: String(ALTO), FPSType: '0', FPSCommon: '60' },
  Audio: { SampleRate: '48000', ChannelSetup: 'Stereo' },
};

// ---------- WebSocket ----------
export function ajustesWebsocket(puerto, clave) {
  return {
    OBSWebSocket: {
      FirstLoad: 'false', ServerEnabled: 'true', ServerPort: String(puerto),
      AlertsEnabled: 'false', AuthRequired: 'true', ServerPassword: clave,
    },
  };
}

// ---------- todo junto ----------
export function obsAbierto() {
  if (process.platform !== 'win32') return false;
  try {
    return /obs64\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], { encoding: 'utf8' }));
  } catch { return false; }
}

export function configurarObs({ carpeta, opciones, rutaLocal, overlay, overlayPorDefecto, carpetaClips }) {
  const o = opciones.obs;
  const hechos = [];
  const fecha = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const copia = join(carpeta, 'realizador-copia', fecha);
  const guardarCopia = (ruta, nombre) => {
    if (!existsSync(ruta)) return;
    mkdirSync(copia, { recursive: true });
    copyFileSync(ruta, join(copia, nombre));
  };
  const escribir = (ruta, texto) => {
    mkdirSync(join(ruta, '..'), { recursive: true });
    writeFileSync(ruta, texto);
  };

  // 1. Qué perfil y qué colección usas ahora (OBS 31 los guarda en user.ini; antes, en global.ini)
  const rutaGlobal = join(carpeta, 'global.ini');
  const rutaUser = join(carpeta, 'user.ini');
  const inis = [rutaUser, rutaGlobal].filter(existsSync);
  if (!inis.length) inis.push(rutaGlobal);  // OBS no se ha abierto nunca: lo leerá de global.ini
  const actual = leerIni(leerTexto(inis[0])).Basic || {};

  // 2. Colección de escenas
  const escenas = join(carpeta, 'basic', 'scenes');
  const url = overlay ?? (o.overlay || buscarOverlay(escenas) || overlayPorDefecto || '');
  const nombres = { juego: o.escenaJuego, repeticion: o.escenaRepeticion, casters: o.escenaCasters, pausa: o.escenaPausa };
  const rutaColeccion = join(escenas, `${NOMBRE}.json`);
  guardarCopia(rutaColeccion, `${NOMBRE}.json`);
  escribir(rutaColeccion, JSON.stringify(crearColeccion({ escenas: nombres, fuenteRepeticion: o.fuenteRepeticion, overlay: url }), null, 4));
  hechos.push(`Colección "${NOMBRE}": ${Object.values(nombres).join(', ')}`);

  // 3. Perfil: copia del actual (clave de emisión, codificador...) con el búfer de repetición
  const perfiles = join(carpeta, 'basic', 'profiles');
  const perfil = join(perfiles, NOMBRE);
  const base = actual.ProfileDir && actual.ProfileDir !== NOMBRE && existsSync(join(perfiles, actual.ProfileDir))
    ? join(perfiles, actual.ProfileDir) : null;
  guardarCopia(join(perfil, 'basic.ini'), 'perfil-basic.ini');
  mkdirSync(perfil, { recursive: true });
  let ini;
  if (base) {
    for (const f of readdirSync(base)) {
      if (/\.(ini|json)$/i.test(f)) copyFileSync(join(base, f), join(perfil, f));
    }
    ini = leerTexto(join(perfil, 'basic.ini'));
  } else {
    // Sin perfil del que copiar: el Realizador de una vez anterior se deja como está; si no hay, uno nuevo
    ini = leerTexto(join(perfil, 'basic.ini'));
    if (!ini) ini = ponerEnIni('', VIDEO_NUEVO);
  }
  mkdirSync(carpetaClips, { recursive: true });
  escribir(join(perfil, 'basic.ini'), ponerEnIni(ini, ajustesPerfil({ carpetaClips, segundosBufer: o.segundosBufer, codificador: o.codificador ?? 'x264' })));
  hechos.push(`Perfil "${NOMBRE}"${base ? ` (copia de "${actual.Profile || actual.ProfileDir}")` : ''}: búfer de repetición de ${o.segundosBufer} s, codificador ${(o.codificador ?? 'x264') || 'el de tu perfil'}, clips en ${carpetaClips}`);

  // 4. Clave del WebSocket: la de opciones.local.json o una nueva, que se apunta allí
  const local = existsSync(rutaLocal) ? JSON.parse(leerTexto(rutaLocal)) : {};
  local.obs ||= {};
  const clave = local.obs.clave || o.clave || randomBytes(9).toString('base64url');
  const puerto = Number(new URL(o.url).port) || 4455;
  local.obs.clave = clave;
  local.obs.activo = true;
  local.obs.url ||= `ws://127.0.0.1:${puerto}`;
  writeFileSync(rutaLocal, JSON.stringify(local, null, 2) + '\n');

  // 5. global.ini / user.ini: colección, perfil y WebSocket. Y el config.json de las versiones de
  //    obs-websocket que aún lo leen (las nuevas lo pasan solas al ini y lo borran).
  const cambios = {
    Basic: { Profile: NOMBRE, ProfileDir: NOMBRE, SceneCollection: NOMBRE, SceneCollectionFile: NOMBRE },
    ...ajustesWebsocket(puerto, clave),
  };
  for (const ruta of inis) {
    const nombre = ruta.endsWith('user.ini') ? 'user.ini' : 'global.ini';
    guardarCopia(ruta, nombre);
    escribir(ruta, ponerEnIni(leerTexto(ruta), cambios));
  }
  const rutaWs = join(carpeta, 'plugin_config', 'obs-websocket', 'config.json');
  guardarCopia(rutaWs, 'obs-websocket-config.json');
  escribir(rutaWs, JSON.stringify({
    alerts_enabled: false, auth_required: true, first_load: false,
    server_enabled: true, server_password: clave, server_port: puerto,
  }, null, 2));
  hechos.push(`WebSocket activado en el puerto ${puerto}`);

  return { hechos, clave, puerto, overlay: url, copia: existsSync(copia) ? copia : null };
}

// ---------- uso desde la línea de órdenes ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { cargarOpciones, RAIZ } = await import('../comun/opciones.js');
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
  const carpeta = arg('--carpeta') || carpetaObs();
  if (obsAbierto()) {
    console.error('OBS está abierto. Ciérralo (también de la bandeja, junto al reloj) y vuelve a ejecutar esto:');
    console.error('si no, OBS pisa los cambios al cerrarse.');
    process.exit(1);
  }
  try {
    const r = configurarObs({
      carpeta,
      opciones: cargarOpciones(),
      rutaLocal: join(RAIZ, 'opciones.local.json'),
      overlay: arg('--overlay'),
      carpetaClips: join(homedir(), 'Videos', NOMBRE),
    });
    console.log(`OBS configurado en ${carpeta}:`);
    for (const h of r.hechos) console.log(`  - ${h}`);
    if (r.copia) console.log(`  - Copia de lo que había en ${r.copia}`);
    console.log('');
    console.log(`Contraseña del WebSocket: ${r.clave}`);
    console.log('  Ya está en opciones.local.json de esta carpeta. Si el agente va en otro PC, ponla allí en');
    console.log(`  "obs": { "activo": true, "url": "ws://IP-DE-ESTE-PC:${r.puerto}", "clave": "${r.clave}" }`);
    console.log('');
    console.log(r.overlay
      ? `Overlay de TENKA ICHI: ${r.overlay}`
      : 'Overlay de TENKA ICHI: sin dirección. En OBS, doble clic en "Overlay TENKA ICHI" y pega la URL del overlay.');
    console.log('Falta a mano: elegir la cámara en "Camara casters" y, si no la tenías, la clave de emisión.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
