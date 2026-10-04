// Overlay para OBS (1920×1080): la única fuente de navegador que hace falta. Enseña cuatro cosas, que cambian solas
// según lo que va pasando (el panel puede forzar cualquiera): el draft, el postdraft (el draft cerrado con las
// estadísticas de cada jugador y de los dos clanes), el marcador de la partida y la pantalla final.
// Por defecto pinta su propio fondo de tinta con los huecos de las cámaras recortados:
// las cámaras de OBS van debajo del overlay, encajadas en esos huecos.
// ?transparente=1 quita el fondo; ?guia=1 marca los huecos con sus medidas para colocarlas.
import { cargarCampeones, cargarClanes, conectarDirecto, icono, splash, logo, disposicionCamaras, PLACA_CAMARA } from '/comun.js';
import { cartaHTML } from '/carta.js';

const params = new URLSearchParams(location.search);
if (params.has('transparente')) document.body.classList.add('transparente');
if (params.has('guia')) document.body.classList.add('guia');
// ?vista=postdraft (o final, draft, partida): se queda en esa vista diga lo que diga el panel, para montar la escena
const vistaFija = ['draft', 'postdraft', 'partida', 'final'].includes(params.get('vista')) ? params.get('vista') : null;

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
const ROL_LEGIBLE = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const COLOR_LADO = { azul: 'var(--azul-lado)', rojo: 'var(--rojo-lado)' };
const DURACION_TARJETA = 8000;
const ESCENARIO = { x: 620, y: 212 };
const numero = (n, decimales = 1) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: decimales });
const miles = n => `${(n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const escapar = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const nombreClan = id => clanes.clan(id).nombre;

for (const lado of ['azul', 'rojo']) {
  // Cada pick: el splash, el rol, el jugador y el campeón; en el postdraft, además, su carta, lo que lleva con ese
  // campeón, sus números de la liga y sus puntos del fantasy
  $(`.picks.${lado}`).innerHTML = ROLES.map((_, i) =>
    `<div class="slot" data-i="${i}"><div class="arte"></div><div class="velo"></div><div class="trazo"></div><div class="barra"></div>
      <div class="mini-carta"></div>
      <div class="textos"><div class="linea-rol"><span class="rol"></span><span class="jugador"></span></div><div class="campeon"></div>
        <div class="con-campeon"></div><div class="general"></div></div>
      <div class="fantasy-slot"><b></b><span>puntos fantasy</span></div></div>`).join('');
  $(`.bans.${lado}`).innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="ban" data-i="${i}"></div>`).join('')
    + '<span class="hanko" title="Bans">禁</span>';
}

let estado = null, ultimoAviso = 0, temporizadorTarjeta = null, primeraVez = true, ultimoTurno = null, firmaCamaras = '';
const fijados = { azul: Array(5).fill(null), rojo: Array(5).fill(null) };
const nombreEquipo = (c, lado) => (c.id === 'NONAME' ? `Lado ${lado}` : c.nombre);

function pintar(e) {
  estado = e;
  const alCargar = primeraVez;
  pintarVista(e);
  const d = e.draft;
  const activo = d.activo;
  for (const lado of ['azul', 'rojo']) {
    const eq = e.equipos[lado];
    const c = clanes.clan(eq.clan);
    const placa = $(`.placa.${lado}`);
    placa.style.setProperty('--color-clan', c.texto);
    placa.querySelector('.logo').src = logo(c.id);
    placa.querySelector('.nombre').textContent = nombreEquipo(c, lado);
    placa.querySelector('.lema').textContent = c.lema || '';
    placa.querySelector('.kanji-fondo').textContent = c.kanji || '';

    $(`.picks.${lado}`).querySelectorAll('.slot').forEach((slot, i) => {
      const campeon = d.picks[lado][i];
      const esActivo = activo?.tipo === 'pick' && activo.lado === lado && activo.indice === i;
      const mostrado = campeon || (esActivo ? d.hover : null);
      // Pincelada solo cuando el pick se fija en directo (no al cargar la página)
      if (campeon && campeon !== fijados[lado][i] && !primeraVez) {
        slot.classList.remove('recien'); void slot.offsetWidth; slot.classList.add('recien');
      }
      fijados[lado][i] = campeon;
      slot.classList.toggle('lleno', Boolean(campeon));
      slot.classList.toggle('hover', !campeon && Boolean(mostrado));
      slot.classList.toggle('activo', esActivo);
      slot.querySelector('.arte').style.backgroundImage = mostrado ? `url(${splash(mostrado)})` : '';
      slot.querySelector('.rol').textContent = ROL_LEGIBLE[ROLES[i]];
      slot.querySelector('.jugador').textContent = eq.jugadores[i] || '';
      slot.querySelector('.campeon').textContent = mostrado ? campeones.nombre(mostrado) : '';
    });

    $(`.bans.${lado}`).querySelectorAll('.ban').forEach((ban, i) => {
      const campeon = d.bans[lado][i];
      const esActivo = activo?.tipo === 'ban' && activo.lado === lado && activo.indice === i;
      const mostrado = campeon || (esActivo ? d.hover : null);
      ban.classList.toggle('activo', esActivo);
      ban.classList.toggle('lleno', Boolean(campeon));
      ban.classList.toggle('hover', !campeon && Boolean(mostrado));
      ban.innerHTML = mostrado ? `<img src="${icono(mostrado)}" alt="">` : '';
    });
  }
  primeraVez = false;

  pintarMarcador(e);
  pintarTiempo(d);
  pintarCamaras(e);
  pintarCodigo(e);
  pintarFinal(e);
  pedirPrevia(e);

  const cfg = e.config;
  $('.reposo .jornada').textContent = cfg.fase === 'Fase de liga' ? `${cfg.jornada} de la liguilla` : cfg.jornada;
  const fl = $('.fearless');
  fl.hidden = !(cfg.formato === 'bo3f' && e.fearless.length);
  fl.querySelector('.iconos').innerHTML = e.fearless.map(c => `<img src="${icono(c)}" alt="">`).join('');

  // La tarjeta sale cuando el pick o el ban llega en directo, no con el que ya estaba al cargar la página
  if (e.aviso && e.aviso.id !== ultimoAviso) {
    ultimoAviso = e.aviso.id;
    if (!alCargar) mostrarTarjeta(e.aviso);
  }
}

// ---------- qué se enseña ----------
// El marcador de la partida es otra página (/ingame/): se carga la primera vez que hace falta y se queda cargada
let vistaActual = null;
function pintarVista(e) {
  const vista = vistaFija || e.vistaOverlay || 'draft';
  if (vista === vistaActual) return;
  vistaActual = vista;
  const marco = $('.vista-partida');
  if (vista === 'partida' && !marco.getAttribute('src')) marco.src = '/ingame/';
  document.body.dataset.vista = vista;
  // En el postdraft y en la pantalla final no hay cámaras: el fondo va entero
  firmaCamaras = '';
}

// En Bo1: jornada y fase. En Bo3: ronda, marcador de la serie y número de partida.
function pintarMarcador(e) {
  const cfg = e.config;
  const m = $('.marcador');
  if (cfg.formato === 'bo3f') {
    const victorias = lado => e.resultados.filter(r => r.clan === e.equipos[lado].clan).length;
    m.querySelector('.arriba').textContent = cfg.jornada;
    m.querySelector('.grande').innerHTML = `<span class="v azul">${victorias('azul')}</span><span class="raya">–</span><span class="v rojo">${victorias('rojo')}</span>`;
    m.querySelector('.abajo').textContent = `Partida ${cfg.partida}, fearless`;
  } else {
    m.querySelector('.arriba').textContent = cfg.fase;
    m.querySelector('.grande').textContent = cfg.jornada;
    m.querySelector('.abajo').textContent = '';
  }
}

function pintarTiempo(d) {
  const sello = $('.sello-tiempo');
  const hay = d.activo && typeof d.tiempo === 'number';
  sello.hidden = !hay;
  if (!hay) return;
  sello.textContent = Math.max(0, Math.ceil(d.tiempo));
  sello.classList.toggle('urgente', d.tiempo <= 10);
  // Cada turno nuevo, el sello se vuelve a estampar
  if (d.turno !== ultimoTurno) {
    ultimoTurno = d.turno;
    sello.classList.remove('estampa'); void sello.offsetWidth; sello.classList.add('estampa');
  }
}

// ---------- Cámaras ----------
function datosCamara(cam, e) {
  if (cam.tipo === 'caster') return { color: 'var(--washi)', logo: null, nombre: cam.nombre || 'Caster', detalle: cam.detalle };
  const lado = cam.tipo === 'azul' || cam.tipo === 'rojo' ? cam.tipo : null;
  const idClan = lado ? e.equipos[lado].clan : cam.tipo;
  const c = clanes.clan(idClan);
  const ladoDelClan = lado || ['azul', 'rojo'].find(l => e.equipos[l].clan === idClan);
  return {
    color: ladoDelClan ? COLOR_LADO[ladoDelClan] : c.color,
    logo: logo(c.id),
    nombre: cam.nombre || nombreEquipo(c, ladoDelClan || 'azul'),
    detalle: cam.detalle || (cam.nombre ? nombreEquipo(c, ladoDelClan || 'azul') : ''),
  };
}

function pintarCamaras(e) {
  // Las cámaras solo salen con el draft: en el postdraft el centro es para los dos clanes
  const cantidad = vistaActual === 'draft' ? e.camaras.cantidad : 0, { lista } = e.camaras;
  const huecos = disposicionCamaras(cantidad);
  const datos = huecos.map((_, i) => datosCamara(lista[i], e));
  const firma = JSON.stringify([huecos, datos]);
  if (firma === firmaCamaras) return;
  firmaCamaras = firma;

  $('.escenario').classList.toggle('con-camaras', cantidad > 0);
  $('.camaras').innerHTML = huecos.map((h, i) => {
    const dt = datos[i];
    const pequena = h.w < 400;
    return `<div class="camara${pequena ? ' pequena' : ''}" style="left:${h.x - ESCENARIO.x}px; top:${h.y - ESCENARIO.y}px; width:${h.w}px; height:${h.h + PLACA_CAMARA}px; --color-cam:${dt.color}">
      <div class="hueco" style="height:${h.h}px"><div class="medidas"><span>Cámara ${i + 1}<br>${h.w}×${h.h} en x ${h.x}, y ${h.y}</span></div></div>
      <div class="placa-cam" style="top:${h.h}px">${dt.logo ? `<img src="${dt.logo}" alt="">` : ''}<span class="nombre-cam">${escapar(dt.nombre)}</span><span class="detalle-cam">${escapar(dt.detalle || '')}</span></div>
    </div>`;
  }).join('');
  recortarFondo(huecos);
}

// Máscara del fondo: todo el lienzo menos los huecos de las cámaras
function recortarFondo(huecos) {
  const fondo = $('#lienzo .fondo');
  if (!huecos.length) { fondo.style.maskImage = fondo.style.webkitMaskImage = ''; return; }
  const agujeros = huecos.map(h => `M${h.x} ${h.y}h${h.w}v${h.h}h-${h.w}z`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><path fill-rule='evenodd' fill='#000' d='M0 0H1920V1080H0Z${agujeros}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  fondo.style.maskImage = url;
  fondo.style.webkitMaskImage = url;
}

// ---------- Tarjeta del último pick o ban ----------
function mostrarTarjeta(a) {
  const s = a.stats;
  const c = clanes.clan(a.clan);
  const equipo = nombreEquipo(c, a.lado);
  let pie = `Sobre ${s.partidas} ${s.partidas === 1 ? 'partida' : 'partidas'} de Tenka Ichi`;
  if (a.tipo === 'pick') {
    const partes = [];
    if (s.jugador && a.jugador) partes.push(s.jugador.veces
      ? `${a.jugador} lo ha jugado ${s.jugador.veces} ${s.jugador.veces === 1 ? 'vez' : 'veces'} (${s.jugador.victorias}-${s.jugador.derrotas})`
      : `primera vez de ${a.jugador}`);
    if (s.clan && c.id !== 'NONAME') partes.push(s.clan.veces ? `${s.clan.veces + 1}.ª vez en ${c.nombre}` : `estreno en ${c.nombre}`);
    if (partes.length) { const frase = partes.join(', '); pie = `<b>${escapar(frase[0].toUpperCase() + frase.slice(1))}</b>`; }
  }
  const tarjeta = $('.tarjeta');
  tarjeta.className = `tarjeta ${a.lado} es-${a.tipo}`;
  tarjeta.innerHTML = `
    <div class="retrato"><img class="icono" src="${icono(a.campeon)}" alt=""><span class="hanko sello">${a.tipo === 'pick' ? '選' : '禁'}</span></div>
    <div class="cabeza">
      <div class="quien">${a.tipo === 'pick' ? `${ROL_LEGIBLE[a.rol]} de ${escapar(equipo)}` : `Baneado por ${escapar(equipo)}`}</div>
      <div class="nombre">${campeones.nombre(a.campeon)}</div>
    </div>
    <div class="datos">
      <div class="dato"><b>${s.pick}%</b><span>Pick</span></div>
      <div class="dato"><b>${s.ban}%</b><span>Ban</span></div>
      <div class="dato"><b>${s.presencia}%</b><span>Presencia</span></div>
      <div class="dato"><b>${s.winrate === null ? '–' : `${s.winrate}%`}</b><span>Victorias</span></div>
    </div>
    <div class="pie-tarjeta">${pie}</div>`;
  tarjeta.hidden = false;
  $('.franja').classList.add('con-tarjeta');
  document.body.classList.add('con-tarjeta');
  clearTimeout(temporizadorTarjeta);
  temporizadorTarjeta = setTimeout(() => {
    tarjeta.hidden = true;
    $('.franja').classList.remove('con-tarjeta');
    document.body.classList.remove('con-tarjeta');
  }, DURACION_TARJETA);
}

// ---------- Postdraft ----------
// Las estadísticas de cada jugador y de cada clan las calcula el servidor (/api/previa). Se piden al entrar en el
// postdraft o en la pantalla final, y otra vez si cambian los clanes, los jugadores o los picks
let previa = null, firmaPrevia = '', pidiendo = false;
async function pedirPrevia(e) {
  if (!['postdraft', 'final'].includes(vistaActual)) return;
  const firma = JSON.stringify([e.equipos, e.draft.picks, e.final?.cuando, e.resultados.length]);
  if (firma === firmaPrevia || pidiendo) return;
  pidiendo = true;
  try {
    previa = await fetch(`/api/previa${params.has('simulacion') ? '?simulacion' : ''}`, { cache: 'no-store' }).then(r => r.json());
    firmaPrevia = firma;
    pintarPostdraft();
    if (estado) pintarFinal(estado);
  } catch { /* se vuelve a pedir con el siguiente estado */ }
  pidiendo = false;
}

function pintarPostdraft() {
  if (!previa) return;
  for (const lado of ['azul', 'rojo']) {
    const eq = previa[lado];
    $(`.picks.${lado}`).querySelectorAll('.slot').forEach((slot, i) => {
      const j = eq.jugadores[i];
      slot.querySelector('.mini-carta').innerHTML = j.carta ? cartaHTML(j.carta, { nombreClan }) : '';
      slot.classList.toggle('con-carta', Boolean(j.carta));
      // Con el campeón que va a jugar: «FIRST PICK» si es la primera vez; si no, sus partidas y su KDA con él
      const con = slot.querySelector('.con-campeon');
      if (!j.campeon || !j.nombre) con.textContent = '';
      else if (j.primeraVez) con.innerHTML = '<span class="estreno">FIRST PICK</span>';
      else {
        const c = j.conCampeon;
        con.innerHTML = `<b>${plural(c.partidas, 'partida', 'partidas')}</b> · ${c.victorias}V ${c.derrotas}D${c.kda ? ` · KDA <b>${numero(c.kda.ratio)}</b>` : ''}`;
      }
      const g = j.general;
      slot.querySelector('.general').textContent = !j.nombre ? '' : !g.partidas ? 'Debuta en Tenka Ichi'
        : `Liga: ${plural(g.partidas, 'partida', 'partidas')} · ${g.wr} % victorias${g.kda ? ` · KDA ${numero(g.kda.ratio)}` : ''}`;
      const caja = slot.querySelector('.fantasy-slot');
      caja.hidden = !j.fantasy;
      caja.querySelector('b').textContent = j.fantasy ? numero(j.fantasy.puntos) : '';
    });

    // Los dos clanes frente a frente: su arte, su porcentaje de victorias y su balance
    const figura = $(`.versus-arte .clan.${lado}`), c = clanes.clan(eq.clan);
    figura.style.setProperty('--color-clan', c.color);
    const img = figura.querySelector('img'), arte = c.invitado ? '/marca/sol-partido.jpg' : `/clanes/${c.id}.jpg`;
    if (img.getAttribute('src') !== arte) img.src = arte;
    figura.querySelector('.wr').innerHTML = eq.wr == null ? '–' : `${eq.wr}<small>%</small>`;
    figura.querySelector('.record').textContent = eq.partidas ? `${eq.victorias}V ${eq.derrotas}D${eq.puesto ? ` · ${eq.puesto}.º` : ''}` : 'Sin partidas';
  }

  // Lo que se puede comparar entre los dos. Cada fila: valor azul, qué es y valor rojo; gana = mayor o menor es mejor
  const a = previa.azul, r = previa.rojo, filas = [];
  const fila = (texto, va, vr, { mejor = 'mayor', formato = numero } = {}) => {
    if (va == null && vr == null) return;
    const gana = va == null || vr == null || va === vr ? '' : (mejor === 'mayor' ? va > vr : va < vr) ? 'azul' : 'rojo';
    filas.push(`<div class="dato-vs"><b class="${gana === 'azul' ? 'gana' : ''}">${va == null ? '–' : formato(va)}</b><span>${texto}</span><b class="${gana === 'rojo' ? 'gana' : ''}">${vr == null ? '–' : formato(vr)}</b></div>`);
  };
  const racha = x => (x.racha ? (x.racha.tipo === 'V' ? plural(x.racha.n, 'victoria', 'victorias') : plural(x.racha.n, 'derrota', 'derrotas')) : null);
  if (previa.caraACara.partidas) fila('Cara a cara', previa.caraACara.azul, previa.caraACara.rojo);
  fila('Asesinatos por partida', a.medias.asesinatos, r.medias.asesinatos);
  fila('Muertes por partida', a.medias.muertes, r.medias.muertes, { mejor: 'menor' });
  fila('Daño por partida', a.medias.dano, r.medias.dano, { formato: miles });
  fila('Primera sangre', a.medias.primeraSangre, r.medias.primeraSangre, { formato: n => `${n} %` });
  if (a.racha || r.racha) filas.push(`<div class="dato-vs texto"><b>${racha(a) || '–'}</b><span>Racha</span><b>${racha(r) || '–'}</b></div>`);
  // Los campeones que más juega cada clan
  const mas = x => x.campeones.slice(0, 3).map(c => `<img src="${icono(c.id)}" alt="${escapar(campeones.nombre(c.id))}" title="${escapar(campeones.nombre(c.id))}">`).join('');
  if (a.campeones.length || r.campeones.length) filas.push(`<div class="dato-vs iconos"><b>${mas(a)}</b><span>Más jugados</span><b>${mas(r)}</b></div>`);
  $('.versus-datos').innerHTML = filas.length ? filas.join('')
    : `<p class="sin-datos">${previa.partidasLiga ? 'Primer partido de los dos clanes en esta liga.' : 'Empieza la liga: todavía no hay partidas jugadas.'}</p>`;
}

// ---------- Pantalla final ----------
const DRAGON = { infernal: '炎', oceano: '海', montana: '山', nube: '雲', hextech: '雷', quimtech: '毒', ancestral: '龍', dragon: '龍' };
// El daño no va en columna: sale debajo de cada jugador, en una barra fina con la cifra en medio
const TITULOS = ['KDA', 'Farmeo', 'Oro', 'Visión', 'Fantasy'];
$('.final-columnas .titulos.azul').innerHTML = TITULOS.map(t => `<span>${t}</span>`).join('');
$('.final-columnas .titulos.rojo').innerHTML = [...TITULOS].reverse().map(t => `<span>${t}</span>`).join('');
$('.final-filas').innerHTML = ROLES.map((rol, i) => `<div class="final-fila" data-i="${i}">
  <div class="final-jugador azul"></div><span class="final-rol"><b>${ROL_LEGIBLE[rol]}</b><small>Daño</small></span><div class="final-jugador rojo"></div></div>`).join('');

let firmaFinal = '';
function pintarFinal(e) {
  const f = e.final;
  if (!f) return;
  const firma = JSON.stringify([f, e.config, previa && firmaPrevia]);
  if (firma === firmaFinal) return;
  firmaFinal = firma;
  const dato = v => (v == null ? '–' : numero(v, 0));
  for (const lado of ['azul', 'rojo']) {
    const eq = f.equipos[lado], c = clanes.clan(eq.clan), caja = $(`.final-clan.${lado}`);
    caja.style.setProperty('--color-clan', c.texto);
    caja.querySelector('.logo').src = logo(c.id);
    caja.querySelector('.nombre').textContent = nombreEquipo(c, lado);
    caja.querySelector('.resultado').textContent = !f.ganador ? '' : f.ganador === lado ? 'Victoria' : 'Derrota';
    caja.classList.toggle('gana', f.ganador === lado);
    caja.classList.toggle('pierde', Boolean(f.ganador) && f.ganador !== lado);
    caja.querySelector('.asesinatos').textContent = eq.kills == null ? '' : eq.kills;

    // Lo del clan: oro, torres, inhibidores, dragones (con su elemento), barones, heraldos y larvas
    const partes = [];
    const cifra = (valor, texto) => { if (valor != null) partes.push(`<div class="total"><b>${valor}</b><span>${texto}</span></div>`); };
    cifra(eq.oro == null ? null : miles(eq.oro), 'de oro');
    cifra(eq.torres, eq.torres === 1 ? 'torre' : 'torres');
    cifra(eq.inhibidores || null, eq.inhibidores === 1 ? 'inhibidor' : 'inhibidores');
    cifra(eq.barones || null, eq.barones === 1 ? 'Barón' : 'Barones');
    cifra(eq.heraldos || null, eq.heraldos === 1 ? 'heraldo' : 'heraldos');
    cifra(eq.larvas || null, eq.larvas === 1 ? 'larva' : 'larvas');
    const dragones = [...eq.dragones, ...Array(eq.ancestrales || 0).fill('ancestral')];
    $(`.final-equipo.${lado}`).innerHTML = `<div class="totales">${partes.join('')}</div>`
      + (dragones.length ? `<div class="dragones-final">${dragones.map(d => `<i class="d-${d}" title="${d}">${DRAGON[d] || '龍'}</i>`).join('')}${eq.alma ? '<span>Alma</span>' : ''}</div>` : '');
  }

  const cfg = e.config;
  $('.final-centro .arriba').textContent = f.prueba ? 'Partida de prueba' : 'Final de la partida';
  $('.final-centro .duracion').textContent = f.duracion == null ? '終' : mmss(f.duracion);
  $('.final-centro .duracion').classList.toggle('sello-fin', f.duracion == null);
  $('.final-centro .abajo').textContent = cfg.formato === 'bo3f' ? `${cfg.jornada} · partida ${cfg.partida}` : cfg.fase === 'Fase de liga' ? `${cfg.jornada} de la liguilla` : cfg.jornada;

  // Cada línea: el jugador azul, el rol y el jugador rojo, con el mejor dato de cada pareja resaltado
  const columnas = (j, extra, rival, extraRival) => {
    if (!j) return TITULOS.map(() => '<span class="col">–</span>');
    const mejor = (mio, suyo) => (mio != null && suyo != null && mio > suyo ? ' mejor' : '');
    const kda = j.k == null ? '–' : `${j.k}<i>/</i>${j.d}<i>/</i>${j.a}`;
    return [
      `<span class="col kda">${kda}</span>`,
      `<span class="col${mejor(j.cs, rival?.cs)}">${dato(j.cs)}</span>`,
      `<span class="col oro${mejor(j.oro, rival?.oro)}">${j.oro == null ? '–' : miles(j.oro)}</span>`,
      `<span class="col${mejor(j.vision, rival?.vision)}">${dato(j.vision)}</span>`,
      `<span class="col puntos">${extra?.puntos == null ? '–' : numero(extra.puntos)}</span>`,
    ];
  };
  // El daño de cada jugador va debajo de él: una barra fina que se llena hacia el centro de la pantalla, en proporción
  // al que más daño ha hecho de los diez, con la cifra en medio. La de quien gana su línea va más clara
  const danoDe = (lado, i) => f.extras?.[`${lado}-${i}`]?.dano ?? null;
  const danos = ROLES.flatMap((_, i) => [danoDe('azul', i), danoDe('rojo', i)]).filter(d => d != null);
  const maximo = Math.max(1, ...danos);
  $('.final-filas').classList.toggle('con-dano', danos.length > 0);
  document.querySelectorAll('.final-fila').forEach((fila, i) => {
    const l = f.lineas[i] || {};
    for (const lado of ['azul', 'rojo']) {
      const otro = lado === 'azul' ? 'rojo' : 'azul', j = l[lado], caja = fila.querySelector(`.final-jugador.${lado}`);
      const cols = columnas(j, f.extras?.[`${lado}-${i}`], l[otro], f.extras?.[`${otro}-${i}`]);
      const esMvp = f.mvp === `${lado}-${i}`;
      const quien = `<span class="retrato">${j?.campeon ? `<img src="${icono(j.campeon)}" alt="">` : ''}${j?.nivel ? `<i>${j.nivel}</i>` : ''}</span>
        <span class="quien"><b>${escapar(j?.nombre || '—')}${esMvp ? '<em class="hanko">MVP</em>' : ''}</b><small>${j?.campeon ? escapar(campeones.nombre(j.campeon)) : ''}</small></span>`;
      const dano = danoDe(lado, i), delRival = danoDe(otro, i);
      // La cifra tapa el centro de la barra: si el relleno acabara justo al asomar por el otro lado, quedaría un
      // punto suelto, así que en ese tramo se queda debajo de la cifra
      const parte = dano == null ? 0 : dano / maximo * 100, relleno = parte > 55 && parte < 60 ? 55 : parte;
      const barra = dano == null ? '' : `<span class="dano-final${delRival != null && dano > delRival ? ' mejor' : ''}" style="--parte: ${relleno.toFixed(1)}%"><i></i><b>${miles(dano)}</b></span>`;
      caja.classList.toggle('mvp', esMvp);
      caja.style.backgroundImage = j?.campeon ? `url(${splash(j.campeon)})` : '';
      caja.innerHTML = (lado === 'azul' ? `${quien}${cols.join('')}` : `${[...cols].reverse().join('')}${quien}`) + barra;
    }
  });

  // El MVP, en grande, con su carta si es la suya
  const mvp = $('.final-mvp');
  const [ladoMvp, iMvp] = f.mvp ? f.mvp.split('-') : [];
  const j = f.mvp ? f.lineas[Number(iMvp)]?.[ladoMvp] : null;
  if (!j) {
    mvp.className = 'final-mvp vacio';
    mvp.style.backgroundImage = '';
    mvp.innerHTML = '<img src="/marca/tenka-ichi-cuadro.png" alt=""><span>Tenka Ichi</span>';
  } else {
    const extra = f.extras?.[f.mvp] || {}, deLaPrevia = previa?.[ladoMvp]?.jugadores?.[Number(iMvp)];
    const carta = deLaPrevia?.carta && deLaPrevia.nombre === j.nombre ? deLaPrevia.carta : null;
    mvp.className = `final-mvp ${ladoMvp}`;
    mvp.style.backgroundImage = j.campeon ? `url(${splash(j.campeon)})` : '';
    mvp.innerHTML = `<div class="mvp-texto"><span class="hanko">MVP</span><b>${escapar(j.nombre || '—')}</b>
        <small>${j.campeon ? escapar(campeones.nombre(j.campeon)) : ''} · ${escapar(nombreEquipo(clanes.clan(f.equipos[ladoMvp].clan), ladoMvp))}</small>
        <span class="mvp-datos">${j.k == null ? '' : `<b>${j.k}/${j.d}/${j.a}</b>`}${extra.dano == null ? '' : `<span>${miles(extra.dano)} de daño</span>`}${extra.puntos == null ? '' : `<span>${numero(extra.puntos)} puntos fantasy</span>`}</span></div>
      ${carta ? `<div class="mvp-carta">${cartaHTML(carta, { nombreClan })}</div>` : ''}`;
  }
}

// ---------- Código de directo ----------
// Sale mientras vale; la cuenta atrás va con el reloj de esta página (el servidor manda lo que queda)
let caducaCodigo = 0, textoCodigo = '';
function pintarCodigo(e) {
  const c = e.codigo, caja = $('.codigo-directo');
  if (!c) { textoCodigo = ''; caja.hidden = true; document.body.classList.remove('con-codigo'); return; }
  caducaCodigo = Date.now() + c.quedan;
  if (c.texto !== textoCodigo) {
    textoCodigo = c.texto;
    caja.querySelector('small').textContent = `${c.sobres === 1 ? 'Un sobre' : `${c.sobres} sobres`} con este código en ${location.host}/gachapon`;
    caja.querySelector('b').textContent = c.texto;
  }
  caja.hidden = false;
  document.body.classList.add('con-codigo');
  cuentaCodigo();
}
function cuentaCodigo() {
  const caja = $('.codigo-directo');
  if (caja.hidden) return;
  const quedan = (caducaCodigo - Date.now()) / 1000;
  if (quedan <= 0) { caja.hidden = true; document.body.classList.remove('con-codigo'); return; }
  caja.querySelector('.codigo-cuenta').textContent = mmss(quedan);
}
setInterval(cuentaCodigo, 500);

// Con el primer estado ya pintado, las vistas cambian con su transición
let cargando = true;
conectarDirecto({ alEstado: e => {
  pintar(e);
  if (cargando) { cargando = false; requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('cargando'))); }
} });
