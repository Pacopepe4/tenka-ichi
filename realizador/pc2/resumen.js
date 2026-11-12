// Resumen en vídeo al acabar la partida (PC 2, que es donde está OBS). Diseño aprobado el 08/11 (enfoque A).
//
// El PC 1 ve el final unos 2 minutos antes que la antena y manda con el guion la lista del resumen:
// [{ jugada, desde, hasta, t }] en segundos de partida. Los clips son los mismos que los de las repeticiones: el
// relé guarda uno al acabar cada jugada candidata (el limpio del LoL, si hay grabador, y el del búfer de OBS).
//
// Fases: sin → preparando → listo → cuenta → emitiendo → hecho
//  - sin: no hay lista, o no hay ningún clip que se pueda poner.
//  - preparando: ha llegado la lista, pero faltan clips (las últimas jugadas aún no han pasado por la antena).
//  - listo: están los clips (o la antena ya llegó al final y los que faltan se saltan).
//  - cuenta: la emisión ha pasado a Casters al acabar la partida; dura «esperaSegundos» (120), lo que tardan
//    los casters en despedirse. Al llegar a 0 sale el resumen. Con «lanzar» sale ya.
//  - emitiendo: escena Resumen; cada clip se carga en la fuente «Resumen clip» en el principio de su recorte y,
//    pasados sus segundos, el siguiente (corte seco; la placa se recarga con el minuto y hace su fundido).
//    Al acabar, vuelve a Casters.
//  - hecho: ya salió. «repetir» lo pone otra vez.
// Cancelaciones: un draft o una partida nueva en antena paran la cuenta (y el resumen) y queda en «listo», sin
// tocar la escena (la pone la emisión). «cancelar» para la cuenta o el resumen y vuelve a Casters. Un clip que no
// carga se salta y se apunta en el registro.
import { EventEmitter } from 'node:events';
import { cursorEnClip } from './grabador.js';

export const POR_DEFECTO = { esperaSegundos: 120 };

const red = x => Math.round(x * 100) / 100;
export const reloj = t => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '');

// Qué trozo de un clip sale para un recorte [desde, hasta]. El clip acaba en clip.t (segundo de antena en que se
// guardó) y lleva como mucho «bufer» segundos hacia atrás (60 con el búfer de OBS). Lo que cae fuera del clip se
// recorta. Un clip que no puede ser de esta jugada (otra partida, se guardó muy lejos) no vale: null.
export function tramoEnClip(item, clip) {
  if (!clip?.ruta || !Number.isFinite(clip.t) || !Number.isFinite(item?.desde) || !Number.isFinite(item?.hasta)) return null;
  if (clip.t < item.desde + 1 || clip.t > item.hasta + 45) return null;
  const bufer = clip.bufer ?? 60;
  const fin = Math.min(item.hasta, clip.t);
  const ini = Math.max(item.desde, clip.t - bufer + 0.5);
  if (fin - ini < 1) return null;
  const segundosAtras = red(clip.t - ini);
  const limpio = Number.isFinite(clip.inicioMs) && Number.isFinite(clip.guardadoMs);
  return { segundos: red(fin - ini), segundosAtras, ...(limpio ? { cursorMs: cursorEnClip(clip, segundosAtras) } : {}) };
}

export class Resumen extends EventEmitter {
  // clipDe(jugada): clips que hay de esa jugada, en orden de preferencia ([{ ruta, t, bufer, inicioMs?, guardadoMs? }])
  // guardarFinal(jugadas): guarda un clip para las que aún no lo tienen (se llama cuando la antena llega al final)
  // urlPlaca(item): dirección de la placa «RESUMEN» para ese clip (con su minuto)
  constructor({ opciones = {}, obs = null, escenas = {}, fuente = 'Resumen clip', placa = null, urlPlaca = null,
    clipDe = () => [], guardarFinal = null, registrar = () => {}, ahora = () => Date.now() }) {
    super();
    this.c = { ...POR_DEFECTO, ...opciones };
    this.obs = obs;
    this.escenas = { resumen: 'Resumen', casters: 'Casters', ...escenas };
    this.fuente = fuente;
    this.placa = placa;
    this.urlPlaca = urlPlaca;
    this.clipDe = clipDe;
    this.guardarFinal = guardarFinal;
    this.registrar = registrar;
    this.ahora = ahora;
    this.fase = 'sin';
    this.lista = [];
    this.firma = null;
    this.pendiente = null;    // lista nueva que llega con un resumen en marcha: entra al acabar
    this.hasta = null;        // hora (ms) en que acaba la cuenta atrás
    this.clipActual = null;   // número del clip que sale (1, 2…) mientras se emite
    this.finEnAntena = false; // la antena ya llegó al final de esta partida
    this.cuentaPendiente = false;
    this.enJuego = false;
    this.vez = 0;             // cada reproducción nueva (o cancelación) deja sin efecto la anterior
    this.despertar = null;
  }

  // Cada clip de la lista con el que se va a poner y su trozo (null si aún no hay o no vale)
  clips() {
    return this.lista.map(item => {
      for (const clip of this.clipDe(item.jugada) || []) {
        const tramo = tramoEnClip(item, clip);
        if (tramo) return { item, clip, tramo };
      }
      return { item, clip: null, tramo: null };
    });
  }

  publico() {
    const cs = this.clips();
    const listos = cs.filter(x => x.tramo);
    const estimando = this.fase === 'preparando';
    return {
      fase: this.fase,
      jugadas: estimando ? this.lista.length : listos.length,
      segundos: Math.round(estimando ? this.lista.reduce((s, x) => s + Math.max(0, x.hasta - x.desde), 0) : listos.reduce((s, x) => s + x.tramo.segundos, 0)),
      faltan: this.fase === 'cuenta' ? Math.max(0, Math.ceil((this.hasta - this.ahora()) / 1000)) : null,
      clipActual: this.fase === 'emitiendo' ? this.clipActual : null,
    };
  }

  cambiar(fase, texto) {
    if (texto) this.registrar(`[resumen] ${texto}`);
    if (this.fase === fase) return;
    this.fase = fase;
    this.emit('cambio');
  }

  // Lista que manda el PC 1 con el guion (la misma llega cada pocos segundos: solo cuenta si cambia)
  recibirLista(lista) {
    if (!Array.isArray(lista)) return;
    const firma = JSON.stringify(lista);
    if (firma === this.firma || firma === this.pendiente?.firma) return;
    if (this.fase === 'cuenta' || this.fase === 'emitiendo') { this.pendiente = { lista, firma }; return; }
    this.ponerLista(lista, firma);
  }

  ponerLista(lista, firma) {
    this.lista = lista.filter(x => x && x.jugada && Number.isFinite(x.desde) && Number.isFinite(x.hasta));
    this.firma = firma;
    this.pendiente = null;
    this.finEnAntena = false;
    this.cuentaPendiente = false;
    this.fase = 'sin';
    this.registrar(`[resumen] lista del PC 1: ${this.lista.length} clip${this.lista.length === 1 ? '' : 's'} (${this.lista.map(x => x.jugada).join(', ') || 'ninguno'})`);
    this.recalcular();
    this.emit('cambio');
  }

  // sin / preparando / listo según los clips que ya hay
  recalcular() {
    if (!['sin', 'preparando', 'listo'].includes(this.fase)) return;
    const cs = this.clips();
    const hay = cs.filter(x => x.tramo).length;
    let fase;
    if (!this.lista.length) fase = 'sin';
    else if (hay === cs.length) fase = 'listo';
    else if (this.finEnAntena) fase = hay ? 'listo' : 'sin';
    else fase = 'preparando';
    if (fase !== this.fase) {
      const antes = this.fase;
      this.fase = fase;
      if (fase === 'listo') this.registrar(`[resumen] listo: ${hay} clip${hay === 1 ? '' : 's'}${hay < cs.length ? ` (${cs.length - hay} sin clip, se saltan)` : ''}, ${this.publico().segundos} s`);
      else if (fase === 'sin' && antes !== 'sin') this.registrar('[resumen] no hay ningún clip que poner: no habrá resumen');
      this.emit('cambio');
    }
  }

  // La emisión ha pasado a Casters porque ha acabado la partida: arranca la cuenta atrás (con los clips que haya)
  async alAcabarEnAntena() {
    this.finEnAntena = true;
    this.cuentaPendiente = true;
    if (this.fase === 'preparando' && this.guardarFinal) {
      const faltan = this.clips().filter(x => !x.tramo).map(x => x.item.jugada);
      try { await this.guardarFinal(faltan); } catch (e) { this.registrar(`[resumen] no se pudo guardar el clip del final: ${e.message}`); }
    }
    this.recalcular();
    this.intentarCuenta();
  }

  intentarCuenta() {
    if (!this.cuentaPendiente || this.fase !== 'listo' || this.enJuego) return;
    this.cuentaPendiente = false;
    this.hasta = this.ahora() + this.c.esperaSegundos * 1000;
    this.cambiar('cuenta', `cuenta atrás de ${this.c.esperaSegundos} s: luego sale el resumen (${this.publico().jugadas} clips, ${this.publico().segundos} s)`);
  }

  // Cada vuelta del relé. draft: hay un draft en el panel de Gokudō. enJuego: hay otra partida saliendo en antena.
  actualizar({ draft = false, enJuego = false } = {}) {
    this.enJuego = Boolean(enJuego);
    if ((draft || enJuego) && (this.fase === 'cuenta' || this.fase === 'emitiendo')) {
      const que = draft ? 'ha empezado un draft' : 'hay una partida en antena';
      if (this.fase === 'emitiendo') this.detener();
      this.cuentaPendiente = false;
      this.cambiar('listo', `${que}: el resumen se para (queda listo, se puede lanzar a mano)`);
    }
    if (draft || enJuego) this.cuentaPendiente = false;
    this.recalcular();
    this.intentarCuenta();
    if (this.fase === 'cuenta' && this.ahora() >= this.hasta) this.reproducir('se acaba la cuenta atrás');
    if (this.pendiente && !['cuenta', 'emitiendo'].includes(this.fase)) this.ponerLista(this.pendiente.lista, this.pendiente.firma);
  }

  // Órdenes del botón: lanzar (ya) | cancelar | repetir (otra vez, desde el principio)
  async orden({ accion } = {}) {
    if (accion === 'cancelar') {
      if (this.fase === 'cuenta') { this.cambiar('listo', 'cuenta atrás cancelada: queda listo para lanzarlo a mano'); return; }
      if (this.fase === 'emitiendo') {
        this.detener();
        this.cambiar('listo', 'resumen cancelado: vuelve a Casters');
        await this.escena(this.escenas.casters);
        return;
      }
      return;
    }
    if (accion !== 'lanzar' && accion !== 'repetir') throw new Error(`No sé hacer «${accion}» con el resumen`);
    const vale = accion === 'lanzar' ? ['listo', 'cuenta', 'hecho'] : ['listo', 'cuenta', 'hecho', 'emitiendo'];
    if (!vale.includes(this.fase)) {
      throw new Error(this.fase === 'preparando' ? 'El resumen aún no está listo: faltan clips porque la partida no ha llegado al final en antena'
        : this.fase === 'emitiendo' ? 'El resumen ya está saliendo' : 'No hay resumen: no hay clips de esta partida');
    }
    if (this.enJuego) throw new Error('Hay una partida en antena: el resumen sale al acabar');
    if (!this.obs?.listo) throw new Error('OBS no está conectado');
    if (!this.clips().some(x => x.tramo)) throw new Error('No hay ningún clip que poner');
    this.reproducir(accion === 'lanzar' ? 'lanzado a mano' : 'otra vez, a mano');
  }

  // OBS cambió de escena: si alguien saca la escena Resumen a mano mientras sale, el resumen se para ahí
  fueraDeEscena(nombre) {
    if (this.fase !== 'emitiendo' || this.clipActual === null || !nombre || nombre === this.escenas.resumen) return;
    this.detener();
    this.cambiar('listo', `alguien ha puesto la escena ${nombre}: el resumen se para`);
  }

  detener() {
    this.vez++;
    this.clipActual = null;
    this.despertar?.();
  }

  esperar(ms, yo) {
    return new Promise(resolver => {
      const t = setTimeout(fin, ms);
      const self = this;
      function fin() { clearTimeout(t); if (self.despertar === fin) self.despertar = null; resolver(); }
      this.despertar = fin;
      if (yo !== this.vez) fin();
    });
  }

  async escena(nombre) {
    try { await this.obs?.escena(nombre); } catch (e) { this.registrar(`[resumen] no se pudo poner la escena ${nombre}: ${e.message}`); }
  }

  // Pone los clips seguidos en la escena Resumen y vuelve a Casters (no se espera: el relé sigue con lo suyo)
  reproducir(motivo) {
    this.detener();
    const yo = this.vez;
    this.cuentaPendiente = false;
    this.clipActual = null;
    const lista = this.clips().filter(x => x.tramo);
    this.cambiar('emitiendo', `sale el resumen (${motivo}): ${lista.length} clips, ${this.publico().segundos} s`);
    (async () => {
      let puestos = 0;
      for (const { item, clip, tramo } of lista) {
        if (yo !== this.vez) return;
        try {
          await this.obs.cargarClip({ ruta: clip.ruta, fuente: this.fuente, segundosAtras: tramo.segundosAtras, cursorMs: tramo.cursorMs });
          if (this.placa && this.urlPlaca && this.obs.ponerUrl) await this.obs.ponerUrl(this.placa, this.urlPlaca(item)).catch(() => {});
          if (yo !== this.vez) return;
          if (!puestos) await this.obs.escena(this.escenas.resumen);
        } catch (e) {
          this.registrar(`[resumen] el clip de ${item.jugada} no carga (${e.message}): se salta`);
          continue;
        }
        puestos++;
        this.clipActual = puestos;
        this.emit('cambio');
        await this.esperar(tramo.segundos * 1000, yo);
      }
      if (yo !== this.vez) return;
      this.clipActual = null;
      if (!puestos) { this.cambiar('listo', 'no ha cargado ningún clip: el resumen no sale'); return; }
      await this.escena(this.escenas.casters);
      this.cambiar('hecho', `resumen emitido (${puestos} clip${puestos === 1 ? '' : 's'}): vuelve a Casters`);
    })().catch(e => { this.registrar(`[resumen] ${e.message}`); if (yo === this.vez) this.cambiar('listo'); });
  }
}
