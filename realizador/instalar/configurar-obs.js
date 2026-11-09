// Deja OBS listo para el realizador (PC 2, o el mismo PC en las pruebas de un solo PC). Con OBS cerrado:
//
//   - Colección de escenas "Realizador": Juego, Repeticion, Casters, Pausa y Draft, con sus fuentes
//     (captura del juego, overlay de Gokudō, "Repeticion clip", cámaras, rótulos y audio). En Draft, cuatro
//     cámaras debajo del overlay: el relé las encaja en los huecos del draft y les pone la cámara elegida.
//     Con las transiciones de la repetición (obs/repeticion-entrada.webm y -salida.webm) y el overlay de REPLAY
//     (obs/replay.html), que se usan desde donde está instalado el realizador.
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
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ponerEnIni } from './configurar-lol.js';
import { disposicionCamaras, FUENTES as CAMARAS_DRAFT } from '../pc2/camaras.js';

export const NOMBRE = 'Realizador';
const ANCHO = 1920;
const ALTO = 1080;
// Transiciones (stinger) y overlay de REPLAY que vienen con el realizador, en la carpeta obs/
export const RECURSOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'obs');
export const TRANSICIONES = { entrada: 'Repeticion entrada', salida: 'Repeticion salida' };
export const OVERLAY_REPLAY = 'Overlay REPLAY';
export const ALERTAS = 'Alertas Kick';

// Fuentes de Gokudō que vienen en obs/fuentes (recortadas a lo que se usa, licencia OFL). Los rótulos de texto de
// OBS (Casters, Pausa) solo pueden usar fuentes instaladas en Windows: se instalan para este usuario, sin pedir
// permisos de administrador (carpeta %LOCALAPPDATA%\Microsoft\Windows\Fonts y su entrada en el registro).
export const FUENTES = [
  { archivo: 'DelaGothicOne-Regular.ttf', nombre: 'Dela Gothic One Regular (TrueType)' },
  { archivo: 'ZenKakuGothicNew-Bold.ttf', nombre: 'Zen Kaku Gothic New Bold (TrueType)' },
  { archivo: 'YujiBoku-Regular.ttf', nombre: 'Yuji Boku Regular (TrueType)' },
];
const regAdd = (nombre, ruta) => execFileSync('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', nombre, '/t', 'REG_SZ', '/d', ruta, '/f'], { stdio: 'ignore' });
export function instalarFuentes({ origen = join(RECURSOS, 'fuentes'), destino = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts') : null, registrar = regAdd } = {}) {
  if (!destino || !existsSync(origen)) return [];
  mkdirSync(destino, { recursive: true });
  const hechas = [];
  for (const f of FUENTES) {
    const desde = join(origen, f.archivo);
    if (!existsSync(desde)) continue;
    const hasta = join(destino, f.archivo);
    try { copyFileSync(desde, hasta); } catch { if (!existsSync(hasta)) continue; /* en uso: ya estaba instalada */ }
    try { registrar(f.nombre, hasta); hechas.push(f.nombre.replace(/ \(TrueType\)$/, '')); } catch { /* sin registro: OBS no la verá */ }
  }
  return hechas;
}

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

// Rótulos con la letra de Gokudō (Dela Gothic One) si está instalada en el PC; si no, OBS pone la suya
function rotulo(nombre, contenido, tam) {
  return fuente(nombre, 'text_gdiplus', {
    text: contenido, font: { face: 'Dela Gothic One', size: tam, style: 'Regular', flags: 0 },
    color: 0xFFFFFFFF, outline: true, outline_size: 4, outline_color: 0xFF000000,
  }, { version: 'text_gdiplus_v2' });
}

// Elemento de escena: a pantalla completa (por defecto), a su tamaño centrado en `centro`, o encajado en un
// recuadro (`centro` con w y h: x, y es la esquina de arriba a la izquierda)
function elemento(f, n, centro) {
  const caja = centro && centro.w ? centro : null;
  if (caja) centro = null;
  return {
    name: f.name, source_uuid: f.uuid, visible: !caja?.oculto, locked: false, rot: 0.0,
    pos: caja ? { x: caja.x, y: caja.y } : centro || { x: 0, y: 0 }, scale: { x: 1.0, y: 1.0 },
    align: centro ? 0 : 5,  // 0 = centro, 5 = arriba a la izquierda
    // 2 = ajustar dentro; 3 = cubrir el recuadro (las cámaras llenan su hueco)
    bounds_type: centro ? 0 : caja ? 3 : 2, bounds_align: 0, bounds: centro ? { x: 0, y: 0 } : caja ? { x: caja.w, y: caja.h } : { x: ANCHO, y: ALTO },
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

const rutaObs = r => r.replace(/\\/g, '/');

// Stinger: el vídeo con transparencia tapa la pantalla a los 400 ms, que es cuando OBS cambia de escena
function stinger(nombre, archivo) {
  return {
    name: nombre, id: 'obs_stinger_transition', versioned_id: 'obs_stinger_transition', uuid: randomUUID(),
    settings: { path: rutaObs(archivo), tp_type: 0, transition_point: 400, audio_monitoring: 0, audio_fade_style: 0 },
  };
}

export function crearColeccion({ escenas, fuenteRepeticion, overlay = '', recursos = null, alertas = '' }) {
  const juego = fuente('Juego LoL', 'game_capture', {
    capture_mode: 'window', window: VENTANA_LOL, priority: 2, capture_cursor: false, allow_transparency: false,
  });
  const marcador = fuente(NOMBRES_OVERLAY[0], 'browser_source', {
    url: overlay, width: ANCHO, height: ALTO, fps: 30, shutdown: false, restart_when_active: false,
    reroute_audio: false, css: 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }',
  });
  const clip = fuente(fuenteRepeticion, 'ffmpeg_source', {
    is_local_file: true, local_file: '', looping: false, restart_on_activate: false,
    close_when_inactive: false, clear_on_media_end: false, hw_decode: true,
  }, { audio: true });
  const fondo = fuente('Fondo', 'color_source', { color: 0xFF130D0C, width: ANCHO, height: ALTO }, { version: 'color_source_v3' });
  const camara = fuente('Camara casters', 'dshow_input', {});
  // Sin la carpeta obs/ (pruebas antiguas), un rótulo de texto; con ella, el overlay de REPLAY (apagado: lo
  // enciende el realizador al entrar en la repetición)
  const rRepeticion = recursos
    ? fuente(OVERLAY_REPLAY, 'browser_source', {
      is_local_file: true, local_file: rutaObs(join(recursos, 'replay.html')), width: ANCHO, height: ALTO, fps: 30,
      shutdown: true, restart_when_active: true, reroute_audio: false,
      css: 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }',
    })
    : rotulo('Rotulo repeticion', 'REPLAY', 64);
  const rCasters = rotulo('Rotulo casters', 'GOKUDŌ · LIGA DE FAMILIAS', 72);
  const rPausa = rotulo('Rotulo pausa', 'PAUSA · volvemos enseguida', 96);
  // Draft: las cámaras debajo y el overlay (que en el draft pinta su fondo con los huecos recortados) encima
  const camarasDraft = CAMARAS_DRAFT.map(n => fuente(n, 'dshow_input', {}));
  const huecos = disposicionCamaras(4);

  // Alertas de Kick (seguidores, subs, kicks…): página de la web, transparente, encima de todo en todas las escenas
  const fAlertas = alertas ? fuente(ALERTAS, 'browser_source', {
    url: alertas, width: ANCHO, height: ALTO, fps: 30, shutdown: false, restart_when_active: false,
    reroute_audio: true, css: 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }',
  }) : null;
  const conAlertas = partes => (fAlertas ? [...partes, [fAlertas]] : partes);

  const lista = [
    escena(escenas.juego, conAlertas([[juego], [marcador]])),
    // En la repetición solo el cartel REPLAY: el marcador se quita (Pacopepe, 08/11)
    escena(escenas.repeticion, conAlertas([[clip], [rRepeticion, recursos ? { x: 0, y: 0, w: ANCHO, h: ALTO, oculto: true } : { x: 220, y: 80 }]])),
    escena(escenas.casters, conAlertas([[fondo], [camara], [rCasters, { x: ANCHO / 2, y: 980 }]])),
    escena(escenas.pausa, conAlertas([[fondo], [rPausa, { x: ANCHO / 2, y: ALTO / 2 }]])),
    escena(escenas.draft || 'Draft', conAlertas([[fondo], ...camarasDraft.map((c, i) => [c, { ...huecos[i], oculto: true }]), [marcador]])),
  ];

  return {
    name: NOMBRE,
    current_scene: lista[0].name,
    current_program_scene: lista[0].name,
    scene_order: lista.map(e => ({ name: e.name })),
    sources: [...lista, juego, marcador, clip, fondo, camara, ...camarasDraft, rRepeticion, rCasters, rPausa, ...(fAlertas ? [fAlertas] : [])],
    groups: [],
    DesktopAudioDevice1: fuente('Audio del escritorio', 'wasapi_output_capture', { device_id: 'default' }, { audio: true }),
    AuxAudioDevice1: fuente('Mic/Aux', 'wasapi_input_capture', { device_id: 'default' }, { audio: true }),
    transitions: recursos ? [
      stinger(TRANSICIONES.entrada, join(recursos, 'repeticion-entrada.webm')),
      stinger(TRANSICIONES.salida, join(recursos, 'repeticion-salida.webm')),
    ] : [],
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

// Nombres que ha tenido la fuente del overlay en la colección del realizador (el viejo, de antes de Gokudō, y el de ahora)
export const NOMBRES_OVERLAY = ['Overlay Gokudō', 'Overlay TENKA ICHI'];

// Busca la dirección del overlay: primero en la fuente del realizador de una instalación anterior (con su nombre
// de ahora o el viejo, por si se cambió a mano), y si no, en tus colecciones una fuente de navegador que lo parezca
export function buscarOverlay(carpetaEscenas) {
  if (!existsSync(carpetaEscenas)) return '';
  try {
    const propia = JSON.parse(leerTexto(join(carpetaEscenas, `${NOMBRE}.json`)));
    const f = (propia.sources || []).find(s => NOMBRES_OVERLAY.includes(s.name) && s.settings?.url);
    if (f) return f.settings.url;
  } catch { /* sin colección del realizador todavía */ }
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
    // El lienzo siempre a 1920×1080: las escenas y los overlays están hechos a esa medida (con otro lienzo el
    // overlay sale cortado o en una esquina). La resolución de salida de tu perfil no se toca
    Video: { BaseCX: String(ANCHO), BaseCY: String(ALTO) },
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

// Solo para un perfil nuevo (si se copia el tuyo, se queda con tu resolución de salida y tu modo de salida)
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

// service.json de OBS para emitir por RTMP a un servidor propio (Kick): servidor y clave
export function servicioEmision({ servidor, clave }) {
  return { type: 'rtmp_custom', settings: { server: servidor, key: clave, use_auth: false, bwtest: false } };
}

export function configurarObs({ carpeta, opciones, rutaLocal, overlay, overlayPorDefecto, carpetaClips, recursos = RECURSOS, instalarLasFuentes = !process.env.NODE_TEST_CONTEXT }) {
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
  const nombres = { juego: o.escenaJuego, repeticion: o.escenaRepeticion, casters: o.escenaCasters, pausa: o.escenaPausa, draft: o.escenaDraft || 'Draft' };
  const rutaColeccion = join(escenas, `${NOMBRE}.json`);
  guardarCopia(rutaColeccion, `${NOMBRE}.json`);
  // Las alertas de Kick salen de la misma web que el overlay (/alertas/), salvo que opciones.json diga otra
  let alertas = o.alertas ?? '';
  if (o.alertas === undefined && /^https?:/i.test(url)) { try { alertas = new URL('/alertas/', url).href; } catch { /* sin dirección */ } }
  escribir(rutaColeccion, JSON.stringify(crearColeccion({ escenas: nombres, fuenteRepeticion: o.fuenteRepeticion, overlay: url, alertas, recursos: recursos && existsSync(recursos) ? recursos : null }), null, 4));
  hechos.push(`Colección "${NOMBRE}": ${Object.values(nombres).join(', ')}`);
  if (recursos && existsSync(recursos)) hechos.push(`Transiciones de la repetición ("${TRANSICIONES.entrada}", "${TRANSICIONES.salida}") y "${OVERLAY_REPLAY}"`);
  if (alertas) hechos.push(`Alertas de Kick en todas las escenas (${alertas})`);
  // Fuentes de Gokudō para los rótulos (solo en Windows; en las pruebas se pasa instalarFuentes: false)
  if (instalarLasFuentes && process.platform === 'win32') {
    const f = instalarFuentes({ origen: join(recursos || RECURSOS, 'fuentes') });
    if (f.length) hechos.push(`Fuentes instaladas para los rótulos: ${f.join(', ')}`);
  }

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
  // Clave de retransmisión (Kick): solo si está en opciones.local.json de este PC (la pide INSTALAR-PC2.bat). Nunca
  // se enseña ni se apunta en ningún sitio más: va directa al service.json del perfil. Sin clave, se queda la del
  // perfil copiado.
  const em = o.emision || {};
  if (em.clave) {
    writeFileSync(join(perfil, 'service.json'), JSON.stringify(servicioEmision(em), null, 4));
    hechos.push(`Clave de retransmisión puesta en el perfil "${NOMBRE}" (${em.servidor ? new URL(em.servidor).host : 'servidor por defecto'})`);
  }

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
      ? `Overlay de Gokudō: ${r.overlay}`
      : 'Overlay de Gokudō: sin dirección. En OBS, doble clic en "Overlay Gokudō" y pega la URL del overlay.');
    console.log('Falta a mano: elegir la cámara en "Camara casters" y, si no la tenías, la clave de emisión.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
