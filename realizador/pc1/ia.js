// Modo IA del PC 1 (opcional). Claude ayuda al realizador en lo que no es mecánico:
//  - Cada «cadaSegundos» (25) recibe un resumen de la partida y dice qué poner en el overlay en el próximo rato
//    tranquilo (gráfica de oro, ficha de quien va en racha o dejar el línea por línea porque se prepara una pelea)
//    y, si quiere, un titular.
//  - Si acaban varias jugadas a la vez que merecen repetición, elige cuál se repite.
//  - Al acabar la partida escribe un resumen.
// La cámara, las repeticiones, los cortes y las transiciones siguen siendo reglas (pc1/cerebro.js). Si la IA no
// contesta, falla o no hay clave, el realizador hace lo de siempre.
//
// La clave de la API se lee de un archivo de este PC (Documentos\realizado, o el que diga ia.archivoClave) y
// solo sale de aquí hacia la API de Anthropic. No se apunta en el registro, ni va al PC 2, ni al panel de Gokudō.
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { RAIZ } from '../comun/opciones.js';
import { herramientas, limitesDe, LimitesIa } from './ia-limites.js';
import { contextoTurno } from './ia-contexto.js';

export const MODELOS = { normal: 'claude-sonnet-5-5', rapido: 'claude-haiku-5-5' };
export const NOMBRE_MODELO = { 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };

// ---------- la clave ----------

// Carpeta Documentos de verdad (en Windows puede estar movida a otra unidad o a OneDrive)
function documentos() {
  const r = [];
  if (process.platform === 'win32') {
    try {
      const d = execFileSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8', timeout: 8000 }).trim();
      if (d) r.push(d);
    } catch { /* sin PowerShell: se prueban las de siempre */ }
  }
  const casa = homedir();
  r.push(join(casa, 'Documents'), join(casa, 'Documentos'), join(casa, 'OneDrive', 'Documents'), join(casa, 'OneDrive', 'Documentos'));
  return [...new Set(r)];
}

// Dónde se busca la clave, en orden
export function rutasClave(ia = {}, { carpetas = null } = {}) {
  const r = [];
  if (ia.archivoClave) r.push(ia.archivoClave);
  r.push(join(RAIZ, 'clave-ia.txt'));
  for (const d of carpetas || documentos()) {
    for (const n of ['realizado', 'realizado.txt', 'realizador', 'realizador.txt', 'realizado.txt.txt']) r.push(join(d, n));
  }
  return r;
}

// Saca la clave del texto del archivo (puede llevar más cosas escritas alrededor)
export function sacarClave(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const m = t.match(/sk-ant-[A-Za-z0-9_-]{20,}/);
  if (m) return m[0];
  const linea = t.split(/\r?\n/).map(x => x.trim()).find(x => x.length >= 20 && !/\s/.test(x));
  return linea || null;
}

export function leerClave(ia = {}, opciones = {}) {
  for (const ruta of rutasClave(ia, opciones)) {
    try {
      if (!existsSync(ruta)) continue;
      const clave = sacarClave(readFileSync(ruta, 'utf8'));
      if (clave) return { clave, ruta };
    } catch { /* sin permiso o no es un archivo: la siguiente */ }
  }
  return null;
}

// Quita cualquier clave de un texto antes de enseñarlo o apuntarlo
export function ocultar(texto, clave) {
  let s = String(texto ?? '');
  if (clave) s = s.split(clave).join('[clave]');
  return s.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[clave]');
}

// Por qué no hay conexión, en palabras: lo que más pasa es un antivirus que revisa las conexiones seguras
// (certificado que Node no conoce), un firewall que no deja salir a node.exe o un PC sin internet
export function causaConexion(e) {
  const c = e?.cause;
  const codigo = c?.code || c?.cause?.code || '';
  const texto = `${codigo} ${c?.message || ''} ${c?.cause?.message || ''}`;
  if (/CERT|certificate|SELF_SIGNED|UNABLE_TO_VERIFY|issuer/i.test(texto)) return ' (certificado no reconocido: seguramente el antivirus revisa las conexiones seguras; abre el realizador con su .bat, que usa los certificados de Windows)';
  if (/ENOTFOUND|EAI_AGAIN/i.test(texto)) return ' (no encuentra api.anthropic.com: ¿hay internet?)';
  if (/ECONNREFUSED|ECONNRESET|EACCES|EPERM/i.test(texto)) return ` (${codigo || 'conexión cortada'}: puede ser el firewall o el antivirus bloqueando node.exe)`;
  if (/ETIMEDOUT|timed? ?out|UND_ERR_CONNECT_TIMEOUT/i.test(texto) || e?.name === 'APIConnectionTimeoutError') return ' (no contesta a tiempo: internet lento o bloqueado)';
  return codigo ? ` (${codigo})` : (c?.message ? ` (${String(c.message).slice(0, 80)})` : '');
}

// ---------- lo que se le cuenta a la IA ----------

const reloj = t => (t === null || t === undefined ? '--:--' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const NOMBRES_OBJETIVO = { DragonKill: 'dragón', BaronKill: 'Barón', HeraldKill: 'heraldo', HordeKill: 'larvas', AtakhanKill: 'Atakhan', DragonSoul: 'alma de dragón', TurretKilled: 'torre', InhibKilled: 'inhibidor' };

function equipoDe(jugadores, campeon) {
  return jugadores.find(j => j.campeon === campeon)?.equipo || null;
}

// Marcador hasta el segundo «hasta»: asesinatos y objetivos de cada equipo
export function marcador(cerebro, jugadores, hasta = Infinity) {
  const m = { azul: { asesinatos: 0, objetivos: [] }, rojo: { asesinatos: 0, objetivos: [] } };
  const vistos = new Set();
  for (const j of cerebro.jugadas) {
    for (const e of j.eventos) {
      if (e.t > hasta || (e.id && vistos.has(e.id))) continue;
      if (e.id) vistos.add(e.id);
      const eq = equipoDe(jugadores, e.asesino);
      if (e.nombre === 'ChampionKill') {
        const otro = eq || ({ azul: 'rojo', rojo: 'azul' })[equipoDe(jugadores, e.victima)];
        if (m[otro]) m[otro].asesinatos++;
      } else if (NOMBRES_OBJETIVO[e.nombre] && m[eq]) m[eq].objetivos.push(NOMBRES_OBJETIVO[e.nombre]);
    }
  }
  return m;
}

function jugadaCorta(j, tA) {
  return {
    id: j.id,
    tipo: j.tipo,
    desde: reloj(j.inicio),
    hasta: reloj(j.fin),
    yaEmitida: tA !== null && j.fin <= tA,
    aunNoSeVe: tA !== null && j.inicio > tA,
    muertes: j.muertes,
    objetivos: j.objetivos.map(o => NOMBRES_OBJETIVO[o] || o),
    campeones: Object.keys(j.campeones),
    sucesos: j.eventos.slice(0, 12).map(e => `${reloj(e.t)} ${e.nombre}${e.asesino ? ' de ' + e.asesino : ''}${e.victima ? ' a ' + e.victima : ''}`),
  };
}

// Ratos de al menos «minimo» segundos sin ninguna jugada entre a y b
export function huecos(cerebro, a, b, minimo = 20) {
  const ocupados = cerebro.jugadas.filter(j => j.fin > a && j.inicio < b).map(j => [j.inicio, j.fin]).sort((x, y) => x[0] - y[0]);
  const r = [];
  let t = a;
  for (const [i, f] of ocupados) {
    if (i - t >= minimo) r.push({ desde: reloj(t), hasta: reloj(i), segundos: Math.round(i - t) });
    t = Math.max(t, f);
  }
  if (b - t >= minimo) r.push({ desde: reloj(t), hasta: reloj(b), segundos: Math.round(b - t), sigueAbierto: true });
  return r;
}

export function resumenPartida({ cerebro, jugadores = [], tA, tD }) {
  const rachas = [...cerebro.rachas.entries()].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1])
    .map(([campeon, n]) => ({ campeon, equipo: equipoDe(jugadores, campeon), asesinatosSinMorir: n }));
  const ahora = tA ?? 0;
  const pasadas = cerebro.acciones.filter(a => a.t <= ahora && a.t > ahora - 400 && a.tipo !== 'repeticion')
    .map(a => `${reloj(a.t)} ${a.tipo === 'oro' ? 'gráfica de oro' : 'ficha de ' + a.campeon}`);
  const programadas = cerebro.acciones.filter(a => a.t > ahora)
    .map(a => `${reloj(a.t)} ${a.tipo === 'repeticion' ? 'repetición de ' + a.jugada : a.tipo === 'oro' ? 'gráfica de oro' : 'ficha de ' + a.campeon}`);
  return {
    emitiendoAhora: reloj(tA),
    sabemosHasta: reloj(tD),
    equipos: {
      azul: jugadores.filter(j => j.equipo === 'azul').map(j => `${j.campeon} (${j.jugador}${j.posicion ? ', ' + j.posicion : ''})`),
      rojo: jugadores.filter(j => j.equipo === 'rojo').map(j => `${j.campeon} (${j.jugador}${j.posicion ? ', ' + j.posicion : ''})`),
    },
    marcadorEnAntena: marcador(cerebro, jugadores, ahora),
    marcadorReal: marcador(cerebro, jugadores, tD ?? Infinity),
    rachas,
    jugadas: cerebro.jugadas.filter(j => j.fin > ahora - 150).slice(-12).map(j => jugadaCorta(j, tA)),
    ratosTranquilosPorEmitir: huecos(cerebro, ahora, tD ?? ahora),
    overlayReciente: pasadas,
    programado: programadas,
  };
}

// Resumen hecho por reglas: el que queda si la IA no está o falla
export function resumenReglas(cerebro, jugadores = [], tFin = null) {
  const m = marcador(cerebro, jugadores);
  const asesinos = new Map();
  for (const j of cerebro.jugadas) for (const e of j.eventos) if (e.nombre === 'ChampionKill' && e.asesino) asesinos.set(e.asesino, (asesinos.get(e.asesino) || 0) + 1);
  const mejor = [...asesinos.entries()].sort((a, b) => b[1] - a[1])[0];
  const peleas = cerebro.jugadas.filter(j => j.tipo === 'pelea').length;
  const lineas = [
    `Partida de ${reloj(tFin)}. Asesinatos: azul ${m.azul.asesinatos} - rojo ${m.rojo.asesinatos}.`,
    m.azul.objetivos.length ? `Objetivos del azul: ${m.azul.objetivos.join(', ')}.` : null,
    m.rojo.objetivos.length ? `Objetivos del rojo: ${m.rojo.objetivos.join(', ')}.` : null,
    mejor ? `Más asesinatos: ${mejor[0]} (${mejor[1]}).` : null,
    `${peleas} pelea${peleas === 1 ? '' : 's'} en grupo.`,
  ].filter(Boolean);
  return { titular: null, resumen: lineas.join(' '), hecho: 'reglas' };
}

// ---------- la conversación con Sonnet ----------
// Una conversación por partida: system prompt y herramientas fijos (mismo texto y orden en cada turno), mensajes que
// solo se añaden. Cada turno es UNA llamada: el mensaje del usuario lleva primero los tool_result de lo que pidió en
// el turno anterior (aceptada o rechazada con su motivo) y luego el contexto nuevo. La caché va con cache_control
// automático (y un punto fijo al final del system prompt). Si la IA falla, el turno no se apunta: lo que no llegó se
// vuelve a mandar en el siguiente, y mientras tanto el realizador sigue con sus reglas.

export function sistema(ia = {}) {
  const L = limitesDe(ia);
  return `Eres el productor de grafismos y repeticiones del directo de League of Legends de la liga de Gokudō. La emisión va unos 2 minutos por detrás de la partida: sabes lo que va a pasar antes que el público.

Un programa de reglas (el realizador) lleva la cámara, los cortes, las repeticiones normales y el overlay. Tú propones cambios con tus herramientas; el realizador comprueba cada uno y lo acepta o lo rechaza.

Qué puedes hacer
- programar_grafico: gráfica de oro, ficha de un jugador o reservar un rato para el línea por línea, de ${L.grafismos.minimoSegundos} a ${L.grafismos.maximoSegundos} s.
- pedir_repeticion: repetir una jugada acabada que las reglas no han repetido (repeticion "sin-hueco", "otra-elegida" o "no").
- seguir_jugador: llevar la cámara a un campeón en un rato muerto.
- elegir_repeticion: solo cuando el mensaje traiga "elegirRepeticion".
- Al acabar la partida: resumen_final y elegir_mvp.
No hace falta hacer algo en cada turno: si nada merece la pena, contesta "nada" sin herramientas. Pocas cosas y buenas.

Cuándo merece la pena
- oro: cuando la partida se decanta (asesinatos, objetivos o CS que se separan) o tras varios objetivos seguidos.
- ficha: alguien en racha clara o que está decidiendo la partida.
- lineas: para guardar limpio el rato justo antes de una pelea u objetivo que sabes que viene.
- seguir_jugador: en un rato muerto, quien va a protagonizar la próxima jugada conocida (llega antes que nadie, va a robar, viene de rotar), o quien va en racha. Mejor justo antes de esa jugada, sin pisarla.
- pedir_repeticion: una jugada que cambia la partida y se ha quedado sin repetición.

Lo que sale solo y no hay que pedir: el línea por línea de base, los sellos de objetivo, los avisos de primera sangre y multikill, la ficha automática de quien llega a una racha de 3, 5 u 8, la gráfica de oro de las reglas si llevas rato sin programar ninguna, las repeticiones de peleas grandes y objetivos, la visión de cada equipo y los recorridos del río.

Cómo leer cada mensaje
- Primero van los resultados de tus herramientas del turno anterior: "aceptada: …" o "rechazada: motivo". Si te rechazan algo, el motivo dice qué falla: corrige y vuelve a proponer solo si sigue teniendo sentido; no insistas con lo mismo.
- Después, un JSON. Todos los tiempos en segundos de partida.
  - reloj.antena: lo que ve el público. reloj.sabido: hasta dónde sabes. reloj.programable: [desde, hasta]; solo puedes programar dentro.
  - jugadasNuevas y jugadasCambiadas: solo lo nuevo desde el último mensaje; lo anterior ya lo tienes. estado: "emitida", "en antena" o "por emitir". repeticion: la de las reglas.
  - ratosTranquilos: tramos [desde, hasta] por emitir sin jugadas ni nada programado: ahí caben tus cosas.
  - programado: [segundo, qué, duración, de quién]. No lo pises.
  - cupo: cuántas te quedan ahora de cada cosa.
  - cs: CS por equipo (el oro no llega a este PC). objetivos.vistos: [segundo, objetivo, equipo].

Reglas
- No inventes: usa solo campeones, ids y tiempos que estén en los datos. Si falta un dato, no lo supongas.
- Los campeones, tal como salen en equipos.
- Español de España. Motivos de una frase.
- Resumen final: titular de 70 caracteres como mucho con tono de narrador; resumen de 3 a 5 frases para los casters con lo que decidió la partida; en destacadas, los ids de las candidatas que merecen el resumen en vídeo, en el orden en que deben salir (sin límite fijo; quita solo las que no aportan nada). MVP: quien más decidió la partida según los datos (KDA, objetivos, jugadas).`;
}

const estimar = x => Math.ceil(JSON.stringify(x).length / 3.5);

// La crónica se publica en la web y en Discord: con el nombre de cada familia, nunca «el azul / el rojo»
export function nombresFamilias(familias) {
  return familias?.azul || familias?.rojo
    ? ` Llama a cada equipo por el nombre de su familia (azul: ${familias.azul || '?'}, rojo: ${familias.rojo || '?'}), nunca «el azul» ni «el rojo».`
    : ' No llames a los equipos «el azul» ni «el rojo»: di el campeón o el jugador.';
}

export class Ia extends EventEmitter {
  // cliente: para las pruebas (algo con messages.create). Sin él se crea el de la SDK de Anthropic con la clave.
  constructor({ opciones, clave = null, cliente = null, log = () => {} }) {
    super();
    this.o = opciones.ia || {};
    this.reglas = opciones.reglas || {};
    this.clave = clave;
    this.cliente = cliente;
    this.log = log;
    this.modelo = this.o.rapido ? (this.o.modeloRapido || MODELOS.rapido) : (this.o.modelo || MODELOS.normal);
    this.estado = { activa: false, motivo: 'apagada', llamadas: 0, ahorradas: 0, fallos: 0, seguidos: 0, ultimoError: null, ultimaRespuesta: null };
    this.sistema = sistema(this.o);
    this.herramientas = herramientas(this.o);
    this.limites = new LimitesIa(this.o);
    this.uso = { entrada: 0, cacheLeida: 0, cacheEscrita: 0, salida: 0 };
    this.titulares = [];
    this.temporizador = null;
    this.ocupada = false;
    this.pausaHasta = 0;
    this.partidaNueva();
  }

  async preparar() {
    if (!this.o.activo) { this.estado.motivo = 'apagada (doble clic en INSTALAR-IA.bat para encenderla)'; return false; }
    if (!this.cliente) {
      if (!this.clave) {
        const c = leerClave(this.o);
        if (!c) { this.estado.motivo = 'no encuentro la clave (Documentos\\realizado)'; return false; }
        this.clave = c.clave;
        this.rutaClave = c.ruta;
      }
      let Anthropic;
      try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); } catch {
        this.estado.motivo = 'falta instalar la parte de la IA (doble clic en INSTALAR-IA.bat)';
        return false;
      }
      this.Anthropic = Anthropic;
      this.cliente = new Anthropic({ apiKey: this.clave, maxRetries: 1, timeout: (this.o.tiempoSegundos ?? 20) * 1000 });
    }
    this.estado.activa = true;
    this.estado.motivo = 'lista';
    return true;
  }

  get nombreModelo() { return NOMBRE_MODELO[this.modelo] || this.modelo; }

  // Conversación nueva: al empezar partida, o al pasar del tope (entonces con un resumen de lo decidido)
  nuevaConversacion(arrastre = null) {
    this.mensajes = [];
    this.turnos = 0;
    this.enviadas = new Map();
    this.pendientes = [];  // tool_result del último turno, para el siguiente
    this.arrastre = arrastre;
  }

  partidaNueva() {
    this.nuevaConversacion();
    this.limites.reiniciar();
    this.decisiones = [];
    this.gruposPreguntados = new Set();
    this.resumen = null;
    this.mvp = null;
    this.resumenIa = null;
    this.ultimoTurno = 0;
    this.ultimaHuella = null;
  }

  tokensConversacion() { return estimar(this.sistema) + estimar(this.herramientas) + estimar(this.mensajes); }

  // Los parámetros de la llamada: el prefijo (herramientas, system y mensajes ya enviados) no cambia nunca
  parametros(mensajes, maxTokens) {
    const p = {
      model: this.modelo,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: this.sistema, cache_control: { type: 'ephemeral' } }],
      tools: this.herramientas,
      tool_choice: { type: 'auto' },
      messages: mensajes,
      cache_control: { type: 'ephemeral' },
      output_config: { effort: this.o.esfuerzo || 'low' },
    };
    // Sin pensar (lo más barato) si se pide; por defecto, pensamiento adaptativo (a esfuerzo bajo casi no piensa)
    if (this.o.pensar === 'entre_herramientas') p.thinking = { type: 'between_tools' };
    return p;
  }

  // Una llamada. Devuelve la respuesta ya comprobada o lanza un error sin clave dentro.
  async llamar(contenido, { maxTokens = 4000 } = {}) {
    this.estado.llamadas++;
    const mensajes = [...this.mensajes, { role: 'user', content: contenido }];
    try {
      const p = this.parametros(mensajes, maxTokens);
      // Respaldo del servidor si la SDK lo tiene (beta): si Sonnet 5.5 rechaza por política, reintenta en otro modelo
      const beta = this.o.respaldo !== false && this.cliente.beta?.messages?.create;
      const pedir = beta ? this.cliente.beta.messages.create({ ...p, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : this.cliente.messages.create(p);
      let reloj;
      const tope = new Promise((_, no) => { reloj = setTimeout(() => no(new Error('no contesta a tiempo')), ((this.o.tiempoSegundos ?? 20) + 5) * 1000); reloj.unref?.(); });
      const r = await Promise.race([pedir, tope]).finally(() => clearTimeout(reloj));
      if (r.stop_reason === 'refusal') throw new Error(`la IA no ha querido contestar${r.stop_details?.category ? ' (' + r.stop_details.category + ')' : ''}`);
      if (r.stop_reason === 'max_tokens') throw new Error('respuesta cortada');
      if (!Array.isArray(r.content)) throw new Error('respuesta vacía');
      // El turno sale bien: se apunta (solo se añade, nunca se reescribe)
      this.mensajes.push({ role: 'user', content: contenido }, { role: 'assistant', content: r.content });
      this.turnos++;
      const u = r.usage || {};
      this.uso.entrada += u.input_tokens || 0; this.uso.cacheLeida += u.cache_read_input_tokens || 0;
      this.uso.cacheEscrita += u.cache_creation_input_tokens || 0; this.uso.salida += u.output_tokens || 0;
      this.estado.seguidos = 0;
      this.estado.ultimaRespuesta = new Date().toISOString();
      if (!this.estado.activa) { this.estado.activa = true; this.estado.motivo = 'lista'; }
      return r;
    } catch (e) {
      this.estado.fallos++;
      this.estado.seguidos++;
      const A = this.Anthropic;
      let msg = e?.message || String(e);
      if (A && e instanceof A.AuthenticationError) {
        msg = 'la clave no vale (revisa el archivo realizado en Documentos)';
        this.estado.activa = false;
        this.estado.motivo = msg;
      } else if (A && e instanceof A.PermissionDeniedError) msg = 'la clave no tiene permiso o se acabó el límite de gasto';
      else if (A && e instanceof A.RateLimitError) msg = 'demasiadas peticiones o límite de gasto: espera un poco';
      else if (A && e instanceof A.APIConnectionError) msg = `sin conexión con la IA${causaConexion(e)}`;
      msg = ocultar(msg, this.clave).slice(0, 200);
      this.estado.ultimoError = { hora: new Date().toISOString(), texto: msg };
      // Tras 3 fallos seguidos, 2 minutos sin preguntar: mientras, reglas
      if (this.estado.seguidos >= 3) this.pausaHasta = Date.now() + 120000;
      throw new Error(msg);
    }
  }

  // Lo que se valida: el estado de ahora
  ctxLimites(cerebro, { final = false, candidatas = [] } = {}) {
    const c = this.ctx || {};
    return { cerebro, jugadores: c.jugadores?.() || cerebro.jugadores || [], tA: c.tAntena?.() ?? null, tD: c.tDirecto?.() ?? null, reglas: this.reglas, manual: Boolean(c.manual?.()), final, candidatas };
  }

  // Un turno: tool_result pendientes + contexto. Procesa las herramientas que pida y deja sus resultados pendientes.
  async turno(cerebro, { final = false, candidatas = [], extra = null, maxTokens = 4000 } = {}) {
    const c = this.ctx || {};
    const L = this.o.conversacion || {};
    if (this.turnos >= (L.maximoTurnos ?? 120) || this.tokensConversacion() > (L.maximoTokens ?? 150000)) {
      this.nuevaConversacion(this.decisiones.slice(0, 40).map(d => `${d.t === null ? '' : Math.round(d.t) + ' '}${d.texto}`));
    }
    const vl = this.ctxLimites(cerebro, { final, candidatas });
    const { datos, firmas } = contextoTurno({
      cerebro, jugadores: vl.jugadores, tA: vl.tA, tD: vl.tD, reglas: this.reglas, limites: this.limites, enviadas: this.enviadas,
      primera: this.turnos === 0, fase: c.fase?.() ?? null, cs: c.cs?.() ?? null, final,
    });
    if (this.turnos === 0 && this.arrastre) datos.decididoAntes = this.arrastre;
    if (extra) Object.assign(datos, extra);
    const contenido = [...this.pendientes, { type: 'text', text: JSON.stringify(datos) }];
    const r = await this.llamar(contenido, { maxTokens });
    this.pendientes = [];
    for (const [id, f] of firmas) this.enviadas.set(id, f);
    for (const b of r.content) if (b.type === 'tool_use') this.pendientes.push(this.ejecutar(b, cerebro, { final, candidatas }));
    c.hayCambios?.();
    return r;
  }

  // Valida una herramienta y, si vale, la aplica. Devuelve su tool_result.
  ejecutar(b, cerebro, opciones) {
    const v = this.limites.validar(b.name, b.input, this.ctxLimites(cerebro, opciones));
    if (!v.ok) {
      this.ctx?.apuntar?.('ia', 'rechazada', { herramienta: b.name, motivo: v.motivo });
      return { type: 'tool_result', tool_use_id: b.id, content: `rechazada: ${v.motivo}`, is_error: true };
    }
    this.aplicar(b.name, v.accion, cerebro);
    this.limites.apuntar(b.name, v.accion);
    const d = { hora: new Date().toISOString(), t: v.accion.t ?? v.accion.desde ?? null, herramienta: b.name, texto: v.texto.replace(/^aceptada: /, ''), motivo: v.accion.motivo || b.input.motivo || null };
    this.decisiones.unshift(d);
    this.decisiones.length = Math.min(this.decisiones.length, 60);
    this.ctx?.apuntar?.('ia', b.name.replace(/_/g, ' '), { decision: d.texto, motivo: d.motivo });
    return { type: 'tool_result', tool_use_id: b.id, content: v.texto };
  }

  aplicar(nombre, a, cerebro) {
    if (nombre === 'programar_grafico') {
      cerebro.acciones.push({ id: `ia-${a.tipo}-${Math.round(a.t)}`, tipo: a.tipo, t: a.t, segundos: a.segundos, ia: true, motivo: a.motivo || null,
        ...(a.tipo === 'ficha' ? { campeon: a.campeon, jugador: a.jugador, equipo: a.equipo } : {}) });
      // La gráfica de oro de las reglas no sale pegada a un grafismo de la IA
      if (a.tipo !== 'lineas') cerebro.ultimaOro = Math.max(cerebro.ultimaOro, a.t);
      if (a.tipo === 'ficha') cerebro.ultimaFicha.set(a.campeon, a.t);
    } else if (nombre === 'pedir_repeticion') {
      const j = cerebro.jugadas.find(x => x.id === a.jugada);
      j.repetir = true;
      if (j.repeticion && !String(j.repeticion).startsWith('rep-')) delete j.repeticion;
      j.eleccionIa = true;      // cuenta como jugada fuerte: menos calma y sin separación de otras
      j.repetirDesde = a.t;     // y no antes del rato que se validó
    } else if (nombre === 'seguir_jugador') {
      cerebro.propuestasIa.push({ id: `ia-seguir-${Math.round(a.desde)}`, desde: a.desde, hasta: a.hasta, jugador: a.jugador, motivo: a.motivo || null });
    } else if (nombre === 'elegir_repeticion') {
      cerebro.elegirRepeticion(a.grupo, a.jugada);
    } else if (nombre === 'elegir_mvp') {
      this.mvp = { ...a, hora: new Date().toISOString() };
      this.emit('mvp', this.mvp);
    } else if (nombre === 'resumen_final') {
      this.resumenIa = a;
    }
  }

  // ---------- en marcha ----------

  // ctx: { cerebro(), jugadores(), tAntena(), tDirecto(), enPartida(), manual(), hayCambios(), apuntar(), fase?(), cs?() }
  arrancar(ctx) {
    this.ctx = ctx;
    const vuelta = () => { this.paso().catch(() => {}); };
    this.temporizador = setInterval(vuelta, 1000);
    this.temporizador.unref?.();
  }

  parar() { clearInterval(this.temporizador); }

  // Lo que cambiaría la respuesta: las jugadas, las rachas y si la antena avanza
  huella(cerebro, tA) {
    const jugadas = cerebro.jugadas.map(j => `${j.id}:${Math.round(j.fin)}:${j.repeticion || ''}`).join(',');
    const rachas = [...cerebro.rachas.entries()].filter(([, n]) => n >= 2).map(([c, n]) => `${c}=${n}`).sort().join(',');
    return { jugadas: `${jugadas}|${rachas}`, antena: tA === null ? null : Math.floor(tA / 10) };
  }

  async paso() {
    const c = this.ctx;
    if (!this.estado.activa || this.ocupada || !c || Date.now() < this.pausaHasta) return;
    const cerebro = c.cerebro();
    cerebro.usarIa = true;
    if (!c.enPartida() || c.manual() || cerebro.finPartida !== null) return;
    const tA = c.tAntena();
    const tD = c.tDirecto();
    if (tD === null) return;
    const g = cerebro.gruposSinElegir().find(x => !this.gruposPreguntados.has(x.id));
    const h = this.huella(cerebro, tA);
    const desde = Date.now() - this.ultimoTurno;
    const cada = (this.o.cadaSegundos ?? 25) * 1000;
    const nuevas = !this.ultimaHuella || h.jugadas !== this.ultimaHuella.jugadas;
    const rechazos = this.pendientes.some(p => p.is_error);
    const toca = Boolean(g)
      || (nuevas && desde >= (this.o.minimoSegundos ?? 8) * 1000)
      || (desde >= cada && (rechazos || h.antena !== this.ultimaHuella?.antena))
      || desde >= (this.o.repreguntarSegundos ?? 180) * 1000;
    if (!toca) { if (desde >= cada && Date.now() - (this.ultimoAhorro || 0) >= cada) { this.estado.ahorradas++; this.ultimoAhorro = Date.now(); } return; }
    this.ocupada = true;
    try {
      this.ultimoTurno = Date.now();
      const extra = g ? { elegirRepeticion: g.jugadas.map(j => j.id) } : null;
      if (g) this.gruposPreguntados.add(g.id);
      try { await this.turno(cerebro, { extra }); }
      catch (e) { if (g) cerebro.elegirRepeticion(g.id, null); throw e; }  // sin respuesta: se repiten como siempre
      this.ultimaHuella = h;
    } catch (e) {
      c.apuntar?.('ia', 'falla', { motivo: e.message });
    } finally { this.ocupada = false; }
  }

  async esperarLibre(ms = 30000) {
    const fin = Date.now() + ms;
    while (this.ocupada && Date.now() < fin) await new Promise(r => setTimeout(r, 100));
  }

  // Al acabar la partida. Siempre devuelve algo: si la IA falla, el resumen por reglas.
  // candidatas: jugadas que pueden entrar en el resumen en vídeo. La IA dice cuáles salen y en qué orden («destacadas»;
  // se tiran los ids que no son candidatos) y elige el MVP. Sin IA o si falla, destacadas null: entran todas.
  // familias {azul, rojo}: la crónica sale en la web y en Discord con el nombre de cada familia.
  async resumenFinal({ cerebro, jugadores = [], tFin = null, carpeta = null, candidatas = [], familias = null }) {
    let r = { ...resumenReglas(cerebro, jugadores, tFin), destacadas: null };
    if (this.estado.activa && this.o.resumenFinal !== false && cerebro.jugadas.length) {
      await this.esperarLibre();
      this.ocupada = true;
      try {
        if (!this.ctx) this.ctx = {};
        const antes = this.ctx.jugadores;
        if (!antes && jugadores.length) this.ctx = { ...this.ctx, jugadores: () => jugadores };
        if (cerebro.finPartida === null || cerebro.finPartida === undefined) cerebro.finPartida = tFin;
        const kda = this.ctx.cs?.()?.jugadores?.().map(h => [h.nombre, h.kda.at(-1)?.slice(1) || null, h.cs.at(-1)?.[1] ?? null]) || null;
        const extra = {
          partidaTerminada: true,
          candidatasResumenVideo: candidatas.map(j => [j.id, j.tipo, Math.round(j.inicio), j.muertes, j.objetivos.join(' ')]),
          ...(kda ? { kdaYcs: kda } : {}),
          ...(familias?.azul || familias?.rojo ? { familias } : {}),
          pide: 'La partida ha terminado. En esta respuesta llama a resumen_final y a elegir_mvp.' + nombresFamilias(familias),
        };
        for (let intento = 0; intento < 2 && !this.resumenIa; intento++) {
          await this.turno(cerebro, { final: true, candidatas, extra: intento ? { pide: 'Falta resumen_final (y elegir_mvp si no lo has hecho).' } : extra, maxTokens: 6000 });
        }
        if (this.resumenIa) r = { titular: this.resumenIa.titular, resumen: this.resumenIa.resumen, hecho: 'ia', destacadas: candidatas.length ? this.resumenIa.destacadas : null };
      } catch (e) { this.ctx?.apuntar?.('ia', 'falla', { motivo: `resumen final: ${e.message}` }); }
      finally { this.ocupada = false; }
    }
    this.resumen = { ...r, mvp: this.mvp ? { campeon: this.mvp.campeon, jugador: this.mvp.jugador, equipo: this.mvp.equipo, clave: this.mvp.clave, motivo: this.mvp.motivo } : null, hora: new Date().toISOString() };
    if (carpeta) {
      const mvp = this.mvp ? `\n\nMVP: ${this.mvp.jugador} (${this.mvp.campeon})${this.mvp.motivo ? '. ' + this.mvp.motivo : ''}\n` : '';
      try { writeFileSync(join(carpeta, 'resumen.txt'), `${r.titular ? r.titular + '\n\n' : ''}${r.resumen}\n${mvp}`); } catch { /* sin carpeta: solo en el panel */ }
    }
    this.emit('resumen', this.resumen);
    return this.resumen;
  }

  // Lo que se enseña en los paneles (nunca la clave)
  foto() {
    return {
      activa: this.estado.activa,
      modelo: this.nombreModelo,
      motivo: this.estado.motivo,
      llamadas: this.estado.llamadas,
      ahorradas: this.estado.ahorradas,
      fallos: this.estado.fallos,
      pausada: Date.now() < this.pausaHasta,
      ultimoError: this.estado.ultimoError,
      decisiones: this.decisiones.slice(0, 10),
      conversacion: { turnos: this.turnos, tokens: this.tokensConversacion(), uso: { ...this.uso } },
      consejo: null,
      titulares: this.titulares,
      mvp: this.mvp,
      resumen: this.resumen,
    };
  }
}
