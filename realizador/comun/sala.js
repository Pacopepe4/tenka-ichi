// Puente por internet entre los dos PCs: los dos se conectan a la sala del realizador en el servidor de
// Gokudō (wss://.../realizador) con la huella de la misma contraseña, y el servidor se pasa los mensajes.
// Sirve aunque los PCs estén en redes distintas. Usa el WebSocket que trae Node 22: sin dependencias.
//
// Eventos: 'conexion' (true/false, con el servidor), 'companero' (true/false, el otro PC), 'mensaje' (objeto).
import { EventEmitter } from 'node:events';
import { ficha } from './puente.js';

export const URL_TENKA = 'wss://tenka-ichi.onrender.com/realizador';

export class Sala extends EventEmitter {
  constructor({ url = URL_TENKA, clave, papel }) {
    super();
    this.url = url;
    this.sala = ficha(clave);
    this.papel = papel;
    this.ws = null;
    this.unido = false;
    this.companero = false;
    this.cerrado = false;
    this.esperaMs = 2000;
  }

  conectar() {
    this.cerrado = false;
    let ws;
    try { ws = new WebSocket(this.url); } catch { this.reintentar(); return; }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.esperaMs = 2000;
      ws.send(JSON.stringify({ tipo: 'unirse', sala: this.sala, papel: this.papel }));
    });
    ws.addEventListener('message', m => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d.tipo === 'unido') {
        this.unido = true;
        this.emit('conexion', true);
        this.ponerCompanero(Boolean(d.companero));
      } else if (d.tipo === 'companero') {
        this.ponerCompanero(Boolean(d.conectado));
      } else if (d.tipo === 'error') {
        this.emit('aviso', d.error);
      } else {
        this.emit('mensaje', d);
      }
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      if (this.unido) this.emit('conexion', false);
      this.unido = false;
      this.ponerCompanero(false);
      this.reintentar();
    });
    ws.addEventListener('error', () => {});
  }

  ponerCompanero(v) {
    if (this.companero === v) return;
    this.companero = v;
    this.emit('companero', v);
  }

  // Render dormido tarda en despertar: se reintenta cada vez más despacio (hasta 15 s)
  reintentar() {
    if (this.cerrado) return;
    setTimeout(() => this.conectar(), this.esperaMs).unref?.();
    this.esperaMs = Math.min(this.esperaMs * 1.5, 15000);
  }

  enviar(mensaje) {
    if (!this.unido || this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(mensaje));
    return true;
  }

  cerrar() {
    this.cerrado = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
