// Lo que se mueve en la portada: la entrada de cada sección al llegar con el desplazamiento, la sección activa en el
// menú, la barra que se aparta al bajar en el móvil y la baraja, que se abre en abanico la primera vez que se ve.
// Lo carga inicio.js cuando ya ha pintado la página. Sin este archivo la portada se ve entera, solo que quieta:
// los estilos de entrada cuelgan de html.con-movimiento, que se pone aquí.
const raiz = document.documentElement;
const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  if (activo && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = a.offsetLeft - nav.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
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

// ---------- Entrada de las secciones ----------
// Cada pieza entra una vez, cuando asoma; las que comparten padre entran escalonadas (--orden)
const PIEZAS = '.directo-rejilla, .cabecera-seccion, .baraja, .legado, .camino > li, .liga .bloque, .cuadro, .fantasy-cuerpo, .tier-pestanas:not(.pestanas-fantasy), .tier-filas, .cierre';
if (!quieto && 'IntersectionObserver' in window) {
  const piezas = [...document.querySelectorAll(PIEZAS)];
  const vigia = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('visto');
      vigia.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  for (const p of piezas) {
    p.classList.add('revelar');
    p.style.setProperty('--orden', [...p.parentElement.children].filter(x => x.matches(PIEZAS)).indexOf(p));
    vigia.observe(p);
  }
  raiz.classList.add('con-movimiento');

  // Las fichas (la del clan y la de la carta) también se van con transición, no de golpe
  for (const d of document.querySelectorAll('dialog.ficha, dialog.ficha-carta')) {
    const cerrar = d.close.bind(d);
    d.close = () => {
      if (!d.open || d.classList.contains('cerrando')) return;
      const fin = () => { clearTimeout(espera); d.removeEventListener('animationend', alAcabar); d.classList.remove('cerrando'); cerrar(); };
      const alAcabar = e => { if (e.target === d) fin(); };
      const espera = setTimeout(fin, 400);
      d.addEventListener('animationend', alAcabar);
      d.classList.add('cerrando');
    };
    d.addEventListener('cancel', e => { e.preventDefault(); d.close(); });
  }

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
