// La carta del gachapon, igual en todas las páginas (el álbum, la portada y el overlay). Los estilos, en carta.css.
// Dos clases de carta: Jugador (jugadores de la liga) y BOOST (personajes de fuera de los clanes, de S+ a B).
import { logo } from '/comun.js';

export const TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'];
// La S+ es SP en CSS y en los archivos
export const claveTier = t => (t === 'S+' ? 'SP' : t);
export const ROL = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
export const escapar = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
// Las BOOST no son de ningún clan: en el círculo del emblema llevan el de Koryu Budo
export const EMBLEMA_BOOST = '/marca/koryu-budo.png';
export const emblemaDe = c => (c.clan ? logo(c.clan) : c.tipo === 'boost' ? EMBLEMA_BOOST : null);

// El arte es el dibujo de la carta si ya existe (si no, el splash de su campeón o la imagen del clan) y el marco,
// el de su clase y tier. cantidad: null (no se enseña), 0 (no la tiene: sale apagada) o cuántas copias tiene
export function cartaHTML(c, { cantidad = null, nombreClan = id => id } = {}) {
  const falta = cantidad === 0, k = claveTier(c.tier), boost = c.tipo === 'boost', emblema = emblemaDe(c);
  const quien = boost ? escapar(c.subtitulo) : `${ROL[c.rol] || c.rol} de ${escapar(nombreClan(c.clan))}`;
  // Las BOOST llevan su multiplicador bajo el apodo y la frase entera al pasar el ratón
  return `<div class="carta-g${falta ? ' falta' : ''}${c.marco ? ' con-marco' : ''}${boost ? ' boost' : ''}" data-tier="${k}" style="--color-tier: var(--tier-${k})"${c.bonus ? ` title="${escapar(c.bonus.texto)}"` : ''}>
    <img class="arte" src="${escapar(c.arte || `/clanes/${c.clan}.jpg`)}" alt="" loading="lazy"><span class="velo"></span>
    ${c.marco ? `<img class="marco" src="${escapar(c.marco)}" alt="" loading="lazy">` : ''}
    <span class="hanko rareza" title="Tier ${c.tier}">${c.tier}</span>${emblema ? `<img class="logo" src="${emblema}" alt="">` : ''}
    <div class="pie"><b class="nick">${escapar(c.nombre)}</b><span class="rol">${quien}</span>${c.bonus ? `<b class="bonus">${escapar(c.bonus.etiqueta)}</b>` : ''}</div>
    ${cantidad > 1 ? `<span class="cantidad" title="La tienes repetida">×${cantidad}</span>` : ''}
  </div>`;
}
