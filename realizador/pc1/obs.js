// Cliente mínimo de obs-websocket 5 (el que trae OBS de serie, Herramientas → Ajustes del servidor WebSocket).
// Usa el WebSocket que ya trae Node 22: sin dependencias.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const sha = t => createHash('sha256').update(t).digest('base64');

export class Obs extends EventEmitter {
  constructor({ url, clave = '' }) {
    super();
    this.url = url;
    this.clave = clave;
    this.ws = null;
    this.listo = false;
    this.pendientes = new Map();
    this.n = 0;
    this.cerrado = false;
  }

  conectar() {
    this.cerrado = false;
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.programarReintento(); return; }
    this.ws = ws;
    let abierto = false;
    ws.addEventListener('open', () => { abierto = true; });
    ws.addEventListener('message', m => this.mensaje(JSON.parse(m.data)));
    ws.addEventListener('close', e => {
      // Por qué no hay conexión, para que se vea en el registro y en la página del PC 2
      const motivo = e?.code === 4009 ? 'OBS no acepta la contraseña del WebSocket: vuelve a pasar INSTALAR-PC2.bat con OBS cerrado, o pon la contraseña del panel en OBS, Herramientas → Ajustes del servidor WebSocket'
        : !abierto ? 'OBS no contesta en el WebSocket: está cerrado o tiene el servidor apagado (en OBS, Herramientas → Ajustes del servidor WebSocket → Activar)'
          : this.listo ? 'OBS se ha cerrado o ha cortado la conexión' : `OBS ha cortado la conexión al identificarse (código ${e?.code})`;
      if (motivo !== this.problema) { this.problema = motivo; this.emit('problema', motivo); }
      this.listo = false;
      this.emit('conexion', false);
      for (const { rechazar } of this.pendientes.values()) rechazar(new Error('OBS desconectado'));
      this.pendientes.clear();
      this.programarReintento();
    });
    ws.addEventListener('error', () => {});
  }

  programarReintento() {
    if (!this.cerrado) setTimeout(() => this.conectar(), 5000);
  }

  cerrar() {
    this.cerrado = true;
    this.ws?.close();
  }

  mensaje(m) {
    if (m.op === 0) {  // Hello: identificarse, con contraseña si OBS la pide
      const a = m.d.authentication;
      const d = { rpcVersion: 1, eventSubscriptions: 1 << 6 };  // eventos de salidas (búfer de repetición)
      if (a) d.authentication = sha(sha(this.clave + a.salt) + a.challenge);
      this.ws.send(JSON.stringify({ op: 1, d }));
    } else if (m.op === 2) {
      this.listo = true;
      this.problema = null;
      this.emit('conexion', true);
    } else if (m.op === 5) {
      this.emit('evento', m.d);
    } else if (m.op === 7) {
      const p = this.pendientes.get(m.d.requestId);
      if (!p) return;
      this.pendientes.delete(m.d.requestId);
      if (m.d.requestStatus.result) p.resolver(m.d.responseData || {});
      else p.rechazar(new Error(`${m.d.requestType}: ${m.d.requestStatus.comment || m.d.requestStatus.code}`));
    }
  }

  pedir(tipo, datos = {}) {
    if (!this.listo) return Promise.reject(new Error('OBS no está conectado'));
    const id = `r${++this.n}`;
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType: tipo, requestId: id, requestData: datos } }));
      setTimeout(() => {
        if (this.pendientes.delete(id)) rechazar(new Error(`${tipo}: OBS no responde`));
      }, 5000);
    });
  }

  escena(nombre) {
    return this.pedir('SetCurrentProgramScene', { sceneName: nombre });
  }

  // Emisión, grabación y búfer de repetición: si están en marcha
  async salidas() {
    const [e, g, b] = await Promise.all([
      this.pedir('GetStreamStatus').catch(() => ({})),
      this.pedir('GetRecordStatus').catch(() => ({})),
      this.pedir('GetReplayBufferStatus').catch(() => ({})),
    ]);
    return { emitiendo: Boolean(e.outputActive), grabando: Boolean(g.outputActive), bufer: Boolean(b.outputActive) };
  }

  // modo: 'emitir' (directo en Twitch/YouTube con la clave del perfil) o 'grabar' (prueba, solo en el disco)
  arrancarSalida(modo) { return this.pedir(modo === 'grabar' ? 'StartRecord' : 'StartStream'); }
  pararSalida(modo) { return this.pedir(modo === 'grabar' ? 'StopRecord' : 'StopStream'); }
  arrancarBufer() { return this.pedir('StartReplayBuffer'); }

  // Guarda los últimos segundos del búfer de repetición y devuelve la ruta del clip
  async guardarRepeticion() {
    const { outputActive } = await this.pedir('GetReplayBufferStatus');
    if (!outputActive) throw new Error('El búfer de repetición de OBS no está activo');
    const guardado = new Promise(resolver => {
      const f = d => { if (d.eventType === 'ReplayBufferSaved') { this.off('evento', f); resolver(d.eventData.savedReplayPath); } };
      this.on('evento', f);
      setTimeout(() => { this.off('evento', f); resolver(null); }, 4000);
    });
    await this.pedir('SaveReplayBuffer');
    return (await guardado) || (await this.pedir('GetLastReplayBufferReplay')).savedReplayPath;
  }

  // Cambia de escena con una transición concreta de OBS (por ejemplo un «Stinger» rápido) y deja la que había
  async escenaCon(nombre, transicion) {
    if (!transicion) return this.escena(nombre);
    let antes = null;
    try { antes = (await this.pedir('GetCurrentSceneTransition')).transitionName; } catch { /* sin datos: se deja la nueva */ }
    try { await this.pedir('SetCurrentSceneTransition', { transitionName: transicion }); } catch { return this.escena(nombre); }
    await this.escena(nombre);
    // La transición se queda puesta hasta que acaba; luego se vuelve a la de siempre
    if (antes && antes !== transicion) setTimeout(() => this.pedir('SetCurrentSceneTransition', { transitionName: antes }).catch(() => {}), 3000).unref?.();
  }

  // Enciende o apaga una fuente dentro de una escena (por ejemplo el overlay de REPLAY)
  async fuenteVisible(escena, fuente, visible) {
    const { sceneItemId } = await this.pedir('GetSceneItemId', { sceneName: escena, sourceName: fuente });
    await this.pedir('SetSceneItemEnabled', { sceneName: escena, sceneItemId, sceneItemEnabled: visible });
  }

  // Repetición completa: transición de entrada, overlay de REPLAY, el clip y, al acabar, transición de salida
  // a la escena de juego. g: opciones de obs.repeticion (transicionEntrada, transicionSalida, overlay).
  async repeticionCompleta({ ruta, fuente, escena, escenaJuego, segundosAtras, segundos, g = {} }) {
    if (g.overlay) await this.fuenteVisible(escena, g.overlay, true).catch(() => {});
    await this.lanzarRepeticion({ ruta, fuente, escena, segundosAtras, transicion: g.transicionEntrada });
    setTimeout(async () => {
      try {
        await this.escenaCon(escenaJuego, g.transicionSalida);
        if (g.overlay) setTimeout(() => this.fuenteVisible(escena, g.overlay, false).catch(() => {}), 2000).unref?.();
      } catch { /* OBS cerrado: nada que hacer */ }
    }, segundos * 1000).unref?.();
  }

  // Pone el clip en la fuente de repetición, salta a su escena y lo arranca unos segundos antes del final
  async lanzarRepeticion({ ruta, fuente, escena, segundosAtras, transicion }) {
    await this.pedir('SetInputSettings', { inputName: fuente, inputSettings: { local_file: ruta, is_local_file: true, restart_on_activate: false } });
    await this.pedir('TriggerMediaInputAction', { inputName: fuente, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
    await new Promise(r => setTimeout(r, 300));
    try {
      const { mediaDuration } = await this.pedir('GetMediaInputStatus', { inputName: fuente });
      if (mediaDuration > 0) await this.pedir('SetMediaInputCursor', { inputName: fuente, mediaCursor: Math.max(0, mediaDuration - segundosAtras * 1000) });
    } catch { /* si no da la duración, el clip va desde el principio */ }
    await this.escenaCon(escena, transicion);
  }
}

// Cuántos segundos antes del final del clip arranca la repetición: se repite el final de la jugada (el remate),
// no el principio, y el colchón adelanta el arranque por si OBS guardó el clip un poco más tarde de lo calculado.
// clip.t: segundo de antena en que se guardó el clip (más o menos donde acaba).
export function segundosAtras(a, clip, colchon = 0) {
  const inicio = Math.max(a.desdeT, a.hastaT - a.segundos) - (a.colchon ?? colchon ?? 0);
  return clip.t - inicio;
}
