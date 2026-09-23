// Conexión de solo lectura con DraftCore (lol.draftcore.net).
// Se une a un draft como espectador por Socket.IO y traduce su formato al nuestro.
//
// Formato de DraftCore (comprobado el 23/09/2026 con un draft de prueba):
//   ban1..ban10  bans por orden de turno       b1..b5 / r1..r5  picks azul / rojo
//   turn         turno actual (1..20)          hovered          campeón en hover
//   Los campeones vienen con el id de Data Dragon ("Ahri", "MonkeyKing"...).
import { io } from 'socket.io-client';

const SERVIDOR = 'https://ws.lol.draftcore.net';

// Orden de turnos de un draft de torneo (fase de bans 1, picks 1, bans 2, picks 2)
export const TURNOS = [
  'ban1', 'ban2', 'ban3', 'ban4', 'ban5', 'ban6',
  'b1', 'r1', 'r2', 'b2', 'b3', 'r3',
  'ban7', 'ban8', 'ban9', 'ban10',
  'r4', 'b4', 'b5', 'r5',
];

// A qué lado y posición corresponde cada ban de DraftCore
const BANS = {
  ban1: ['azul', 0], ban2: ['rojo', 0], ban3: ['azul', 1], ban4: ['rojo', 1],
  ban5: ['azul', 2], ban6: ['rojo', 2], ban7: ['rojo', 3], ban8: ['azul', 3],
  ban9: ['rojo', 4], ban10: ['azul', 4],
};

// Extrae el código de un enlace de DraftCore ("https://lol.draftcore.net/EN5AQ2N" → "EN5AQ2N")
export function codigoDeEnlace(enlace) {
  const texto = String(enlace || '').trim();
  const m = texto.match(/draftcore\.net\/([A-Za-z0-9]+)/) || texto.match(/^([A-Za-z0-9]{5,12})$/);
  return m ? m[1] : null;
}

// Traduce un draft de DraftCore a { turno, hover, bans, picks } de nuestra app
export function traducir(d) {
  const bans = { azul: Array(5).fill(null), rojo: Array(5).fill(null) };
  const picks = { azul: Array(5).fill(null), rojo: Array(5).fill(null) };
  for (const [slot, [lado, i]] of Object.entries(BANS)) bans[lado][i] = d[slot] || null;
  for (let i = 0; i < 5; i++) {
    picks.azul[i] = d[`b${i + 1}`] || null;
    picks.rojo[i] = d[`r${i + 1}`] || null;
  }
  const turno = Number(d.turn) || 0;
  return { turno, slot: TURNOS[turno - 1] || null, hover: d.hovered || null, bans, picks };
}

// Si el slot activo es un pick o un ban, dice de qué lado y en qué posición cae
export function destinoDeSlot(slot) {
  if (!slot) return null;
  if (BANS[slot]) return { tipo: 'ban', lado: BANS[slot][0], indice: BANS[slot][1] };
  const m = slot.match(/^([br])(\d)$/);
  if (m) return { tipo: 'pick', lado: m[1] === 'b' ? 'azul' : 'rojo', indice: Number(m[2]) - 1 };
  return null;
}

// Abre la conexión. Los callbacks reciben datos ya traducidos.
export function conectar(codigo, { alDraft, alHover, alTiempo, alEstado }) {
  const socket = io(SERVIDOR, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { Origin: 'https://lol.draftcore.net' },
    reconnection: true,
    reconnectionDelay: 1000,
  });
  let draft = {};

  socket.on('connect', () => {
    alEstado({ conectado: true, error: null });
    socket.emit('V3-joinDraft', { draftId: codigo, url: codigo });
  });
  socket.on('disconnect', motivo => alEstado({ conectado: false, error: `Desconectado: ${motivo}` }));
  socket.on('connect_error', e => alEstado({ conectado: false, error: `No se pudo conectar: ${e.message}` }));

  // Cualquier evento que traiga el draft entero (o parte) actualiza el estado
  socket.onAny((evento, datos) => {
    if (/timerTick/i.test(evento)) {
      if (datos && typeof datos.timeLeft === 'number') alTiempo({ segundos: datos.timeLeft, turno: datos.turn });
      return;
    }
    if (/updateHover/i.test(evento)) {
      alHover(datos?.hovered ?? null);
      return;
    }
    const d = datos?.draft && typeof datos.draft === 'object' ? datos.draft : datos;
    if (!d || typeof d !== 'object') return;
    const tieneSlots = Object.keys(d).some(k => /^(ban\d+|[br]\d|turn|hovered)$/.test(k));
    if (!tieneSlots) return;
    draft = { ...draft, ...d };
    alDraft(traducir(draft), draft);
  });

  return { cerrar: () => socket.close() };
}
