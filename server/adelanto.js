// Datos adelantados del PC 1 del realizador (10/11/2026). El PC 1 mira la partida en directo y el PC 2 la emite 2 minutos
// después; el marcador sale del puente del PC 2. El PC 1 manda aquí (acción «adelanto», por /ws con la contraseña) lo
// que sabe antes que nadie:
//   { t: gameTime del PC 1,
//     jugadores: [{ nombre, equipo: 'ORDER'|'CHAOS', cs: [[gameTime, creepScore], …],      cada vez que cambia el CS
//                   kda: [[gameTime, k, d, a], …] }],                                          cada vez que cambia el KDA
//     objetivos: [{ id, tipo: 'dragon'|'heraldo'|'baron'|'larvas', dragon?, lado: 'azul'|'rojo', t }],
//     hechizos: [{ nombre, equipo, d: [[desde, hasta|null], …], f: […], r: […] }] }   (desde el 14/11, leídos de la pantalla)
// Con eso:
//  - CS: el cliente de LoL los da de 10 en 10. Sabiendo en qué segundo llegó cada jugador a 150 y a 160, entre medias se
//    reparten al ritmo real de ese tramo: exactos en cada múltiplo de 10, nunca por encima del siguiente salto ni por
//    debajo de lo que dice el cliente.
//  - Objetivos: el cliente de espectador no da dragones, heraldo ni Barón; el PC 1 sí (LiveEvents). Entran como sucesos
//    con su minuto, y el marcador los enseña cuando la emisión llega a ese minuto (server/partida.js). Desde el 14/11, sin
//    LiveEvents, el PC 1 los lee de la pantalla, y también las larvas (una por larva).
//  - Enfriamientos: el PC 1 lee de la pantalla cuándo se lanza cada hechizo de invocador (D y F) y la definitiva (R) y
//    cuándo vuelve. Como va 2 minutos por delante, casi siempre se sabe ya cuándo acaba: el marcador pone la cuenta
//    atrás exacta en la emisión. Si aún no se sabe (hasta: null), en enfriamiento sin número.
// Sin PC 1 (o en la partida de prueba) todo sigue como antes. Se manda entero cada pocos segundos: es idempotente.
const VIGENCIA_MS = 10 * 60 * 1000;   // sin noticias del PC 1 en 10 minutos, lo que mandó ya no vale
const TIPOS = new Set(['dragon', 'heraldo', 'baron', 'larvas']);
const DRAGONES = new Set(['infernal', 'oceano', 'montana', 'nube', 'hextech', 'quimtech', 'ancestral']);

const normalizar = s => String(s || '').toLowerCase().split('#')[0].replace(/[\s_.-]/g, '');
const vacio = () => ({ recibido: 0, t: 0, cs: new Map(), kda: new Map(), objetivos: new Map(), hechizos: new Map() });
let adelanto = vacio();

export function olvidarAdelanto() { adelanto = vacio(); }

// Lo que manda el PC 1. Devuelve false si no se entiende
export function recibirAdelanto(d, ahora = Date.now()) {
  const t = Number(d?.t);
  if (!Number.isFinite(t) || t < 0 || !Array.isArray(d?.jugadores)) return false;
  // El reloj del PC 1 vuelve atrás: es otra partida
  if (t + 5 < adelanto.t) adelanto = vacio();
  adelanto.t = t;
  adelanto.recibido = ahora;
  for (const j of d.jugadores.slice(0, 10)) {
    const nombre = normalizar(j?.nombre);
    if (!nombre || !Array.isArray(j.cs)) continue;
    // Saltos ordenados por tiempo, sin repetidos y con el CS siempre creciente
    const pasos = j.cs.map(p => [Number(p?.[0]), Number(p?.[1])]).filter(([pt, pc]) => Number.isFinite(pt) && Number.isFinite(pc) && pt >= 0 && pc >= 0)
      .sort((a, b) => a[0] - b[0]).slice(-400);
    const limpios = [];
    for (const p of pasos) if (!limpios.length || p[1] > limpios.at(-1)[1]) limpios.push(p);
    adelanto.cs.set(nombre, limpios);
    // KDA (15/11): en una repetición con saltos el cliente del PC 2 no cuenta lo saltado; el PC 1 lo ve todo
    if (Array.isArray(j.kda)) {
      adelanto.kda.set(nombre, j.kda.map(p => (Array.isArray(p) ? p.slice(0, 4).map(Number) : []))
        .filter(p => p.length === 4 && p.every(v => Number.isFinite(v) && v >= 0)).sort((a, b) => a[0] - b[0]).slice(-400));
    }
  }
  for (const o of (Array.isArray(d.objetivos) ? d.objetivos : []).slice(0, 80)) {
    const ot = Number(o?.t);
    if (!o?.id || !TIPOS.has(o.tipo) || !['azul', 'rojo'].includes(o.lado) || !Number.isFinite(ot)) continue;
    adelanto.objetivos.set(String(o.id), { id: String(o.id), tipo: o.tipo, lado: o.lado, t: ot,
      dragon: o.tipo === 'dragon' && DRAGONES.has(o.dragon) ? o.dragon : o.tipo === 'dragon' ? 'dragon' : undefined });
  }
  for (const j of (Array.isArray(d.hechizos) ? d.hechizos : []).slice(0, 10)) {
    const nombre = normalizar(j?.nombre);
    if (!nombre) continue;
    adelanto.hechizos.set(nombre, Object.fromEntries(['d', 'f', 'r'].map(k => [k, tramos(j[k])])));
  }
  return true;
}

// Los enfriamientos de un hechizo: tramos [desde, hasta] ordenados (hasta null: aún no ha vuelto, según el PC 1)
const tramos = lista => (Array.isArray(lista) ? lista : []).map(p => [Number(p?.[0]), p?.[1] == null ? null : Number(p[1])])
  .filter(([a, b]) => Number.isFinite(a) && a >= 0 && (b === null || (Number.isFinite(b) && b > a))).sort((x, y) => x[0] - y[0]).slice(-200);

// El KDA de un jugador en el segundo t de la emisión, según el PC 1 (undefined si no hay datos o aún no ha pasado nada)
export function kdaEn(nombre, t) {
  const p = adelanto.kda.get(normalizar(nombre))?.findLast(([pt]) => pt <= t);
  return p ? { k: p[1], d: p[2], a: p[3] } : undefined;
}

// Cómo están la D, la F y la R de un jugador en el segundo t de la emisión: null si están listos; si no, { quedan }
// con los segundos que faltan (null si aún no se sabe cuándo vuelven). Sin datos de ese jugador, undefined
export function enfriamientosEn(nombre, t) {
  const h = adelanto.hechizos.get(normalizar(nombre));
  if (!h) return undefined;
  const estado = lista => {
    const tramo = lista.findLast(([a, b]) => a <= t && (b === null || b > t));
    return tramo ? { quedan: tramo[1] === null ? null : Math.ceil(tramo[1] - t) } : null;
  };
  return { d: estado(h.d), f: estado(h.f), r: estado(h.r) };
}

// ¿Lo que hay es de esta partida? Tiene que ser reciente y al menos la mitad de los nombres tienen que coincidir
export function adelantoDe(nombres, ahora = Date.now()) {
  if (!adelanto.recibido || ahora - adelanto.recibido > VIGENCIA_MS || !adelanto.cs.size) return false;
  const conocidos = nombres.map(normalizar).filter(n => adelanto.cs.has(n)).length;
  return conocidos >= Math.min(5, Math.ceil(nombres.length / 2));
}

// CS de un jugador en el segundo t de la emisión, sabiendo lo que da el cliente (de 10 en 10)
export function csRepartido(nombre, t, csCliente) {
  const pasos = adelanto.cs.get(normalizar(nombre));
  if (!pasos?.length) return csCliente;
  let i = -1;
  while (i + 1 < pasos.length && pasos[i + 1][0] <= t) i++;
  if (i < 0) return csCliente;
  const [t0, c0] = pasos[i], siguiente = pasos[i + 1];
  if (!siguiente) return Math.max(csCliente, c0);
  const [t1, c1] = siguiente;
  const estimado = c0 + Math.floor((t - t0) / Math.max(0.001, t1 - t0) * (c1 - c0));
  return Math.max(csCliente, Math.min(c1 - 1, estimado));
}

// Los objetivos como sucesos del cliente (DragonKill, HeraldKill, BaronKill), con su minuto. partida.js solo usa los
// que ya han pasado en la emisión
const SUCESO = { dragon: 'DragonKill', heraldo: 'HeraldKill', baron: 'BaronKill', larvas: 'HordeKill' };
const DRAGON_CLIENTE = { infernal: 'Fire', oceano: 'Water', montana: 'Earth', nube: 'Air', hextech: 'Hextech', quimtech: 'Chemtech', ancestral: 'Elder' };
export function sucesosAdelantados() {
  return [...adelanto.objetivos.values()].map(o => ({ EventID: `pc1-${o.id}`, EventName: SUCESO[o.tipo], EventTime: o.t, lado: o.lado, adelanto: true,
    ...(o.tipo === 'dragon' && DRAGON_CLIENTE[o.dragon] ? { DragonType: DRAGON_CLIENTE[o.dragon] } : {}) }));
}
