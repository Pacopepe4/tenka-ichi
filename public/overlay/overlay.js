// Overlay de draft para OBS (1920×1080, fondo transparente). Añade ?fondo=1 para verlo sobre tinta.
import { cargarCampeones, cargarClanes, conectarDirecto, icono, splash, logo } from '/comun.js';

if (new URLSearchParams(location.search).has('fondo')) document.body.classList.add('fondo');

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
const ROL_LEGIBLE = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const DURACION_TARJETA = 8000;

for (const lado of ['azul', 'rojo']) {
  $(`.picks.${lado}`).innerHTML = ROLES.map((_, i) =>
    `<div class="slot" data-i="${i}"><div class="arte"></div><div class="velo"></div><div class="trazo"></div><div class="barra"></div>
      <div class="textos"><div class="linea-rol"><span class="rol"></span><span class="jugador"></span></div><div class="campeon"></div></div></div>`).join('');
  $(`.bans.${lado}`).innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="ban" data-i="${i}"></div>`).join('');
}

let ultimoAviso = 0, temporizadorTarjeta = null, primeraVez = true;
const fijados = { azul: Array(5).fill(null), rojo: Array(5).fill(null) };

function pintar(e) {
  const d = e.draft;
  const activo = d.activo;
  for (const lado of ['azul', 'rojo']) {
    const eq = e.equipos[lado];
    const c = clanes.clan(eq.clan);
    const cab = $(`.cabecera.${lado}`);
    cab.style.setProperty('--color-clan', c.texto);
    cab.querySelector('.logo').src = logo(c.id);
    cab.querySelector('.nombre').textContent = c.id === 'NONAME' ? `Lado ${lado}` : c.nombre;
    cab.querySelector('.lema').textContent = c.lema || '';
    cab.querySelector('.kanji').textContent = c.kanji;

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

  const cfg = e.config;
  $('.partida').textContent = cfg.formato === 'bo3f' ? `Partida ${cfg.partida} de la serie, Bo3 fearless` : `Partida ${cfg.partida}`;
  $('.pie .jornada').textContent = `${cfg.jornada}, ${cfg.fase.toLowerCase()}`;

  const t = $('.temporizador');
  t.textContent = activo && typeof d.tiempo === 'number' ? `${Math.max(0, Math.ceil(d.tiempo))}` : '';
  t.classList.toggle('urgente', typeof d.tiempo === 'number' && d.tiempo <= 10);

  const fl = $('.fearless');
  fl.hidden = !(cfg.formato === 'bo3f' && e.fearless.length);
  fl.querySelector('.iconos').innerHTML = e.fearless.map(c => `<img src="${icono(c)}" alt="">`).join('');

  if (e.aviso && e.aviso.id !== ultimoAviso) {
    ultimoAviso = e.aviso.id;
    mostrarTarjeta(e.aviso);
  }
}

function mostrarTarjeta(a) {
  const s = a.stats;
  const c = clanes.clan(a.clan);
  const equipo = c.id === 'NONAME' ? `lado ${a.lado}` : c.nombre;
  let historial = '';
  if (a.tipo === 'pick') {
    const partes = [];
    if (s.jugador && a.jugador) partes.push(s.jugador.veces
      ? `${a.jugador} lo ha jugado ${s.jugador.veces} ${s.jugador.veces === 1 ? 'vez' : 'veces'} (${s.jugador.victorias}-${s.jugador.derrotas})`
      : `Primera vez de ${a.jugador}`);
    if (s.clan && c.id !== 'NONAME') partes.push(s.clan.veces ? `${s.clan.veces + 1}.ª vez en ${c.nombre}` : `estreno en ${c.nombre}`);
    historial = partes.join(', ');
  }
  const tarjeta = $('.tarjeta');
  tarjeta.className = `tarjeta ${a.lado} ${a.tipo}`;
  tarjeta.innerHTML = `
    <div class="retrato"><img class="icono" src="${icono(a.campeon)}" alt=""><span class="hanko sello">${a.tipo === 'pick' ? '選' : '禁'}</span></div>
    <div class="cabeza">
      <div class="quien">${a.tipo === 'pick' ? `${ROL_LEGIBLE[a.rol]} de ${equipo}` : `Baneado por ${equipo}`}</div>
      <div class="nombre">${campeones.nombre(a.campeon)}</div>
    </div>
    <div class="datos">
      <div class="dato"><b>${s.pick}%</b><span>Pick</span></div>
      <div class="dato"><b>${s.ban}%</b><span>Ban</span></div>
      <div class="dato"><b>${s.presencia}%</b><span>Presencia</span></div>
      <div class="dato"><b>${s.winrate === null ? '–' : `${s.winrate}%`}</b><span>Victorias</span></div>
    </div>
    <div class="historial">${historial}</div>
    <div class="muestra">Sobre ${s.partidas} ${s.partidas === 1 ? 'partida' : 'partidas'} de Tenka Ichi</div>`;
  tarjeta.hidden = false;
  $('.centro-vs').classList.add('oculto');
  clearTimeout(temporizadorTarjeta);
  temporizadorTarjeta = setTimeout(() => {
    tarjeta.hidden = true;
    $('.centro-vs').classList.remove('oculto');
  }, DURACION_TARJETA);
}

conectarDirecto({ alEstado: pintar });
