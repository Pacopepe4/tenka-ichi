// Panel de producción: conecta DraftCore, configura el enfrentamiento, corrige huecos y registra resultados
import { cargarCampeones, cargarClanes, conectarDirecto, icono, logo, disposicionCamaras } from '/comun.js';

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
  if (!camarasRellenas && e.camaras) { camarasRellenas = true; camaras = structuredClone(e.camaras.lista); pintarFilasCamaras(e.camaras.cantidad); }
  pintarCantidad(e.camaras?.cantidad ?? 0);
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
$('#urlGuiaRetransmision').textContent = `${location.origin}/guia/`;
$('#urlPortada').href = '/';
const vista = $('#vista');
vista.src = '/overlay/?guia=1';
$('#urlGuia').href = '/overlay/?guia=1';
const escalar = () => { vista.style.transform = `scale(${vista.parentElement.clientWidth / 1920})`; };
new ResizeObserver(escalar).observe(vista.parentElement);

// ---------- Competición: sorteo y siguiente partida ----------
const nombreClan = id => clanes.clan(id).nombre;
let proximas = [];

async function cargarCompeticion() {
  const comp = await fetch('/api/competicion').then(r => r.json());
  $('.sin-calendario').hidden = Boolean(comp.calendario);
  $('.con-calendario').hidden = !comp.calendario;
  if (!comp.calendario) {
    $('.participantes').innerHTML = clanes.clanes.filter(c => !c.invitado).map(c =>
      `<label><input type="checkbox" value="${c.id}"><img src="${logo(c.id)}" alt="">${c.nombre}</label>`).join('');
    return;
  }
  const cls = comp.clasificacion;
  $('#resumenCompeticion').textContent = `Semilla ${comp.calendario.semilla}. Liguilla: ${cls.jugadas} de ${cls.total} partidas jugadas.`
    + (comp.cuadro?.campeon ? ` Campeón: ${nombreClan(comp.cuadro.campeon)}.` : '');

  // Lista de lo que queda por jugar, en orden
  proximas = [];
  for (const cruce of comp.calendario.jornadas.flat()) {
    if (!cls.resultados[cruce.id]) proximas.push({ texto: `Jornada ${cruce.jornada}: ${nombreClan(cruce.azul)} vs ${nombreClan(cruce.rojo)}`,
      config: { jornada: `Jornada ${cruce.jornada}`, fase: 'Fase de liga', formato: 'bo1', partida: 1 }, azul: cruce.azul, rojo: cruce.rojo });
  }
  if (cls.desempate && !cls.desempate.ganador) {
    const [a, b] = cls.desempate.clanes;
    proximas.push({ texto: `Desempate por el 8.º puesto: ${nombreClan(a)} vs ${nombreClan(b)}`,
      config: { jornada: 'Desempate', fase: 'Desempate', formato: 'bo1', partida: 1 }, azul: a, rojo: b });
  }
  if (comp.cuadro) {
    for (const s of [...comp.cuadro.cuartos, ...comp.cuadro.semis, comp.cuadro.final]) {
      if (!s.alto || !s.bajo || s.ganador) continue;
      const elige = s.siguiente.eligeLado;
      const otro = elige === s.alto ? s.bajo : s.alto;
      proximas.push({ texto: `${s.ronda}, partida ${s.siguiente.partida}: ${nombreClan(s.alto)} vs ${nombreClan(s.bajo)} (${s.victorias[s.alto]}-${s.victorias[s.bajo]})`,
        config: { jornada: s.ronda, fase: 'Fase final', formato: 'bo3f', partida: s.siguiente.partida }, azul: elige, rojo: otro,
        nota: `Elige lado ${nombreClan(elige)}${s.siguiente.partida === 1 ? ', por ser el mejor clasificado' : ', por haber perdido la partida anterior'}. Si elige rojo, pulsa «Invertir lados».` });
    }
  }
  $('#proxima').innerHTML = proximas.length
    ? proximas.map((p, i) => `<option value="${i}">${p.texto}</option>`).join('')
    : '<option>No queda nada por jugar</option>';
  $('#cargarProxima').disabled = !proximas.length;
  $('#notaProxima').textContent = '';
}

$('#sortear').onclick = async () => {
  const participantes = [...document.querySelectorAll('.participantes input:checked')].map(i => i.value);
  if (participantes.length !== 10) return aviso(`Marca 10 clanes (llevas ${participantes.length})`);
  if (!confirm('¿Sortear el calendario con estos 10 clanes?')) return;
  const r = await enviar('sortear', { participantes, semilla: $('#semilla').value });
  if (r.ok) { aviso(`Calendario sorteado con la semilla ${r.semilla}`); cargarCompeticion(); }
};

$('#cargarProxima').onclick = async () => {
  const p = proximas[Number($('#proxima').value)];
  if (!p) return;
  if (!(await enviar('config', p.config)).ok) return;
  for (const [lado, clan] of [['azul', p.azul], ['rojo', p.rojo]]) {
    const r = await enviar('equipo', { lado, clan, jugadores: clanes.clan(clan).jugadores || Array(5).fill('') });
    if (!r.ok) return;
  }
  // En fearless, una serie nueva empieza sin bloqueos
  if (p.config.formato === 'bo3f' && p.config.partida === 1) await enviar('nuevaSerie');
  rellenado = false;
  pintar();
  $('#notaProxima').textContent = p.nota || '';
  aviso('Partida cargada en el overlay');
};

cargarCompeticion();

// ---------- Cámaras ----------
// Lo que hay escrito en las filas, aunque aún no se haya puesto en el overlay
let camaras = [], camarasRellenas = false, cantidadVisible = 0;
const opcionesCamara = '<option value="caster">Caster</option><option value="azul">Lado azul</option><option value="rojo">Lado rojo</option>'
  + '<optgroup label="Clan">' + clanes.clanes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('') + '</optgroup>';
const colorFila = tipo => tipo === 'caster' ? 'var(--washi)' : tipo === 'azul' ? 'var(--azul-lado)' : tipo === 'rojo' ? 'var(--rojo-lado)' : clanes.clan(tipo).color;

function leerFilas() {
  document.querySelectorAll('.fila-camara').forEach((f, i) => {
    camaras[i] = { tipo: f.querySelector('select').value, nombre: f.querySelector('.nombre').value.trim(), detalle: f.querySelector('.detalle').value.trim() };
  });
}

function pintarFilasCamaras(n) {
  leerFilas();
  cantidadVisible = n;
  $('.lista-camaras').innerHTML = disposicionCamaras(n).map((h, i) => {
    const c = camaras[i] || { tipo: 'caster', nombre: '', detalle: '' };
    return `<div class="fila-camara" style="--color-fila:${colorFila(c.tipo)}">
      <div class="donde"><b>Cámara ${i + 1}</b>${h.w}×${h.h} en x ${h.x}, y ${h.y}</div>
      <select aria-label="Qué es la cámara ${i + 1}">${opcionesCamara}</select>
      <input class="nombre" aria-label="Nombre en la cámara ${i + 1}" placeholder="Nombre">
      <input class="detalle" aria-label="Detalle de la cámara ${i + 1}" placeholder="${c.tipo === 'caster' ? '@usuario' : 'Capitán, Top…'}">
    </div>`;
  }).join('');
  document.querySelectorAll('.fila-camara').forEach((f, i) => {
    const c = camaras[i] || { tipo: 'caster', nombre: '', detalle: '' };
    const sel = f.querySelector('select');
    sel.value = c.tipo;
    f.querySelector('.nombre').value = c.nombre;
    f.querySelector('.detalle').value = c.detalle;
    sel.addEventListener('change', () => {
      f.style.setProperty('--color-fila', colorFila(sel.value));
      f.querySelector('.detalle').placeholder = sel.value === 'caster' ? '@usuario' : 'Capitán, Top…';
    });
  });
}

function pintarCantidad(n) {
  document.querySelectorAll('.cantidad button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.n) === n)));
}

// El número de cámaras se aplica al momento; los nombres, con el botón
document.querySelectorAll('.cantidad button').forEach(b => b.addEventListener('click', async () => {
  const n = Number(b.dataset.n);
  pintarFilasCamaras(n);
  const r = await enviar('camaras', { cantidad: n });
  if (r.ok) aviso(n ? `${n} ${n === 1 ? 'cámara' : 'cámaras'} en el overlay` : 'Overlay sin cámaras');
}));

$('#guardarCamaras').onclick = async () => {
  leerFilas();
  const r = await enviar('camaras', { cantidad: cantidadVisible, lista: [0, 1, 2, 3].map(i => camaras[i] || { tipo: 'caster', nombre: '', detalle: '' }) });
  if (r.ok) aviso('Cámaras en el overlay');
};
