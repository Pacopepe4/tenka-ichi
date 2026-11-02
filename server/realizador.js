// Puente del realizador automático (repo Pacopepe4/realizador) entre sus dos PCs, que no están en la misma red.
// Cada PC se conecta a /realizador y entra en una sala con la huella de la contraseña que han puesto los dos
// (sha256, nunca la contraseña). El servidor no entiende lo que pasa: reenvía cada mensaje del PC 1 al PC 2 de
// la misma sala y al revés, y avisa a cada uno de si el otro está conectado.
//
//   → { tipo: 'unirse', sala: '<64 hex>', papel: 'pc1' | 'pc2' }
//   ← { tipo: 'unido', papel, companero: true|false }
//   ← { tipo: 'companero', conectado: true|false }
//   → cualquier otro mensaje JSON: llega tal cual al otro PC de la sala
import { WebSocketServer } from 'ws';

const PAPELES = new Set(['pc1', 'pc2']);
const otro = papel => (papel === 'pc1' ? 'pc2' : 'pc1');

export function crearSalasRealizador({ maxSalas = 50 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
  const salas = new Map();  // sala → { pc1: ws, pc2: ws }

  const enviar = (ws, m) => { if (ws?.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };

  function salir(ws) {
    const s = salas.get(ws.sala);
    if (!s || s[ws.papel] !== ws) return;
    delete s[ws.papel];
    enviar(s[otro(ws.papel)], { tipo: 'companero', conectado: false });
    if (!s.pc1 && !s.pc2) salas.delete(ws.sala);
  }

  wss.on('connection', ws => {
    ws.vivo = true;
    ws.on('pong', () => { ws.vivo = true; });
    ws.on('close', () => salir(ws));
    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!ws.sala) {
        if (m?.tipo !== 'unirse' || !/^[0-9a-f]{64}$/.test(m.sala || '') || !PAPELES.has(m.papel)) {
          enviar(ws, { tipo: 'error', error: 'Primero hay que unirse a una sala' });
          return ws.close();
        }
        if (!salas.has(m.sala) && salas.size >= maxSalas) { enviar(ws, { tipo: 'error', error: 'Demasiadas salas' }); return ws.close(); }
        const s = salas.get(m.sala) || {};
        salas.set(m.sala, s);
        // El mismo papel otra vez (se reconecta o se abrió dos veces): se queda el nuevo
        if (s[m.papel] && s[m.papel] !== ws) { const viejo = s[m.papel]; viejo.sala = null; viejo.close(4000, 'Otro PC ha entrado con el mismo papel'); }
        ws.sala = m.sala;
        ws.papel = m.papel;
        s[m.papel] = ws;
        enviar(ws, { tipo: 'unido', papel: m.papel, companero: Boolean(s[otro(m.papel)]) });
        enviar(s[otro(m.papel)], { tipo: 'companero', conectado: true });
        return;
      }
      enviar(salas.get(ws.sala)?.[otro(ws.papel)], raw.toString());
    });
  });

  // Mantiene vivas las conexiones (Render corta las inactivas) y suelta las muertas
  const latido = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.vivo) { ws.terminate(); continue; }
      ws.vivo = false;
      ws.ping();
    }
  }, 25000);
  latido.unref?.();

  return {
    wss,
    salas,
    handleUpgrade: (req, socket, head) => wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)),
    cerrar() { clearInterval(latido); wss.close(); },
  };
}
