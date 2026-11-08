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
// solo sale de aquí hacia la API de Anthropic. No se apunta en el registro, ni va al PC 2, ni al panel de TENKA ICHI.
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { RAIZ } from '../comun/opciones.js';

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

// ---------- lo que se le pide ----------

const SISTEMA = `Eres el ayudante de realización de un directo de League of Legends de la comunidad TENKA ICHI.
La emisión va 2 minutos por detrás de la partida real: sabes lo que va a pasar antes de que el público lo vea.
La cámara, las repeticiones y las transiciones las lleva un programa con reglas fijas; tú no las tocas.

Tu trabajo, cuando te lo pidan:
1. Overlay en el próximo rato tranquilo de lo que aún no se ha emitido. Opciones:
   - "oro": gráfica de diferencia de oro. Buena cuando la partida se está decantando o tras varios objetivos.
   - "ficha": ficha de un jugador. Solo para alguien con una racha clara o que está decidiendo la partida. Di su campeón tal cual aparece en los equipos.
   - "lineas": dejar el línea por línea (comparativa de los dos equipos). Úsalo si se prepara una pelea o un objetivo justo después del rato tranquilo, o si hace poco que salió otra cosa.
   No repitas lo mismo que salió hace poco (mira overlayReciente) salvo que haya un motivo claro.
2. Titular: una frase corta (máximo 70 caracteres) en español de España, con tono de narrador, sobre lo más interesante que está pasando o va a pasar. Sin inventar datos que no estén en el resumen. null si no hay nada que contar.
3. Repetición: si te dan varias jugadas que acabaron a la vez, elige la que más merece repetirse (la que más cambia la partida: muertes, objetivos grandes, un ace, un robo).
4. Resumen final: 3 a 5 frases para los casters con lo que decidió la partida.

Responde solo con el JSON que se te pide. Sé breve en "motivo" (una frase).`;

const nulable = tipo => ({ anyOf: [{ type: tipo }, { type: 'null' }] });

export const ESQUEMAS = {
  consejo: {
    type: 'object', additionalProperties: false, required: ['overlay', 'campeon', 'titular', 'motivo'],
    properties: { overlay: { type: 'string', enum: ['oro', 'ficha', 'lineas'] }, campeon: nulable('string'), titular: nulable('string'), motivo: { type: 'string' } },
  },
  repeticion: (ids) => ({
    type: 'object', additionalProperties: false, required: ['jugada', 'motivo'],
    properties: { jugada: { type: 'string', enum: ids }, motivo: { type: 'string' } },
  }),
  resumen: {
    type: 'object', additionalProperties: false, required: ['titular', 'resumen'],
    properties: { titular: { type: 'string' }, resumen: { type: 'string' } },
  },
};

export class Ia extends EventEmitter {
  // cliente: para las pruebas (algo con messages.create). Sin él se crea el de la SDK de Anthropic con la clave.
  constructor({ opciones, clave = null, cliente = null, log = () => {} }) {
    super();
    this.o = opciones.ia || {};
    this.clave = clave;
    this.cliente = cliente;
    this.log = log;
    this.modelo = this.o.rapido ? (this.o.modeloRapido || MODELOS.rapido) : (this.o.modelo || MODELOS.normal);
    this.estado = { activa: false, motivo: 'apagada', llamadas: 0, ahorradas: 0, fallos: 0, seguidos: 0, ultimoError: null, ultimaRespuesta: null };
    this.ultimaPregunta = 0;
    this.ultimaHuella = null;
    this.consejo = null;
    this.titulares = [];
    this.resumen = null;
    this.ocupada = false;
    this.ultimoConsejo = 0;
    this.pausaHasta = 0;
    this.temporizador = null;
  }

  // Prepara el cliente. Devuelve false (y dice por qué) si no se puede: el realizador sigue con las reglas.
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

  // Una pregunta con respuesta en JSON. Cualquier fallo lanza un error ya sin clave dentro.
  async pedir(contenido, esquema, { maxTokens = 1500 } = {}) {
    this.estado.llamadas++;
    try {
      const r = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: contenido }],
        output_config: { effort: this.o.esfuerzo || 'low', format: { type: 'json_schema', schema: esquema } },
      });
      if (r.stop_reason === 'refusal') throw new Error('la IA no ha querido contestar');
      if (r.stop_reason === 'max_tokens') throw new Error('respuesta cortada');
      const texto = r.content.find(b => b.type === 'text')?.text;
      if (!texto) throw new Error('respuesta vacía');
      const datos = JSON.parse(texto);
      this.estado.seguidos = 0;
      this.estado.ultimaRespuesta = new Date().toISOString();
      if (!this.estado.activa) { this.estado.activa = true; this.estado.motivo = 'lista'; }
      return datos;
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
      else if (A && e instanceof A.APIConnectionError) msg = 'sin conexión con la IA';
      msg = ocultar(msg, this.clave).slice(0, 200);
      this.estado.ultimoError = { hora: new Date().toISOString(), texto: msg };
      // Tras 3 fallos seguidos, 2 minutos sin preguntar: mientras, reglas
      if (this.estado.seguidos >= 3) this.pausaHasta = Date.now() + 120000;
      throw new Error(msg);
    }
  }

  // ---------- en marcha ----------

  // ctx: { cerebro(), jugadores(), tAntena(), tDirecto(), enPartida(), manual(), hayCambios(), apuntar() }
  arrancar(ctx) {
    this.ctx = ctx;
    const vuelta = () => { this.paso().catch(() => {}); };
    this.temporizador = setInterval(vuelta, 1000);
    this.temporizador.unref?.();
  }

  parar() { clearInterval(this.temporizador); }

  partidaNueva() {
    this.consejo = null;
    this.titulares = [];
    this.resumen = null;
    this.ultimoConsejo = 0;
    this.ultimaPregunta = 0;
    this.ultimaHuella = null;
  }

  // Lo que cambiaría la respuesta de la IA: las jugadas que entran en el resumen y las rachas.
  // Si no cambia (y el consejo de antes aún no se ha usado), no hace falta volver a preguntar.
  huellaConsejo(cerebro, tA) {
    const jugadas = cerebro.jugadas.filter(j => j.fin > tA - 150).map(j => `${j.id}:${Math.round(j.fin)}`).join(',');
    const rachas = [...cerebro.rachas.entries()].filter(([, n]) => n >= 2).map(([campeon, n]) => `${campeon}=${n}`).sort().join(',');
    return `${jugadas}|${rachas}`;
  }

  async paso() {
    const c = this.ctx;
    if (!this.estado.activa || this.ocupada || !c || Date.now() < this.pausaHasta) return;
    const cerebro = c.cerebro();
    cerebro.usarIa = true;
    if (!c.enPartida() || c.manual()) return;
    const tA = c.tAntena();
    const tD = c.tDirecto();
    if (tD === null) return;
    this.ocupada = true;
    try {
      // Primero lo que corre prisa: una repetición por elegir
      const g = cerebro.gruposSinElegir()[0];
      if (g) { await this.elegirRepeticion(cerebro, g); return; }
      if (tA !== null && Date.now() - this.ultimoConsejo >= (this.o.cadaSegundos ?? 25) * 1000) {
        this.ultimoConsejo = Date.now();
        const huella = this.huellaConsejo(cerebro, tA);
        const vigente = cerebro.consejo && cerebro.consejo === this.consejo && !cerebro.consejo.usado;
        const reciente = Date.now() - this.ultimaPregunta < (this.o.repreguntarSegundos ?? 180) * 1000;
        if (vigente && reciente && huella === this.ultimaHuella) {
          // Nada nuevo (por ejemplo, la antena aún parada antes de empezar): el consejo de antes sigue valiendo
          // para el próximo rato tranquilo, sin gastar otra llamada
          cerebro.consejo.hasta = Math.max(cerebro.consejo.hasta, tD + 30);
          this.estado.ahorradas++;
          return;
        }
        this.ultimaPregunta = Date.now();
        await this.pedirConsejo(cerebro, c.jugadores(), tA, tD);
        this.ultimaHuella = huella;
      }
    } catch (e) {
      c.apuntar?.('ia', 'falla', { motivo: e.message });
    } finally { this.ocupada = false; }
  }

  async pedirConsejo(cerebro, jugadores, tA, tD) {
    const resumen = resumenPartida({ cerebro, jugadores, tA, tD });
    const r = await this.pedir(`Resumen de la partida:\n${JSON.stringify(resumen)}\n\nElige el overlay para el próximo rato tranquilo por emitir y, si hay algo que contar, un titular.`, ESQUEMAS.consejo);
    let consejo = { tipo: r.overlay, motivo: r.motivo, desde: tA, hasta: tD + 30, hora: new Date().toISOString() };
    if (r.overlay === 'ficha') {
      const j = jugadores.find(x => x.campeon.toLowerCase() === String(r.campeon || '').toLowerCase());
      // Un campeón que no está en la partida no vale: se queda en gráfica de oro
      consejo = j ? { ...consejo, campeon: j.campeon, jugador: j.jugador, equipo: j.equipo } : { ...consejo, tipo: 'oro' };
    }
    cerebro.consejo = consejo;
    this.consejo = consejo;
    if (this.o.titulares !== false && r.titular) {
      const titular = String(r.titular).slice(0, 90);
      if (titular !== this.titulares[0]?.texto) {
        this.titulares.unshift({ hora: new Date().toISOString(), t: tA, texto: titular });
        this.titulares.length = Math.min(this.titulares.length, 10);
        this.emit('titular', titular);
      }
    }
    this.ctx?.apuntar?.('ia', 'consejo', { overlay: consejo.tipo, campeon: consejo.campeon || null, motivo: r.motivo });
    this.ctx?.hayCambios?.();
    return consejo;
  }

  async elegirRepeticion(cerebro, grupo) {
    const ids = grupo.jugadas.map(j => j.id);
    try {
      const r = await this.pedir(
        `Han acabado a la vez varias jugadas que merecen repetición y solo cabe una:\n${JSON.stringify(grupo.jugadas.map(j => jugadaCorta(j, null)))}\n\nElige cuál se repite.`,
        ESQUEMAS.repeticion(ids), { maxTokens: 800 });
      cerebro.elegirRepeticion(grupo.id, ids.includes(r.jugada) ? r.jugada : null);
      this.ctx?.apuntar?.('ia', 'elige repetición', { jugada: r.jugada, de: ids.join(', '), motivo: r.motivo });
    } catch (e) {
      // Sin respuesta: se repiten como siempre (reglas)
      cerebro.elegirRepeticion(grupo.id, null);
      throw e;
    } finally { this.ctx?.hayCambios?.(); }
  }

  // Al acabar la partida. Siempre devuelve algo: si la IA falla, el resumen por reglas.
  async resumenFinal({ cerebro, jugadores = [], tFin = null, carpeta = null }) {
    let r = resumenReglas(cerebro, jugadores, tFin);
    if (this.estado.activa && this.o.resumenFinal !== false && cerebro.jugadas.length) {
      try {
        const datos = {
          duracion: reloj(tFin),
          equipos: resumenPartida({ cerebro, jugadores, tA: tFin, tD: tFin }).equipos,
          marcador: marcador(cerebro, jugadores),
          jugadas: cerebro.jugadas.map(j => jugadaCorta(j, null)),
        };
        const ia = await this.pedir(`La partida ha terminado. Todo lo que pasó:\n${JSON.stringify(datos)}\n\nEscribe el titular y el resumen final.`, ESQUEMAS.resumen, { maxTokens: 2500 });
        r = { titular: ia.titular, resumen: ia.resumen, hecho: 'ia' };
      } catch (e) { this.ctx?.apuntar?.('ia', 'falla', { motivo: `resumen final: ${e.message}` }); }
    }
    this.resumen = { ...r, hora: new Date().toISOString() };
    if (carpeta) {
      try { writeFileSync(join(carpeta, 'resumen.txt'), `${r.titular ? r.titular + '\n\n' : ''}${r.resumen}\n`); } catch { /* sin carpeta: solo en el panel */ }
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
      consejo: this.consejo ? { tipo: this.consejo.tipo, campeon: this.consejo.campeon || null, motivo: this.consejo.motivo, hora: this.consejo.hora } : null,
      titulares: this.titulares,
      resumen: this.resumen,
    };
  }
}
