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

// ---------- Tier list ----------
const TIERS = ['S', 'A', 'B', 'C', 'D'];
let tierlist = await fetch('/api/tierlist').then(r => r.json()).catch(() => ({ jugadores: [], equipos: [] }));
let tipoTier = 'jugadores';

const selectorTier = (tipo, id, actual) => `<span class="selector-tier" role="group" aria-label="Tier">${[...TIERS, ''].map(t =>
  `<button type="button" data-tipo="${tipo}" data-id="${id}" data-tier="${t}" aria-pressed="${(actual || '') === t}" style="--color-tier: var(--tier-${t || 'D'})">${t || 'Sin'}</button>`).join('')}</span>`;

function pintarEditorTier() {
  const caja = $('.editor-tier');
  if (tipoTier === 'equipos') {
    caja.innerHTML = tierlist.equipos.map(e => `<div class="fila-tier equipo"><img src="${logo(e.id)}" alt=""><span class="quien">${e.nombre}</span>${selectorTier('equipo', e.id, e.tier)}</div>`).join('');
  } else {
    const porClan = new Map();
    for (const j of tierlist.jugadores) (porClan.get(j.clan) || porClan.set(j.clan, []).get(j.clan)).push(j);
    caja.innerHTML = [...porClan].map(([clan, lista]) => `<div class="clan-tier"><h3><img src="${logo(clan)}" alt="">${clanes.clan(clan).nombre}</h3>
      ${lista.map(j => `<div class="fila-tier"><span class="rol">${ROL_LEGIBLE[j.rol]}</span><span class="quien${j.nombre ? '' : ' sin'}">${j.nombre || 'Sin nombre en la plantilla'}</span>${selectorTier('jugador', j.id, j.tier)}</div>`).join('')}</div>`).join('');
  }
  caja.querySelectorAll('.selector-tier button').forEach(b => b.addEventListener('click', async () => {
    const r = await enviar('tier', { tipo: b.dataset.tipo, id: b.dataset.id, tier: b.dataset.tier || null });
    if (r.ok) { tierlist = r.tierlist; pintarEditorTier(); }
  }));
}
document.querySelectorAll('.pestanas-tier button').forEach(b => b.addEventListener('click', () => {
  tipoTier = b.dataset.tipo;
  document.querySelectorAll('.pestanas-tier button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarEditorTier();
}));
pintarEditorTier();

// ---------- Gachapon ----------
const porcentaje = p => `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
function pintarGacha(g) {
  $('#estadoLoginTwitch').textContent = g.login
    ? 'El inicio de sesión con Twitch está activo: cualquiera puede entrar en /gachapon/ y recibir sus sobres.'
    : 'Falta configurar el inicio de sesión con Twitch en Render (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET y SESION_SECRETO). Los pasos están en la guía del README.';
  $('#estadoLoginTwitch').classList.toggle('mal', !g.login);
  const c = g.canal, est = $('#estadoCanal');
  est.className = `estado ${c.error ? 'mal' : c.conectado ? 'ok' : ''}`;
  est.textContent = c.error ? c.error
    : c.conectado ? `Conectado como ${c.login}. La recompensa «${c.titulo}» cuesta ${c.coste} puntos.${c.ultimoSondeo ? ` Última recogida de canjes: ${new Date(c.ultimoSondeo).toLocaleTimeString('es-ES')}.` : ''}`
      : `Sin conectar. Hay que entrar con la cuenta del canal (${c.canal}); la web crea la recompensa «${c.titulo}».`;
  $('#conectarCanal').textContent = c.conectado ? 'Volver a conectar el canal' : 'Conectar el canal de Twitch';
  if (c.coste && document.activeElement !== $('#costeSobre')) $('#costeSobre').value = c.coste;
  const r = g.resumen, p = g.probabilidades;
  const n = (x, uno, varios) => `${x} ${x === 1 ? uno : varios}`;
  $('#resumenGacha').textContent = `${n(r.coleccionistas, 'coleccionista', 'coleccionistas')}, ${n(r.sobresAbiertos, 'sobre abierto', 'sobres abiertos')} y ${n(r.sobresSinAbrir, 'sin abrir', 'sin abrir')}. ${n(r.cartas, 'carta', 'cartas')} en los sobres. Probabilidad por carta: `
    + TIERS.map(t => `${t} ${porcentaje(p[t] || 0)}`).join(', ') + '.';
}
async function actualizarGacha() {
  let r;
  try { r = await directo.enviar('gachaEstado', {}, claveInput.value); }
  catch { setTimeout(actualizarGacha, 1500); return; } // la conexión aún no está abierta
  if (r.ok) pintarGacha(r.gacha);
  else $('#estadoLoginTwitch').textContent = 'Escribe la contraseña arriba a la derecha para ver el estado del gachapon.';
}
$('#conectarCanal').onclick = async () => {
  const r = await enviar('twitchCanal');
  if (r.ok) window.open(r.url, '_blank', 'noopener');
};
$('#recogerCanjes').onclick = async () => { const r = await enviar('gachaSondear'); if (r.ok) { pintarGacha(r.gacha); aviso('Canjes recogidos'); } };
$('#guardarCoste').onclick = async () => { const r = await enviar('gachaCoste', { coste: $('#costeSobre').value }); if (r.ok) { pintarGacha(r.gacha); aviso('Coste cambiado en Twitch'); } };
$('#regalar').onclick = async () => {
  const usuario = $('#regaloUsuario').value.trim();
  if (!usuario) return aviso('Escribe el nombre en Twitch');
  const r = await enviar('gachaRegalar', { usuario, cantidad: $('#regaloCantidad').value });
  if (r.ok) { pintarGacha(r.gacha); aviso(`Sobres regalados a ${r.nombre}`); $('#regaloUsuario').value = ''; }
};
claveInput.addEventListener('change', actualizarGacha);
setTimeout(actualizarGacha, 800);
setInterval(actualizarGacha, 60000);

// ---------- Estadísticas para el fantasy ----------
let partidaKda = null;
function pintarKda(e) {
  const caja = $('.kda');
  // Partida nueva: se vacían los números
  if (partidaKda !== `${e.config.jornada}|${e.config.partida}|${e.equipos.azul.clan}|${e.equipos.rojo.clan}`) {
    partidaKda = `${e.config.jornada}|${e.config.partida}|${e.equipos.azul.clan}|${e.equipos.rojo.clan}`;
    caja.innerHTML = ['azul', 'rojo'].map(lado => `<div class="lado-kda ${lado}" data-lado="${lado}"><h4>${clanes.clan(e.equipos[lado].clan).nombre}</h4>
      <div class="cabeza-kda"><span>Jugador</span><span>Asesinatos</span><span>Muertes</span><span>Asist.</span><span>MVP</span></div>
      ${ROLES.map((r, i) => `<div class="fila-kda" data-indice="${i}"><span class="quien"></span>
        <input type="number" min="0" max="99" class="k" aria-label="Asesinatos"><input type="number" min="0" max="99" class="d" aria-label="Muertes"><input type="number" min="0" max="99" class="a" aria-label="Asistencias">
        <label><input type="radio" name="mvp" value="${lado}-${i}" aria-label="MVP"></label></div>`).join('')}</div>`).join('');
    $('#estadoKda').textContent = '';
  }
  for (const lado of ['azul', 'rojo']) {
    caja.querySelectorAll(`.lado-kda[data-lado="${lado}"] .fila-kda`).forEach((f, i) => {
      f.querySelector('.quien').innerHTML = `${e.equipos[lado].jugadores[i] || '—'} <small>${ROL_LEGIBLE[ROLES[i]]}</small>`;
    });
  }
}
const pintarAntes = pintar;
pintar = function () { pintarAntes(); if (estado) pintarKda(estado); };
if (estado) pintarKda(estado);

$('#guardarKda').onclick = async () => {
  const filas = [...document.querySelectorAll('.kda .fila-kda')].map(f => ({
    lado: f.closest('.lado-kda').dataset.lado, indice: Number(f.dataset.indice),
    k: f.querySelector('.k').value, d: f.querySelector('.d').value, a: f.querySelector('.a').value,
  }));
  const mvp = document.querySelector('.kda input[name="mvp"]:checked')?.value || null;
  const r = await enviar('fantasyEstadisticas', { filas, mvp });
  if (!r.ok) return;
  $('#estadoKda').className = 'estado ok';
  $('#estadoKda').textContent = `Guardado (${r.partida}): ` + r.puntos.filter(p => p.jugador).map(p => `${p.jugador} ${p.puntos.toLocaleString('es-ES')}`).join(', ') + ' puntos.';
};

// Cerrar y abrir las alineaciones del fantasy
function pintarAlineaciones(cerrado) {
  $('#estadoAlineaciones').className = `estado ${cerrado ? 'mal' : 'ok'}`;
  $('#estadoAlineaciones').textContent = cerrado ? 'Alineaciones cerradas: nadie puede cambiar a sus jugadores.' : 'Alineaciones abiertas: cada coleccionista puede cambiar a sus jugadores.';
  $('#alternarAlineaciones').textContent = cerrado ? 'Abrir alineaciones' : 'Cerrar alineaciones';
  $('#alternarAlineaciones').dataset.cerrado = cerrado ? '1' : '0';
}
$('#alternarAlineaciones').onclick = async () => {
  const r = await enviar('fantasyCerrar', { cerrado: $('#alternarAlineaciones').dataset.cerrado !== '1' });
  if (r.ok) { pintarGacha(r.gacha); pintarAlineaciones(r.gacha.cerrado); }
};
const pintarGachaAntes = pintarGacha;
pintarGacha = function (g) { pintarGachaAntes(g); pintarAlineaciones(g.cerrado); };
