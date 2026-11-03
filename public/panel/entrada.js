// Entrada al panel: una ventana que tapa todo hasta que se escribe la contraseña del panel y el servidor la da por buena.
// Es la misma para todo lo del panel (draft, partida, puente, realizador, directos y gachapon). No tiene botón de cerrar
// y no se va con Esc ni pulsando fuera; mientras está, el resto del panel no se puede tocar (inert).
// La buena se guarda en este navegador y se pone en #clave, que es de donde la leen panel.js y realizador.js. Si el
// servidor deja de aceptarla (alguien la ha cambiado en Render), panel.js avisa con «tenka-clave-mala» y la ventana vuelve.
const $ = s => document.querySelector(s);
const puerta = $('#entrada'), form = $('#formClave'), campo = $('#claveEntrada'), boton = $('#entrar'), estado = $('#claveEstado');
const clave = $('#clave');
const esperar = ms => new Promise(r => setTimeout(r, ms));

function bloquear(si) {
  for (const el of document.body.children) if (el !== puerta && el.tagName !== 'SCRIPT') el.inert = si;
  document.documentElement.classList.toggle('bloqueado', si);
  puerta.hidden = !si;
  if (si) setTimeout(() => campo.focus(), 0);
}
function decir(texto = '', clase = '') {
  estado.textContent = texto;
  estado.className = `clave-estado ${clase}`;
}
async function comprobar(valor) {
  try {
    const r = await fetch('/api/clave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: valor }), cache: 'no-store' });
    return r.status === 429 ? 'espera' : r.ok ? 'bien' : r.status === 401 ? 'mal' : 'red';
  } catch { return 'red'; }
}
const MOTIVO = { mal: 'Contraseña incorrecta', espera: 'Demasiados intentos: espera unos minutos', red: 'La web no responde: prueba otra vez en un momento' };

function guardar(valor) {
  try { valor ? localStorage.setItem('tenka-clave', valor) : localStorage.removeItem('tenka-clave'); } catch {}
  clave.value = valor;
  clave.dispatchEvent(new Event('change'));
}
function salir(texto) {
  guardar('');
  campo.value = '';
  decir(texto, texto ? 'mal' : '');
  bloquear(true);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const valor = campo.value;
  if (!valor) return decir('Escribe la contraseña', 'mal');
  boton.disabled = true;
  decir('Comprobando…');
  const r = await comprobar(valor);
  boton.disabled = false;
  if (r === 'bien') {
    campo.value = '';
    decir();
    guardar(valor);
    return bloquear(false);
  }
  decir(MOTIVO[r], 'mal');
  if (r === 'mal') {
    campo.select();
    puerta.classList.remove('temblor');
    void puerta.offsetWidth;
    puerta.classList.add('temblor');
  }
});
$('#salir').addEventListener('click', () => salir(''));
window.addEventListener('tenka-clave-mala', () => { if (clave.value) salir('La contraseña ha cambiado: escribe la nueva'); });

// Al abrir: si este navegador ya tiene una guardada y sigue valiendo, se entra sin escribirla. Si la web está
// despertando (Render la duerme), se espera a que responda
bloquear(true);
(async () => {
  let guardada = '';
  try { guardada = localStorage.getItem('tenka-clave') || ''; } catch {}
  if (!guardada) return;
  decir('Comprobando la contraseña guardada…');
  for (;;) {
    const r = await comprobar(guardada);
    if (puerta.hidden || campo.value) return; // ya ha entrado o está escribiendo otra
    if (r === 'bien') { decir(); guardar(guardada); return bloquear(false); }
    if (r !== 'red') { try { localStorage.removeItem('tenka-clave'); } catch {} return decir(r === 'mal' ? 'La contraseña guardada ya no vale: escribe la nueva' : MOTIVO[r], 'mal'); }
    decir('Esperando a que la web despierte…');
    await esperar(3000);
  }
})();
