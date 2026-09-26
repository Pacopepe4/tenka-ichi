// Overlay de draft para OBS (1920×1080).
// Por defecto pinta su propio fondo de tinta con los huecos de las cámaras recortados:
// las cámaras de OBS van debajo del overlay, encajadas en esos huecos.
// ?transparente=1 quita el fondo; ?guia=1 marca los huecos con sus medidas para colocarlas.
import { cargarCampeones, cargarClanes, conectarDirecto, icono, splash, logo, disposicionCamaras, PLACA_CAMARA } from '/comun.js';

const params = new URLSearchParams(location.search);
if (params.has('transparente')) document.body.classList.add('transparente');
if (params.has('guia')) document.body.classList.add('guia');

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
const ROL_LEGIBLE = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const COLOR_LADO = { azul: 'var(--azul-lado)', rojo: 'var(--rojo-lado)' };
const DURACION_TARJETA = 8000;
const ESCENARIO = { x: 620, y: 212 };

for (const lado of ['azul', 'rojo']) {
  $(`.picks.${lado}`).innerHTML = ROLES.map((_, i) =>
    `<div class="slot" data-i="${i}"><div class="arte"></div><div class="velo"></div><div class="trazo"></div><div class="barra"></div>
      <div class="textos"><div class="linea-rol"><span class="rol"></span><span class="jugador"></span></div><div class="campeon"></div></div></div>`).join('');
  $(`.bans.${lado}`).innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="ban" data-i="${i}"></div>`).join('')
    + '<span class="hanko" title="Bans">禁</span>';
}

let ultimoAviso = 0, temporizadorTarjeta = null, primeraVez = true, ultimoTurno = null, firmaCamaras = '';
const fijados = { azul: Array(5).fill(null), rojo: Array(5).fill(null) };
const nombreEquipo = (c, lado) => (c.id === 'NONAME' ? `Lado ${lado}` : c.nombre);

function pintar(e) {
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

  const cfg = e.config;
  $('.reposo .jornada').textContent = cfg.fase === 'Fase de liga' ? `${cfg.jornada} de la liguilla` : cfg.jornada;
  const fl = $('.fearless');
  fl.hidden = !(cfg.formato === 'bo3f' && e.fearless.length);
  fl.querySelector('.iconos').innerHTML = e.fearless.map(c => `<img src="${icono(c)}" alt="">`).join('');

  if (e.aviso && e.aviso.id !== ultimoAviso) {
    ultimoAviso = e.aviso.id;
    mostrarTarjeta(e.aviso);
  }
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
  const { cantidad, lista } = e.camaras;
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
      <div class="hueco" style="height:${h.h}px"><div class="medidas">Cámara ${i + 1}<br>${h.w}×${h.h} en x ${h.x}, y ${h.y}</div></div>
      <div class="placa-cam" style="top:${h.h}px">${dt.logo ? `<img src="${dt.logo}" alt="">` : ''}<span class="nombre-cam">${escapar(dt.nombre)}</span><span class="detalle-cam">${escapar(dt.detalle || '')}</span></div>
    </div>`;
  }).join('');
  recortarFondo(huecos);
}

// Máscara del fondo: todo el lienzo menos los huecos de las cámaras
function recortarFondo(huecos) {
  const fondo = $('.fondo');
  if (!huecos.length) { fondo.style.maskImage = fondo.style.webkitMaskImage = ''; return; }
  const agujeros = huecos.map(h => `M${h.x} ${h.y}h${h.w}v${h.h}h-${h.w}z`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><path fill-rule='evenodd' fill='#000' d='M0 0H1920V1080H0Z${agujeros}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  fondo.style.maskImage = url;
  fondo.style.webkitMaskImage = url;
}

const escapar = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

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
  clearTimeout(temporizadorTarjeta);
  temporizadorTarjeta = setTimeout(() => {
    tarjeta.hidden = true;
    $('.franja').classList.remove('con-tarjeta');
  }, DURACION_TARJETA);
}

conectarDirecto({ alEstado: pintar });
