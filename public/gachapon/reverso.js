// El reverso de las cartas del gachapon (08/11/2026): un coche de noche, del color de la familia de la carta que hay
// por delante. Una de Ryūjin sale con un coche azul; una de Byakko, naranja… Es una pista a propósito: al ver el coche
// ya sabes de qué familia es, pero no quién ni de qué tier (eso lo insinúa el brillo de la pista de la apertura).
// - Cada familia por su clan: los jugadores, las LEGACY (Shinigami, en oro) y los jefes.
// - Las BOOST (no son de ninguna familia), en el bermellón de Gokudō; las conmemorativas, en oro.
// El dibujo definitivo sale de Google Flow, uno por color, en public/cartas/reversos/<CLAVE>.webp (1000×1400; CLAVE es el
// id del clan, BOOST o TEMPORADA): el servidor los lista en est.info.reversos. Mientras falte alguno, la carta va
// oscura, con el filo de neón de su color, 極道 y GOKUDŌ.
import { escapar } from '/carta.js';
import { est, colorClan } from './estado.js';

const BERMELLON = '#E0303A', ORO = '#EBD28A';
export const claveReverso = c => (c.tipo === 'boost' ? 'BOOST' : c.tipo === 'temporada' ? 'TEMPORADA' : c.clan || 'BOOST');
export const colorReverso = c => (c.tipo === 'temporada' ? ORO : c.clan ? colorClan(c.clan) : BERMELLON);

// El reverso de una carta: el dibujo de Flow de su color si ya está o, mientras tanto, la carta oscura con su neón
export function reversoHTML(c) {
  const imagen = est.info?.reversos?.[claveReverso(c)];
  if (imagen) return `<div class="cara dorso con-reverso"><img src="${escapar(imagen)}" alt=""></div>`;
  return `<div class="cara dorso reverso-coche" style="--coche: ${colorReverso(c)}"><span class="kanji-reverso">極道</span><span class="marca-reverso">GOKUDŌ</span></div>`;
}
