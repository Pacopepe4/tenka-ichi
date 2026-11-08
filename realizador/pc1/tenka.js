// Conexión con el panel de Gokudō: manda las mismas acciones que el panel (por su WebSocket /ws, con la
// contraseña del panel). Así el realizador usa el overlay, el draft y el marcador que ya existen en vez de
// duplicarlos. Ejemplo: { accion: 'grafico', datos: { tipo: 'lineas', segundos: 20 } } saca el línea por línea.
import { EventEmitter } from 'node:events';

export class Tenka extends EventEmitter {
  constructor({ url, clave = '' }) {
    super();
    this.url = url;
    this.clave = clave;
    this.ws = null;
    this.listo = false;
    this.n = 0;
    this.pendientes = new Map();
    this.cerrado = false;
    this.estado = null;
  }

  conectar() {
    this.cerrado = false;
    let ws;
    try { ws = new WebSocket(this.url); } catch { this.reintentar(); return; }
    this.ws = ws;
    ws.addEventListener('open', () => { this.listo = true; this.emit('conexion', true); });
    ws.addEventListener('message', m => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d.tipo === 'estado') { this.estado = d.estado; this.emit('estado', d.estado); }
      if (d.tipo === 'respuesta') {
        const p = this.pendientes.get(d.id);
        if (!p) return;
        this.pendientes.delete(d.id);
        if (d.ok === false) p.rechazar(new Error(d.error || 'El panel no acepta la acción'));
        else p.resolver(d);
      }
    });
    ws.addEventListener('close', () => {
      this.listo = false;
      this.emit('conexion', false);
      this.reintentar();
    });
    ws.addEventListener('error', () => {});
  }

  reintentar() {
    if (!this.cerrado) setTimeout(() => this.conectar(), 5000);
  }

  cerrar() {
    this.cerrado = true;
    this.ws?.close();
  }

  accion(accion, datos = {}) {
    if (!this.listo) return Promise.reject(new Error('Sin conexión con el panel de Gokudō'));
    const id = `realizador-${++this.n}`;
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      this.ws.send(JSON.stringify({ tipo: 'accion', id, clave: this.clave, accion, datos }));
      setTimeout(() => { if (this.pendientes.delete(id)) rechazar(new Error(`${accion}: el panel no responde`)); }, 5000);
    });
  }
}
