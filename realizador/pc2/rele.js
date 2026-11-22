// Relé del PC 2: no decide nada, solo recibe órdenes del agente del PC 1 y se las pasa al cliente de LoL
// que se emite (la antena), porque la Replay API solo escucha dentro del propio PC.
//  - Mantiene la antena unos 120 s por detrás del directo (pausa al empezar, corrige si se desvía).
//  - Recibe el guion por adelantado y mueve la cámara en local al llegar cada plano: un corte de red no se nota.
//  - Si deja de oír al PC 1, pasa a modo degradado: suelta la cámara y no hace nada más hasta que vuelva.
// Arranque: npm run rele
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cargarOpciones } from '../comun/opciones.js';
import { pedirJSON, leerCuerpo, responder } from '../comun/http.js';
import { anunciar, ficha, igual, CABECERA } from '../comun/puente.js';
import { Sala } from '../comun/sala.js';
import { Obs, segundosAtras } from '../pc1/obs.js';
import { Emision } from './emision.js';
import { Resumen, reloj } from './resumen.js';
import { condiciones } from '../comun/condiciones.js';
import { arrancarPanel } from '../pc1/panel.js';
import { POR_DEFECTO as BORDES, ajusteBorde, suavizar, zoomConBorde, posicionSeguido } from './bordes.js';
import { Tenka } from '../pc1/tenka.js';
import { CamarasDraft, CamarasPartida } from './camaras.js';
import { pedirAlertasTwitch } from '../comun/alertas-twitch.js';
import { webDe } from '../comun/app.js';
import { ALERTAS_TWITCH } from '../instalar/configurar-obs.js';
import { GrabadorLol, cursorEnClip } from './grabador.js';
import { Actualizador, codigoSala } from '../comun/app.js';
import { abrirObs, obsCorriendo } from './abrir-obs.js';
import { desconfigurarObs, restaurarDueno, arrancaConRealizador } from '../instalar/desconfigurar-obs.js';
import { carpetaObs } from '../instalar/configurar-obs.js';
import { secuencia as secuenciaCinematica, duracion as duracionCinematica, INICIO, RIO, tocaCinematica } from './cinematica.js';
import { juegoDeVision, ejecutarTeclas as ejecutarTeclasLol } from './teclas.js';
import { Casteo } from './casteo.js';
import { enlacesCasteo } from '../comun/casteo.js';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL as aUrl } from 'node:url';
import { RAIZ } from '../comun/opciones.js';

// Qué enseña el panel de Gokudō: un draft en marcha (DraftCore conectado o con turnos), el draft recién
// cerrado (postdraft) o nada de draft
// Interfaz del espectador en el LoL de la antena (Replay API, /replay/render): lo que no tiene que salir en la
// emisión porque ya lo enseña el overlay o no pinta nada en antena. Por defecto se quitan los campeones de los lados
// (interfaceFrames), la línea de tiempo (interfaceTimeline), los controles del espectador con el modo de cámara
// (interfaceReplay), el recuadro del campeón seguido (interfaceTarget) y los anuncios grandes del centro
// (interfaceAnnounce: primera sangre, multikills, objetivos, torres), que ahora saca el overlay de la web con el
// logo de la familia. El listado de kills de la derecha (interfaceKillCallouts) se deja: el overlay no lo tiene.
// Va en cada orden de cámara, así que se queda quitado aunque alguien pulse una tecla del espectador.
// En opciones.json → rele.interfaz se puede quitar o dejar cualquier otra parte (interfaceScoreboard, interfaceMinimap...).
export const INTERFAZ = { interfaceFrames: false, interfaceTimeline: false, interfaceReplay: false, interfaceTarget: false, interfaceAnnounce: false };
export function interfazEspectador(r = {}) {
  return { ...INTERFAZ, ...(r.interfaz || {}) };
}

export function draftDeTenka(e) {
  if (!e) return null;
  if (e.vistaOverlay === 'postdraft') return 'postdraft';
  if (e.vistaOverlay === 'draft' && (e.fuente?.conectado || (Number(e.draft?.turno) > 0 && Number(e.draft?.turno) <= 20))) return 'draft';
  return null;
}

// Fases del directo (espera, intro, pausa, postpartida, casters, cierre): pc2/fases.js. Import aparte; los enganches
// van en líneas sueltas más abajo (buscar «fases»)
import { Fases, jornadaDeTenka, FUENTES_FASES } from './fases.js';
// Tráilers del inicio del directo (tras la intro): pc2/traileres.js
import { Traileres, carpetasVideos, listarVideos, buscarFfprobe, duracionFfprobe, duracionFfmpeg } from './traileres.js';

// Segundo de partida que veía el PC 1 a la hora «hora», con su historial. Entre dos muestras avanza al ritmo
// del reloj, pero sin pasar de la siguiente (si el reloj se paró, se queda parado). Antes de la primera muestra,
// hacia atrás al ritmo del reloj (negativo = la partida aún no había empezado). Sin historial, null.
export function segundoHace(historial, hora) {
  if (!historial.length) return null;
  const primera = historial[0];
  if (hora <= primera.hora) return primera.t - (primera.hora - hora) / 1000;
  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i];
    if (m.hora > hora) continue;
    const sig = historial[i + 1];
    const avance = (hora - m.hora) / 1000;
    if (!sig) return m.t + avance;
    if (sig.t < m.t) return m.t;  // partida nueva en el PC 1: la antena sigue con el final de la anterior
    return m.t + Math.min(avance, Math.max(0, sig.t - m.t));
  }
  return null;
}

// obs: false para no tocar OBS desde el relé (modo de un solo PC, donde lo lleva el agente). En las pruebas,
// obs y sala pueden ser objetos de mentira.
export function crearRele(o, { registrar: registrarFuera = console.log, obs: conObs = true, grabador: otroGrabador = undefined, salir = null, sala: otraSala = null, panel: conPanel = false, tenka: otroTenka = undefined, rutaLocal = join(RAIZ, 'opciones.local.json'), ejecutarTeclas = ejecutarTeclasLol } = {}) {
  const r = o.rele;
  // Lo que se apunta también se guarda para la página del PC 2
  const registro = [];
  const registrar = texto => {
    registro.unshift({ hora: new Date().toISOString(), texto });
    registro.length = Math.min(registro.length, 60);
    registrarFuera(texto);
  };
  const api = r.replayApi.replace(/\/$/, '');
  const estado = {
    planos: [],
    directo: null,          // { t, hora }: segundo de partida en directo según el PC 1
    ultimoContacto: 0,
    manual: false,
    ordenManual: null,
    aplicado: null,         // clave del último plano aplicado a la cámara
    playback: null,
    modo: 'esperando',      // esperando | normal | manual | degradado | sin-juego
    ultimoSalto: 0,
    errores: 0,
    accionesObs: [],        // lo que hay que hacer en el OBS de este PC (lo manda el PC 1 con el guion)
    hechasObs: new Set(),
    camaraLibre: null,      // { t0, hasta, nombre }: secuencia de cámara en marcha (cinemática de inicio o recorrido)
    inicio: null,           // segundo en que salió la cinemática de inicio de esta partida (null: aún no)
    accionesRecorrido: [],  // recorridos de cámara para los ratos muertos (los manda el PC 1 con el guion)
    hechosRecorrido: new Set(),
    accionesVision: [],     // momentos de visión de cada equipo (los manda el PC 1 con el guion)
    hechasVision: new Set(),
    clips: new Map(),       // jugada → { ruta, t } (búfer de OBS, con el marcador dentro: para el resumen)
    clipsLol: new Map(),    // jugada → { ruta, t, inicioMs, guardadoMs } (solo el LoL, del grabador: para repetir)
    meta: null,             // segundo al que va (o irá) la antena; negativo mientras espera el margen
    tFin: null,             // segundo en que acabó la partida (lo dice el PC 1)
    historial: [],          // { t, hora }: segundo de partida del PC 1 según la hora en que llegó
    pc1EnPartida: null,
  };

  // OBS de este mismo PC: guarda el búfer y lanza las repeticiones cuando la antena llega a su segundo
  const obs = typeof conObs === 'object' ? conObs : conObs && o.obs?.activo && o.obs?.enRele
    ? new Obs({ url: `ws://127.0.0.1:${new URL(o.obs.url.replace(/auto/i, '127.0.0.1')).port || 4455}`, clave: o.obs.clave || o.clave || '' })
    : null;
  if (typeof conObs !== 'object') obs?.on('conexion', v => { if (v) registrar('[obs] conectado'); });
  if (typeof conObs !== 'object') obs?.on('problema', t => registrar(`[obs] ${t}`));
  if (typeof conObs !== 'object') obs?.conectar();

  // Pantalla del PC 2 (11/11): qué escena sale en OBS y su vista previa. La vista va por la cámara virtual de OBS
  // (la enciende el relé al conectar; solo se ve en este PC, no sale a internet) y, si no hay, por capturas.
  estado.escenaObs = null;
  estado.camaraVirtual = null;
  const conVista = (o.obs?.vista ?? 'camara') !== 'no';
  if (typeof obs?.on === 'function') {
    obs.on('evento', d => {
      if (d?.eventType === 'CurrentProgramSceneChanged') { estado.escenaObs = d.eventData?.sceneName || null; resumen.fueraDeEscena(estado.escenaObs); panel?.emitir(); }
      if (d?.eventType === 'VirtualcamStateChanged') { estado.camaraVirtual = Boolean(d.eventData?.outputActive); panel?.emitir(); }
    });
    obs.on('conexion', async v => {
      if (!v) return;
      try { estado.escenaObs = (await obs.pedir('GetCurrentProgramScene')).currentProgramSceneName || null; } catch { /* sin escena */ }
      if (!conVista || o.obs?.vista === 'capturas') return;
      try {
        const s = await obs.pedir('GetVirtualCamStatus');
        if (!s.outputActive) await obs.pedir('StartVirtualCam');
        estado.camaraVirtual = true;
      } catch (e) {
        estado.camaraVirtual = false;
        registrar(`[obs] sin cámara virtual para la vista previa (${e.message}): el panel usa capturas`);
      }
      panel?.emitir();
    });
  }
  // OBS lo abre el realizador: si no está abierto, se abre (en la bandeja) como mucho una vez por minuto; si está
  // abierto pero no contesta un buen rato, se dice en el panel (puede estar parado en un aviso de OBS)
  estado.obsAbierto = null;
  let vigiaObs = null;
  let ultimoIntentoObs = 0;
  let sinContestarDesde = null;
  async function vigilarObs() {
    if (!obs || typeof conObs === 'object' || obs.listo) { sinContestarDesde = null; return; }
    const abierto = await obsCorriendo();
    estado.obsAbierto = abierto;
    if (!abierto) {
      sinContestarDesde = null;
      devolverArranqueAlDueno();
      // Tras «Desconfigurar OBS» no se vuelve a abrir solo hasta que se arranque otra vez el realizador
      if (o.obs?.abrirSolo === false || estado.obsDesconfigurado || Date.now() - ultimoIntentoObs < 60000) return;
      ultimoIntentoObs = Date.now();
      try { abrirObs(o, { minimizado: true }); registrar('[obs] OBS no estaba abierto: abierto en la bandeja'); } catch (e) { registrar(`[obs] no se puede abrir OBS: ${e.message}`); }
      return;
    }
    if (!sinContestarDesde) sinContestarDesde = Date.now();
    else if (Date.now() - sinContestarDesde > 45000 && !estado.avisoObsColgado) {
      estado.avisoObsColgado = true;
      registrar('[obs] OBS está abierto pero no contesta: mira si tiene algún aviso abierto (bandeja, junto al reloj) o ciérralo y pulsa «Abrir OBS» en el panel');
    }
  }
  async function botonObs() {
    if (obs?.listo) throw new Error('OBS ya está conectado');
    if (await obsCorriendo()) throw new Error('OBS ya está abierto pero no contesta: búscalo en la bandeja (junto al reloj) y mira si tiene un aviso; si no, ciérralo desde el Administrador de tareas y vuelve a pulsar');
    abrirObs(o, { minimizado: false });
    ultimoIntentoObs = Date.now();
    estado.obsDesconfigurado = false;  // se vuelve a usar: el realizador lo vigila otra vez
    registrar('[obs] OBS abierto desde el panel');
  }

  const escenasMano = () => [o.obs?.escenaJuego, o.obs?.escenaCasters, o.obs?.escenaPausa, o.obs?.escenaDraft || 'Draft',
    o.obs?.escenaEspera || 'Espera', o.obs?.escenaIntro || 'Intro', o.obs?.escenaPostpartida || 'Postpartida', o.obs?.escenaCierre || 'Cierre'].filter(Boolean);
  async function ponerEscena({ nombre } = {}) {
    if (!obs?.listo) throw new Error('OBS no está conectado');
    if (!escenasMano().includes(nombre)) throw new Error(`No hay una escena «${nombre}»`);
    await obs.escena(nombre);
    estado.escenaObs = nombre;
    registrar(`[obs] escena ${nombre} a mano desde el panel`);
  }
  async function repetirUltima() {
    if (!obs?.listo) throw new Error('OBS no está conectado');
    const ultimaLimpia = [...estado.clipsLol.entries()].at(-1);
    const ultima = ultimaLimpia || [...estado.clips.entries()].at(-1);
    if (!ultima) throw new Error('Todavía no hay ninguna jugada guardada');
    const [jugada, clip] = ultima;
    const segundos = o.reglas?.repeticion?.segundos ?? 12;
    const atras = segundos + (o.reglas?.repeticion?.colchon ?? 1.5) + 1;
    await obs.repeticionCompleta({
      ruta: clip.ruta, fuente: o.obs.fuenteRepeticion, escena: o.obs.escenaRepeticion, escenaJuego: o.obs.escenaJuego,
      segundosAtras: atras, cursorMs: ultimaLimpia ? cursorEnClip(clip, atras) : undefined, segundos, g: o.obs.repeticion,
    });
    registrar(`[obs] repetición de ${jugada} a mano desde el panel${ultimaLimpia ? ' (clip limpio del LoL)' : ' (clip de OBS)'}`);
  }
  // Captura del juego a tamaño completo (sin overlay ni marco) para cuadrar el marco del minimapa (14/11): se guarda en
  // partidas/captura-juego-<hora>.png y se abre la carpeta con el archivo marcado para pasarlo
  // «Desconfigurar OBS» (16/11): cierra OBS y deja como perfil y colección de arranque los del dueño del PC, para que su
  // OBS de siempre no emita en los canales de Gokudō (instalar/desconfigurar-obs.js). Mientras no se arranque otra vez
  // el realizador, no se vuelve a abrir OBS solo.
  // OBS recuerda al cerrarse el último perfil: si el que se cerró era el del realizador, el arranque vuelve al del dueño
  // (con OBS cerrado; el realizador lo abre siempre con el suyo explícitamente)
  function devolverArranqueAlDueno() {
    if (o.obs?.devolverAlDueno === false || process.platform !== 'win32' || typeof conObs === 'object') return;
    try {
      const carpeta = o.obs?.carpeta || carpetaObs();
      if (!arrancaConRealizador(carpeta)) return;
      const r = restaurarDueno({ carpeta });
      if (r.ok) registrar(`[obs] OBS cerrado: vuelve a arrancar con el perfil del dueño («${r.perfil}»)`);
    } catch { /* sin configuración de OBS */ }
  }

  async function desconfigurarObsRele() {
    if (emision.salidaActiva) throw new Error('Se está emitiendo: corta la emisión antes de desconfigurar OBS');
    estado.obsDesconfigurado = true;
    const r = await desconfigurarObs();
    for (const h of r.hechos) registrar(`[obs] ${h}`);
    for (const f of r.faltan) registrar(`[obs] ojo: ${f}`);
    return r;
  }

  async function capturaJuego() {
    if (!obs?.listo) throw new Error('OBS no está conectado');
    const r = await obs.pedir('GetSourceScreenshot', { sourceName: 'Juego LoL', imageFormat: 'png', imageWidth: 1920, imageHeight: 1080 });
    const datos = Buffer.from(String(r.imageData || '').replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (datos.length < 1000) throw new Error('OBS no ha dado la imagen del juego: ¿está el LoL abierto en partida?');
    const carpeta = join(o.registro?.raiz || RAIZ, o.registro?.carpeta || 'partidas');
    mkdirSync(carpeta, { recursive: true });
    const ruta = join(carpeta, `captura-juego-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
    writeFileSync(ruta, datos);
    registrar(`[obs] captura del juego para el marco del minimapa: ${ruta}`);
    if (process.platform === 'win32') {
      try { spawn('explorer.exe', [`/select,${ruta}`], { detached: true, stdio: 'ignore' }).unref(); } catch { /* sin explorador */ }
    }
    return { ruta };
  }

  // Imagen de lo que sale (si no hay cámara virtual): pequeña y como mucho unas pocas por segundo
  let ultimaCaptura = { hora: 0, img: null };
  async function capturaObs() {
    if (!obs?.listo || !estado.escenaObs) return null;
    if (Date.now() - ultimaCaptura.hora < 200) return ultimaCaptura.img;
    try {
      const r = await obs.pedir('GetSourceScreenshot', { sourceName: estado.escenaObs, imageFormat: 'jpg', imageWidth: 640, imageCompressionQuality: 70 });
      const img = Buffer.from(String(r.imageData || '').replace(/^data:image\/\w+;base64,/, ''), 'base64');
      ultimaCaptura = { hora: Date.now(), img };
      return img;
    } catch { return null; }
  }

  // Grabador del LoL (ffmpeg): clips limpios, sin el marcador, para las repeticiones. Solo con OBS de verdad.
  const rutaFfmpeg = o.clips?.ffmpeg || [join(RAIZ, 'herramientas', 'ffmpeg', 'ffmpeg.exe')].find(existsSync) || 'ffmpeg';
  const grabador = otroGrabador !== undefined ? otroGrabador
    : (obs && typeof conObs !== 'object' && o.clips?.activo !== false ? new GrabadorLol({ ffmpeg: rutaFfmpeg, opciones: o.clips || {}, registrar }) : null);
  const carpetaClipsLol = join(o.registro?.raiz || RAIZ, o.registro?.carpeta || 'partidas', 'clips-lol');

  // El botón de «Empezar directo»: arranca OBS justo para que la partida salga desde el principio
  // Al acabar la partida, la escena final es la Postpartida (y de ahí a Casters lo lleva fases); sin postpartida, Casters
  const conPostpartida = (o.directo?.postpartidaSegundos ?? 30) > 0;
  const emision = new Emision({
    opciones: o.emision, obs, registrar, retenida: () => fases.retiene(),
    escenas: { juego: o.obs?.escenaJuego, previa: o.obs?.escenaPausa, final: conPostpartida ? (o.obs?.escenaPostpartida || 'Postpartida') : o.obs?.escenaCasters, draft: o.obs?.escenaDraft || 'Draft' },
  });
  // Tráilers del inicio (pc2/traileres.js): los vídeos de obs.videosDirecto.carpeta, uno detrás de otro en «Trailer directo»
  const ffprobe = buscarFfprobe(o, RAIZ);
  const traileres = new Traileres({
    obs, fuente: o.obs?.fuenteTraileres || 'Trailer directo', registrar,
    listar: () => listarVideos(carpetasVideos(o, RAIZ)),
    medir: async ruta => (await duracionFfprobe(ffprobe, ruta)) ?? (await duracionFfmpeg(rutaFfmpeg, ruta)),
    // Medio segundo de más por vídeo: lo que tarda OBS en abrirlo (así la fase no corta el final del último)
    alAjustar: (id, s) => fases.ajustarTemporal(id, s > 0 ? s + 0.5 : 0),
    alCambiar: d => { fases.detalle = d; panel?.emitir(); },
  });
  // Fases del directo (pc2/fases.js): decide la fase y sus tiempos; el relé pone la escena que dice (pasoFases)
  const fases = new Fases({
    opciones: o.directo, registrar, duracionTraileres: () => (traileres.videos.length ? traileres.duracion() + traileres.videos.length * 0.5 : 0),
    escenas: {
      espera: o.obs?.escenaEspera, intro: o.obs?.escenaIntro, traileres: o.obs?.escenaTraileres, draft: o.obs?.escenaDraft, pausa: o.obs?.escenaPausa, partida: o.obs?.escenaJuego,
      repeticion: o.obs?.escenaRepeticion, postpartida: o.obs?.escenaPostpartida, casters: o.obs?.escenaCasters, resumen: o.obs?.escenaResumen, cierre: o.obs?.escenaCierre,
    },
  });

  // Resumen en vídeo al acabar la partida (pc2/resumen.js): los clips de las jugadas destacadas, seguidos, en la escena
  // Resumen. Primero el clip del búfer de OBS, que lleva el sonido del juego (Pacopepe, 12/11: «Búfer de OBS», aunque
  // se vea el marcador dentro); si no lo hay, el limpio del LoL, que va sin sonido.
  const urlPlaca = aUrl(join(RAIZ, 'obs', 'resumen.html')).href;
  const resumen = new Resumen({
    opciones: o.resumen, obs, registrar,
    escenas: { resumen: o.obs?.escenaResumen || 'Resumen', casters: o.obs?.escenaCasters || 'Casters' },
    fuente: o.obs?.fuenteResumen || 'Resumen clip', placa: o.obs?.placaResumen || 'Overlay RESUMEN',
    urlPlaca: item => `${urlPlaca}?t=${encodeURIComponent(reloj(item.t ?? item.desde))}`,
    clipDe: jugada => [
      estado.clips.get(jugada) && { ...estado.clips.get(jugada), bufer: o.obs?.segundosBufer ?? 60 },
      estado.clipsLol.get(jugada) && { ...estado.clipsLol.get(jugada), bufer: o.clips?.clipSegundos ?? 60 },
    ].filter(Boolean),
    // La antena llegó al final y aún falta algún clip (la API del LoL se calla al acabar): un último clip del búfer
    guardarFinal: async jugadas => {
      if (!obs?.listo || !jugadas.length) return;
      const ruta = await obs.guardarRepeticion();
      const t = (Number.isFinite(estado.tFin) ? estado.tFin : tAntenaAhora() ?? 0) + (o.emision?.segundosTrasFin ?? 5);
      for (const j of jugadas) estado.clips.set(j, { ruta, t });
      registrar(`[resumen] clip del final guardado para ${jugadas.join(', ')}`);
    },
  });
  // Al acabar: postpartida y, al entrar en Casters, la cuenta atrás del resumen (el clip del final se guarda ya)
  emision.on('final', () => { fases.alFinal(); resumen.alAcabarEnAntena({ retener: conPostpartida }).catch(e => registrar(`[resumen] ${e.message}`)); });
  fases.on('casters', () => resumen.soltar());
  // Se vuelve a Casters por donde sea (también con «Automático» tras algo a mano): el resumen retenido se suelta
  // (no hace nada si no lo está). Y al entrar en la espera o la intro se vuelve a mirar la carpeta de los tráilers
  fases.on('cambio', f => {
    if (f.actual === 'casters') resumen.soltar();
    if (obs && (f.actual === 'espera' || f.actual === 'intro')) traileres.preparar().catch(() => {});
  });
  fases.on('parar', () => emision.orden({ accion: 'terminar' }).catch(e => registrar(`[emisión] ${e.message}`)));

  // Panel de Gokudō (solo para mirar): si hay draft, y cuántas cámaras tiene puestas
  const tenka = otroTenka !== undefined ? otroTenka
    : (o.tenkaIchi?.activo && o.tenkaIchi?.url ? new Tenka({ url: o.tenkaIchi.url, clave: o.tenkaIchi.clave || o.clave || '' }) : null);
  if (tenka && otroTenka === undefined) {
    tenka.on('conexion', v => registrar(v ? '[tenka] conectado al panel de Gokudō' : '[tenka] sin conexión con el panel de Gokudō'));
    tenka.conectar();
  }
  // Cámaras de la escena de draft, encajadas en los huecos del overlay
  const camaras = obs ? new CamarasDraft({ obs, escena: o.obs?.escenaDraft || 'Draft', registrar, elegidos: o.obs?.camarasDraft || [] }) : null;
  tenka?.on?.('estado', e => camaras?.desdeTenka(e));
  // Y las de los casters en la escena de juego, encendidas con las casillas del panel (22/11)
  const camarasPartida = obs ? new CamarasPartida({ obs, escena: o.obs?.escenaJuego || 'Juego', registrar }) : null;
  tenka?.on?.('estado', e => camarasPartida?.desdeTenka(e));
  // Alertas de Twitch al día (EGM 22/11, M4 y M6): al conectar OBS (y cada media hora) se pide la URL a la web y, si la
  // fuente de OBS no la tiene, se le pone. Así un token nuevo en el server llega sin reinstalar, y tras «Desconfigurar
  // OBS» (que la quita de la colección) vuelve sola. La URL no se escribe en el registro
  let twitchRevisada = 0;
  async function revisarAlertasTwitch() {
    if (!obs?.listo) { twitchRevisada = 0; return; }
    if (Date.now() - twitchRevisada < 30 * 60 * 1000) return;
    twitchRevisada = Date.now();
    const r = await pedirAlertasTwitch({ web: webDe(o), clave: o.clave });
    if (typeof r.url !== 'string') {
      if (r.error) registrar(`[obs] alertas de Twitch: no se ha podido preguntar a la web (${r.error})`);
      return;
    }
    try {
      const { inputSettings } = await obs.pedir('GetInputSettings', { inputName: ALERTAS_TWITCH });
      if (inputSettings?.url === r.url) return;
      await obs.pedir('SetInputSettings', { inputName: ALERTAS_TWITCH, inputSettings: { url: r.url } });
      registrar('[obs] alertas de Twitch puestas al día con la web');
    } catch { registrar(`[obs] no hay fuente «${ALERTAS_TWITCH}» en OBS: cierra OBS y pasa INSTALAR-PC2.bat (o 4-configurar-obs.bat) para crearla`); }
  }
  function elegirCamaras(lista) {
    if (!camaras) throw new Error('Este PC no lleva OBS');
    camaras.elegir(lista);
    // Se guarda en opciones.local.json para la próxima vez
    try {
      const local = existsSync(rutaLocal) ? JSON.parse(readFileSync(rutaLocal, 'utf8').replace(/^\uFEFF/, '')) : {};
      local.obs = { ...(local.obs || {}), camarasDraft: camaras.elegidos };
      writeFileSync(rutaLocal, JSON.stringify(local, null, 2) + '\n');
    } catch (e) { registrar(`[cámaras] no se pudo guardar la elección: ${e.message}`); }
    registrar('[cámaras] cámaras del draft elegidas');
  }

  async function hacerObs(tA) {
    if (!obs) return;
    for (const a of estado.accionesObs) {
      if (estado.hechasObs.has(a.id) || a.t > tA) continue;
      estado.hechasObs.add(a.id);
      if (tA - a.t > 10) { registrar(`[obs] ${a.tipo} ${a.jugada}: llega tarde, se salta`); continue; }
      if (!obs.listo) { registrar(`[obs] ${a.tipo} ${a.jugada}: OBS no está conectado`); continue; }
      try {
        if (a.tipo === 'guardar') {
          // Primero el clip limpio del LoL (casi no tarda); luego el del búfer de OBS, que es el que lleva los micros
          if (grabador?.activo) {
            const nombre = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${a.jugada}.mp4`;
            try {
              const c = await grabador.clip(join(carpetaClipsLol, nombre));
              estado.clipsLol.set(a.jugada, { ...c, t: tA });
              registrar(`[grabador] clip limpio de ${a.jugada} guardado`);
            } catch (e) { registrar(`[grabador] clip de ${a.jugada}: ${e.message}`); }
          }
          try {
            const ruta = await obs.guardarRepeticion();
            estado.clips.set(a.jugada, { ruta, t: tA });
            registrar(`[obs] clip de ${a.jugada} guardado`);
          } catch (e) { registrar(`[obs] clip de ${a.jugada}: ${e.message}`); }
        } else if (a.tipo === 'repeticion') {
          if (estado.manual) { registrar(`[obs] repetición de ${a.jugada}: control manual, se salta`); continue; }
          if (fases.manual) { registrar(`[obs] repetición de ${a.jugada}: fase ${fases.actual} a mano, se salta`); continue; }
          // Mejor el clip limpio del LoL, empezando justo donde toca; si no hay, el del búfer de OBS como antes
          const limpio = estado.clipsLol.get(a.jugada);
          const clip = limpio || estado.clips.get(a.jugada);
          if (!clip?.ruta) { registrar(`[obs] repetición de ${a.jugada}: no hay clip`); continue; }
          const atras = segundosAtras(a, clip);
          const cursorMs = limpio ? cursorEnClip(limpio, atras) : undefined;
          await (obs.repeticionCompleta
            ? obs.repeticionCompleta({ ruta: clip.ruta, fuente: o.obs.fuenteRepeticion, escena: o.obs.escenaRepeticion, escenaJuego: o.obs.escenaJuego, segundosAtras: atras, cursorMs, segundos: a.segundos, g: o.obs.repeticion })
            : obs.lanzarRepeticion({ ruta: clip.ruta, fuente: o.obs.fuenteRepeticion, escena: o.obs.escenaRepeticion, segundosAtras: atras, cursorMs }));
          registrar(`[obs] repetición de ${a.jugada}${limpio ? ' (clip limpio del LoL)' : ' (clip de OBS)'}`);
          if (!obs.repeticionCompleta) setTimeout(() => obs.escena(o.obs.escenaJuego).catch(() => {}), a.segundos * 1000).unref?.();
        }
      } catch (e) { registrar(`[obs] ${a.tipo} ${a.jugada}: ${e.message}`); }
    }
  }

  const render = cuerpo => pedirJSON(`${api}/replay/render`, { metodo: 'POST', cuerpo, tiempoMs: 1500 });
  const playback = cuerpo => pedirJSON(`${api}/replay/playback`, { metodo: 'POST', cuerpo, tiempoMs: 1500 });

  // ---------- cámara y zoom ----------
  // El zoom es el campo de visión (fov) y la distancia de la cámara al seguido (desplazamientoCamara × distancia).
  // Cada cambio de zoom se hace poco a poco (transicionSegundos); un cambio de seguido es un corte, pero
  // con el zoom de base ya algo abierto el salto se nota menos.
  const zooms = r.zoom || {};
  const nivel = n => zooms[n] || zooms.abierto || { fov: 50, distancia: 1 };
  const zoomDe = p => (!p || p.tipo === 'general' || !p.objetivo || p.zoom === 'general' ? 'general' : (p.zoom === 'cerca' ? 'cerca' : 'abierto'));

  // Cerca de los bordes del mapa el plano se mueve hacia dentro y se cierra un poco (ver bordes.js)
  const cb = { ...BORDES, ...(r.bordes || {}) };
  cb.zona = { ...BORDES.zona, ...(r.bordes?.zona || {}) };
  cb.desplazamiento = { ...BORDES.desplazamiento, ...(r.bordes?.desplazamiento || {}) };
  estado.borde = { k: 0, dx: 0, dz: 0 };

  const interfaz = interfazEspectador(r);
  function camara(p, zBase) {
    if (!p || p.tipo === 'general' || !p.objetivo) return { ...interfaz, cameraAttached: false, cameraMode: 'top', fieldOfView: zBase.fov };
    const b = cb.activo ? estado.borde : { k: 0, dx: 0, dz: 0 };
    const z = zoomConBorde(zBase, nivel('cerca'), b.k);
    const nombre = r.seleccionarPor === 'campeon' ? p.objetivo.campeon : (p.objetivo.jugador || p.objetivo.campeon);
    const d = r.desplazamientoCamara;
    const offset = { x: d.x * z.distancia + b.dx, y: d.y * z.distancia, z: d.z * z.distancia + b.dz };
    estado.offsetEnviado = offset;
    return { ...interfaz, cameraMode: 'fps', cameraAttached: true, selectionName: nombre, selectionOffset: offset, fieldOfView: z.fov };
  }

  const clave = p => (p ? `${p.tipo}:${p.objetivo?.campeon || ''}:${p.objetivo?.jugador || ''}` : 'general');
  const suave = x => x * x * (3 - 2 * x);  // smoothstep: arranca y frena despacio
  let animacion = 0;                       // cada transición nueva cancela la anterior
  let secuencia = 0;                       // y cada plano nuevo cancela el cambio de seguido a medias
  estado.zoom = { ...nivel('general') };   // zoom aplicado ahora mismo

  // ---------- zoom suave ----------
  // El LoL solo deja fijar el campo de visión y la distancia: cada orden es un salto. Por eso el zoom:
  //  A) Por defecto (zoom.modo "secuencia") lo hace el propio juego: una secuencia de la Replay API con el valor de
  //     ahora y el de destino, y el motor interpola en cada imagen con una curva suave (smoothStep). Probado el 09/11
  //     en un LoL real, también siguiendo a un jugador. Al acabar se quita la secuencia y se deja el valor final.
  //  B) Si la secuencia no se puede (antena en pausa o acelerada, o la API no la acepta): muchas órdenes pequeñas
  //     (pasosPorSegundo, pasoFov) a ritmo fijo y con la misma curva suave.
  //  C) Sin jugador fijado (vista de arriba) no hay animación: zoom fijo. Y al cambiar de jugador, corte directo
  //     con el zoom nuevo (ver aplicar). Mientras dura un zoom, el ajuste de bordes no toca la cámara.
  const enviarSecuencia = cuerpo => pedirJSON(`${api}/replay/sequence`, { metodo: 'POST', cuerpo, tiempoMs: 1500 });
  const pausa = ms => new Promise(f => setTimeout(f, ms));
  // Zoom que se ve ahora mismo: si hay una secuencia a medias, el punto de la curva en el que va. Al quitar una
  // secuencia el LoL salta a su valor final, así que un zoom nuevo que corta a otro tiene que salir de aquí
  // (si saliera del valor de antes, la cámara iría al final del primero y volvería atrás: dos golpes).
  function zoomAhora() {
    const s = estado.secuenciaActiva && estado.secuenciaZoom;
    const t = tAntenaAhora();
    if (!s || !Number.isFinite(t)) return { ...estado.zoom };
    const k = suave(Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))));
    return { fov: s.desde.fov + (s.destino.fov - s.desde.fov) * k, distancia: s.desde.distancia + (s.destino.distancia - s.desde.distancia) * k };
  }
  async function quitarSecuencia() {
    if (!estado.secuenciaActiva) return;
    estado.secuenciaActiva = null;
    estado.secuenciaZoom = null;
    await enviarSecuencia({}).catch(() => {});
  }
  const sinFijar = p => !p || p.tipo === 'general' || !p.objetivo;

  async function zoomConSecuencia(p, desde, destino, segundos, yo) {
    const pb = estado.playback;
    if (!pb || pb.paused || (pb.speed && pb.speed !== 1)) return false;
    const t0 = tAntenaAhora() + 0.15;
    const t1 = t0 + segundos;
    const a = camara(p, desde);
    const b = camara(p, destino);
    const marcas = (va, vb) => [{ time: t0, value: va, blend: 'smoothStep' }, { time: t1, value: vb, blend: 'smoothStep' }];
    try {
      await enviarSecuencia({ fieldOfView: marcas(a.fieldOfView, b.fieldOfView), selectionOffset: marcas(a.selectionOffset, b.selectionOffset) });
    } catch { return false; }
    estado.secuenciaActiva = yo;
    estado.secuenciaZoom = { t0, t1, desde: { ...desde }, destino: { ...destino } };
    estado.zoom = { ...desde };
    await pausa((segundos + 0.3) * 1000);
    if (yo !== animacion || estado.secuenciaActiva !== yo) return true;  // un corte u otro zoom ya la han quitado
    estado.zoom = { ...destino };
    await quitarSecuencia();
    await render(camara(p, estado.zoom)).catch(() => {});
    return true;
  }

  async function zoomConPasos(p, desde, destino, segundos, yo) {
    const ritmo = r.zoom?.pasosPorSegundo ?? 60;
    const pasoFov = r.zoom?.pasoFov ?? 0.1;
    const pasoDistancia = r.zoom?.pasoDistancia ?? 0.003;
    // La curva suave va hasta 1,5 veces más deprisa en el centro: se cuenta para que ningún paso pase de pasoFov
    const pasos = Math.max(1, Math.round(segundos * ritmo),
      Math.ceil(1.5 * Math.abs(destino.fov - desde.fov) / pasoFov), Math.ceil(1.5 * Math.abs(destino.distancia - desde.distancia) / pasoDistancia));
    const intervalo = 1000 / ritmo;
    const t0 = Date.now();
    for (let i = 1; i <= pasos; i++) {
      if (yo !== animacion) return;
      const k = suave(i / pasos);
      estado.zoom = { fov: desde.fov + (destino.fov - desde.fov) * k, distancia: desde.distancia + (destino.distancia - desde.distancia) * k };
      try { await render(camara(p, estado.zoom)); } catch { return; }
      // Ritmo fijo: si la orden tardó, la siguiente sale antes (sin acumular retraso ni hacer pasos más grandes)
      if (i < pasos) await pausa(Math.max(0, t0 + (i + 1) * intervalo - Date.now()));
    }
  }

  async function transicion(p, destino, segundos = r.zoom?.transicionSegundos ?? 2) {
    const yo = ++animacion;
    const desde = zoomAhora();
    estado.zoom = { ...desde };
    if (Math.abs(desde.fov - destino.fov) < 0.01 && Math.abs(desde.distancia - destino.distancia) < 0.001) return;
    const conSecuencia = (r.zoom?.modo ?? 'secuencia') === 'secuencia';
    // Una secuencia nueva sustituye a la anterior sin quitarla (quitarla haría saltar al final de la vieja)
    if (sinFijar(p) || !conSecuencia) await quitarSecuencia();
    if (sinFijar(p)) {
      // C) Vista de arriba: zoom fijo, sin animación
      estado.zoom = { ...destino };
      await render(camara(p, estado.zoom)).catch(() => {});
      return;
    }
    estado.animando = yo;
    try {
      const hecho = conSecuencia && await zoomConSecuencia(p, desde, destino, segundos, yo);
      if (!hecho) {
        // Sin secuencia nueva: si quedaba una vieja, se quita y se vuelve a poner el punto de ahora
        if (estado.secuenciaActiva) { await quitarSecuencia(); await render(camara(p, desde)).catch(() => {}); }
        if (conSecuencia) registrar(`[zoom] sin secuencia (antena ${estado.playback ? (estado.playback.paused ? 'en pausa' : `a x${estado.playback.speed ?? 1}`) : 'sin datos'}): zoom a pasos`);
        await zoomConPasos(p, desde, destino, segundos, yo);
      }
    } finally {
      if (estado.animando === yo) estado.animando = null;
    }
  }

  // Vigila dónde está el seguido y ajusta el plano si se acerca a un borde del mapa. Mientras hay una
  // transición de zoom en marcha no manda nada: la transición ya usa el ajuste en cada paso.
  let temporizadorBordes = null;
  let ultimaVueltaBordes = Date.now();
  let bordeCerca = false;
  let parado = false;
  async function vigilarBordes() {
    const ahora = Date.now();
    const dt = Math.min(1, (ahora - ultimaVueltaBordes) / 1000);
    ultimaVueltaBordes = ahora;
    const p = estado.planoCamara;
    if (!cb.activo || !p || p.tipo !== 'seguir' || !p.objetivo) { estado.borde = { k: 0, dx: 0, dz: 0 }; return; }
    let pos = null;
    try { pos = posicionSeguido(await pedirJSON(`${api}/replay/render`, { tiempoMs: 1000 }), estado.offsetEnviado); } catch { return; }
    if (p !== estado.planoCamara) return;  // cambió de plano mientras se preguntaba
    const objetivo = ajusteBorde(pos, cb);
    const antes = estado.borde;
    // Recién cambiado de seguido (corte): el ajuste del anterior no vale, se pone el del nuevo de golpe
    estado.borde = estado.bordeDeGolpe ? objetivo : suavizar(antes, objetivo, dt, cb.suavizadoSegundos);
    estado.bordeDeGolpe = false;
    const ahoraCerca = objetivo.k > 0.05 || Math.abs(objetivo.dx) + Math.abs(objetivo.dz) > 50;
    if (ahoraCerca !== bordeCerca) {
      bordeCerca = ahoraCerca;
      registrar(`[cámara] ${ahoraCerca ? `${p.objetivo.campeon} cerca del borde del mapa: plano hacia dentro` : 'fuera de los bordes: plano normal'}`);
    }
    const cambio = Math.abs(estado.borde.k - antes.k) > 0.005 || Math.abs(estado.borde.dx - antes.dx) > 3 || Math.abs(estado.borde.dz - antes.dz) > 3;
    if (cambio && !estado.animando) await render(camara(p, estado.zoom)).catch(() => {});
  }
  function bucleBordes() {
    vigilarBordes().catch(() => {}).finally(() => { if (!parado) temporizadorBordes = setTimeout(bucleBordes, cb.cadaMs); });
  }

  async function aplicar(plano, motivo) {
    // Plano general justo después de seguir a alguien: en vez de soltar la cámara (en el LoL eso es un salto feo
    // a la vista de arriba), se sigue al mismo con el zoom más abierto. Solo se suelta si aún no se ha seguido a nadie.
    let p = plano;
    if ((!p || p.tipo === 'general' || !p.objetivo) && r.generalSigueAlUltimo !== false && estado.ultimoSeguido) {
      p = { tipo: 'seguir', objetivo: estado.ultimoSeguido, zoom: 'general', jugada: null, general: true };
    }
    if (p?.tipo === 'seguir' && p.objetivo && !p.general) estado.ultimoSeguido = p.objetivo;
    const k = clave(p);
    const z = zoomDe(p);
    if (estado.aplicado === k && estado.zoomAplicado === z) return;
    const destino = nivel(z);
    const sec = ++secuencia;
    const anterior = estado.planoCamara;
    const salida = r.zoom?.salidaSegundos ?? 0.5;
    // Cambio de un jugador a otro: por defecto, un corte limpio con el zoom que haya (abrir, cortar y cerrar daba
    // tirones). Con zoom.abrirAlCambiar: true se vuelve a lo de antes.
    const previo = estado.aplicado;
    // Corte de verdad: otro jugador o fijar/soltar la cámara (no basta con que se haya olvidado el plano anterior)
    const otroObjetivo = clave(estado.planoCamara) !== k;
    const cambioDeSeguido = r.zoom?.abrirAlCambiar === true && previo !== k && anterior?.tipo === 'seguir' && p?.tipo === 'seguir' && salida > 0;
    estado.aplicado = k;
    estado.zoomAplicado = z;
    estado.planoCamara = p;
    // En el corte, el ajuste de bordes del anterior no vale: se quita y se pone de golpe el del nuevo
    const corte = () => { estado.borde = { k: 0, dx: 0, dz: 0 }; estado.bordeDeGolpe = true; };
    if (cambioDeSeguido) {
      (async () => {
        await transicion(anterior, nivel('general'), salida);
        if (sec !== secuencia) return;
        animacion++;
        corte();
        await render(camara(p, estado.zoom)).catch(() => {});
        if (sec !== secuencia) return;
        await transicion(p, destino);
      })().catch(() => {});
    } else if (otroObjetivo || !estado.planoCamara) {
      // C) Corte (otro jugador, o soltar/fijar): directo con el zoom nuevo, sin animación
      animacion++;  // un corte para cualquier transición a medias
      corte();
      await quitarSecuencia();
      estado.zoom = r.zoom?.zoomEnLosCortes === false ? estado.zoom : { ...destino };
      await render(camara(p, estado.zoom));
      if (r.zoom?.zoomEnLosCortes === false) transicion(p, destino);
    } else {
      transicion(p, destino);  // mismo jugador, otro zoom: suave, sin esperar (el relé sigue con la antena)
    }
    registrar(`[cámara] ${motivo}: ${p?.general ? `plano general sobre ${p.objetivo.campeon}` : p?.tipo === 'seguir' ? `sigue a ${p.objetivo.campeon}` : 'plano general'} (zoom ${z})`);
  }

  // ---------- cámara libre: cinemática de inicio y recorridos (pc2/cinematica.js) ----------
  // Secuencias de la cámara del propio LoL (Replay API), nunca vídeo:
  //  - la cinemática de inicio (20 s) sale una vez por partida al pasar a «partida» (la antena en marcha en sus
  //    primeros segundos). Cuando el relé tenga fases (hilo de optimización: espera → inicio → draft → partida → …),
  //    este es el sitio para colgarla de la entrada en «partida»;
  //  - el recorrido del río, en los ratos muertos que elige el PC 1 (lo manda con el guion como «recorrido»).
  // Mientras dura una, la cámara es suya; si el PC 1 manda una jugada, se corta. Devuelve true mientras dura.
  async function camaraLibre(pb) {
    const c = estado.camaraLibre;
    if (c) {
      const t = tAntenaAhora();
      const jugada = estado.planos.find(x => x.jugada && x.inicio <= t && (x.fin === null || x.fin > t));
      if (t < c.hasta && !jugada && !estado.manual) return true;
      estado.camaraLibre = null;
      await enviarSecuencia({}).catch(() => {});
      await render({ ...interfaz, fogOfWar: true, cameraMode: 'top', cameraAttached: false }).catch(() => {});
      estado.aplicado = null; estado.zoomAplicado = null; estado.planoCamara = null;
      registrar(`[cinemática] ${c.nombre} ${jugada ? `cortada por la jugada ${jugada.jugada}` : 'terminada'}: la cámara vuelve al realizador`);
      return false;
    }
    // Mientras la antena espera su margen (meta negativa) aún no ha empezado nada: el relé la va a pausar
    if (estado.meta !== null && estado.meta < 0) return false;
    if (estado.inicio === null && tocaCinematica({ opciones: r.cinematicaInicio || {}, pb, hecha: false, manual: estado.manual })) {
      estado.inicio = pb.time;
      // Sin niebla: al empezar la partida no se ve casi nada del mapa
      return lanzarCamaraLibre(pb, INICIO, 'de inicio', { fogOfWar: false });
    }
    if (estado.inicio === null && pb.time > (r.cinematicaInicio?.hastaSegundo ?? 20)) estado.inicio = -1;  // entró tarde: ya no sale
    // Recorrido para un rato muerto
    const t = tAntenaAhora();
    for (const a of estado.accionesRecorrido) {
      if (estado.hechosRecorrido.has(a.id) || a.t > t) continue;
      estado.hechosRecorrido.add(a.id);
      if (r.recorridos?.activo === false) continue;
      if (t - a.t > 2 || estado.manual || pb.paused || pb.seeking || (pb.speed && pb.speed !== 1)) { registrar(`[cinemática] recorrido ${a.id}: no toca ahora, se salta`); continue; }
      if (estado.planos.some(x => x.jugada && x.inicio <= t && (x.fin === null || x.fin > t))) continue;
      return lanzarCamaraLibre(pb, RIO, `recorrido del río (${a.id})`, {});
    }
    return false;
  }

  async function lanzarCamaraLibre(pb, guion, nombre, extra) {
    const t0 = pb.time + 0.3;
    animacion++; secuencia++;           // cualquier zoom a medias se olvida
    estado.secuenciaActiva = null; estado.secuenciaZoom = null;
    try {
      await render({ ...interfaz, cameraMode: 'fps', cameraAttached: false, selectionName: '', ...extra });
      await enviarSecuencia(secuenciaCinematica(t0, guion));
      estado.camaraLibre = { t0, hasta: t0 + duracionCinematica(guion), nombre };
      registrar(`[cinemática] ${nombre} en ${t0.toFixed(1)} s, ${duracionCinematica(guion)} s`);
      return true;
    } catch (e) {
      registrar(`[cinemática] ${nombre}: no se pudo lanzar: ${e.message}`);
      await render({ ...interfaz, fogOfWar: true }).catch(() => {});
      estado.aplicado = null;
      return false;
    }
  }

  // ---------- visión de cada equipo (pc2/teclas.js) ----------
  // En las peleas por objetivos el PC 1 manda un momento «vision»: visión del azul, del rojo y vuelta a la de los
  // dos, con F1/F2/F3 en el LoL. Apagado de fábrica (rele.vision.activo) hasta probarlo en directo.
  let enVision = false;
  function hacerVision(tA) {
    for (const a of estado.accionesVision) {
      if (estado.hechasVision.has(a.id) || a.t > tA) continue;
      estado.hechasVision.add(a.id);
      if (r.vision?.activo !== true) { registrar(`[visión] ${a.jugada || a.id}: apagada en opciones (rele.vision.activo)`); continue; }
      if (tA - a.t > 3) { registrar(`[visión] ${a.jugada || a.id}: llega tarde, se salta`); continue; }
      if (estado.manual || enVision) continue;
      enVision = true;
      registrar(`[visión] ${a.jugada || a.id}: azul, rojo y vuelta a los dos`);
      juegoDeVision({ segundos: a.segundos ?? r.vision?.segundosPorEquipo ?? 2, ejecutar: ejecutarTeclas })
        .catch(e => registrar(`[visión] no se pudo: ${e.message}`))
        .finally(() => { enVision = false; });
    }
  }

  // ¿Las fases no dejan entrar la partida todavía? (pc2/fases.js, contrato con el hilo de optimización: bloqueaPartida)
  // Con la emisión ya en directo, nunca: en plena partida lo puesto a mano solo tapa. Sin fases, como siempre.
  function partidaBloqueada() {
    if (typeof fases?.bloqueaPartida !== 'function' || emision.fase === 'directo') return false;
    try { return Boolean(fases.bloqueaPartida()); } catch { return false; }
  }
  // El botón «Partida» (orden «partida» de las fases) la mete desde el 0:00 aunque no estuviera bloqueada antes
  // (por ejemplo, con la repetición ya corriendo en la antena). Una vez en directo, no cambia nada.
  fases?.on?.('meterPartida', ({ porOrden } = {}) => {
    if (!porOrden || emision.fase === 'directo') return;
    estado.bloqueadaAntes = false;
    estado.metida = Date.now();
    estado.inicio = null;
    // La antena vuelve ya al 0:00 y espera la previa allí (si saltara al final de la previa, se vería el salto)
    playback({ paused: true, time: 0 }).then(() => { estado.ultimoSalto = Date.now(); }).catch(() => {});
    registrar('[antena] botón «Partida»: entra desde el 0:00, con su previa');
  });

  // Segundo de partida al que debería ir la antena
  // La antena enseña lo que el PC 1 veía hace «margen» segundos de reloj: así las pausas y el final de la
  // partida (cuando el reloj del PC 1 se para) salen igual, y no hay que corregir hacia atrás.
  function objetivoAntena(pb) {
    const h = estado.historial;
    const fresco = estado.directo && Date.now() - estado.directo.hora < 10000;
    const meta = segundoHace(h, Date.now() - o.margenSegundos * 1000);
    if (meta !== null && (fresco || meta <= (h.at(-1)?.t ?? -Infinity))) return Math.min(meta, pb.length);
    return pb.length - o.margenSegundos;
  }

  async function paso() {
    let pb;
    try {
      pb = await pedirJSON(`${api}/replay/playback`, { tiempoMs: 1500 });
      estado.playback = { ...pb, hora: Date.now() };
      casteo?.paso({ lol: true }).catch(e => registrar(`[casteo] ${e.message}`));
      estado.errores = 0;
    } catch (e) {
      if (++estado.errores === 3) registrar(`[antena] sin respuesta de la Replay API: ${e.message}`);
      estado.playback = null;
      casteo?.paso({ lol: false }).catch(() => {});
      estado.modo = 'sin-juego';
      estado.meta = null;
      await pasoEmision();
      return;
    }

    // 1. Retraso de la antena (en una partida grabada el reloj lo lleva quien la ve: el relé solo mueve la cámara)
    const ahora = Date.now();
    let meta = r.controlarReloj === false ? null : objetivoAntena(pb);
    // La partida siempre desde el 0:00 (15/11, Pacopepe: «cuando meto partida debe empezar ahí siempre»). Mientras las
    // fases la bloquean (espera, intro, tráilers o algo a mano antes de que entre), la antena espera en el 0:00 pausada
    // aunque el PC 1 vaya adelantado. Al soltarse (fin del inicio o el botón «Partida»), la partida arranca desde el
    // 0:00 con su previa: el retraso puede pasar del margen, nunca bajar de él.
    if (meta !== null && partidaBloqueada()) {
      estado.bloqueadaAntes = true;
      estado.metida = null;
      estado.ultimoSeguido = null;
      estado.inicio = null;
      if ((!pb.paused || pb.time > 1) && ahora - estado.ultimoSalto > 3000 && !pb.seeking) {
        await playback({ paused: true, time: 0 });
        estado.ultimoSalto = ahora;
        registrar('[antena] partida en espera en el 0:00 (las fases aún no la dejan entrar)');
      }
      meta = undefined;
      estado.meta = -1e6;  // para la emisión: aún no hay partida que sacar
    } else if (meta !== null) {
      if (estado.bloqueadaAntes) {
        estado.bloqueadaAntes = false;
        estado.metida = ahora;
        registrar('[antena] entra la partida: desde el 0:00, con su previa');
      }
      if (estado.metida) meta = Math.min(meta, (ahora - estado.metida) / 1000 - (o.emision?.previaSegundos ?? 10));
    }
    if (meta !== undefined) estado.meta = meta;
    if (meta === null || meta === undefined) {
      // nada
    } else if (meta < 0) {
      if (!pb.paused) { await playback({ paused: true }); registrar('[antena] en pausa hasta tener el margen'); }
      estado.ultimoSeguido = null;  // partida nueva: el último seguido era de la anterior
      estado.inicio = null;
    } else if (pb.paused) {
      await playback({ paused: false, time: meta, speed: 1 });
      estado.ultimoSalto = ahora;
      registrar(`[antena] en marcha en ${meta.toFixed(1)} s`);
    } else if (Math.abs(pb.time - meta) > r.toleranciaSegundos && ahora - estado.ultimoSalto > 3000 && !pb.seeking) {
      await playback({ time: meta });
      estado.ultimoSalto = ahora;
      registrar(`[antena] corregida de ${pb.time.toFixed(1)} a ${meta.toFixed(1)} s`);
    } else if (pb.speed && pb.speed !== 1) {
      await playback({ speed: 1 });
    }

    // La interfaz del espectador (sin campeones a los lados, línea de tiempo, controles ni recuadro del seguido) se
    // vuelve a mandar cada 5 s, aunque la cámara no se mueva: así no vuelve aunque alguien pulse una tecla del LoL
    if (ahora - (estado.interfazEnviada || 0) > 5000) {
      estado.interfazEnviada = ahora;
      render({ ...interfaz }).catch(() => {});
    }

    // 2. Cámara
    const sinNoticias = (ahora - estado.ultimoContacto) / 1000 > r.degradadoTrasSegundos;
    // Si la antena vuelve muy atrás (otra partida en el mismo cliente), la cinemática puede volver a salir
    if (estado.inicio !== null && estado.inicio >= 0 && pb.time < estado.inicio - 30) estado.inicio = null;
    if (await camaraLibre(pb)) {
      // Mientras dura la cinemática de inicio, la cámara es suya
    } else if (estado.manual) {
      estado.modo = 'manual';
      if (estado.ordenManual) await aplicar(estado.ordenManual, 'orden manual');
    } else if (sinNoticias) {
      if (estado.modo !== 'degradado') registrar('[relé] sin noticias del PC 1: modo degradado');
      estado.modo = 'degradado';
      await aplicar(null, 'modo degradado');
    } else {
      estado.modo = 'normal';
      const t = pb.time;
      const p = estado.planos.find(x => x.inicio <= t && (x.fin === null || x.fin > t));
      await aplicar(p || null, p?.jugada ? `jugada ${p.jugada}` : 'guion');
    }

    // 3. OBS (repeticiones) y visión de cada equipo
    hacerObs(pb.time).catch(e => registrar(`[obs] ${e.message}`));
    hacerVision(pb.time);

    // 4. Emisión (el botón de empezar el directo)
    await pasoEmision();
  }

  // ---------- emisión con un botón ----------
  const pc1Conectado = () => (sala ? sala.companero : Date.now() - estado.ultimoContacto < 10000);
  const partidaPc1 = () => Boolean(estado.directo && Date.now() - estado.directo.hora < 10000 && estado.pc1EnPartida !== false);
  function condicionesAhora() {
    return condiciones({
      papel: 'pc2', pc1: pc1Conectado(), pc2: true, partidaPc1: partidaPc1(), partidaPc2: Boolean(estado.playback),
      obs: obs ? Boolean(obs.listo) : null, obsProblema: obs?.problema || null, bufer: emision.salidas ? emision.salidas.bufer : null, sala: sala?.sala ? String(sala.sala).slice(0, 4).toUpperCase() : codigoSala(o.clave), claveMal: estado.claveMal,
    });
  }
  function tAntenaAhora() {
    const pb = estado.playback;
    return pb ? (pb.paused ? pb.time : pb.time + (Date.now() - pb.hora) / 1000) : null;
  }
  async function pasoEmision() {
    try {
      await emision.paso({
        meta: estado.meta, tAntena: tAntenaAhora(), pausado: estado.playback?.paused ?? true,
        juego: Boolean(estado.playback), listo: condicionesAhora().listo, tFin: estado.tFin,
        draft: draftDeTenka(tenka?.estado),
        // La antena llega al final un margen después de que el PC 1 lo viera
        finEsperado: Number.isFinite(estado.finHora) ? estado.finHora + o.margenSegundos * 1000 : null,
      });
    } catch (e) { registrar(`[emisión] ${e.message}`); }
    try { await pasoFases(); } catch (e) { registrar(`[fases] ${e.message}`); }
    resumen.actualizar({ draft: Boolean(draftDeTenka(tenka?.estado)), enJuego: emision.fase === 'previa' || emision.fase === 'directo' });
    camaras?.paso().catch(() => {});
    camarasPartida?.paso().catch(() => {});
    revisarAlertasTwitch().catch(() => {});
  }
  // ---------- fases del directo (pc2/fases.js) ----------
  // Pone la escena que dice fases (las suyas, o las pedidas a mano), saca al aire lo que lleva fases con la emisión
  // armada y tiene al día la dirección de espera.html (hasta y jornada) y cabecera.html (jornada)
  const recursoFase = n => (existsSync(join(RAIZ, 'obs', n)) ? aUrl(join(RAIZ, 'obs', n)).href : null);
  const urlsBase = { [FUENTES_FASES.espera]: recursoFase('espera.html'), [FUENTES_FASES.cabecera]: recursoFase('cabecera.html') };
  let urlsPuestas = {};
  // Al volver OBS se vuelve a poner la escena de la fase (por si se cortó justo al cambiar, al acabar la intro)
  if (typeof obs?.on === 'function') obs.on('conexion', v => { if (v) { urlsPuestas = {}; fases.autor = true; } });
  const jornadaAhora = () => jornadaDeTenka(tenka?.estado) || fases.jornada || '';
  async function pasoFases() {
    if (!obs) return;
    const { escena } = fases.paso({
      emision: emision.fase, escenaAuto: emision.escenaAuto, meta: estado.meta, draft: Boolean(draftDeTenka(tenka?.estado)),
      resumen: resumen.publico(), escenaObs: estado.escenaObs,
    });
    if (escena && obs.listo) {
      try { await obs.escena(escena); estado.escenaObs = escena; } catch (e) { registrar(`[fases] no se pudo poner la escena ${escena}: ${e.message}`); }
    }
    // Tráilers: al entrar en la fase (o al pedirlos otra vez) empiezan desde el primero; si la fase se corta, se paran
    const t = fases.temporal;
    if (fases.actual === 'traileres' && t?.fase === 'traileres') {
      if (traileres.id !== t.id && obs.listo) traileres.empezar(t.id);
    } else if (traileres.activo) traileres.parar(`fase ${fases.actual || 'ninguna'}`);
    // El resumen en vídeo no arranca su cuenta ni sale encima de lo puesto a mano (salvo Casters) ni de una intro, unos
    // tráilers o una postpartida en marcha: se suelta al volver a Casters
    if ((fases.mano && fases.mano !== 'casters') || fases.temporal) resumen.retener();
    if (fases.retiene() && emision.fase !== 'apagada' && !emision.salidaActiva) await emision.alAire(`(${fases.actual || 'fase'})`);
    if (!obs.listo || !obs.ponerUrl) return;
    for (const [fuente, base] of Object.entries(urlsBase)) {
      if (!base) continue;
      const q = new URLSearchParams();
      if (fuente === FUENTES_FASES.espera && fases.hasta) q.set('hasta', String(fases.hasta));
      q.set('jornada', jornadaAhora());
      const url = `${base}?${q}`;
      if (urlsPuestas[fuente] === url) continue;
      urlsPuestas[fuente] = url;
      await obs.ponerUrl(fuente, url).catch(e => registrar(`[fases] ${fuente}: ${e.message}`));
    }
  }
  // Orden de un panel: { fase: espera | intro | traileres | pausa | postpartida | casters | cierre | auto | saltar, hasta?, jornada? }
  async function ordenFase(d = {}) {
    if (!obs) throw new Error('Este PC no lleva OBS');
    if (d.fase === 'traileres') await traileres.preparar();
    fases.orden(d);
    await pasoFases();
    sala?.enviar({ tipo: 'estado', ...estadoPublico() });
    panel?.emitir();
  }

  // Segundos que faltan para que la partida salga en antena (desde el principio)
  // Con la partida bloqueada por las fases (meta −1e6) no hay cuenta que enseñar
  const faltan = () => (Number.isFinite(estado.meta) && estado.meta < 0 && estado.meta > -1e5 ? -estado.meta : null);

  function estadoPublico() {
    const pb = estado.playback;
    const tAntena = pb ? (pb.paused ? pb.time : pb.time + (Date.now() - pb.hora) / 1000) : null;
    return {
      tAntena, pausado: pb?.paused ?? null, length: pb?.length ?? null, modo: estado.modo,
      plano: estado.aplicado, zoom: estado.zoomAplicado || null, planos: estado.planos.length,
      obs: obs ? obs.listo : null,
      juego: Boolean(pb), faltan: faltan(), emision: emision.publico(),
      bufer: emision.salidas ? emision.salidas.bufer : null,
      resumen: obs ? resumen.publico() : null,  // sin OBS en este PC no hay resumen en vídeo
      fase: obs ? fases.publico() : null,       // fases del directo (sin OBS, null)
    };
  }

  // Página del PC 2 (la misma interfaz que el PC 1, con lo que se sabe aquí)
  // Casteo a distancia con VDO.Ninja (comun/casteo.js, pc2/casteo.js): abre solo sus páginas si rele.casteo.activo.
  // Los enlaces de los casters salen en el panel aunque esté apagado (para abrirlos a mano)
  const enlacesCaster = o.clave ? enlacesCasteo(o.clave, { calidad: r.casteo?.calidad ?? 1 }) : null;
  const casteo = r.casteo?.activo === true && process.platform === 'win32' && enlacesCaster ? new Casteo({ enlaces: enlacesCaster, registrar }) : null;

  function foto() {
    const c = condicionesAhora();
    const tA = tAntenaAhora();
    const tD = partidaPc1() ? estado.directo.t + (Date.now() - estado.directo.hora) / 1000 : null;
    return {
      papel: 'pc2',
      conexiones: { ...(sala ? { puente: sala.unido } : {}), pc1: pc1Conectado(), obs: obs ? Boolean(obs.listo) : null, tenka: tenka ? Boolean(tenka.listo) : null },
      camaras: camaras ? camaras.publico() : null,
      camarasPartida: camarasPartida ? camarasPartida.publico() : null,
      draft: draftDeTenka(tenka?.estado),
      condiciones: c.lista, listo: c.listo,
      emision: emision.publico(), faltan: faltan(), resumen: obs ? resumen.publico() : null,
      fase: obs ? fases.publico() : null, jornada: obs ? jornadaAhora() || null : null,
      tDirecto: tD, tAntena: tA, margenReal: tA !== null && tD !== null ? tD - tA : null, margen: o.margenSegundos,
      modoRele: estado.modo, manual: estado.manual,
      registro: registro.slice(0, 40).map(l => ({ hora: l.hora, quien: 'PC 2', que: l.texto })),
      app: { ...app.publico(), sala: sala?.sala ? String(sala.sala).slice(0, 4).toUpperCase() : null },
      casteo: enlacesCaster ? { automatico: Boolean(casteo), ...enlacesCaster } : null,
      grabador: grabador ? { activo: grabador.activo, forma: grabador.forma?.nombre || null } : null,
      vista: obs ? {
        escena: estado.escenaObs, escenas: escenasMano(), camaraVirtual: estado.camaraVirtual, modo: o.obs?.vista ?? 'camara',
        hayJugada: estado.clipsLol.size + estado.clips.size > 0, obsAbierto: estado.obsAbierto,
        luces: {
          obs: Boolean(obs.listo), emitiendo: Boolean(emision.salidas?.emitiendo), bufer: emision.salidas ? Boolean(emision.salidas.bufer) : null,
          grabador: grabador ? Boolean(grabador.activo) : null, lol: Boolean(estado.playback), pc1: pc1Conectado(),
        },
      } : null,
    };
  }

  function recibirGuion(d) {
    estado.ultimoContacto = Date.now();
    if (d.tFin === null || Number.isFinite(d.tFin)) {
      // Hora a la que el PC 1 vio el final (la primera vez que lo dice); sin final, se olvida
      if (Number.isFinite(d.tFin) && !Number.isFinite(estado.tFin)) {
        estado.finHora = Date.now();
        registrar(`[relé] el PC 1 ha visto el final (segundo ${Math.round(d.tFin)}): la antena llegará en unos ${o.margenSegundos} s`);
      }
      if (d.tFin === null) estado.finHora = null;
      estado.tFin = d.tFin;
    }
    // Partida nueva en el PC 1 (otro id, o su reloj vuelve atrás): se olvida la anterior. Si no, durante el margen la
    // antena seguiría con el final de la otra partida (15/11: así salió al aire un momento viejo)
    // Solo si su reloj vuelve atrás de verdad: el PC 1 puede volver a «encontrar» la misma partida con otro id al acabar
    // (mismo reloj), y entonces no hay que olvidar nada (la antena tiene que llegar al final)
    const idNuevo = Boolean(d.partida && estado.partidaPc1 && d.partida !== estado.partidaPc1);
    if (d.partida) estado.partidaPc1 = d.partida;
    const atras = Number.isFinite(d.tDirecto) && estado.historial.length ? estado.historial.at(-1).t - d.tDirecto : 0;
    if (atras > 30 || (idNuevo && atras > 5)) {
      estado.historial = []; estado.metida = null;
      registrar(`[antena] ${idNuevo ? 'partida nueva' : 'el reloj ha vuelto atrás'} en el PC 1: se olvida la anterior`);
    }
    if (Number.isFinite(d.tDirecto)) {
      estado.directo = { t: d.tDirecto, hora: Date.now() };
      estado.historial.push({ ...estado.directo });
      // Solo hace falta lo que cabe en el margen (y un poco más)
      const corte = Date.now() - (o.margenSegundos + 60) * 1000;
      while (estado.historial.length > 2 && estado.historial[1].hora < corte) estado.historial.shift();
    }
    if (typeof d.enPartida === 'boolean') estado.pc1EnPartida = d.enPartida;
    if (Array.isArray(d.planos)) estado.planos = d.planos.filter(p => Number.isFinite(p.inicio)).sort((a, b) => a.inicio - b.inicio);
    // Con el id de la partida delante: las jugadas se llaman igual en cada partida (j1, j2…) y si no, en la segunda
    // partida de una serie se saltarían sus clips y repeticiones como «ya hechas»
    if (Array.isArray(d.obs)) estado.accionesObs = d.obs.filter(a => a && a.id && Number.isFinite(a.t)).map(a => (d.partida ? { ...a, id: `${d.partida}/${a.id}` } : a));
    if (Array.isArray(d.recorridos)) estado.accionesRecorrido = d.recorridos.filter(a => a && a.id && Number.isFinite(a.t)).map(a => (d.partida ? { ...a, id: `${d.partida}/${a.id}` } : a));
    if (Array.isArray(d.vision)) estado.accionesVision = d.vision.filter(a => a && a.id && Number.isFinite(a.t)).map(a => (d.partida ? { ...a, id: `${d.partida}/${a.id}` } : a));
    if (Array.isArray(d.resumen)) resumen.recibirLista(d.resumen);
    if (typeof d.manual === 'boolean') {
      if (estado.manual && !d.manual) { estado.ordenManual = null; registrar('[relé] el realizador vuelve a mandar'); }
      estado.manual = d.manual;
    }
  }

  function recibirOrden(d) {
    estado.ultimoContacto = Date.now();
    estado.manual = true;
    estado.ordenManual = d.tipo === 'seguir' && d.objetivo ? { tipo: 'seguir', objetivo: d.objetivo } : { tipo: 'general', objetivo: null };
    estado.aplicado = null;
  }

  const huella = o.clave ? ficha(o.clave) : null;
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Con contraseña, solo obedece a quien la tiene (el agente del PC 1)
    if (huella && !igual(req.headers[CABECERA] || '', huella)) return responder(res, { ok: false, error: 'Contraseña distinta' }, 401);
    try {
      if (req.method === 'GET' && url.pathname === '/estado') return responder(res, estadoPublico());
      if (req.method === 'POST' && url.pathname === '/guion') {
        recibirGuion(await leerCuerpo(req, 5e6));
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/orden') {
        recibirOrden(await leerCuerpo(req));
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/emision') {
        await emision.orden(await leerCuerpo(req));
        return responder(res, { ok: true, emision: emision.publico() });
      }
      if (req.method === 'POST' && url.pathname === '/resumen') {
        await resumen.orden(await leerCuerpo(req));
        return responder(res, { ok: true, resumen: resumen.publico() });
      }
      if (req.method === 'POST' && url.pathname === '/fase') {
        await ordenFase(await leerCuerpo(req));
        return responder(res, { ok: true, fase: fases.publico() });
      }
      responder(res, { ok: false, error: 'No existe' }, 404);
    } catch (e) {
      responder(res, { ok: false, error: e.message }, 500);
    }
  });

  let temporizador = null;
  let anuncio = null;
  // Puente por internet: la sala del realizador en el servidor de Gokudō
  let sala = null;
  let latido = null;
  if (otraSala || (o.clave && o.puente?.modo === 'tenka')) {
    sala = otraSala || new Sala({ url: o.puente.url, clave: o.clave, papel: 'pc2' });
    sala.on('conexion', v => registrar(v ? '[puente] conectado al servidor de Gokudō' : '[puente] sin conexión con el servidor, reintentando...'));
    sala.on('companero', v => registrar(v ? '[puente] el PC 1 está conectado' : '[puente] el PC 1 se ha ido'));
    sala.on('aviso', t => registrar(`[puente] ${t}`));
    sala.on('mensaje', d => {
      if (d.tipo === 'guion') recibirGuion(d);
      else if (d.tipo === 'orden') recibirOrden(d.orden || {});
      // Un PC 1 anterior mandaba la orden suelta (su tipo pisaba el del mensaje): también vale
      else if (d.tipo === 'seguir' || d.tipo === 'general') recibirOrden(d);
      else if (d.tipo === 'emision') emision.orden(d).catch(e => registrar(`[emisión] ${e.message}`));
      else if (d.tipo === 'resumen') resumen.orden(d).catch(e => registrar(`[resumen] ${e.message}`));
      else if (d.tipo === 'fase') ordenFase(d).catch(e => registrar(`[fases] ${e.message}`));
    });
  }
  // La sala la decide el PC 1 y la apunta en la web de Gokudō: aquí se recoge con la contraseña del panel y se entra en
  // ella. Así los dos se encuentran aunque al instalar se escribiera la contraseña distinta en cada uno (11/11).
  // Se pregunta siempre (cada 10 s mientras no está el PC 1; cada minuto con él), por si el PC 1 cambia o la web se
  // reinicia. Si la web dice que la contraseña de este PC no vale, se dice en el panel.
  estado.claveMal = false;
  let ultimaPeticionSala = 0;
  async function recogerSala() {
    if (!sala || !tenka?.listo || typeof tenka.accion !== 'function') return;
    const cada = sala.companero ? 60000 : 10000;
    if (Date.now() - ultimaPeticionSala < cada) return;
    ultimaPeticionSala = Date.now();
    try {
      const r = await tenka.accion('salaRealizador', {});
      if (estado.claveMal) registrar('[puente] la contraseña del panel ya vale');
      estado.claveMal = false;
      if (r?.sala && sala.cambiarSala(r.sala)) registrar('[puente] sala del PC 1 recogida de la web: entrando en ella');
    } catch (e) {
      if (/contraseña/i.test(e.message)) {
        if (!estado.claveMal) registrar('[puente] la contraseña de este PC no es la del panel de Gokudō: vuelve a pasar INSTALAR-PC2.bat con la del panel');
        estado.claveMal = true;
      }
    }
  }
  const vuelta = async () => {
    recogerSala().catch(() => {});
    try { await paso(); } catch (e) { registrar(`[relé] ${e.message}`); }
    temporizador = setTimeout(vuelta, r.cadaMs);
  };

  // La app: versión, botón «Actualizar» (nunca emitiendo ni con la antena en marcha) y cerrar desde el panel
  let rele = null;
  const cerrar = salir || (() => { rele?.parar(); setTimeout(() => process.exit(0), 500); });
  const app = new Actualizador({
    papel: 'pc2', o, registrar, salir: cerrar,
    ocupado: () => (emision.salidaActiva ? 'Se está emitiendo: actualiza cuando acabe el directo'
      : estado.playback && !estado.playback.paused ? 'La antena tiene una partida en marcha: actualiza cuando acabe' : null),
  });
  app.on('cambio', () => panel?.emitir());

  // Cada cambio de la emisión sale enseguida hacia el PC 1 (y su página), sin esperar al latido
  emision.on('cambio', () => { sala?.enviar({ tipo: 'estado', ...estadoPublico() }); panel?.emitir(); });
  resumen.on('cambio', () => { sala?.enviar({ tipo: 'estado', ...estadoPublico() }); panel?.emitir(); });
  fases.on('cambio', () => { sala?.enviar({ tipo: 'estado', ...estadoPublico() }); panel?.emitir(); });
  let panel = null;

  rele = {
    app,
    estado,
    emision,
    resumen,
    traileres,  // los tráilers del inicio (pc2/traileres.js)
    fases,      // fases del directo: rele.fases.actual, rele.fases.on('cambio' | 'partida', f => …)
    camaras,
    elegirCamaras,
    foto,
    arrancar(puerto = r.puerto) {
      if (conPanel) {
        panel = arrancarPanel({
          puerto: o.panelPc2?.puerto ?? 4601, host: '127.0.0.1', foto,
          emision: d => emision.orden(d),
          resumen: d => resumen.orden(d),
          fase: d => ordenFase(d),
          camaras: async d => {
            if (d?.leer) { await camaras?.leerDisponibles(); return; }
            elegirCamaras(d?.elegidos);
          },
          app: async ({ accion }) => {
            if (accion === 'comprobar') return { nueva: await app.comprobar() };
            if (accion === 'actualizar') return app.actualizar();
            if (accion === 'volver') return app.volver();
            if (accion === 'cerrar') {
              if (emision.salidaActiva) throw new Error('Se está emitiendo: para la emisión antes de cerrar el realizador');
              registrar('[app] cerrado desde el panel');
              // Su OBS se cierra con él y el del dueño vuelve a ser el de arranque (16/11)
              if (o.obs?.devolverAlDueno !== false && obs && typeof conObs !== 'object' && process.platform === 'win32') {
                try { const r = await desconfigurarObs({ carpeta: o.obs?.carpeta || carpetaObs() }); for (const h of r.hechos) registrar(`[obs] ${h}`); } catch { /* sigue cerrando */ }
              }
              setTimeout(cerrar, 300);
              return {};
            }
            throw new Error('No sé hacer eso');
          },
          escena: d => ponerEscena(d),
          repetir: () => repetirUltima(),
          obs: () => botonObs(),
          captura: () => capturaObs(),
          capturaJuego: () => capturaJuego(),
          desconfigurarObs: () => desconfigurarObsRele(),
        });
      }
      servidor.listen(puerto, '0.0.0.0');
      if (o.clave && r.anunciarse !== false && !sala) anuncio = anunciar({ clave: o.clave, puerto });
      if (sala) {
        sala.conectar();
        latido = setInterval(() => sala.enviar({ tipo: 'estado', ...estadoPublico() }), 1000);
      }
      vuelta();
      // Los tráilers del inicio: se miran la carpeta y las duraciones ya (y otra vez al entrar en la espera o la intro)
      if (obs) traileres.preparar().catch(e => registrar(`[tráilers] ${e.message}`));
      if (cb.activo) bucleBordes();
      grabador?.arrancar();
      if (obs && typeof conObs !== 'object') { vigiaObs = setInterval(() => vigilarObs().catch(() => {}), 15000); setTimeout(() => vigilarObs().catch(() => {}), 8000); }
      return servidor;
    },
    parar() {
      clearTimeout(temporizador); parado = true; resumen.detener(); traileres.detener(); clearTimeout(temporizadorBordes); clearInterval(latido); anuncio?.parar(); sala?.cerrar();
      if (otroTenka === undefined) tenka?.cerrar();
      if (typeof conObs !== 'object') obs?.cerrar();
      if (otroGrabador === undefined) grabador?.parar();
      casteo?.parar().catch(() => {});
      app.parar();
      clearInterval(vigiaObs);
      servidor.close();
      if (panel) { panel.parar(); panel = null; }
    },
  };
  return rele;
}

// Arrancado directamente (npm run rele)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = cargarOpciones();
  // Todo lo que pasa en el PC 2 también queda en un archivo (partidas/pc2-AAAA-MM-DD.log) para revisarlo luego
  const carpetaLog = join(o.registro?.raiz || RAIZ, o.registro?.carpeta || 'partidas');
  const archivoLog = join(carpetaLog, `pc2-${new Date().toISOString().slice(0, 10)}.log`);
  try { mkdirSync(carpetaLog, { recursive: true }); } catch { /* sin carpeta: solo en pantalla */ }
  const registrarArchivo = t => {
    console.log(t);
    try { appendFileSync(archivoLog, `${new Date().toTimeString().slice(0, 8)} ${t}\n`); } catch { /* sigue sin archivo */ }
  };
  const rele = crearRele(o, { panel: true, registrar: registrarArchivo });
  rele.arrancar();
  rele.app.arrancar();
  console.log(`Registro del PC 2 en ${archivoLog}`);
  console.log(`Página del PC 2: http://localhost:${o.panelPc2?.puerto ?? 4601}/`);
  console.log(`Relé en marcha en el puerto ${o.rele.puerto}. Replay API: ${o.rele.replayApi}. Margen: ${o.margenSegundos} s`);
  console.log(o.clave && o.puente?.modo === 'tenka'
    ? `Puente por el servidor de Gokudō (${o.puente.url}) con la contraseña.`
    : o.clave
    ? 'Puente con contraseña: anunciándose en la red para que el PC 1 lo encuentre solo.'
    : 'Sin contraseña (opciones.local.json → "clave"): el PC 1 tiene que poner a mano la IP de este PC.');
  console.log('Espectea la partida en este PC: cuando empiece, la antena se pondrá sola 2 minutos por detrás.');
}
