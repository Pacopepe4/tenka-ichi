// REPLAY: el cartel entra con su animación cada vez que pasa a verse, ya sea porque el panel pone la vista «replay» o,
// en OBS, porque la fuente de navegador vuelve a estar visible (la escena de repetición se activa).
// ?retraso=1.3 hace esperar esos segundos antes de entrar (lo que tarda en abrirse el stinger que tapa el cambio de escena).
const cartel = document.querySelector('.replay-cartel');
const retraso = Number(new URLSearchParams(location.search).get('retraso'));
if (Number.isFinite(retraso) && retraso > 0) cartel.style.setProperty('--retraso', `${Math.min(retraso, 5)}s`);

const enReplay = () => document.body.dataset.vista === 'replay';
let ultima = -1e9;
function entrar() {
  // OBS avisa de que la fuente se ve justo al cargarla: dos arranques seguidos serían un parpadeo
  const ahora = performance.now();
  if (ahora - ultima < 400) return;
  ultima = ahora;
  cartel.classList.remove('entra');
  void cartel.offsetWidth;
  cartel.classList.add('entra');
}

// Solo cuando la vista cambia de verdad: overlay.js vuelve a poner la misma vista con el primer estado
new MutationObserver(cambios => {
  if (enReplay() && cambios.some(c => c.oldValue !== 'replay')) entrar();
}).observe(document.body, { attributes: true, attributeFilter: ['data-vista'], attributeOldValue: true });
window.addEventListener('obsSourceVisibleChanged', e => { if (e.detail?.visible && enReplay()) entrar(); });
if (enReplay()) entrar();
