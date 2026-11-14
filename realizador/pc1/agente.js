// Agente del PC 1: explorador + cerebro + ejecutor + panel de supervisión.
// Arranque: npm run agente   (npm run agente -- --perfil-minimo pone el perfil ligero del juego y lo quita al cerrar)
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cargarOpciones, RAIZ } from '../comun/opciones.js';
import { Buzon } from '../comun/buzon.js';
import { Explorador } from './explorador.js';
import { Cerebro } from './cerebro.js';
import { Ejecutor } from './ejecutor.js';
import { Obs } from './obs.js';
import { Tenka } from './tenka.js';
import { construirAdelanto } from './adelanto.js';
import { arrancarPanel } from './panel.js';
import { buscar } from '../comun/puente.js';
import { Sala } from '../comun/sala.js';
import { aplicarPerfil, restaurarPerfil, rutaConfig } from '../instalar/configurar-lol.js';
import { condiciones } from '../comun/condiciones.js';
import { Ia } from './ia.js';
import { Actualizador, registroEnArchivo } from '../comun/app.js';
import { LectorPantalla, leerFotograma, SeguidorMarcador, SeguidorHechizos } from './pantalla.js';
import { carpetaFfmpeg } from '../instalar/ffmpeg.js';

// «explorador» permite cambiar de dónde salen los sucesos (el modo grabada pone el suyo)
// «ia»: para las pruebas (un Ia con cliente de mentira). Sin él, se crea si ia.activo está encendido.
export function arrancarAgente(o, { perfilMinimo = false, log = console.log, explorador: otroExplorador = null, sala: otraSala = null, ia: otraIa = null, salir = null } = {}) {
  // Perfil mínimo del juego (ventana pequeña, gráficos al mínimo, sin sonido) mientras corre el agente
  let perfilAplicado = null;
  if (perfilMinimo) {
    try {
      const ruta = rutaConfig(o.rutaLoL);
      aplicarPerfil(ruta, o.perfilMinimo);
      perfilAplicado = ruta;
      log(`Perfil mínimo aplicado en ${ruta}`);
    } catch (e) { log(`No se pudo aplicar el perfil mínimo: ${e.message}`); }
  }

  let panel = null;
  // LiveEvents ya no sale en el panel (Riot la quitó en el parche 14.1): en su lugar, la luz del lector de pantalla
  const conexiones = { explorador: false, pantalla: null, rele: false, obs: null, tenka: null };
  const avisos = [];
  const registro = [];
  const avisar = texto => {
    avisos.unshift({ hora: new Date().toISOString(), texto });
    avisos.length = Math.min(avisos.length, 30);
    log(`[aviso] ${texto}`);
    panel?.emitir();
  };

  // La app: versión, botón «Actualizar» (no mientras se emite o hay partida) y cerrar el realizador desde el panel
  let agente = null;
  const cerrar = salir || (() => { agente?.parar(); setTimeout(() => process.exit(0), 300); });
  const app = new Actualizador({
    papel: 'pc1', o, registrar: log, salir: cerrar,
    ocupado: () => (ejecutor?.releConectado && ejecutor.antena?.emision?.enElAire ? 'El PC 2 está emitiendo: actualiza cuando acabe el directo'
      : conexiones.explorador && partida ? 'Hay una partida en marcha en este PC: actualiza cuando acabe' : null),
  });
  app.on('cambio', () => panel?.emitir());

  const explorador = otroExplorador || new Explorador(o);
  let cerebro = new Cerebro(o.reglas);
  let partida = null;

  // OBS va en el PC 2. Con url "auto" se conecta cuando el puente dice dónde está el PC 2;
  // la contraseña del WebSocket es la del puente salvo que se ponga otra en obs.clave.
  let obs = null;
  const conectarObs = url => {
    obs?.cerrar();
    obs = new Obs({ url, clave: o.obs.clave || o.clave || '' });
    conexiones.obs = false;
    obs.on('conexion', v => { conexiones.obs = v; panel?.emitir(); });
    obs.conectar();
    if (ejecutor) ejecutor.obs = obs;
  };
  const obsAuto = o.obs.activo && /auto/i.test(o.obs.url);
  const tenka = o.tenkaIchi.activo ? new Tenka({ url: o.tenkaIchi.url, clave: o.tenkaIchi.clave }) : null;
  if (tenka) { conexiones.tenka = false; tenka.on('conexion', v => { conexiones.tenka = v; panel?.emitir(); }); tenka.conectar(); }

  let ejecutor = null;
  if (o.obs.activo && !obsAuto) conectarObs(o.obs.url);
  else if (obsAuto) conexiones.obs = false;
  // Puente por internet (PCs en redes distintas): sala del realizador en el servidor de Gokudō
  let sala = null;
  if (otraSala || (o.clave && o.puente?.modo === 'tenka')) {
    sala = otraSala || new Sala({ url: o.puente.url, clave: o.clave, papel: 'pc1' });
    conexiones.puente = false;
    sala.on('conexion', v => { conexiones.puente = v; log(v ? 'Conectado al servidor de Gokudō' : 'Sin conexión con el servidor de Gokudō, reintentando...'); panel?.emitir(); });
    sala.on('companero', v => { log(v ? 'El PC 2 está conectado' : 'El PC 2 no está conectado'); panel?.emitir(); });
    sala.on('aviso', t => avisar(`Puente: ${t}`));
    sala.conectar();
  }
  // La sala la decide este PC y la apunta en la web de Gokudō (con la contraseña del panel): el PC 2 la recoge de
  // ahí, así se encuentran aunque al instalar se escribiera la contraseña distinta en cada uno (11/11)
  let salaApuntada = false;
  let claveMal = false;
  const apuntarSala = () => {
    if (!sala || !tenka?.listo) return;
    tenka.accion('salaRealizador', { sala: sala.sala }).then(() => {
      if (!salaApuntada) log('Sala del realizador apuntada en la web: el PC 2 la recoge de ahí');
      salaApuntada = true;
      claveMal = false;
    }).catch(e => {
      if (/contraseña/i.test(e.message) && !claveMal) { claveMal = true; avisar('La contraseña de este PC no es la del panel de Gokudō: vuelve a pasar INSTALAR-PC1.bat con la del panel'); }
    });
  };
  tenka?.on('conexion', v => { if (v) setTimeout(apuntarSala, 500); });
  const temporizadorSala = setInterval(apuntarSala, 30000);
  temporizadorSala.unref?.();
  ejecutor = new Ejecutor({ opciones: o, cerebro, explorador, obs, tenka, sala });

  // Modo IA (opcional): consejos para el overlay, elección de repetición y resumen final. Si falla, reglas.
  const ia = otraIa || new Ia({ opciones: o, log });
  conexiones.ia = o.ia?.activo || otraIa ? false : null;
  ia.preparar().then(ok => {
    conexiones.ia = conexiones.ia === null ? null : ok;
    if (ok) log(`IA encendida (${ia.nombreModelo}): elige el overlay en los ratos tranquilos, la repetición si coinciden varias y escribe el resumen final`);
    else if (o.ia?.activo) avisar(`IA: ${ia.estado.motivo}. El realizador sigue con sus reglas`);
    panel?.emitir();
  }).catch(e => avisar(`IA: ${e.message}`));
  ia.arrancar({
    cerebro: () => cerebro,
    jugadores: () => explorador.jugadores,
    tAntena: () => ejecutor.tAntena(),
    tDirecto: () => explorador.conocido?.() ?? explorador.ahora(),
    enPartida: () => Boolean(explorador.enPartida && partida),
    manual: () => ejecutor.manual,
    hayCambios: () => { ejecutor.hayCambios(); panel?.emitir(); },
    apuntar: (quien, que, datos) => ejecutor.apuntar(quien, que, datos),
  });
  let fallosIa = 0;
  const vigiaIa = setInterval(() => {
    // Si la IA empieza a fallar, se avisa una vez (y el realizador sigue con las reglas)
    if (ia.estado.fallos > fallosIa && ia.estado.seguidos >= 3) avisar(`IA: ${ia.estado.ultimoError?.texto || 'no contesta'}. Sigo con las reglas 2 minutos y vuelvo a probar`);
    fallosIa = ia.estado.fallos;
    if (conexiones.ia !== null && conexiones.ia !== (ia.estado.activa && ia.estado.seguidos < 3)) { conexiones.ia = ia.estado.activa && ia.estado.seguidos < 3; panel?.emitir(); }
  }, 2000).unref?.();

  // Puente en la misma red: con rele.ip "auto" se busca el PC 2 en la red con la contraseña
  let buscador = null;
  if (!sala && !ejecutor.urlRele) {
    if (!o.clave) log('Falta la contraseña del puente ("clave" en opciones.local.json) o la IP del PC 2 en rele.ip');
    else {
      log('Buscando el PC 2 en la red...');
      buscador = buscar({ clave: o.clave });
      buscador.on('encontrado', ({ ip, puerto }) => {
        ejecutor.ponerRele(ip, puerto);
        conexiones.releIp = ip;
        log(`PC 2 encontrado en ${ip}`);
        if (obsAuto) conectarObs(o.obs.url.replace(/auto/i, ip));
        panel?.emitir();
      });
      buscador.on('otraContrasena', ip => avisar(`Hay un PC 2 en ${ip} con otra contraseña: pon la misma en los dos`));
      buscador.on('error', e => avisar(`No se puede escuchar al PC 2: ${e.message}`));
    }
  }

  explorador.on('conexion', v => { if (conexiones.explorador !== v) { conexiones.explorador = v; panel?.emitir(); } });
  // Lector de pantalla (pc1/pantalla.js, 14/11): mira la ventana del LoL de este PC (detrás de otras vale; minimizada
  // no) y saca lo que la Live Client no da al espectador: quién coge dragón, heraldo y larvas (el número del marcador
  // de arriba cambia) y cuándo están en enfriamiento los hechizos y la definitiva de cada uno (marcos de los lados)
  const lectura = { lector: null, marcador: new SeguidorMarcador(), hechizos: new SeguidorHechizos(), cambios: false };
  const SUCESO_PANTALLA = { dragon: 'DragonKill', heraldo: 'HeraldKill', larvas: 'HordeKill' };
  // La luz solo sale durante la partida (fuera de ella no hay nada que leer)
  if (o.pantalla?.activo && process.platform === 'win32') {
    const exe = join(carpetaFfmpeg(), 'ffmpeg.exe');
    lectura.lector = new LectorPantalla({ ffmpeg: existsSync(exe) ? exe : 'ffmpeg', fps: o.pantalla.fps || 2, ventana: o.pantalla.ventana });
    lectura.lector.on('estado', v => {
      if (conexiones.pantalla === v || !explorador.enPartida) return;
      conexiones.pantalla = v;
      if (!v && explorador.enPartida) avisar(`Lector de pantalla: ${lectura.lector.error || 'sin imagen'}. ¿Está el LoL minimizado?`);
      panel?.emitir();
    });
    lectura.lector.on('foto', f => {
      if (!explorador.enPartida) return;
      const t = explorador.ahora();
      if (t === null) return;
      let l;
      try { l = leerFotograma(f.px, f.ancho, f.alto); } catch { return; }
      // Solo con el marcador a la vista (en la pantalla de carga o con la interfaz quitada no se lee nada)
      if (l.contadores.filter(c => c.huella).length < 6) return;
      for (const s of lectura.marcador.apuntar(t, l.contadores)) {
        const nombre = SUCESO_PANTALLA[s.tipo];
        if (!nombre) continue;
        // La pantalla no dice quién lo mata: para la cámara, el jungla de ese equipo (el que castiga)
        const jungla = explorador.jugadores.find(j => j.equipo === s.equipo && (j.castigo || j.posicion === 'JUNGLE')) || null;
        explorador.emitirEvento({
          id: `pantalla-${s.tipo}-${s.equipo}-${Math.round(s.t * 10)}`, fuente: 'pantalla', nombre, t: s.t,
          asesino: jungla, victima: null, ayudas: [], implicados: [jungla].filter(Boolean), detalle: { equipo: s.equipo },
        });
      }
      if (lectura.hechizos.apuntar(t, l.marcos)) lectura.cambios = true;
    });
  }
  // Tramos de enfriamiento de cada jugador, con su nombre (los marcos van en el orden de la Live Client por equipo)
  const hechizosAdelanto = () => {
    if (!lectura.lector) return null;
    const r = [];
    for (const equipo of ['azul', 'rojo']) {
      explorador.jugadores.filter(j => j.equipo === equipo).slice(0, 5)
        .forEach((j, k) => r.push({ nombre: j.jugador, equipo, ...lectura.hechizos.de(equipo, k) }));
    }
    return r;
  };
  explorador.on('mision', m => { ejecutor.buzon?.apuntar('explorador', 'mision', m); log(`Misión de rol: ${m.nombre} (${m.campeon || '?'}), ${m.detalle}`); mandarAdelanto(); });
  explorador.on('jugadores', lista => { cerebro.jugadores = lista; ejecutor.hayCambios(); });

  // «Adelanto» para la web: saltos de CS y objetivos, cada 5 s y en cuanto hay un objetivo nuevo. Siempre todo lo
  // de la partida (la web lo trata como idempotente). Solo con la conexión del panel y en partida.
  const mandarAdelanto = () => {
    if (!tenka?.listo || !explorador.enPartida || o.tenkaIchi?.adelanto === false) return;
    lectura.cambios = false;
    tenka.accion('adelanto', construirAdelanto({
      t: explorador.ahora(), historial: explorador.cs, eventos: explorador.objetivos,
      hechizos: hechizosAdelanto(), misiones: explorador.misiones.hechas,
    })).catch(() => {});
  };
  const temporizadorAdelanto = setInterval(mandarAdelanto, 5000);
  temporizadorAdelanto.unref?.();
  explorador.on('evento', e => { if (/^(DragonKill|HeraldKill|BaronKill|HordeKill|AtakhanKill)$/.test(e.nombre)) mandarAdelanto(); });
  // Un hechizo que entra o sale de enfriamiento sale en la web sin esperar a la vuelta de 5 s (como mucho uno por segundo)
  const temporizadorHechizos = setInterval(() => { if (lectura.cambios) mandarAdelanto(); }, 1000);
  temporizadorHechizos.unref?.();
  explorador.on('partida', info => {
    partida = { ...info, id: info.inicio.replace(/[:.]/g, '-') };
    cerebro = new Cerebro(o.reglas);
    cerebro.jugadores = explorador.jugadores;  // para el guion de los primeros minutos (bot, junglas, cangrejo)
    ia.partidaNueva();
    const buzon = new Buzon(join(o.registro.raiz || RAIZ, o.registro.carpeta), partida.id);
    ejecutor.reiniciar(cerebro, buzon, partida.id);
    ejecutor.apuntar('realizador', 'partida nueva', info);
    lectura.marcador.limpiar();
    lectura.hechizos.limpiar();
    if (lectura.lector) { conexiones.pantalla = false; lectura.lector.arrancar(); }
    log(`Partida encontrada (${info.modo || 'modo desconocido'}). Registro en ${buzon.carpeta}`);
  });
  explorador.on('fin', info => {
    // El PC 2 pasa a la escena final cuando la antena llegue a este segundo
    ejecutor.tFin = info?.t ?? explorador.tiempo?.t ?? explorador.ahora();
    ejecutor.hayCambios();
    ejecutor.apuntar('realizador', 'fin de la partida', { ...info, t: ejecutor.tFin });
    cerebro.finPartida = ejecutor.tFin;
    lectura.lector?.parar();
    if (lectura.lector) conexiones.pantalla = null;
    const c = cerebro;
    const tFin = ejecutor.tFin;
    // Resumen escrito y, en la misma llamada, las jugadas destacadas para el resumen en vídeo (sin IA, todas las
    // candidatas). La lista va al PC 2 con el guion: allí sale cuando la emisión pase a Casters.
    const lista = r => { if (c === cerebro) ejecutor.ponerResumen(c.listaResumen(tFin, r?.destacadas ?? null)); };
    ia.resumenFinal({ cerebro: c, jugadores: explorador.jugadores, tFin, carpeta: ejecutor.buzon?.carpeta, candidatas: c.candidatasResumen() })
      .then(r => { ejecutor.apuntar(r.hecho === 'ia' ? 'ia' : 'realizador', 'resumen final', { titular: r.titular || null }); lista(r); panel?.emitir(); })
      .catch(() => lista(null));
  });
  explorador.on('evento', e => {
    const j = cerebro.agregar(e);
    if (j) ejecutor.hayCambios();
    ejecutor.buzon?.apuntar('explorador', 'suceso', { nombre: e.nombre, t: e.t, jugada: j?.id || null, asesino: e.asesino?.campeon, victima: e.victima?.campeon });
  });

  ejecutor.on('rele', v => { conexiones.rele = v; if (!v) avisar('El relé del PC 2 no responde'); panel?.emitir(); });
  ejecutor.on('aviso', avisar);
  ejecutor.on('registro', l => { registro.unshift(l); registro.length = Math.min(registro.length, 60); panel?.emitir(); });
  ejecutor.on('guion', () => panel?.emitir());

  function foto() {
    // Con OBS en el PC 2, su estado llega con el del relé
    if (!obs && ejecutor.antena && ejecutor.antena.obs !== undefined && ejecutor.antena.obs !== null) conexiones.obs = ejecutor.releConectado && ejecutor.antena.obs;
    const tA = ejecutor.tAntena();
    const tD = explorador.ahora();
    // Lo que manda el relé del PC 2 (emisión, OBS, su LoL), si está conectado
    const a = ejecutor.releConectado ? ejecutor.antena : null;
    const c = condiciones({
      papel: 'pc1', pc1: true, pc2: ejecutor.releConectado,
      partidaPc1: Boolean(conexiones.explorador && partida), partidaPc2: Boolean(a?.juego),
      obs: a ? a.obs === true : null, bufer: a ? a.bufer ?? null : null, sala: sala?.sala ? String(sala.sala).slice(0, 4).toUpperCase() : null,
    });
    const faltan = Number.isFinite(a?.faltan) ? Math.max(0, a.faltan - (Date.now() - a.recibido) / 1000) : null;
    // Resumen en vídeo: su estado lo lleva el PC 2; la cuenta atrás se descuenta desde que llegó
    const resumen = a?.resumen ? { ...a.resumen, faltan: Number.isFinite(a.resumen.faltan) ? Math.max(0, Math.ceil(a.resumen.faltan - (Date.now() - a.recibido) / 1000)) : null } : null;
    return {
      papel: 'pc1',
      condiciones: c.lista,
      listo: c.listo,
      emision: a?.emision || null,
      faltan,
      resumen,
      conexiones,
      partida,
      jugadores: explorador.jugadores,
      tDirecto: tD,
      tAntena: tA,
      margenReal: tA !== null && tD !== null ? tD - tA : null,
      margen: o.margenSegundos,
      manual: ejecutor.manual,
      modoRele: ejecutor.antena?.modo || null,
      planoActual: ejecutor.planoActual(),
      proximos: ejecutor.guion.filter(p => tA === null || p.inicio > tA).slice(0, 12),
      acciones: cerebro.acciones.filter(a => !ejecutor.hechas.has(a.id)).slice(0, 8),
      jugadas: cerebro.jugadas.slice(-20).reverse().map(j => ({
        id: j.id, tipo: j.tipo, inicio: j.inicio, fin: j.fin, muertes: j.muertes, objetivos: j.objetivos,
        repetir: j.repetir, estado: ejecutor.estadoJugadas.get(j.id) || 'pendientes',
        campeones: Object.keys(j.campeones),
      })),
      registro: registro.slice(0, 40),
      avisos: avisos.slice(0, 10),
      ia: o.ia?.activo || otraIa ? ia.foto() : null,
      app: { ...app.publico(), sala: sala?.sala ? String(sala.sala).slice(0, 4).toUpperCase() : null },
    };
  }

  panel = arrancarPanel({
    puerto: o.panel.puerto,
    foto,
    control: async ({ manual }) => ejecutor.ponerManual(manual),
    orden: async orden => ejecutor.ordenManual(orden),
    emision: async orden => ejecutor.emision(orden),
    resumen: async ({ accion }) => ejecutor.resumen(accion),
    app: async ({ accion }) => {
      if (accion === 'comprobar') return { nueva: await app.comprobar() };
      if (accion === 'actualizar') return app.actualizar();
      if (accion === 'volver') return app.volver();
      if (accion === 'cerrar') { log('[app] cerrado desde el panel'); setTimeout(cerrar, 300); return {}; }
      throw new Error('No sé hacer eso');
    },
  });

  // Panel de Gokudō (sección «Realizador»): ve lo mismo que este panel y puede tomar el control
  let fotoSala = null;
  if (sala) {
    sala.on('mensaje', async d => {
      try {
        if (d.tipo === 'panelControl') await ejecutor.ponerManual(Boolean(d.manual), 'panel de Gokudō');
        else if (d.tipo === 'panelOrden' && d.orden) await ejecutor.ordenManual(d.orden, 'panel de Gokudō');
        else if (d.tipo === 'panelEmision') await ejecutor.emision(d, 'panel de Gokudō');
        else if (d.tipo === 'panelResumen') await ejecutor.resumen(d.accion, 'panel de Gokudō');
      } catch (e) { avisar(`Orden del panel de Gokudō: ${e.message}`); }
    });
    fotoSala = setInterval(() => sala.enviar({ tipo: 'foto', ...foto(), registro: registro.slice(0, 15) }), 1000);
  }

  explorador.arrancar();
  ejecutor.arrancar();
  log(`Agente en marcha. Panel: http://localhost:${o.panel.puerto}/  ·  PC 2: ${sala ? `por el servidor de Gokudō (${o.puente.url})` : ejecutor.urlRele || 'buscando en la red'}`);
  log('Abre la partida en LoL (espectador): el realizador la encuentra y arranca solo.');

  agente = {
    app,
    foto,
    ia,
    get cerebro() { return cerebro; },
    ejecutor,
    explorador,
    parar() {
      explorador.parar();
      ejecutor.parar();
      ia.parar();
      clearInterval(vigiaIa);
      buscador?.parar();
      clearInterval(fotoSala);
      sala?.cerrar();
      obs?.cerrar();
      clearInterval(temporizadorAdelanto);
      clearInterval(temporizadorHechizos);
      lectura.lector?.parar();
      clearInterval(temporizadorSala);
      tenka?.cerrar();
      panel.parar();
      app.parar();
      if (perfilAplicado) {
        try { restaurarPerfil(perfilAplicado); log('Perfil del juego restaurado'); } catch (e) { log(`No se pudo restaurar el perfil: ${e.message}`); }
      }
    },
  };
  return agente;
}

// Arrancado directamente (npm run agente)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = cargarOpciones();
  // Las consolas van ocultas: todo queda también en partidas/pc1-AAAA-MM-DD.log
  const agente = arrancarAgente(o, { perfilMinimo: process.argv.includes('--perfil-minimo'), log: registroEnArchivo(o, 'pc1') });
  agente.app.arrancar();
  let saliendo = false;
  const salir = () => {
    if (saliendo) return;
    saliendo = true;
    agente.parar();
    process.exit(0);
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
