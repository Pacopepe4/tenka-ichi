// Efectos compartidos por la portada, el gachapon y la guía: piezas que entran al asomar con el desplazamiento y
// diálogos que se cierran con transición. Los estilos (.revelar, .visto, .cerrando) están en inicio.css y guia.css.
// Con movimiento reducido no hacen nada: todo se ve y se cierra sin animación.
export const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cada pieza entra una vez, cuando asoma; las que comparten padre entran escalonadas (--orden).
// Los estilos de entrada cuelgan de html.con-movimiento, que se pone aquí: sin este archivo, todo se ve, solo que quieto
export function revelarAlAsomar(selectores) {
  if (quieto || !('IntersectionObserver' in window)) return;
  const vigia = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('visto');
      vigia.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  for (const p of document.querySelectorAll(selectores)) {
    p.classList.add('revelar');
    p.style.setProperty('--orden', [...p.parentElement.children].filter(x => x.matches(selectores)).indexOf(p));
    vigia.observe(p);
  }
  document.documentElement.classList.add('con-movimiento');
}

// Los diálogos también se van con transición, no de golpe: close() espera a que acabe la animación de .cerrando
export function cierreSuave(dialogos) {
  if (quieto) return;
  for (const d of dialogos) {
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
}
