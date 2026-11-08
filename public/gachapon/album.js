// La colección, por familias: un bloque por familia (su kamon, su kanji, su color y cuántas tienes de las suyas) con sus
// cartas y el hueco de su jefe; después Shinigami (las LEGACY), las BOOST y los premios (las conmemorativas).
// Las que tienes, encendidas; las que te faltan, apagadas; y las que no tenías en tu última visita, con la marca «Nueva».
// Tres filtros que se combinan: cuáles (todas, las que tengo, me faltan), de qué familia y de qué rol.
import { logo } from '/comun.js';
import { TIERS, ROL, escapar, EMBLEMA_BOOST } from '/carta.js';
import { $, est, clanes, nombreClan, colorClan, cartaHTML, misCartas } from './estado.js';

// Lo que cuenta en «Tienes X de Y»: las cartas de los sobres. Jefes y conmemorativas son premios y van aparte
const DE_SOBRE = new Set(['jugador', 'boost', 'legacy']);
const ROLES = Object.keys(ROL);

// Los bloques del álbum, en orden: las seis familias que compiten (en el orden de clanes), Shinigami, BOOST y Premios.
// Cada uno dice qué cartas son suyas (sin el jefe, que va en su hueco) y si tiene jefe
const familias = clanes.filter(c => !c.legacy && !c.invitado);
const shinigami = clanes.find(c => c.legacy);
const BLOQUES = [
  ...[...familias, ...(shinigami ? [shinigami] : [])].map(c => ({
    id: c.id, nombre: nombreClan(c.id), kanji: c.kanji, color: colorClan(c.id), kamon: logo(c.id), jefe: `JEFE-${c.id}`,
    suya: carta => carta.clan === c.id && (carta.tipo === 'jugador' || carta.tipo === 'legacy') })),
  { id: 'BOOST', nombre: 'BOOST', kanji: '力', color: 'var(--shu)', kamon: EMBLEMA_BOOST, suya: carta => carta.tipo === 'boost' },
  { id: 'PREMIOS', nombre: 'Premios', kanji: '賞', color: 'var(--oro)', kamon: '/marca/gokudo-neon.png', suya: carta => carta.tipo === 'temporada' },
];

// Dentro de un bloque: los jugadores por rol (TOP → SUPPORT); las BOOST y las LEGACY, de la tier más alta a la más baja;
// las conmemorativas, por temporada
const ordenCartas = (a, b) => (ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol)) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)
  || (a.temporada || 0) - (b.temporada || 0) || a.nombre.localeCompare(b.nombre);

// Los filtros: cuáles ('todas' | 'tengo' | 'faltan'), qué bloque ('' = todos) y qué rol ('' = todos)
const filtro = { cuales: 'todas', bloque: '', rol: '' };

// ---------- «Nueva desde tu última visita» ----------
// En localStorage, por usuario, la lista de las cartas que tenías al irte. Se lee al entrar y se guarda al ocultar o
// salir de la página: así la marca dura toda la visita, aunque abras más tiradas. localStorage puede no estar (modo
// privado, bloqueado): entonces no hay marcas y el álbum va igual
const claveVisto = nombre => `gokudo-album-visto-${nombre}`;
let visto = null;   // { nombre, ids: Set } con lo que tenías en tu última visita; null sin sesión o sin localStorage
function leerVisto(nombre) {
  try {
    const guardado = localStorage.getItem(claveVisto(nombre));
    // La primera vez no hay lista: se toma como vista la colección de ahora, y solo se marca lo que salga en esta visita
    const ids = guardado ? JSON.parse(guardado) : [...misCartas().keys()];
    return { nombre, ids: new Set(Array.isArray(ids) ? ids : []) };
  } catch { return null; }
}
function guardarVisto() {
  const nombre = est.info?.usuario?.nombre;
  if (!nombre) return;
  const mias = misCartas();
  try { localStorage.setItem(claveVisto(nombre), JSON.stringify([...mias.keys()].filter(id => mias.get(id) > 0))); } catch { /* sin localStorage: sin marcas */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarVisto(); });
addEventListener('pagehide', guardarVisto);
const esNueva = id => Boolean(visto && !visto.ids.has(id));

// ---------- los filtros de familia y de rol: se pintan una vez, con las familias de /api/clanes ----------
$('.filtros-familia').innerHTML = `<button role="tab" aria-selected="true" data-bloque="">Todas</button>`
  + BLOQUES.map(b => `<button role="tab" aria-selected="false" data-bloque="${b.id}" style="--color-familia: ${b.color}"><img src="${b.kamon}" alt="" loading="lazy">${escapar(b.nombre)}</button>`).join('');
$('.filtros-rol-album').innerHTML = `<button role="tab" aria-selected="true" data-rol="">Todos</button>`
  + ROLES.map(r => `<button role="tab" aria-selected="false" data-rol="${r}">${ROL[r]}</button>`).join('');

// Cada fila de chips es un grupo: al pulsar una, se queda elegida esa y se repinta el álbum entrando de nuevo
for (const [selector, campo, dato] of [['.filtros-cuales', 'cuales', 'filtro'], ['.filtros-familia', 'bloque', 'bloque'], ['.filtros-rol-album', 'rol', 'rol']]) {
  const fila = $(`.coleccion ${selector}`);
  fila.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    filtro[campo] = b.dataset[dato];
    fila.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    pintarAlbum(true);
  });
}

// ---------- pintar ----------
// Una carta del álbum, con su marca «Nueva» si toca. --i es su turno en la entrada escalonada
const ficha = (c, cantidad, i) => `<div class="album-ficha" style="--i: ${Math.min(i, 30)}">${cartaHTML(c, cantidad)}${cantidad && esNueva(c.id) ? '<span class="nueva">Nueva</span>' : ''}</div>`;

// El álbum entra escalonado la primera vez y al cambiar de filtro, no cada vez que se refresca solo
let albumPintado = false;
export function pintarAlbum(animar = !albumPintado) {
  const info = est.info, mias = misCartas(), usuario = info.usuario;
  const conSesion = Boolean(usuario);
  if (!conSesion) visto = null;
  else if (visto?.nombre !== usuario.nombre) visto = leerVisto(usuario.nombre);
  const tiene = id => (mias.get(id) || 0) > 0;
  const cantidad = id => (conSesion ? (mias.get(id) || 0) : null);
  // ¿Pasa los filtros de «cuáles» y de rol? Con un rol elegido, solo los jugadores (las demás no tienen rol).
  // Sin sesión no hay colección: «Las que tengo» y «Me faltan» no enseñan nada
  const pasaCuales = id => filtro.cuales === 'todas' || (conSesion && (filtro.cuales === 'tengo' ? tiene(id) : !tiene(id)));
  const pasa = c => pasaCuales(c.id) && (!filtro.rol || c.rol === filtro.rol);

  // Progreso: solo las cartas de los sobres (jugador, BOOST y LEGACY)
  const deSobre = info.catalogo.filter(c => DE_SOBRE.has(c.tipo)), tengo = deSobre.filter(c => tiene(c.id)).length;
  const progreso = $('.progreso');
  progreso.textContent = conSesion ? `Tienes ${tengo} de ${deSobre.length} cartas.` : `${deSobre.length} cartas en total. Entra con Discord para empezar tu colección.`;
  progreso.classList.toggle('con-barra', conSesion && deSobre.length > 0);
  progreso.style.setProperty('--avance', deSobre.length ? tengo / deSobre.length : 0);

  let i = 0;
  const bloques = BLOQUES.filter(b => !filtro.bloque || b.id === filtro.bloque).map(b => {
    const suyas = info.catalogo.filter(b.suya).sort(ordenCartas);
    const jefe = b.jefe ? info.catalogo.find(c => c.id === b.jefe) : null;
    const cobrado = Boolean(b.jefe && usuario?.familias?.includes(b.id));
    let cartas = suyas.filter(pasa), cuenta = '';
    const fichas = [];

    if (b.id === 'PREMIOS') {
      // Las conmemorativas: solo las que tienes y, mientras no tengas la de esta temporada, su hueco con lo que llevas
      cartas = cartas.filter(c => !conSesion || tiene(c.id));
      cartas.forEach(c => fichas.push(ficha(c, cantidad(c.id), i++)));
      const n = info.temporada?.numero, objetivo = info.cartasConmemorativa || 30;
      const deEsta = suyas.find(c => c.temporada === n);
      // El hueco cuenta como una que te falta
      if (!filtro.rol && (filtro.cuales === 'todas' || (conSesion && filtro.cuales === 'faltan')) && !(deEsta && tiene(deEsta.id))) {
        const llevas = conSesion ? `<small>Llevas ${Math.min(tengo, objetivo)} de ${objetivo}</small>` : '';
        fichas.push(`<div class="album-ficha album-hueco hueco-premio" style="--i: ${Math.min(i++, 30)}" title="Carta conmemorativa${n ? ` de la temporada ${n}` : ''}"><span class="hueco-kanji" aria-hidden="true">賞</span><b>${n ? `Temporada ${n}` : 'Conmemorativa'}</b><p>Acaba la temporada con ${objetivo} cartas distintas</p>${llevas}</div>`);
      }
      if (conSesion && suyas.length) cuenta = `${suyas.filter(c => tiene(c.id)).length}`;
    } else {
      cartas.forEach(c => fichas.push(ficha(c, cantidad(c.id), i++)));
      // El contador cuenta solo las cartas de la familia (o de BOOST), no el jefe
      cuenta = conSesion ? `${suyas.filter(c => tiene(c.id)).length}/${suyas.length}` : `${suyas.length}`;
    }

    // El hueco del jefe: su carta si la tienes; si no, apagado, con lo que hay que hacer para llevártelo.
    // Con un rol elegido no sale: el jefe no tiene rol
    if (jefe && !filtro.rol && pasaCuales(jefe.id)) {
      const lo = conSesion && tiene(jefe.id);
      const nota = cobrado ? 'Premio de la familia cobrado esta temporada' : lo ? 'Oyabun de la familia' : 'Junta las 5 para llevarte a su jefe y una tirada';
      fichas.push(lo
        ? `<div class="album-ficha ficha-jefe" style="--i: ${Math.min(i++, 30)}">${cartaHTML(jefe, cantidad(jefe.id))}${esNueva(jefe.id) ? '<span class="nueva">Nueva</span>' : ''}<p class="nota-jefe${cobrado ? ' cobrado' : ''}">${nota}</p></div>`
        : `<div class="album-ficha album-hueco hueco-jefe${cobrado ? ' cobrado' : ''}" style="--i: ${Math.min(i++, 30)}"><img src="${b.kamon}" alt="" loading="lazy"><b>Jefe de ${escapar(b.nombre)}</b><p>${nota}</p></div>`);
    }

    if (!fichas.length) return '';
    const completa = conSesion && suyas.length && b.id !== 'PREMIOS' && suyas.every(c => tiene(c.id));
    return `<section class="familia${completa ? ' completa' : ''}" style="--color-familia: ${b.color}" aria-label="${escapar(b.nombre)}">
      <header class="familia-cabeza">
        <img class="kamon" src="${b.kamon}" alt="" loading="lazy">
        ${b.kanji ? `<span class="familia-kanji" aria-hidden="true">${escapar(b.kanji)}</span>` : ''}
        <h3>${escapar(b.nombre)}</h3>
        ${cuenta ? `<span class="familia-cuenta" title="${conSesion ? 'Las que tienes de esta familia' : 'Cartas de esta familia'}">${cuenta}</span>` : ''}
      </header>
      <div class="familia-cartas">${fichas.join('')}</div>
    </section>`;
  }).filter(Boolean);

  // Sin nada que enseñar: el porqué, según los filtros
  let vacio = 'Ninguna carta con estos filtros.';
  if (!info.catalogo.length) vacio = 'Todavía no hay cartas.';
  else if (!conSesion && filtro.cuales !== 'todas') vacio = 'Entra con Discord para ver tu colección.';
  else if (filtro.cuales === 'tengo' && !filtro.bloque && !filtro.rol) vacio = 'Aún no tienes ninguna carta: haz una tirada.';
  else if (filtro.cuales === 'faltan' && !filtro.bloque && !filtro.rol) vacio = '¡Las tienes todas!';

  const album = $('.album');
  album.innerHTML = bloques.length ? bloques.join('') : `<p class="vacio">${vacio}</p>`;
  album.classList.toggle('entrando', animar);
  albumPintado = true;
}
