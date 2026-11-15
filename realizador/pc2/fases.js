// Fases del directo (PC 2, que es donde está OBS): decide en qué fase está la emisión y cuánto le queda.
//
//   espera → intro → traileres → draft | pausa → partida (⇄ repeticion) → postpartida → casters → resumen → casters … → cierre
//
// No toca OBS ni la emisión: el relé le pasa en cada vuelta lo que sabe (pc2/emision.js, pc2/resumen.js, el draft de
// la web y la escena que sale) y pone la escena que esto le devuelve. Las escenas de siempre las siguen poniendo sus
// dueños: Juego y Pausa (la previa) la emisión, Repeticion las repeticiones y Resumen el resumen en vídeo. Esto pone
// las nuevas (Espera, Intro, Postpartida, Cierre) y las que se piden a mano desde el panel.
//
// Automático (sin nada a mano), de más a menos importante:
//   1. partida en antena (desde el segundo 0, lo decide la emisión) → «partida», o «repeticion» mientras sale una.
//   2. previa de la emisión (unos segundos antes del 0) → «pausa». Al llegar la partida (la previa o el segundo 0), lo
//      que hubiera a mano se suelta; lo que se pida a mano después, se queda (salvo en el segundo 0, que manda el Juego).
//   3. lo puesto a mano (espera sin hora, pausa, casters, cierre): se queda hasta otra orden.
//   4. intro, tráilers o postpartida en marcha (duran introSegundos / lo que sumen los vídeos / postpartidaSegundos y
//      acaban solas): la intro sigue a draft si hay draft en marcha y, si no, a pausa; la postpartida, a casters. La
//      intro que viene de la espera con hora (el inicio del directo) sigue antes a los tráilers (si hay vídeos), y de
//      ahí a draft o pausa. «saltar» acaba ya la que esté en marcha, como si acabara sola.
//   5. espera con hora (`hasta`): cuenta atrás; al llegar a 0 pasa sola a la intro (con los tráilers detrás).
//   6. resumen en vídeo saliendo → «resumen».
//   7. draft en marcha en la web → «draft».
//   8. donde se quedó la emisión: tras el draft, pausa; tras la partida, casters (con la cuenta del resumen).
//   9. si no, la escena que sale en OBS, si es una de estas.
//
// Eventos:
//   'cambio' (f): cada vez que cambia la fase (o si va a mano, la hora o la escena). f = publico() + { anterior }.
//   'partida' (f): la partida entra en antena, una vez por partida: la vuelta en que la emisión pasa a «directo» y pone
//      Juego (el segundo 0 de la antena; lo decide la emisión, esto solo lo cuenta). Volver de una repetición o de algo
//      puesto a mano en mitad de la partida no cuenta. Para la cinemática de la entrada.
//   'casters': se entra en Casters tras la postpartida (o se acaba la postpartida con Casters ya puesta): el relé
//      arranca ahí la cuenta atrás del resumen en vídeo.
//   'parar': el cierre ha durado cierreSegundos: el relé corta la emisión.
import { EventEmitter } from 'node:events';

// pausaTrasResumenSegundos: al acabar el resumen en vídeo, pausa con cuenta atrás; a las 0, la intro y luego el draft
// (Pacopepe, 15/11: «pausa tras el resumen… Fija: 5 minutos… Pone el clip de la jornada, y luego el draft»). 0 = sin ella
export const POR_DEFECTO = { introSegundos: 12, postpartidaSegundos: 30, cierreSegundos: 0, pausaTrasResumenSegundos: 300 };
export const FASES = ['espera', 'intro', 'traileres', 'draft', 'pausa', 'partida', 'repeticion', 'postpartida', 'casters', 'resumen', 'cierre'];
// Las que se pueden pedir desde el panel ('auto' devuelve el control al flujo automático; 'traileres' los pone a mano
// desde el principio; 'saltar' acaba ya la intro, los tráilers o la postpartida en marcha, como si acabara sola)
// 'partida' («meter partida»): suelta todo lo de antes y la antena arranca ya desde 0:00 (evento 'meterPartida')
export const ORDENES = ['espera', 'intro', 'traileres', 'pausa', 'postpartida', 'casters', 'cierre', 'auto', 'saltar', 'partida'];
// La hora de la espera no puede estar más lejos (una hora ya pasada que se pasa a mañana daría casi 24 h de cuenta)
export const ESPERA_MAXIMA_MS = 12 * 3600 * 1000;
// Las que pone esto (las demás las ponen la emisión, las repeticiones o el resumen)
const PROPIAS = new Set(['espera', 'intro', 'traileres', 'draft', 'pausa', 'postpartida', 'casters', 'cierre']);
const SIEMPRE_PROPIAS = new Set(['espera', 'intro', 'traileres', 'postpartida', 'cierre']);
const TEMPORALES = new Set(['intro', 'traileres', 'postpartida']);

// Fuentes de OBS de las fases nuevas (las crea instalar/configurar-obs.js; el relé les cambia la dirección)
export const FUENTES_FASES = {
  espera: 'Overlay espera', cabecera: 'Overlay cabecera', pausa: 'Overlay pausa', final: 'Overlay final',
  fondoPostpartida: 'Fondo postpartida', cierre: 'Overlay cierre',
};
export const MUSICA = { espera: 'espera.opus', intro: 'intro.opus', pausa: 'pausa.opus', postpartida: 'victoria.opus', cierre: 'despedida.opus' };

// Texto de la jornada con lo que da la web (estado del panel de Gokudō: config.jornada, y si no, config.fase)
export function jornadaDeTenka(e) {
  const c = e?.config || {};
  const t = [c.jornada, c.fase].find(x => typeof x === 'string' && x.trim());
  return t ? t.trim().slice(0, 80) : '';
}

const segundos = ms => Math.max(0, Math.ceil(ms / 1000));

export class Fases extends EventEmitter {
  // duracionTraileres(): segundos que suman los tráilers del inicio (0 = no hay y la fase se salta). La da el relé.
  constructor({ opciones = {}, escenas = {}, registrar = () => {}, ahora = () => Date.now(), duracionTraileres = () => 0 } = {}) {
    super();
    this.c = { ...POR_DEFECTO, ...opciones };
    this.duracionTraileres = () => { try { const s = Number(duracionTraileres()); return Number.isFinite(s) && s > 0 ? s : 0; } catch { return 0; } };
    this.vezTemporal = 0;    // cada intro / tráilers / postpartida lleva su número (id): así el relé sabe si es otra
    this.detalle = null;     // en los tráilers, «2 de 8» (lo pone el relé)
    this.escenas = {
      espera: 'Espera', intro: 'Intro', traileres: 'Traileres', draft: 'Draft', pausa: 'Pausa', partida: 'Juego', repeticion: 'Repeticion',
      postpartida: 'Postpartida', casters: 'Casters', resumen: 'Resumen', cierre: 'Cierre',
      ...Object.fromEntries(Object.entries(escenas).filter(([, v]) => v)),
    };
    this.registrar = registrar;
    this.ahora = ahora;
    this.mano = null;        // fase puesta a mano que se queda: espera (sin hora) | pausa | casters | cierre
    this.temporal = null;    // { fase: 'intro' | 'traileres' | 'postpartida', fin, aMano, id, traileres? }: las que acaban solas
    this.hasta = null;       // hora (ms) a la que acaba la espera con cuenta atrás
    this.pausaHasta = null;  // hora (ms) a la que acaba la pausa tras el resumen (luego, la intro)
    this.vistaResumen = null;
    this.cierreFin = null;   // hora a la que el cierre corta la emisión (con cierreSegundos)
    this.jornada = '';       // la que manda el panel (si la web no la da)
    this.reposo = null;      // dónde se queda el automático cuando no pasa nada: pausa | casters
    this.autor = false;      // la próxima vuelta pone la escena (orden, o algo que acaba solo)
    this.vistaEscenaAuto = null;
    this.vistaEmision = null;
    this.meter = false;      // «meter partida» pedido: la partida entra ya (hasta que esté en antena)
    this.vistaBloqueo = null;
    this.actual = null;
    this.siguiente = null;
    this.faltan = null;
    this.ultima = null;      // la última entrada (para publico() entre vueltas)
    this.firma = null;
  }

  // Pone una fase temporal (con traileres, la intro lleva detrás los tráilers: la del inicio del directo)
  ponerTemporal(fase, segundos, aMano, { traileres = false } = {}) {
    this.temporal = { fase, fin: this.ahora() + Math.max(0, segundos) * 1000, aMano, id: ++this.vezTemporal, ...(traileres ? { traileres: true } : {}) };
    if (fase === 'traileres') this.detalle = null;
    return this.temporal;
  }

  // El relé ajusta lo que les queda a los tráilers según sale cada vídeo (con 0, acaban en la próxima vuelta).
  // id: el de la fase que reproduce; si ya es otra, no se toca nada
  ajustarTemporal(id, segundosQueQuedan) {
    if (!this.temporal || this.temporal.id !== id || !Number.isFinite(segundosQueQuedan)) return false;
    this.temporal.fin = this.ahora() + Math.max(0, segundosQueQuedan) * 1000;
    return true;
  }

  // Lo que viene tras una fase temporal
  trasTemporal(t, draft) {
    if (t.fase === 'postpartida') return 'casters';
    if (t.fase === 'intro' && t.traileres && this.duracionTraileres() > 0) return 'traileres';
    return draft ? 'draft' : 'pausa';
  }

  get manual() { return Boolean(this.mano || this.temporal?.aMano); }
  get escena() { return this.actual ? this.escenas[this.actual] || null : null; }

  // Mientras esto lleva la emisión (algo a mano, la intro, la postpartida o la espera con hora), la emisión no pone
  // por su cuenta el draft ni la escena del final (la previa y la partida sí: eso no se toca)
  retiene() {
    const ahora = this.ahora();
    return Boolean(this.mano || this.temporal || (this.hasta && ahora < this.hasta) || (this.pausaHasta && ahora < this.pausaHasta));
  }

  // ¿La partida tiene que esperar en 0:00 antes de entrar en antena? (15/11: «las partidas deben empezar siempre en el
  // 0.00… cuando meto partida debe empezar ahí siempre»). Solo si alguien ha puesto algo: la espera, la intro o los
  // tráilers, la pausa tras el resumen o a mano pausa, casters, cierre o espera. Nunca con la partida ya en previa o en
  // directo, ni tras «meter partida». El relé deja la antena quieta en 0:00 mientras sea true y la arranca con
  // 'meterPartida' (que sale con la orden y también cuando el bloqueo se acaba solo, al terminar la intro o los tráilers)
  bloqueaPartida() {
    if (this.vistaEmision === 'directo' || this.vistaEmision === 'previa' || this.meter) return false;
    const ahora = this.ahora();
    if (this.mano && ['pausa', 'casters', 'cierre', 'espera'].includes(this.mano)) return true;
    if (this.temporal && ['intro', 'traileres'].includes(this.temporal.fase)) return true;
    return Boolean((this.hasta && ahora < this.hasta) || (this.pausaHasta && ahora < this.pausaHasta));
  }

  publico() {
    // hasta: la hora de la espera o, en la pausa tras el resumen, la de su fin (obs/pausa.html la lee de /estado)
    return {
      actual: this.actual, manual: this.manual, hasta: this.hasta ?? (this.actual === 'pausa' ? this.pausaHasta : null), faltan: this.faltan, siguiente: this.siguiente, escena: this.escena,
      ...(this.actual === 'traileres' ? { detalle: this.detalle } : {}),
      partidaEsperando: this.bloqueaPartida(),
    };
  }

  // Orden del panel: { fase, hasta?, jornada? }
  orden({ fase, hasta, jornada } = {}) {
    if (!ORDENES.includes(fase)) throw new Error(`Fase desconocida: ${fase}`);
    const ahora = this.ahora();
    // Lo que no vale se rechaza antes de tocar nada
    if (fase === 'espera' && hasta !== null && hasta !== undefined && Number(hasta) - ahora > ESPERA_MAXIMA_MS) throw new Error('Esa hora está a más de 12 h: revisa la hora');
    if (fase === 'saltar' && !this.temporal) throw new Error('No hay nada que saltar: solo se saltan la intro, los tráilers o la postpartida en marcha');
    if (fase === 'traileres' && !this.duracionTraileres()) throw new Error('No hay tráilers: copia los vídeos en la carpeta de obs.videosDirecto');
    if (typeof jornada === 'string') this.jornada = jornada.trim().slice(0, 80);
    if (fase === 'partida') {
      // «Meter partida»: fuera la espera, la intro, los tráilers y lo puesto a mano; la antena arranca desde 0:00
      this.mano = null;
      this.temporal = null;
      this.hasta = null;
      this.pausaHasta = null;
      this.cierreFin = null;
      this.meter = true;
      this.vistaBloqueo = false;
      this.autor = true;
      this.registrar('[fases] meter partida: la antena arranca desde 0:00');
      this.emit('meterPartida', { porOrden: true });
      return;
    }
    if (fase === 'saltar') {
      // Como si acabara sola: la próxima vuelta sigue con la siguiente (la intro del inicio, a los tráilers)
      this.temporal.fin = ahora;
      this.registrar(`[fases] se salta${this.temporal.fase === 'traileres' ? 'n los tráilers' : ` la ${this.temporal.fase}`}`);
      this.autor = true;
      return;
    }
    const antes = this.temporal;
    // Cualquier orden (salvo «auto») quita la cuenta de la pausa tras el resumen
    if (fase !== 'auto' && this.pausaHasta) { this.pausaHasta = null; this.registrar('[fases] se quita la cuenta de la pausa tras el resumen'); }
    if (fase === 'auto') {
      this.mano = null;
      this.cierreFin = null;
      if (this.temporal) this.temporal = { ...this.temporal, aMano: false };
      this.registrar('[fases] automático: la emisión sigue sola');
    } else if (fase === 'espera') {
      const h = Number(hasta);
      this.temporal = null;
      this.cierreFin = null;
      if (Number.isFinite(h) && h > ahora) {
        this.hasta = h;
        this.mano = null;
        this.registrar(`[fases] espera hasta las ${new Date(h).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}: luego, la intro`);
      } else {
        this.hasta = null;
        this.mano = 'espera';
        this.registrar('[fases] espera a mano, sin cuenta atrás');
      }
    } else if (TEMPORALES.has(fase)) {
      this.mano = null;
      this.cierreFin = null;
      if (fase !== 'postpartida') this.hasta = null;
      const s = fase === 'intro' ? this.c.introSegundos : fase === 'traileres' ? this.duracionTraileres() : this.c.postpartidaSegundos;
      this.ponerTemporal(fase, s, true);
      this.registrar(`[fases] ${fase === 'traileres' ? 'tráilers' : fase} a mano (${Math.round(s)} s)`);
    } else {
      this.mano = fase;
      this.temporal = null;
      if (fase === 'cierre') this.hasta = null;
      this.cierreFin = fase === 'cierre' && this.c.cierreSegundos > 0 ? ahora + this.c.cierreSegundos * 1000 : null;
      this.registrar(`[fases] ${fase} a mano${this.cierreFin ? `: la emisión se corta en ${this.c.cierreSegundos} s` : ''}`);
    }
    // La postpartida que se corta con otra orden deja la emisión en Casters (de donde sale el resumen)
    if (antes?.fase === 'postpartida' && !this.temporal) this.reposo = 'casters';
    this.autor = true;
  }

  // La partida ha acabado en antena (evento 'final' de la emisión): postpartida y luego casters
  alFinal() {
    if (this.c.postpartidaSegundos > 0) this.ponerTemporal('postpartida', this.c.postpartidaSegundos, false);
    else this.reposo = 'casters';
    this.autor = true;
  }

  // Cada vuelta del relé. Devuelve { escena }: la escena que hay que poner ahora (o null si no hay que tocar nada).
  // e: { emision: fase de la emisión, escenaAuto: la última escena que puso la emisión sola, meta: segundo al que va la
  // antena, draft: hay draft en la web, resumen: { fase, faltan }, escenaObs: la que sale en OBS }
  paso(e = {}) {
    this.ultima = e;
    const ahora = this.ahora();
    const anterior = this.actual;
    let casters = false;

    // La partida llega a la antena (la previa, o el segundo 0 en que la emisión pone Juego): lo puesto a mano se suelta
    // (no se cambia cuándo entra el Juego)
    const antes = this.vistaEmision;
    const entraPrevia = e.emision === 'previa' && antes !== 'previa' && antes !== 'directo';
    const entraDirecto = e.emision === 'directo' && antes !== 'directo';
    if (entraPrevia || entraDirecto) {
      if (this.mano || this.temporal || this.hasta) this.registrar('[fases] llega la partida: vuelve el automático');
      this.mano = null;
      this.temporal = null;
      this.hasta = null;
      this.pausaHasta = null;
      this.cierreFin = null;
      this.autor = true;
    }
    this.vistaEmision = e.emision ?? null;
    // «Meter partida» vale hasta que la partida está en antena
    if (e.emision === 'directo') this.meter = false;
    // Se acaba el resumen en vídeo (emitiendo → hecho): pausa con cuenta atrás, y a las 0 la intro
    const faseResumen = e.resumen?.fase ?? null;
    if (this.vistaResumen === 'emitiendo' && faseResumen === 'hecho' && this.c.pausaTrasResumenSegundos > 0
      && e.emision !== 'directo' && e.emision !== 'previa' && !this.mano) {
      this.pausaHasta = ahora + this.c.pausaTrasResumenSegundos * 1000;
      this.temporal = null;
      this.autor = true;
      this.registrar(`[fases] fin del resumen: pausa de ${Math.round(this.c.pausaTrasResumenSegundos)} s, luego la intro`);
    }
    this.vistaResumen = faseResumen;
    // Donde se queda la emisión cuando pone ella una escena (tras el draft, pausa; tras la partida, casters)
    if (e.escenaAuto !== this.vistaEscenaAuto) {
      this.vistaEscenaAuto = e.escenaAuto ?? null;
      const r = { draft: 'pausa', previa: 'pausa', juego: null, final: 'casters' }[e.escenaAuto];
      if (r !== undefined) this.reposo = r;
    }
    // Lo que acaba solo
    if (this.temporal && ahora >= this.temporal.fin) {
      const t = this.temporal;
      const sigue = this.trasTemporal(t, e.draft);
      this.temporal = null;
      if (sigue === 'traileres') {
        // El inicio del directo: tras la intro, los tráilers (lo que sumen los vídeos); luego draft o pausa
        const s = this.duracionTraileres();
        this.ponerTemporal('traileres', s, t.aMano);
        this.registrar(`[fases] fin de la intro: tráilers (${Math.round(s)} s)`);
      } else {
        this.reposo = sigue === 'draft' ? null : sigue;
        this.registrar(`[fases] fin de ${t.fase === 'traileres' ? 'los tráilers' : `la ${t.fase}`}: ${sigue}`);
      }
      if (t.fase === 'postpartida' && (!this.mano || this.mano === 'casters')) casters = true;
      if (!this.mano) this.autor = true;
    }
    if (this.hasta && ahora >= this.hasta) {
      const contaba = anterior === 'espera' && !this.mano;
      this.hasta = null;
      if (contaba) {
        this.ponerTemporal('intro', this.c.introSegundos, false, { traileres: true });
        this.registrar(`[fases] se acaba la espera: intro${this.duracionTraileres() ? ' y luego los tráilers' : ''}`);
        this.autor = true;
      }
    }
    if (this.pausaHasta && ahora >= this.pausaHasta) {
      const contaba = anterior === 'pausa' && !this.mano;
      this.pausaHasta = null;
      if (contaba) {
        this.ponerTemporal('intro', this.c.introSegundos, false);
        this.registrar('[fases] se acaba la pausa tras el resumen: intro');
        this.autor = true;
      }
    }
    if (this.cierreFin && ahora >= this.cierreFin) {
      this.cierreFin = null;
      if (this.mano === 'cierre') { this.registrar('[fases] fin del cierre: se corta la emisión'); this.emit('parar'); }
    }

    const { actual, siguiente, faltan } = this.calcular(e, ahora);
    this.actual = actual;
    this.siguiente = siguiente;
    this.faltan = faltan;

    let escena = null;
    if (actual && PROPIAS.has(actual) && (this.autor || (actual !== anterior && SIEMPRE_PROPIAS.has(actual)))) escena = this.escenas[actual];
    // Vuelta a la partida desde algo puesto a mano en plena partida («auto», o la postpartida forzada que acaba sola): la
    // emisión solo pone Juego al empezar, así que aquí se vuelve a poner. La entrada en el segundo 0 la sigue haciendo la emisión
    else if (actual === 'partida' && anterior && anterior !== 'partida' && anterior !== 'repeticion' && !entraDirecto) escena = this.escenas.partida;
    this.autor = false;
    if (actual !== anterior) {
      if (actual === 'casters' && anterior === 'postpartida') casters = true;
      if (actual === 'casters' && this.mano === 'casters') casters = true;
    }
    if (casters) this.emit('casters');
    // El bloqueo de la partida se acaba solo (fin de la intro o de los tráilers, la espera que se quita…): la antena arranca
    const bloquea = this.bloqueaPartida();
    if (this.vistaBloqueo === true && !bloquea && e.emision !== 'directo' && e.emision !== 'previa') {
      this.registrar('[fases] la partida ya puede entrar: la antena arranca desde 0:00');
      this.emit('meterPartida', { porOrden: false });
    }
    this.vistaBloqueo = bloquea;
    const firma = JSON.stringify([actual, this.manual, this.hasta, this.pausaHasta, siguiente, this.escena, bloquea]);
    if (firma !== this.firma) {
      this.firma = firma;
      this.emit('cambio', { ...this.publico(), anterior });
    }
    if (entraDirecto && actual === 'partida') this.emit('partida', { ...this.publico(), anterior });
    return { escena };
  }

  calcular(e, ahora) {
    const r = (actual, siguiente = null, faltan = null) => ({ actual, siguiente, faltan });
    const t = this.temporal;
    const desdeTemporal = () => r(t.fase, this.trasTemporal(t, e.draft), segundos(t.fin - ahora));
    const desdeMano = () => (this.mano === 'cierre' && this.cierreFin ? r('cierre', null, segundos(this.cierreFin - ahora)) : r(this.mano));
    // En la partida (y la previa) solo cuenta lo que se pida a mano después de que llegue: lo de antes ya se soltó
    if (e.emision === 'directo' || e.emision === 'previa') {
      if (this.mano) return desdeMano();
      if (t?.aMano) return desdeTemporal();
    }
    if (e.emision === 'directo') {
      return e.escenaObs && e.escenaObs === this.escenas.repeticion ? r('repeticion', 'partida') : r('partida', 'postpartida');
    }
    if (e.emision === 'previa') return r('pausa', 'partida', Number.isFinite(e.meta) && e.meta < 0 ? segundos(-e.meta * 1000) : null);
    if (e.resumen?.fase === 'emitiendo') return r('resumen', 'casters');
    if (this.mano) return desdeMano();
    if (t) return desdeTemporal();
    if (this.hasta && ahora < this.hasta) return r('espera', 'intro', segundos(this.hasta - ahora));
    // La pausa tras el resumen manda aunque haya un draft en la web: al llegar a 0, intro y luego el draft
    if (this.pausaHasta && ahora < this.pausaHasta) return r('pausa', 'intro', segundos(this.pausaHasta - ahora));
    if (e.draft) return r('draft', 'pausa');
    const casters = () => (e.resumen?.fase === 'cuenta' ? r('casters', 'resumen', Number.isFinite(e.resumen.faltan) ? e.resumen.faltan : null) : r('casters'));
    if (this.reposo === 'casters') return casters();
    if (this.reposo === 'pausa') return r('pausa');
    // Lo que sale en OBS (alguien la ha puesto con los botones de escena, o la emisión está apagada)
    const enObs = FASES.find(f => this.escenas[f] && this.escenas[f] === e.escenaObs);
    if (enObs === 'casters') return casters();
    return enObs ? r(enObs) : r(null);
  }
}
