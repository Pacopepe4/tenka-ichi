// Panel de producción: conecta DraftCore, configura el enfrentamiento, corrige huecos y registra resultados
import { cargarCampeones, cargarClanes, conectarDirecto, icono, logo } from '/comun.js';

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
const ROL_LEGIBLE = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
let estado = null;

// Contraseña guardada en este navegador
const claveInput = $('#clave');
try { claveInput.value = localStorage.getItem('tenka-clave') || ''; } catch {}
claveInput.addEventListener('change', () => { try { localStorage.setItem('tenka-clave', claveInput.value); } catch {} });

function aviso(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { a.hidden = true; }, 2600);
}

const directo = conectarDirecto({
  alEstado: e => { estado = e; pintar(); },
  alConexion: ok => {
    const p = $('#estadoConexion');
    p.textContent = ok ? 'En directo' : 'Sin conexión, reintentando…';
    p.classList.toggle('vivo', ok);
  },
});

async function enviar(accion, datos) {
  const r = await directo.enviar(accion, datos, claveInput.value);
  if (!r.ok) aviso(r.error === 'Contraseña incorrecta' ? 'Contraseña incorrecta: escríbela arriba a la derecha' : (r.error || 'No se pudo hacer'));
  return r;
}

// ---------- Equipos ----------
const opcionesClan = clanes.clanes.map(c => `<option value="${c.id}">${c.nombre}${c.kanji ? ` ${c.kanji}` : ''}</option>`).join('');
const cajaEquipo = lado => $(`.equipo.${lado}`);
const jugadoresDe = lado => [...cajaEquipo(lado).querySelectorAll('.jugadores input')].map(i => i.value.trim());

for (const lado of ['azul', 'rojo']) {
  const caja = cajaEquipo(lado);
  const select = caja.querySelector('.clan');
  select.innerHTML = opcionesClan;
  caja.querySelector('.jugadores').innerHTML = ROLES.map((r, i) =>
    `<label><span>${ROL_LEGIBLE[r]}</span><input data-i="${i}" placeholder="Jugador"></label>`).join('');
  // Al cambiar de clan: escudo y plantilla
  select.addEventListener('change', () => {
    const c = clanes.clan(select.value);
    caja.querySelector('.escudo').src = logo(c.id);
    caja.querySelectorAll('.jugadores input').forEach((inp, i) => { inp.value = c.jugadores?.[i] || ''; });
  });
  caja.querySelector('.guardarPlantilla').addEventListener('click', async () => {
    const c = clanes.clan(select.value);
    if (c.invitado) return aviso('Elige un clan de la liga para guardar su plantilla');
    const jugadores = jugadoresDe(lado);
    const r = await enviar('plantilla', { clan: c.id, jugadores });
    if (r.ok) { c.jugadores = jugadores; aviso(`Plantilla de ${c.nombre} guardada`); }
  });
}

// ---------- Huecos del draft ----------
$('#listaCampeones').innerHTML = campeones.campeones.map(c => `<option value="${c.nombre}">`).join('');
const idPorNombre = nombre => campeones.campeones.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())?.id || null;

for (const lado of ['azul', 'rojo']) {
  $(`.draft .lado.${lado}`).innerHTML =
    ROLES.map((r, i) => `<div class="hueco" data-tipo="picks" data-lado="${lado}" data-i="${i}"><img alt=""><span>${ROL_LEGIBLE[r]}</span><input list="listaCampeones" aria-label="Pick ${ROL_LEGIBLE[r]} del lado ${lado}" placeholder="Sin elegir"></div>`).join('') +
    `<div class="bansFila">${[0, 1, 2, 3, 4].map(i => `<div class="hueco" data-tipo="bans" data-lado="${lado}" data-i="${i}"><img alt=""><span>Ban ${i + 1}</span><input list="listaCampeones" aria-label="Ban ${i + 1} del lado ${lado}" placeholder="Ban ${i + 1}"></div>`).join('')}</div>`;
}
document.querySelectorAll('.draft .hueco input').forEach(input => {
  input.addEventListener('change', () => {
    const h = input.closest('.hueco');
    const id = input.value ? idPorNombre(input.value) : null;
    if (input.value && !id) return aviso(`No encuentro el campeón «${input.value}»`);
    enviar('corregir', { tipo: h.dataset.tipo, lado: h.dataset.lado, indice: Number(h.dataset.i), campeon: id });
  });
});

// ---------- Pintado ----------
let rellenado = false;
function pintar() {
  const e = estado;
  // Formularios: solo la primera vez, para no pisar lo que se está escribiendo
  if (!rellenado) {
    rellenado = true;
    $('#enlace').value = e.fuente.enlace || '';
    $('#jornada').value = e.config.jornada;
    $('#fase').value = e.config.fase;
    $('#formato').value = e.config.formato;
    for (const lado of ['azul', 'rojo']) {
      const caja = cajaEquipo(lado);
      caja.querySelector('.clan').value = e.equipos[lado].clan;
      caja.querySelector('.escudo').src = logo(e.equipos[lado].clan);
      caja.querySelectorAll('.jugadores input').forEach((inp, i) => { inp.value = e.equipos[lado].jugadores[i]; });
    }
  }
  $('#partida').value = e.config.partida;

  const f = e.fuente;
  const fuente = $('#fuente');
  fuente.className = `estado ${f.conectado ? 'ok' : f.error ? 'mal' : ''}`;
  fuente.textContent = f.conectado ? `Conectado al draft ${f.codigo}. Turno ${e.draft.turno || 'por empezar'}.` : (f.error || 'Sin conectar.');

  document.querySelectorAll('.draft .hueco').forEach(h => {
    const c = e.draft[h.dataset.tipo][h.dataset.lado][Number(h.dataset.i)];
    const img = h.querySelector('img');
    img.src = c ? icono(c) : '';
    img.style.visibility = c ? 'visible' : 'hidden';
    const input = h.querySelector('input');
    if (document.activeElement !== input) input.value = c ? campeones.nombre(c) : '';
    const a = e.draft.activo;
    h.classList.toggle('activo', Boolean(a && `${a.tipo}s` === h.dataset.tipo && a.lado === h.dataset.lado && a.indice === Number(h.dataset.i)));
  });

  const h = e.hoja || {};
  const ayudaHoja = $('#ayudaHoja');
  ayudaHoja.textContent = h.ok
    ? 'Al acabar la partida marca el ganador: los picks y bans se guardan en Google Sheets.'
    : h.configurada
      ? `Google Sheets no responde: ${h.error || 'error desconocido'}. El registro se guarda de momento en un archivo local.`
      : 'Al acabar la partida marca el ganador. Google Sheets aún no está conectado: el registro se guarda en un archivo local.';
  ayudaHoja.classList.toggle('mal', Boolean(h.configurada && !h.ok));
  $('#probarHoja').hidden = !h.configurada || h.ok;
  $('#resultados').innerHTML = e.resultados.map(r => `<li>Partida ${r.partida}: gana <b>${clanes.clan(r.clan).nombre}</b> (lado ${r.ganador})</li>`).join('');
}

// ---------- Botones ----------
$('#conectar').onclick = () => enviar('conectar', { enlace: $('#enlace').value });
$('#desconectar').onclick = () => enviar('desconectar');
$('#guardarConfig').onclick = async () => {
  const r = await enviar('config', { jornada: $('#jornada').value, fase: $('#fase').value, formato: $('#formato').value, partida: Number($('#partida').value) || 1 });
  if (r.ok) aviso('Enfrentamiento guardado');
};
$('#guardarEquipos').onclick = async () => {
  for (const lado of ['azul', 'rojo']) {
    const r = await enviar('equipo', { lado, clan: cajaEquipo(lado).querySelector('.clan').value, jugadores: jugadoresDe(lado) });
    if (!r.ok) return;
  }
  aviso('Equipos en el overlay');
};
$('#invertir').onclick = async () => { const r = await enviar('invertir'); if (r.ok) { rellenado = false; pintar(); } };
const ganador = lado => async () => {
  if (!confirm(`¿Registrar la victoria del lado ${lado}?`)) return;
  const r = await enviar('ganador', { lado });
  if (r.ok) aviso(r.enHoja ? 'Partida guardada en Google Sheets' : 'Partida guardada en el registro local');
};
$('#ganaAzul').onclick = ganador('azul');
$('#ganaRojo').onclick = ganador('rojo');
$('#siguiente').onclick = () => enviar('siguiente');
$('#probarHoja').onclick = async () => { const r = await enviar('probarHoja'); if (r.ok) aviso('Google Sheets conectado'); };
$('#nuevaSerie').onclick = () => { if (confirm('¿Empezar una serie nueva? Se quitan los bloqueos fearless.')) enviar('nuevaSerie'); };

// ---------- Vista previa y enlaces ----------
$('#urlOverlay').textContent = `${location.origin}/overlay/`;
$('#urlPortada').textContent = `${location.origin}/`;
$('#urlPortada').href = '/';
const vista = $('#vista');
vista.src = '/overlay/?fondo=1';
const escalar = () => { vista.style.transform = `scale(${vista.parentElement.clientWidth / 1920})`; };
new ResizeObserver(escalar).observe(vista.parentElement);
