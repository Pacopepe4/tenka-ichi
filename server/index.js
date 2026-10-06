// Servidor de TENKA ICHI Draft: sirve el overlay y el panel, mantiene el estado del
// enfrentamiento y lo reparte en directo por WebSocket a todas las pantallas abiertas.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { conectar, codigoDeEnlace, destinoDeSlot } from './draftcore.js';
import { cargar, guardarPartida, todas } from './registro.js';
import { competicion } from './competicion.js';
import { cargarCalendario, calendarioActual, temporadaSimulada, sortearCalendario } from './calendario.js';
import { statsCampeon, statsLiga } from './stats.js';
import { CLANES, ROLES } from './clanes.js';
import { cargarPlantillas, plantilla, guardarPlantilla, refrescarPlantillas } from './plantillas.js';
import { estadoHoja } from './sheets.js';
import { cargarTierlist, vistaTierlist, ponerTier } from './tierlist.js';
import { cargarAjustes } from './ajustes.js';
import { cargarGacha, catalogo, probabilidades, abrirSobre, darAlta, darSobres, estadoUsuario, buscarUsuario, resumenGacha, fundirRepetidas,
  PESOS, CARTAS_POR_SOBRE, SOBRES_INICIALES, REPETIDAS_POR_SOBRE, PROBABILIDAD_LEGACY, CARPETA_ARTE, reversoCarta } from './gacha.js';
import { crearCodigo, cerrarCodigo, mostrarCodigo, estadoCodigo, codigoEnPantalla, canjearCodigo as canjearCodigoDirecto } from './codigos.js';
import { estadoJornadas, terminarJornada, jornadasCerradas, premiosPublicos } from './jornada.js';
import { clasificacionJornada } from './fantasy.js';
import { previa, fichaJugador, fichaClan } from './previa.js';
import { cargarCanal, conectarCanal, cambiarCoste, sondear, sondearSiHaceFalta, estadoCanal, SCOPE_CANAL } from './canal.js';
import { firmar, verificar, leerCookies, ponerCookie } from './sesion.js';
import { twitchActivo, urlAutorizar, canjearCodigo, usuarioDeToken, usuarioPorNombre, CANAL } from './twitch.js';
import { loginDiscordActivo, urlAutorizarDiscord, sesionDeDiscord } from './entrada-discord.js';
import crypto from 'node:crypto';
import { cargarFantasy, infoFantasy, cambiarAlineacion, guardarEstadisticas, cerrarAlineaciones, alineacionesCerradas } from './fantasy.js';
import { atenderPublicacion, discordActivo } from './discord.js';
import { cargarPartida, recibir as recibirPartida, resumen as resumenPartida, empezarPrueba, pararPrueba, enPrueba, olvidarPartida,
  ponerContexto, marcarObjetivo, deshacerMarca, ajustarIngame } from './partida.js';
import { crearZip } from './zip.js';
import { fotoEstado, restaurarEstado, guardarEstadoSiCambia, guardarEstadoYa, estadoYaGuardado, camaraLineas } from './estado-guardado.js';
import { VISTAS, clavePartida, vistaAutomatica, fotoFinal, fotoFinalDelDraft, completarFinal } from './vista.js';

// Clanes con su plantilla actual (lema, descripción, jugadores) para las páginas
const clanesConPlantilla = () => CLANES.map(c => ({ ...c, ...plantilla(c.id) }));

const PUERTO = Number(process.env.PORT) || 3000;
const CLAVE = process.env.PANEL_CLAVE || 'tenkaichi';
const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PUENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'puente');
const ARCHIVOS_PUENTE = ['Abrir el puente.bat', 'puente-tenka-ichi.ps1', 'LEEME.txt'];  // clave.txt nunca va dentro
let zipPuente = null;

const vacio = () => ({ azul: Array(5).fill(null), rojo: Array(5).fill(null) });

const estado = {
  config: { jornada: 'Jornada 1', fase: 'Fase de liga', formato: 'bo1', serie: 1, partida: 1 },
  equipos: {
    azul: { clan: 'NONAME', jugadores: Array(5).fill('') },
    rojo: { clan: 'NONAME', jugadores: Array(5).fill('') },
  },
  fuente: { enlace: '', codigo: null, conectado: false, error: null },
  draft: { turno: 0, activo: null, hover: null, tiempo: null, bans: vacio(), picks: vacio() },
  fearless: [],
  resultados: [],
  // Cámaras del overlay: cuántas se ven (0-4) y qué es cada una
  // tipo: 'caster', 'azul' o 'rojo' (sigue al clan de ese lado) o el id de un clan
  camaras: { cantidad: 0, lista: Array.from({ length: 4 }, () => ({ tipo: 'caster', nombre: '', detalle: '' })) },
  // Overlay de partida (/ingame/): el panel puede ocultarlo aunque llegue la partida del puente
  partidaVisible: true,
  // Qué enseña el overlay (/overlay/): 'draft', 'postdraft', 'partida' o 'final'. Lo decide vista.js según lo que va
  // pasando, salvo que el panel fuerce una (vista.forzada). vista.enPartida: hay una partida en marcha
  vistaOverlay: 'draft',
  vista: { forzada: null, enPartida: false },
  // La última partida tal como acabó, para la pantalla final (vista.js)
  final: null,
  // Jornada automática: las alineaciones se cierran solas al empezar y, al terminarla, hay sobres para los tres primeros
  // cerradaPara: la partida para la que ya se cerraron solas (una vez por partida: si el staff las abre, se quedan abiertas)
  jornadaAuto: { cerrar: true, premios: [3, 2, 1], cerradaPara: null },
  fantasy: { cerrado: false },
  // Código de directo que se enseña en el overlay: { texto, sobres, quedan (ms) } o nada (server/codigos.js)
  codigo: null,
  // El puente del PC del espectador solo busca la partida cuando se lo pide el panel (o al acabar el draft)
  buscarPartida: { activa: false, alAcabarDraft: true },
  // Grafismo que el panel saca encima de la partida: { tipo: 'lineas' | 'ficha' | 'oro', id, lado e indice (la ficha) } o nada
  grafico: null,
  // Avisos propios de objetivos en el overlay; apagados, se ven los del propio LoL
  avisosPropios: false,
  // Marcador de partida: estilo (A «retoque» o B «full art») e interruptores de lo nuevo, encendidos por defecto
  // (sirven para ocultar algo si no va bien, no para tener que activarlo). oroIngresos apagado vuelve al valor de los objetos.
  // camaras: las cámaras de los casters a los lados del línea por línea (izquierda y derecha), que sí hay que activar:
  // huecos transparentes como los del draft, con el nombre y el detalle que se escriban en el panel
  ingame: { estilo: 'a', puntosFantasy: true, resumenPelea: true, oroIngresos: true,
    camaras: [{ activa: false, nombre: '', detalle: '' }, { activa: false, nombre: '', detalle: '' }] },
  aviso: null,
  hoja: { configurada: false, ok: false, error: null, cuenta: null },
};

// ---------- reparto en directo ----------
const clientes = new Set();
let quiereDraftCore = false;  // el panel ha pedido estar conectado a DraftCore: tras un reinicio se vuelve a conectar
const fotoActual = () => fotoEstado(estado, { draftcore: quiereDraftCore });
function emitir() {
  // La partida necesita los jugadores y los picks del panel para saber quién juega cada línea
  ponerContexto({ nombres: { azul: estado.equipos.azul.jugadores, rojo: estado.equipos.rojo.jugadores }, picks: estado.draft.picks });
  actualizarVista();
  estado.fantasy.cerrado = alineacionesCerradas();
  const codigo = codigoEnPantalla();
  estado.codigo = codigo ? { texto: codigo.texto, sobres: codigo.sobres, quedan: codigo.caduca - Date.now() } : null;
  guardarEstadoSiCambia(fotoActual);
  const msg = JSON.stringify({ tipo: 'estado', estado });
  for (const ws of clientes) if (ws.readyState === 1) ws.send(msg);
}

// La partida en directo va en su propio mensaje: llega cada segundo y no hace falta reenviar todo el estado
let partidaActiva = false, puenteConectado = false;
let numeroDesarmado = 0;  // última partida terminada que ya apagó la búsqueda
// Cada arranque del servidor tiene su sesión: si el puente estaba en plena partida y la web se reinicia
// (una actualización, Render), sigue con ella en lugar de quedarse en espera, salvo que el panel haya
// tocado la búsqueda desde el arranque
const SESION = crypto.randomUUID();
// La versión cambia con cada actualización de la web (en Render, el commit desplegado): las páginas abiertas
// la reciben al conectarse y, si no es la que cargaron, se recargan solas (el panel avisa)
const VERSION = process.env.RENDER_GIT_COMMIT || SESION;
let busquedaTocada = false;
function emitirPartida(partida = resumenPartida()) {
  partidaActiva = partida.activo;
  puenteConectado = partida.puente.conectado;
  const cambia = seguirPartida(partida);
  const msg = JSON.stringify({ tipo: 'partida', partida });
  for (const ws of clientes) if (ws.readyState === 1) ws.send(msg);
  if (cambia) emitir();
}
// Si el puente deja de mandar datos, avisa al overlay para que se retire y al panel de que se ha cerrado
setInterval(() => {
  const p = resumenPartida();
  if ((partidaActiva && !p.activo) || puenteConectado !== p.puente.conectado) emitirPartida(p);
}, 3000);

// ---------- qué enseña el overlay ----------
const draftCompleto = d => ['azul', 'rojo'].every(l => d.picks[l].every(Boolean));
const ESPERA_POSTDRAFT_MS = Number(process.env.ESPERA_VISTA_MS) || 10000;  // el último pick se queda un momento antes del postdraft
const ESPERA_FINAL_MS = Number(process.env.ESPERA_VISTA_MS) || 10000;      // y el final de la partida, antes de la pantalla final
let draftCompletoDesde = 0;
let fotoViva = null;                         // último resumen de la partida mientras estaba en marcha
let terminada = { numero: null, desde: 0 };  // la partida que ya ha dado su fin
let numeroDespachado = null;                 // la partida de la que el panel ya ha pasado página: no vuelve a dejar su final
const revisarEn = ms => { setTimeout(emitir, ms + 50).unref?.(); };

function actualizarVista() {
  const completo = draftCompleto(estado.draft);
  if (!completo) draftCompletoDesde = 0;
  else if (!draftCompletoDesde) { draftCompletoDesde = Date.now(); revisarEn(ESPERA_POSTDRAFT_MS); }
  const draftListo = completo && Date.now() - draftCompletoDesde >= ESPERA_POSTDRAFT_MS;
  const hayFinal = Boolean(estado.final && estado.final.clave === clavePartida(estado));
  estado.vistaOverlay = estado.vista.forzada || vistaAutomatica({ enPartida: estado.vista.enPartida, hayFinal, draftListo });
}

// La pantalla final solo se cambia si la partida ha cambiado (después del fin siguen llegando paquetes iguales)
function ponerFinal(nueva) {
  const igual = estado.final && JSON.stringify({ ...estado.final, cuando: 0 }) === JSON.stringify({ ...nueva, cuando: 0 });
  if (!igual) estado.final = nueva;
}

// Sigue la partida que manda el puente: mientras está en marcha, el overlay enseña el marcador; al acabar, guarda
// cómo ha quedado para la pantalla final. Devuelve si ha cambiado algo que haya que repartir
function seguirPartida(p) {
  const antes = JSON.stringify([estado.vista, estado.final]);
  if (p.activo) {
    fotoViva = p;
    if (p.terminada) {
      // El fin se enseña un momento con el marcador puesto y luego pasa a la pantalla final
      // (pasada la espera se vuelve a mirar la partida, por si el cliente ya no manda nada más)
      if (terminada.numero !== p.numero) {
        terminada = { numero: p.numero, desde: Date.now() };
        setTimeout(() => emitirPartida(), ESPERA_FINAL_MS + 50).unref?.();
      }
      if (p.numero !== numeroDespachado) ponerFinal(fotoFinal(p, estado, estado.final));
      if (Date.now() - terminada.desde >= ESPERA_FINAL_MS) estado.vista.enPartida = false;
    } else {
      estado.vista.enPartida = true;
      if (!p.prueba) cerrarAlineacionesAlEmpezar();
    }
  } else if (estado.vista.enPartida && p.puente.conectado && p.puente.estado !== 'partida') {
    // El puente sigue abierto y dice que el cliente ya no tiene la partida: se ha acabado (o el panel ha dejado
    // de buscarla). Si lo que falla es el puente o la red, no se sabe y el overlay sigue en la partida
    cerrarPartida();
  }
  return antes !== JSON.stringify([estado.vista, estado.final]);
}

function cerrarPartida() {
  if (fotoViva) ponerFinal(fotoFinal(fotoViva, estado, estado.final));
  estado.vista.enPartida = false;
  fotoViva = null;
}

// Las alineaciones del fantasy se cierran solas cuando empieza el draft o la partida (si el panel lo tiene así)
let cerrando = false;
async function cerrarAlineacionesAlEmpezar() {
  const clave = clavePartida(estado);
  if (cerrando || !estado.jornadaAuto.cerrar || estado.jornadaAuto.cerradaPara === clave) return;
  estado.jornadaAuto.cerradaPara = clave;
  if (alineacionesCerradas()) return;
  cerrando = true;
  try { await cerrarAlineaciones(true); console.log('Alineaciones del fantasy cerradas: ha empezado la jornada'); emitir(); }
  catch (e) { console.error('No se pudieron cerrar las alineaciones:', e.message); }
  cerrando = false;
}

// Al completarse el draft, el puente se pone a buscar la partida (si el panel lo tiene así)
function buscarSiAcabaElDraft(completoAntes) {
  if (!completoAntes && draftCompleto(estado.draft) && estado.buscarPartida.alAcabarDraft) estado.buscarPartida.activa = true;
}

// Grafismo del panel encima de la partida; se quita solo pasados los segundos pedidos (0: hasta que se quite)
let idGrafico = 0, temporizadorGrafico = null;
function ponerGrafico(tipo, segundos, extra = {}) {
  clearTimeout(temporizadorGrafico);
  estado.grafico = tipo ? { tipo, id: ++idGrafico, ...extra } : null;
  if (!tipo || !segundos) return;
  const id = idGrafico;
  temporizadorGrafico = setTimeout(() => { if (estado.grafico?.id === id) { estado.grafico = null; emitir(); } }, segundos * 1000);
}

// ---------- avisos de pick/ban con estadísticas ----------
// Los avisos se numeran desde la hora de arranque: tras un reinicio, un overlay que siguiera abierto no confunde
// el primer aviso nuevo con uno que ya enseñó
let idAviso = Math.floor(Date.now() / 1000);
function avisar(tipo, lado, indice, campeon) {
  const eq = estado.equipos[lado];
  const stats = statsCampeon(campeon, { clan: eq.clan, jugador: tipo === 'pick' ? eq.jugadores[indice] : null });
  estado.aviso = { id: ++idAviso, tipo, lado, indice, campeon, rol: tipo === 'pick' ? ROLES[indice] : null,
    jugador: tipo === 'pick' ? eq.jugadores[indice] : null, clan: eq.clan, stats };
}

function detectarNuevos(antes, despues) {
  for (const tipo of ['picks', 'bans']) for (const lado of ['azul', 'rojo']) {
    despues[tipo][lado].forEach((c, i) => {
      if (c && c !== antes[tipo][lado][i]) { avisar(tipo === 'picks' ? 'pick' : 'ban', lado, i, c); cerrarAlineacionesAlEmpezar(); }
    });
  }
}

const draftVacio = () => ({ turno: 0, activo: null, hover: null, tiempo: null, bans: vacio(), picks: vacio() });
// Partida nueva en el panel: draft vacío y el overlay vuelve a decidir solo qué enseña
function partidaNueva() {
  estado.draft = draftVacio();
  estado.aviso = null;
  estado.vista = { forzada: null, enPartida: false };
  estado.final = null;
  numeroDespachado = fotoViva?.numero ?? terminada.numero;
  fotoViva = null;
}

// ---------- DraftCore ----------
let conexion = null;
function conectarDraftCore(enlace) {
  if (conexion) conexion.cerrar();
  const codigo = codigoDeEnlace(enlace);
  estado.fuente = { enlace, codigo, conectado: false, error: codigo ? null : 'Enlace no válido' };
  if (!codigo) return;
  conexion = conectar(codigo, {
    alEstado: e => { Object.assign(estado.fuente, e); emitir(); },
    alDraft: t => {
      const antes = { picks: estado.draft.picks, bans: estado.draft.bans };
      const completoAntes = draftCompleto(estado.draft);
      estado.draft = { ...estado.draft, turno: t.turno, activo: destinoDeSlot(t.slot), hover: t.hover, bans: t.bans, picks: t.picks };
      detectarNuevos(antes, t);
      buscarSiAcabaElDraft(completoAntes);
      emitir();
    },
    alHover: h => { estado.draft.hover = h; emitir(); },
    alTiempo: t => { estado.draft.tiempo = t.segundos; emitir(); },
  });
}

// ---------- acciones del panel ----------
async function accion(nombre, d = {}) {
  switch (nombre) {
    case 'config':
      Object.assign(estado.config, d);
      break;
    case 'equipo': {
      const eq = estado.equipos[d.lado];
      if (d.clan) eq.clan = d.clan;
      if (Array.isArray(d.jugadores)) eq.jugadores = d.jugadores.slice(0, 5).map(j => String(j || ''));
      break;
    }
    case 'conectar':
      conectarDraftCore(d.enlace);
      quiereDraftCore = Boolean(estado.fuente.codigo);
      break;
    case 'desconectar':
      quiereDraftCore = false;
      if (conexion) conexion.cerrar();
      conexion = null;
      estado.fuente = { ...estado.fuente, conectado: false, error: null };
      break;
    case 'corregir': {
      // corrección manual de un slot: { tipo: 'picks'|'bans', lado, indice, campeon }
      const lista = estado.draft[d.tipo]?.[d.lado];
      if (!lista) break;
      const antes = lista[d.indice];
      const completoAntes = draftCompleto(estado.draft);
      lista[d.indice] = d.campeon || null;
      if (d.campeon && d.campeon !== antes) { avisar(d.tipo === 'picks' ? 'pick' : 'ban', d.lado, d.indice, d.campeon); cerrarAlineacionesAlEmpezar(); }
      buscarSiAcabaElDraft(completoAntes);
      break;
    }
    case 'invertir': {
      const { azul, rojo } = estado.equipos;
      estado.equipos = { azul: rojo, rojo: azul };
      break;
    }
    case 'ganador': {
      // registra la partida y, en fearless, bloquea sus campeones para la siguiente
      const p = {
        fecha: new Date().toISOString().slice(0, 10),
        jornada: estado.config.jornada, fase: estado.config.fase,
        serie: `${estado.config.jornada} · ${estado.equipos.azul.clan} vs ${estado.equipos.rojo.clan}`,
        partida: estado.config.partida,
        clanAzul: estado.equipos.azul.clan, clanRojo: estado.equipos.rojo.clan,
        ganador: d.lado,
        picks: structuredClone(estado.draft.picks), bans: structuredClone(estado.draft.bans),
        jugadores: { azul: [...estado.equipos.azul.jugadores], rojo: [...estado.equipos.rojo.jugadores] },
      };
      let r;
      try { r = await guardarPartida(p); }
      finally { estado.hoja = estadoHoja(); }
      estado.resultados.push({ partida: p.partida, ganador: d.lado, clan: d.lado === 'azul' ? p.clanAzul : p.clanRojo });
      if (estado.config.formato === 'bo3f') {
        for (const lado of ['azul', 'rojo']) estado.fearless.push(...p.picks[lado].filter(Boolean));
      }
      // La pantalla final: la del marcador si la hay y, si no, la que sale del draft
      estado.final = { ...(estado.final?.clave === clavePartida(estado) ? estado.final : fotoFinalDelDraft(estado)), ganador: d.lado };
      return { ok: true, enHoja: r.enHoja };
    }
    case 'vistaOverlay':
      // El panel fuerza lo que enseña el overlay ('draft', 'postdraft', 'partida' o 'final') o lo deja en automático.
      // Forzar la partida también pone al puente a buscarla, haya draft o no
      estado.vista.forzada = VISTAS.includes(d.vista) ? d.vista : null;
      if (estado.vista.forzada === 'partida') { estado.buscarPartida.activa = true; busquedaTocada = true; }
      break;
    case 'finalQuitar':
      estado.final = null;
      numeroDespachado = fotoViva?.numero ?? terminada.numero;
      if (estado.vista.forzada === 'final') estado.vista.forzada = null;
      break;
    case 'siguiente':
      estado.config.partida += 1;
      partidaNueva();
      break;
    case 'nuevaSerie':
      estado.config.partida = 1;
      estado.fearless = [];
      estado.resultados = [];
      partidaNueva();
      break;
    case 'limpiarDraft':
      partidaNueva();
      break;
    case 'jornadaAuto':
      if (typeof d.cerrar === 'boolean') estado.jornadaAuto.cerrar = d.cerrar;
      if (Array.isArray(d.premios) && d.premios.length === 3) {
        estado.jornadaAuto.premios = d.premios.map(n => Math.max(0, Math.min(20, Math.round(Number(n) || 0))));
      }
      break;
    case 'camaras': {
      const n = Number(d.cantidad);
      if (Number.isInteger(n) && n >= 0 && n <= 4) estado.camaras.cantidad = n;
      if (Array.isArray(d.lista)) estado.camaras.lista = estado.camaras.lista.map((c, i) => {
        const x = d.lista[i] || {};
        return { tipo: String(x.tipo || c.tipo), nombre: String(x.nombre ?? c.nombre).slice(0, 40), detalle: String(x.detalle ?? c.detalle).slice(0, 60) };
      });
      break;
    }
    case 'plantilla':
      await guardarPlantilla(d.clan, d);
      break;
    case 'tier':
      ponerTier(d.tipo, d.id, d.tier || null);
      return { ok: true, tierlist: vistaTierlist() };
    case 'fantasyEstadisticas': {
      // Estadísticas y MVP de la partida que está en el panel; hace falta haber marcado antes quién ganó.
      // Del puente pueden llegar además la primera sangre, los multikills y las torres de cada jugador
      const res = [...estado.resultados].reverse().find(r => r.partida === estado.config.partida);
      if (!res) return { ok: false, error: 'Marca antes quién ha ganado la partida' };
      const { azul, rojo } = estado.equipos;
      const partida = `${estado.config.jornada}: ${azul.clan} vs ${rojo.clan}, partida ${estado.config.partida}`;
      const filas = [];
      for (const lado of ['azul', 'rojo']) {
        const eq = estado.equipos[lado];
        ROLES.forEach((rol, i) => {
          const s = d.filas?.find(x => x.lado === lado && Number(x.indice) === i) || {};
          filas.push({ jornada: estado.config.jornada, fase: estado.config.fase, clan: eq.clan, rol, jugador: eq.jugadores[i] || '',
            id: `${eq.clan}-${rol}`, victoria: res.ganador === lado, k: s.k, d: s.d, a: s.a, mvp: d.mvp === `${lado}-${i}`,
            cs: s.cs, vision: s.vision, dano: s.dano, danoTorres: s.danoTorres, primeraSangre: s.primeraSangre, triples: s.triples, quadras: s.quadras,
            pentas: s.pentas, torres: s.torres, fuente: s.fuente });
        });
      }
      const puntos = await guardarEstadisticas(partida, filas);
      const final = estado.final?.clave === clavePartida(estado) ? estado.final : fotoFinalDelDraft(estado);
      estado.final = completarFinal(final, estado, { filas: d.filas, mvp: d.mvp, puntos });
      return { ok: true, partida, puntos };
    }
    case 'fantasyCerrar':
      await cerrarAlineaciones(Boolean(d.cerrado));
      return { ok: true, gacha: estadoGachaPanel() };
    case 'gachaEstado':
      return { ok: true, gacha: estadoGachaPanel() };
    // Código de directo: sale en el overlay y quien lo canjea en el gachapon se lleva sobres
    case 'codigoCrear': {
      const c = await crearCodigo(d);
      revisarEn(c.caduca - Date.now());   // al caducar se retira del overlay
      return { ok: true, gacha: estadoGachaPanel() };
    }
    case 'codigoCerrar':
      await cerrarCodigo();
      return { ok: true, gacha: estadoGachaPanel() };
    case 'codigoMostrar':
      await mostrarCodigo(d.visible);
      return { ok: true, gacha: estadoGachaPanel() };
    // Jornada del fantasy: su clasificación y, al terminarla, los sobres de los tres primeros
    case 'jornadaEstado':
      return { ok: true, ...estadoJornadas(d.jornada) };
    case 'jornadaTerminar': {
      const r = await terminarJornada(d.jornada, estado.jornadaAuto.premios);
      return { ok: true, ...r, gacha: estadoGachaPanel() };
    }
    case 'twitchCanal': {
      if (!twitchActivo()) return { ok: false, error: 'Falta configurar la app de Twitch en Render (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET y SESION_SECRETO)' };
      return { ok: true, url: `/auth/canal?t=${encodeURIComponent(firmar({ canal: true }, 300))}` };
    }
    case 'gachaCoste':
      await cambiarCoste(d.coste);
      return { ok: true, gacha: estadoGachaPanel() };
    case 'gachaSondear':
      await sondear();
      return { ok: true, gacha: estadoGachaPanel() };
    case 'gachaRegalar': {
      const cantidad = Math.round(Number(d.cantidad));
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) return { ok: false, error: 'La cantidad tiene que estar entre 1 y 20 sobres' };
      let u = buscarUsuario(d.usuario);
      if (!u && twitchActivo()) {
        const t = await usuarioPorNombre(d.usuario).catch(() => null);
        if (t) u = { id: t.id, nombre: t.display_name };
      }
      if (!u) return { ok: false, error: `No encuentro a «${d.usuario}»: tiene que haber entrado ya en el gachapon${twitchActivo() ? ' o existir en Twitch' : ''}` };
      await darSobres({ id: u.id, nombre: u.nombre }, cantidad, 'regalo', d.motivo || 'Regalo del staff');
      return { ok: true, nombre: u.nombre, gacha: estadoGachaPanel() };
    }
    case 'sortear': {
      const cal = await sortearCalendario(d.participantes || [], d.semilla);
      return { ok: true, semilla: cal.semilla };
    }
    case 'probarHoja':
      await cargar().catch(() => {});
      estado.hoja = estadoHoja();
      return { ok: estado.hoja.ok, error: estado.hoja.ok ? null : (estado.hoja.error || 'Google Sheets no está configurado') };
    case 'limpiarAviso':
      estado.aviso = null;
      break;
    case 'partidaPrueba':
      if (d.activa) {
        empezarPrueba({ picks: estado.draft.picks, jugadores: { azul: estado.equipos.azul.jugadores, rojo: estado.equipos.rojo.jugadores } }, emitirPartida);
      } else {
        // Al pararla queda su pantalla final, para verla en el overlay
        if (fotoViva?.prueba) cerrarPartida();
        pararPrueba();
        emitirPartida();
      }
      return { ok: true, prueba: enPrueba() };
    case 'partidaVisible':
      estado.partidaVisible = Boolean(d.visible);
      break;
    case 'buscarPartida':
      estado.buscarPartida.activa = Boolean(d.activa);
      busquedaTocada = true;
      break;
    case 'buscarAlAcabarDraft':
      estado.buscarPartida.alAcabarDraft = Boolean(d.activa);
      break;
    case 'grafico': {
      const tipo = ['lineas', 'ficha', 'oro'].includes(d.tipo) ? d.tipo : null;
      // La ficha lleva de quién es: el lado y el puesto (0-4) del enfrentamiento
      const extra = tipo === 'ficha' ? { lado: ['azul', 'rojo'].includes(d.lado) ? d.lado : null, indice: Number(d.indice) } : {};
      if (tipo === 'ficha' && (!extra.lado || !(extra.indice >= 0 && extra.indice <= 4))) return { ok: false, error: 'Elige el clan y el jugador de la ficha' };
      ponerGrafico(tipo, Math.min(300, Math.max(0, Math.round(Number(d.segundos) || 0))), extra);
      break;
    }
    case 'avisosPropios':
      estado.avisosPropios = Boolean(d.activos);
      break;
    case 'ingame': {
      if (['a', 'b'].includes(d.estilo)) estado.ingame.estilo = d.estilo;
      for (const k of ['puntosFantasy', 'resumenPelea', 'oroIngresos']) if (typeof d[k] === 'boolean') estado.ingame[k] = d[k];
      // Las cámaras de los casters: la lista de las dos, cada una con lo que cambie (activarla, o su nombre y su detalle)
      if (Array.isArray(d.camaras)) estado.ingame.camaras = estado.ingame.camaras.map((c, i) => camaraLineas(d.camaras[i], c));
      ajustarIngame(estado.ingame);
      emitirPartida();  // el oro cambia al momento si se toca el interruptor de los ingresos
      break;
    }
    // Dragones, heraldo y Barón marcados a mano (el cliente no se los da a los espectadores)
    case 'marcarObjetivo':
      if (!marcarObjetivo(d)) return { ok: false, error: 'Objetivo no válido' };
      emitirPartida();
      break;
    case 'deshacerObjetivo':
      if (!deshacerMarca()) return { ok: false, error: 'No hay ninguna marca que deshacer' };
      emitirPartida();
      break;
    case 'partidaOlvidar':
      pararPrueba();
      fotoViva = null;
      estado.vista.enPartida = false;
      emitirPartida(olvidarPartida());
      break;
    default:
      return { ok: false, error: `Acción desconocida: ${nombre}` };
  }
  return { ok: true };
}

// ---------- gachapon y sesiones (Discord; Twitch solo para los puntos del canal) ----------
const EN_RENDER = Boolean(process.env.RENDER);
const loginActivo = () => loginDiscordActivo() || !EN_RENDER; // en local se puede entrar sin Discord para probar
const origen = req => `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
const usuarioDeSesion = req => verificar(leerCookies(req).tk_sesion);
// A dónde volver tras entrar: solo rutas de esta web. «//sitio.com» y «/\sitio.com» los toman los navegadores por otro sitio
const volverSeguro = v => (/^\/(?![/\\])/.test(v || '') ? v : '/gachapon/');

function estadoGachaPanel() {
  return { login: loginDiscordActivo(), canal: estadoCanal(), resumen: resumenGacha(), probabilidades: probabilidades(), cerrado: infoFantasy(null).cerrado,
    codigo: estadoCodigo(), jornadas: estadoJornadas(), publicarDiscord: discordActivo('clasificacion') };
}

function infoGacha(u) {
  const c = estadoCanal();
  return {
    activo: loginActivo(), discord: loginDiscordActivo(), twitch: twitchActivo(), canal: CANAL,
    cartasPorSobre: CARTAS_POR_SOBRE, sobresIniciales: SOBRES_INICIALES, repetidasPorSobre: REPETIDAS_POR_SOBRE, pesos: PESOS,
    probabilidades: probabilidades(), probabilidadLegacy: PROBABILIDAD_LEGACY,
    catalogo: catalogo().map(({ peso, ...carta }) => carta),
    publicarDiscord: discordActivo('coleccion'),
    reverso: reversoCarta(),
    recompensa: c.conectado && c.recompensa ? { titulo: c.titulo, coste: c.coste } : null,
    usuario: u ? { nombre: u.nombre, avatar: u.avatar || null, ...estadoUsuario(u.id) } : null,
  };
}

function leerCuerpo(req, limite = 1e5) {
  return new Promise((ok, mal) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > limite) { mal(new Error('Petición demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { mal(new Error('Petición no válida')); } });
    req.on('error', mal);
  });
}

function json(res, datos, codigo = 200) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
  return true;
}

function redirigir(res, destino) {
  res.writeHead(302, { Location: destino });
  res.end();
  return true;
}

const escaparHTML = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Página mínima para contar el resultado de conectar el canal o de entrar; el enlace de salida es el panel salvo que se diga otro
function paginaAviso(res, titulo, texto, codigo = 200, enlace = ['/panel/', 'Volver al panel']) {
  res.writeHead(codigo, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>
<link rel="stylesheet" href="/marca.css"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:var(--sumi);color:var(--washi);font-family:var(--gothic);padding:24px">
<main style="max-width:32em"><h1 style="font-family:var(--mincho);font-weight:800">${titulo}</h1><p style="color:var(--hai);font-size:18px">${texto}</p><p><a href="${enlace[0]}" style="color:var(--washi)">${enlace[1]}</a></p></main></body></html>`);
  return true;
}
const aGachapon = ['/gachapon/', 'Volver al gachapon'];

async function rutasSesion(req, res, url) {
  const p = url.pathname;

  // ---------- Discord: el inicio de sesión de los espectadores ----------
  if (p === '/auth/discord') {
    if (!loginActivo()) return paginaAviso(res, 'Muy pronto', 'El inicio de sesión con Discord aún no está configurado.', 503, aGachapon);
    if (!loginDiscordActivo()) return redirigir(res, '/auth/prueba');
    const state = crypto.randomBytes(16).toString('hex');
    ponerCookie(res, 'tk_oauth', firmar({ state, tipo: 'login', volver: volverSeguro(url.searchParams.get('volver')) }, 600), 600, req);
    return redirigir(res, urlAutorizarDiscord({ redirect: `${origen(req)}/auth/discord/callback`, state }));
  }

  if (p === '/auth/discord/callback') {
    const guardado = verificar(leerCookies(req).tk_oauth);
    ponerCookie(res, 'tk_oauth', '', 0, req);
    if (!loginDiscordActivo() || !guardado || guardado.state !== url.searchParams.get('state')) {
      return paginaAviso(res, 'No se pudo entrar', 'La petición a Discord caducó o no es válida. Vuelve a intentarlo.', 400, aGachapon);
    }
    if (url.searchParams.get('error')) return redirigir(res, volverSeguro(guardado.volver));   // pulsó «Cancelar»
    let sesion;
    try {
      sesion = await sesionDeDiscord(url.searchParams.get('code'), `${origen(req)}/auth/discord/callback`);
    } catch (e) {
      console.error('Inicio de sesión con Discord:', e.message);
      return paginaAviso(res, 'No se pudo entrar', `Discord no ha aceptado el inicio de sesión (${escaparHTML(e.message)}). Vuelve a intentarlo.`, 502, aGachapon);
    }
    try {
      await darAlta(sesion);
    } catch (e) {
      console.error('Alta en el gachapon:', e.message);
      return paginaAviso(res, 'No se pudo entrar', 'No se ha podido guardar tu cuenta ahora mismo. Vuelve a intentarlo en un momento.', 500, aGachapon);
    }
    ponerCookie(res, 'tk_sesion', firmar(sesion, 30 * 86400), 30 * 86400, req);
    return redirigir(res, volverSeguro(guardado.volver));
  }

  // ---------- Twitch: solo si se configura la app; los puntos del canal llegan a las cuentas entradas con Twitch ----------
  if (p === '/auth/twitch') {
    if (!twitchActivo()) return paginaAviso(res, 'No disponible', 'El inicio de sesión con Twitch no está activo. Entra con Discord.', 503, aGachapon);
    const state = crypto.randomBytes(16).toString('hex');
    ponerCookie(res, 'tk_oauth', firmar({ state, tipo: 'login', volver: volverSeguro(url.searchParams.get('volver')) }, 600), 600, req);
    return redirigir(res, urlAutorizar({ redirect: `${origen(req)}/auth/twitch/callback`, state }));
  }

  if (p === '/auth/canal') {
    if (!verificar(url.searchParams.get('t'))?.canal) return paginaAviso(res, 'Enlace caducado', 'Vuelve a pulsar «Conectar el canal de Twitch» en el panel.', 403);
    const state = crypto.randomBytes(16).toString('hex');
    ponerCookie(res, 'tk_oauth', firmar({ state, tipo: 'canal' }, 600), 600, req);
    return redirigir(res, urlAutorizar({ redirect: `${origen(req)}/auth/twitch/callback`, state, scope: SCOPE_CANAL }));
  }

  if (p === '/auth/twitch/callback') {
    const guardado = verificar(leerCookies(req).tk_oauth);
    ponerCookie(res, 'tk_oauth', '', 0, req);
    if (!guardado || guardado.state !== url.searchParams.get('state')) return paginaAviso(res, 'No se pudo entrar', 'La petición a Twitch caducó o no es válida. Vuelve a intentarlo.', 400);
    if (url.searchParams.get('error')) return redirigir(res, guardado.tipo === 'canal' ? '/panel/' : guardado.volver || '/gachapon/');
    try {
      const t = await canjearCodigo(url.searchParams.get('code'), `${origen(req)}/auth/twitch/callback`);
      const u = await usuarioDeToken(t.access_token);
      if (guardado.tipo === 'canal') {
        await conectarCanal(t, u);
        const c = estadoCanal();
        return paginaAviso(res, 'Canal conectado', c.error ? `El canal ${u.display_name} está conectado, pero: ${c.error}` : `La recompensa «${c.titulo}» ya está en el canal de ${u.display_name}, a ${c.coste} puntos. Ya puedes cerrar esta pestaña.`);
      }
      const sesion = { id: u.id, nombre: u.display_name, avatar: u.profile_image_url };
      await darAlta(sesion);
      ponerCookie(res, 'tk_sesion', firmar(sesion, 30 * 86400), 30 * 86400, req);
      return redirigir(res, guardado.volver || '/gachapon/');
    } catch (e) {
      console.error(e);
      return paginaAviso(res, 'No se pudo entrar', e.message, 500);
    }
  }

  // Solo en local: entrar sin Twitch para probar el gachapon
  if (p === '/auth/prueba' && !EN_RENDER) {
    const nombre = (url.searchParams.get('nombre') || 'Probador').slice(0, 25);
    const sesion = { id: `prueba-${nombre.toLowerCase()}`, nombre, avatar: null };
    await darAlta(sesion);
    ponerCookie(res, 'tk_sesion', firmar(sesion, 86400), 86400, req);
    return redirigir(res, '/gachapon/');
  }

  if (p === '/auth/salir' && req.method === 'POST') {
    ponerCookie(res, 'tk_sesion', '', 0, req);
    return json(res, { ok: true });
  }

  if (p === '/api/gacha') {
    const u = usuarioDeSesion(req);
    if (u) sondearSiHaceFalta();
    return json(res, infoGacha(u));
  }

  if (p === '/api/gacha/abrir' && req.method === 'POST') {
    const u = usuarioDeSesion(req);
    if (!u) return json(res, { ok: false, error: 'Entra con tu cuenta de Discord para abrir sobres' }, 401);
    try {
      const sobre = await abrirSobre(u);
      return json(res, { ok: true, sobre, usuario: { nombre: u.nombre, avatar: u.avatar || null, ...estadoUsuario(u.id) } });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }

  const estadoDe = u => ({ nombre: u.nombre, avatar: u.avatar || null, ...estadoUsuario(u.id) });

  // Código de directo: el que sale en el overlay durante el directo
  if (p === '/api/gacha/canjear' && req.method === 'POST') {
    const u = usuarioDeSesion(req);
    if (!u) return json(res, { ok: false, error: 'Entra con tu cuenta de Discord para canjear el código' }, 401);
    try {
      const { codigo } = await leerCuerpo(req);
      const r = await canjearCodigoDirecto(u, codigo);
      emitir();   // si el código se ha agotado, se retira del overlay
      return json(res, { ok: true, sobres: r.sobres, usuario: estadoDe(u) });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }

  // Fundir repetidas: cada 5 copias que sobran se cambian por un sobre. Las BOOST que están en la alineación no se tocan
  if (p === '/api/gacha/fundir' && req.method === 'POST') {
    const u = usuarioDeSesion(req);
    if (!u) return json(res, { ok: false, error: 'Entra con tu cuenta de Discord para fundir cartas' }, 401);
    try {
      const { cartas } = await leerCuerpo(req);
      const enUso = (infoFantasy(u).yo?.alineacion?.boosts || []).filter(Boolean).map(b => b.carta);
      const r = await fundirRepetidas(u, cartas, id => enUso.filter(x => x === id).length);
      return json(res, { ok: true, ...r, usuario: estadoDe(u) });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }

  if (p === '/api/tierlist') return json(res, vistaTierlist());

  if (p === '/api/fantasy') return json(res, { ...infoFantasy(usuarioDeSesion(req)), premios: premiosPublicos(), sobresPremio: estado.jornadaAuto.premios });

  // Publicar en el canal de Discord la imagen que dibuja la página: la colección o la alineación del que ha
  // entrado, o la tier list (el staff, con la contraseña del panel). El texto lo pone discord.js con estos datos
  if (p === '/api/discord/publicar' && req.method === 'POST') {
    const tipo = url.searchParams.get('tipo'), u = usuarioDeSesion(req);
    const yo = tipo === 'alineacion' && u ? infoFantasy(u).yo : null;
    // La clasificación de una jornada: sus tres primeros, con los sobres si ya está cerrada
    const jornada = url.searchParams.get('jornada') || '';
    const ganadores = tipo === 'clasificacion' ? jornadasCerradas()[jornada]?.ganadores || clasificacionJornada(jornada).slice(0, 3) : [];
    const r = await atenderPublicacion({
      tipo, req, usuario: u, staff: req.headers['x-clave-panel'] === CLAVE,
      datos: tipo === 'clasificacion' ? { jornada, ganadores }
        : tipo === 'coleccion' && u ? { tiene: estadoUsuario(u.id).cartas.length, total: catalogo().length } : yo ? { puntos: yo.puntos, puesto: yo.puesto } : {},
      avatar: `${origen(req)}/marca/tenka-ichi-cuadro.png`, enlace: `${origen(req)}/gachapon/`,
    });
    return json(res, r.cuerpo, r.estado);
  }

  if (p === '/api/fantasy/alineacion' && req.method === 'POST') {
    const u = usuarioDeSesion(req);
    if (!u) return json(res, { ok: false, error: 'Entra con tu cuenta de Discord para alinear' }, 401);
    try {
      const slots = await leerCuerpo(req);
      return json(res, { ok: true, alineacion: await cambiarAlineacion(u, slots) });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }
  return false;
}

// ---------- servidor HTTP estático ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };

// Huella de cada archivo (por su contenido, así no cambia con cada despliegue): el navegador pregunta con ella y,
// si el archivo es el mismo, no se vuelve a mandar. Se calcula una vez y se rehace si el archivo cambia
const huellas = new Map();
async function huella(archivo, s) {
  const h = huellas.get(archivo);
  if (h && h.mtimeMs === s.mtimeMs && h.size === s.size) return { etag: h.etag, datos: null };
  const datos = await readFile(archivo);
  const etag = `"${crypto.createHash('sha1').update(datos).digest('base64url').slice(0, 20)}"`;
  huellas.set(archivo, { mtimeMs: s.mtimeMs, size: s.size, etag });
  return { etag, datos };
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rutaSesion = url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/gacha') || url.pathname.startsWith('/api/fantasy') || url.pathname === '/api/tierlist'
    || url.pathname.startsWith('/api/discord');
  try {
    if (rutaSesion && await rutasSesion(req, res, url)) return;
  } catch (e) {
    console.error(url.pathname, e);
    if (!res.headersSent) return json(res, { ok: false, error: 'Algo ha fallado en la web: prueba otra vez' }, 500);
    return;
  }
  if (url.pathname === '/api/clanes') {
    await refrescarPlantillas();
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ clanes: clanesConPlantilla(), roles: ROLES }));
  }
  const sim = url.searchParams.has('simulacion') ? temporadaSimulada() : null;
  if (url.pathname === '/api/liga') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify(sim ? { ...statsLiga({ partidas: sim.partidas }), simulacion: true } : statsLiga()));
  }
  if (url.pathname === '/api/competicion') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    const datos = sim ? competicion(sim.calendario, sim.partidas) : competicion(calendarioActual(), todas());
    return res.end(JSON.stringify({ ...datos, simulacion: Boolean(sim) }));
  }
  // El postdraft del overlay: lo que lleva cada jugador con su campeón y en general, su carta y los dos clanes
  if (url.pathname === '/api/previa') return json(res, previa(estado, sim ? { partidas: sim.partidas, filas: [] } : undefined));
  // Fichas de la web: un jugador (por su puesto, CLAN-ROL) con su carta y sus números, y un clan
  if (url.pathname === '/api/jugador' || url.pathname === '/api/clan') {
    const ficha = (url.pathname === '/api/jugador' ? fichaJugador : fichaClan)(url.searchParams.get('id') || '');
    return ficha ? json(res, ficha) : json(res, { error: 'No existe' }, 404);
  }
  if (url.pathname === '/api/diagnostico') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ hoja: estadoHoja() }));
  }
  if (url.pathname === '/salud') { res.writeHead(200); return res.end('ok'); }
  // El puente del PC del espectador manda aquí la partida cada segundo (con la contraseña del panel)
  if (url.pathname === '/api/partida') {
    if (req.method === 'GET') return json(res, resumenPartida());
    if (req.method !== 'POST') return json(res, { ok: false, error: 'Método no permitido' }, 405);
    if (req.headers['x-clave'] !== CLAVE) return json(res, { ok: false, error: 'Contraseña incorrecta' }, 401);
    try {
      const cuerpo = await leerCuerpo(req, 3e6);
      if (enPrueba() && !cuerpo.sinPartida) pararPrueba();  // llega una partida de verdad: fuera la prueba
      // El puente sigue con una partida que ya estaba mandando antes de que la web se reiniciara
      if (cuerpo.continua && !cuerpo.sinPartida && !busquedaTocada && !estado.buscarPartida.activa) {
        estado.buscarPartida.activa = true;
        emitir();
      }
      const partida = recibirPartida(cuerpo);
      // La partida que se buscaba ha terminado y el cliente ya la ha cerrado: se deja de buscar
      // (al acabar el siguiente draft vuelve a buscar sola)
      if (cuerpo.sinPartida && partida.terminada && !partida.prueba && estado.buscarPartida.activa && partida.numero !== numeroDesarmado) {
        numeroDesarmado = partida.numero;
        estado.buscarPartida.activa = false;
        ponerGrafico(null);  // el línea por línea no pasa a la siguiente partida
        emitir();
      }
      // También los latidos: así el panel sabe si el puente está abierto y si está buscando
      emitirPartida(partida);
      return json(res, { ok: true, sesion: SESION, tiempo: partida.tiempo, buscar: estado.buscarPartida.activa, ocultarMarcador: estado.partidaVisible,
        reenviar: Boolean(partida.reenviar), sinReconocer: partida.eventosSinReconocer });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }
  // El puente, comprimido al vuelo con lo que hay en puente/ para que la descarga no se quede atrás
  if (url.pathname === '/puente/puente-tenka-ichi.zip') {
    try {
      zipPuente ??= crearZip(await Promise.all(ARCHIVOS_PUENTE.map(async nombre => {
        const ruta = path.join(PUENTE, nombre);
        // Son archivos para Windows: saltos de línea CRLF, venga el repositorio como venga
        const texto = (await readFile(ruta, 'utf8')).replace(/\r?\n/g, '\r\n');
        return { nombre, datos: Buffer.from(texto, 'utf8'), fecha: (await stat(ruta)).mtime };
      })));
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="puente-tenka-ichi.zip"', 'Cache-Control': 'no-cache' });
      return res.end(zipPuente);
    } catch (e) {
      console.error('Zip del puente:', e.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No se ha podido preparar el puente');
    }
  }
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  // Los dibujos de las cartas salen de su carpeta, que en las pruebas y la vista previa es otra (CARPETA_CARTAS)
  const [raiz, relativa] = ruta.startsWith('/cartas/') ? [CARPETA_ARTE, ruta.slice('/cartas'.length)] : [PUBLICO, ruta];
  const archivo = path.join(raiz, path.normalize(relativa));
  if (!archivo.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(archivo);
    if (s.isDirectory()) { res.writeHead(302, { Location: `${url.pathname}/` }); return res.end(); }
    const { etag, datos } = await huella(archivo, s);
    // Las imágenes se guardan un día (y después se sirven de la caché mientras se comprueba si han cambiado). El arte
    // de las cartas se pide con ?v=fecha del archivo: si cambia el dibujo, cambia la dirección. Las páginas, los
    // estilos y el código se comprueban siempre, pero solo se vuelven a bajar si han cambiado (ETag)
    const cache = ruta.startsWith('/cartas/') && url.searchParams.has('v') ? 'public, max-age=31536000, immutable'
      : /\/(ddragon|logos|marca|clanes|cartas)\//.test(ruta) ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache';
    // (el proxy de Render comprime y devuelve la huella como «débil», W/"…": se compara sin esa marca)
    const pedidas = String(req.headers['if-none-match'] || '').split(',').map(h => h.trim().replace(/^W\//, ''));
    if (pedidas.includes(etag)) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': cache, ETag: etag });
    res.end(datos || await readFile(archivo));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

const wss = new WebSocketServer({ server: servidor, path: '/ws' });
wss.on('connection', ws => {
  clientes.add(ws);
  ws.send(JSON.stringify({ tipo: 'hola', version: VERSION }));
  ws.send(JSON.stringify({ tipo: 'estado', estado }));
  ws.send(JSON.stringify({ tipo: 'partida', partida: resumenPartida() }));
  ws.on('close', () => clientes.delete(ws));
  ws.on('message', async raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.tipo !== 'accion') return;
    if (m.clave !== CLAVE) return ws.send(JSON.stringify({ tipo: 'respuesta', id: m.id, ok: false, error: 'Contraseña incorrecta' }));
    try {
      const r = await accion(m.accion, m.datos);
      ws.send(JSON.stringify({ tipo: 'respuesta', id: m.id, ...r }));
      emitir();
    } catch (e) {
      console.error(e);
      ws.send(JSON.stringify({ tipo: 'respuesta', id: m.id, ok: false, error: e.message }));
    }
  });
});

// Mantiene vivas las conexiones (Render corta las que están inactivas)
setInterval(() => { for (const ws of clientes) if (ws.readyState === 1) ws.ping(); }, 25000);

await Promise.all([cargar(), cargarPlantillas(), cargarCalendario(), cargarAjustes()]);
await Promise.all([cargarTierlist(), cargarGacha()]);
await cargarFantasy();
await cargarPartida();
await cargarCanal().catch(e => console.error('Canal de Twitch:', e.message));
estado.hoja = estadoHoja();
estado.fantasy.cerrado = alineacionesCerradas();
// Lo que el panel tenía puesto antes del reinicio (y, si estaba conectado a DraftCore, se vuelve a conectar)
const guardado = restaurarEstado(estado);
ajustarIngame(estado.ingame);
if (guardado.restaurado) {
  if (draftCompleto(estado.draft)) draftCompletoDesde = 1;
  busquedaTocada = Boolean(guardado.reciente);
  estadoYaGuardado(fotoActual);
  if (guardado.enlace) { conectarDraftCore(guardado.enlace); quiereDraftCore = Boolean(estado.fuente.codigo); }
  actualizarVista();
  console.log(`Estado del panel recuperado: ${estado.config.jornada}, ${estado.equipos.azul.clan} vs ${estado.equipos.rojo.clan}`);
}
// Al apagarse (una actualización en Render), se guarda lo que estuviera pendiente
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.once(senal, async () => {
    await Promise.race([guardarEstadoYa(), new Promise(r => setTimeout(r, 4000))]).catch(() => {});
    process.exit(0);
  });
}
servidor.listen(PUERTO, () => {
  console.log(`TENKA ICHI Draft en http://localhost:${PUERTO}`);
  console.log(`  Panel:   http://localhost:${PUERTO}/panel/`);
  console.log(`  Overlay: http://localhost:${PUERTO}/overlay/`);
});
