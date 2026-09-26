// Portada pública: baraja de clanes, ficha de cada clan y resumen de la liga
import { cargarCampeones, cargarClanes, icono, logo } from '/comun.js';

const $ = s => document.querySelector(s);
const simulacion = new URLSearchParams(location.search).has('simulacion');
const q = simulacion ? '?simulacion' : '';
const [{ clanes, roles }, campeones, liga, comp] = await Promise.all([
  cargarClanes(), cargarCampeones(), fetch('/api/liga' + q).then(r => r.json()), fetch('/api/competicion' + q).then(r => r.json()),
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
  const fila = comp.clasificacion?.filas.find(f => f.clan === c.id);
  const participa = !comp.calendario || comp.calendario.participantes.includes(c.id);
  ficha.querySelector('.ficha-record').textContent = !participa ? 'No participa en esta temporada.'
    : fila?.jugadas ? `${fila.puesto}.º en la liguilla, con ${fila.victorias} victorias y ${fila.derrotas} derrotas.` : 'Aún no ha jugado en Tenka Ichi.';
  ficha.showModal();
}

// ---------- Liga ----------
const clan = id => clanes.find(c => c.id === id) || { id, nombre: id, color: '#8E8676' };
const nombre = id => clan(id).nombre;
const escudo = id => `<img src="${logo(id)}" alt="">`;

if (simulacion) {
  $('.aviso-simulacion').hidden = false;
  document.title = 'Simulación · Tenka Ichi';
}

const cls = comp.clasificacion;
if (!comp.calendario) {
  $('.resumen-liga').textContent = 'El sorteo del calendario aún no se ha hecho. Aquí aparecerán la clasificación, las jornadas y el cuadro de playoffs.';
} else if (cls.completa && comp.cuadro?.campeon) {
  $('.resumen-liga').textContent = `Temporada terminada. ${nombre(comp.cuadro.campeon)} reina bajo el cielo.`;
} else if (cls.completa) {
  $('.resumen-liga').textContent = 'Liguilla terminada. Se juegan los playoffs.';
} else {
  $('.resumen-liga').textContent = cls.jugadas
    ? `${cls.jugadas} de ${cls.total} partidas de liguilla jugadas. Los datos se actualizan al terminar cada partida.`
    : 'Calendario sorteado. La liguilla aún no ha empezado.';
}

// Clasificación
const CRITERIO = { directo: 'por enfrentamiento directo', fuerza: 'por fuerza de calendario', sorteo: 'por sorteo', desempate: 'partida de desempate' };
const tbody = $('.tabla tbody');
if (cls) {
  tbody.innerHTML = cls.filas.map(f => `
    <tr class="${f.playoffs ? 'dentro' : 'fuera'}${f.puesto === 8 ? ' corte' : ''}">
      <td class="puesto">${f.puesto}</td>
      <td class="clan-celda">${escudo(f.clan)}<span>${nombre(f.clan)}${f.criterio && f.jugadas ? `<small title="Desempatado ${CRITERIO[f.criterio]}">${CRITERIO[f.criterio]}</small>` : ''}</span></td>
      <td>${f.jugadas}</td>
      <td class="record">${f.victorias}–${f.derrotas}</td>
      <td class="fuerza">${f.fuerza}</td>
    </tr>`).join('');
  const d = cls.desempate;
  $('.desempate-nota').textContent = d
    ? (d.ganador ? `${nombre(d.ganador)} ganó el Bo1 de desempate contra ${nombre(d.clanes.find(c => c !== d.ganador))} por la última plaza de playoffs.`
      : `${nombre(d.clanes[0])} y ${nombre(d.clanes[1])} jugarán un Bo1 de desempate por la última plaza de playoffs.`)
    : '';
} else {
  $('.tabla').hidden = true;
}

// Calendario por jornadas
if (comp.calendario) {
  const jornadas = comp.calendario.jornadas;
  const primeraPendiente = jornadas.findIndex(j => j.some(c => !cls.resultados[c.id]));
  let actual = primeraPendiente === -1 ? jornadas.length - 1 : primeraPendiente;
  const pintarJornada = () => {
    $('.jornadas').innerHTML = jornadas.map((_, i) =>
      `<button role="tab" aria-selected="${i === actual}" data-i="${i}">Jornada ${i + 1}</button>`).join('');
    $('.cruces').innerHTML = jornadas[actual].map(c => {
      const r = cls.resultados[c.id];
      const lado = (id, color) => `<span class="lado-cruce ${r ? (r.ganador === id ? 'gana' : 'pierde') : ''}"><i class="punto ${color}" title="Lado ${color}"></i>${escudo(id)}${nombre(id)}</span>`;
      return `<li>${lado(c.azul, 'azul')}<span class="vs-cruce">${r ? '' : 'vs'}</span>${lado(c.rojo, 'rojo')}</li>`;
    }).join('');
    document.querySelectorAll('.jornadas button').forEach(b => b.addEventListener('click', () => { actual = Number(b.dataset.i); pintarJornada(); }));
  };
  pintarJornada();
} else {
  $('.cruces').innerHTML = '<li class="vacio">Sin calendario todavía.</li>';
}

// Cuadro de playoffs
const cuadro = comp.cuadro;
const serieHTML = s => {
  const fila = id => {
    if (!id) return '<div class="fila-serie pendiente"><span>Por decidir</span></div>';
    const v = s.victorias?.[id] ?? 0;
    return `<div class="fila-serie ${s.ganador ? (s.ganador === id ? 'gana' : 'pierde') : ''}">
      <span class="semilla">${s.puestos?.[id] ?? ''}</span>${escudo(id)}<span class="nombre-serie">${nombre(id)}</span><b>${s.partidas.length ? v : ''}</b></div>`;
  };
  return `<div class="serie">${fila(s.alto)}${fila(s.bajo)}</div>`;
};
if (cuadro) {
  $('.cuadro').innerHTML = `
    <div class="ronda"><h4>Cuartos</h4><div class="series">${cuadro.cuartos.map(serieHTML).join('')}</div></div>
    <div class="ronda"><h4>Semifinales</h4><div class="series">${cuadro.semis.map(serieHTML).join('')}</div></div>
    <div class="ronda"><h4>Final</h4><div class="series">${serieHTML(cuadro.final)}</div></div>
    <div class="ronda campeon-ronda"><h4>Campeón</h4><div class="series">${cuadro.campeon
      ? `<div class="campeon" style="--color:${clan(cuadro.campeon).color}"><img src="/clanes/${cuadro.campeon}.jpg" alt=""><span class="hanko">一</span><b>${nombre(cuadro.campeon)}</b></div>`
      : '<p class="vacio">Por decidir</p>'}</div></div>`;
} else {
  $('.cuadro').innerHTML = `<p class="vacio">El cuadro se forma al terminar la liguilla${cls?.desempate && !cls.desempate.ganador ? ' y el desempate' : ''}.</p>`;
}

// Campeones con más presencia
$('.campeones').innerHTML = liga.campeones.length
  ? liga.campeones.map(c => `<li><img src="${icono(c.id)}" alt="">
      <div><div class="fila-nombre"><b>${campeones.nombre(c.id)}</b><span class="cifras">Pick ${c.pick}%, ban ${c.ban}%${c.winrate === null ? '' : `, victorias ${c.winrate}%`}</span></div>
      <div class="barra-presencia" title="Presencia ${c.presenciaPct}%"><span style="width:${c.presenciaPct}%"></span></div></div></li>`).join('')
  : '<li class="vacio">Sin partidas todavía.</li>';
