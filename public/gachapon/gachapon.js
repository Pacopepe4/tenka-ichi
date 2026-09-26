// Gachapon: entrar con Twitch, abrir sobres y ver la colección
import { cargarClanes, logo } from '/comun.js';
import { iniciarDirecto } from '/directo.js';

const $ = s => document.querySelector(s);
const TIERS = ['S', 'A', 'B', 'C', 'D'];
const ROL = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const escapar = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const pct = p => `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

const { clanes } = await cargarClanes();
const nombreClan = id => clanes.find(c => c.id === id)?.nombre || id;
let info = null, filtro = 'todas', abriendo = false;

iniciarDirecto();

let fantasia = null, filtroRol = '';

async function cargar() {
  [info, fantasia] = await Promise.all([
    fetch('/api/gacha', { cache: 'no-store' }).then(r => r.json()),
    fetch('/api/fantasy', { cache: 'no-store' }).then(r => r.json()),
  ]);
  pintar();
}

function cartaHTML(c, cantidad = null) {
  const falta = cantidad === 0;
  return `<div class="carta-g${falta ? ' falta' : ''}" data-tier="${c.tier}" style="--color-tier: var(--tier-${c.tier})">
    <img class="arte" src="/clanes/${c.clan}.jpg" alt="" loading="lazy"><span class="velo"></span>
    <span class="hanko rareza" title="Tier ${c.tier}">${c.tier}</span><img class="logo" src="${logo(c.clan)}" alt="">
    <div class="pie"><b class="nick">${escapar(c.nombre)}</b><span class="rol">${ROL[c.rol] || c.rol} de ${escapar(nombreClan(c.clan))}</span></div>
    ${cantidad > 1 ? `<span class="cantidad" title="La tienes repetida">×${cantidad}</span>` : ''}
  </div>`;
}

function avisar(texto) {
  const p = $('.como-mas');
  p.textContent = texto;
  p.style.color = 'var(--shu-claro)';
  setTimeout(() => { p.style.color = ''; pintarCuenta(); }, 4000);
}

function pintarCuenta() {
  const u = info.usuario, cuenta = $('.cuenta'), sobre = $('.sobre');
  const hayCartas = info.catalogo.length > 0;
  if (!info.activo) {
    cuenta.innerHTML = '<p class="aviso">El gachapon abre muy pronto.</p>';
    sobre.disabled = true;
    $('.como-mas').textContent = '';
    return;
  }
  if (!u) {
    cuenta.innerHTML = `<a class="boton-twitch" href="/auth/twitch?volver=/gachapon/">Entrar con Twitch</a>
      <p class="aviso">La primera vez te llevas ${info.sobresIniciales} sobres.</p>`;
    sobre.disabled = true;
    $('.sobre-contador').textContent = '';
  } else {
    const puede = u.sobres > 0 && hayCartas;
    cuenta.innerHTML = `<div class="yo">${u.avatar ? `<img src="${escapar(u.avatar)}" alt="">` : ''}
        <div><b>${escapar(u.nombre)}</b><span>${u.sobres === 1 ? 'Tienes 1 sobre' : `Tienes ${u.sobres} sobres`}</span></div></div>
      <button class="boton-claro abrir" type="button" ${puede ? '' : 'disabled'}>Abrir un sobre</button>
      <button class="salir" type="button">Salir</button>`;
    sobre.disabled = !puede;
    $('.sobre-contador').textContent = u.sobres ? `×${u.sobres}` : '';
    cuenta.querySelector('.abrir').onclick = abrir;
    cuenta.querySelector('.salir').onclick = async () => { await fetch('/auth/salir', { method: 'POST' }); cargar(); };
  }
  $('.como-mas').innerHTML = !hayCartas
    ? 'Todavía no hay cartas: el staff está preparando la tier list de los jugadores.'
    : info.recompensa
      ? `Consigue más sobres canjeando <b>${escapar(info.recompensa.titulo)}</b> por ${info.recompensa.coste} puntos del canal en <a href="https://twitch.tv/${info.canal}" target="_blank" rel="noopener">twitch.tv/${info.canal}</a>. Aparecen aquí en un minuto.`
      : 'Pronto podrás conseguir más sobres con los puntos del canal de Twitch.';
}

function pintarAlbum() {
  const mias = new Map((info.usuario?.cartas || []).map(c => [c.id, c.cantidad]));
  const conSesion = Boolean(info.usuario);
  const orden = [...info.catalogo].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.clan.localeCompare(b.clan));
  const lista = orden.filter(c => filtro === 'todas' || (filtro === 'tengo' ? mias.get(c.id) : !mias.get(c.id)));
  const tengo = info.catalogo.filter(c => mias.get(c.id)).length;
  $('.progreso').textContent = conSesion ? `Tienes ${tengo} de ${info.catalogo.length} cartas.` : `${info.catalogo.length} cartas en total. Entra con Twitch para empezar tu colección.`;
  let vacio = 'Todavía no hay cartas.';
  if (info.catalogo.length && filtro !== 'todas') vacio = !conSesion ? 'Entra con Twitch para ver tu colección.' : filtro === 'tengo' ? 'Aún no tienes ninguna carta: abre un sobre.' : '¡Las tienes todas!';
  $('.album').innerHTML = lista.length ? lista.map(c => cartaHTML(c, conSesion ? (mias.get(c.id) || 0) : null)).join('') : `<p class="vacio">${vacio}</p>`;
}

function pintarProbabilidades() {
  const cuantos = t => info.catalogo.filter(c => c.tier === t).length;
  $('.tabla-prob').innerHTML = TIERS.map(t => {
    const p = info.probabilidades[t] || 0, n = cuantos(t);
    return `<div class="fila-prob" data-tier="${t}" style="--color-tier: var(--tier-${t})"><span class="letra">${t}</span>
      <span class="barra-prob"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
      <span class="cifra">${pct(p)}<small>${n} ${n === 1 ? 'jugador' : 'jugadores'}</small></span></div>`;
  }).join('') + (info.catalogo.length
    ? `<p class="resumen-prob">En cada sobre, la probabilidad de que salga al menos una S es del ${pct(1 - (1 - (info.probabilidades.S || 0)) ** info.cartasPorSobre)}.</p>` : '');
}

// ---------- fantasy ----------
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const puntosTexto = n => `${n.toLocaleString('es-ES')} ${n === 1 ? 'punto' : 'puntos'}`;
const cartaPorId = id => info.catalogo.find(c => c.id === id) || null;
const puntosDe = id => fantasia.jugadores.find(j => j.id === id)?.puntos || 0;

function pintarFantasy() {
  const yo = fantasia.yo, caja = $('.alineacion');
  const estado = $('.estado-alineacion');
  if (!info.usuario) {
    estado.textContent = 'Entra con Twitch y abre sobres para alinear a tus jugadores.';
  } else if (fantasia.cerrado) {
    estado.innerHTML = `Las alineaciones están <b>cerradas</b> mientras se juega la jornada. Llevas ${puntosTexto(yo.puntos)}${yo.puesto ? `, ${yo.puesto}.º en la clasificación` : ''}.`;
  } else {
    estado.innerHTML = yo.puesto ? `Llevas <b>${puntosTexto(yo.puntos)}</b>, ${yo.puesto}.º en la clasificación. Pulsa un hueco para cambiar al jugador.`
      : 'Pulsa un hueco para elegir al jugador de ese rol entre tus cartas.';
  }
  caja.innerHTML = ROLES.map(rol => {
    const carta = yo?.alineacion?.[rol] ? cartaPorId(yo.alineacion[rol]) : null;
    return `<button type="button" class="hueco-ali" data-rol="${rol}" ${!info.usuario || fantasia.cerrado ? 'disabled' : ''}>
      <span class="rol-ali">${ROL[rol]}</span>
      ${carta ? cartaHTML(carta) : '<span class="vacio-ali">Elegir</span>'}
      ${carta ? `<span class="puntos-ali">${puntosTexto(puntosDe(carta.id))}</span>` : ''}</button>`;
  }).join('');
  caja.querySelectorAll('.hueco-ali:not(:disabled)').forEach(b => b.addEventListener('click', () => elegir(b.dataset.rol)));

  const lista = $('.clasificacion-fantasy');
  lista.innerHTML = fantasia.clasificacion.length
    ? fantasia.clasificacion.map(c => `<li class="${c.yo ? 'yo' : ''}"><span class="puesto">${c.puesto}</span><span class="quien">${escapar(c.nombre)}</span>
        <span class="cuanto">${c.puntos.toLocaleString('es-ES')}${fantasia.ultimaJornada ? `<small>${c.ultima.toLocaleString('es-ES')} en ${escapar(fantasia.ultimaJornada)}</small>` : ''}</span></li>`).join('')
    : '<li class="vacio">La clasificación empieza con la primera jornada.</li>';
}

// Elegir la carta de un hueco entre las que tienes de ese rol
const dialogoElegir = $('.elegir');
function elegir(rol) {
  const mias = new Map((info.usuario?.cartas || []).map(c => [c.id, c.cantidad]));
  const opciones = info.catalogo.filter(c => c.rol === rol && mias.get(c.id));
  const actual = fantasia.yo?.alineacion?.[rol] || null;
  $('#titulo-elegir').textContent = `Elige tu ${ROL[rol]}`;
  $('.elegir .opciones').innerHTML = opciones.length
    ? opciones.map(c => `<button type="button" class="opcion" data-id="${c.id}" aria-pressed="${c.id === actual}">${cartaHTML(c, mias.get(c.id))}</button>`).join('')
    : `<p class="sin-cartas">No tienes ninguna carta de ${ROL[rol]} todavía. Abre sobres para conseguirla.</p>`;
  dialogoElegir.querySelectorAll('.opcion').forEach(b => b.addEventListener('click', () => guardarHueco(rol, b.dataset.id)));
  dialogoElegir.querySelector('.quitar').onclick = () => guardarHueco(rol, null);
  dialogoElegir.querySelector('.cancelar').onclick = () => dialogoElegir.close();
  dialogoElegir.showModal();
}

async function guardarHueco(rol, carta) {
  const slots = { ...(fantasia.yo?.alineacion || {}), [rol]: carta };
  const r = await fetch('/api/fantasy/alineacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slots) })
    .then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  dialogoElegir.close();
  if (!r.ok) {
    const e = $('.estado-alineacion');
    e.textContent = r.error;
    e.style.color = 'var(--shu-claro)';
    setTimeout(() => { e.style.color = ''; pintarFantasy(); }, 4000);
    return;
  }
  fantasia.yo.alineacion = r.alineacion;
  pintarFantasy();
}

function pintarPuntos() {
  const lista = fantasia.jugadores.filter(j => !filtroRol || j.rol === filtroRol);
  $('.tabla-puntos tbody').innerHTML = lista.length ? lista.map(j => `<tr>
      <td><span class="jugador-celda"><img src="${logo(j.clan)}" alt=""><span><b>${escapar(j.nombre)}</b><small>${ROL[j.rol]} de ${escapar(nombreClan(j.clan))}</small></span></span></td>
      <td>${j.tier ? `<span class="letra-tier" data-tier="${j.tier}" style="--color-tier: var(--tier-${j.tier})">${j.tier}</span>` : '–'}</td>
      <td>${j.partidas}</td><td class="total">${j.puntos.toLocaleString('es-ES')}</td></tr>`).join('')
    : '<tr class="vacio"><td colspan="4">Todavía no hay jugadores en las plantillas.</td></tr>';
}

function pintarReglas() {
  const r = fantasia.reglas;
  const signo = n => `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('es-ES')}`;
  $('.reglas').innerHTML = [[r.jugar, 'por jugar la partida'], [r.victoria, 'si gana'], [r.asesinato, 'por asesinato'], [r.muerte, 'por muerte'],
    [r.asistencia, 'por asistencia'], [r.mvp, 'si es el MVP']].map(([n, texto]) => `<li><b>${signo(n)}</b>${texto}</li>`).join('');
}

document.querySelectorAll('.filtros-rol button').forEach(b => b.addEventListener('click', () => {
  filtroRol = b.dataset.rol;
  document.querySelectorAll('.filtros-rol button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarPuntos();
}));

function pintar() {
  pintarCuenta();
  pintarFantasy();
  pintarAlbum();
  pintarPuntos();
  pintarProbabilidades();
  pintarReglas();
}

// ---------- abrir un sobre ----------
const dialogo = $('.apertura');

async function abrir() {
  if (abriendo) return;
  abriendo = true;
  const r = await fetch('/api/gacha/abrir', { method: 'POST' }).then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  abriendo = false;
  if (!r.ok) return avisar(r.error);
  info.usuario = r.usuario;
  mostrarApertura(r.sobre);
}

function mostrarApertura(cartas) {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  dialogo.classList.remove('cortando', 'abierto');
  $('.reparto').innerHTML = cartas.map((c, i) => `<div class="volteable" data-tier="${c.tier}" tabindex="0" role="button" aria-label="Carta ${i + 1}: dale la vuelta">
    <div class="giro"><div class="cara dorso"><img src="/marca/sol-partido-sin-fondo.png" alt=""></div><div class="cara frente">${cartaHTML(c)}</div></div></div>`).join('');
  $('.descubrir').hidden = false;
  $('.otro').hidden = true;
  $('.cerrar-apertura').hidden = true;
  dialogo.showModal();

  const volteables = [...dialogo.querySelectorAll('.volteable')];
  const comprobar = () => {
    if (!volteables.every(v => v.classList.contains('girada'))) return;
    $('.descubrir').hidden = true;
    $('.cerrar-apertura').hidden = false;
    $('.otro').hidden = !(info.usuario.sobres > 0);
    $('.cerrar-apertura').focus();
  };
  const girar = v => {
    v.classList.add('girada');
    v.setAttribute('aria-label', `${cartas[volteables.indexOf(v)].nombre}, tier ${v.dataset.tier}`);
    comprobar();
  };
  volteables.forEach(v => {
    v.onclick = () => girar(v);
    v.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); girar(v); } };
  });
  $('.descubrir').onclick = () => volteables.forEach((v, i) => setTimeout(() => girar(v), reducido ? 0 : i * 260));

  // El trazo corta el sobre en diagonal, las mitades se van y salen las cartas boca abajo
  const t = reducido ? { corte: 0, mitades: 0, cartas: 0 } : { corte: 350, mitades: 650, cartas: 160 };
  setTimeout(() => dialogo.classList.add('cortando'), t.corte);
  setTimeout(() => dialogo.classList.add('abierto'), t.corte + 280);
  setTimeout(() => volteables.forEach((v, i) => setTimeout(() => v.classList.add('fuera'), i * t.cartas)), t.corte + t.mitades);
}

$('.cerrar-apertura').onclick = () => dialogo.close();
$('.otro').onclick = () => { dialogo.close(); abrir(); };
dialogo.addEventListener('close', pintar);
$('.sobre').addEventListener('click', abrir);

document.querySelectorAll('.filtros button').forEach(b => b.addEventListener('click', () => {
  filtro = b.dataset.filtro;
  document.querySelectorAll('.filtros button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarAlbum();
}));

await cargar();
// Los sobres canjeados con puntos del canal aparecen solos: se vuelve a mirar cada 45 s
setInterval(() => { if (info?.usuario && !dialogo.open && !document.hidden) cargar(); }, 45000);
