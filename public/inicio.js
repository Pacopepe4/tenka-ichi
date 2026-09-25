// Portada pública: baraja de clanes, ficha de cada clan y resumen de la liga
import { cargarCampeones, cargarClanes, icono, logo } from '/comun.js';

const $ = s => document.querySelector(s);
const [{ clanes, roles }, campeones, liga] = await Promise.all([
  cargarClanes(), cargarCampeones(), fetch('/api/liga').then(r => r.json()),
]);
const competidores = clanes.filter(c => !c.invitado);
const ROLES_LEGIBLES = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };

// ---------- Baraja ----------
const baraja = $('.baraja');
baraja.innerHTML = competidores.map((c, i) => `
  <button class="carta" role="listitem" data-i="${i}" data-clan="${c.id}" style="--color:${c.color}" aria-label="${c.nombre}, ${c.lema}">
    <img class="arte" src="/clanes/${c.id}.jpg" alt="" loading="lazy">
    <span class="velo"></span>
    <img class="logo-carta" src="${logo(c.id)}" alt="">
    <span class="kanji" aria-hidden="true">${c.kanji}</span>
    <span class="pie-carta"><span class="nombre">${c.nombre}</span><span class="lema">${c.lema}</span></span>
  </button>`).join('');
const cartas = [...baraja.querySelectorAll('.carta')];
const centro = (cartas.length - 1) / 2;
const movil = matchMedia('(max-width: 760px)');

// Coloca las cartas en abanico; la carta activa sale de la baraja y abre hueco a sus vecinas
function colocar(activa = null) {
  if (movil.matches) return;
  const ancho = baraja.clientWidth;
  const paso = Math.min(66, (ancho - 240) / (cartas.length - 1));
  cartas.forEach((carta, i) => {
    const desde = i - centro;
    let x = desde * paso, y = Math.pow(Math.abs(desde), 1.6) * 3, r = desde * 3, s = 1, z = i;
    if (activa !== null) {
      const d = i - activa;
      if (d === 0) { y -= 86; r = 0; s = 1.1; z = 100; }
      else { x += Math.sign(d) * Math.max(0, 78 - (Math.abs(d) - 1) * 22); }
    }
    carta.style.setProperty('--x', `${x}px`);
    carta.style.setProperty('--y', `${y}px`);
    carta.style.setProperty('--r', `${r}deg`);
    carta.style.setProperty('--s', s);
    carta.style.zIndex = z;
    carta.classList.toggle('activa', activa === i);
  });
}

// La carta activa es la más cercana al puntero en horizontal
baraja.addEventListener('pointermove', e => {
  if (movil.matches || e.pointerType === 'touch') return;
  const xs = cartas.map(c => { const r = c.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - e.clientX); });
  colocar(xs.indexOf(Math.min(...xs)));
});
baraja.addEventListener('pointerleave', () => colocar());
cartas.forEach((carta, i) => {
  carta.addEventListener('focus', () => colocar(i));
  carta.addEventListener('blur', () => colocar());
  carta.addEventListener('click', () => abrirFicha(competidores[i]));
});
addEventListener('resize', () => colocar());
movil.addEventListener('change', () => colocar());
colocar();

// ---------- Ficha ----------
const ficha = $('.ficha');
ficha.querySelector('.cerrar').addEventListener('click', () => ficha.close());
ficha.addEventListener('click', e => { if (e.target === ficha) ficha.close(); });

function abrirFicha(c) {
  ficha.style.setProperty('--color', c.color);
  ficha.style.setProperty('--color-texto', c.texto);
  ficha.querySelector('.ficha-arte img').src = `/clanes/${c.id}.jpg`;
  ficha.querySelector('.ficha-arte img').alt = `${c.nombre}, ${c.lema}`;
  ficha.querySelector('.ficha-logo').src = logo(c.id);
  ficha.querySelector('#ficha-nombre').textContent = c.nombre;
  ficha.querySelector('.ficha-lema').textContent = c.lema;
  ficha.querySelector('.ficha-kanji').textContent = c.kanji;
  ficha.querySelector('.ficha-descripcion').textContent = c.descripcion;
  ficha.querySelector('.ficha-plantilla').innerHTML = roles.map((r, i) => {
    const j = c.jugadores?.[i];
    return `<dt>${ROLES_LEGIBLES[r] || r}</dt><dd class="${j ? '' : 'pendiente'}">${j || 'Por anunciar'}</dd>`;
  }).join('');
  ficha.querySelector('.ficha-suplentes').textContent = c.suplentes ? `Suplentes: ${c.suplentes}` : '';
  const fila = liga.clasificacion.find(f => f.clan === c.id);
  ficha.querySelector('.ficha-record').textContent = fila ? `${fila.victorias} victorias y ${fila.derrotas} derrotas en Tenka Ichi` : 'Aún no ha jugado en Tenka Ichi.';
  ficha.showModal();
}

// ---------- Liga ----------
const clan = id => clanes.find(c => c.id === id);
$('.resumen-liga').textContent = liga.partidas
  ? `${liga.partidas} ${liga.partidas === 1 ? 'partida jugada' : 'partidas jugadas'}. Los datos se actualizan al terminar cada partida.`
  : 'La liga aún no ha empezado. La clasificación y las estadísticas aparecerán tras la primera partida.';

const clasif = liga.clasificacion.filter(f => clan(f.clan) && !clan(f.clan).invitado);
$('.clasificacion').innerHTML = clasif.length
  ? clasif.map((f, i) => `<li><span class="puesto">${i + 1}</span><img src="${logo(f.clan)}" alt=""><span>${clan(f.clan).nombre}</span><span class="record">${f.victorias}–${f.derrotas}</span></li>`).join('')
  : '<li class="vacio">Sin partidas todavía.</li>';

$('.campeones').innerHTML = liga.campeones.length
  ? liga.campeones.map(c => `<li><img src="${icono(c.id)}" alt="">
      <div><div class="fila-nombre"><b>${campeones.nombre(c.id)}</b><span class="cifras">Pick ${c.pick}% · Ban ${c.ban}%${c.winrate === null ? '' : ` · WR ${c.winrate}%`}</span></div>
      <div class="barra-presencia" title="Presencia ${c.presenciaPct}%"><span style="width:${c.presenciaPct}%"></span></div></div></li>`).join('')
  : '<li class="vacio">Sin partidas todavía.</li>';
