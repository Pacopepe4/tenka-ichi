// La colección: todas las cartas del catálogo, con las que tienes encendidas y las que te faltan apagadas
import { TIERS } from '/carta.js';
import { $, est, cartaHTML, misCartas } from './estado.js';

let filtro = 'todas';

// El álbum entra escalonado la primera vez y al cambiar de filtro, no cada vez que se refresca solo
let albumPintado = false;
export function pintarAlbum(animar = !albumPintado) {
  const info = est.info, mias = misCartas();
  const conSesion = Boolean(info.usuario);
  // Por tier; en cada tier, primero los jugadores (por clan) y después las BOOST
  const orden = [...info.catalogo].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)
    || (a.tipo === 'boost') - (b.tipo === 'boost') || (a.clan || '').localeCompare(b.clan || '') || a.nombre.localeCompare(b.nombre));
  const lista = orden.filter(c => filtro === 'todas' || (filtro === 'tengo' ? mias.get(c.id) : !mias.get(c.id)));
  const tengo = info.catalogo.filter(c => mias.get(c.id)).length;
  $('.progreso').textContent = conSesion ? `Tienes ${tengo} de ${info.catalogo.length} cartas.` : `${info.catalogo.length} cartas en total. Entra con Discord para empezar tu colección.`;
  $('.progreso').classList.toggle('con-barra', conSesion && info.catalogo.length > 0);
  $('.progreso').style.setProperty('--avance', info.catalogo.length ? tengo / info.catalogo.length : 0);
  let vacio = 'Todavía no hay cartas.';
  if (info.catalogo.length && filtro !== 'todas') vacio = !conSesion ? 'Entra con Discord para ver tu colección.' : filtro === 'tengo' ? 'Aún no tienes ninguna carta: abre un sobre.' : '¡Las tienes todas!';
  $('.album').innerHTML = lista.length ? lista.map(c => cartaHTML(c, conSesion ? (mias.get(c.id) || 0) : null)).join('') : `<p class="vacio">${vacio}</p>`;
  $('.album').classList.toggle('entrando', animar);
  $('.album').querySelectorAll('.carta-g').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 30)));
  albumPintado = true;
}

document.querySelectorAll('.coleccion .filtros button').forEach(b => b.addEventListener('click', () => {
  filtro = b.dataset.filtro;
  document.querySelectorAll('.coleccion .filtros button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarAlbum(true);
}));
