// Panel de producción: conecta DraftCore, configura el enfrentamiento, corrige huecos y registra resultados
import { cargarCampeones, cargarClanes, conectarDirecto, icono, logo, disposicionCamaras, camarasLineas, compite } from '/comun.js';
import { imagenTierlist, imagenClasificacion, descargar, publicar } from '/compartir.js';

const $ = s => document.querySelector(s);
const campeones = await cargarCampeones();
const clanes = await cargarClanes();
const ROLES = clanes.roles;
const ROL_LEGIBLE = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const escapar = t => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
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

// La conexión se abre ya, pero lo que llegue antes de que el panel acabe de cargar se pinta al final
let listo = false, partidaPendiente = null;
const directo = conectarDirecto({
  alEstado: e => { estado = e; if (listo) pintar(); },
  alPartida: p => { if (listo) pintarPartidaPanel(p); else partidaPendiente = p; },
  alConexion: ok => {
    const p = $('#estadoConexion');
    p.textContent = ok ? 'En directo' : 'Sin conexión, reintentando…';
    p.classList.toggle('vivo', ok);
  },
  alVersion: () => { $('#versionNueva').hidden = false; },
});
$('#recargar').onclick = () => location.reload();

// El botón que se acaba de pulsar se queda «trabajando» hasta la respuesta y hace un destello verde si ha ido bien
let ultimoBoton = null, ultimoClic = 0;
document.addEventListener('click', e => { ultimoBoton = e.target.closest?.('button') || null; ultimoClic = Date.now(); }, true);

async function enviar(accion, datos) {
  const boton = ultimoBoton && Date.now() - ultimoClic < 1500 ? ultimoBoton : null;
  boton?.setAttribute('aria-busy', 'true');
  const r = await directo.enviar(accion, datos, claveInput.value);
  boton?.removeAttribute('aria-busy');
  if (!r.ok) aviso(r.error === 'Contraseña incorrecta' ? 'Contraseña incorrecta: escríbela arriba a la derecha' : (r.error || 'No se pudo hacer'));
  else if (boton) {
    boton.classList.remove('hecho');
    void boton.offsetWidth;
    boton.classList.add('hecho');
    setTimeout(() => boton.classList.remove('hecho'), 900);
  }
  return r;
}

// ---------- Equipos ----------
// Los equipos Legacy se pueden poner en el overlay (un amistoso, una exhibición), pero no entran en el sorteo
const opcionesClan = clanes.clanes.map(c => `<option value="${c.id}">${c.nombre}${c.kanji ? ` ${c.kanji}` : ''}${c.legacy ? ' · Legacy' : ''}</option>`).join('');
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
  // DraftCore numera los turnos del 1 al 20: por encima, ese draft ya ha terminado allí
  const turno = e.draft.turno > 20 ? 'Ese draft ya ha terminado en DraftCore.' : `Turno ${e.draft.turno || 'por empezar'}.`;
  fuente.textContent = f.conectado ? `Conectado al draft ${f.codigo}. ${turno}` : (f.error || 'Sin conectar.');

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
    $('.participantes').innerHTML = clanes.clanes.filter(compite).map(c =>
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
  // Draft vacío para la partida que se carga; si es la primera de la serie, también sin resultados ni bloqueos fearless
  await enviar(p.config.partida === 1 ? 'nuevaSerie' : 'limpiarDraft');
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
    ? 'El inicio de sesión con Discord está activo: cualquiera con Discord puede entrar en /gachapon/ y recibir sus sobres.'
    : 'Falta configurar el inicio de sesión con Discord en Render (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET y SESION_SECRETO). Los pasos están en la guía del README.';
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
  $('#resumenGacha').textContent = `${n(r.coleccionistas, 'coleccionista', 'coleccionistas')}${r.conTwitch ? ` (${r.conTwitch} con su Twitch vinculado)` : ''}, ${n(r.sobresAbiertos, 'sobre abierto', 'sobres abiertos')} y ${n(r.sobresSinAbrir, 'sin abrir', 'sin abrir')}. ${n(r.cartas, 'carta', 'cartas')} en los sobres. Probabilidad por carta: `
    + [...(p['S+'] ? ['S+'] : []), ...TIERS].map(t => `${t} ${porcentaje(p[t] || 0)}`).join(', ') + '.';
}
async function actualizarGacha() {
  const r = await directo.enviar('gachaEstado', {}, claveInput.value);
  if (r.sinConexion) { setTimeout(actualizarGacha, 1500); return; } // la conexión aún no está abierta
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
  if (!usuario) return aviso('Escribe el nombre en Discord');
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
      <div class="cabeza-kda"><span>Jugador</span><span title="Asesinatos">K</span><span title="Muertes">D</span><span title="Asistencias">A</span>
        <span title="Súbditos y monstruos">Farmeo</span><span title="Puntuación de visión">Visión</span><span title="Daño a campeones">Daño</span><span title="Daño a torres (solo lo usan algunas cartas BOOST)">Torres</span><span>MVP</span></div>
      ${ROLES.map((r, i) => `<div class="fila-kda" data-indice="${i}"><span class="quien"></span>
        <input type="number" min="0" max="99" class="k" aria-label="Asesinatos"><input type="number" min="0" max="99" class="d" aria-label="Muertes"><input type="number" min="0" max="99" class="a" aria-label="Asistencias">
        <input type="number" min="0" max="2000" class="cs" aria-label="Farmeo"><input type="number" min="0" max="500" class="vision" aria-label="Visión"><input type="number" min="0" max="500000" step="100" class="dano" aria-label="Daño a campeones"><input type="number" min="0" max="200000" step="100" class="danoTorres" aria-label="Daño a torres">
        <label><input type="radio" name="mvp" value="${lado}-${i}" aria-label="MVP"></label><span class="extras-kda"></span></div>`).join('')}</div>`).join('');
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
    cs: f.querySelector('.cs').value, vision: f.querySelector('.vision').value, dano: f.querySelector('.dano').value, danoTorres: f.querySelector('.danoTorres').value,
    // Lo que ha dado el puente de los sucesos de la partida (vacío si no lo sabe)
    ...(f.dataset.extras ? JSON.parse(f.dataset.extras) : {}),
  }));
  const mvp = document.querySelector('.kda input[name="mvp"]:checked')?.value || null;
  const r = await enviar('fantasyEstadisticas', { filas, mvp });
  if (!r.ok) return;
  actualizarGacha();
  $('#estadoKda').className = 'estado ok';
  $('#estadoKda').textContent = `Guardado (${r.partida}): ` + r.puntos.filter(p => p.jugador).map(p => `${p.jugador} ${p.puntos.toLocaleString('es-ES')}`).join(', ') + ' puntos.';
  // El desglose de cada jugador, al pasar el ratón por su nombre
  document.querySelectorAll('.kda .fila-kda').forEach(f => {
    const lado = f.closest('.lado-kda').dataset.lado, rol = ROLES[Number(f.dataset.indice)];
    const p = r.puntos.find(x => x.id === `${estado.equipos[lado].clan}-${rol}`);
    if (p) f.querySelector('.quien').title = `${p.puntos.toLocaleString('es-ES')} puntos: ` + p.desglose.map(d => `${d.texto} ${d.puntos > 0 ? '+' : '−'}${Math.abs(d.puntos).toLocaleString('es-ES')}`).join(' · ');
  });
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
pintarGacha = function (g) { pintarGachaAntes(g); pintarAlineaciones(g.cerrado); pintarJornada(g.jornadas); pintarCodigo(g.codigo); publicarEnDiscord = Boolean(g.publicarDiscord); };

// ---------- Partida en directo (overlay /ingame/) ----------
let ultimaPartida = null;
const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const milesOro = n => `${(n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;

// En qué punto está: sin puente, en espera, buscando, en juego, terminada o de prueba
function faseDe(p) {
  if (p.prueba && p.activo) return 'prueba';
  if (p.activo) return p.terminada ? 'terminada' : 'partida';
  if (!p.puente?.conectado) return 'sin-puente';
  if (estado?.buscarPartida?.activa) return 'buscando';
  if (p.terminada) return 'terminada';
  return 'espera';
}
const ORDEN_PASOS = ['puente', 'buscando', 'partida', 'terminada'];
const PASO_DE_FASE = { 'sin-puente': -1, espera: 0, buscando: 1, partida: 2, prueba: 2, terminada: 3 };

function pintarBusqueda() {
  const p = ultimaPartida;
  if (!p || !estado) return;
  const fase = faseDe(p);
  const buscando = Boolean(estado.buscarPartida?.activa);
  const actual = PASO_DE_FASE[fase];
  document.querySelectorAll('.pasos-partida li').forEach(li => {
    const i = ORDEN_PASOS.indexOf(li.dataset.paso);
    li.classList.toggle('hecho', i < actual);
    li.classList.toggle('actual', i === actual);
  });
  // Puentes antiguos: el 1 busca siempre por su cuenta; el 2 no sigue la partida si la web se reinicia
  const version = p.puente?.conectado ? p.puente.version : 3;
  const aviso = version < 2 ? 'Ojo: el puente es de una versión antigua y busca siempre por su cuenta; vuelve a descargarlo de la guía.'
    : version < 3 ? 'Hay una versión nueva del puente (sigue con la partida si la web se reinicia): descárgala de la guía cuando puedas.' : '';
  const est = $('#estadoPartida');
  const textos = {
    prueba: ['ok', `Partida de prueba · ${mmss(p.tiempo)}. El marcador está en el overlay de partida.`],
    partida: ['ok', `En juego · ${mmss(p.tiempo)}. El marcador está en el overlay de partida.`
      + (p.historiaIncompleta ? ' Se ha entrado a mirarla ya empezada: faltan los objetivos de antes, así que los temporizadores que no se saben salen cuando caiga el siguiente.' : '')],
    terminada: ['ok', p.activo ? `Partida terminada · ${mmss(p.tiempo)}. Cuando se cierre el cliente, el puente deja de buscar.`
      : 'La partida ha terminado. Las estadísticas del fantasy ya están rellenadas: revísalas, apunta el daño, elige el MVP, marca el ganador y guarda.'],
    'sin-puente': ['mal', buscando ? 'Buscando la partida, pero el puente no está abierto en el PC del espectador. Ábrelo con «Abrir el puente.bat».'
      : 'El puente no está abierto en el PC del espectador. Ábrelo con «Abrir el puente.bat» y déjalo abierto toda la jornada.'],
    buscando: ['', p.puente?.estado === 'espera' ? 'Avisando al puente…'
      : 'Buscando la partida en el PC del espectador. El marcador saldrá solo en cuanto empiece.'],
    espera: ['', estado.buscarPartida?.alAcabarDraft ? 'Puente abierto y en espera. Se pondrá a buscar solo al acabar el draft, o pulsa «Buscar la partida».'
      : 'Puente abierto y en espera. Pulsa «Buscar la partida» cuando vaya a empezar.'],
  };
  const [clase, texto] = textos[fase];
  est.className = `estado estado-partida ${version < 2 ? 'mal' : clase}`;
  est.textContent = aviso ? `${texto} ${aviso}` : texto;
  const boton = $('#buscarPartida');
  boton.textContent = buscando ? 'Dejar de buscar' : 'Buscar la partida';
  boton.className = buscando ? 'secundario' : '';
  $('#buscarAlAcabar').checked = estado.buscarPartida?.alAcabarDraft !== false;
  $('#verLineas').textContent = estado.grafico?.tipo === 'lineas' ? 'Quitar el línea por línea' : 'Sacar el línea por línea';
}

function pintarPartidaPanel(p) {
  ultimaPartida = p;
  pintarBusqueda();
  rellenarKdaAlTerminar(p);
  const nombre = lado => clanes.clan(estado?.equipos?.[lado]?.clan || 'NONAME').nombre;
  $('#resumenPartida').innerHTML = p.activo ? ['azul', 'rojo'].map(lado => {
    const e = p[lado];
    const extra = [e.dragones.length ? `${e.dragones.length} dragones` : '', e.alma ? 'alma' : '', e.larvas ? `${e.larvas} larvas` : '',
      e.heraldos ? 'heraldo' : '', e.barones ? `${e.barones} barón` : '', e.ancestrales ? 'ancestral' : ''].filter(Boolean).join(', ');
    return `<dt class="${lado}">${nombre(lado)}</dt><dd>${e.kills} asesinatos · ≈${milesOro(e.oro)} de oro estimado (${milesOro(e.oroObjetos ?? e.oro)} en objetos) · ${e.torres} torres${extra ? ` · ${extra}` : ''}</dd>`;
  }).join('') + (p.eventosSinReconocer?.length ? `<dt>Eventos que el overlay aún no sabe pintar</dt><dd>${p.eventosSinReconocer.join(', ')}</dd>` : '')
    + (p.eventosRecibidos ? `<dt>Sucesos que da el cliente</dt><dd>${Object.entries(p.eventosRecibidos).map(([n, c]) => `${n} ${c}`).join(' · ') || 'ninguno'}</dd>` : '') : '';
  $('#pruebaPartida').textContent = p.prueba && p.activo ? 'Parar la partida de prueba' : 'Empezar una partida de prueba';
  $('#pruebaPartida').dataset.activa = p.prueba && p.activo ? '1' : '0';
  if (estado) pintarOpcionesFicha();
}
function pintarVisibilidadPartida() {
  $('#verPartida').textContent = estado?.partidaVisible === false ? 'Mostrar el marcador' : 'Ocultar el marcador';
}
const pintarAntesPartida = pintar;
pintar = function () { pintarAntesPartida(); pintarVisibilidadPartida(); pintarBusqueda(); };
$('#verPartida').onclick = () => enviar('partidaVisible', { visible: estado?.partidaVisible === false });
$('#buscarPartida').onclick = async () => {
  const activa = !estado?.buscarPartida?.activa;
  const r = await enviar('buscarPartida', { activa });
  if (r.ok) aviso(activa ? 'Buscando la partida en el PC del espectador' : 'Búsqueda parada');
};
$('#buscarAlAcabar').onchange = e => enviar('buscarAlAcabarDraft', { activa: e.target.checked });
$('#verLineas').onclick = async () => {
  const fuera = estado?.grafico?.tipo === 'lineas';
  if (!fuera && !ultimaPartida?.activo) return aviso('El línea por línea sale cuando hay una partida en marcha');
  await enviar('grafico', fuera ? { tipo: null } : { tipo: 'lineas', segundos: Number($('#duracionLineas').value) });
};

// ---------- Ficha de jugador y gráfica de oro (un grafismo a la vez) ----------
// La ficha es de un puesto del enfrentamiento: el jugador que el panel tiene en ese puesto (o el que da el cliente)
function pintarOpcionesFicha() {
  const lado = $('#fichaLado').value;
  const sel = $('#fichaJugador');
  const antes = sel.value;
  // Las opciones solo se rehacen si cambian los nombres (la partida llega cada segundo y no hay que cerrar el desplegable)
  const opciones = ROLES.map((rol, i) => {
    const nombre = estado?.equipos?.[lado]?.jugadores?.[i] || ultimaPartida?.lineas?.[i]?.[lado]?.nombre || '';
    return `<option value="${i}">${ROL_LEGIBLE[rol]}${nombre ? ` · ${escapar(nombre)}` : ''}</option>`;
  }).join('');
  if (sel.dataset.firma !== opciones) { sel.dataset.firma = opciones; sel.innerHTML = opciones; if (antes) sel.value = antes; }
  const g = estado?.grafico;
  $('#verFicha').textContent = g?.tipo === 'ficha' ? 'Quitar la ficha' : 'Sacar la ficha';
  $('#verOro').textContent = g?.tipo === 'oro' ? 'Quitar la gráfica de oro' : 'Sacar la gráfica de oro';
}
$('#fichaLado').onchange = pintarOpcionesFicha;
$('#verFicha').onclick = async () => {
  const fuera = estado?.grafico?.tipo === 'ficha';
  if (!fuera && !ultimaPartida?.activo) return aviso('La ficha sale cuando hay una partida en marcha');
  await enviar('grafico', fuera ? { tipo: null } : { tipo: 'ficha', lado: $('#fichaLado').value, indice: Number($('#fichaJugador').value), segundos: Number($('#duracionFicha').value) });
};
// La gráfica necesita al menos dos minutos de datos: si no, se avisa y no se saca nada
const MINIMO_GRAFICA_S = 120;
$('#verOro').onclick = async () => {
  const fuera = estado?.grafico?.tipo === 'oro';
  if (!fuera) {
    const m = ultimaPartida?.grafica?.muestras || [];
    const abarca = m.length ? m.at(-1)[0] - m[0][0] : 0;
    if (!ultimaPartida?.activo) return aviso('La gráfica de oro sale cuando hay una partida en marcha');
    if (abarca < MINIMO_GRAFICA_S) return aviso(`Aún no hay gráfica: hacen falta dos minutos de partida (hay ${mmss(abarca)})`);
  }
  await enviar('grafico', fuera ? { tipo: null } : { tipo: 'oro', segundos: Number($('#duracionOro').value) });
};

// ---------- Estilo del marcador e interruptores de lo nuevo ----------
document.querySelectorAll('.estilos .estilo').forEach(b => b.addEventListener('click', () => enviar('ingame', { estilo: b.dataset.estilo })));
for (const k of ['resumenPelea', 'puntosFantasy', 'oroIngresos']) $(`#${k}`).onchange = e => enviar('ingame', { [k]: e.target.checked });
function pintarIngame() {
  const i = estado?.ingame || { estilo: 'a', puntosFantasy: true, resumenPelea: true, oroIngresos: true };
  document.querySelectorAll('.estilos .estilo').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.estilo === i.estilo)));
  for (const k of ['resumenPelea', 'puntosFantasy', 'oroIngresos']) $(`#${k}`).checked = i[k] !== false;
  pintarOpcionesFicha();
  pintarCamarasLineas();
}

// ---------- Cámaras de los casters, a los lados del línea por línea ----------
// Dos huecos, uno a cada lado del panel (camarasLineas en comun.js): izquierda y derecha. Marcar una se aplica al
// momento; el nombre y el detalle, con el botón, como en las cámaras del draft. La medida depende del estilo del marcador
const LADO_CAMARA = ['izquierda', 'derecha'];
let camarasLineasRellenas = false;
function pintarCamarasLineas() {
  const lista = estado?.ingame?.camaras;
  if (!lista) return;
  const caja = $('.lista-camaras-lineas');
  // Las filas se montan una vez: lo escrito no se pisa cada vez que llega el estado
  if (!camarasLineasRellenas) {
    camarasLineasRellenas = true;
    caja.innerHTML = lista.map((c, i) => `<div class="fila-camara-lineas">
      <label class="casilla"><input type="checkbox" class="activa"><span class="donde"><b>Cámara ${LADO_CAMARA[i]}</b><span class="medida"></span></span></label>
      <input class="nombre" aria-label="Nombre del caster de la cámara ${LADO_CAMARA[i]}" placeholder="Nombre del caster" maxlength="40">
      <input class="detalle" aria-label="Detalle de la cámara ${LADO_CAMARA[i]}" placeholder="@usuario" maxlength="60">
    </div>`).join('');
    caja.querySelectorAll('.fila-camara-lineas').forEach((f, i) => {
      f.querySelector('.nombre').value = lista[i].nombre;
      f.querySelector('.detalle').value = lista[i].detalle;
      f.querySelector('.activa').addEventListener('change', async e => {
        const activa = e.target.checked;
        const r = await enviar('ingame', { camaras: LADO_CAMARA.map((_, j) => (j === i ? { activa } : {})) });
        if (r.ok) aviso(activa ? `Cámara ${LADO_CAMARA[i]} activada: sale con el línea por línea` : `Cámara ${LADO_CAMARA[i]} quitada`);
      });
    });
  }
  const huecos = camarasLineas(estado.ingame.estilo);
  caja.querySelectorAll('.fila-camara-lineas').forEach((f, i) => {
    const h = huecos[i];
    f.querySelector('.activa').checked = Boolean(lista[i].activa);
    f.querySelector('.medida').textContent = `${h.w}×${h.h} en x ${h.x}, y ${h.y}`;
  });
}
$('#guardarCamarasLineas').onclick = async () => {
  const camaras = [...document.querySelectorAll('.fila-camara-lineas')].map(f => ({ nombre: f.querySelector('.nombre').value.trim(), detalle: f.querySelector('.detalle').value.trim() }));
  const r = await enviar('ingame', { camaras });
  if (r.ok) aviso('Nombres de los casters en el overlay');
};

// Estadísticas del fantasy desde la partida: cada puesto del panel con el jugador de esa línea.
// El puente da el KDA, el farmeo y la visión; de los sucesos, la primera sangre, los multikills y las torres
// (si se ha seguido la partida desde el principio). El daño no lo da: se apunta de la pantalla final.
function kdaDeLaPartida(p) {
  if (!p?.lineas?.length) return false;
  let alguno = false;
  document.querySelectorAll('.kda .lado-kda').forEach(caja => {
    const lado = caja.dataset.lado;
    caja.querySelectorAll('.fila-kda').forEach((f, i) => {
      const j = p.lineas[i]?.[lado];
      if (!j) return;
      f.querySelector('.k').value = j.k;
      f.querySelector('.d').value = j.d;
      f.querySelector('.a').value = j.a;
      f.querySelector('.cs').value = j.cs ?? '';
      f.querySelector('.vision').value = j.vision ?? '';
      const extras = { primeraSangre: j.primeraSangre ?? null, triples: j.triples ?? null, quadras: j.quadras ?? null,
        pentas: j.pentas ?? null, torres: j.torres ?? null, fuente: 'puente' };
      f.dataset.extras = JSON.stringify(extras);
      const textos = [extras.primeraSangre && 'primera sangre', extras.pentas && `${extras.pentas} pentakill`,
        extras.quadras - (extras.pentas || 0) > 0 && `${extras.quadras - (extras.pentas || 0)} cuádruple`,
        extras.triples - (extras.quadras || 0) > 0 && `${extras.triples - (extras.quadras || 0)} triple`,
        extras.torres && `${extras.torres} ${extras.torres === 1 ? 'torre' : 'torres'}`].filter(Boolean);
      f.querySelector('.extras-kda').textContent = textos.length ? `Del puente: ${textos.join(', ')}` : '';
      alguno = true;
    });
  });
  return alguno;
}
const textoRellenado = p => 'Estadísticas rellenadas con la partida: revisa que cada jugador esté en su puesto, apunta el daño de la pantalla final, elige el MVP y guarda.'
  + (p.historiaIncompleta ? ' El puente no ha visto la partida desde el principio: la primera sangre, los multikills y las torres no cuentan.' : '');
let kdaRellenadoDe = null;
function rellenarKdaAlTerminar(p) {
  // Al terminar una partida de verdad, una sola vez y solo si nadie ha escrito ya los números
  if (!p.terminada || p.prueba || kdaRellenadoDe === p.numero) return;
  kdaRellenadoDe = p.numero;
  const vacios = [...document.querySelectorAll('.kda input[type="number"]')].every(i => i.value === '');
  if (vacios && kdaDeLaPartida(p)) {
    $('#estadoKda').className = 'estado';
    $('#estadoKda').textContent = textoRellenado(p);
  }
}
$('#rellenarKda').onclick = () => {
  if (!kdaDeLaPartida(ultimaPartida)) return aviso('No hay datos de ninguna partida del puente');
  $('#estadoKda').className = 'estado';
  $('#estadoKda').textContent = textoRellenado(ultimaPartida);
};
$('#pruebaPartida').onclick = async () => {
  const activa = $('#pruebaPartida').dataset.activa !== '1';
  const r = await enviar('partidaPrueba', { activa });
  if (r.ok) aviso(activa ? 'Partida de prueba en marcha: mira el overlay de partida' : 'Partida de prueba parada');
};

// ---------- Objetivos a mano (el cliente no da dragones, heraldo ni Barón a los espectadores) ----------
const DRAGONES_PANEL = [['infernal', '炎', 'Infernal', '#E0592A'], ['oceano', '海', 'Océano', '#3A8FD9'], ['montana', '山', 'Montaña', '#A07D4F'],
  ['nube', '雲', 'Nube', '#C8DFE4'], ['hextech', '雷', 'Hextech', '#2BC6C0'], ['quimtech', '毒', 'Quimtech', '#8DBF3F'], ['ancestral', '龍', 'Ancestral', '#C3A3EA']];
$('.marcas').innerHTML = ['azul', 'rojo'].map(lado => `<div class="marca-lado ${lado}" data-lado="${lado}"><b class="quien">Lado ${lado}</b><div class="botones">
  ${DRAGONES_PANEL.map(([id, kanji, nombre, color]) => `<button type="button" class="marca" data-tipo="dragon" data-dragon="${id}" style="--color:${color}"><span>${kanji}</span>${nombre}</button>`).join('')}
  <button type="button" class="marca" data-tipo="heraldo" style="--color:#8F7AE8"><span>使</span>Heraldo</button>
  <button type="button" class="marca" data-tipo="baron" style="--color:#9B59D0"><span>蛇</span>Barón</button></div></div>`).join('');
const nombreDelLado = lado => (estado?.equipos?.[lado]?.clan && estado.equipos[lado].clan !== 'NONAME' ? clanes.clan(estado.equipos[lado].clan).nombre : `Lado ${lado}`);
document.querySelectorAll('.marcas .marca').forEach(b => b.addEventListener('click', async () => {
  if (!ultimaPartida?.activo) return aviso('No hay ninguna partida en marcha');
  const lado = b.closest('.marca-lado').dataset.lado;
  const r = await enviar('marcarObjetivo', { tipo: b.dataset.tipo, lado, dragon: b.dataset.dragon });
  if (r.ok) aviso(`${b.textContent.slice(1).trim()} para ${nombreDelLado(lado)}`);
}));
$('#deshacerMarca').onclick = async () => { const r = await enviar('deshacerObjetivo'); if (r.ok) aviso('Última marca deshecha'); };
$('#avisosPropios').onchange = e => enviar('avisosPropios', { activos: e.target.checked });
function pintarMarcas() {
  document.querySelectorAll('.marca-lado').forEach(caja => { caja.querySelector('.quien').textContent = nombreDelLado(caja.dataset.lado); });
  $('#avisosPropios').checked = Boolean(estado?.avisosPropios);
}
const pintarAntesMarcas = pintar;
pintar = function () { pintarAntesMarcas(); pintarMarcas(); pintarIngame(); };

// El panel ya está entero: se pinta lo que haya llegado mientras cargaba
listo = true;
if (estado) pintar();
if (partidaPendiente) pintarPartidaPanel(partidaPendiente);

// ---------- Tier list: descargar la imagen o publicarla en Discord (con la contraseña del panel) ----------
async function imagenTier() {
  const t = await fetch('/api/tierlist', { cache: 'no-store' }).then(r => r.json());
  return imagenTierlist({ jugadores: t.jugadores, equipos: t.equipos, nombreClan: id => clanes.clan(id).nombre });
}
$('#descargarTier').onclick = async () => descargar(await imagenTier(), 'tenka-ichi-tierlist.jpg');
$('#publicarTier').onclick = async () => {
  const r = await publicar('tierlist', await imagenTier(), { clave: claveInput.value });
  aviso(r.ok ? 'Tier list publicada en Discord' : r.error);
};

// ---------- Qué enseña el overlay: automático o forzado ----------
// El overlay cambia solo (draft, postdraft, partida y pantalla final). Aquí se fuerza una vista, por si algo falla,
// y «Automático» lo suelta. El punto marca lo que se está viendo ahora
const VISTA_LEGIBLE = { draft: 'el draft', postdraft: 'el postdraft', partida: 'el marcador de la partida', final: 'la pantalla final' };
function pintarVistas() {
  const forzada = estado?.vista?.forzada || null, actual = estado?.vistaOverlay;
  document.querySelectorAll('.vistas button').forEach(b => {
    const v = b.dataset.vista;
    b.setAttribute('aria-pressed', String(v === 'auto' ? !forzada : v === forzada));
    b.classList.toggle('actual', v === actual);
  });
}
document.querySelectorAll('.vistas button').forEach(b => b.addEventListener('click', async () => {
  const vista = b.dataset.vista;
  if (vista === 'final' && !estado?.final) return aviso('Todavía no hay pantalla final: sale al acabar la partida o al marcar el ganador');
  const r = await enviar('vistaOverlay', { vista });
  if (r.ok) aviso(vista === 'auto' ? 'El overlay vuelve a cambiar solo' : `El overlay se queda en ${VISTA_LEGIBLE[vista]} hasta que pulses «Automático»`);
}));
$('#quitarFinal').onclick = async () => { const r = await enviar('finalQuitar'); if (r.ok) aviso('Pantalla final quitada'); };

// ---------- Fases: en cada momento, solo los apartados que tocan ----------
const FASES = ['antes', 'draft', 'partida', 'resultado', 'liga', 'todo'];
let fase = 'antes', seguirFase = true, faseAuto = null;
try { fase = localStorage.getItem('tenka-fase') || 'antes'; seguirFase = localStorage.getItem('tenka-fase-sola') !== '0'; } catch {}
// /panel/?fase=partida abre el panel en esa fase (y se queda en ella)
const fasePedida = new URLSearchParams(location.search).get('fase');
if (FASES.includes(fasePedida)) { fase = fasePedida; seguirFase = false; }
// La fase que toca según lo que enseña el overlay
function faseDelOverlay() {
  const v = estado?.vistaOverlay;
  if (v === 'final') return 'resultado';
  if (v === 'partida' || v === 'postdraft') return 'partida';
  const d = estado?.draft;
  const empezado = Boolean(d) && ['picks', 'bans'].some(t => ['azul', 'rojo'].some(l => d[t][l].some(Boolean)));
  return empezado || estado?.fuente?.conectado ? 'draft' : 'antes';
}
function ponerFase(nueva) {
  fase = FASES.includes(nueva) ? nueva : 'todo';
  document.querySelectorAll('.fases button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fase === fase)));
  document.querySelectorAll('main > section').forEach(seccion => {
    seccion.hidden = fase !== 'todo' && !(seccion.dataset.fases || '').split(' ').includes(fase);
  });
  recordar('tenka-fase', fase);
}
function ponerSeguir(sola) {
  seguirFase = sola;
  $('#seguirFase').checked = sola;
  recordar('tenka-fase-sola', sola ? '1' : '0');
}
// Lo elegido se recuerda en este navegador, salvo que el panel se haya abierto con ?fase= (eso es solo para esa vez)
function recordar(clave, valor) {
  if (FASES.includes(fasePedida)) return;
  try { localStorage.setItem(clave, valor); } catch {}
}
// Con «Cambiar sola», la fase sigue al overlay; solo salta cuando el overlay cambia, no con cada dato que llega
function seguirOverlay() {
  if (!estado) return;
  const toca = faseDelOverlay();
  if (seguirFase && toca !== faseAuto) ponerFase(toca);
  faseAuto = toca;
}
document.querySelectorAll('.fases button').forEach(b => b.addEventListener('click', () => { ponerSeguir(false); ponerFase(b.dataset.fase); }));
$('#seguirFase').onchange = e => { ponerSeguir(e.target.checked); if (e.target.checked) { faseAuto = null; seguirOverlay(); } };
ponerSeguir(seguirFase);
ponerFase(fase);

// ---------- Jornada del fantasy: clasificación, sobres para los tres primeros y Discord ----------
let jornada = null, publicarEnDiscord = false;
function pintarJornada(j) {
  if (!j) return;
  jornada = j;
  const sel = $('#jornadaElegida');
  sel.innerHTML = j.jornadas.length
    ? j.jornadas.map(x => `<option value="${escapar(x.nombre)}">${escapar(x.nombre)}${x.cerrada ? ' (terminada)' : ''}</option>`).join('')
    : '<option value="">Sin partidas puntuadas</option>';
  sel.value = j.jornada || '';
  const premios = estado?.jornadaAuto?.premios || [];
  const sobres = puesto => (j.cerrada ? j.cerrada.ganadores.find(g => g.puesto === puesto)?.sobres : premios[puesto - 1]) || 0;
  $('.clasificacion-jornada').innerHTML = j.clasificacion.slice(0, 10).map(c => `<li><span class="puesto">${c.puesto}</span><b>${escapar(c.nombre)}</b>
    <span>${c.puntos.toLocaleString('es-ES')} ${c.puntos === 1 ? 'punto' : 'puntos'}</span>${c.puesto <= 3 && sobres(c.puesto) ? `<em>+${sobres(c.puesto)} ${sobres(c.puesto) === 1 ? 'sobre' : 'sobres'}</em>` : ''}</li>`).join('')
    || '<li class="vacio">Todavía no hay partidas con las estadísticas guardadas.</li>';
  $('#terminarJornada').disabled = !j.jornada || Boolean(j.cerrada) || !j.clasificacion.length;
  $('#terminarJornada').textContent = j.cerrada ? 'Jornada ya terminada' : 'Terminar la jornada y repartir sobres';
  $('#descargarClasificacion').disabled = $('#publicarClasificacion').disabled = !j.clasificacion.length;
  if (j.cerrada) {
    $('#estadoJornada').className = 'estado ok';
    $('#estadoJornada').textContent = `${j.jornada} se terminó el ${new Date(j.cerrada.fecha).toLocaleDateString('es-ES')} y sus sobres ya están repartidos.`;
  } else if ($('#estadoJornada').dataset.jornada !== j.jornada) $('#estadoJornada').textContent = '';
  $('#estadoJornada').dataset.jornada = j.jornada || '';
}
$('#jornadaElegida').onchange = async e => { const r = await enviar('jornadaEstado', { jornada: e.target.value }); if (r.ok) pintarJornada(r); };

// En la imagen, los sobres solo salen si la jornada ya está terminada
const imagenDeLaJornada = () => imagenClasificacion({ jornada: jornada.jornada, filas: jornada.clasificacion, ganadores: jornada.cerrada?.ganadores || [] });
async function publicarClasificacion() {
  const r = await publicar('clasificacion', await imagenDeLaJornada(), { clave: claveInput.value, jornada: jornada.jornada });
  aviso(r.ok ? 'Clasificación publicada en Discord' : r.error);
  return r.ok;
}
$('#descargarClasificacion').onclick = async () => descargar(await imagenDeLaJornada(), `tenka-ichi-${jornada.jornada.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`);
$('#publicarClasificacion').onclick = publicarClasificacion;
$('#terminarJornada').onclick = async () => {
  const j = jornada?.jornada, [uno, dos, tres] = estado?.jornadaAuto?.premios || [];
  if (!j) return;
  const podio = jornada.clasificacion.slice(0, 3).map(c => `${c.puesto}.º ${c.nombre}`).join(', ');
  if (!confirm(`¿Terminar ${j}?\n\n${podio}\n\nSe reparten ${uno}, ${dos} y ${tres} sobres, se abren las alineaciones y no se puede deshacer.`)) return;
  const r = await enviar('jornadaTerminar', { jornada: j });
  if (!r.ok) return;
  pintarGacha(r.gacha);
  const tras = await enviar('jornadaEstado', { jornada: j });
  if (tras.ok) pintarJornada(tras);
  aviso(`${j} terminada: sobres repartidos`);
  // Y la clasificación, a Discord (si el canal está conectado)
  if (publicarEnDiscord) await publicarClasificacion();
};
// Los sobres de cada puesto y si las alineaciones se cierran solas
const camposPremio = ['#premio1', '#premio2', '#premio3'].map($);
camposPremio.forEach(campo => campo.addEventListener('change', async () => {
  const r = await enviar('jornadaAuto', { premios: camposPremio.map(c => Number(c.value) || 0) });
  if (r.ok) aviso('Sobres de la jornada cambiados');
}));
$('#cerrarSolas').onchange = e => enviar('jornadaAuto', { cerrar: e.target.checked });
let premiosPintados = '';
function pintarJornadaAuto() {
  const a = estado?.jornadaAuto;
  if (!a) return;
  camposPremio.forEach((campo, i) => { if (document.activeElement !== campo) campo.value = a.premios[i]; });
  $('#cerrarSolas').checked = a.cerrar;
  if (estado.fantasy) pintarAlineaciones(estado.fantasy.cerrado);
  // Si cambian los sobres de cada puesto, la clasificación de la jornada los enseña al momento
  if (premiosPintados !== a.premios.join()) { premiosPintados = a.premios.join(); if (jornada) pintarJornada(jornada); }
}

// ---------- Código de directo ----------
let codigo = null;
function pintarCodigo(c = codigo) {
  codigo = c || null;
  const est = $('#estadoCodigo');
  const quedan = codigo ? Math.max(0, codigo.caduca - Date.now()) : 0;
  const vivo = Boolean(codigo?.vivo) && quedan > 0;
  if (!codigo) { est.className = 'estado'; est.textContent = 'No hay ningún código en marcha.'; }
  else {
    const canjes = `${codigo.canjes} ${codigo.canjes === 1 ? 'canje' : 'canjes'}${codigo.maximo ? ` de ${codigo.maximo}` : ''}`;
    est.className = `estado ${vivo ? 'ok' : 'mal'}`;
    est.innerHTML = vivo
      ? `Código <b class="codigo">${escapar(codigo.texto)}</b>: ${codigo.sobres === 1 ? '1 sobre' : `${codigo.sobres} sobres`}, ${canjes}, quedan ${mmss(quedan / 1000)}. ${codigo.visible ? 'Se ve en el overlay.' : 'No se ve en el overlay.'}`
      : `El código ${escapar(codigo.texto)} ya no vale (${canjes}).`;
  }
  $('#ocultarCodigo').hidden = !vivo;
  $('#ocultarCodigo').textContent = codigo?.visible ? 'Quitarlo del overlay' : 'Enseñarlo en el overlay';
  $('#cerrarCodigo').hidden = !codigo;
}
$('#crearCodigo').onclick = async () => {
  if (codigo?.vivo && codigo.caduca > Date.now() && !confirm('Ya hay un código en marcha. ¿Crear otro? El anterior deja de valer.')) return;
  const r = await enviar('codigoCrear', { sobres: $('#codigoSobres').value, minutos: $('#codigoMinutos').value, maximo: $('#codigoMaximo').value });
  if (r.ok) { pintarGacha(r.gacha); aviso('Código creado: ya sale en el overlay'); }
};
$('#ocultarCodigo').onclick = async () => { const r = await enviar('codigoMostrar', { visible: !codigo?.visible }); if (r.ok) pintarGacha(r.gacha); };
$('#cerrarCodigo').onclick = async () => { const r = await enviar('codigoCerrar'); if (r.ok) { pintarGacha(r.gacha); aviso('Código cerrado'); } };
// La cuenta atrás va sola; mientras hay un código en marcha, los canjes se miran cada 10 s
setInterval(() => { if (codigo) pintarCodigo(); }, 1000);
setInterval(() => { if (codigo?.vivo && codigo.caduca > Date.now()) actualizarGacha(); }, 10000);

const pintarAntesVistas = pintar;
pintar = function () { pintarAntesVistas(); pintarVistas(); pintarJornadaAuto(); seguirOverlay(); };
if (estado) pintar();
