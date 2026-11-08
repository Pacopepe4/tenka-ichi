// Fantasy: la alineación (una carta de cada rol y hasta dos BOOST, cada una con uno de tus jugadores) y la clasificación.
// La alineación se pinta sobre «la grieta»: un plano de metro de Tokio de noche (el SVG está en index.html y los estilos,
// en grieta.css). Las tres calles son líneas de metro, el río es un canal y la jungla, los callejones; cada puesto es una
// estación. En el móvil el plano pasa a ser una sola línea vertical con las cinco estaciones, una debajo de otra
import { ROL, escapar } from '/carta.js';
import { $, est, cartaHTML, cartaPorId, misCartas } from './estado.js';

export const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
// El kanji del cartel de cada estación: arriba, bosque (los callejones de la jungla), centro, arco y escudo
const KANJI = { TOP: '上', JUNGLA: '森', MEDIO: '中', ADC: '弓', SUPPORT: '盾' };
// En la BOOST colgada de la estación solo cabe el multiplicador: de «×3 · más participación», el «×3»
const multiplicador = c => (c.bonus?.etiqueta || 'BOOST').split(' · ')[0];
export const puntosTexto = n => `${n.toLocaleString('es-ES')} ${n === 1 ? 'punto' : 'puntos'}`;
export const puntosDe = id => est.fantasia.jugadores.find(j => j.id === id)?.puntos || 0;
export const alineacion = () => est.fantasia.yo?.alineacion || {};
// Las dos BOOST de la alineación: { carta, rol } (el rol del jugador con el que van) o null
export const boostsDe = () => alineacion().boosts || Array(est.fantasia.boostsMaximos).fill(null);

export function pintarFantasy() {
  const info = est.info, fantasia = est.fantasia, yo = fantasia.yo, caja = $('.alineacion');
  const estado = $('.estado-alineacion');
  if (!info.usuario) {
    estado.textContent = 'Entra con Discord y tira de la tragaperras para alinear a tus jugadores.';
  } else if (fantasia.cerrado) {
    estado.innerHTML = `Las alineaciones están <b>cerradas</b> mientras se juega la jornada. Llevas ${puntosTexto(yo.puntos)}${yo.puesto ? `, ${yo.puesto}.º en la clasificación` : ''}.`;
  } else {
    estado.innerHTML = yo.puesto ? `Llevas <b>${puntosTexto(yo.puntos)}</b>${yo.puntosBoost ? ` (${puntosTexto(yo.puntosBoost)} de tus BOOST)` : ''}, ${yo.puesto}.º en la clasificación. Pulsa un hueco para cambiar al jugador.`
      : 'Pulsa un hueco para elegir al jugador de ese rol entre tus cartas.';
  }
  const bloqueado = !info.usuario || fantasia.cerrado;
  const boosts = boostsDe();
  // Con las alineaciones cerradas (o sin sesión) el plano se apaga un poco y los trenes se paran
  caja.closest('.grieta')?.classList.toggle('cerrada', bloqueado);
  // Cada puesto es una estación del plano: el hueco de su carta con los puntos debajo y, si su jugador lleva una BOOST,
  // la BOOST colgada al lado en un ramal. Pulsarla abre el mismo diálogo que su hueco de BOOST de debajo del plano
  caja.innerHTML = ROLES.map(rol => {
    const carta = yo?.alineacion?.[rol] ? cartaPorId(yo.alineacion[rol]) : null;
    const i = carta ? boosts.findIndex(x => x?.rol === rol) : -1, boost = i >= 0 ? cartaPorId(boosts[i].carta) : null;
    return `<div class="estacion${carta ? '' : ' libre'}" data-rol="${rol}">
      <button type="button" class="hueco-ali" data-rol="${rol}" ${bloqueado ? 'disabled' : ''}>
        <span class="rol-ali"><span class="kanji-ali" aria-hidden="true">${KANJI[rol]}</span>${ROL[rol]}</span>
        ${carta ? cartaHTML(carta) : '<span class="vacio-ali">Elegir</span>'}
        <span class="puntos-ali">${carta ? puntosTexto(puntosDe(carta.id)) : 'Estación libre'}</span>
      </button>
      ${boost ? `<button type="button" class="boost-estacion" data-i="${i}" ${bloqueado ? 'disabled' : ''} title="${escapar(boost.bonus?.texto)}"
        aria-label="BOOST ${i + 1}: ${escapar(boost.nombre)} ${escapar(boost.bonus?.etiqueta)}, con ${escapar(carta.nombre)}">
        ${cartaHTML(boost)}<span class="etiqueta-boost">${escapar(multiplicador(boost))}</span></button>` : ''}
    </div>`;
  }).join('');
  caja.querySelectorAll('.hueco-ali:not(:disabled)').forEach(b => b.addEventListener('click', () => elegir(b.dataset.rol)));
  caja.querySelectorAll('.boost-estacion:not(:disabled)').forEach(b => b.addEventListener('click', () => elegirBoost(Number(b.dataset.i))));

  // Los huecos de BOOST, debajo del plano como la leyenda de un mapa de metro: cada una se vincula a uno de los jugadores
  // (data-rol-boost lleva el rol de ese jugador, para pintar el hueco del color de su línea)
  const cajaBoost = $('.alineacion-boost');
  cajaBoost.innerHTML = boosts.map((b, i) => {
    const carta = b ? cartaPorId(b.carta) : null, jugador = carta && yo?.alineacion?.[b.rol] ? cartaPorId(yo.alineacion[b.rol]) : null;
    return `<button type="button" class="hueco-ali hueco-boost" data-i="${i}" ${carta ? `data-rol-boost="${b.rol}"` : ''} ${bloqueado ? 'disabled' : ''}>
      ${carta ? cartaHTML(carta) : '<span class="vacio-ali" aria-hidden="true">+</span>'}
      <span class="texto-boost">
        <span class="rol-ali">BOOST ${i + 1}</span>
        <b class="nombre-boost">${carta ? escapar(carta.nombre) : 'Elegir'}</b>
        ${carta?.bonus?.etiqueta ? `<span class="bonus-boost">${escapar(carta.bonus.etiqueta)}</span>` : ''}
        <span class="puntos-ali">${carta ? `con ${escapar(jugador?.nombre || ROL[b.rol])}` : 'Sin vincular'}</span>
      </span></button>`;
  }).join('');
  cajaBoost.querySelectorAll('.hueco-ali:not(:disabled)').forEach(b => b.addEventListener('click', () => elegirBoost(Number(b.dataset.i))));

  pintarClasificacion();
}

// La clasificación general o la de una jornada. Los tres primeros de cada jornada se llevan sobres
let jornadaVista = '';
function pintarClasificacion() {
  const fantasia = est.fantasia, jornadas = fantasia.jornadas || [];
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
          ? (sobresDe(c.puesto) ? `<small>+${sobresDe(c.puesto)} ${sobresDe(c.puesto) === 1 ? 'tirada' : 'tiradas'}</small>` : '')
          : fantasia.ultimaJornada ? `<small>${c.ultima.toLocaleString('es-ES')} en ${escapar(fantasia.ultimaJornada)}</small>` : ''}</span></li>`).join('')
    : '<li class="vacio">La clasificación empieza con la primera jornada.</li>';
  const [uno, dos, tres] = fantasia.sobresPremio || [];
  $('.premios-fantasy').textContent = uno || dos || tres
    ? `Al terminar cada jornada, sus tres primeros se llevan tiradas: ${uno} el 1.º, ${dos} el 2.º y ${tres} el 3.º.`
      + (jornadaVista ? (premio ? ' Los de esta jornada ya están repartidos.' : ' Los de esta jornada se reparten cuando termine.') : '')
    : '';
}

// Elegir la carta de un hueco entre las que tienes de ese rol
export const dialogoElegir = $('.elegir');
function elegir(rol) {
  const mias = misCartas();
  const opciones = est.info.catalogo.filter(c => c.rol === rol && mias.get(c.id));
  const actual = est.fantasia.yo?.alineacion?.[rol] || null;
  $('#titulo-elegir').textContent = `Elige tu ${ROL[rol]}`;
  $('.elegir .opciones').innerHTML = opciones.length
    ? opciones.map(c => `<button type="button" class="opcion" data-id="${c.id}" aria-pressed="${c.id === actual}">${cartaHTML(c, mias.get(c.id))}</button>`).join('')
    : `<p class="sin-cartas">No tienes ninguna carta de ${ROL[rol]} todavía. Tira de la tragaperras para conseguirla.</p>`;
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
  const mias = misCartas();
  const boosts = boostsDe();
  const enOtra = id => boosts.filter((b, j) => j !== i && b?.carta === id).length;
  const opciones = est.info.catalogo.filter(c => c.tipo === 'boost' && (mias.get(c.id) || 0) > enOtra(c.id));
  $('#titulo-elegir').textContent = `Elige tu BOOST ${i + 1}`;
  $('.elegir .opciones').innerHTML = opciones.length
    ? opciones.map(c => `<button type="button" class="opcion" data-id="${c.id}" aria-pressed="${c.id === boosts[i]?.carta}">${cartaHTML(c, mias.get(c.id))}</button>`).join('')
    : '<p class="sin-cartas">No tienes ninguna carta BOOST para este hueco. Tira de la tragaperras para conseguirla.</p>';
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
  est.fantasia.yo.alineacion = r.alineacion;
  pintarFantasy();
}
