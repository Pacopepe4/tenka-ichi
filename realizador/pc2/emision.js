// Emisión con un solo botón (la lleva el relé del PC 2, que es donde está OBS).
//
// Se «arma» cuando se quiera, aunque falten cosas. A partir de ahí el relé se encarga de los tiempos:
//  1. Espera a que estén todas las condiciones (los dos PCs conectados, OBS, la partida en los dos LoL).
//  2. Unos segundos antes de que la antena llegue al segundo 0 de la partida, pone la escena de previa,
//     arranca el búfer de repetición si no lo estaba y empieza a emitir (o a grabar, en modo prueba).
//  3. Cuando la antena arranca en el segundo 0, salta a la escena de juego: la emisión empieza desde el principio.
//  4. Cuando la antena llega al final de la partida, pone la escena final (casters) y se queda armada para la
//     siguiente partida, sin cortar la emisión. «Terminar» la corta.
import { EventEmitter } from 'node:events';

export const POR_DEFECTO = {
  modo: 'emitir',            // emitir | grabar
  previaSegundos: 10,        // cuánto antes del segundo 0 empieza a emitir (con la escena de previa)
  segundosTrasFin: 5,        // cuánto se deja ver el final antes de pasar a la escena final
  sinJuegoSegundos: 8,       // si el LoL del PC 2 deja de responder este rato en directo, la partida ha acabado
  pararAlAcabar: false,      // cortar la emisión sola al acabar la partida (si no, sigue en la escena final)
  pararTrasSegundos: 60,
};

export class Emision extends EventEmitter {
  constructor({ opciones = {}, escenas = {}, obs = null, registrar = () => {} }) {
    super();
    this.c = { ...POR_DEFECTO, ...opciones };
    this.escenas = { juego: 'Juego', previa: 'Pausa', final: 'Casters', ...escenas };
    this.obs = obs;
    this.registrar = registrar;
    this.fase = 'apagada';   // apagada | armada | previa | directo
    this.modo = this.c.modo === 'grabar' ? 'grabar' : 'emitir';
    this.error = null;
    this.salidas = null;     // { emitiendo, grabando, bufer } de OBS
    this.inicio = null;      // hora en que salió la partida en antena
    this.desdeSegundo = null; // segundo de partida en que empezó (0 si fue desde el principio)
    this.partidas = 0;       // partidas emitidas desde que se armó
    this.ultimoFin = null;
    this.sinJuegoDesde = null;
    this.pararEn = null;
    this.esperaNueva = false; // tras acabar una partida, no se vuelve a entrar hasta que empiece otra
    this.reintentoEn = 0;
    this.ultimasSalidas = 0;
  }

  get salidaActiva() {
    if (!this.salidas) return false;
    return this.modo === 'grabar' ? this.salidas.grabando : this.salidas.emitiendo;
  }

  publico() {
    return {
      fase: this.fase, modo: this.modo, error: this.error, salidas: this.salidas, enElAire: this.salidaActiva,
      inicio: this.inicio, desdeSegundo: this.desdeSegundo, partidas: this.partidas, ultimoFin: this.ultimoFin,
      previaSegundos: this.c.previaSegundos,
    };
  }

  // Órdenes del botón (de cualquiera de los dos PCs o del panel de TENKA ICHI)
  async orden({ accion, modo } = {}) {
    if (accion === 'armar') {
      if (this.fase !== 'apagada') return;
      if (modo === 'grabar' || modo === 'emitir') this.modo = modo;
      this.fase = 'armada';
      this.error = null;
      this.partidas = 0;
      this.ultimoFin = null;
      this.esperaNueva = false;
      this.reintentoEn = 0;
      this.registrar(`[emisión] armada (${this.modo === 'grabar' ? 'solo grabar' : 'emitir en directo'}): empieza sola cuando la antena llegue al principio de la partida`);
    } else if (accion === 'cancelar' || accion === 'terminar') {
      const estaba = this.fase;
      this.fase = 'apagada';
      this.inicio = null;
      this.pararEn = null;
      this.error = null;
      if (this.salidaActiva || accion === 'terminar') await this.parar();
      this.registrar(`[emisión] ${estaba === 'directo' || accion === 'terminar' ? 'terminada' : 'cancelada'}`);
    } else if (accion === 'modo' && this.fase === 'apagada' && (modo === 'grabar' || modo === 'emitir')) {
      this.modo = modo;
    } else return;
    this.emit('cambio');
  }

  async parar() {
    if (!this.obs?.listo) return;
    try {
      await this.leerSalidas(true);
      if (this.salidaActiva) await this.obs.pararSalida(this.modo);
      await this.leerSalidas(true);
    } catch (e) { this.error = `No se pudo parar OBS: ${e.message}`; }
  }

  async leerSalidas(ya = false) {
    if (!this.obs?.listo || !this.obs.salidas) { this.salidas = null; return; }
    if (!ya && Date.now() - this.ultimasSalidas < 2000) return;
    this.ultimasSalidas = Date.now();
    try { this.salidas = await this.obs.salidas(); } catch { /* se vuelve a mirar en 2 s */ }
  }

  async escena(nombre) {
    try { await this.obs.escena(nombre); } catch (e) { this.registrar(`[emisión] no se pudo poner la escena ${nombre}: ${e.message}`); }
  }

  // Cada vuelta del relé. meta: segundo de partida al que va (o irá) la antena; negativo mientras espera el margen.
  // tAntena: segundo que se ve en la antena. juego: el LoL del PC 2 responde. listo: todas las condiciones.
  // tFin: segundo de partida en que acabó (lo manda el PC 1), o null.
  async paso({ meta, tAntena, pausado, juego, listo, tFin = null }) {
    await this.leerSalidas();
    const ahora = Date.now();
    if (this.pararEn && ahora >= this.pararEn) {
      this.pararEn = null;
      if (this.fase === 'armada') { this.fase = 'apagada'; await this.parar(); this.registrar('[emisión] cortada al acabar la partida'); this.emit('cambio'); }
    }
    if (this.fase === 'apagada') return;
    this.sinJuegoDesde = juego ? null : (this.sinJuegoDesde ?? ahora);

    if (this.fase === 'armada') {
      // Otra partida: el LoL del PC 2 se cerró, o la antena vuelve a esperar el margen desde el principio
      if (this.esperaNueva && (!juego || (Number.isFinite(meta) && meta < -this.c.previaSegundos))) this.esperaNueva = false;
      if (this.esperaNueva) return;
      if (!listo || meta === null || meta === undefined || ahora < this.reintentoEn) return;
      if (meta < -this.c.previaSegundos) return;
      // Faltan pocos segundos para el principio (o ya ha empezado): a emitir
      try {
        if (!this.salidaActiva) {
          if (this.salidas && !this.salidas.bufer) await this.obs.arrancarBufer().catch(e => this.registrar(`[emisión] búfer de repetición: ${e.message}`));
          await this.escena(meta < 0 ? this.escenas.previa : this.escenas.juego);
          await this.obs.arrancarSalida(this.modo);
          await this.leerSalidas(true);
          this.registrar(`[emisión] ${this.modo === 'grabar' ? 'grabando' : 'emitiendo'}${meta < 0 ? ` (previa: la partida sale en ${Math.round(-meta)} s)` : ''}`);
        }
        this.error = null;
        this.pararEn = null;
        this.fase = 'previa';
        this.emit('cambio');
      } catch (e) {
        this.error = `OBS no ha podido ${this.modo === 'grabar' ? 'grabar' : 'emitir'}: ${e.message}`;
        this.reintentoEn = ahora + 10000;
        this.registrar(`[emisión] ${this.error}`);
        this.emit('cambio');
        return;
      }
    }

    if (this.fase === 'previa') {
      if (meta === null || meta === undefined || meta < 0 || pausado) return;
      await this.escena(this.escenas.juego);
      this.fase = 'directo';
      this.inicio = new Date().toISOString();
      this.desdeSegundo = Math.max(0, Math.round(tAntena ?? meta));
      this.registrar(`[emisión] partida en antena desde el segundo ${this.desdeSegundo}`);
      this.emit('cambio');
      return;
    }

    if (this.fase === 'directo') {
      const acabada = (Number.isFinite(tFin) && tAntena !== null && tAntena >= tFin + this.c.segundosTrasFin)
        || (this.sinJuegoDesde && ahora - this.sinJuegoDesde > this.c.sinJuegoSegundos * 1000);
      if (!acabada) return;
      await this.escena(this.escenas.final);
      this.partidas++;
      this.ultimoFin = new Date().toISOString();
      this.inicio = null;
      // Se queda armada: la siguiente partida entra sola sin cortar la emisión
      this.fase = 'armada';
      this.esperaNueva = true;
      if (this.c.pararAlAcabar) this.pararEn = ahora + this.c.pararTrasSegundos * 1000;
      this.registrar(`[emisión] partida terminada: escena ${this.escenas.final}${this.c.pararAlAcabar ? `; se corta en ${this.c.pararTrasSegundos} s` : '; la siguiente entra sola'}`);
      this.emit('cambio');
    }
  }
}
