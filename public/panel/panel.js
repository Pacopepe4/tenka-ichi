// Panel de producción: configura el enfrentamiento, conecta DraftCore, corrige huecos y registra resultados
import { cargarCampeones, cargarClanes, conectarDirecto, icono } from '/comun.js';

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
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
  alConexion: ok => { $('#estadoConexion').textContent = ok ? 'En directo con el servidor' : 'Sin conexión con el servidor, reintentando…'; },
});

async function enviar(accion, datos) {
  const r = await directo.enviar(accion, datos, claveInput.value);
  if (!r.ok) aviso(r.error || 'Error');
  return r;
}

// Lista de campeones para los huecos (se escribe el nombre en español)
$('#listaCampeones').innerHTML = campeones.campeones.map(c => `<option value="${c.nombre}">`).join('');
const idPorNombre = nombre => campeones.campeones.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())?.id || null;

// Equipos
const opcionesClan = clanes.clanes.map(c => `<option value="${c.id}">${c.nombre}${c.kanji ? ` ${c.kanji}` : ''}</option>`).join('');
for (const lado of ['azul', 'rojo']) {
  const caja = $(`.equipo.${lado}`);
  caja.querySelector('.clan').innerHTML = opcionesClan;
  caja.querySelector('.jugadores').innerHTML = ROLES.map((r, i) =>
    `<label><span>${r}</span><input data-i="${i}" placeholder="Jugador"></label>`).join('');
}

// Huecos del draft
for (const lado of ['azul', 'rojo']) {
  $(`.draft .lado.${lado}`).innerHTML =
    ROLES.map((r, i) => `<div class="hueco" data-tipo="picks" data-lado="${lado}" data-i="${i}"><img alt=""><span>${r}</span><input list="listaCampeones" placeholder="—"></div>`).join('') +
    `<div class="bansFila">${[0, 1, 2, 3, 4].map(i => `<div class="hueco" data-tipo="bans" data-lado="${lado}" data-i="${i}"><img alt=""><span>B${i + 1}</span><input list="listaCampeones" placeholder="ban"></div>`).join('')}</div>`;
}
document.querySelectorAll('.draft .hueco input').forEach(input => {
  input.addEventListener('change', () => {
    const h = input.closest('.hueco');
    const id = input.value ? idPorNombre(input.value) : null;
    if (input.value && !id) return aviso('Campeón no encontrado');
    enviar('corregir', { tipo: h.dataset.tipo, lado: h.dataset.lado, indice: Number(h.dataset.i), campeon: id });
  });
});

let rellenado = false;
function pintar() {
  const e = estado;
  // Formularios: solo la primera vez (para no pisar lo que se está escribiendo)
  if (!rellenado) {
    rellenado = true;
    $('#enlace').value = e.fuente.enlace || '';
    $('#jornada').value = e.config.jornada;
    $('#fase').value = e.config.fase;
    $('#formato').value = e.config.formato;
    $('#partida').value = e.config.partida;
    for (const lado of ['azul', 'rojo']) {
      const caja = $(`.equipo.${lado}`);
      caja.querySelector('.clan').value = e.equipos[lado].clan;
      caja.querySelectorAll('.jugadores input').forEach((inp, i) => { inp.value = e.equipos[lado].jugadores[i]; });
    }
  }
  $('#partida').value = e.config.partida;

  const f = e.fuente;
  const fuente = $('#fuente');
  fuente.className = `estado ${f.conectado ? 'ok' : f.error ? 'mal' : ''}`;
  fuente.textContent = f.conectado ? `Conectado a DraftCore · draft ${f.codigo} · turno ${e.draft.turno || '—'}` : (f.error || 'Sin conectar');

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

  const res = e.resultados.map(r => `P${r.partida}: ${clanes.clan(r.clan).nombre} (${r.ganador})`).join(' · ');
  $('#resultados').textContent = [res, e.hoja ? 'Registro en Google Sheets activo' : 'Registro en archivo local (Google Sheets sin configurar)'].filter(Boolean).join(' — ');
}

// Botones
$('#conectar').onclick = () => enviar('conectar', { enlace: $('#enlace').value });
$('#desconectar').onclick = () => enviar('desconectar');
$('#guardarConfig').onclick = async () => {
  const r = await enviar('config', { jornada: $('#jornada').value, fase: $('#fase').value, formato: $('#formato').value, partida: Number($('#partida').value) || 1 });
  if (r.ok) aviso('Enfrentamiento guardado');
};
$('#guardarEquipos').onclick = async () => {
  for (const lado of ['azul', 'rojo']) {
    const caja = $(`.equipo.${lado}`);
    await enviar('equipo', { lado, clan: caja.querySelector('.clan').value, jugadores: [...caja.querySelectorAll('.jugadores input')].map(i => i.value) });
  }
  aviso('Equipos guardados');
};
$('#invertir').onclick = async () => { await enviar('invertir'); rellenado = false; pintar(); };
const ganador = lado => async () => {
  if (!confirm(`¿Registrar la victoria del lado ${lado}?`)) return;
  const r = await enviar('ganador', { lado });
  if (r.ok) aviso(r.enHoja ? 'Partida guardada en Google Sheets' : 'Partida guardada en el registro local');
};
$('#ganaAzul').onclick = ganador('azul');
$('#ganaRojo').onclick = ganador('rojo');
$('#siguiente').onclick = () => enviar('siguiente');
$('#nuevaSerie').onclick = () => { if (confirm('¿Empezar una serie nueva? Se borran los bloqueos fearless.')) enviar('nuevaSerie'); };

// Vista previa escalada del overlay
const urlOverlay = `${location.origin}/overlay/`;
$('#urlOverlay').textContent = urlOverlay;
const vista = $('#vista');
vista.src = '/overlay/?fondo=1';
const escalar = () => { vista.style.transform = `scale(${vista.parentElement.clientWidth / 1920})`; };
new ResizeObserver(escalar).observe(vista.parentElement);
