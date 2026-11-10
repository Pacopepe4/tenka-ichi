// «Adelanto» para la web (pedido por el hilo de overlays, 09/11): el PC 1 va 2 minutos por delante de la emisión y le
// cuenta a la web, por la conexión del panel (tenka.accion('adelanto', datos)), en qué segundo cambia el CS de cada
// jugador y los objetivos (dragones, heraldo, Barón). La web reparte los CS entre dos saltos ya conocidos al ritmo real
// y saca los objetivos en el marcador cuando la emisión llega a ese minuto. Se manda siempre todo: es idempotente.

// Tipo de dragón: como lo da la Live Client (DragonType) o el nombre del monstruo en LiveEvents (SRU_Dragon_Fire…)
const DRAGONES = [
  [/elder|ancestral/i, 'ancestral'],
  [/chemtech|quimtech/i, 'quimtech'],
  [/hextech/i, 'hextech'],
  [/fire|infernal/i, 'infernal'],
  [/water|ocean/i, 'oceano'],
  [/earth|mountain/i, 'montana'],
  [/air|cloud/i, 'nube'],
];
export function tipoDragon(texto) {
  const t = String(texto || '');
  return DRAGONES.find(([re]) => re.test(t))?.[1] || null;
}

const TIPOS = { DragonKill: 'dragon', HeraldKill: 'heraldo', BaronKill: 'baron' };
const LADOS = { order: 'azul', chaos: 'rojo', azul: 'azul', rojo: 'rojo', blue: 'azul', red: 'rojo' };

// Suceso del explorador → objetivo para la web (o null si no es uno de los que interesan)
export function objetivoDe(e) {
  const tipo = TIPOS[e?.nombre];
  if (!tipo || !Number.isFinite(e.t)) return null;
  const lado = LADOS[String(e.asesino?.equipo || e.detalle?.equipo || e.detalle?.lado || '').toLowerCase()] || null;
  const o = { id: e.id, tipo, lado, t: Math.round(e.t * 10) / 10 };
  if (tipo === 'dragon') o.dragon = tipoDragon(e.detalle?.dragon || e.detalle?.monstruo) || null;
  return o;
}

// Historial de CS: [gameTime, creepScore] solo cuando cambia (el primero siempre)
export class HistorialCs {
  constructor() { this.porJugador = new Map(); }
  limpiar() { this.porJugador.clear(); }
  // lista: playerlist de la Live Client. Devuelve true si algún CS ha cambiado
  apuntar(t, lista) {
    if (!Number.isFinite(t) || !Array.isArray(lista)) return false;
    let cambio = false;
    for (const j of lista) {
      const nombre = j.riotIdGameName || (j.riotId || '').split('#')[0] || j.summonerName;
      const cs = Number(j.scores?.creepScore);
      if (!nombre || !Number.isFinite(cs)) continue;
      let h = this.porJugador.get(nombre);
      if (!h) { h = { nombre, equipo: j.team || '', cs: [] }; this.porJugador.set(nombre, h); }
      if (h.cs.at(-1)?.[1] !== cs) { h.cs.push([Math.round(t * 10) / 10, cs]); cambio = true; }
    }
    return cambio;
  }
  jugadores() { return [...this.porJugador.values()].map(h => ({ nombre: h.nombre, equipo: h.equipo, cs: h.cs.map(p => [...p]) })); }
}

export function construirAdelanto({ t, historial, eventos = [] }) {
  const vistos = new Set();
  const objetivos = [];
  for (const e of eventos) {
    const o = objetivoDe(e);
    if (!o || vistos.has(o.id)) continue;
    vistos.add(o.id);
    objetivos.push(o);
  }
  return { t: Math.round((t ?? 0) * 10) / 10, jugadores: historial.jugadores(), objetivos };
}
