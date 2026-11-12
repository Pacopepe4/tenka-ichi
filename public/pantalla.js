// La sección Directo de la portada: una pantalla grande y, al lado, una columna de cartas (Kick, Twitch, el tráiler y
// las redes). Al pasar el ratón por una carta (o al tocarla, o con el teclado) la pantalla cambia a lo suyo, como las
// cartas de familia que se levantan al pasarles el ratón. Lo pidió Pacopepe el 08/11/2026: Kick es el directo principal
// y Twitch también está; sin directo sale el tráiler.
// Lo de fuera (los reproductores, el widget de X, el de TikTok) solo se carga cuando se mira su carta por primera vez.
// Si hay directo y la pantalla sale de la vista, el directo sigue en una ventanita en la esquina.
import { iniciarDirecto } from '/directo.js';

// Las cuentas de Gokudō (el canal de YouTube es @Gokudo_zoku: el del tráiler, comprobado el 09/11/2026).
// trailerYoutube: el id del vídeo del tráiler en YouTube (lo que va detrás de «watch?v=» o de youtu.be/);
// mientras esté vacío, la carta enseña la miniatura con «Muy pronto en YouTube»
export const REDES = {
  kick: 'gokudo-zoku', twitch: 'gokudo_zoku', x: 'gokudozoku', tiktok: 'gokudo_zoku', youtube: 'Gokudo_zoku',
  // El tráiler del gachapon (https://youtu.be/DLY-79MOV_Y), con su miniatura
  trailerYoutube: 'DLY-79MOV_Y', trailerMiniatura: '/marca/trailer-gachapon-miniatura.jpg',
};

const CARTAS = [
  { red: 'kick', kanji: '生', nombre: 'Kick', sub: `kick.com/${REDES.kick}`, color: '#53FC18', enlace: `https://kick.com/${REDES.kick}`, abrir: 'Abrir en Kick' },
  { red: 'twitch', kanji: '配', nombre: 'Twitch', sub: `twitch.tv/${REDES.twitch}`, color: '#A970FF', enlace: `https://twitch.tv/${REDES.twitch}`, abrir: 'Abrir en Twitch' },
  { red: 'trailer', kanji: '映', nombre: 'Tráiler', sub: 'El del gachapon', color: '#E0303A', enlace: `https://youtu.be/${REDES.trailerYoutube}`, abrir: 'Verlo en YouTube' },
  { red: 'x', kanji: '言', nombre: 'X', sub: `@${REDES.x}`, color: '#E7DFD2', enlace: `https://x.com/${REDES.x}`, abrir: 'Abrir en X' },
  { red: 'tiktok', kanji: '舞', nombre: 'TikTok', sub: `@${REDES.tiktok}`, color: '#25F4EE', enlace: `https://www.tiktok.com/@${REDES.tiktok}`, abrir: 'Abrir en TikTok' },
  { red: 'youtube', kanji: '動', nombre: 'YouTube', sub: `@${REDES.youtube}`, color: '#FF3040', enlace: `https://www.youtube.com/@${REDES.youtube}`, abrir: 'Abrir en YouTube' },
];

const $ = s => document.querySelector(s);
const pantalla = $('.pantalla'), lista = $('.cartas-red');
const panel = red => $(`#panel-${red}`);
const vivo = { kick: false, twitch: false };
let activa = null, tocada = false, twitch = null, cerrada = false, pantallaVisible = true;

// ---------- las cartas ----------
lista.innerHTML = CARTAS.map(c => `<button type="button" role="tab" class="carta-red" id="carta-${c.red}" data-red="${c.red}"
    aria-controls="panel-${c.red}" aria-selected="false" tabindex="-1" style="--red: ${c.color}">
    <span class="carta-red-kanji" aria-hidden="true">${c.kanji}</span>
    <span class="carta-red-texto"><b>${c.nombre}</b><small>${c.sub}</small></span>
    <span class="carta-red-vivo" hidden>En directo</span>
  </button>`).join('');
const botones = [...lista.querySelectorAll('.carta-red')];

// Con el ratón basta con pasar por encima (con una pizca de espera, para que cruzar la columna no cambie la pantalla
// tres veces); con el dedo o el teclado, al tocar o al moverse con las flechas
let espera = null;
for (const b of botones) {
  b.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(espera);
    espera = setTimeout(() => elegir(b.dataset.red, true), 140);
  });
  b.addEventListener('pointerleave', () => clearTimeout(espera));
  b.addEventListener('click', () => elegir(b.dataset.red, true));
}
lista.addEventListener('keydown', e => {
  const i = botones.indexOf(document.activeElement);
  if (i < 0) return;
  const paso = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  const destino = paso ? (i + paso + botones.length) % botones.length : e.key === 'Home' ? 0 : e.key === 'End' ? botones.length - 1 : null;
  if (destino === null) return;
  e.preventDefault();
  botones[destino].focus();
  elegir(botones[destino].dataset.red, true);
});

function elegir(red, aMano = false) {
  if (aMano) tocada = true;
  if (red === activa) return;
  const antes = activa;
  activa = red;
  for (const b of botones) {
    const si = b.dataset.red === red;
    b.setAttribute('aria-selected', String(si));
    b.tabIndex = si ? 0 : -1;
  }
  for (const c of CARTAS) panel(c.red).hidden = c.red !== red;
  if (antes) apagar(antes);
  encender(red);
  pantalla.dataset.red = red;
  pantalla.style.setProperty('--red', CARTAS.find(c => c.red === red).color);
  flotar();
}

// ---------- lo que sale en la pantalla ----------
const pie = c => `<a class="pantalla-abrir" href="${c.enlace}" target="_blank" rel="noopener">${c.abrir} <span aria-hidden="true">↗</span></a>`;
const carta = red => CARTAS.find(c => c.red === red);
const cargados = new Map();
function cargarScript(src) {
  if (!cargados.has(src)) cargados.set(src, new Promise((ok, mal) => {
    const s = document.createElement('script');
    Object.assign(s, { src, async: true, onload: ok, onerror: mal });
    document.head.appendChild(s);
  }));
  return cargados.get(src);
}
// La tarjeta de perfil de una red: la miniatura del tráiler de fondo, su kanji, el nombre y los botones. Es lo que
// enseña YouTube y lo que queda en X o TikTok si su widget no aparece
const TEXTO_PERFIL = {
  x: `@${REDES.x} · avisos de las jornadas, resultados y lo que pasa en la calle`,
  tiktok: `@${REDES.tiktok} · las mejores jugadas de la liga en vertical`,
  youtube: `@${REDES.youtube} · tráilers, resúmenes y jugadas de la liga`,
};
const SEGUIR = {
  x: `https://x.com/intent/follow?screen_name=${REDES.x}`,
  tiktok: `https://www.tiktok.com/@${REDES.tiktok}`,
  youtube: `https://www.youtube.com/@${REDES.youtube}?sub_confirmation=1`,
};
function perfil(red) {
  const c = carta(red);
  return `<div class="pantalla-perfil" style="--red: ${c.color}">
    <img src="/marca/teaser-miniatura.jpg" alt="">
    <div class="pantalla-perfil-texto">
      <span class="carta-red-kanji" aria-hidden="true">${c.kanji}</span>
      <b>Gokudō en ${c.nombre}</b><span>${TEXTO_PERFIL[red]}</span>
      <div class="pantalla-perfil-botones">
        <a class="boton" href="${SEGUIR[red]}" target="_blank" rel="noopener">${red === 'youtube' ? 'Suscribirse' : 'Seguir'}</a>
        ${pie(c)}
      </div>
    </div>
  </div>`;
}
// Si el widget de X o de TikTok no se ve (bloqueado, sin sesión, la cuenta todavía sin publicaciones…), queda la
// tarjeta de perfil. Se mira que su marco tenga altura de verdad: X a veces lo deja puesto pero vacío y escondido
function siNoCarga(p, red, ms = 7000) {
  setTimeout(() => {
    const visto = [...p.querySelectorAll('iframe')].some(f => f.offsetHeight > 120);
    if (!visto && activa === red) p.innerHTML = perfil(red);
    else if (!visto) p.dataset.fallo = '1';
  }, ms);
}

function encender(red) {
  const p = panel(red);
  if (red === 'kick') {
    p.innerHTML = `<iframe class="pantalla-video" src="https://player.kick.com/${REDES.kick}?autoplay=true&muted=true" title="Directo de Gokudō en Kick"
      allow="autoplay; fullscreen; picture-in-picture"></iframe>${barraMini('kick')}`;
  }
  if (red === 'twitch') twitch?.then(t => t?.mostrar(activa === 'twitch'));
  if (red === 'trailer') {
    p.innerHTML = `<button type="button" class="trailer-portada" ${REDES.trailerYoutube ? '' : 'disabled'} aria-label="${REDES.trailerYoutube ? 'Ver el tráiler del gachapon de Gokudō' : 'El tráiler llega muy pronto a YouTube'}">
      <img src="${REDES.trailerMiniatura}" alt="">
      <span class="trailer-boton">${REDES.trailerYoutube ? '<span class="trailer-play" aria-hidden="true"></span>Ver el tráiler' : 'Muy pronto en YouTube'}</span>
    </button>`;
    p.querySelector('.trailer-portada').addEventListener('click', () => {
      p.innerHTML = `<iframe class="pantalla-video" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(REDES.trailerYoutube)}?autoplay=1&rel=0&playsinline=1"
        title="Tráiler del gachapon de Gokudō" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    });
  }
  if ((red === 'x' || red === 'tiktok') && p.dataset.fallo) { p.innerHTML = perfil(red); delete p.dataset.fallo; return; }
  if (red === 'x' && !p.childElementCount) {
    p.innerHTML = `<div class="pantalla-red"><div class="pantalla-red-cabeza"><b>Últimos posts</b>${pie(carta('x'))}</div>
      <div class="pantalla-red-cuerpo"><a class="twitter-timeline" data-theme="dark" data-chrome="noheader nofooter noborders transparent" data-dnt="true"
        data-lang="es" href="https://twitter.com/${REDES.x}">Posts de @${REDES.x}</a></div></div>`;
    cargarScript('https://platform.twitter.com/widgets.js').then(() => window.twttr?.widgets?.load(p)).catch(() => {});
    siNoCarga(p, 'x');
  }
  if (red === 'tiktok' && !p.childElementCount) {
    p.innerHTML = `<div class="pantalla-red"><div class="pantalla-red-cabeza"><b>Últimos vídeos</b>${pie(carta('tiktok'))}</div>
      <div class="pantalla-red-cuerpo"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@${REDES.tiktok}" data-unique-id="${REDES.tiktok}"
        data-embed-type="creator" style="max-width: 780px; min-width: 288px;"><section><a target="_blank" rel="noopener"
        href="https://www.tiktok.com/@${REDES.tiktok}">@${REDES.tiktok}</a></section></blockquote></div></div>`;
    cargarScript('https://www.tiktok.com/embed.js').catch(() => {});
    siNoCarga(p, 'tiktok');
  }
  if (red === 'youtube' && !p.childElementCount) p.innerHTML = perfil('youtube');
}

// Lo que suena o gasta datos se para al dejar de verse: el tráiler vuelve a su portada, el directo de Kick se quita
// (se vuelve a cargar al mirarlo, en un segundo) y el de Twitch se pausa
function apagar(red) {
  const p = panel(red);
  if (red === 'kick' || red === 'trailer') p.innerHTML = '';
  if (red === 'twitch') twitch?.then(t => t?.mostrar(false));
}

// La ventanita de la esquina: si lo que se ve es un directo en marcha y la pantalla sale de la vista
function barraMini(red) {
  return `<div class="pantalla-mini-barra"><span class="punto-vivo" aria-hidden="true"></span><span>En directo en ${carta(red).nombre}</span>
    <a href="${carta(red).enlace}" target="_blank" rel="noopener">${carta(red).abrir}</a>
    <button type="button" class="directo-cerrar" aria-label="Cerrar la ventanita del directo">×</button></div>`;
}
pantalla.addEventListener('click', e => { if (e.target.closest('.directo-cerrar')) { cerrada = true; flotar(); } });
function flotar() {
  for (const p of pantalla.querySelectorAll('.pantalla-panel')) {
    const red = p.dataset.red;
    p.classList.toggle('flotando', red === activa && (red === 'kick' || red === 'twitch') && vivo[red] && !pantallaVisible && !cerrada);
  }
}
new IntersectionObserver(([e]) => { pantallaVisible = e.isIntersecting; flotar(); }, { threshold: 0.2 }).observe(pantalla);

// ---------- quién está en directo ----------
function pintarVivo() {
  for (const red of ['kick', 'twitch']) $(`#carta-${red} .carta-red-vivo`).hidden = !vivo[red];
  const donde = ['kick', 'twitch'].filter(r => vivo[r]).map(r => carta(r).nombre);
  $('.directo-estado').textContent = donde.length ? `Ahora en directo en ${donde.join(' y en ')}.` : 'Sin directo ahora mismo.';
  document.documentElement.dataset.directo = donde.length ? 'si' : 'no';
  // Mientras nadie haya tocado las cartas, la pantalla va a lo que haya en directo (Kick antes que Twitch)
  if (!tocada) elegir(vivo.kick ? 'kick' : vivo.twitch ? 'twitch' : 'trailer');
  flotar();
}

// Kick: lo sabe la web por el aviso de Kick; Twitch: lo dice su reproductor, que se prepara sin enseñarse
elegir('trailer');
fetch('/api/directo').then(r => r.json()).then(d => { vivo.kick = Boolean(d.kick?.enDirecto); pintarVivo(); }).catch(() => {});
twitch = iniciarDirecto({ marco: panel('twitch').querySelector('.directo-marco'), flotar: false, autoplay: false,
  alCambiar: v => { vivo.twitch = v; pintarVivo(); } });
panel('twitch').insertAdjacentHTML('beforeend', barraMini('twitch'));
