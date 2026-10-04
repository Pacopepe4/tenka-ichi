// Lo que el panel tiene puesto (enfrentamiento, equipos, draft, cámaras, qué enseña el overlay, la pantalla final…)
// se guarda en los ajustes: si la web se reinicia en plena jornada (una actualización, Render que la despierta),
// vuelve tal como estaba en lugar de empezar de cero.
import { ajuste, guardarAjustes } from './ajustes.js';

const CLAVE = 'estado_panel';
const ESPERA_MS = 3000;            // lo que cambie en este rato va en una sola escritura
// La búsqueda de la partida y la vista del overlay solo vuelven si el reinicio pilla la jornada en marcha
const RECIENTE_MS = 6 * 3600 * 1000;

// La parte del estado que merece la pena guardar (ni el aviso del último pick, ni el temporizador, ni la hoja)
export function fotoEstado(e, { draftcore = false } = {}) {
  return {
    config: e.config, equipos: e.equipos, enlace: draftcore ? e.fuente.enlace : '',
    draft: { bans: e.draft.bans, picks: e.draft.picks }, fearless: e.fearless, resultados: e.resultados,
    camaras: e.camaras, partidaVisible: e.partidaVisible, buscarPartida: e.buscarPartida, avisosPropios: e.avisosPropios,
    vista: e.vista, final: e.final, jornadaAuto: e.jornadaAuto,
  };
}

const esLista = (v, n) => Array.isArray(v) && v.length === n;
const lados = (v, valido) => Boolean(v) && ['azul', 'rojo'].every(l => valido(v[l]));

// Pone en el estado lo guardado, comprobando la forma de cada parte (puede venir de una versión anterior).
// Devuelve el enlace de DraftCore al que hay que volver a conectarse, si lo había
export function restaurarEstado(e, texto = ajuste(CLAVE), ahora = Date.now()) {
  let g;
  try { g = JSON.parse(texto || 'null'); } catch { g = null; }
  if (!g || typeof g !== 'object') return { restaurado: false, enlace: '' };
  const reciente = ahora - (Number(g.cuando) || 0) < RECIENTE_MS;

  if (g.config && typeof g.config === 'object') {
    for (const k of ['jornada', 'fase', 'formato']) if (typeof g.config[k] === 'string') e.config[k] = g.config[k];
    for (const k of ['serie', 'partida']) if (Number.isInteger(g.config[k])) e.config[k] = g.config[k];
  }
  if (lados(g.equipos, x => x && typeof x.clan === 'string' && esLista(x.jugadores, 5))) {
    for (const l of ['azul', 'rojo']) e.equipos[l] = { clan: g.equipos[l].clan, jugadores: g.equipos[l].jugadores.map(j => String(j || '')) };
  }
  for (const tipo of ['bans', 'picks']) {
    if (lados(g.draft?.[tipo], x => esLista(x, 5))) for (const l of ['azul', 'rojo']) e.draft[tipo][l] = g.draft[tipo][l].map(c => (c ? String(c) : null));
  }
  if (Array.isArray(g.fearless)) e.fearless = g.fearless.map(String);
  if (Array.isArray(g.resultados)) e.resultados = g.resultados.filter(r => r && ['azul', 'rojo'].includes(r.ganador));
  if (Number.isInteger(g.camaras?.cantidad) && esLista(g.camaras?.lista, 4)) {
    e.camaras = { cantidad: Math.max(0, Math.min(4, g.camaras.cantidad)),
      lista: g.camaras.lista.map(c => ({ tipo: String(c?.tipo || 'caster'), nombre: String(c?.nombre || ''), detalle: String(c?.detalle || '') })) };
  }
  if (typeof g.partidaVisible === 'boolean') e.partidaVisible = g.partidaVisible;
  if (typeof g.avisosPropios === 'boolean') e.avisosPropios = g.avisosPropios;
  if (typeof g.buscarPartida?.alAcabarDraft === 'boolean') e.buscarPartida.alAcabarDraft = g.buscarPartida.alAcabarDraft;
  if (g.jornadaAuto && typeof g.jornadaAuto === 'object') {
    if (typeof g.jornadaAuto.cerrar === 'boolean') e.jornadaAuto.cerrar = g.jornadaAuto.cerrar;
    if (esLista(g.jornadaAuto.premios, 3)) e.jornadaAuto.premios = g.jornadaAuto.premios.map(n => Math.max(0, Math.min(20, Math.round(Number(n) || 0))));
    if (typeof g.jornadaAuto.cerradaPara === 'string') e.jornadaAuto.cerradaPara = g.jornadaAuto.cerradaPara;
  }
  if (g.final && typeof g.final === 'object' && Array.isArray(g.final.lineas)) e.final = g.final;
  if (reciente) {
    if (typeof g.buscarPartida?.activa === 'boolean') e.buscarPartida.activa = g.buscarPartida.activa;
    if (g.vista && typeof g.vista === 'object') {
      e.vista.forzada = ['draft', 'postdraft', 'partida', 'final'].includes(g.vista.forzada) ? g.vista.forzada : null;
      e.vista.enPartida = Boolean(g.vista.enPartida);
    }
  }
  return { restaurado: true, reciente, enlace: typeof g.enlace === 'string' ? g.enlace : '' };
}

// Guardado con una pequeña espera y solo si algo ha cambiado. foto() devuelve lo que hay que guardar ahora
let ultimo = null, temporizador = null, tomar = null;
async function guardarAhora() {
  clearTimeout(temporizador);
  temporizador = null;
  if (!tomar) return;
  const texto = JSON.stringify(tomar());
  if (texto === ultimo) return;
  const anterior = ultimo;
  ultimo = texto;
  try { await guardarAjustes({ [CLAVE]: JSON.stringify({ cuando: Date.now(), ...JSON.parse(texto) }) }); }
  catch (e) { ultimo = anterior; console.error('No se pudo guardar el estado del panel:', e.message); }
}

export function guardarEstadoSiCambia(foto) {
  tomar = foto;
  if (temporizador || JSON.stringify(foto()) === ultimo) return;
  temporizador = setTimeout(guardarAhora, ESPERA_MS);
  temporizador.unref?.();
}

// Lo que haya pendiente, ya (al apagarse la web)
export const guardarEstadoYa = () => guardarAhora();

// Para que el estado recién restaurado no se vuelva a escribir tal cual
export function estadoYaGuardado(foto) { ultimo = JSON.stringify(foto()); }
