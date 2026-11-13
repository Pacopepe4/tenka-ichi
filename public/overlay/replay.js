// REPLAY: el cartel entra con su animación («REPLAY rebobinado», replay.css) cada vez que pasa a verse, ya sea porque el
// panel pone la vista «replay» o, en OBS, porque la fuente de navegador vuelve a estar visible (la escena de repetición
// se activa). ?retraso=1.3 hace esperar esos segundos antes de entrar (lo que tarda en abrirse el stinger que tapa el
// cambio de escena). Al irse la vista (el panel, «Automático» o la suelta sola de los 30 s del servidor) se quita la
// clase .entra cuando el cartel ya se ha desvanecido, para que las flechas y la raya no sigan en bucle sin verse.
const cartel = document.querySelector('.replay-cartel');
const retraso = Number(new URLSearchParams(location.search).get('retraso'));
if (Number.isFinite(retraso) && retraso > 0) cartel.style.setProperty('--retraso', `${Math.min(retraso, 5)}s`);

// REPLAY en una <i> por letra, con --j de 5 (la R) a 0 (la Y): entran de la Y a la R, como una cinta que rebobina
const palabra = cartel.querySelector('.replay-palabra');
const letras = [...palabra.textContent.trim()];
palabra.setAttribute('aria-label', letras.join(''));
palabra.replaceChildren(...letras.map((l, k) => {
  const i = document.createElement('i');
  i.textContent = l;
  i.style.setProperty('--j', letras.length - 1 - k);
  i.setAttribute('aria-hidden', 'true');
  return i;
}));

const enReplay = () => document.body.dataset.vista === 'replay';
let ultima = -1e9;
let apagar = null;
function entrar() {
  // OBS avisa de que la fuente se ve justo al cargarla: dos arranques seguidos serían un parpadeo
  const ahora = performance.now();
  if (ahora - ultima < 400) return;
  ultima = ahora;
  clearTimeout(apagar);
  cartel.classList.remove('entra');
  void cartel.offsetWidth;
  cartel.classList.add('entra');
}
// #replay tarda .3 s en desvanecerse (replay.css): después ya se puede parar todo
function salir() {
  clearTimeout(apagar);
  apagar = setTimeout(() => { if (!enReplay()) cartel.classList.remove('entra'); }, 400);
}

// Solo cuando la vista cambia de verdad: overlay.js vuelve a poner la misma vista con el primer estado
new MutationObserver(cambios => {
  if (enReplay()) { if (cambios.some(c => c.oldValue !== 'replay')) entrar(); }
  else if (cambios.some(c => c.oldValue === 'replay')) salir();
}).observe(document.body, { attributes: true, attributeFilter: ['data-vista'], attributeOldValue: true });
window.addEventListener('obsSourceVisibleChanged', e => { if (e.detail?.visible && enReplay()) entrar(); });
if (enReplay()) entrar();
