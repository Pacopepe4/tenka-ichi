// Reproductor de Twitch de koryubudo. Detecta solo si hay directo (eventos del propio reproductor).
// - Con un marco en la página: el reproductor vive dentro y, si hay directo y el marco sale de la vista,
//   el vídeo pasa a una ventanita flotante en la esquina sin recargarse; el marco guarda el sitio.
// - Sin marco: crea la ventanita flotante, que solo aparece cuando hay directo.
export const CANAL = 'koryubudo';
const SCRIPT = 'https://player.twitch.tv/js/embed/v1.js';

function cargarScript() {
  if (window.Twitch?.Player) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true; s.onload = ok; s.onerror = mal;
    document.head.appendChild(s);
  });
}

export async function iniciarDirecto({ marco = null, alCambiar = () => {} } = {}) {
  const caja = document.createElement('div');
  caja.className = marco ? 'directo-caja' : 'directo-caja solo-flotante';
  caja.innerHTML = `<div class="directo-video" id="directo-video"></div>
    <div class="directo-mini-barra"><span class="punto-vivo" aria-hidden="true"></span><span>En directo</span>
      <a href="https://twitch.tv/${CANAL}" target="_blank" rel="noopener">Abrir en Twitch</a>
      <button type="button" class="directo-cerrar" aria-label="Cerrar la ventanita del directo">×</button></div>`;
  (marco || document.body).appendChild(caja);

  let enDirecto = false, cerrado = false, visible = true;
  const aplicar = () => {
    document.documentElement.dataset.directo = enDirecto ? 'si' : 'no';
    caja.classList.toggle('flotando', enDirecto && !cerrado && (!marco || !visible));
    alCambiar(enDirecto);
  };
  caja.querySelector('.directo-cerrar').addEventListener('click', () => { cerrado = true; aplicar(); });
  if (marco) new IntersectionObserver(([e]) => { visible = e.isIntersecting; aplicar(); }, { threshold: 0.2 }).observe(marco);

  try { await cargarScript(); } catch { return; }
  const player = new window.Twitch.Player('directo-video', {
    channel: CANAL, parent: [location.hostname], width: '100%', height: '100%', muted: true, autoplay: Boolean(marco),
  });
  player.addEventListener(window.Twitch.Player.ONLINE, () => { enDirecto = true; aplicar(); });
  player.addEventListener(window.Twitch.Player.OFFLINE, () => { enDirecto = false; aplicar(); });
}
