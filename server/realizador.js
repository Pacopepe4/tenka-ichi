// Puente del realizador automático (repo Pacopepe4/realizador) entre sus dos PCs, que no están en la misma red.
// Cada PC se conecta a /realizador y entra en una sala con la huella de la contraseña que han puesto los dos
// (sha256, nunca la contraseña). El servidor no entiende lo que pasa: reenvía cada mensaje del PC 1 al PC 2 de
// la misma sala y al revés, y avisa a cada uno de si el otro está conectado.
//
//   → { tipo: 'unirse', sala: '<64 hex>', papel: 'pc1' | 'pc2' | 'panel' }
//   ← { tipo: 'unido', papel, companero: true|false }
//   ← { tipo: 'companero', conectado: true|false }        (a los PCs)
//   ← { tipo: 'presentes', pc1: true|false, pc2: true|false } (a los paneles)
//   → cualquier otro mensaje JSON: llega tal cual al otro PC de la sala.
//     Del PC 1, las «foto» (el estado del realizador) van a los paneles abiertos y no al PC 2.
//     De un panel (el de TENKA ICHI, con la contraseña del realizador), todo va al PC 1.
import { WebSocketServer } from 'ws';

const PAPELES = new Set(['pc1', 'pc2', 'panel']);
const otro = papel => (papel === 'pc1' ? 'pc2' : 'pc1');

export function crearSalasRealizador({ maxSalas = 50 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
  const salas = new Map();  // sala → { pc1: ws, pc2: ws, paneles: Set<ws> }

  const enviar = (ws, m) => { if (ws?.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };

  const presentes = s => {
    const m = JSON.stringify({ tipo: 'presentes', pc1: Boolean(s.pc1), pc2: Boolean(s.pc2) });
    for (const p of s.paneles) enviar(p, m);
  };

  function salir(ws) {
    const s = salas.get(ws.sala);
    if (!s) return;
    if (ws.papel === 'panel') s.paneles.delete(ws);
    else {
      if (s[ws.papel] !== ws) return;
      delete s[ws.papel];
      enviar(s[otro(ws.papel)], { tipo: 'companero', conectado: false });
      presentes(s);
    }
    if (!s.pc1 && !s.pc2 && !s.paneles.size) salas.delete(ws.sala);
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
        const s = salas.get(m.sala) || { paneles: new Set() };
        salas.set(m.sala, s);
        ws.sala = m.sala;
        ws.papel = m.papel;
        if (m.papel === 'panel') {
          if (s.paneles.size >= 10) { enviar(ws, { tipo: 'error', error: 'Demasiados paneles abiertos' }); return ws.close(); }
          s.paneles.add(ws);
          enviar(ws, { tipo: 'unido', papel: 'panel', companero: Boolean(s.pc1) });
          presentes(s);
          return;
        }
        // El mismo papel otra vez (se reconecta o se abrió dos veces): se queda el nuevo
        if (s[m.papel] && s[m.papel] !== ws) { const viejo = s[m.papel]; viejo.sala = null; viejo.close(4000, 'Otro PC ha entrado con el mismo papel'); }
        s[m.papel] = ws;
        enviar(ws, { tipo: 'unido', papel: m.papel, companero: Boolean(s[otro(m.papel)]) });
        enviar(s[otro(m.papel)], { tipo: 'companero', conectado: true });
        presentes(s);
        return;
      }
      const s = salas.get(ws.sala);
      if (!s) return;
      const texto = raw.toString();
      if (ws.papel === 'panel') return enviar(s.pc1, texto);
      if (ws.papel === 'pc1' && m.tipo === 'foto') { for (const p of s.paneles) enviar(p, texto); return; }
      enviar(s[otro(ws.papel)], texto);
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
