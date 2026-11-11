// Relé del PC 2: no decide nada, solo recibe órdenes del agente del PC 1 y se las pasa al cliente de LoL
// que se emite (la antena), porque la Replay API solo escucha dentro del propio PC.
//  - Mantiene la antena unos 120 s por detrás del directo (pausa al empezar, corrige si se desvía).
//  - Recibe el guion por adelantado y mueve la cámara en local al llegar cada plano: un corte de red no se nota.
//  - Si deja de oír al PC 1, pasa a modo degradado: suelta la cámara y no hace nada más hasta que vuelva.
// Arranque: npm run rele
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { cargarOpciones } from '../comun/opciones.js';
import { pedirJSON, leerCuerpo, responder } from '../comun/http.js';
import { anunciar, ficha, igual, CABECERA } from '../comun/puente.js';
import { Sala } from '../comun/sala.js';
import { Obs, segundosAtras } from '../pc1/obs.js';
import { Emision } from './emision.js';
import { condiciones } from '../comun/condiciones.js';
import { arrancarPanel } from '../pc1/panel.js';
import { POR_DEFECTO as BORDES, ajusteBorde, suavizar, zoomConBorde, posicionSeguido } from './bordes.js';
import { Tenka } from '../pc1/tenka.js';
import { CamarasDraft } from './camaras.js';
import { GrabadorLol, cursorEnClip } from './grabador.js';
import { Actualizador } from '../comun/app.js';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
export function crearRele(o, { registrar: registrarFuera = console.log, obs: conObs = true, grabador: otroGrabador = undefined, salir = null, sala: otraSala = null, panel: conPanel = false, tenka: otroTenka = undefined, rutaLocal = join(RAIZ, 'opciones.local.json') } = {}) {
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
      if (d?.eventType === 'CurrentProgramSceneChanged') { estado.escenaObs = d.eventData?.sceneName || null; panel?.emitir(); }
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
  const escenasMano = () => [o.obs?.escenaJuego, o.obs?.escenaCasters, o.obs?.escenaPausa, o.obs?.escenaDraft || 'Draft'].filter(Boolean);
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
  const emision = new Emision({
    opciones: o.emision, obs, registrar,
    escenas: { juego: o.obs?.escenaJuego, previa: o.obs?.escenaPausa, final: o.obs?.escenaCasters, draft: o.obs?.escenaDraft || 'Draft' },
  });

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
      estado.errores = 0;
    } catch (e) {
      if (++estado.errores === 3) registrar(`[antena] sin respuesta de la Replay API: ${e.message}`);
      estado.playback = null;
      estado.modo = 'sin-juego';
      estado.meta = null;
      await pasoEmision();
      return;
    }

    // 1. Retraso de la antena (en una partida grabada el reloj lo lleva quien la ve: el relé solo mueve la cámara)
    const ahora = Date.now();
    const meta = r.controlarReloj === false ? null : objetivoAntena(pb);
    estado.meta = meta;
    if (meta === null) {
      // nada
    } else if (meta < 0) {
      if (!pb.paused) { await playback({ paused: true }); registrar('[antena] en pausa hasta tener el margen'); }
      estado.ultimoSeguido = null;  // partida nueva: el último seguido era de la anterior
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
    if (estado.manual) {
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

    // 3. OBS (repeticiones)
    hacerObs(pb.time).catch(e => registrar(`[obs] ${e.message}`));

    // 4. Emisión (el botón de empezar el directo)
    await pasoEmision();
  }

  // ---------- emisión con un botón ----------
  const pc1Conectado = () => (sala ? sala.companero : Date.now() - estado.ultimoContacto < 10000);
  const partidaPc1 = () => Boolean(estado.directo && Date.now() - estado.directo.hora < 10000 && estado.pc1EnPartida !== false);
  function condicionesAhora() {
    return condiciones({
      papel: 'pc2', pc1: pc1Conectado(), pc2: true, partidaPc1: partidaPc1(), partidaPc2: Boolean(estado.playback),
      obs: obs ? Boolean(obs.listo) : null, obsProblema: obs?.problema || null, bufer: emision.salidas ? emision.salidas.bufer : null,
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
    camaras?.paso().catch(() => {});
  }
  // Segundos que faltan para que la partida salga en antena (desde el principio)
  const faltan = () => (Number.isFinite(estado.meta) && estado.meta < 0 ? -estado.meta : null);

  function estadoPublico() {
    const pb = estado.playback;
    const tAntena = pb ? (pb.paused ? pb.time : pb.time + (Date.now() - pb.hora) / 1000) : null;
    return {
      tAntena, pausado: pb?.paused ?? null, length: pb?.length ?? null, modo: estado.modo,
      plano: estado.aplicado, zoom: estado.zoomAplicado || null, planos: estado.planos.length,
      obs: obs ? obs.listo : null,
      juego: Boolean(pb), faltan: faltan(), emision: emision.publico(),
      bufer: emision.salidas ? emision.salidas.bufer : null,
    };
  }

  // Página del PC 2 (la misma interfaz que el PC 1, con lo que se sabe aquí)
  function foto() {
    const c = condicionesAhora();
    const tA = tAntenaAhora();
    const tD = partidaPc1() ? estado.directo.t + (Date.now() - estado.directo.hora) / 1000 : null;
    return {
      papel: 'pc2',
      conexiones: { ...(sala ? { puente: sala.unido } : {}), pc1: pc1Conectado(), obs: obs ? Boolean(obs.listo) : null, tenka: tenka ? Boolean(tenka.listo) : null },
      camaras: camaras ? camaras.publico() : null,
      draft: draftDeTenka(tenka?.estado),
      condiciones: c.lista, listo: c.listo,
      emision: emision.publico(), faltan: faltan(),
      tDirecto: tD, tAntena: tA, margenReal: tA !== null && tD !== null ? tD - tA : null, margen: o.margenSegundos,
      modoRele: estado.modo, manual: estado.manual,
      registro: registro.slice(0, 40).map(l => ({ hora: l.hora, quien: 'PC 2', que: l.texto })),
      app: app.publico(),
      grabador: grabador ? { activo: grabador.activo, forma: grabador.forma?.nombre || null } : null,
      vista: obs ? {
        escena: estado.escenaObs, escenas: escenasMano(), camaraVirtual: estado.camaraVirtual, modo: o.obs?.vista ?? 'camara',
        hayJugada: estado.clipsLol.size + estado.clips.size > 0,
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
    if (Number.isFinite(d.tDirecto)) {
      estado.directo = { t: d.tDirecto, hora: Date.now() };
      estado.historial.push({ ...estado.directo });
      // Solo hace falta lo que cabe en el margen (y un poco más)
      const corte = Date.now() - (o.margenSegundos + 60) * 1000;
      while (estado.historial.length > 2 && estado.historial[1].hora < corte) estado.historial.shift();
    }
    if (typeof d.enPartida === 'boolean') estado.pc1EnPartida = d.enPartida;
    if (Array.isArray(d.planos)) estado.planos = d.planos.filter(p => Number.isFinite(p.inicio)).sort((a, b) => a.inicio - b.inicio);
    if (Array.isArray(d.obs)) estado.accionesObs = d.obs.filter(a => a && a.id && Number.isFinite(a.t));
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
    });
  }
  const vuelta = async () => {
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
  let panel = null;

  rele = {
    app,
    estado,
    emision,
    camaras,
    elegirCamaras,
    foto,
    arrancar(puerto = r.puerto) {
      if (conPanel) {
        panel = arrancarPanel({
          puerto: o.panelPc2?.puerto ?? 4601, host: '127.0.0.1', foto,
          emision: d => emision.orden(d),
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
              setTimeout(cerrar, 300);
              return {};
            }
            throw new Error('No sé hacer eso');
          },
          escena: d => ponerEscena(d),
          repetir: () => repetirUltima(),
          captura: () => capturaObs(),
        });
      }
      servidor.listen(puerto, '0.0.0.0');
      if (o.clave && r.anunciarse !== false && !sala) anuncio = anunciar({ clave: o.clave, puerto });
      if (sala) {
        sala.conectar();
        latido = setInterval(() => sala.enviar({ tipo: 'estado', ...estadoPublico() }), 1000);
      }
      vuelta();
      if (cb.activo) bucleBordes();
      grabador?.arrancar();
      return servidor;
    },
    parar() {
      clearTimeout(temporizador); parado = true; clearTimeout(temporizadorBordes); clearInterval(latido); anuncio?.parar(); sala?.cerrar();
      if (otroTenka === undefined) tenka?.cerrar();
      if (typeof conObs !== 'object') obs?.cerrar();
      if (otroGrabador === undefined) grabador?.parar();
      app.parar();
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
