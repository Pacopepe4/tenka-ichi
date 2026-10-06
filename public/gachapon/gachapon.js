// Gachapon: entrar con Discord, abrir sobres y ver la colección
import { cargarClanes, logo } from '/comun.js';
import { iniciarDirecto } from '/directo.js';
import { imagenColeccion, imagenAlineacion, descargar, publicar } from '/compartir.js';
import { cartaHTML as carta, TIERS, claveTier, ROL, escapar } from '/carta.js';
import { revelarAlAsomar, cierreSuave } from '/efectos.js';

const $ = s => document.querySelector(s);
const pct = p => `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

const { clanes } = await cargarClanes();
const nombreClan = id => clanes.find(c => c.id === id)?.nombre || id;
const colorClan = id => clanes.find(c => c.id === id)?.color || 'var(--sumi-linea)';
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

// La carta la pinta carta.js, igual que en la portada y en el overlay
const cartaHTML = (c, cantidad = null) => carta(c, { cantidad, nombreClan });

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
    // Se entra con Discord. Twitch solo es otra forma de entrar donde no hay Discord (en local): con los dos, cada
    // uno vincula su Twitch a su cuenta para que los sobres de los puntos del canal le lleguen a ella
    cuenta.innerHTML = `<a class="boton-entrar" href="/auth/discord?volver=/gachapon/">Entrar con Discord</a>
      ${info.twitch && !info.discord ? '<a class="boton-entrar secundario" href="/auth/twitch?volver=/gachapon/">Entrar con Twitch</a>' : ''}
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
    : info.recompensa ? comoCanjear(u) : 'Más sobres: el staff los regala en premios y sorteos.';
  const quitar = $('.como-mas .desvincular');
  if (quitar) quitar.onclick = desvincularTwitch;
}

// Puntos del canal de Twitch: se ganan viendo el directo y se canjean allí por sobres. Para que el sobre llegue a esta
// colección, cada uno vincula su Twitch a su cuenta (una vez)
function comoCanjear(u) {
  const canal = `<a href="https://twitch.tv/${info.canal}" target="_blank" rel="noopener">twitch.tv/${info.canal}</a>`;
  const canje = `<b>${escapar(info.recompensa.titulo)}</b> por ${info.recompensa.coste} puntos del canal`;
  if (!u) return `Más sobres con los puntos del canal de ${canal}, que se ganan viendo el directo: entra, vincula tu Twitch y canjea ${canje}.`;
  if (u.twitch) return `Twitch vinculado: <b>${escapar(u.twitch.login)}</b>. Canjea ${canje} en ${canal} y el sobre te llega aquí en un minuto. <button type="button" class="desvincular">Desvincular</button>`;
  return `Más sobres con los puntos del canal, que se ganan viendo el directo: <a class="vincular" href="/auth/twitch/vincular">vincula tu Twitch</a> y canjea ${canje} en ${canal}.`;
}

async function desvincularTwitch() {
  const r = await fetch('/api/gacha/desvincular-twitch', { method: 'POST' }).then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web: prueba otra vez' }));
  if (!r.ok) return avisar(r.error);
  info.usuario = r.usuario;
  pintarCuenta();
}

// El álbum entra escalonado la primera vez y al cambiar de filtro, no cada vez que se refresca solo
let albumPintado = false;
function pintarAlbum(animar = !albumPintado) {
  const mias = new Map((info.usuario?.cartas || []).map(c => [c.id, c.cantidad]));
  const conSesion = Boolean(info.usuario);
  // Por tier; en cada tier, primero los jugadores (por clan) y después las BOOST
  const orden = [...info.catalogo].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)
    || (a.tipo === 'boost') - (b.tipo === 'boost') || (a.clan || '').localeCompare(b.clan || '') || a.nombre.localeCompare(b.nombre));
  const lista = orden.filter(c => filtro === 'todas' || (filtro === 'tengo' ? mias.get(c.id) : !mias.get(c.id)));
  const tengo = info.catalogo.filter(c => mias.get(c.id)).length;
  $('.progreso').textContent = conSesion ? `Tienes ${tengo} de ${info.catalogo.length} cartas.` : `${info.catalogo.length} cartas en total. Entra con Discord para empezar tu colección.`;
  $('.progreso').classList.toggle('con-barra', conSesion && info.catalogo.length > 0);
  $('.progreso').style.setProperty('--avance', info.catalogo.length ? tengo / info.catalogo.length : 0);
  let vacio = 'Todavía no hay cartas.';
  if (info.catalogo.length && filtro !== 'todas') vacio = !conSesion ? 'Entra con Discord para ver tu colección.' : filtro === 'tengo' ? 'Aún no tienes ninguna carta: abre un sobre.' : '¡Las tienes todas!';
  $('.album').innerHTML = lista.length ? lista.map(c => cartaHTML(c, conSesion ? (mias.get(c.id) || 0) : null)).join('') : `<p class="vacio">${vacio}</p>`;
  $('.album').classList.toggle('entrando', animar);
  $('.album').querySelectorAll('.carta-g').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 30)));
  albumPintado = true;
}

function pintarProbabilidades() {
  const cuantos = (t, tipo) => info.catalogo.filter(c => c.tier === t && c.tipo === tipo).length;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const hayS = cuantos('S+', 'boost') > 0;
  const pS = (info.probabilidades.S || 0) + (info.probabilidades['S+'] || 0);
  // La fila de la S+ sale cuando hay cartas BOOST S+; cada fila cuenta jugadores y BOOST
  const legado = info.catalogo.filter(c => c.tipo === 'legacy').length;
  $('.tabla-prob').innerHTML = TIERS.filter(t => t !== 'LEGACY' && (t !== 'S+' || hayS)).map(t => {
    const p = info.probabilidades[t] || 0, k = claveTier(t), j = cuantos(t, 'jugador'), b = cuantos(t, 'boost');
    const quienes = [j && plural(j, 'jugador', 'jugadores'), b && plural(b, 'BOOST', 'BOOST')].filter(Boolean).join(' y ') || '0 cartas';
    return `<div class="fila-prob" data-tier="${k}" style="--color-tier: var(--tier-${k})"><span class="letra">${t}</span>
      <span class="barra-prob"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
      <span class="cifra">${pct(p)}<small>${quienes}</small></span></div>`;
  }).join('') + (info.catalogo.length
    ? `<p class="resumen-prob">En cada sobre, la probabilidad de que salga al menos una S${hayS ? ' o una S+' : ''} es del ${pct(1 - (1 - pS) ** info.cartasPorSobre)}.</p>` : '')
    // Las LEGACY no están entre las tres del sobre: de vez en cuando sale una de regalo, como carta extra
    + (legado && info.probabilidadLegacy ? `<p class="resumen-prob prob-legacy"><b>LEGACY.</b> Aparte de sus ${info.cartasPorSobre} cartas, el ${pct(info.probabilidadLegacy)} de los sobres trae una carta extra del equipo Legacy (hay ${legado}). Son de colección: no se alinean en el fantasy.</p>` : '');
}

// ---------- fantasy ----------
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const puntosTexto = n => `${n.toLocaleString('es-ES')} ${n === 1 ? 'punto' : 'puntos'}`;
const cartaPorId = id => info.catalogo.find(c => c.id === id) || null;
const puntosDe = id => fantasia.jugadores.find(j => j.id === id)?.puntos || 0;
const alineacion = () => fantasia.yo?.alineacion || {};
// Las dos BOOST de la alineación: { carta, rol } (el rol del jugador con el que van) o null
const boostsDe = () => alineacion().boosts || Array(fantasia.boostsMaximos).fill(null);

function pintarFantasy() {
  const yo = fantasia.yo, caja = $('.alineacion');
  const estado = $('.estado-alineacion');
  if (!info.usuario) {
    estado.textContent = 'Entra con Discord y abre sobres para alinear a tus jugadores.';
  } else if (fantasia.cerrado) {
    estado.innerHTML = `Las alineaciones están <b>cerradas</b> mientras se juega la jornada. Llevas ${puntosTexto(yo.puntos)}${yo.puesto ? `, ${yo.puesto}.º en la clasificación` : ''}.`;
  } else {
    estado.innerHTML = yo.puesto ? `Llevas <b>${puntosTexto(yo.puntos)}</b>${yo.puntosBoost ? ` (${puntosTexto(yo.puntosBoost)} de tus BOOST)` : ''}, ${yo.puesto}.º en la clasificación. Pulsa un hueco para cambiar al jugador.`
      : 'Pulsa un hueco para elegir al jugador de ese rol entre tus cartas.';
  }
  const bloqueado = !info.usuario || fantasia.cerrado;
  const boosts = boostsDe();
  // La BOOST vinculada a cada jugador, para ponérsela debajo
  const boostDeRol = rol => { const b = boosts.find(x => x?.rol === rol); return b ? cartaPorId(b.carta) : null; };
  caja.innerHTML = ROLES.map(rol => {
    const carta = yo?.alineacion?.[rol] ? cartaPorId(yo.alineacion[rol]) : null, boost = carta ? boostDeRol(rol) : null;
    return `<button type="button" class="hueco-ali" data-rol="${rol}" ${bloqueado ? 'disabled' : ''}>
      <span class="rol-ali">${ROL[rol]}</span>
      ${carta ? cartaHTML(carta) : '<span class="vacio-ali">Elegir</span>'}
      ${carta ? `<span class="puntos-ali">${puntosTexto(puntosDe(carta.id))}</span>` : ''}
      ${boost ? `<span class="boost-ali" title="${escapar(boost.bonus?.texto)}">+ ${escapar(boost.nombre)} ${escapar(boost.bonus?.etiqueta)}</span>` : ''}</button>`;
  }).join('');
  caja.querySelectorAll('.hueco-ali:not(:disabled)').forEach(b => b.addEventListener('click', () => elegir(b.dataset.rol)));

  // Los huecos de BOOST: cada una se vincula a uno de los jugadores de arriba
  const cajaBoost = $('.alineacion-boost');
  cajaBoost.innerHTML = boosts.map((b, i) => {
    const carta = b ? cartaPorId(b.carta) : null, jugador = carta && yo?.alineacion?.[b.rol] ? cartaPorId(yo.alineacion[b.rol]) : null;
    return `<button type="button" class="hueco-ali" data-i="${i}" ${bloqueado ? 'disabled' : ''}>
      <span class="rol-ali">BOOST ${i + 1}</span>
      ${carta ? cartaHTML(carta) : '<span class="vacio-ali">Elegir</span>'}
      ${carta ? `<span class="puntos-ali">con ${escapar(jugador?.nombre || ROL[b.rol])}</span>` : ''}</button>`;
  }).join('');
  cajaBoost.querySelectorAll('.hueco-ali:not(:disabled)').forEach(b => b.addEventListener('click', () => elegirBoost(Number(b.dataset.i))));

  pintarClasificacion();
}

// La clasificación general o la de una jornada. Los tres primeros de cada jornada se llevan sobres
let jornadaVista = '';
function pintarClasificacion() {
  const jornadas = fantasia.jornadas || [];
  if (jornadaVista && !jornadas.includes(jornadaVista)) jornadaVista = '';
  const pestanas = $('.filtros-jornada');
  pestanas.hidden = !jornadas.length;
  pestanas.innerHTML = [['', 'General'], ...jornadas.map(j => [j, j])].map(([valor, texto]) =>
    `<button role="tab" aria-selected="${valor === jornadaVista}" data-jornada="${escapar(valor)}">${escapar(texto)}</button>`).join('');
  pestanas.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { jornadaVista = b.dataset.jornada; pintarClasificacion(); }));

  const filas = jornadaVista ? fantasia.clasificacionesJornada?.[jornadaVista] || [] : fantasia.clasificacion;
  const premio = jornadaVista ? fantasia.premios?.find(p => p.jornada === jornadaVista) : null;
  const sobresDe = puesto => premio?.ganadores.find(g => g.puesto === puesto)?.sobres || 0;
  $('.clasificacion-fantasy').innerHTML = filas.length
    ? filas.map(c => `<li class="${c.yo ? 'yo' : ''}"><span class="puesto">${c.puesto}</span><span class="quien">${escapar(c.nombre)}</span>
        <span class="cuanto">${c.puntos.toLocaleString('es-ES')}${jornadaVista
          ? (sobresDe(c.puesto) ? `<small>+${sobresDe(c.puesto)} ${sobresDe(c.puesto) === 1 ? 'sobre' : 'sobres'}</small>` : '')
          : fantasia.ultimaJornada ? `<small>${c.ultima.toLocaleString('es-ES')} en ${escapar(fantasia.ultimaJornada)}</small>` : ''}</span></li>`).join('')
    : '<li class="vacio">La clasificación empieza con la primera jornada.</li>';
  const [uno, dos, tres] = fantasia.sobresPremio || [];
  $('.premios-fantasy').textContent = uno || dos || tres
    ? `Al terminar cada jornada, sus tres primeros se llevan sobres: ${uno} el 1.º, ${dos} el 2.º y ${tres} el 3.º.`
      + (jornadaVista ? (premio ? ' Los de esta jornada ya están repartidos.' : ' Los de esta jornada se reparten cuando termine.') : '')
    : '';
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

// Dejar un hueco de rol vacío también suelta la BOOST que llevaba ese jugador
function guardarHueco(rol, carta) {
  return enviarAlineacion({ ...alineacion(), [rol]: carta, boosts: boostsDe().map(b => (!carta && b?.rol === rol ? null : b)) });
}

// Elegir una BOOST entre las que tienes (sin pasarte de las copias que tienes) y luego el jugador con el que va
function elegirBoost(i) {
  const mias = new Map((info.usuario?.cartas || []).map(c => [c.id, c.cantidad]));
  const boosts = boostsDe();
  const enOtra = id => boosts.filter((b, j) => j !== i && b?.carta === id).length;
  const opciones = info.catalogo.filter(c => c.tipo === 'boost' && (mias.get(c.id) || 0) > enOtra(c.id));
  $('#titulo-elegir').textContent = `Elige tu BOOST ${i + 1}`;
  $('.elegir .opciones').innerHTML = opciones.length
    ? opciones.map(c => `<button type="button" class="opcion" data-id="${c.id}" aria-pressed="${c.id === boosts[i]?.carta}">${cartaHTML(c, mias.get(c.id))}</button>`).join('')
    : '<p class="sin-cartas">No tienes ninguna carta BOOST para este hueco. Abre sobres para conseguirla.</p>';
  dialogoElegir.querySelectorAll('.opcion').forEach(b => b.addEventListener('click', () => vincularBoost(i, b.dataset.id)));
  dialogoElegir.querySelector('.quitar').onclick = () => guardarBoost(i, null, null);
  dialogoElegir.querySelector('.cancelar').onclick = () => dialogoElegir.close();
  dialogoElegir.showModal();
}

function vincularBoost(i, id) {
  const boost = cartaPorId(id), boosts = boostsDe(), ali = alineacion();
  const ocupados = new Set(boosts.filter((b, j) => j !== i && b).map(b => b.rol));
  const libres = ROLES.filter(rol => ali[rol] && !ocupados.has(rol));
  $('#titulo-elegir').textContent = `¿Con quién juega ${boost.nombre}?`;
  $('.elegir .opciones').innerHTML = `<p class="condicion-boost">${escapar(boost.bonus?.texto)}. Cada jugador solo puede llevar una BOOST.</p>`
    + (libres.length
      ? libres.map(rol => `<button type="button" class="opcion-rol" data-rol="${rol}" aria-pressed="${boosts[i]?.carta === id && boosts[i]?.rol === rol}">
          <b>${escapar(cartaPorId(ali[rol])?.nombre || rol)}</b><span>${ROL[rol]}</span></button>`).join('')
      : '<p class="sin-cartas">Primero alinea a algún jugador que no lleve ya otra BOOST.</p>');
  dialogoElegir.querySelectorAll('.opcion-rol').forEach(b => b.addEventListener('click', () => guardarBoost(i, id, b.dataset.rol)));
}

function guardarBoost(i, carta, rol) {
  return enviarAlineacion({ ...alineacion(), boosts: boostsDe().map((b, j) => (j === i ? (carta ? { carta, rol } : null) : b)) });
}

async function enviarAlineacion(slots) {
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
  $('.tabla-puntos tbody').innerHTML = lista.length ? lista.map(j => `<tr style="--color:${colorClan(j.clan)}">
      <td><span class="jugador-celda"><img src="${logo(j.clan)}" alt=""><span><b>${escapar(j.nombre)}</b><small>${ROL[j.rol]} de ${escapar(nombreClan(j.clan))}</small></span></span></td>
      <td>${j.tier ? `<span class="letra-tier" data-tier="${j.tier}" style="--color-tier: var(--tier-${j.tier})">${j.tier}</span>` : '–'}</td>
      <td>${j.partidas}</td><td class="total">${j.puntos.toLocaleString('es-ES')}</td></tr>`).join('')
    : '<tr class="vacio"><td colspan="4">Todavía no hay jugadores en las plantillas.</td></tr>';
}

// Las reglas vienen del servidor ya escritas (server/puntuacion.js)
function pintarReglas() {
  $('.reglas').innerHTML = fantasia.reglas.map(r => `<li><b>${escapar(r.puntos)}</b>${escapar(r.texto)}</li>`).join('');
}

document.querySelectorAll('.filtros-rol button').forEach(b => b.addEventListener('click', () => {
  filtroRol = b.dataset.rol;
  document.querySelectorAll('.filtros-rol button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarPuntos();
}));

function pintar() {
  pintarCompartir();
  pintarFundir();
  $('.canje').hidden = !info.usuario;
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

// Todas las cartas salen boca abajo con el mismo reverso: no se sabe si es Jugador o BOOST, ni su tier,
// hasta darle la vuelta. Sin el reverso dibujado, el sol partido sobre tinta
const dorso = () => (info.reverso
  ? `<div class="cara dorso con-reverso"><img src="${escapar(info.reverso)}" alt=""></div>`
  : '<div class="cara dorso"><img src="/marca/sol-partido-sin-fondo.png" alt=""></div>');

// Las cartas grandes se celebran al descubrirlas: chispas alrededor de la carta y un fogonazo de su color en la
// escena, con centro en la carta. Cuántas chispas, según la tier; las demás cartas se descubren sin más
const CHISPAS = { SP: 24, LEGACY: 24, S: 12 };
function celebrar(v) {
  const n = CHISPAS[v.dataset.tier];
  if (!n) return;
  const caja = document.createElement('span');
  caja.className = 'chispas';
  caja.setAttribute('aria-hidden', 'true');
  caja.innerHTML = Array.from({ length: n }, (_, i) =>
    `<i style="--a:${Math.round(360 / n * i + Math.random() * 14)}deg; --d:${Math.round(70 + Math.random() * 130)}px; --t:${Math.round(Math.random() * 180)}ms"></i>`).join('');
  v.appendChild(caja);
  setTimeout(() => caja.remove(), 2400);
  const escena = $('.escena'), r = v.getBoundingClientRect(), e = escena.getBoundingClientRect();
  escena.style.setProperty('--fx', `${((r.left + r.width / 2 - e.left) / e.width * 100).toFixed(1)}%`);
  escena.style.setProperty('--fy', `${((r.top + r.height / 2 - e.top) / e.height * 100).toFixed(1)}%`);
  escena.dataset.fogonazo = v.dataset.tier;
  escena.classList.remove('fogonazo');
  void escena.offsetWidth;   // para que el fogonazo vuelva a empezar si ya había uno
  escena.classList.add('fogonazo');
}

function mostrarApertura(cartas) {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  dialogo.classList.remove('cortando', 'abierto');
  $('.escena').classList.remove('fogonazo');
  // La carta extra (una LEGACY de regalo, muy de vez en cuando) sale la última, con su aviso encima
  $('.reparto').innerHTML = cartas.map((c, i) => `<div class="volteable${c.extra ? ' extra' : ''}" style="--giro: ${(i - (cartas.length - 1) / 2) * 7}deg" data-tier="${claveTier(c.tier)}" tabindex="0" role="button" aria-label="${c.extra ? 'Carta extra' : `Carta ${i + 1}`}: dale la vuelta">
    ${c.extra ? '<span class="aviso-extra">Carta extra</span>' : ''}<div class="giro">${dorso()}<div class="cara frente">${cartaHTML(c)}</div></div></div>`).join('');
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
    if (v.classList.contains('girada')) return;
    v.classList.add('girada');
    const c = cartas[volteables.indexOf(v)];
    v.setAttribute('aria-label', `${c.nombre}, tier ${c.tier}`);
    if (!reducido) celebrar(v);
    comprobar();
  };
  volteables.forEach(v => {
    v.onclick = () => girar(v);
    v.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); girar(v); } };
  });
  $('.descubrir').onclick = () => volteables.filter(v => !v.classList.contains('girada')).forEach((v, i) => setTimeout(() => girar(v), reducido ? 0 : i * 420));

  // El sobre llega, el trazo lo corta en diagonal, las mitades se van y salen las cartas boca abajo
  const t = reducido ? { corte: 0, mitades: 0, cartas: 0 } : { corte: 700, mitades: 620, cartas: 170 };
  setTimeout(() => dialogo.classList.add('cortando'), t.corte);
  setTimeout(() => dialogo.classList.add('abierto'), t.corte + 280);
  setTimeout(() => volteables.forEach((v, i) => setTimeout(() => v.classList.add('fuera'), i * t.cartas)), t.corte + t.mitades);
}

$('.cerrar-apertura').onclick = () => dialogo.close();
$('.otro').onclick = () => { dialogo.close(); abrir(); };
dialogo.addEventListener('close', pintar);
$('.sobre').addEventListener('click', abrir);

document.querySelectorAll('.coleccion .filtros button').forEach(b => b.addEventListener('click', () => {
  filtro = b.dataset.filtro;
  document.querySelectorAll('.coleccion .filtros button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarAlbum(true);
}));

await cargar();
revelarAlAsomar('.titulo-seccion, .fantasy-rejilla, .tabla-puntos, .tabla-prob, .reglas');
cierreSuave([dialogoElegir, document.querySelector('.fundir')]);
// Los sobres canjeados con puntos del canal aparecen solos: se vuelve a mirar cada 45 s
setInterval(() => { if (info?.usuario && !dialogo.open && !document.hidden) cargar(); }, 45000);

// ---------- compartir la colección y la alineación: descargar la imagen o publicarla en Discord ----------
function pintarCompartir() {
  document.querySelectorAll('.compartir').forEach(caja => {
    caja.hidden = !info.usuario;
    caja.querySelector('.publicar').hidden = !info.publicarDiscord;
  });
}
async function imagenDe(que) {
  const mias = new Map((info.usuario?.cartas || []).map(c => [c.id, c.cantidad]));
  if (que === 'coleccion') {
    return imagenColeccion({ nombre: info.usuario.nombre, total: info.catalogo.length, nombreClan,
      cartas: info.catalogo.filter(c => mias.get(c.id)).map(c => ({ ...c, cantidad: mias.get(c.id) })) });
  }
  const ali = fantasia.yo?.alineacion || {};
  return imagenAlineacion({ nombre: info.usuario.nombre, nombreClan, total: fantasia.yo?.puntos || 0, puesto: fantasia.yo?.puesto || null,
    alineacion: Object.fromEntries(ROLES.map(r => [r, ali[r] ? cartaPorId(ali[r]) : null])),
    boosts: Object.fromEntries(boostsDe().filter(Boolean).map(b => [b.rol, cartaPorId(b.carta)])),
    puntos: Object.fromEntries(ROLES.map(r => [r, ali[r] ? puntosDe(ali[r]) : 0])) });
}
document.querySelectorAll('.compartir').forEach(caja => {
  const que = caja.dataset.que, estado = caja.querySelector('.estado-compartir');
  const hacer = async (boton, accion) => {
    boton.disabled = true;
    estado.textContent = 'Preparando la imagen…';
    try { estado.textContent = await accion(await imagenDe(que)); }
    catch { estado.textContent = 'No se pudo preparar la imagen'; }
    boton.disabled = false;
    setTimeout(() => { estado.textContent = ''; }, 6000);
  };
  caja.querySelector('.descargar').onclick = e => hacer(e.currentTarget, async img => { descargar(img, `tenka-ichi-${que}.jpg`); return 'Imagen descargada'; });
  caja.querySelector('.publicar').onclick = e => hacer(e.currentTarget, async img => { const r = await publicar(que, img); return r.ok ? '¡Publicada en Discord!' : r.error; });
});

// ---------- código del directo: el que sale en pantalla durante la retransmisión ----------
$('.canje').addEventListener('submit', async e => {
  e.preventDefault();
  const campo = $('#codigo'), estado = $('.canje-estado'), boton = e.target.querySelector('button');
  if (!campo.value.trim()) return campo.focus();
  boton.disabled = true;
  const r = await fetch('/api/gacha/canjear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: campo.value }) })
    .then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  boton.disabled = false;
  estado.classList.toggle('mal', !r.ok);
  if (!r.ok) { estado.textContent = r.error; return; }
  campo.value = '';
  estado.textContent = r.sobres === 1 ? '¡Código canjeado! Tienes un sobre más.' : `¡Código canjeado! Tienes ${r.sobres} sobres más.`;
  info.usuario = r.usuario;
  pintarCuenta();
});

// ---------- fundir repetidas: cada 5 copias que sobran, un sobre ----------
// De cada carta se queda al menos una copia; de las BOOST, también las que estén puestas en la alineación
const dialogoFundir = $('.fundir');
let aFundir = new Map();
function sobrantes() {
  const enUso = boostsDe().filter(Boolean).map(b => b.carta);
  return (info.usuario?.cartas || []).map(c => ({ carta: cartaPorId(c.id), cantidad: c.cantidad,
    sobran: c.cantidad - Math.max(1, enUso.filter(id => id === c.id).length) })).filter(x => x.carta && x.sobran > 0)
    .sort((a, b) => TIERS.indexOf(b.carta.tier) - TIERS.indexOf(a.carta.tier) || (a.carta.tipo === 'boost') - (b.carta.tipo === 'boost') || a.carta.nombre.localeCompare(b.carta.nombre));
}
function pintarFundir() {
  const boton = $('.fundir-abrir');
  boton.hidden = !info.usuario || !sobrantes().length;
}
function pintarCuentaFundir() {
  const n = info.repetidasPorSobre, total = [...aFundir.values()].reduce((s, x) => s + x, 0), sobres = Math.floor(total / n), faltan = (n - total % n) % n;
  $('.cuenta-fundir').textContent = !total ? `Elige ${n} cartas` : faltan ? `${total} ${total === 1 ? 'elegida' : 'elegidas'}: ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`} para ${sobres + 1} ${sobres + 1 === 1 ? 'sobre' : 'sobres'}`
    : `${total} cartas por ${sobres} ${sobres === 1 ? 'sobre' : 'sobres'}`;
  const confirmar = dialogoFundir.querySelector('.confirmar');
  confirmar.disabled = !total || Boolean(faltan);
  confirmar.textContent = total && !faltan ? `Fundir por ${sobres} ${sobres === 1 ? 'sobre' : 'sobres'}` : 'Fundir';
  dialogoFundir.querySelectorAll('.opcion-fundir').forEach(o => {
    const elegidas = aFundir.get(o.dataset.id) || 0;
    o.querySelector('output').textContent = elegidas;
    o.classList.toggle('elegida', elegidas > 0);
    o.querySelector('.menos').disabled = !elegidas;
    o.querySelector('.mas').disabled = elegidas >= Number(o.dataset.sobran);
  });
}
function abrirFundir() {
  const lista = sobrantes(), n = info.repetidasPorSobre;
  aFundir = new Map();
  $('.nota-fundir').textContent = `Cada ${n} cartas repetidas que fundas se convierten en un sobre nuevo. De cada carta te quedas siempre una copia, y las BOOST que tienes en la alineación no se tocan.`;
  dialogoFundir.querySelector('.opciones').innerHTML = lista.map(x => `<div class="opcion-fundir" data-id="${escapar(x.carta.id)}" data-sobran="${x.sobran}">
    ${cartaHTML(x.carta, x.cantidad)}
    <div class="contador"><button type="button" class="menos" aria-label="Fundir una menos de ${escapar(x.carta.nombre)}">−</button><output>0</output><button type="button" class="mas" aria-label="Fundir una más de ${escapar(x.carta.nombre)}">+</button></div>
    <small>${x.sobran === 1 ? 'Te sobra 1' : `Te sobran ${x.sobran}`}</small></div>`).join('');
  dialogoFundir.querySelectorAll('.opcion-fundir').forEach(o => {
    const cambiar = d => { aFundir.set(o.dataset.id, Math.max(0, Math.min(Number(o.dataset.sobran), (aFundir.get(o.dataset.id) || 0) + d))); pintarCuentaFundir(); };
    o.querySelector('.menos').onclick = () => cambiar(-1);
    o.querySelector('.mas').onclick = () => cambiar(1);
  });
  // «Elegir por mí»: las de peor tier primero, hasta el múltiplo de 5 más alto que se pueda
  dialogoFundir.querySelector('.solas').onclick = () => {
    const total = lista.reduce((s, x) => s + x.sobran, 0);
    let quedan = total - total % n;
    aFundir = new Map();
    for (const x of lista) { const tomar = Math.min(x.sobran, quedan); if (tomar) aFundir.set(x.carta.id, tomar); quedan -= tomar; }
    pintarCuentaFundir();
  };
  pintarCuentaFundir();
  dialogoFundir.showModal();
}
$('.fundir-abrir').onclick = abrirFundir;
dialogoFundir.querySelector('.cancelar').onclick = () => dialogoFundir.close();
dialogoFundir.querySelector('.confirmar').onclick = async e => {
  e.currentTarget.disabled = true;
  const r = await fetch('/api/gacha/fundir', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartas: Object.fromEntries([...aFundir].filter(([, x]) => x > 0)) }) }).then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  if (!r.ok) { $('.cuenta-fundir').textContent = r.error; e.currentTarget.disabled = false; return; }
  info.usuario = r.usuario;
  dialogoFundir.close();
  pintar();
  avisar(r.sobres === 1 ? `Has fundido ${r.cartas} cartas: tienes un sobre más.` : `Has fundido ${r.cartas} cartas: tienes ${r.sobres} sobres más.`);
};
