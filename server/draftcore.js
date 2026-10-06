// Conexión de solo lectura con DraftCore (lol.draftcore.net).
// Se une a un draft como espectador por Socket.IO y traduce su formato al nuestro.
//
// Formato de DraftCore (comprobado el 23/09/2026 con un draft de prueba):
//   ban1..ban5 / ban6..ban10  bans azul / rojo      b1..b5 / r1..r5  picks azul / rojo
//   turn         turno actual (1..20)          hovered          campeón en hover
//   Los campeones vienen con el id de Data Dragon ("Ahri", "MonkeyKing"...).
import { io } from 'socket.io-client';

// Las pruebas usan un DraftCore de mentira con DRAFTCORE_URL_WS y DRAFTCORE_URL_WEB
const SERVIDOR = process.env.DRAFTCORE_URL_WS || 'https://ws.lol.draftcore.net';
const WEB = process.env.DRAFTCORE_URL_WEB || 'https://lol.draftcore.net';

// ---------- versión del cliente ----------
// Desde octubre de 2026 DraftCore solo deja entrar a los clientes que mandan la versión de su web al conectarse
// (auth.clientVersion): sin ella contesta CLIENT_VERSION_REQUIRED y, con una antigua, CLIENT_VERSION_OUTDATED. Y un
// intento rechazado deja a esa IP penalizada un rato (HTTP 400 «Handshake throttled», que Socket.IO enseña como
// «websocket error»). Por eso la versión se lee de su propio cliente antes de conectar, en lugar de probar suerte:
// está en uno de los trozos de código que carga la página del draft. DRAFTCORE_VERSION la fija a mano.
const VERSION_CONOCIDA = '0.7.0';         // la del 06/10/2026, por si su web no se puede leer
const VERSION_CADUCA_MS = 15 * 60 * 1000;
const PAUSA_VERSION_MS = Number(process.env.DRAFTCORE_PAUSA_MS) || 30000;   // lo que se espera tras un rechazo por la versión
let versionLeida = null, versionLeidaEn = 0;

// La versión tal como va en el código de su cliente: auth:{clientVersion:"0.7.0"} o, minificado,
// auth:{clientVersion:tv} con tv="0.7.0" declarado antes
export function versionEnCodigo(js) {
  const m = /clientVersion:\s*(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))/.exec(String(js || ''));
  if (!m) return null;
  const valor = m[1] ?? new RegExp(`(?:^|[\\s,;{(])${m[2].replace(/\$/g, '\\$')}\\s*=\\s*["']([^"']+)["']`).exec(js)?.[1];
  return valor && /^\d+(\.\d+){1,3}[\w.+-]*$/.test(valor) ? valor : null;
}

async function leerVersion(codigo) {
  const pedir = async url => {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`${url} contesta ${r.status}`);
    return r.text();
  };
  const pagina = await pedir(`${WEB}/${encodeURIComponent(codigo)}`);
  const trozos = [...new Set(pagina.match(/\/_next\/static\/[^"'\\\s]+\.js/g) || [])];
  const versiones = await Promise.all(trozos.map(t => pedir(WEB + t).then(versionEnCodigo, () => null)));
  return versiones.find(Boolean) || null;
}

// La versión que hay que mandar: la fijada a mano, la leída de su web (se recuerda un cuarto de hora) o, si no se
// puede leer, la última que se supo
export async function versionCliente(codigo, { forzar = false } = {}) {
  if (process.env.DRAFTCORE_VERSION) return process.env.DRAFTCORE_VERSION;
  if (!forzar && versionLeida && Date.now() - versionLeidaEn < VERSION_CADUCA_MS) return versionLeida;
  try {
    const v = await leerVersion(codigo);
    if (v) { versionLeida = v; versionLeidaEn = Date.now(); }
    else console.error('No encuentro la versión del cliente en la web de DraftCore: se usa', versionLeida || VERSION_CONOCIDA);
  } catch (e) { console.error('No se pudo leer la versión del cliente de DraftCore:', e.message); }
  return versionLeida || VERSION_CONOCIDA;
}

// Los bans de DraftCore son posicionales: ban1..ban5 = lado azul, ban6..ban10 = lado rojo
// (comprobado con un draft real el 25/09/2026).
// Orden de turnos de un draft de torneo (fase de bans 1, picks 1, bans 2, picks 2)
export const TURNOS = [
  'ban1', 'ban6', 'ban2', 'ban7', 'ban3', 'ban8',
  'b1', 'r1', 'r2', 'b2', 'b3', 'r3',
  'ban9', 'ban4', 'ban10', 'ban5',
  'r4', 'b4', 'b5', 'r5',
];

// A qué lado y posición corresponde cada ban de DraftCore
const BANS = {
  ban1: ['azul', 0], ban2: ['azul', 1], ban3: ['azul', 2], ban4: ['azul', 3], ban5: ['azul', 4],
  ban6: ['rojo', 0], ban7: ['rojo', 1], ban8: ['rojo', 2], ban9: ['rojo', 3], ban10: ['rojo', 4],
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
  let socket = null, cerrado = false, espera = null, rechazosDeVersion = 0, draft = {};

  async function abrir(releer = false) {
    const version = await versionCliente(codigo, { forzar: releer });
    if (cerrado) return;
    socket = io(SERVIDOR, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { clientVersion: version },
      extraHeaders: { Origin: WEB },
      // Si falla, reintenta cada vez más despacio (2 s, 4 s… hasta un minuto): DraftCore penaliza a quien insiste
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 60000,
    });

    socket.on('connect', () => {
      rechazosDeVersion = 0;
      alEstado({ conectado: true, error: null });
      socket.emit('V3-joinDraft', { draftId: codigo, url: codigo });
    });
    socket.on('disconnect', motivo => alEstado({ conectado: false, error: `Desconectado: ${motivo}` }));
    socket.on('connect_error', e => {
      // Versión rechazada: Socket.IO no reintenta solo. Se vuelve a leer de su web y se prueba una vez más, pasado un
      // rato (el rechazo trae penalización); si tampoco vale, se deja de insistir
      if (/CLIENT_VERSION/.test(e.message)) {
        socket.close();
        if (rechazosDeVersion++ === 0) {
          alEstado({ conectado: false, error: 'DraftCore ha cambiado la versión de su cliente. La web la está buscando y vuelve a intentarlo sola en medio minuto.' });
          espera = setTimeout(() => abrir(true), PAUSA_VERSION_MS);
        } else {
          alEstado({ conectado: false, error: `DraftCore no acepta la versión de cliente ${version}. Mientras se arregla, escribe los campeones a mano en su hueco.` });
        }
        return;
      }
      // Un 400 (o 403, o 429) al abrir el websocket es su limitador: «Handshake throttled»
      const limitado = /\b(400|403|429)\b/.test(String(e.description?.message || e.description || ''));
      alEstado({ conectado: false, error: limitado
        ? 'DraftCore está limitando las conexiones de la web por demasiados intentos seguidos. Se reintenta sola, cada vez más despacio; si sigue así, pulsa Desconectar, espera un par de minutos y vuelve a conectar.'
        : `No se pudo conectar: ${e.message}` });
    });

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
  }
  abrir();

  return { cerrar: () => { cerrado = true; clearTimeout(espera); socket?.close(); } };
}
