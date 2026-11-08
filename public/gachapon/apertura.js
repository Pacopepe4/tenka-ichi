// Abrir un sobre: el sobre se corta, salen las cartas boca abajo y se les da la vuelta
import { claveTier, escapar } from '/carta.js';
import { $, est, cartaHTML, ganchos } from './estado.js';

const dialogo = $('.apertura');
let abriendo = false;
export const aperturaAbierta = () => dialogo.open;

export async function abrir() {
  if (abriendo) return;
  abriendo = true;
  const r = await fetch('/api/gacha/abrir', { method: 'POST' }).then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  abriendo = false;
  if (!r.ok) return ganchos.avisar(r.error);
  est.info.usuario = r.usuario;
  mostrarApertura(r.sobre);
}

// Todas las cartas salen boca abajo con el mismo reverso: no se sabe si es Jugador o BOOST, ni su tier,
// hasta darle la vuelta. Sin el reverso dibujado, el sol partido sobre tinta
const dorso = () => (est.info.reverso
  ? `<div class="cara dorso con-reverso"><img src="${escapar(est.info.reverso)}" alt=""></div>`
  : '<div class="cara dorso"><img src="/marca/sol-partido-sin-fondo.png" alt=""></div>');

// Las cartas grandes se celebran al descubrirlas: chispas alrededor de la carta y un fogonazo de su color en la
// escena, con centro en la carta. Cuántas chispas, según la tier; las demás cartas se descubren sin más
const CHISPAS = { SP: 24, LEGACY: 24, S: 12 };
function celebrar(v) {
  const n = CHISPAS[v.dataset.tier];
  if (!n) return;
  const caja = document.createElement('span');
  caja.className = 'chispas';
  caja.setAttribute('aria-hidden', 'true');
  caja.innerHTML = Array.from({ length: n }, (_, i) =>
    `<i style="--a:${Math.round(360 / n * i + Math.random() * 14)}deg; --d:${Math.round(70 + Math.random() * 130)}px; --t:${Math.round(Math.random() * 180)}ms"></i>`).join('');
  v.appendChild(caja);
  setTimeout(() => caja.remove(), 2400);
  const escena = $('.escena'), r = v.getBoundingClientRect(), e = escena.getBoundingClientRect();
  escena.style.setProperty('--fx', `${((r.left + r.width / 2 - e.left) / e.width * 100).toFixed(1)}%`);
  escena.style.setProperty('--fy', `${((r.top + r.height / 2 - e.top) / e.height * 100).toFixed(1)}%`);
  escena.dataset.fogonazo = v.dataset.tier;
  escena.classList.remove('fogonazo');
  void escena.offsetWidth;   // para que el fogonazo vuelva a empezar si ya había uno
  escena.classList.add('fogonazo');
}

function mostrarApertura(cartas) {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  dialogo.classList.remove('cortando', 'abierto');
  $('.escena').classList.remove('fogonazo');
  // La carta extra (una LEGACY de regalo, muy de vez en cuando) sale la última, con su aviso encima
  $('.reparto').innerHTML = cartas.map((c, i) => `<div class="volteable${c.extra ? ' extra' : ''}" style="--giro: ${(i - (cartas.length - 1) / 2) * 7}deg" data-tier="${claveTier(c.tier)}" tabindex="0" role="button" aria-label="${c.extra ? 'Carta extra' : `Carta ${i + 1}`}: dale la vuelta">
    ${c.extra ? '<span class="aviso-extra">Carta extra</span>' : ''}<div class="giro">${dorso()}<div class="cara frente">${cartaHTML(c)}</div></div></div>`).join('');
  $('.descubrir').hidden = false;
  $('.otro').hidden = true;
  $('.cerrar-apertura').hidden = true;
  dialogo.showModal();

  const volteables = [...dialogo.querySelectorAll('.volteable')];
  const comprobar = () => {
    if (!volteables.every(v => v.classList.contains('girada'))) return;
    $('.descubrir').hidden = true;
    $('.cerrar-apertura').hidden = false;
    $('.otro').hidden = !(est.info.usuario.sobres > 0);
    $('.cerrar-apertura').focus();
  };
  const girar = v => {
    if (v.classList.contains('girada')) return;
    v.classList.add('girada');
    const c = cartas[volteables.indexOf(v)];
    v.setAttribute('aria-label', `${c.nombre}, tier ${c.tier}`);
    if (!reducido) celebrar(v);
    comprobar();
  };
  volteables.forEach(v => {
    v.onclick = () => girar(v);
    v.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); girar(v); } };
  });
  $('.descubrir').onclick = () => volteables.filter(v => !v.classList.contains('girada')).forEach((v, i) => setTimeout(() => girar(v), reducido ? 0 : i * 420));

  // El sobre llega, el trazo lo corta en diagonal, las mitades se van y salen las cartas boca abajo
  const t = reducido ? { corte: 0, mitades: 0, cartas: 0 } : { corte: 700, mitades: 620, cartas: 170 };
  setTimeout(() => dialogo.classList.add('cortando'), t.corte);
  setTimeout(() => dialogo.classList.add('abierto'), t.corte + 280);
  setTimeout(() => volteables.forEach((v, i) => setTimeout(() => v.classList.add('fuera'), i * t.cartas)), t.corte + t.mitades);
}

$('.cerrar-apertura').onclick = () => dialogo.close();
$('.otro').onclick = () => { dialogo.close(); abrir(); };
dialogo.addEventListener('close', () => ganchos.pintar());
$('.sobre').addEventListener('click', abrir);
