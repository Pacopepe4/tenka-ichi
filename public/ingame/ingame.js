// Overlay de partida (/ingame/): marcador en directo con lo que manda el puente del PC donde se mira
// la partida, temporizadores de los objetivos, lo que lleva cada clan (buffs, alma, inhibidores),
// avisos de objetivos y, cuando lo saca el panel, el marcador línea por línea.
// Los clanes salen del enfrentamiento del panel (lado azul a la izquierda, como en el juego).
import { cargarClanes, conectarDirecto, logo, icono } from '/comun.js';

const $ = s => document.querySelector(s);
const clanes = await cargarClanes();
const DRAGON = { infernal: 'infernal', oceano: 'del océano', montana: 'de montaña', nube: 'de nube', hextech: 'hextech', quimtech: 'quimtech', ancestral: 'ancestral', dragon: '' };
const ALMA = { infernal: 'Infernal', oceano: 'Océano', montana: 'Montaña', nube: 'Nube', hextech: 'Hextech', quimtech: 'Quimtech' };
const COLOR_DRAGON = { infernal: '#E0592A', oceano: '#3A8FD9', montana: '#A07D4F', nube: '#C8DFE4', hextech: '#2BC6C0', quimtech: '#8DBF3F', ancestral: '#C3A3EA', dragon: '#8E8676' };
// Kanji de cada elemento: fuego, mar, montaña, nube, trueno, veneno; el ancestral es el dragón
const KANJI_DRAGON = { infernal: '炎', oceano: '海', montana: '山', nube: '雲', hextech: '雷', quimtech: '毒', ancestral: '龍', dragon: '龍' };
const OBJETIVO = {
  dragon: { nombre: 'Dragón', kanji: '龍' },
  larvas: { nombre: 'Larvas', kanji: '虫' },
  heraldo: { nombre: 'Heraldo', kanji: '使' },
  baron: { nombre: 'Barón', kanji: '蛇' },
};
const DURACION_AVISO = 5000;

let estado = null, partida = null, recibidaEn = 0, primeraPartida = true;
const vistos = new Set();

const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const miles = n => `${(n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
// El reloj avanza solo entre paquetes (uno por segundo); si dejan de llegar, se para a los 3 s
const tiempoAhora = () => (partida ? partida.tiempo + Math.min(3, (Date.now() - recibidaEn) / 1000) * (partida.velocidad || 1) : 0);
const clanDe = lado => clanes.clan(estado?.equipos?.[lado]?.clan || 'NONAME');
const nombreClan = lado => { const c = clanDe(lado); return c.id === 'NONAME' ? (lado === 'azul' ? 'Lado azul' : 'Lado rojo') : c.nombre; };
const enso = () => `<svg class="enso" viewBox="0 0 40 40" aria-hidden="true"><circle class="pista" cx="20" cy="20" r="16"/><circle class="trazo" cx="20" cy="20" r="16" pathLength="100" filter="url(#pincel)"/></svg>`;
const trazar = (el, p) => { el.querySelector('.trazo').style.strokeDashoffset = String(100 - Math.max(0, Math.min(1, p)) * 100); };

// Tinta del sello: oscura sobre los colores claros (nube, hextech, ancestral…), clara sobre los oscuros
function tinta(color) {
  const m = /^#(..)(..)(..)$/.exec(color);
  if (!m) return 'var(--washi)';
  const [r, g, b] = m.slice(1).map(h => { const c = parseInt(h, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? 'var(--sumi)' : 'var(--washi)';
}

// Pinta una lista de elementos con clave: reutiliza los que siguen, quita los que sobran y respeta el orden
function lista(caja, items, crear, actualizar) {
  const claves = new Set(items.map(i => i.clave));
  for (const el of [...caja.children]) if (!claves.has(el.dataset.clave)) el.remove();
  items.forEach((item, orden) => {
    let el = caja.querySelector(`[data-clave="${item.clave}"]`);
    if (!el) { el = crear(item); el.dataset.clave = item.clave; caja.append(el); }
    el.style.order = orden;
    actualizar(el, item);
  });
}

// ---------- marcador ----------
function pintarEquipos() {
  for (const lado of ['azul', 'rojo']) {
    const c = clanDe(lado);
    const s = $(`.marcador .lado.${lado}`);
    s.style.setProperty('--color-clan', c.texto);
    s.querySelector('.logo').src = logo(c.id);
    s.querySelector('.nombre').textContent = nombreClan(lado);
    s.querySelector('.kanji').textContent = c.kanji || '';
    const cab = $(`.lineas-cabeza .equipo.${lado}`);
    cab.querySelector('.logo').src = logo(c.id);
    cab.querySelector('.nombre').textContent = nombreClan(lado);
  }
}

function pintarPartida() {
  const p = partida;
  document.body.classList.toggle('oculto', !(p?.activo && estado?.partidaVisible !== false));
  if (!p) return;
  for (const lado of ['azul', 'rojo']) {
    const e = p[lado];
    const s = $(`.marcador .lado.${lado}`);
    s.querySelector('.kills').textContent = e.kills;
    s.querySelector('.oro b').textContent = miles(e.oro);
    s.querySelector('.torres b').textContent = e.torres;
    s.querySelector('.larvas b').textContent = e.larvas;
    s.querySelector('.larvas').classList.toggle('cero', !e.larvas);
    const dr = s.querySelector('.dragones');
    const firma = `${e.dragones.join(',')}|${e.ancestrales}|${e.alma || ''}`;
    if (dr.dataset.firma !== firma) {
      dr.dataset.firma = firma;
      dr.classList.toggle('alma', Boolean(e.alma));
      const tipos = [...e.dragones, ...Array(e.ancestrales).fill('ancestral')];
      dr.innerHTML = (lado === 'rojo' ? tipos.reverse() : tipos).map(t => `<i class="d-${t}" title="Dragón ${DRAGON[t]}"></i>`).join('');
    }
  }
  const dif = p.azul.oro - p.rojo.oro;
  const igual = Math.abs(dif) < 100;
  const d = $('.diferencia');
  d.className = `diferencia${igual ? '' : dif > 0 ? ' azul' : ' rojo'}`;
  d.querySelector('.flecha').textContent = igual ? '' : dif > 0 ? '◀' : '▶';
  d.querySelector('b').textContent = igual ? 'Oro igualado' : `+${miles(Math.abs(dif))}`;

  // Avisos de objetivos: los que ya estaban al abrir el overlay no se repiten
  for (const a of p.avisos || []) {
    if (vistos.has(a.id)) continue;
    vistos.add(a.id);
    if (!primeraPartida) colaAvisos.push(a);
  }
  primeraPartida = false;
  siguienteAviso();
  pintarLineas();
}

// ---------- temporizadores de los objetivos neutrales ----------
function pintarTemporizadores() {
  const t = tiempoAhora();
  lista($('.temporizadores'), (partida.objetivos || []).map(o => ({ ...o, clave: o.tipo })), o => {
    const el = document.createElement('div');
    el.className = `temporizador ${o.tipo}`;
    el.innerHTML = `<span class="sello">${enso()}<span class="kanji">${OBJETIVO[o.tipo]?.kanji || '天'}</span></span><span class="texto"><small></small><b></b></span>`;
    return el;
  }, (el, o) => {
    const vivo = t >= o.aparece;
    el.classList.toggle('vivo', vivo);
    el.style.setProperty('--color', o.tipo === 'dragon' && o.ancestral ? COLOR_DRAGON.ancestral : '');
    el.querySelector('small').textContent = o.tipo === 'dragon' && o.ancestral ? 'Ancestral'
      : o.tipo === 'larvas' && vivo && o.quedan < 3 ? `Larvas · ${o.quedan}` : OBJETIVO[o.tipo]?.nombre || o.tipo;
    el.querySelector('b').textContent = vivo ? 'vivo' : mmss(o.aparece - t);
    trazar(el, vivo ? 1 : (t - o.desde) / Math.max(1, o.aparece - o.desde));
  });
}

// ---------- lo de cada clan: buffs, alma o punto de alma e inhibidores caídos ----------
function pintarModulos() {
  const t = tiempoAhora();
  for (const lado of ['azul', 'rojo']) {
    const items = [];
    for (const b of partida.buffs || []) {
      if (b.lado !== lado || b.hasta <= t) continue;
      const baron = b.tipo === 'baron';
      items.push({ clave: `${b.tipo}-${b.desde}`, clase: `buff ${b.tipo}`, kanji: baron ? '蛇' : '龍', color: baron ? '#9B59D0' : COLOR_DRAGON.ancestral,
        etiqueta: baron ? 'Buff de Barón' : 'Buff ancestral', valor: mmss(b.hasta - t), p: (b.hasta - t) / Math.max(1, b.hasta - b.desde) });
    }
    const e = partida[lado];
    if (e.alma) items.push({ clave: `alma-${e.alma}`, clase: 'alma', lleno: true, kanji: KANJI_DRAGON[e.alma], color: COLOR_DRAGON[e.alma], etiqueta: 'Alma', valor: ALMA[e.alma] || '' });
    else if (e.puntoDeAlma) items.push({ clave: 'punto', clase: 'punto', kanji: '龍', color: 'var(--shu-claro)', etiqueta: `${e.dragones.length} dragones`, valor: 'Punto de alma', p: 1 });
    for (const i of partida.inhibidores || []) {
      if (i.lado !== lado || i.vuelve <= t) continue;
      items.push({ clave: `inhib-${i.carril}-${i.desde}`, clase: 'inhibidor', kanji: '破', color: 'var(--hai)', etiqueta: `Inhibidor ${i.carril}`,
        valor: mmss(i.vuelve - t), p: (i.vuelve - t) / Math.max(1, i.vuelve - (i.desde ?? i.vuelve - 300)) });
    }
    lista($(`.modulos.${lado}`), items, m => {
      const el = document.createElement('div');
      el.className = `modulo ${m.clase}`;
      el.style.setProperty('--color', m.color);
      if (m.lleno) el.style.setProperty('--tinta', tinta(m.color));
      el.innerHTML = `<span class="sello${m.lleno ? ' lleno' : ''}">${m.lleno ? '' : enso()}<span class="kanji">${m.kanji}</span></span><span class="texto"><small></small><b></b></span>`;
      return el;
    }, (el, m) => {
      el.querySelector('small').textContent = m.etiqueta;
      el.querySelector('b').textContent = m.valor;
      if (m.p != null) trazar(el, m.p);
    });
  }
}

// ---------- avisos de objetivos ----------
const colaAvisos = [];
let avisoEnCurso = false;
const dragonDe = t => `dragón ${DRAGON[t] || ''}`.trim();
const TEXTO_AVISO = {
  dragon: a => [`${a.robado ? 'roba' : 'se lleva'} el ${dragonDe(a.dragon)}`, KANJI_DRAGON[a.dragon] || '龍', COLOR_DRAGON[a.dragon] || COLOR_DRAGON.dragon],
  baron: a => [a.robado ? 'roba el Barón Nashor' : 'mata al Barón Nashor', '蛇', '#9B59D0'],
  heraldo: a => [a.robado ? 'roba el Heraldo' : 'se lleva el Heraldo', '使', '#8F7AE8'],
  atakhan: () => ['derrota a Atakhan', '魔', '#BE2A2F'],
  inhibidor: a => [`rompe el inhibidor ${a.carril || ''}`.trim(), '破', 'var(--shu)'],
};
function siguienteAviso() {
  if (avisoEnCurso || !colaAvisos.length) return;
  const a = colaAvisos.shift();
  const [frase, kanji, color] = (TEXTO_AVISO[a.tipo] || (() => ['', '天', 'var(--shu)']))(a);
  const caja = $('.aviso');
  const hanko = caja.querySelector('.hanko');
  caja.style.setProperty('--aviso', color);
  hanko.textContent = kanji;
  hanko.style.background = color;
  hanko.style.color = tinta(color);
  caja.querySelector('.aviso-quien').textContent = nombreClan(a.lado);
  caja.querySelector('.aviso-que').textContent = frase;
  caja.classList.remove('sale');
  caja.hidden = false;
  avisoEnCurso = true;
  setTimeout(() => {
    caja.classList.add('sale');
    setTimeout(() => { caja.hidden = true; avisoEnCurso = false; siguienteAviso(); }, 400);
  }, DURACION_AVISO);
}

// ---------- línea por línea (lo saca el panel) ----------
// Cada fila es un puesto (top, jungla, medio, ADC y apoyo, en ese orden): retrato, nombre, KDA y súbditos,
// objetos y oro de cada jugador, con la diferencia de oro en medio
const filas = $('.lineas .filas');
filas.innerHTML = [0, 1, 2, 3, 4].map(i => `<div class="fila" data-i="${i}">
  ${['azul', 'rojo'].map(lado => {
    const retrato = '<span class="retrato"><img alt=""><i class="nivel"></i><i class="muerte"></i></span>';
    const quien = '<span class="quien"><b class="nombre"></b><small class="kda"></small></span>';
    const objetos = `<span class="objetos">${[0, 1, 2, 3, 4, 5, 6].map(h => `<i class="hueco${h === 6 ? ' abalorio' : ''}"><img alt="" hidden></i>`).join('')}</span>`;
    const oro = '<span class="oro"></span>';
    const partes = lado === 'azul' ? [retrato, quien, objetos, oro] : [oro, objetos, quien, retrato];
    return `<div class="jugador ${lado}">${partes.join('')}</div>`;
  }).join('<div class="medio"><div class="barra"><i class="relleno"></i></div><span class="dif"></span></div>')}
</div>`).join('');
// Un objeto sin icono (nuevo en un parche) deja el hueco vacío en lugar de una imagen rota
filas.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.closest('.hueco')) e.target.hidden = true; }, true);

let lineasVisibles = false, temporizadorLineas = null;
function pintarLineas() {
  const caja = $('.lineas');
  const mostrar = estado?.grafico?.tipo === 'lineas' && Boolean(partida?.activo) && (partida.lineas || []).length === 5;
  if (mostrar !== lineasVisibles) {
    lineasVisibles = mostrar;
    clearTimeout(temporizadorLineas);
    if (mostrar) { caja.classList.remove('sale'); caja.hidden = false; }
    else { caja.classList.add('sale'); temporizadorLineas = setTimeout(() => { caja.hidden = true; }, 450); }
  }
  if (!mostrar) return;
  const difs = partida.lineas.map(l => (l.azul?.oro || 0) - (l.rojo?.oro || 0));
  const escala = Math.max(1500, ...difs.map(Math.abs));
  partida.lineas.forEach((l, i) => {
    const fila = filas.children[i];
    for (const lado of ['azul', 'rojo']) {
      const j = l[lado];
      const caja = fila.querySelector(`.jugador.${lado}`);
      caja.style.visibility = j ? '' : 'hidden';
      if (!j) continue;
      const img = caja.querySelector('.retrato img');
      const src = icono(j.campeon);
      if (img.getAttribute('src') !== src) img.src = src;
      caja.querySelector('.nivel').textContent = j.nivel;
      const retrato = caja.querySelector('.retrato');
      retrato.classList.toggle('muerto', j.muerto);
      // En racha (3 asesinatos o más sin morir) el recuadro se ilumina; a partir de 5, más
      retrato.classList.toggle('racha', !j.muerto && j.racha >= 3);
      retrato.classList.toggle('racha-alta', !j.muerto && j.racha >= 5);
      caja.querySelector('.muerte').textContent = j.muerto && j.reaparece ? j.reaparece : '';
      caja.querySelectorAll('.hueco').forEach((hueco, h) => {
        const id = j.objetos?.[h];
        const imagen = hueco.querySelector('img');
        const ruta = id ? `/ddragon/objeto/${id}.png` : null;
        if (imagen.getAttribute('src') !== ruta) {
          if (ruta) { imagen.hidden = false; imagen.src = ruta; } else { imagen.hidden = true; imagen.removeAttribute('src'); }
        }
      });
      // El nombre del panel para ese puesto, si lo hay; si no, el del cliente
      caja.querySelector('.nombre').textContent = estado?.equipos?.[lado]?.jugadores?.[i] || j.nombre;
      caja.querySelector('.kda').textContent = `${j.k} / ${j.d} / ${j.a} · ${j.cs} CS`;
      caja.querySelector('.oro').textContent = miles(j.oro);
    }
    const dif = difs[i];
    const cs = (l.azul?.cs || 0) - (l.rojo?.cs || 0);
    const lado = Math.abs(dif) < 100 ? '' : dif > 0 ? 'azul' : 'rojo';
    const relleno = fila.querySelector('.relleno');
    const ancho = lado ? Math.abs(dif) / escala * 50 : 0;
    relleno.style.width = `${ancho}%`;
    relleno.style.left = lado === 'azul' ? `${50 - ancho}%` : '50%';
    relleno.style.background = lado === 'azul' ? 'var(--azul-lado)' : 'var(--rojo-lado)';
    // Oro y súbditos, cada uno del color de quien va por delante
    const ladoCs = cs > 0 ? 'azul' : cs < 0 ? 'rojo' : '';
    fila.querySelector('.dif').innerHTML = `<b class="${lado}">${lado ? `+${miles(Math.abs(dif))}` : 'Igual'}</b>`
      + (ladoCs ? ` · <b class="${ladoCs}">+${Math.abs(cs)} CS</b>` : '');
  });
}

conectarDirecto({
  alEstado: e => { estado = e; pintarEquipos(); pintarPartida(); },
  alPartida: p => { partida = p; recibidaEn = Date.now(); pintarPartida(); pintarTemporizadores(); pintarModulos(); },
});

setInterval(() => {
  if (!partida) return;
  $('.reloj').textContent = mmss(tiempoAhora());
  pintarTemporizadores();
  pintarModulos();
}, 250);
