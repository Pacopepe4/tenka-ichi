// Lo que se mueve en la portada: la entrada de cada sección al llegar con el desplazamiento, la sección activa en el
// menú, la barra que se aparta al bajar en el móvil y la baraja, que se abre en abanico la primera vez que se ve.
// Lo carga inicio.js cuando ya ha pintado la página. Sin este archivo la portada se ve entera, solo que quieta:
// los estilos de entrada cuelgan de html.con-movimiento, que pone efectos.js.
import { quieto, revelarAlAsomar, cierreSuave } from '/efectos.js';

const raiz = document.documentElement;
const movil = matchMedia('(max-width: 760px)');

// ---------- Sección activa en el menú ----------
const enlaces = [...document.querySelectorAll('.barra nav a[href^="#"]')];
const nav = document.querySelector('.barra nav');
const marcar = id => enlaces.forEach(a => {
  const activo = a.getAttribute('href') === `#${id}`;
  if (activo === a.hasAttribute('aria-current')) return;
  a.toggleAttribute('aria-current', activo);
  if (activo) a.setAttribute('aria-current', 'location');
  // En el móvil el menú se desliza: el enlace activo queda a la vista
  if (activo && nav.scrollWidth - nav.clientWidth > 24) nav.scrollLeft = a.offsetLeft - nav.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
});
// Manda la sección que cruza la franja central de la pantalla
const vigiaMenu = new IntersectionObserver(entradas => {
  for (const e of entradas) if (e.isIntersecting) marcar(e.target.id);
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main > section[id]').forEach(s => vigiaMenu.observe(s));

// ---------- La barra, en el móvil: se aparta al bajar y vuelve al subir ----------
let ultima = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  if (Math.abs(y - ultima) < 8) return;
  raiz.classList.toggle('barra-apartada', movil.matches && y > ultima && y > 240);
  ultima = y;
}, { passive: true });

// ---------- Entrada de las secciones y cierre de las fichas ----------
revelarAlAsomar('.directo-rejilla, .cabecera-seccion, .baraja, .legado, .camino > li, .liga .bloque, .cuadro, .fantasy-cuerpo, .tier-pestanas:not(.pestanas-fantasy), .tier-filas, .cierre');
cierreSuave(document.querySelectorAll('dialog.ficha, dialog.ficha-carta'));

if (!quieto && 'IntersectionObserver' in window) {
  // La baraja espera recogida y se abre en abanico al verla
  const baraja = document.querySelector('.baraja');
  if (baraja && !movil.matches) {
    [...baraja.children].forEach((c, i) => c.style.setProperty('--i', i));
    baraja.classList.add('recogida');
    new IntersectionObserver(([e], yo) => {
      if (!e.isIntersecting) return;
      yo.disconnect();
      baraja.classList.replace('recogida', 'abriendo');
      setTimeout(() => baraja.classList.remove('abriendo'), 1400);
    }, { threshold: 0.3 }).observe(baraja);
  }
}

// ---------- La sección de los clanes se tiñe del clan que sale de la baraja ----------
// inicio.js avisa con «clan-activo»; aquí cambian el color del fondo y el kanji grande de la cabecera, y la carta
// que está fuera se inclina hacia el puntero
const seccionClanes = document.querySelector('.clanes'), mazo = document.querySelector('.baraja');
const cabeceraClanes = seccionClanes?.querySelector('.cabecera-seccion');
if (mazo && cabeceraClanes) {
  const kanjiSeccion = cabeceraClanes.dataset.kanji;
  mazo.addEventListener('clan-activo', ({ detail: clan }) => {
    seccionClanes.classList.toggle('con-activo', Boolean(clan));
    if (clan) seccionClanes.style.setProperty('--color-activo', clan.color); else seccionClanes.style.removeProperty('--color-activo');
    cabeceraClanes.dataset.kanji = clan?.kanji || kanjiSeccion;
    cabeceraClanes.toggleAttribute('data-kanji-largo', (clan?.kanji.length || 1) > 1);
    for (const c of mazo.children) { c.style.removeProperty('--tx'); c.style.removeProperty('--ty'); }
  });
  if (!quieto) mazo.addEventListener('pointermove', e => {
    const carta = mazo.querySelector('.carta.activa');
    if (!carta || e.pointerType === 'touch') return;
    const r = carta.getBoundingClientRect(), limitar = n => Math.max(-1, Math.min(1, n));
    carta.style.setProperty('--tx', `${(limitar((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 7).toFixed(1)}deg`);
    carta.style.setProperty('--ty', `${(limitar((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -5).toFixed(1)}deg`);
  });
}
