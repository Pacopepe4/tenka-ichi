// Portada pública: baraja de clanes, ficha de cada clan y resumen de la liga
import { cargarCampeones, cargarClanes, conectarDirecto, icono, logo, compite, fechaCorta } from '/comun.js';
import { cartaHTML, escapar } from '/carta.js';
import { montarSorteo } from '/sorteo.js';

const $ = s => document.querySelector(s);
const simulacion = new URLSearchParams(location.search).has('simulacion');
const q = simulacion ? '?simulacion' : '';
let [{ clanes, roles }, campeones, liga, comp, tierlist, fantasy] = await Promise.all([
  cargarClanes(), cargarCampeones(), fetch('/api/liga' + q).then(r => r.json()), fetch('/api/competicion' + q).then(r => r.json()),
  fetch('/api/tierlist').then(r => r.json()).catch(() => ({ jugadores: [], equipos: [] })), fetch('/api/fantasy').then(r => r.json()).catch(() => null),
]);
// En la baraja, los clanes que compiten; los equipos Legacy (de la organización, pero fuera de la competición) van aparte
const competidores = clanes.filter(compite);
const legado = clanes.filter(c => c.legacy);
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
let avisada = null;
function colocar(activa = null) {
  if (movil.matches) return;
  // Avisa de qué clan está fuera de la baraja, para lo que se mueve alrededor (inicio-movimiento.js)
  if (activa !== avisada) baraja.dispatchEvent(new CustomEvent('clan-activo', { detail: activa === null ? null : competidores[activa] }));
  avisada = activa;
  const ancho = baraja.clientWidth;
  // Con pocas cartas (seis clanes) se abren más, para que se lea el nombre de cada una
  const paso = Math.min(cartas.length > 8 ? 66 : 104, (ancho - 240) / (cartas.length - 1));
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
// Los equipos Legacy, debajo de la baraja: su carta y por qué están aparte
const cajaLegado = $('.legado');
cajaLegado.hidden = !legado.length;
cajaLegado.innerHTML = legado.map(c => `<article class="equipo-legado" style="--color:${c.color}; --color-texto:${c.texto}">
    <button class="carta suelta" data-clan="${c.id}" aria-label="${c.nombre}, ${c.lema}: ver su plantilla">
      <img class="arte" src="/clanes/${c.id}.jpg" alt="" loading="lazy">
      <span class="velo"></span>
      <img class="logo-carta" src="${logo(c.id)}" alt="">
      <span class="kanji" aria-hidden="true">${c.kanji}</span>
      <span class="pie-carta"><span class="nombre">${c.nombre}</span><span class="lema">${c.lema}</span></span>
    </button>
    <div class="legado-texto">
      <span class="etiqueta-legacy">Legacy</span>
      <h3>${c.nombre}</h3>
      <p>${c.descripcion}</p>
      <p class="legado-nota">Equipo de Koryu Budo, apartado de la nueva competición de Tenka Ichi: conserva su estandarte y su plantilla, pero no lucha por el trono.</p>
    </div>
  </article>`).join('');
cajaLegado.querySelectorAll('.carta').forEach(b => b.addEventListener('click', () => abrirFicha(legado.find(c => c.id === b.dataset.clan))));

addEventListener('resize', () => colocar());
movil.addEventListener('change', () => colocar());
colocar();

// ---------- Ficha ----------
// La tier list dice quién tiene carta: los jugadores con nombre en la plantilla y con tier
const conCarta = new Set(tierlist.jugadores.filter(j => j.nombre && j.tier).map(j => j.id));
const ficha = $('.ficha');
ficha.querySelector('.cerrar').addEventListener('click', () => ficha.close());
ficha.addEventListener('click', e => { if (e.target === ficha) ficha.close(); });

function abrirFicha(c) {
  const fila = comp.clasificacion?.filas.find(f => f.clan === c.id);
  // Antes del sorteo, los que juegan son los de la temporada (comp.formato.clanes)
  const participa = (comp.calendario?.participantes || comp.formato.clanes).includes(c.id);
  ficha.style.setProperty('--color', c.color);
  ficha.style.setProperty('--color-texto', c.texto);
  ficha.querySelector('.ficha-arte img').src = `/clanes/${c.id}.jpg`;
  ficha.querySelector('.ficha-arte img').alt = `${c.nombre}, ${c.lema}`;
  ficha.querySelector('.ficha-logo').src = logo(c.id);
  ficha.querySelector('#ficha-nombre').textContent = c.nombre;
  ficha.querySelector('.ficha-lema').textContent = c.lema;
  ficha.querySelector('.etiqueta-legacy').hidden = !c.legacy;
  ficha.querySelector('.ficha-kanji').textContent = c.kanji;
  ficha.querySelector('.ficha-descripcion').textContent = c.descripcion;
  ficha.querySelector('.ficha-plantilla').innerHTML = roles.map((r, i) => {
    const j = c.jugadores?.[i], id = `${c.id}-${r}`;
    return `<dt>${ROLES_LEGIBLES[r] || r}</dt><dd class="${j ? '' : 'pendiente'}"><span>${j ? escapar(j) : 'Por anunciar'}</span>${j && conCarta.has(id)
      ? `<button type="button" class="ver-carta" data-id="${id}">Ver carta</button>` : ''}</dd>`;
  }).join('');
  ficha.querySelectorAll('.ver-carta').forEach(b => b.addEventListener('click', () => abrirCarta(b.dataset.id)));
  // Los campeones que más juega el clan, cuando ya ha jugado
  const cajaCampeones = ficha.querySelector('.ficha-campeones'), cajaLegacy = ficha.querySelector('.ficha-legacy');
  cajaCampeones.innerHTML = cajaLegacy.innerHTML = '';
  if (!simulacion) {
    fetch(`/api/clan?id=${c.id}`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d || ficha.querySelector('#ficha-nombre').textContent !== c.nombre) return;
      // Las cartas LEGACY del equipo: de colección, salen de vez en cuando como carta extra de un sobre
      if (d.cartas?.length) {
        cajaLegacy.innerHTML = '<h4>Cartas Legacy</h4>' + d.cartas.map((x, i) =>
          `<button type="button" class="carta-legacy" data-i="${i}" aria-label="Ver la carta de ${escapar(x.nombre)}">${cartaHTML(x, { nombreClan: nombre })}</button>`).join('')
          + '<p>De colección: salen de vez en cuando como carta extra de un sobre del gachapon.</p>';
        cajaLegacy.querySelectorAll('.carta-legacy').forEach(b => b.addEventListener('click', () => abrirCartaLegacy(d.cartas[Number(b.dataset.i)])));
      }
      if (!d.partidas) return;
      // Sin calendario sorteado no hay puesto en la liguilla, pero sí su balance
      if (!fila?.jugadas) {
        ficha.querySelector('.ficha-record').textContent = `${d.victorias} ${d.victorias === 1 ? 'victoria' : 'victorias'} y ${d.derrotas} ${d.derrotas === 1 ? 'derrota' : 'derrotas'} en Tenka Ichi.`;
      }
      if (!d.campeones.length) return;
      cajaCampeones.innerHTML = '<h4>Lo que más juega</h4>' + d.campeones.map(x =>
        `<span class="campeon-ficha" title="${escapar(campeones.nombre(x.id))}: ${x.partidas} ${x.partidas === 1 ? 'partida' : 'partidas'}, ${x.victorias} ${x.victorias === 1 ? 'victoria' : 'victorias'}"><img src="${icono(x.id)}" alt="${escapar(campeones.nombre(x.id))}"><b>${x.partidas}</b></span>`).join('');
    }).catch(() => {});
  }
  ficha.querySelector('.ficha-suplentes').textContent = c.suplentes ? `Suplentes: ${c.suplentes}` : '';
  ficha.querySelector('.ficha-record').textContent = c.legacy ? 'Equipo Legacy de Koryu Budo: está apartado de la competición de Tenka Ichi.'
    : !participa ? 'No participa en esta temporada.'
    : fila?.jugadas ? `${fila.puesto}.º en la liguilla, con ${fila.victorias} victorias y ${fila.derrotas} derrotas.` : 'Aún no ha jugado en Tenka Ichi.';
  ficha.showModal();
}

// ---------- Liga ----------
const clan = id => clanes.find(c => c.id === id) || { id, nombre: id, color: '#8E8676' };
const nombre = id => clan(id).nombre;
const escudo = id => `<img src="${logo(id)}" alt="">`;
// El color del clan, para las piezas que hablan de él (filas, cruces, series y fichas de la tier list)
const tinte = id => `style="--color:${clan(id).color}; --color-texto:${clan(id).texto || clan(id).color}"`;

if (simulacion) {
  $('.aviso-simulacion').hidden = false;
  document.title = 'Simulación · Tenka Ichi';
}

// Todo lo que depende del calendario y de los resultados: se vuelve a pintar cuando el sorteo en directo fija el calendario
function pintarLiga() {
  const cls = comp.clasificacion;
  const formato = comp.formato;
  // «Liguilla: 8, 15, 22 y 29 de noviembre. Playoffs: cuartos el 6 de diciembre, semifinales el 13 y final el 20.»
  const diasDe = lista => `${lista.slice(0, -1).map(f => fechaCorta(f.fecha, true).split(' ')[0]).join(', ')} y ${fechaCorta(lista.at(-1).fecha, true)}`;
  const fechasTemporada = `Liguilla: ${diasDe(formato.liguilla)}. Playoffs: cuartos el ${fechaCorta(formato.playoffs[0].fecha, true)}, semifinales el ${fechaCorta(formato.playoffs[1].fecha, true).split(' ')[0]} y final el ${fechaCorta(formato.playoffs[2].fecha, true).split(' ')[0]}.`;
  if (!comp.calendario) {
    $('.resumen-liga').textContent = `El sorteo de los cruces aún no se ha hecho. ${fechasTemporada}`;
  } else if (cls.completa && comp.cuadro?.campeon) {
    $('.resumen-liga').textContent = `Temporada terminada. ${nombre(comp.cuadro.campeon)} reina bajo el cielo.`;
  } else if (cls.completa) {
    $('.resumen-liga').textContent = 'Liguilla terminada. Se juegan los playoffs.';
  } else {
    $('.resumen-liga').textContent = cls.jugadas
      ? `${cls.jugadas} de ${cls.total} partidas de liguilla jugadas. Los datos se actualizan al terminar cada partida.`
      : `Calendario sorteado. La liguilla aún no ha empezado. ${fechasTemporada}`;
  }

  // Clasificación
  const CRITERIO = { directo: 'por enfrentamiento directo', fuerza: 'por fuerza de calendario', sorteo: 'por sorteo', desempate: 'partida de desempate' };
  const tbody = $('.tabla tbody');
  if (cls) {
    $('.tabla').hidden = false;
    tbody.innerHTML = cls.filas.map(f => `
      <tr class="${f.playoffs ? 'dentro' : 'fuera'}${f.puesto === cls.plazas && cls.filas.length > cls.plazas ? ' corte' : ''}" ${tinte(f.clan)}>
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

  // Calendario por jornadas: las fechas se enseñan desde el principio y los cruces, cuando se sortean
  {
    const sorteadas = comp.calendario?.jornadas || [];
    const total = Math.max(formato.liguilla.length, sorteadas.length);
    const primeraPendiente = sorteadas.findIndex(j => j.some(c => !cls.resultados[c.id]));
    let actual = !sorteadas.length || primeraPendiente === -1 ? Math.max(sorteadas.length - 1, 0) : primeraPendiente;
    const pintarJornada = () => {
      $('.jornadas').innerHTML = Array.from({ length: total }, (_, i) =>
        `<button role="tab" aria-selected="${i === actual}" data-i="${i}">Jornada ${i + 1}<small> · ${fechaCorta(formato.liguilla[i]?.fecha)}</small></button>`).join('');
      $('.cruces').innerHTML = sorteadas[actual]?.map(c => {
        const r = cls.resultados[c.id];
        const lado = (id, color) => `<span class="lado-cruce ${r ? (r.ganador === id ? 'gana' : 'pierde') : ''}" ${tinte(id)}><i class="punto ${color}" title="Lado ${color}"></i>${escudo(id)}${nombre(id)}</span>`;
        return `<li>${lado(c.azul, 'azul')}<span class="vs-cruce">${r ? '' : 'vs'}</span>${lado(c.rojo, 'rojo')}</li>`;
      }).join('') || '<li class="vacio">Los cruces se sortean antes de la primera jornada.</li>';
      document.querySelectorAll('.jornadas button').forEach(b => b.addEventListener('click', () => { actual = Number(b.dataset.i); pintarJornada(); }));
    };
    pintarJornada();
  }

  // Cuadro de playoffs
  const cuadro = comp.cuadro;
  const serieHTML = s => {
    const fila = id => {
      if (!id) return '<div class="fila-serie pendiente"><span>Por decidir</span></div>';
      const v = s.victorias?.[id] ?? 0;
      return `<div class="fila-serie ${s.ganador ? (s.ganador === id ? 'gana' : 'pierde') : ''}" ${tinte(id)}>
        <span class="semilla">${s.puestos?.[id] ?? ''}</span>${escudo(id)}<span class="nombre-serie">${nombre(id)}</span><b>${s.partidas.length ? v : ''}</b></div>`;
    };
    return `<div class="serie">${fila(s.alto)}${fila(s.bajo)}</div>`;
  };
  if (cuadro) {
    const dia = ronda => `<small> · ${fechaCorta(formato.playoffs.find(r => r.ronda === ronda).fecha)}</small>`;
    $('.cuadro').innerHTML = `
      <div class="ronda"><h4>Cuartos${dia('cuartos')}</h4><div class="series">${cuadro.cuartos.map(serieHTML).join('')}</div></div>
      <div class="ronda"><h4>Semifinales${dia('semis')}</h4><div class="series">${cuadro.semis.map(serieHTML).join('')}</div></div>
      <div class="ronda"><h4>Final${dia('final')}</h4><div class="series">${serieHTML(cuadro.final)}</div></div>
      <div class="ronda campeon-ronda"><h4>Campeón</h4><div class="series">${cuadro.campeon
        ? `<div class="campeon" style="--color:${clan(cuadro.campeon).color}"><img src="/clanes/${cuadro.campeon}.jpg" alt=""><span class="hanko">一</span><b>${nombre(cuadro.campeon)}</b></div>`
        : '<p class="vacio">Por decidir</p>'}</div></div>`;
  } else {
    $('.cuadro').innerHTML = `<p class="vacio">El cuadro se forma al terminar la liguilla${cls?.desempate && !cls.desempate.ganador ? ' y el desempate' : ''}. Cuartos el ${fechaCorta(formato.playoffs[0].fecha, true)}, semifinales el ${fechaCorta(formato.playoffs[1].fecha, true).split(' ')[0]} y final el ${fechaCorta(formato.playoffs[2].fecha, true).split(' ')[0]}.</p>`;
  }
}
pintarLiga();

// Sorteo del calendario en directo: el bombo sale en la zona de la liga mientras sale y, mientras no haya
// calendario, como anuncio. Al terminar, el servidor ya lo ha guardado y se vuelve a pintar la liga con él
if (!simulacion) {
  const bombo = montarSorteo($('.sorteo'), {
    clan, logo, formato: comp.formato, hayCalendario: () => Boolean(comp.calendario),
    alTerminar: async () => { comp = await fetch('/api/competicion').then(r => r.json()); pintarLiga(); },
  });
  conectarDirecto({ canal: 'sorteo', alSorteo: v => bombo.recibir(v) });
}

// Campeones con más presencia
$('.campeones').innerHTML = liga.campeones.length
  ? liga.campeones.map(c => `<li><img src="${icono(c.id)}" alt="">
      <div><div class="fila-nombre"><b>${campeones.nombre(c.id)}</b><span class="cifras">Pick ${c.pick}%, ban ${c.ban}%${c.winrate === null ? '' : `, victorias ${c.winrate}%`}</span></div>
      <div class="barra-presencia" title="Presencia ${c.presenciaPct}%"><span style="width:${c.presenciaPct}%"></span></div></div></li>`).join('')
  : '<li class="vacio">Sin partidas todavía.</li>';

// ---------- Directo ----------
import('/directo.js').then(({ iniciarDirecto }) => iniciarDirecto({
  marco: $('.directo-marco'),
  alCambiar: vivo => { $('.directo-estado').textContent = vivo ? 'Ahora en directo en Twitch.' : 'Sin directo ahora mismo.'; },
}));

// ---------- Tier list ----------
const TIERS = ['S', 'A', 'B', 'C', 'D'];
const ROL_CORTO = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
let tipoTier = 'jugadores';

function pintarTierlist() {
  const lista = tierlist[tipoTier].filter(x => x.tier && (tipoTier === 'equipos' || x.nombre));
  if (!lista.length) {
    $('.tier-filas').innerHTML = `<p class="tier-aviso">La tier list de ${tipoTier === 'jugadores' ? 'jugadores' : 'equipos'} se publica cuando el staff la tenga lista.</p>`;
    return;
  }
  $('.tier-filas').innerHTML = TIERS.map(t => {
    const fichas = lista.filter(x => x.tier === t).map(x => tipoTier === 'equipos'
      ? `<span class="ficha-tier" ${tinte(x.id)}><img src="${logo(x.id)}" alt=""><b>${x.nombre}</b></span>`
      : `<button type="button" class="ficha-tier" ${tinte(x.clan)} data-id="${x.id}" title="Ver la carta de ${escapar(x.nombre)}"><img src="${logo(x.clan)}" alt=""><b>${escapar(x.nombre)}</b><small>${ROL_CORTO[x.rol]}, ${nombre(x.clan)}</small></button>`).join('');
    return `<div class="tier-fila" data-tier="${t}" style="--color-tier: var(--tier-${t})"><span class="tier-letra">${t}</span>
      <div class="tier-fichas">${fichas || '<span class="tier-vacia">Nadie en esta tier</span>'}</div></div>`;
  }).join('');
  $('.tier-filas').querySelectorAll('button.ficha-tier').forEach(b => b.addEventListener('click', () => abrirCarta(b.dataset.id)));
  $('.tier-pista').hidden = tipoTier !== 'jugadores';
}
document.querySelectorAll('.tier-pestanas button').forEach(b => b.addEventListener('click', () => {
  tipoTier = b.dataset.tipo;
  document.querySelectorAll('.tier-pestanas button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarTierlist();
}));
pintarTierlist();

// ---------- La carta de un jugador ----------
// Su carta del gachapon y lo que lleva en la liga: partidas, victorias, KDA, campeones y puntos del fantasy
const fichaCarta = $('.ficha-carta');
fichaCarta.querySelector('.cerrar').addEventListener('click', () => fichaCarta.close());
fichaCarta.addEventListener('click', e => { if (e.target === fichaCarta) fichaCarta.close(); });
const cifra = n => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });

async function abrirCarta(id) {
  const j = await fetch(`/api/jugador?id=${encodeURIComponent(id)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!j) return;
  const c = clan(j.clan), g = j.general;
  fichaCarta.style.setProperty('--color', c.color);
  fichaCarta.querySelector('.ficha-carta-carta').innerHTML = j.carta ? cartaHTML(j.carta, { nombreClan: nombre })
    : `<img class="sin-carta" src="/clanes/${j.clan}.jpg" alt="">`;
  fichaCarta.querySelector('#carta-nombre').textContent = j.nombre;
  fichaCarta.querySelector('.ficha-carta-quien').textContent = `${ROLES_LEGIBLES[j.rol] || j.rol} de ${c.nombre}${j.tier ? ` · Tier ${j.tier}` : ''}`;
  const datos = [];
  const dato = (valor, texto) => datos.push(`<div><dt>${texto}</dt><dd>${valor}</dd></div>`);
  dato(g.partidas, g.partidas === 1 ? 'Partida' : 'Partidas');
  if (g.partidas) dato(`${g.victorias}–${g.derrotas}`, 'Victorias y derrotas');
  if (g.kda) dato(`${cifra(g.kda.k)} / ${cifra(g.kda.d)} / ${cifra(g.kda.a)}`, 'KDA por partida');
  if (g.mvps) dato(g.mvps, g.mvps === 1 ? 'Vez MVP' : 'Veces MVP');
  dato(cifra(j.fantasy.puntos), 'Puntos en el fantasy');
  fichaCarta.querySelector('.ficha-carta-datos').innerHTML = datos.join('');
  fichaCarta.querySelector('h4').hidden = !j.campeones.length;
  fichaCarta.querySelector('.ficha-carta-campeones').innerHTML = j.campeones.length
    ? j.campeones.map(x => `<li><img src="${icono(x.id)}" alt=""><span><b>${escapar(campeones.nombre(x.id))}</b>
        <small>${x.partidas} ${x.partidas === 1 ? 'partida' : 'partidas'}, ${x.victorias}–${x.derrotas}${x.kda ? ` · KDA ${cifra(x.kda.ratio)}` : ''}</small></span></li>`).join('')
    : '<li class="vacio">Aún no ha jugado en Tenka Ichi.</li>';
  if (!fichaCarta.open) fichaCarta.showModal();
}

// Una carta LEGACY: no tiene números de la liga, es de colección
function abrirCartaLegacy(x) {
  fichaCarta.style.setProperty('--color', clan(x.clan).color);
  fichaCarta.querySelector('.ficha-carta-carta').innerHTML = cartaHTML(x, { nombreClan: nombre });
  fichaCarta.querySelector('#carta-nombre').textContent = x.nombre;
  fichaCarta.querySelector('.ficha-carta-quien').textContent = `Carta Legacy · ${x.subtitulo}`;
  fichaCarta.querySelector('.ficha-carta-datos').innerHTML = '';
  fichaCarta.querySelector('h4').hidden = true;
  fichaCarta.querySelector('.ficha-carta-campeones').innerHTML = `<li class="vacio">Carta de colección de ${escapar(nombre(x.clan))}, el equipo Legacy de Koryu Budo. No está entre las cartas normales de los sobres: de vez en cuando sale una de regalo, como carta extra. No se alinea en el fantasy.</li>`;
  if (!fichaCarta.open) fichaCarta.showModal();
}

// ---------- Fantasy: la clasificación general y la de cada jornada ----------
let jornadaFantasy = '';
function pintarFantasy() {
  if (!fantasy) return;
  const jornadas = fantasy.jornadas || [];
  const pestanas = $('.pestanas-fantasy');
  pestanas.hidden = !jornadas.length;
  pestanas.innerHTML = [['', 'General'], ...jornadas.map(j => [j, j])].map(([valor, texto]) =>
    `<button role="tab" aria-selected="${valor === jornadaFantasy}" data-jornada="${escapar(valor)}">${escapar(texto)}</button>`).join('');
  pestanas.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { jornadaFantasy = b.dataset.jornada; pintarFantasy(); }));
  const filas = (jornadaFantasy ? fantasy.clasificacionesJornada?.[jornadaFantasy] || [] : fantasy.clasificacion).slice(0, 10);
  const premio = jornadaFantasy ? fantasy.premios?.find(p => p.jornada === jornadaFantasy) : null;
  const sobres = puesto => premio?.ganadores.find(g => g.puesto === puesto)?.sobres || 0;
  $('.ranking-fantasy').innerHTML = filas.length ? filas.map(c => `<li><span class="puesto">${c.puesto}</span><b>${escapar(c.nombre)}</b>
      ${sobres(c.puesto) ? `<em>+${sobres(c.puesto)} ${sobres(c.puesto) === 1 ? 'sobre' : 'sobres'}</em>` : ''}
      <span class="puntos">${cifra(c.puntos)}<small>${c.puntos === 1 ? 'punto' : 'puntos'}</small></span></li>`).join('')
    : '<li class="vacio">La clasificación empieza con la primera jornada.</li>';
  const [uno, dos, tres] = fantasy.sobresPremio || [];
  $('.premios-portada').textContent = uno || dos || tres ? `Los tres primeros de cada jornada se llevan sobres: ${uno}, ${dos} y ${tres}.` : '';
}
pintarFantasy();

// ---------- Movimiento: entradas al bajar, sección activa en el menú y salida de la baraja ----------
import('/inicio-movimiento.js').catch(() => {});
