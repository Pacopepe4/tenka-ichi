// Overlay de draft para OBS (1920×1080, fondo transparente). Añade ?fondo=1 para verlo sobre tinta.
import { cargarCampeones, cargarClanes, conectarDirecto, icono, splash, logo } from '/comun.js';

if (new URLSearchParams(location.search).has('fondo')) document.body.classList.add('fondo');

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
const DURACION_TARJETA = 8000;

// Construye los huecos una sola vez
for (const lado of ['azul', 'rojo']) {
  $(`.picks.${lado}`).innerHTML = ROLES.map((_, i) =>
    `<div class="slot" data-i="${i}"><div class="arte"></div><div class="velo"></div><div class="barra"></div>
      <div class="textos"><div class="rol"></div><div class="campeon"></div></div></div>`).join('');
  $(`.bans.${lado}`).innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="ban" data-i="${i}"></div>`).join('');
}

let ultimoAviso = 0, temporizadorTarjeta = null;

function pintar(e) {
  const d = e.draft;
  const activo = d.activo;
  for (const lado of ['azul', 'rojo']) {
    const eq = e.equipos[lado];
    const c = clanes.clan(eq.clan);
    const cab = $(`.cabecera.${lado}`);
    cab.querySelector('.logo').src = logo(c.id);
    cab.querySelector('.nombre').textContent = c.id === 'NONAME' ? `EQUIPO ${lado.toUpperCase()}` : c.nombre;
    cab.querySelector('.kanji').textContent = c.kanji;

    $(`.picks.${lado}`).querySelectorAll('.slot').forEach((slot, i) => {
      const campeon = d.picks[lado][i];
      const esActivo = activo?.tipo === 'pick' && activo.lado === lado && activo.indice === i;
      const mostrado = campeon || (esActivo ? d.hover : null);
      slot.classList.toggle('lleno', Boolean(campeon));
      slot.classList.toggle('hover', !campeon && Boolean(mostrado));
      slot.classList.toggle('activo', esActivo);
      slot.querySelector('.arte').style.backgroundImage = mostrado ? `url(${splash(mostrado)})` : '';
      const jugador = eq.jugadores[i];
      slot.querySelector('.rol').textContent = jugador ? (lado === 'azul' ? `${ROLES[i]} · ${jugador}` : `${jugador} · ${ROLES[i]}`) : ROLES[i];
      slot.querySelector('.campeon').textContent = mostrado ? campeones.nombre(mostrado) : '';
    });

    $(`.bans.${lado}`).querySelectorAll('.ban').forEach((ban, i) => {
      const campeon = d.bans[lado][i];
      const esActivo = activo?.tipo === 'ban' && activo.lado === lado && activo.indice === i;
      const mostrado = campeon || (esActivo ? d.hover : null);
      ban.classList.toggle('activo', esActivo);
      ban.classList.toggle('hover', !campeon && Boolean(mostrado));
      ban.innerHTML = mostrado ? `<img src="${icono(mostrado)}" alt="">` : '';
    });
  }

  const cfg = e.config;
  const serie = cfg.formato === 'bo3f' ? ` · BO3 FEARLESS` : '';
  $('.partida').textContent = `PARTIDA ${cfg.partida}${serie}`;
  $('.pie .jornada').textContent = `${cfg.jornada} · ${cfg.fase}`.toUpperCase();

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
  const tarjeta = $('.tarjeta');
  let historial = '';
  if (a.tipo === 'pick') {
    const partes = [];
    if (s.jugador && a.jugador) partes.push(s.jugador.veces
      ? `${a.jugador}: ${s.jugador.veces} ${s.jugador.veces === 1 ? 'partida' : 'partidas'} (${s.jugador.victorias}-${s.jugador.derrotas})`
      : `Primera vez de ${a.jugador}`);
    if (s.clan && c.id !== 'NONAME') partes.push(s.clan.veces ? `${s.clan.veces + 1}.ª vez de ${c.nombre}` : `Estreno en ${c.nombre}`);
    historial = partes.join(' · ');
  }
  tarjeta.className = `tarjeta ${a.lado} ${a.tipo}`;
  tarjeta.innerHTML = `
    <img class="icono" src="${icono(a.campeon)}" alt="">
    <div class="tipo">${a.tipo === 'pick' ? `PICK · ${a.rol}` : 'BAN'} · ${c.id === 'NONAME' ? `LADO ${a.lado.toUpperCase()}` : c.nombre.toUpperCase()}</div>
    <div class="nombre">${campeones.nombre(a.campeon)}</div>
    <div class="datos">
      <div class="dato"><b>${s.pick}%</b><span>PICK</span></div>
      <div class="dato"><b>${s.ban}%</b><span>BAN</span></div>
      <div class="dato"><b>${s.presencia}%</b><span>PRESENCIA</span></div>
      <div class="dato"><b>${s.winrate === null ? '—' : `${s.winrate}%`}</b><span>WINRATE</span></div>
    </div>
    <div class="historial">${historial}</div>
    <div class="muestra">${s.partidas} ${s.partidas === 1 ? 'partida registrada' : 'partidas registradas'} en TENKA ICHI</div>`;
  tarjeta.hidden = false;
  $('.centro-vs').classList.add('oculto');
  clearTimeout(temporizadorTarjeta);
  temporizadorTarjeta = setTimeout(() => {
    tarjeta.hidden = true;
    $('.centro-vs').classList.remove('oculto');
  }, DURACION_TARJETA);
}

conectarDirecto({ alEstado: pintar });
