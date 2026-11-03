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

// obs: false para no tocar OBS desde el relé (modo de un solo PC, donde lo lleva el agente). En las pruebas,
// obs y sala pueden ser objetos de mentira.
export function crearRele(o, { registrar: registrarFuera = console.log, obs: conObs = true, sala: otraSala = null, panel: conPanel = false } = {}) {
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
    clips: new Map(),       // jugada → { ruta, t }
    meta: null,             // segundo al que va (o irá) la antena; negativo mientras espera el margen
    tFin: null,             // segundo en que acabó la partida (lo dice el PC 1)
  };

  // OBS de este mismo PC: guarda el búfer y lanza las repeticiones cuando la antena llega a su segundo
  const obs = typeof conObs === 'object' ? conObs : conObs && o.obs?.activo && o.obs?.enRele
    ? new Obs({ url: `ws://127.0.0.1:${new URL(o.obs.url.replace(/auto/i, '127.0.0.1')).port || 4455}`, clave: o.obs.clave || o.clave || '' })
    : null;
  if (typeof conObs !== 'object') obs?.on('conexion', v => registrar(v ? '[obs] conectado' : '[obs] sin conexión (¿está abierto?)'));
  if (typeof conObs !== 'object') obs?.conectar();

  // El botón de «Empezar directo»: arranca OBS justo para que la partida salga desde el principio
  const emision = new Emision({
    opciones: o.emision, obs, registrar,
    escenas: { juego: o.obs?.escenaJuego, previa: o.obs?.escenaPausa, final: o.obs?.escenaCasters },
  });

  async function hacerObs(tA) {
    if (!obs) return;
    for (const a of estado.accionesObs) {
      if (estado.hechasObs.has(a.id) || a.t > tA) continue;
      estado.hechasObs.add(a.id);
      if (tA - a.t > 10) { registrar(`[obs] ${a.tipo} ${a.jugada}: llega tarde, se salta`); continue; }
      if (!obs.listo) { registrar(`[obs] ${a.tipo} ${a.jugada}: OBS no está conectado`); continue; }
      try {
        if (a.tipo === 'guardar') {
          const ruta = await obs.guardarRepeticion();
          estado.clips.set(a.jugada, { ruta, t: tA });
          registrar(`[obs] clip de ${a.jugada} guardado`);
        } else if (a.tipo === 'repeticion') {
          if (estado.manual) { registrar(`[obs] repetición de ${a.jugada}: control manual, se salta`); continue; }
          const clip = estado.clips.get(a.jugada);
          if (!clip?.ruta) { registrar(`[obs] repetición de ${a.jugada}: no hay clip`); continue; }
          await obs.lanzarRepeticion({ ruta: clip.ruta, fuente: o.obs.fuenteRepeticion, escena: o.obs.escenaRepeticion, segundosAtras: segundosAtras(a, clip) });
          registrar(`[obs] repetición de ${a.jugada}`);
          setTimeout(() => obs.escena(o.obs.escenaJuego).catch(() => {}), a.segundos * 1000).unref?.();
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
  const zoomDe = p => (!p || p.tipo === 'general' || !p.objetivo ? 'general' : (p.zoom === 'cerca' ? 'cerca' : 'abierto'));

  function camara(p, z) {
    const lente = { fieldOfView: z.fov };
    if (!p || p.tipo === 'general' || !p.objetivo) return { cameraAttached: false, cameraMode: 'top', ...lente };
    const nombre = r.seleccionarPor === 'campeon' ? p.objetivo.campeon : (p.objetivo.jugador || p.objetivo.campeon);
    const d = r.desplazamientoCamara;
    return {
      cameraMode: 'fps', cameraAttached: true, selectionName: nombre,
      selectionOffset: { x: d.x * z.distancia, y: d.y * z.distancia, z: d.z * z.distancia }, ...lente,
    };
  }

  const clave = p => (p ? `${p.tipo}:${p.objetivo?.campeon || ''}:${p.objetivo?.jugador || ''}` : 'general');
  const suave = x => x * x * (3 - 2 * x);  // smoothstep: arranca y frena despacio
  let animacion = 0;                       // cada transición nueva cancela la anterior
  estado.zoom = { ...nivel('general') };   // zoom aplicado ahora mismo

  async function transicion(p, destino) {
    const yo = ++animacion;
    const desde = { ...estado.zoom };
    if (desde.fov === destino.fov && desde.distancia === destino.distancia) return;
    const pasos = Math.max(1, Math.round((r.zoom?.transicionSegundos ?? 1.2) * (r.zoom?.pasosPorSegundo ?? 25)));
    for (let i = 1; i <= pasos; i++) {
      if (yo !== animacion) return;
      const k = suave(i / pasos);
      estado.zoom = { fov: desde.fov + (destino.fov - desde.fov) * k, distancia: desde.distancia + (destino.distancia - desde.distancia) * k };
      try { await render(camara(p, estado.zoom)); } catch { return; }
      if (i < pasos) await new Promise(f => setTimeout(f, 1000 / (r.zoom?.pasosPorSegundo ?? 25)));
    }
  }

  async function aplicar(p, motivo) {
    const k = clave(p);
    const z = zoomDe(p);
    if (estado.aplicado === k && estado.zoomAplicado === z) return;
    const destino = nivel(z);
    if (estado.aplicado !== k) {
      animacion++;  // un corte para cualquier transición a medias
      await render(camara(p, estado.zoom));
    }
    estado.aplicado = k;
    estado.zoomAplicado = z;
    transicion(p, destino);  // sin esperar: el relé sigue con la antena mientras se mueve el zoom
    registrar(`[cámara] ${motivo}: ${p?.tipo === 'seguir' ? `sigue a ${p.objetivo.campeon}` : 'plano general'} (zoom ${z})`);
  }

  // Segundo de partida al que debería ir la antena
  function objetivoAntena(pb) {
    if (estado.directo && Date.now() - estado.directo.hora < 10000) {
      return estado.directo.t + (Date.now() - estado.directo.hora) / 1000 - o.margenSegundos;
    }
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
  const partidaPc1 = () => Boolean(estado.directo && Date.now() - estado.directo.hora < 10000);
  function condicionesAhora() {
    return condiciones({
      papel: 'pc2', pc1: pc1Conectado(), pc2: true, partidaPc1: partidaPc1(), partidaPc2: Boolean(estado.playback),
      obs: obs ? Boolean(obs.listo) : null, bufer: emision.salidas ? emision.salidas.bufer : null,
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
      });
    } catch (e) { registrar(`[emisión] ${e.message}`); }
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
      conexiones: { ...(sala ? { puente: sala.unido } : {}), pc1: pc1Conectado(), obs: obs ? Boolean(obs.listo) : null },
      condiciones: c.lista, listo: c.listo,
      emision: emision.publico(), faltan: faltan(),
      tDirecto: tD, tAntena: tA, margenReal: tA !== null && tD !== null ? tD - tA : null, margen: o.margenSegundos,
      modoRele: estado.modo, manual: estado.manual,
      registro: registro.slice(0, 40).map(l => ({ hora: l.hora, quien: 'PC 2', que: l.texto })),
    };
  }

  function recibirGuion(d) {
    estado.ultimoContacto = Date.now();
    if (d.tFin === null || Number.isFinite(d.tFin)) estado.tFin = d.tFin;
    if (Number.isFinite(d.tDirecto)) estado.directo = { t: d.tDirecto, hora: Date.now() };
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
  // Puente por internet: la sala del realizador en el servidor de TENKA ICHI
  let sala = null;
  let latido = null;
  if (otraSala || (o.clave && o.puente?.modo === 'tenka')) {
    sala = otraSala || new Sala({ url: o.puente.url, clave: o.clave, papel: 'pc2' });
    sala.on('conexion', v => registrar(v ? '[puente] conectado al servidor de TENKA ICHI' : '[puente] sin conexión con el servidor, reintentando...'));
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

  // Cada cambio de la emisión sale enseguida hacia el PC 1 (y su página), sin esperar al latido
  emision.on('cambio', () => { sala?.enviar({ tipo: 'estado', ...estadoPublico() }); panel?.emitir(); });
  let panel = null;

  return {
    estado,
    emision,
    foto,
    arrancar(puerto = r.puerto) {
      if (conPanel) {
        panel = arrancarPanel({
          puerto: o.panelPc2?.puerto ?? 4601, host: '127.0.0.1', foto,
          emision: d => emision.orden(d),
        });
      }
      servidor.listen(puerto, '0.0.0.0');
      if (o.clave && r.anunciarse !== false && !sala) anuncio = anunciar({ clave: o.clave, puerto });
      if (sala) {
        sala.conectar();
        latido = setInterval(() => sala.enviar({ tipo: 'estado', ...estadoPublico() }), 1000);
      }
      vuelta();
      return servidor;
    },
    parar() {
      clearTimeout(temporizador); clearInterval(latido); anuncio?.parar(); sala?.cerrar();
      if (typeof conObs !== 'object') obs?.cerrar();
      servidor.close();
      if (panel) { panel.parar(); panel = null; }
    },
  };
}

// Arrancado directamente (npm run rele)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = cargarOpciones();
  const rele = crearRele(o, { panel: true });
  rele.arrancar();
  console.log(`Página del PC 2: http://localhost:${o.panelPc2?.puerto ?? 4601}/`);
  console.log(`Relé en marcha en el puerto ${o.rele.puerto}. Replay API: ${o.rele.replayApi}. Margen: ${o.margenSegundos} s`);
  console.log(o.clave && o.puente?.modo === 'tenka'
    ? `Puente por el servidor de TENKA ICHI (${o.puente.url}) con la contraseña.`
    : o.clave
    ? 'Puente con contraseña: anunciándose en la red para que el PC 1 lo encuentre solo.'
    : 'Sin contraseña (opciones.local.json → "clave"): el PC 1 tiene que poner a mano la IP de este PC.');
  console.log('Espectea la partida en este PC: cuando empiece, la antena se pondrá sola 2 minutos por detrás.');
}
