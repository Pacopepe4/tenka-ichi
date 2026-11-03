// Agente del PC 1: explorador + cerebro + ejecutor + panel de supervisión.
// Arranque: npm run agente   (npm run agente -- --perfil-minimo pone el perfil ligero del juego y lo quita al cerrar)
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarOpciones, RAIZ } from '../comun/opciones.js';
import { Buzon } from '../comun/buzon.js';
import { Explorador } from './explorador.js';
import { Cerebro } from './cerebro.js';
import { Ejecutor } from './ejecutor.js';
import { Obs } from './obs.js';
import { Tenka } from './tenka.js';
import { arrancarPanel } from './panel.js';
import { buscar } from '../comun/puente.js';
import { Sala } from '../comun/sala.js';
import { aplicarPerfil, restaurarPerfil, rutaConfig } from '../instalar/configurar-lol.js';
import { condiciones } from '../comun/condiciones.js';

// «explorador» permite cambiar de dónde salen los sucesos (el modo grabada pone el suyo)
export function arrancarAgente(o, { perfilMinimo = false, log = console.log, explorador: otroExplorador = null, sala: otraSala = null } = {}) {
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
  const conexiones = { explorador: false, liveEvents: false, rele: false, obs: null, tenka: null };
  const avisos = [];
  const registro = [];
  const avisar = texto => {
    avisos.unshift({ hora: new Date().toISOString(), texto });
    avisos.length = Math.min(avisos.length, 30);
    log(`[aviso] ${texto}`);
    panel?.emitir();
  };

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
  // Puente por internet (PCs en redes distintas): sala del realizador en el servidor de TENKA ICHI
  let sala = null;
  if (otraSala || (o.clave && o.puente?.modo === 'tenka')) {
    sala = otraSala || new Sala({ url: o.puente.url, clave: o.clave, papel: 'pc1' });
    conexiones.puente = false;
    sala.on('conexion', v => { conexiones.puente = v; log(v ? 'Conectado al servidor de TENKA ICHI' : 'Sin conexión con el servidor de TENKA ICHI, reintentando...'); panel?.emitir(); });
    sala.on('companero', v => { log(v ? 'El PC 2 está conectado' : 'El PC 2 no está conectado'); panel?.emitir(); });
    sala.on('aviso', t => avisar(`Puente: ${t}`));
    sala.conectar();
  }
  ejecutor = new Ejecutor({ opciones: o, cerebro, explorador, obs, tenka, sala });

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
  explorador.on('liveEvents', v => { conexiones.liveEvents = v; panel?.emitir(); });
  explorador.on('partida', info => {
    partida = { ...info, id: info.inicio.replace(/[:.]/g, '-') };
    cerebro = new Cerebro(o.reglas);
    const buzon = new Buzon(join(o.registro.raiz || RAIZ, o.registro.carpeta), partida.id);
    ejecutor.reiniciar(cerebro, buzon);
    ejecutor.apuntar('realizador', 'partida nueva', info);
    log(`Partida encontrada (${info.modo || 'modo desconocido'}). Registro en ${buzon.carpeta}`);
  });
  explorador.on('fin', info => {
    // El PC 2 pasa a la escena final cuando la antena llegue a este segundo
    ejecutor.tFin = explorador.tiempo?.t ?? explorador.ahora();
    ejecutor.hayCambios();
    ejecutor.apuntar('realizador', 'fin de la partida', { ...info, t: ejecutor.tFin });
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
      obs: a ? a.obs === true : null, bufer: a ? a.bufer ?? null : null,
    });
    const faltan = Number.isFinite(a?.faltan) ? Math.max(0, a.faltan - (Date.now() - a.recibido) / 1000) : null;
    return {
      papel: 'pc1',
      condiciones: c.lista,
      listo: c.listo,
      emision: a?.emision || null,
      faltan,
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
    };
  }

  panel = arrancarPanel({
    puerto: o.panel.puerto,
    foto,
    control: async ({ manual }) => ejecutor.ponerManual(manual),
    orden: async orden => ejecutor.ordenManual(orden),
    emision: async orden => ejecutor.emision(orden),
  });

  // Panel de TENKA ICHI (sección «Realizador»): ve lo mismo que este panel y puede tomar el control
  let fotoSala = null;
  if (sala) {
    sala.on('mensaje', async d => {
      try {
        if (d.tipo === 'panelControl') await ejecutor.ponerManual(Boolean(d.manual), 'panel de TENKA ICHI');
        else if (d.tipo === 'panelOrden' && d.orden) await ejecutor.ordenManual(d.orden, 'panel de TENKA ICHI');
        else if (d.tipo === 'panelEmision') await ejecutor.emision(d, 'panel de TENKA ICHI');
      } catch (e) { avisar(`Orden del panel de TENKA ICHI: ${e.message}`); }
    });
    fotoSala = setInterval(() => sala.enviar({ tipo: 'foto', ...foto(), registro: registro.slice(0, 15) }), 1000);
  }

  explorador.arrancar();
  ejecutor.arrancar();
  log(`Agente en marcha. Panel: http://localhost:${o.panel.puerto}/  ·  PC 2: ${sala ? `por el servidor de TENKA ICHI (${o.puente.url})` : ejecutor.urlRele || 'buscando en la red'}`);
  log('Abre la partida en LoL (espectador): el realizador la encuentra y arranca solo.');

  return {
    foto,
    get cerebro() { return cerebro; },
    ejecutor,
    explorador,
    parar() {
      explorador.parar();
      ejecutor.parar();
      buscador?.parar();
      clearInterval(fotoSala);
      sala?.cerrar();
      obs?.cerrar();
      tenka?.cerrar();
      panel.parar();
      if (perfilAplicado) {
        try { restaurarPerfil(perfilAplicado); log('Perfil del juego restaurado'); } catch (e) { log(`No se pudo restaurar el perfil: ${e.message}`); }
      }
    },
  };
}

// Arrancado directamente (npm run agente)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agente = arrancarAgente(cargarOpciones(), { perfilMinimo: process.argv.includes('--perfil-minimo') });
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
