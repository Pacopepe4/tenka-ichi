// Emisión con un solo botón (la lleva el relé del PC 2, que es donde está OBS).
//
// Se «arma» cuando se quiera, aunque falten cosas. A partir de ahí el relé se encarga de los tiempos:
//  1. Espera a que estén todas las condiciones (los dos PCs conectados, OBS, la partida en los dos LoL).
//  2. Unos segundos antes de que la antena llegue al segundo 0 de la partida, pone la escena de previa,
//     arranca el búfer de repetición si no lo estaba y empieza a emitir (o a grabar, en modo prueba).
//  3. Cuando la antena arranca en el segundo 0, salta a la escena de juego: la emisión empieza desde el principio.
//  4. Cuando la antena llega al final de la partida, pone la escena final (casters) y se queda armada para la
//     siguiente partida, sin cortar la emisión. «Terminar» la corta.
//  Draft: si el panel de Gokudō tiene un draft en marcha (DraftCore conectado), pone la escena de draft (con
//  las cámaras); si aún no se emitía, el botón empieza a emitir ya, con el draft. Al acabar el draft y salir de
//  su pantalla, pasa a la escena de previa hasta que la partida llegue a la antena.
//  Lo único que no hace solo es empezar: el botón «Empezar directo», o empezar a emitir a mano en OBS (entonces
//  se arma sola). Si se corta la emisión en OBS, se apaga también aquí.
import { EventEmitter } from 'node:events';

export const POR_DEFECTO = {
  modo: 'emitir',            // emitir | grabar
  previaSegundos: 10,        // cuánto antes del segundo 0 empieza a emitir (con la escena de previa)
  segundosTrasFin: 5,        // cuánto se deja ver el final antes de pasar a la escena final
  sinJuegoSegundos: 8,       // si el LoL del PC 2 deja de responder este rato en directo, la partida ha acabado
  pararAlAcabar: false,      // cortar la emisión sola al acabar la partida (si no, sigue en la escena final)
  pararTrasSegundos: 60,
  armarSiEmiteAMano: true,   // empezar a emitir en OBS a mano también arma el realizador
  buferSiempre: true,        // con OBS conectado, el búfer de repeticiones siempre en marcha (si se para, se arranca)
};

export class Emision extends EventEmitter {
  constructor({ opciones = {}, escenas = {}, obs = null, registrar = () => {} }) {
    super();
    this.c = { ...POR_DEFECTO, ...opciones };
    this.escenas = { juego: 'Juego', previa: 'Pausa', final: 'Casters', draft: 'Draft', ...escenas };
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
    this.finVisto = null;
    this.pararEn = null;
    this.esperaNueva = false; // tras acabar una partida, no se vuelve a entrar hasta que empiece otra
    this.reintentoEn = 0;
    this.ultimasSalidas = 0;
    this.escenaAuto = null;   // la última escena que puso esto solo: draft | previa | juego | final
    this.estabaEnAire = false;
    this.parando = false;
  }

  get salidaActiva() {
    if (!this.salidas) return false;
    return this.modo === 'grabar' ? this.salidas.grabando : this.salidas.emitiendo;
  }

  publico() {
    return {
      fase: this.fase, modo: this.modo, error: this.error, salidas: this.salidas, enElAire: this.salidaActiva,
      inicio: this.inicio, desdeSegundo: this.desdeSegundo, partidas: this.partidas, ultimoFin: this.ultimoFin,
      previaSegundos: this.c.previaSegundos, draft: this.draft || null,
    };
  }

  // Órdenes del botón (de cualquiera de los dos PCs o del panel de Gokudō)
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
      this.escenaAuto = null;
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
    this.parando = true;
    try {
      await this.leerSalidas(true);
      if (this.salidaActiva) await this.obs.pararSalida(this.modo);
      await this.leerSalidas(true);
    } catch (e) { this.error = `No se pudo parar OBS: ${e.message}`; }
    finally { this.parando = false; this.estabaEnAire = this.salidaActiva; }
  }

  // Pone una escena que decide esto solo, una vez por cambio (si alguien la cambia a mano, no se le pelea)
  async escenaSola(clave) {
    if (this.escenaAuto === clave) return false;
    this.escenaAuto = clave;
    await this.escena(this.escenas[clave]);
    return true;
  }

  async leerSalidas(ya = false) {
    if (!this.obs?.listo || !this.obs.salidas) { this.salidas = null; return; }
    if (!ya && Date.now() - this.ultimasSalidas < 2000) return;
    this.ultimasSalidas = Date.now();
    try { this.salidas = await this.obs.salidas(); } catch { /* se vuelve a mirar en 2 s */ }
  }

  esperaReintento() { return (this.c.reintentoSegundos ?? 15) * 1000; }

  // El búfer de repeticiones tiene que estar en marcha siempre que OBS esté conectado (10/11: se quedó parado y
  // no hubo repeticiones). Si está parado se arranca, como mucho una vez cada reintentoSegundos: pedirle cosas a
  // OBS sin parar lo tumbó el 09/11. El mismo error no se repite en el registro.
  async vigilarBufer(ahora = Date.now()) {
    if (this.c.buferSiempre === false || !this.obs?.listo || !this.obs.arrancarBufer || !this.salidas) return;
    if (this.salidas.bufer) { this.errorBufer = null; return; }
    if (ahora - (this.intentoBufer || 0) < this.esperaReintento()) return;
    this.intentoBufer = ahora;
    try {
      await this.obs.arrancarBufer();
      this.registrar('[emisión] el búfer de repetición estaba parado: arrancado');
      this.errorBufer = null;
    } catch (e) {
      if (this.errorBufer !== e.message) this.registrar(`[emisión] el búfer de repetición no arranca: ${e.message}`);
      this.errorBufer = e.message;
    }
    await this.leerSalidas(true);
  }

  // Se pidió empezar a emitir (o grabar) y, pasado el rato, OBS sigue sin hacerlo: se dice por qué puede ser
  avisarSiNoArranca(ahora = Date.now()) {
    if (!this.intentoSalida || this.salidaActiva || ahora - this.intentoSalida < this.esperaReintento()) return;
    this.intentoSalida = null;
    this.error = this.modo === 'grabar'
      ? 'OBS no ha conseguido empezar a grabar: mira la carpeta de grabación en OBS (Ajustes → Salida)'
      : 'OBS no ha conseguido empezar a emitir: revisa el servidor y la clave de retransmisión en OBS (Ajustes → Emisión) y su registro (Ayuda → Archivos de registro)';
    this.registrar(`[emisión] ${this.error}`);
    this.emit('cambio');
  }

  async escena(nombre) {
    try { await this.obs.escena(nombre); } catch (e) { this.registrar(`[emisión] no se pudo poner la escena ${nombre}: ${e.message}`); }
  }

  // Cada vuelta del relé. meta: segundo de partida al que va (o irá) la antena; negativo mientras espera el margen.
  // tAntena: segundo que se ve en la antena. juego: el LoL del PC 2 responde. listo: todas las condiciones.
  // tFin: segundo de partida en que acabó (lo manda el PC 1), o null.
  // draft: 'draft' | 'postdraft' | null, lo que enseña el panel de Gokudō (draft en marcha o recién cerrado).
  // finEsperado: hora (ms) a la que la antena llega al final: cuando el PC 1 lo vio más el margen. Sirve aunque
  // la Replay API del PC 2 deje de contestar al acabar la partida (el LoL sigue enseñando lo que tenía guardado).
  async paso({ meta, tAntena, pausado, juego, listo, tFin = null, draft = null, finEsperado = null }) {
    await this.leerSalidas();
    const ahora = Date.now();
    if ((this.draft || null) !== (draft || null)) { this.draft = draft || null; this.emit('cambio'); }
    // ¿Arrancó de verdad lo que se pidió a OBS?
    if (this.salidaActiva && this.intentoSalida) this.intentoSalida = null;
    else this.avisarSiNoArranca(ahora);
    await this.vigilarBufer(ahora);
    // Lo que pasa en OBS a mano: empezar a emitir arma el realizador; cortar la emisión lo apaga
    if (this.salidas && !this.parando) {
      const enAire = Boolean(this.salidas.emitiendo || (this.modo === 'grabar' && this.salidas.grabando));
      if (this.fase === 'apagada' && this.salidas.emitiendo && !this.estabaEnAire && this.c.armarSiEmiteAMano) {
        this.modo = 'emitir';
        await this.orden({ accion: 'armar', modo: 'emitir' });
        this.registrar('[emisión] has empezado a emitir en OBS: el realizador se encarga de las escenas');
      } else if (this.fase !== 'apagada' && this.estabaEnAire && !enAire) {
        this.fase = 'apagada';
        this.inicio = null;
        this.pararEn = null;
        this.registrar('[emisión] la emisión se ha cortado en OBS: el realizador deja de cambiar escenas');
        this.emit('cambio');
      }
      this.estabaEnAire = enAire;
    }
    if (this.pararEn && ahora >= this.pararEn) {
      this.pararEn = null;
      if (this.fase === 'armada') { this.fase = 'apagada'; await this.parar(); this.registrar('[emisión] cortada al acabar la partida'); this.emit('cambio'); }
    }
    if (this.fase === 'apagada') return;
    this.sinJuegoDesde = juego ? null : (this.sinJuegoDesde ?? ahora);

    if (this.fase === 'armada') {
      // Draft en el panel de Gokudō: su escena (y, si aún no se emitía, se empieza ya, con el draft)
      if (draft) {
        if (!this.salidaActiva && this.obs?.arrancarSalida && ahora >= this.reintentoEn) {
          // OBS acepta la orden aunque luego no consiga conectar (clave o servidor mal): no se vuelve a pedir en
          // cada vuelta (en la prueba del 09/11 eso colgó OBS), sino pasados «reintentoSegundos»
          this.avisarSiNoArranca(ahora);
          this.reintentoEn = ahora + this.esperaReintento();
          try {
            if (this.escenaAuto !== 'draft') await this.escena(this.escenas.draft);
            this.escenaAuto = 'draft';
            await this.obs.arrancarSalida(this.modo);
            this.intentoSalida = ahora;
            await this.leerSalidas(true);
            this.estabaEnAire = this.salidaActiva;
            if (this.salidaActiva) { this.error = null; this.reintentoEn = 0; }
            this.registrar(`[emisión] ${this.modo === 'grabar' ? 'grabando' : 'emitiendo'} con el draft`);
          } catch (e) {
            this.error = `OBS no ha podido ${this.modo === 'grabar' ? 'grabar' : 'emitir'}: ${e.message}`;
            this.reintentoEn = ahora + 10000;
            this.registrar(`[emisión] ${this.error}`);
          }
          this.emit('cambio');
        } else if (this.salidaActiva && await this.escenaSola('draft')) {
          this.registrar(`[emisión] draft en marcha: escena ${this.escenas.draft}`);
          this.emit('cambio');
        }
      } else if (this.escenaAuto === 'draft' && this.salidaActiva) {
        // Se acabó el draft (y su pantalla): a la previa hasta que llegue la partida
        await this.escenaSola('previa');
        this.registrar(`[emisión] draft terminado: escena ${this.escenas.previa} hasta que empiece la partida`);
        this.emit('cambio');
      }
      // Otra partida: el LoL del PC 2 se cerró, o la antena vuelve a esperar el margen desde el principio
      // (solo cuando el PC 1 ya no da el final: mientras lo dé, sigue siendo la misma partida)
      if (this.esperaNueva && !Number.isFinite(tFin) && (!juego || (Number.isFinite(meta) && meta < -this.c.previaSegundos))) this.esperaNueva = false;
      if (this.esperaNueva) return;
      if (!listo || meta === null || meta === undefined || (ahora < this.reintentoEn && !this.salidaActiva)) return;
      if (meta < -this.c.previaSegundos) return;
      // Faltan pocos segundos para el principio (o ya ha empezado): a emitir
      try {
        if (!this.salidaActiva) {
          if (this.salidas && !this.salidas.bufer) await this.obs.arrancarBufer().catch(e => this.registrar(`[emisión] búfer de repetición: ${e.message}`));
          await this.escena(meta < 0 ? this.escenas.previa : this.escenas.juego);
          await this.obs.arrancarSalida(this.modo);
          this.intentoSalida = ahora;
          await this.leerSalidas(true);
          this.estabaEnAire = this.salidaActiva;
          this.registrar(`[emisión] ${this.modo === 'grabar' ? 'grabando' : 'emitiendo'}${meta < 0 ? ` (previa: la partida sale en ${Math.round(-meta)} s)` : ''}`);
        } else if (meta < 0) {
          // Ya se emitía (el draft, los casters): a la previa unos segundos antes de que salga la partida
          if (await this.escenaSola('previa')) this.registrar(`[emisión] la partida sale en ${Math.round(-meta)} s: escena ${this.escenas.previa}`);
        }
        this.escenaAuto = meta < 0 ? 'previa' : 'juego';
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
      this.escenaAuto = 'juego';
      this.fase = 'directo';
      this.inicio = new Date().toISOString();
      this.desdeSegundo = Math.max(0, Math.round(tAntena ?? meta));
      this.registrar(`[emisión] partida en antena desde el segundo ${this.desdeSegundo}`);
      this.emit('cambio');
      return;
    }

    if (this.fase === 'directo') {
      // La antena se para en el final: desde que llega, se deja ver «segundosTrasFin» y se pasa a la escena final
      if (Number.isFinite(tFin) && tAntena !== null && tAntena >= tFin - 1) this.finVisto ??= ahora;
      else this.finVisto = null;
      // Con el final avisado, también por la hora (la API puede callarse al acabar aunque el LoL siga enseñando la
      // partida). Que el LoL no conteste solo cuenta si no se sabe cuándo acaba: si no, cortaría los 2 últimos minutos.
      const tras = this.c.segundosTrasFin * 1000;
      const conFinAvisado = Number.isFinite(tFin) && Number.isFinite(finEsperado);
      const motivo = this.finVisto !== null && ahora - this.finVisto >= tras ? 'la antena ha llegado al final'
        : conFinAvisado && ahora >= finEsperado + tras ? 'es la hora del final (el PC 1 lo vio hace el margen)'
          : !conFinAvisado && this.sinJuegoDesde && ahora - this.sinJuegoDesde > this.c.sinJuegoSegundos * 1000 ? 'el LoL de este PC no contesta'
            : null;
      if (!motivo) return;
      await this.escena(this.escenas.final);
      this.escenaAuto = 'final';
      this.partidas++;
      this.ultimoFin = new Date().toISOString();
      this.inicio = null;
      // Se queda armada: la siguiente partida entra sola sin cortar la emisión
      this.fase = 'armada';
      this.esperaNueva = true;
      this.finVisto = null;
      if (this.c.pararAlAcabar) this.pararEn = ahora + this.c.pararTrasSegundos * 1000;
      this.registrar(`[emisión] partida terminada (${motivo}): escena ${this.escenas.final}${this.c.pararAlAcabar ? `; se corta en ${this.c.pararTrasSegundos} s` : '; la siguiente entra sola'}`);
      this.emit('cambio');
    }
  }
}
