// Gachapon: entrar con Discord, abrir sobres y ver la colección. Aquí van la cuenta, las probabilidades, los puntos de
// los jugadores, fundir, compartir y el arranque; lo demás, en sus módulos (estado.js dice cuál es cuál)
import { logo } from '/comun.js';
import { iniciarDirecto } from '/directo.js';
import { imagenColeccion, imagenAlineacion, descargar, publicar } from '/compartir.js';
import { TIERS, claveTier, ROL, escapar } from '/carta.js';
import { revelarAlAsomar, cierreSuave } from '/efectos.js';
import { $, est, nombreClan, colorClan, cartaHTML, cartaPorId, misCartas, ganchos } from './estado.js';
import { aperturaAbierta } from './apertura.js';
import { pintarAlbum } from './album.js';
import { pintarFantasy, dialogoElegir, ROLES, puntosDe, boostsDe } from './alineacion.js';

const pct = p => `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
let filtroRol = '';

iniciarDirecto();

async function cargar() {
  [est.info, est.fantasia] = await Promise.all([
    fetch('/api/gacha', { cache: 'no-store' }).then(r => r.json()),
    fetch('/api/fantasy', { cache: 'no-store' }).then(r => r.json()),
  ]);
  pintar();
}

function avisar(texto) {
  const p = $('.como-mas');
  p.textContent = texto;
  p.style.color = 'var(--shu-claro)';
  setTimeout(() => { p.style.color = ''; pintarCuenta(); }, 4000);
}

function pintarCuenta() {
  const info = est.info, u = info.usuario, cuenta = $('.cuenta'), sobre = $('.sobre');
  const listos = info.sobresListos;
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
    const puede = u.sobres > 0 && listos;
    cuenta.innerHTML = `<div class="yo">${u.avatar ? `<img src="${escapar(u.avatar)}" alt="">` : ''}
        <div><b>${escapar(u.nombre)}</b><span>${u.sobres === 1 ? 'Tienes 1 sobre' : `Tienes ${u.sobres} sobres`}</span></div></div>
      <button class="salir" type="button">Salir</button>`;
    sobre.disabled = !puede;
    $('.sobre-contador').textContent = u.sobres ? `×${u.sobres}` : '';
    cuenta.querySelector('.salir').onclick = async () => { await fetch('/auth/salir', { method: 'POST' }); cargar(); };
  }
  // Sin cartas de Jugador los sobres esperan: solo con las BOOST saldrían todas de las mejores
  $('.como-mas').innerHTML = (listos ? '' : '<b>Los sobres se abren cuando salgan las cartas de los jugadores:</b> el staff está preparando la tier list. ')
    + ([info.recompensa && comoCanjear(u, TWITCH), info.recompensaKick && comoCanjear(u, KICK)].filter(Boolean).join('<br>')
      || 'Más sobres: el staff los regala en premios y sorteos.');
  $('.como-mas .desvincular[data-de="twitch"]')?.addEventListener('click', () => desvincular('twitch'));
  $('.como-mas .desvincular[data-de="kick"]')?.addEventListener('click', () => desvincular('kick'));
}

// Puntos del canal de Twitch y de Kick: se ganan viendo el directo y se canjean allí por sobres (en Twitch, «Sobre de
// Gokudō»; en Kick, «Omamori»). Para que el sobre llegue a esta colección, cada uno vincula su cuenta (una vez)
const TWITCH = { clave: 'twitch', nombre: 'Twitch', canal: () => `twitch.tv/${est.info.canal}`, recompensa: () => est.info.recompensa };
// En Kick, además, las subs, las subs regaladas y los kicks dan sobres (server/kick-bot.js)
const KICK = { clave: 'kick', nombre: 'Kick', canal: () => `kick.com/${est.info.canalKick}`, recompensa: () => est.info.recompensaKick,
  extra: ' Suscribirte, regalar subs o mandar kicks también da sobres.' };
function comoCanjear(u, p) {
  const canal = `<a href="https://${p.canal()}" target="_blank" rel="noopener">${p.canal()}</a>`;
  const r = p.recompensa(), canje = `<b>${escapar(r.titulo)}</b> por ${r.coste} puntos del canal`, extra = p.extra || '';
  if (!u) return `Más sobres con los puntos del canal de ${canal}, que se ganan viendo el directo: entra, vincula tu ${p.nombre} y canjea ${canje}.${extra}`;
  if (u[p.clave]) return `${p.nombre} vinculado: <b>${escapar(u[p.clave].login)}</b>. Canjea ${canje} en ${canal} y el sobre te llega aquí en un minuto.${extra} <button type="button" class="desvincular" data-de="${p.clave}">Desvincular</button>`;
  return `Más sobres con los puntos del canal de ${canal}, que se ganan viendo el directo: <a class="vincular" href="/auth/${p.clave}/vincular">vincula tu ${p.nombre}</a> y canjea ${canje}.${extra}`;
}

async function desvincular(de) {
  const r = await fetch(`/api/gacha/desvincular-${de}`, { method: 'POST' }).then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web: prueba otra vez' }));
  if (!r.ok) return avisar(r.error);
  est.info.usuario = r.usuario;
  pintarCuenta();
}

function pintarProbabilidades() {
  const info = est.info;
  const cuantos = (t, tipo) => info.catalogo.filter(c => c.tier === t && c.tipo === tipo).length;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  // Mientras los sobres no se abren (faltan las cartas de Jugador) se enseña el reparto con el que van a salir
  const listos = info.sobresListos, prob = t => (listos ? info.probabilidades : info.reparto)[t] || 0;
  const hayS = cuantos('S+', 'boost') > 0;
  const pS = prob('S') + prob('S+');
  // La fila de la S+ sale cuando hay cartas BOOST S+; cada fila cuenta jugadores y BOOST
  const legado = info.catalogo.filter(c => c.tipo === 'legacy').length;
  $('.tabla-prob').innerHTML = TIERS.filter(t => t !== 'LEGACY' && (t !== 'S+' || hayS)).map(t => {
    const p = prob(t), k = claveTier(t), j = cuantos(t, 'jugador'), b = cuantos(t, 'boost');
    const quienes = [j && plural(j, 'jugador', 'jugadores'), b && plural(b, 'BOOST', 'BOOST')].filter(Boolean).join(' y ') || (listos ? '0 cartas' : 'por llegar');
    return `<div class="fila-prob" data-tier="${k}" style="--color-tier: var(--tier-${k})"><span class="letra">${t}</span>
      <span class="barra-prob"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
      <span class="cifra">${pct(p)}<small>${quienes}</small></span></div>`;
  }).join('') + (listos ? '' : '<p class="resumen-prob">Los sobres todavía no se abren: así saldrán las cartas cuando estén las de los jugadores.</p>')
    + `<p class="resumen-prob">En cada sobre, la probabilidad de que salga al menos una S${hayS ? ' o una S+' : ''} es del ${pct(1 - (1 - pS) ** info.cartasPorSobre)}.</p>`
    // Las LEGACY no están entre las cartas del sobre: de vez en cuando sale una de regalo, como carta extra
    + (legado && info.probabilidadLegacy ? `<p class="resumen-prob prob-legacy"><b>LEGACY.</b> Aparte de sus ${info.cartasPorSobre} cartas, el ${pct(info.probabilidadLegacy)} de los sobres trae una carta extra del equipo Legacy (hay ${legado}). Son de colección: no se alinean en el fantasy.</p>` : '');
}

function pintarPuntos() {
  const lista = est.fantasia.jugadores.filter(j => !filtroRol || j.rol === filtroRol);
  $('.tabla-puntos tbody').innerHTML = lista.length ? lista.map(j => `<tr style="--color:${colorClan(j.clan)}">
      <td><span class="jugador-celda"><img src="${logo(j.clan)}" alt=""><span><b>${escapar(j.nombre)}</b><small>${ROL[j.rol]} de ${escapar(nombreClan(j.clan))}</small></span></span></td>
      <td>${j.tier ? `<span class="letra-tier" data-tier="${j.tier}" style="--color-tier: var(--tier-${j.tier})">${j.tier}</span>` : '–'}</td>
      <td>${j.partidas}</td><td class="total">${j.puntos.toLocaleString('es-ES')}</td></tr>`).join('')
    : '<tr class="vacio"><td colspan="4">Todavía no hay jugadores en las plantillas.</td></tr>';
}

// Las reglas vienen del servidor ya escritas (server/puntuacion.js)
function pintarReglas() {
  $('.reglas').innerHTML = est.fantasia.reglas.map(r => `<li><b>${escapar(r.puntos)}</b>${escapar(r.texto)}</li>`).join('');
}

document.querySelectorAll('.filtros-rol button').forEach(b => b.addEventListener('click', () => {
  filtroRol = b.dataset.rol;
  document.querySelectorAll('.filtros-rol button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintarPuntos();
}));

function pintar() {
  pintarCompartir();
  pintarFundir();
  $('.canje').hidden = !est.info.usuario;
  pintarCuenta();
  pintarFantasy();
  pintarAlbum();
  pintarPuntos();
  pintarProbabilidades();
  pintarReglas();
}

Object.assign(ganchos, { pintar, avisar, cargar });

await cargar();
revelarAlAsomar('.titulo-seccion, .fantasy-rejilla, .tabla-puntos, .tabla-prob, .reglas');
cierreSuave([dialogoElegir, document.querySelector('.fundir')]);
// Los sobres canjeados con puntos del canal aparecen solos: se vuelve a mirar cada 45 s
setInterval(() => { if (est.info?.usuario && !aperturaAbierta() && !document.hidden) cargar(); }, 45000);

// ---------- compartir la colección y la alineación: descargar la imagen o publicarla en Discord ----------
function pintarCompartir() {
  document.querySelectorAll('.compartir').forEach(caja => {
    caja.hidden = !est.info.usuario;
    caja.querySelector('.publicar').hidden = !est.info.publicarDiscord;
  });
}
async function imagenDe(que) {
  const info = est.info, mias = misCartas();
  if (que === 'coleccion') {
    // La colección son las de jugador, BOOST y LEGACY: los jefes y las conmemorativas son premios aparte
    const coleccion = info.catalogo.filter(c => ['jugador', 'boost', 'legacy'].includes(c.tipo));
    return imagenColeccion({ nombre: info.usuario.nombre, total: coleccion.length, nombreClan,
      cartas: coleccion.filter(c => mias.get(c.id)).map(c => ({ ...c, cantidad: mias.get(c.id) })) });
  }
  const yo = est.fantasia.yo, ali = yo?.alineacion || {};
  return imagenAlineacion({ nombre: info.usuario.nombre, nombreClan, total: yo?.puntos || 0, puesto: yo?.puesto || null,
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
  caja.querySelector('.descargar').onclick = e => hacer(e.currentTarget, async img => { descargar(img, `gokudo-${que}.jpg`); return 'Imagen descargada'; });
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
  est.info.usuario = r.usuario;
  pintarCuenta();
});

// ---------- fundir repetidas: por una tirada o para mejorar de tier ----------
// Dos maneras (pestañas del diálogo): cada est.info.repetidasPorSobre (5) repetidas cualesquiera, una tirada; o cada
// est.info.repetidasPorMejora (3) repetidas de la misma tier, una carta al azar de la tier siguiente (D→C… A→S).
// De cada carta se queda al menos una copia; de las BOOST, también las que estén puestas en la alineación
const dialogoFundir = $('.fundir');
let aFundir = new Map(), modoFundir = 'sobre', tierFundir = null;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
function sobrantes() {
  const enUso = boostsDe().filter(Boolean).map(b => b.carta);
  return (est.info.usuario?.cartas || []).map(c => ({ carta: cartaPorId(c.id), cantidad: c.cantidad,
    sobran: c.cantidad - Math.max(1, enUso.filter(id => id === c.id).length) })).filter(x => x.carta && x.sobran > 0)
    .sort((a, b) => TIERS.indexOf(b.carta.tier) - TIERS.indexOf(a.carta.tier) || (a.carta.tipo === 'boost') - (b.carta.tipo === 'boost') || a.carta.nombre.localeCompare(b.carta.nombre));
}
// Las que se pueden mejorar: de jugador o BOOST y de una tier que tenga siguiente
const mejorables = () => sobrantes().filter(x => ['jugador', 'boost'].includes(x.carta.tipo) && est.info.tierSiguiente?.[x.carta.tier]);
function pintarFundir() {
  const boton = $('.fundir-abrir');
  boton.hidden = !est.info.usuario || !sobrantes().length;
}
const enLista = () => (modoFundir === 'sobre' ? sobrantes() : mejorables().filter(x => x.carta.tier === tierFundir));
const cuantasPor = () => (modoFundir === 'sobre' ? est.info.repetidasPorSobre : est.info.repetidasPorMejora);
function pintarCuentaFundir() {
  const n = cuantasPor(), total = [...aFundir.values()].reduce((s, x) => s + x, 0), salen = Math.floor(total / n), faltan = (n - total % n) % n;
  const premio = k => (modoFundir === 'sobre' ? plural(k, 'tirada', 'tiradas') : `${plural(k, 'carta', 'cartas')} de tier ${est.info.tierSiguiente[tierFundir]}`);
  $('.cuenta-fundir').textContent = modoFundir === 'tier' && !tierFundir ? 'Elige una tier'
    : !total ? `Elige ${n} cartas` : faltan ? `${plural(total, 'elegida', 'elegidas')}: ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`} para ${premio(salen + 1)}`
      : `${total} cartas por ${premio(salen)}`;
  const confirmar = dialogoFundir.querySelector('.confirmar');
  confirmar.disabled = !total || Boolean(faltan);
  confirmar.textContent = total && !faltan ? `${modoFundir === 'sobre' ? 'Fundir' : 'Mejorar'} por ${premio(salen)}` : modoFundir === 'sobre' ? 'Fundir' : 'Mejorar';
  dialogoFundir.querySelectorAll('.opcion-fundir').forEach(o => {
    const elegidas = aFundir.get(o.dataset.id) || 0;
    o.querySelector('output').textContent = elegidas;
    o.classList.toggle('elegida', elegidas > 0);
    o.querySelector('.menos').disabled = !elegidas;
    o.querySelector('.mas').disabled = elegidas >= Number(o.dataset.sobran);
  });
}
function pintarOpcionesFundir() {
  const lista = enLista(), n = cuantasPor();
  aFundir = new Map();
  dialogoFundir.querySelector('.confirmar').hidden = false;
  dialogoFundir.querySelector('.solas').hidden = false;
  dialogoFundir.querySelector('.cancelar').textContent = 'Cancelar';
  dialogoFundir.querySelectorAll('.modo-fundir button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.modo === modoFundir)));
  // En «mejorar», primero la tier: cuántas te sobran de cada una
  const porTier = new Map();
  for (const x of mejorables()) porTier.set(x.carta.tier, (porTier.get(x.carta.tier) || 0) + x.sobran);
  const tiers = dialogoFundir.querySelector('.tiers-fundir');
  tiers.hidden = modoFundir !== 'tier';
  tiers.innerHTML = Object.keys(est.info.tierSiguiente || {}).map(t => `<button type="button" role="tab" data-tier="${t}" aria-selected="${t === tierFundir}" ${porTier.get(t) >= n ? '' : 'disabled'}
      style="--color-tier: var(--tier-${claveTier(t)})"><b>${t}</b> → ${est.info.tierSiguiente[t]}<small>${porTier.get(t) ? `te sobran ${porTier.get(t)}` : 'no te sobra ninguna'}</small></button>`).join('');
  tiers.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { tierFundir = b.dataset.tier; pintarOpcionesFundir(); }));
  $('.nota-fundir').textContent = modoFundir === 'sobre'
    ? `Cada ${n} cartas repetidas que fundas se convierten en una tirada. De cada carta te quedas siempre una copia, y las BOOST que tienes en la alineación no se tocan.`
    : `Cada ${n} repetidas de la misma tier se convierten en una carta al azar de la tier siguiente. De cada carta te quedas siempre una copia; las S, las S+ y las LEGACY no se mejoran.`;
  dialogoFundir.querySelector('.opciones').innerHTML = modoFundir === 'tier' && !tierFundir ? ''
    : lista.length ? lista.map(x => `<div class="opcion-fundir" data-id="${escapar(x.carta.id)}" data-sobran="${x.sobran}">
    ${cartaHTML(x.carta, x.cantidad)}
    <div class="contador"><button type="button" class="menos" aria-label="Fundir una menos de ${escapar(x.carta.nombre)}">−</button><output>0</output><button type="button" class="mas" aria-label="Fundir una más de ${escapar(x.carta.nombre)}">+</button></div>
    <small>${x.sobran === 1 ? 'Te sobra 1' : `Te sobran ${x.sobran}`}</small></div>`).join('')
      : '<p class="sin-cartas">No te sobra ninguna de esta tier.</p>';
  dialogoFundir.querySelectorAll('.opcion-fundir').forEach(o => {
    const cambiar = d => { aFundir.set(o.dataset.id, Math.max(0, Math.min(Number(o.dataset.sobran), (aFundir.get(o.dataset.id) || 0) + d))); pintarCuentaFundir(); };
    o.querySelector('.menos').onclick = () => cambiar(-1);
    o.querySelector('.mas').onclick = () => cambiar(1);
  });
  // «Elegir por mí»: las de peor tier primero (o las de la tier elegida), hasta el múltiplo más alto que se pueda
  dialogoFundir.querySelector('.solas').onclick = () => {
    const total = lista.reduce((s, x) => s + x.sobran, 0);
    let quedan = total - total % n;
    aFundir = new Map();
    for (const x of lista) { const tomar = Math.min(x.sobran, quedan); if (tomar) aFundir.set(x.carta.id, tomar); quedan -= tomar; }
    pintarCuentaFundir();
  };
  pintarCuentaFundir();
}
function abrirFundir() {
  modoFundir = 'sobre';
  tierFundir = null;
  pintarOpcionesFundir();
  dialogoFundir.showModal();
}
dialogoFundir.querySelectorAll('.modo-fundir button').forEach(b => b.addEventListener('click', () => { modoFundir = b.dataset.modo; tierFundir = null; pintarOpcionesFundir(); }));
$('.fundir-abrir').onclick = abrirFundir;
dialogoFundir.querySelector('.cancelar').onclick = () => dialogoFundir.close();
// Al cerrar después de mejorar, la página se repinta con las cartas nuevas
dialogoFundir.addEventListener('close', () => { if (dialogoFundir.dataset.mejorado) { delete dialogoFundir.dataset.mejorado; pintar(); } });
dialogoFundir.querySelector('.confirmar').onclick = async e => {
  e.currentTarget.disabled = true;
  const sobre = modoFundir === 'sobre';
  const r = await fetch(sobre ? '/api/gacha/fundir' : '/api/gacha/fundir-tier', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartas: Object.fromEntries([...aFundir].filter(([, x]) => x > 0)) }) }).then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  if (!r.ok) { $('.cuenta-fundir').textContent = r.error; e.currentTarget.disabled = false; return; }
  est.info.usuario = r.usuario;
  if (sobre) {
    dialogoFundir.close();
    pintar();
    avisar(r.sobres === 1 ? `Has fundido ${r.cartas} cartas: tienes una tirada más.` : `Has fundido ${r.cartas} cartas: tienes ${r.sobres} tiradas más.`);
    return;
  }
  // Mejorar: se enseña lo que ha salido (y el premio si se ha completado una familia) en el mismo diálogo
  const salidas = [...r.cartas, ...r.premios.map(p => p.carta).filter(Boolean)];
  dialogoFundir.dataset.mejorado = '1';
  $('.nota-fundir').textContent = `Has fundido ${r.fundidas} cartas de tier ${tierFundir}. Te ha salido:`
    + r.premios.map(p => ` ¡Familia ${nombreClan(p.clan)} completa: una tirada más y su jefe!`).join('');
  dialogoFundir.querySelector('.tiers-fundir').hidden = true;
  dialogoFundir.querySelector('.opciones').innerHTML = salidas.map(c => `<div class="opcion-fundir resultado">${cartaHTML(c)}<small>${c.nueva ? '¡Nueva!' : `Repetida ×${c.copias}`}</small></div>`).join('');
  $('.cuenta-fundir').textContent = '';
  dialogoFundir.querySelector('.confirmar').hidden = true;
  dialogoFundir.querySelector('.solas').hidden = true;
  dialogoFundir.querySelector('.cancelar').textContent = 'Cerrar';
};
